var async = require('async');
var Listing = require('./models/listing');
var throttledRequest = require('./throttledRequest');
var cheerio = require('cheerio');
var ebaySearch = require('./ebaySearch');

var saveAll = function( array, cb) {
  Listing.insertMany(array, cb);
};

function getBestDealsInSection(sec, callback) {
  Listing.aggregate(
      { $match: {
        "sec": sec
      }}, // your find query
      { $project: {
          clId: 1,
          price: 1,
          ebaySellPrice: 1,
          ratio: { $divide: ['$ebaySellPrice.avg', '$price'] } // calculated field
      } },
      { $sort: { ratio: -1 } },
      { $limit: 80 },

      // And then the normal Mongoose stuff:
      function (err, res) {
        // logFn(res)
        // logFn(err);


        //
        async.mapSeries(res, function(partialListing, cb) {
          Listing.findById(partialListing._id, function(err, res) {
            cb(null, Object.assign(res.toObject(), {
                ratio: res.ebaySellPrice.avg / res.price
            }));
          });
        }, function(err, results) {
          // logFn(results)
          callback(results);
        });

      }
  );
}


// http://sfbay.craigslist.org/search/sss?sort=date
function getAllClUrlsForSearch (params, callback, logFn) {

  logFn = logFn || function(s) {
    console.logFn(s);
  };

  if (!params.section) params.section = 'sss';
  if (!params.sortBy) params.sortBy = 'date';
  if (!params.numPages) params.numPages = 5;

  var responseData = [];

  var getPage = function(x) {

    // logFn('checking out page ' + x);

    var requestUrl = 'http://sfbay.craigslist.org/search/' + params.section + '?s=' + (x-1)*100 + '&sort=' + params.sortBy;
    if (params.min_price) requestUrl += '&min_price=' + params.min_price;
    if (params.max_price) requestUrl += '&max_price=' + params.max_price;
    if (params.query) requestUrl += '&query=' + encodeURIComponent(params.query);

    logFn('searching ' + requestUrl);
    throttledRequest(requestUrl, function (error, response, html) {

      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(html);
        var allListings = [];

        var foundBan = $('.ban');
        var iterateListings;

        if (foundBan.length) {
          iterateListings = $('.ban').prevAll().find('.hdrlnk');
        } else {
          iterateListings = $('.hdrlnk');
        }

        iterateListings.each(function(i, el) {
          var $el = $(this);
          var urlPath = $el.attr('href');

          if (urlPath.substring(1, 2) === '/') {
            // if from out of this area stop looking for more
            return false;
          }

          var obj = {
            title: $(this).children('span').text(),
            url: 'http://sfbay.craigslist.org' + urlPath,
            clId: Number($(this).data('id')),
            sec: params.section
          };

          allListings.push(obj);

        });

        async.forEachSeries(allListings, function(curListing, cb) {

          // logFn('looking for ' + JSON.stringify(curListing.clId));
          Listing.find({
            clId: curListing.clId
          }, function(err, obj) {
            if (err) throw err;
            if (!obj.length) {
              // only add to mongo if not already catalogued
              responseData.push(curListing);
            }
            cb();
          });

        }, function() {

          var moveOnOrEnd = function() {
            if (x === params.numPages) {
              // finished
              logFn('res', responseData);
              callback(responseData);
            } else {
              // move to next page
              getPage(x + 1);
            }
          }


          if (responseData.length) {
            //
            // logFn('here', JSON.stringify(responseData));
            // save all new cl listings to mongo
            saveAll(responseData, function(err) {
              //
              // logFn('there');

              if (err) throw err;

              moveOnOrEnd();

            });

          } else {
            moveOnOrEnd();
          }

        });

      } else {
        logFn('error: ' + JSON.stringify(error), response);
      }
    });

  };

  getPage(1);

};



var getListingDetails = function(url, cb, logFn) {

  logFn = logFn || function(s) {
    console.logFn(s);
  };

  // logFn('getting model from page');

  // logFn(url);
  var urlSplit = url.split('/');
  var section = urlSplit[urlSplit.length-2];
  // logFn('section', section);

  var getImportantInfo = function($) {
    var model = $('span:contains("model name / number: ") b').text();
    var make = $('span:contains("make / manufacturer: ") b').text();
    if (section === 'cto' && !make) {
      make = $('.attrgroup').eq(0).find('span').text();
    }
    var price = $('.price').text();
    var pics = [];
    $('.thumb').map(function() {
      pics.push($(this).attr('href'));
    });
    return {
      model: model,
      make: make,
      price: price,
      pics: pics
    };
  };

  throttledRequest(url, function (error, response, html) {
    if (!error && response.statusCode == 200) {
      var $ = cheerio.load(html);
      var details = getImportantInfo($);
      // logFn(details);
      details.price = details.price.substring(1); // remove $ sign
      details.searchedForMakeModel = true;

      Listing.update({
        url: url
      }, details, function(err) {
        if (err) throw err;
        cb(details);
      });

    }
  });
};

function getAlleBayPricesForThoseWithMakeOrModel(callback, logFn) {

  var theBestDeals = [];
  logFn = logFn || function(s) {
    console.logFn(s);
  };

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
      logFn('...');
      logFn('there are ' + thoseWithMakeOrModel.length + ' that need to be searched on ebay');

      var makeCount = 0;

      async.forEachSeries(thoseWithMakeOrModel, function(listing, cb) {
        var searchQuery = (listing.make + ' ' + listing.model).trim();
        if (searchQuery.indexOf('condition') !== -1) {
          searchQuery = listing.name;
        }
        ebaySearch.getPrices(searchQuery, listing.price, function(ebayResults) {

          makeCount++;

          var avg = (ebayResults) ? Math.round(ebayResults.avg * 100) / 100 : 0;
          logFn(makeCount + ' / ' + thoseWithMakeOrModel.length);
          logFn(searchQuery);
          logFn('ebay: ' + avg);
          logFn('selling on cl at ' + listing.price);
          logFn('');
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

      }, function() {
        callback(theBestDeals.map(function(deal) {
          return Object.assign(deal.toObject(), {
              ratio: deal.ebaySellPrice.avg / deal.price
          });
        }));
      });

    } else {
      logFn('there are no listings that need to be searched on ebay');
      callback([]);
    }

  });
}


module.exports = {
  getBestDealsInSection: getBestDealsInSection,
  getAllClUrlsForSearch: getAllClUrlsForSearch,
  getListingDetails: getListingDetails,
  getAlleBayPricesForThoseWithMakeOrModel: getAlleBayPricesForThoseWithMakeOrModel
};
