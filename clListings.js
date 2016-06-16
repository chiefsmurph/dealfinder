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


var cronJobSearches = [];


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
    importantFns.fullQuery(params, {socket: socket}, function() {
      // handle CRONs
      importantFns.checkForCRON(params, {socket: socket, io: io});
    });
  });

  socket.on('ignore', function(data) {
    Listing.update(data, {
      ignore: true
    }, function(err) {
      if (err) throw err;
    });
  });

  socket.on('joinCRONS', function(arr) {
    arr.forEach(function(cronId) {
      console.log('joined ' + cronId);
      socket.join(cronId);
    });
  });

});
