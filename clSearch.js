// http://sfbay.craigslist.org/sby/eld/5629086342.html


var request = require('request');
var cheerio = require('cheerio');
var throttledRequest = require('./throttledRequest');
var async = require('async');
var mongoose = require('mongoose');
var ebaySearch = require('./ebaySearch');

var db = mongoose.connect('mongodb://localhost/clListings');

var Listing = require('./models/listing');
//
// var newlisting = new Listing({
//   clId: 3432,
//   make: "hotdogs for cash",
//   ebaySellPrice: 23.50
// });
//
// newlisting.save(function(err) {
//   if (err) throw err;
// });


var displayListing = function(listing) {

  var displayParam = function(p) {
    try {
      if (listing[p]) {
        console.log(listing[p]);
      }
    } catch(e) {
      console.log('nice try');
      throw e;
    }
  };
  ['title', 'url', 'make', 'model', 'ratio', 'dealQuality'].forEach(displayParam);

  // console.log(JSON.stringify(listing, null, ' '));
  var logText = 'selling on cl for ' + listing.price;
  if (listing.ebaySellPrice && listing.ebaySellPrice.avg) {
    logText += ' and on ebay for ' + listing.ebaySellPrice.avg;

    var ratio = Math.round(listing.ebaySellPrice.avg / listing.price * 100) / 100;
    logText += '\nratio: ' + ratio + ' ... potential profit: $' + (listing.ebaySellPrice.avg - listing.price);
    if (ratio > 1.5) {
      logText += '\n*** HOT HOT HOT ***'
    }
  }
  console.log(logText);

  console.log();

};



var clListings;
var thoseWithMakeOrModel = [];
var theBestDeals = [];

async.series([
  // function(callback) {
  //
  //   async.forEachSeries(['http://sfbay.craigslist.org/sby/eld/5629086342.html', 'http://sfbay.craigslist.org/eby/ele/5629172209.html'], function(url, cb) {
  //
  //     getListingDetails(url, function(data) {
  //         console.log(data);
  //         cb();
  //     });
  //
  //   }, callback);
  //
  // },
  function(callback) {

    (function displayBestDealsInSection(sec) {

      Listing.aggregate(
          { $match: { "url": { "$regex": sec, "$options": "i" }  } }, // your find query
          { $project: {
              clId: 1,
              price: 1,
              ebaySellPrice: 1,
              // actualEbay: { $cond: [ { $eq: ["$ebaySellPrice.avg", 0] }, 1, "$ebaySellPrice.avg"] }
              ratio: { $divide: ['$ebaySellPrice.avg', '$price'] } // calculated field
          } },
          { $sort: { ratio: -1 } },
          { $limit: 80 },

          // And then the normal Mongoose stuff:
          function (err, res) {
            // console.log(res)
            // console.log(err);

            async.forEachSeries(res, function(partialListing, cb) {
              Listing.findById(partialListing._id, function(err, res) {
                displayListing(res);
                // console.log('res',res);
                cb();
              });
            }, callback);

          }
      );
    })("cto")

  },
  function(callback) {

    console.log('looking for new listings that we havent found in the past...')
    // get the urls of all the listings for this search...
    importantFns.getAllClUrlsForSearch({
      //query: 'honda',
      section: 'cta',
      // sortBy: 'priceasc',
      numPages: 1,
      min_price: 1300,
      max_price: 1306,
    }, function(clResults) {
      clListings = clResults;
      callback();
    });

  },
  function(callback) {

    Listing.find({
      searchedForMakeModel: false
    }, function(err, res) {
      clListings = res;

      // get all listings that have not been searched on ebay
      if (clListings) {

        console.log();
        console.log('found ' + clListings.length + ' listings that need to be searched for make / model...');
        // take those url's and then get the make. model and price of all those listings
        var listingCount = 0;
        async.forEachSeries(clListings, function(listing, cb) {

          listingCount++;
          console.log('checking out listing ' + listingCount + ' of ' + clListings.length + ': ' + listing.title);
          importantFns.getListingDetails(listing.url, function(data) {

              var allTheGoodStuff = Object.assign(listing, data);

              if (allTheGoodStuff.make.length > 1 || allTheGoodStuff.model.length > 1) {
                thoseWithMakeOrModel.push(allTheGoodStuff);
              }

              // console.log(allTheGoodStuff);
              // console.log();
              cb();
          });
        }, callback);
      } else {
        console.log('no new listings found since last search');
        callback();
      }

    });

  },
  function(callback) {

    // find all listings where the make and model are set and the ebay price has not been calculated
    Listing.find({
      "ebaySellPrice.avg": {
        "$exists": false
      },
      $or: [
        {
          make: { "$exists": true },
          $where: "this.make.length > 1"
        },
        {
          model: { "$exists": true },
          $where: "this.model.length > 1"
        }
      ]
    }, function(err, res) {

      thoseWithMakeOrModel = res;

      if (thoseWithMakeOrModel) {
        console.log('...');
        console.log('there are ' + thoseWithMakeOrModel.length + ' that need to be searched on ebay');

        var makeCount = 0;

        async.forEachSeries(thoseWithMakeOrModel, function(listing, cb) {
          var searchQuery = (listing.make + ' ' + listing.model).trim();
          if (searchQuery.indexOf('condition') !== -1) {
            searchQuery = listing.name;
          }
          ebaySearch.getPrices(searchQuery, listing.price, function(ebayResults) {

            makeCount++;

            var avg = (ebayResults) ? Math.round(ebayResults.avg * 100) / 100 : 0;
            console.log(makeCount + ' / ' + thoseWithMakeOrModel.length);
            console.log(searchQuery);
            console.log('ebay: ' + avg);
            console.log('selling on cl at ' + listing.price);
            console.log('');
            var ebayObj = {
              ebaySellPrice: {
                avg: avg,
                priceList: (ebayResults) ? ebayResults.priceList : []
              }
            };
            Listing.update({
              clId: listing.clId
            }, ebayObj, function(err) {
              if (err) throw err;
              cb();
            });

            var perc = avg / listing.price;

            if ( perc >  1.1 ) {
              theBestDeals.push(Object.assign(listing, ebayObj));
            }
          });

        }, callback);

      } else {
        console.log('there are no listings that need to be searched on ebay');
        callback();
      }

    });


  },
  function(callback) {

    // display the best deals
    console.log('');
    console.log('THE BEST DEALS...');
    console.log('craigslist low, ebay high\n');

    var getDealQuality = function(deal) {
      var returnVal = 0;
      returnVal += 10 * Math.round(deal.ratio);
      if (deal.ebaySellPrice.avg - deal.price) {
        returnVal += 100;
      }
      return returnVal;
    };

    theBestDeals.map(function(deal) {
      var ratio = deal.ebaySellPrice.avg / deal.price;
      var deal = Object.assign(deal, ratio);
      return Object.assign(deal, {
        dealQuality: getDealQuality(deal)
      });
    }).sort(function(a, b) {
      return parseFloat(b.ratio) > parseFloat(a.ratio);
    }).forEach(displayListing);

    callback();

  }
], function() {


  // thats all folks display the interesting ones


  console.log('finished running');
  process.exit();
});
