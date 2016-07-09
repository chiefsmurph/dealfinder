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


importantFns.getAllCRONS(function(crons) {
  console.log(crons);

  var needsToRun = [];
  crons.forEach(function(cron) {
    if (cron.nextRun < Date.now()) {
      needsToRun.push(cron);
    }
  });

  console.log('needs', needsToRun);

  async.forEachSeries(needsToRun, function(cron, cb) {
    importantFns.runSearch(cron.params, {roomName: cron.socketRoom, io: io}, function() {
      console.log('done waiting 1000 then next');
      setTimeout(cb, 1000);
    });
  });

});


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
    importantFns.runSearch(params, {socket: socket, io: io});
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

  socket.on('cancelCron', function(id) {
    console.log('canceling', id);
    importantFns.cancelCron(id, function(err) {
      if (!err) {
        socket.emit('successCancel', id);
      }
    });
  });

});
