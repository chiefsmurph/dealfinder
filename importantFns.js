var async = require('async');
var shortid = require('shortid');
var cheerio = require('cheerio');

var nodemailer = require("nodemailer");
var transporter = nodemailer.createTransport(require('./nodeMailerConnectionString'));

var Listing = require('./models/listing');
var CronSearch = require('./models/cronSearch');

var throttledRequest = require('./throttledRequest');
var ebaySearch = require('./ebaySearch');
var displayListings = require('./public/displayListings');
var shuffleArray = require('./shuffleArray');

var cronTimeoutIds = {};

var saveAll = function( array, cb) {
  Listing.insertMany(array, cb);
};

throttledRequest('http://www.craigslist.org/', function(err, response, html) {
  if (err) console.log(err, html);
});

function getBestDealsInSection(search, callback) {
  var priceObj = {$exists: true};
  priceObj['$gt'] = search.min || 1;
  if (search.max) priceObj['$lt'] = search.max;
  console.log(priceObj);

  var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds
  var nowDate = new Date();
  var dateToStart = new Date();
  dateToStart.setTime(nowDate.getTime() - oneDay * search.maxAge);
  console.log(dateToStart, search.maxAge);

  Listing.aggregate(
      { $match: {
        query: { "$regex": search.searchText, "$options": "i" },
        "sec": search.section,
        price: priceObj,
        "ebaySellPrice.avg": {$exists: true},
        ignore: false,
        postDate: {"$gte": dateToStart }
      }}, // your find query
      { $project: {
          clId: 1,
          price: 1,
          ebaySellPrice: 1,
          ratio: { $divide: ['$ebaySellPrice.avg', '$price'] }, // calculated field
          profit: { $subtract: ['$price', '$ebaySellPrice.avg']}
      } },
      { $sort: { profit: 1 } },
      { $limit: 40 },

      // And then the normal Mongoose stuff:
      function (err, res) {

        // console.log(res)
        // console.log()
        // console.log()
        // logFn(err);

        //
        async.mapSeries(res, function(partialListing, cb) {
          Listing.findById(partialListing._id, function(err, res) {
            // console.log(res.toObject(), '\n')
            cb(null, res.toObject());
          });
        }, function(err, results) {
          // logFn(results)
          var withProfitRatio = addProfitAndRatioToListingsArr(results).filter(function(listing) {
            return parseInt(listing.ebaySellPrice.avg) > parseInt(listing.price);
          });

          // console.log(withProfitRatio);
          callback(withProfitRatio);
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

  var responseData = [];

  logFn('--------------------------------------------');

  var getPage = function(x) {

    // logFn('checking out page ' + x);

    var requestUrl = 'http://sfbayarea.craigslist.org/search/' + params.section + '?s=' + (x-1)*100 + '&sort=' + params.sortBy + '';
    if (params.min_price) requestUrl += '&min_price=' + params.min_price;
    if (params.max_price) requestUrl += '&max_price=' + params.max_price;
    if (params.query) requestUrl += '&query=' + encodeURIComponent(params.query);

    logFn('Getting CL posts from ' + requestUrl);
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
            title: $el.children('span').text(),
            url: 'http://sfbay.craigslist.org' + urlPath,
            clId: Number($el.data('id')),
            postDate: new Date($el.prev().text()),
            sec: params.section,
            query: params.query
          };

          //console.log(obj, $el.prev().text());

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

          // check to see if you are on the last page of results for that cl query
          var foundAllListingsForQuery = (iterateListings.length === 100 && !$('.next').length);  // no more listings
          responseData = responseData.slice(0, params.maxListings);

          // cut out the results that are past the maxDays
          var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds
          var nowDate = new Date();
          var hitEndOfListings = false;
          var i = responseData.length;
          while (i--) {
            var listing = responseData[i];
            listing.postDate.setYear(nowDate.getFullYear());

            var diffDays = Math.round(Math.abs((listing.postDate.getTime() - nowDate.getTime())/(oneDay)));
            if (diffDays > params.maxDays) {  // make sure
              responseData.splice(i, 1);
              hitEndOfListings = true;
            }
          }

          var moveOnOrEnd = function() {
            if (responseData.length === params.maxListings || foundAllListingsForQuery || hitEndOfListings) {
              // finished
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
        logFn('error: ' + JSON.stringify(error), response, html, error);
        callback([]);
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

    } else {
      // error
      cb({});
    }
  });
};

function getAlleBayPricesForThoseWithMakeOrModel(callback, logFn) {

  var theBestDeals = [];
  logFn = logFn || function(s) {
    console.log(s);
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

    thoseWithMakeOrModel = res.filter(function(listing) {
      return ((listing.make && listing.make.length > 1 && listing.make.indexOf('undefined') === -1) ||
        (listing.model && listing.model.length > 1 && listing.model.indexOf('undefined') === -1));
    });

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

          logFn(makeCount + ' / ' + thoseWithMakeOrModel.length);
          logFn(searchQuery);
          logFn('ebay: ' + ebayResults.avg);
          logFn('selling on cl at ' + listing.price);
          logFn('');
          var ebayObj = {
            ebaySellPrice: ebayResults
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
        callback(addProfitAndRatioToListingsArr(theBestDeals));
      });

    } else {
      logFn('there are no listings that need to be searched on ebay');
      callback([]);
    }

  });
}

function addProfitAndRatioToListingsArr(listings) {
  return listings.map(function(deal) {      // ADD PROFIT AND RATIO
    if (deal.price === 0) return deal;
    return Object.assign(deal, {
        ratio: Math.round(deal.ebaySellPrice.avg / deal.price * 100) / 100,
        profit: Math.round((deal.ebaySellPrice.avg - deal.price) * 100) / 100
    });
  }).map(function(listing) {                // ORDER BY PROFIT * RATIO
    return Object.assign(listing, {
      profitTimesRatio: listing.profit * listing.ratio
    });
  }).sort(function(a, b) {
    return parseFloat(b.profitTimesRatio) - parseFloat(a.profitTimesRatio);
  });;
}

function fullQuery(params, conn, cb) {
  var emit = function(evt, obj) {
    if (conn.socket)
      conn.socket.emit(evt, obj);
  };
  var log = function(s) {
    console.log(s);
    emit('info', s);
  };
  emit('start', params);
  getAllClUrlsForSearch(params, function(results) {
    // done
    //console.log(results);
    log('Completed: found ' + results.length + ' results');
    log('--------------------------------------------');

    var listingCount = 0;
    var theBestDeals = [];

    // randomize the order
    shuffleArray(results);

    async.forEachSeries(results, function(listing, detailCallback) {
      listingCount++;
      log('\nGetting details for listing ' + listingCount + ' of ' + results.length + ': ' + listing.title);
      getListingDetails(listing.url, function(deepListing) {

        deepListing = Object.assign(deepListing, listing);

        var searchQuery = (deepListing.make === deepListing.model) ? (deepListing.make + ' ' + deepListing.model).trim() : deepListing.make;
        if (searchQuery.indexOf('condition') !== -1) {
          searchQuery = deepListing.name;
        }
        if (!searchQuery.length) {
          searchQuery = deepListing.title.split(' ').slice(0, 4).join(' ');
        }
        if (searchQuery.length) {
          ebaySearch.getPrices(searchQuery, deepListing.price, function(ebayResults) {

            // console.log('ebay results');
            // console.log(ebayResults);
            // update listing in db
            var ebayObj = {
              ebaySellPrice: ebayResults
            };

            Listing.update({
              clId: listing.clId
            }, ebayObj, function(err) {
              if (err) throw err;
              try {
                detailCallback();
              } catch (e) {
                console.log('no worries error')
                console.log(e);
              }
            });

            // make considerations for the best deals
            if (ebayResults && ebayResults.avg) {
              var perc = ebayResults.avg / deepListing.price;
            }

            if ( perc >  1.1 ) {
              log('*** HOT HOT HOT ***')
              var obj = Object.assign(deepListing, ebayObj);
              theBestDeals.push(obj);
            }


          }, log, params.section);
        } else {
          log('--- couldnt find make / model...skipping ebay');
          try {
            detailCallback();
          } catch (e) {
            console.log('no worries error')
            console.log(e);
          }
        }


      }, log);
    }, function() {

      var withProfitRatio = addProfitAndRatioToListingsArr(theBestDeals);
      emit('theBestDeals', withProfitRatio);
      log('\nDone searching... found ' + theBestDeals.length + ' hot deals!\n');
      // getAlleBayPricesForThoseWithMakeOrModel(function(theBestDeals) {
      //   console.log('best deals', theBestDeals);
      //   socket.emit('theBestDeals', theBestDeals);
      // }, log);

      // filter by even higher ratio and then check for the email to be sent

      withProfitRatio = withProfitRatio.filter(function(listing) {
        return listing.ratio > 1.8;
      });

      if (withProfitRatio.length) {

        var content = displayListings.convert(withProfitRatio, 'Dealfinder 1.0 found ' + withProfitRatio.length + ' great deals...', true);

        var mailOptions = {
           to : 'chiefsmurph@gmail.com',
           subject: 'Dealfinder 1.0: ' + withProfitRatio.length + ' GREAT DEALS',
           html: content,
        };
        // send mail with defined transport object
        transporter.sendMail(mailOptions, function(error, info){
            if(error){
                return console.log(error);
            }
            console.log('Message sent: ' + info.response);
        });

      }

      cb();
    });



  }, log);
}

function checkForCRON(params, conn, io, cb) {

  if (params.cron && params.cron.enabled) {

    var cronINC = {
      'minutes': 1000 * 60,
      'hours': 1000 * 60 * 60,
      'days': 1000 * 60 * 60 * 24
    };

    var timeoutTime = cronINC[params.cron.cronIncrement] * params.cron.numCRON;
    console.log('running again in ' + timeoutTime + 'ms');


    var createSettimeout = function() {


      var intervalId = setTimeout(function() {
        runSearch(params, {roomName: conn.roomName, io: conn.io});
      }, timeoutTime);

      cronTimeoutIds[conn.roomName] = intervalId;

      var dateObj = Date.now();
      dateObj += timeoutTime;
      dateObj = new Date(dateObj);

      CronSearch.update({
        socketRoom: conn.roomName
      }, {
        nextRun: dateObj
      }, function(err) {
        if (err) throw err;
        console.log('updated cronsearch with nextrun');
        if (cb) cb();
      });

    };

    if (!conn.roomName) {
      // CREATE NEW CRON -> this is the first time this cron query has been sent
      // for establishing future connections via socket room ids
      var newId = shortid.generate();
      conn.roomName = newId;

      new CronSearch({
        params: params,
        socketRoom: newId
      }).save(function(err, res) {
        if (err) throw err;
        conn.socket.join(newId);
        conn.socket.emit('newCRON', newId);
        createSettimeout();
      });

    } else {
      createSettimeout();
    }

  } else {
    if (cb) cb();
  }
}

function cancelCron(id, cb) {
  // id = socketRoom / roomName
  clearTimeout(cronTimeoutIds[id]);
  delete cronTimeoutIds[id];
  CronSearch.find({socketRoom: id}).remove(cb);
}

function getAllCRONS(cb) {
  CronSearch.find({}, function(err, data) {
    if (err) throw err;
    cb(data);
  });
}

function runSearch(params, conn, cb) {
  if (params && conn.socket && conn.io) {
    fullQuery(params, {socket: conn.socket}, function() {
      checkForCRON(params, {socket: conn.socket, io: conn.io}, cb);
    });
  } else if (params && conn.roomName && conn.io) {
    fullQuery(params, {socket: conn.io.to(conn.roomName)}, function() {
      checkForCRON(params, {roomName: conn.roomName, io: conn.io}, cb);
    });
  } else {
    console.log('runSearch: must pass in params && conn.io && (conn.socket or conn.roomName)');
    console.log(params, conn, cb);
  }
}

module.exports = {
  getBestDealsInSection: getBestDealsInSection,
  getAllClUrlsForSearch: getAllClUrlsForSearch,
  getListingDetails: getListingDetails,
  getAlleBayPricesForThoseWithMakeOrModel: getAlleBayPricesForThoseWithMakeOrModel,
  addProfitAndRatioToListingsArr: addProfitAndRatioToListingsArr,
  fullQuery: fullQuery,
  checkForCRON: checkForCRON,
  getAllCRONS: getAllCRONS,
  runSearch: runSearch,
  cancelCron: cancelCron
};
