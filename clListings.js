var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var async = require('async');

var mongoose = require('mongoose');
var db = mongoose.connect('mongodb://localhost/clListings');

var Listing = require('./models/listing');
var importantFns = require('./importantFns');

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

  socket.on('getBestDealsInSection', function(section) {
    importantFns.getBestDealsInSection(section, function(data) {
      socket.emit('bestDealsInSection', {
        deals: data,
        sec: section
      });
    });
  });

  socket.on('queryCl', function(params) {
    importantFns.getAllClUrlsForSearch(params, function(results) {
      // done
      console.log(results);
      log('completed: found ' + results.length + ' results')

      var listingCount = 0;
      async.forEachSeries(results, function(listing, cb) {
        listingCount++;
        log('getting details for listing ' + listingCount + ' of ' + results.length + ': ' + listing.title);
        importantFns.getListingDetails(listing.url, function() {
          cb();
        }, log);
      }, function() {
        importantFns.getAlleBayPricesForThoseWithMakeOrModel(function(theBestDeals) {
          console.log('best deals', theBestDeals);
          socket.emit('theBestDeals', theBestDeals);
        }, log);
      });



    }, log);
  });

});
