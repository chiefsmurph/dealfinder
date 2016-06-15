var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var async = require('async');

var mongoose = require('mongoose');
var db = mongoose.connect('mongodb://localhost/clListings');

var Listing = require('./models/listing');
var importantFns = require('./importantFns');
var ebaySearch = require('./ebaySearch');

var port = process.env.PORT || 5000; // Use the port that Heroku
server.listen(port);

console.log('listening on ' + port);

app.use(express.static(__dirname + '/public'));

io.sockets.on('connection', function (socket) {
  console.log('connected socket');

  var log = function(s) {
    socket.emit('info', s);
    console.log(s);
  };

  socket.on('getBestDealsInSection', function(searchQuery) {
    importantFns.getBestDealsInSection(searchQuery, function(data) {
      socket.emit('bestDealsInSection', {
        deals: data,
        sec: searchQuery.section,
        query: searchQuery.searchText
      });
    });
  });

  socket.on('queryCl', function(params) {
    importantFns.getAllClUrlsForSearch(params, function(results) {
      // done
      //console.log(results);
      log('Completed: found ' + results.length + ' results\n');
      log('--------------------------------------------');

      var listingCount = 0;
      var theBestDeals = [];

      async.forEachSeries(results, function(listing, detailCallback) {
        listingCount++;
        log('\nGetting details for listing ' + listingCount + ' of ' + results.length + ': ' + listing.title);
        importantFns.getListingDetails(listing.url, function(deepListing) {

          var searchQuery = (deepListing.make + ' ' + deepListing.model).trim();
          if (searchQuery.indexOf('condition') !== -1) {
            searchQuery = deepListing.name;
          }
          if (searchQuery.length) {
            ebaySearch.getPrices(searchQuery, deepListing.price, function(ebayResults) {

              deepListing = Object.assign(deepListing, listing);
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


            }, log);
          } else {
            log('--- couldnt find make / model...skipping ebay');
            detailCallback();
          }


        }, log);
      }, function() {

        socket.emit('theBestDeals', importantFns.addProfitAndRatioToListingsArr(theBestDeals));
        log('\nDone searching... found ' + theBestDeals.length + ' hot deals!');
        // importantFns.getAlleBayPricesForThoseWithMakeOrModel(function(theBestDeals) {
        //   console.log('best deals', theBestDeals);
        //   socket.emit('theBestDeals', theBestDeals);
        // }, log);
      });



    }, log);
  });

  socket.on('ignore', function(data) {
    Listing.update(data, {
      ignore: true
    }, function(err) {
      if (err) throw err;
    });
  });

});
