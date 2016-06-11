// http://sfbay.craigslist.org/sby/eld/5629086342.html


var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var mongoose = require('mongoose');

var db = mongoose.connect('mongodb://localhost/clListings');

var listingSchema = new mongoose.Schema({
  clId: Number,
  price: Number,
  title: String,
  make: String,
  model: String,
  searchedForMakeModel: {
    type: Boolean,
    default: false
  },
  ebaySellPrice: Number
});

var Listing = db.model('listing', listingSchema);

var newlisting = new Listing({
  clId: 3432,
  make: "hotdogs for cash",
  ebaySellPrice: 23.50
});

newlisting.save(function(err) {
  if (err) throw err;
});

// http://sfbay.craigslist.org/search/sss?sort=date
var getAllClUrlsForSearch = function(params, callback) {
  if (!params.section) params.section = 'sss';
  if (!params.sortBy) params.sortBy = 'date';
  if (!params.numPages) params.numPages = 5;


  var responseData = [];

  var getPage = function(x) {

    console.log('checking out page ' + x);

    var requestUrl = 'http://sfbay.craigslist.org/search/' + params.section + '?s=' + (x-1)*100 + '&sort=' + params.sortBy;
    if (params.min_price) requestUrl += '&min_price=' + params.min_price;
    if (params.max_price) requestUrl += '&max_price=' + params.max_price;

    request(requestUrl, function (error, response, html) {
      console.log('searching' + requestUrl);
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
            name: $(this).children('span').text(),
            url: 'http://sfbay.craigslist.org' + urlPath,
            clId: $(this).data('id')
          };

          allListings.push(obj);

        });

        async.forEachSeries(allListings, function(curListing, cb) {

          console.log('looking for ' + JSON.stringify(curListing));
          Listing.find({
            clId: curListing.clId
          }, function(err, obj) {
            if (err) {
              // listing already in mongo stop early
              console.log('stopping early because we already found ', curListing);
              callback();
            } else {
              // listing has not been found yet
              responseData.push(obj);
              cb();
            }
          })

        }), function() {

          console.log('here');
          // save all new cl listings to mongo
          Listing.create(responseData, function(err) {

            console.log('there');

            if (err) throw err;

            if (x === params.numPages) {
              // finished
              callback(responseData);
            } else {
              // move to next page
              getPage(x + 1);
            }

          });


        };

      }
    });

  };

  getPage(1);

}





var getModelFromPage = function(url, cb) {
  console.log('getting model from page');
  request(url, function (error, response, html) {
    if (!error && response.statusCode == 200) {
      var $ = cheerio.load(html);
      var model = $('span:contains("model name / number: ") b').text();
      var make = $('span:contains("make / manufacturer: ") b').text();
      var price = $('.price').text();
      var obj = {
        model: model,
        make: make,
        price: price
      };
      console.log(obj);
      cb(obj);
    }
  });
}





var clListings;
async.series([
  function(callback) {

    async.forEachSeries(['http://sfbay.craigslist.org/sby/eld/5629086342.html', 'http://sfbay.craigslist.org/eby/ele/5629172209.html'], function(url, cb) {

      getModelFromPage(url, function(data) {
          console.log(data);
          cb();
      });

    }, callback);

  },
  function(callback) {

    getAllClUrlsForSearch({
      numPages: 1,
      min_price: 505,
      max_price: 510
    }, function(clResults) {
      clListings = clResults;
      console.log('clResults',clResults);
      callback();
    });

  },
  function(callback) {
    var clUrls = clListings.map(function(listing) {
      return listing.url;
    });
    console.log('clUrls', clUrls);
    async.forEachSeries(clUrls, function(url, cb) {
      getModelFromPage(url, function(data) {
          console.log(data);
          cb();
      });
    }, callback);
  }
], function() {
  console.log('finished running');
});
