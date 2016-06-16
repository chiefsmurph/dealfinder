var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var dataFilters = require('./dataFilters.js');
var throttledRequest = require('./throttledRequest');

var maxPageSearch = 3;

function getPrices(searchQuery, sellPrice, cb, logFn, sec) {

  logFn = logFn || function(s) {
    console.logFn(s);
  };

  if (searchQuery.indexOf('undefined') !== -1) {
    logFn('overload ... undefined')
    if (cb) cb(null);
    return;
  }

  logFn('Searching for completed eBay listings for... "' + searchQuery + '" with expected sell price of ' + sellPrice);
  var allSellPrices = [];
  var minSellPrice = sellPrice*.5;

  var finishedSearching = function() {

    //var outlierFree = dataFilters.removeOutsideSD(removeExtremes(allSellPrices));
    var outlierFree = allSellPrices;
    // logFn('removed ' + (allSellPrices.length - outlierFree.length) + ' from the sell prices');

    // logFn();
    if (outlierFree.length) {
      var sum = outlierFree.reduce(function(a, b) { return a + b; });
      var avg = Math.round(sum / outlierFree.length * 100) / 100;
      //logFn(JSON.stringify(outlierFree));
      logFn('Average Sell Price: $' + avg);
      if (cb) cb({
        avg: avg,
        priceList: outlierFree
      });
    } else {
      logFn('--- No sells found.')
      if (cb) cb(null);
    }


  }

  var getPricesForPageX = function(num) {
    var insertSec = (sec === "cta") ? 'Cars-Trucks/6001/' : '';

    var requestURL = 'http://www.ebay.com/sch/' +insertSec+ 'i.html?_from=R40&_sacat=0&LH_Complete=1&LH_Sold=1&_nkw=' + encodeURIComponent(searchQuery) + '&_udlo=' + minSellPrice + '&_pgn=' + num + '&_skc=100&rt=nc';
    logFn(requestURL);

    throttledRequest(requestURL, function (error, response, html) {
      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(html);
        var foundItems = 0;
        var forceEnd = false;

        var addSpanToAllPrices = function($el) {
          var theVal = parseFloat($el.text().trim().substring(1).replace(/,/g, ''));
          if (!isNaN(theVal)) {
            allSellPrices.push(theVal);
          }
        };

        if ($( ".lvresult:not(.sresult)" ).length) {
          // not enough results starting to display unrelated stuff
          var foundOnPage = [];
          $( ".lvresult:not(.sresult)" ).prevAll().each(function() {
            addSpanToAllPrices($(this).find('span.bidsold'));
            foundItems++;
          });
          forceEnd = true;
        } else {
          // they are right there get them
          $('span.bidsold').each(function(i, element){
            addSpanToAllPrices($(this));
            foundItems++;
          });
        }


        // logFn('found ' + foundItems + ' sold on page ' + num);

        if (foundItems && num < maxPageSearch && !forceEnd) {
          // RECURSIVE!!!
          getPricesForPageX(num+1);
        } else {
          // logFn('finished on page ' + num);
          finishedSearching();
        }
      } else {
        // if err force end
        finishedSearching();
      }
    });

  }

  getPricesForPageX(1);

}

var sellPrice = 0;
var args = process.argv.slice(2);
// logFn(JSON.stringify(args));
var lastArg = args.splice(-1, 1)[0];
// logFn(lastArg);
//
// getPrices(args.join(' '), lastArg);

module.exports = {
  getPrices: getPrices
};
