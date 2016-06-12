// http://sfbay.craigslist.org/sby/eld/5629086342.html


var request = require('request');
var cheerio = require('cheerio');
var throttledRequest = require('./throttledRequest.js');
var async = require('async');
var mongoose = require('mongoose');
var ebaySearch = require('./ebaySearch.js');

var db = mongoose.connect('mongodb://localhost/clListings');

var listingSchema = new mongoose.Schema({
  clId: {
    type: Number,
    set: function (v) {
      return Math.round(v);
    }
  },
  url: String,
  price: Number,
  title: String,
  make: String,
  model: String,
  searchedForMakeModel: {
    type: Boolean,
    default: false
  },
  ebaySellPrice: {
    avg: Number,
    priceList: [Number]
  }
});

var Listing = db.model('listing', listingSchema);
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


var saveAll = function( array, cb) {
  //
  // console.log('saving');
  // console.log(array);
  Listing.insertMany(array, cb);

  //
  // async.forEachSeries(array, function(obj, callback) {
  //   var newListing = new Listing(obj);
  //   newlisting.save(function(err, hm) {
  //     if (err) cb(err);
  //     console.log(hm);
  //     callback();
  //   });
  // }, cb);

};

// http://sfbay.craigslist.org/search/sss?sort=date
var getAllClUrlsForSearch = function(params, callback) {
  if (!params.section) params.section = 'sss';
  if (!params.sortBy) params.sortBy = 'date';
  if (!params.numPages) params.numPages = 5;


  var responseData = [];

  var getPage = function(x) {

    // console.log('checking out page ' + x);

    var requestUrl = 'http://sfbay.craigslist.org/search/' + params.section + '?s=' + (x-1)*100 + '&sort=' + params.sortBy;
    if (params.min_price) requestUrl += '&min_price=' + params.min_price;
    if (params.max_price) requestUrl += '&max_price=' + params.max_price;

    console.log('searching ' + requestUrl);
    throttledRequest(requestUrl, function (error, response, html) {

      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(html);
        var allListings = [];

        $('.hdrlnk').each(function(i, el) {
          var $el = $(this);
          var urlPath = $el.attr('href');

          if (urlPath.substring(1, 2) === '/') {
            // if from out of this area stop looking for more
            return false;
          }

          var obj = {
            title: $(this).children('span').text(),
            url: 'http://sfbay.craigslist.org' + urlPath,
            clId: Number($(this).data('id'))
          };

          allListings.push(obj);

        });

        async.forEachSeries(allListings, function(curListing, cb) {

          // console.log('looking for ' + JSON.stringify(curListing.clId));
          Listing.find({
            clId: curListing.clId
          }, function(err, obj) {
            if (err) throw err;
            if (obj.length && obj[0].searchedForMakeModel) {
              // listing already in mongo stop early
              //console.log('skipping something because we already found ', curListing);
              cb();
            } else {
              // listing has not been found yet
              // console.log('nah');
              responseData.push(curListing);
              cb();
            }
          });

        }, function() {

          if (responseData.length) {
            //
            // console.log('here', JSON.stringify(responseData));
            // save all new cl listings to mongo
            saveAll(responseData, function(err) {
              //
              // console.log('there');

              if (err) throw err;

              if (x === params.numPages) {
                // finished
                callback(responseData);
              } else {
                // move to next page
                getPage(x + 1);
              }

            });

          } else {
            callback(null);
          }

        });

      }
    });

  };

  getPage(1);

}





var getModelFromPage = function(url, cb) {
  console.log('getting model from page');
  throttledRequest(url, function (error, response, html) {
    if (!error && response.statusCode == 200) {
      var $ = cheerio.load(html);
      var model = $('span:contains("model name / number: ") b').text();
      var make = $('span:contains("make / manufacturer: ") b').text() || $('.attrgroup').eq(0).find('span').text();
      var price = $('.price').text();
      var obj = {
        model: model,
        make: make,
        price: price
      };
      // console.log(obj);
      cb(obj);
    }
  });
}





var clListings;
var thoseWithMakeOrModel = [];
var theBestDeals = [];

async.series([
  // function(callback) {
  //
  //   async.forEachSeries(['http://sfbay.craigslist.org/sby/eld/5629086342.html', 'http://sfbay.craigslist.org/eby/ele/5629172209.html'], function(url, cb) {
  //
  //     getModelFromPage(url, function(data) {
  //         console.log(data);
  //         cb();
  //     });
  //
  //   }, callback);
  //
  // },
  function(callback) {
    Listing.aggregate(
        { $match: {} }, // your find query
        { $project: {
            clId: 1,
            price: 1,
            ebaySellPrice: 1,
            // actualEbay: { $cond: [ { $eq: ["$ebaySellPrice.avg", 0] }, 1, "$ebaySellPrice.avg"] }
            ratio: { $divide: ['$ebaySellPrice.avg', '$price'] } // calculated field
        } },
        { $sort: { ratio: -1 } },
        { $limit: 10 },

        // And then the normal Mongoose stuff:
        function (err, res) {
          //console.log(res)
          //console.log(err);

          var displayListing = function(listing) {
            console.log('listing', listing);
            console.log(listing.name);
            console.log('')
          };

          async.forEachSeries(res, function(partialListing, cb) {
            Listing.findById(partialListing._id, function(err, res) {
              displayListing(res);
              //console.log('res',res);
              cb();
            });
          }, callback);

        }
    );
  },
  function(callback) {

    console.log('looking for new listings that we havent found in the past...')
    // get the urls of all the listings for this search...
    getAllClUrlsForSearch({
      section: 'moa',
      // sortBy: 'priceasc',
      numPages: 1,
      min_price: 600,
      max_price: 1000,
    }, function(clResults) {
      clListings = clResults;
      callback();
    });

  },
  function(callback) {
    if (clListings) {

      console.log();
      console.log('found ' + clListings.length + ' new listings...');
      // take those url's and then get the make. model and price of all those listings
      var listingCount = 0;
      async.forEachSeries(clListings, function(listing, cb) {
        getModelFromPage(listing.url, function(data) {
            listingCount++;
            console.log('checking out listing ' + listingCount + ' of ' + clListings.length);
            data.price = data.price.substring(1); // remove $ sign
            data.searchedForMakeModel = true;

            var allTheGoodStuff = Object.assign(listing, data);

            if (allTheGoodStuff.make.length > 1 || allTheGoodStuff.model.length > 1) {
              thoseWithMakeOrModel.push(allTheGoodStuff);
            }

            console.log(allTheGoodStuff);
            console.log();

            Listing.update({
              clId: listing.clId
            }, data, function(err) {
              if (err) throw err;
              cb();
            })

        });
      }, callback);
    } else {
      console.log('no new listings found since last search');
      callback();
    }
  },
  function(callback) {

    if (thoseWithMakeOrModel) {
      console.log('...');
      console.log('these were the ones with make / model...' + thoseWithMakeOrModel.length + ' total');

      console.log(thoseWithMakeOrModel);

      var makeCount = 0;

      async.forEachSeries(thoseWithMakeOrModel, function(listing, cb) {
        var searchQuery = listing.make + ' ' + listing.model;
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
      callback();
    }

  },
  function(callback) {

    // display the best deals
    console.log('');
    console.log('THE BEST DEALS...');
    console.log('craigslist low, ebay high\n');

    theBestDeals.sort(function(a, b) {
      return a.ebaySellPrice.avg / a.price > b.ebaySellPrice.avg / b.price;
    });

    console.log(JSON.stringify(theBestDeals, null, 3));


    callback();

  }
], function() {


  // thats all folks display the interesting ones


  console.log('finished running');
  process.exit();
});
