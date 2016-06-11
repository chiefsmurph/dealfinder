var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var dataFilters = require('./dataFilters.js');

var maxPageSearch = 3;

function getPrices(searchQuery, sellPrice, cb) {
  console.log('Searching for completed eBay listings for... "' + searchQuery + '" with expected sell price of ' + sellPrice);
  var allSellPrices = [];
  var minSellPrice = sellPrice*.5;

  var finishedSearching = function() {

    //var outlierFree = dataFilters.removeOutsideSD(removeExtremes(allSellPrices));
    var outlierFree = allSellPrices;
    // console.log('removed ' + (allSellPrices.length - outlierFree.length) + ' from the sell prices');

    console.log();
    if (outlierFree.length) {
      var sum = outlierFree.reduce(function(a, b) { return a + b; });
      var avg = sum / outlierFree.length;
      // console.log(JSON.stringify(outlierFree));
      // console.log('Average Sell Price: $' + avg);
    } else {
      console.log('No sells found.')
    }
    if (cb) cb(avg || null);

  }

  var getPricesForPageX = function(num) {
    var requestURL = 'http://www.ebay.com/sch/i.html?_from=R40&_sacat=0&LH_Complete=1&LH_Sold=1&_nkw=' + searchQuery + '&_udlo=' + minSellPrice + '&_pgn=' + num + '&_skc=100&rt=nc';
    // console.log(requestURL);

    request(requestURL, function (error, response, html) {
      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(html);
        var foundItems = 0;
        $('span.bidsold').each(function(i, element){
          var $el = $(this);
          var theVal = parseFloat($el.text().trim().substring(1).replace(/,/g, ''));
          allSellPrices.push(theVal);
          //console.log(theVal + ' on page ' + num);
          foundItems++;
        });

        // console.log('found ' + foundItems + ' sold on page ' + num);

        if (foundItems && num < maxPageSearch) {
          // RECURSIVE!!!
          getPricesForPageX(num+1);
        } else {
          // console.log('finished on page ' + num);
          finishedSearching();
        }
      }
    });

  }

  getPricesForPageX(1);

}

var sellPrice = 0;
var args = process.argv.slice(2);
console.log(JSON.stringify(args));
var lastArg = args.splice(-1, 1)[0];
console.log(lastArg);

getPrices(args.join(' '), lastArg);

module.exports = {
  getPrices: getPrices
};
