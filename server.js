var request = require('request');
var cheerio = require('cheerio');
var async = require('async');

var maxPageSearch = 2;

function getPrices(searchQuery) {
  console.log('Searching for completed eBay listings for... "' + searchQuery + '"');
  var allSellPrices = [];

  var finishedSearching = function() {

      console.log(JSON.stringify(allSellPrices));

  }

  var getPricesForPageX = function(num) {

    request('http://www.ebay.com/sch/i.html?_from=R40&_sacat=0&LH_Complete=1&LH_Sold=1&_nkw=' + searchQuery + '&_pgn=' + num + '&_skc=100&rt=nc', function (error, response, html) {
      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(html);
        var foundItems = 0;
        $('span.bidsold').each(function(i, element){
          var a = $(this);
          var theVal = parseFloat(a.text().trim().substring(1));
          allSellPrices.push(theVal);
          console.log(theVal + ' on page ' + num);
          foundItems++;
        });

        if (foundItems && num < maxPageSearch) {
          // RECURSIVE!!!
          getPricesForPageX(num+1);
        } else {
          console.log('finished on page ' + num);
          finishedSearching();
        }
      }
    });

  }

  getPricesForPageX(1);

}

getPrices('sugar');
