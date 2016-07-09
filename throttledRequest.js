var request = require('request');
var async = require('async');

var throttleTime = 3500;  // time between requests
var leeWayPercentage = 20;  // set to 0 to disable
var timeoutSecs = 15000;

var lastCall = null;


var myProx = ['107.175.230.247:3128', '107.175.239.211:3128', '138.128.1.220:3128', '192.198.98.254:3128', '107.175.235.67:3128'];
//var myProx = [];

(function checkProx() {
  console.log('checking proxies');
  var tempArray = myProx.slice(0);
  var removeEl = function(array, val) {
    var i = array.indexOf(val);
    if(i != -1) {
    	array.splice(i, 1);
    }
  }
  async.forEachSeries(tempArray, function(prox, cb) {
    request.get('http://' + prox).auth('smurfturf', 'U5Kk1ThI');
    try {
      throttledRequest('http://sfbay.craigslist.org/search/cta?s=0&sort=date&min_price=1400&max_price=4000', function(error, response, html) {
        if (error || html.indexOf('proxy') !== -1) {
          console.log('error with ' + prox);
          removeEl(myProx, prox);
        } else {
          console.log('all good with ' + prox);
        }
        cb();
      }, 'http://' + prox, true, 4000);

    } catch (err) {
      console.log('ERROR with ' + prox);
      removeEl(myProx, prox);
    }
  });
})()

function throttledRequest(url, cb, prox, rushFlag, timeoutFlag) {
  //
  //console.log('throttling ' + url);
  var now = function() { return new Date().getTime(); }
  var timeSinceLastRequest = now() - lastCall;
  var shoot = function() {

    var beenCalled = false;

    var requestObj = {
      url: url,
      timeout: timeoutSecs,
      method: 'GET'
    };

    if (prox || myProx.length) {
      var randomProx = 'http://' + myProx[Math.floor(Math.random()*myProx.length)];
      requestObj = Object.assign(requestObj, {
        proxy: prox || randomProx
      });
      //console.log('requestObj ',requestObj);
    }

    request(requestObj, function(error, response, html) {
      if (!beenCalled) {
        lastCall = now();
        beenCalled = true;
        cb(error, response, html);
      }
    });

    setTimeout(function() {
      // my own force timeout
      if (!beenCalled) {
        console.log('FORCE FORCE TIMEOUT');
        beenCalled = true;
        lastCall = now();
        cb(true); // force error
      }
    }, timeoutFlag || timeoutSecs);
  };

  // console.log('its been ' + timeSinceLastRequest + 'since last')
  if (!lastCall || timeSinceLastRequest  >= throttleTime || rushFlag) {
    // its been enough time shoot away
    shoot();
  } else {
    // wait and then fire
    var waitTime = ( ( Math.random() * leeWayPercentage / 100 + 1) * throttleTime ) - timeSinceLastRequest;
    // console.log('waiting %d then firing', waitTime);
    setTimeout(function() {
      shoot();
    }, waitTime);
  }

}


module.exports = throttledRequest;
