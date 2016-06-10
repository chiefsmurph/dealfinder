// http://sfbay.craigslist.org/sby/eld/5629086342.html


var request = require('request');
var cheerio = require('cheerio');
var async = require('async');


var getModelFromPage = function(url, cb) {
  request(url, function (error, response, html) {
    if (!error && response.statusCode == 200) {
      var $ = cheerio.load(html);
      var model = $('span:contains("model name / number: ") b').text();
      var make = $('span:contains("make / manufacturer: ") b').text();
      var price = $('.price').text();
      cb({
        model: model,
        make: make,
        price: price
      });
    }
  });
}



// http://sfbay.craigslist.org/search/sss?sort=date
var getAllClUrlsForSearch = function(params, callback) {
  if (!params.section) params.section = 'sss';
  if (!params.sortBy) params.sortBy = 'date';
  if (!params.numPages) params.numPages = 5;

  var responseData = [];

  var getPage = function(x) {

    console.log('checking out page ' + x);

    request('http://sfbay.craigslist.org/search/' + params.section + '?s=' + (x-1)*100 + 'sort=' + params.sortBy, function (error, response, html) {
      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(html);

        $('.hdrlnk').each(function(i, el) {
          var $el = $(this);
          var urlPath = $el.attr('href');

          var name = $(this).children('span').text();
          var url = 'http://sfbay.craigslist.org' + urlPath;
          responseData.push({
            name: name,
            url: url
          });

        });


        if (x === params.numPages) {
          // finished
          callback(responseData);
        } else {
          // move to next page
          getPage(x + 1);
        }

      }
    });

  };

  getPage(1);

}




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
      numPages: 1
    }, function(data) {
      console.log(data);
      callback();
    });

  }
])
