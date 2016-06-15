var request = require('request');

var throttleTime = 1500;  // time between requests
var leeWayPercentage = 20;  // set to 0 to disable
var timeoutSecs = 10000;

var lastCall = null;

module.exports = function(url, cb) {
  //
  // console.log('throttling ' + url);
  var now = function() { return new Date().getTime(); }
  var timeSinceLastRequest = now() - lastCall;
  var shoot = function() {
    lastCall = now();
    var beenCalled = false;
    request({
      url: url,
      timeout: timeoutSecs,
      method: 'GET'
      // proxy: 'http://199.16.220.249:8080'
    }, function(error, response, html) {
      beenCalled = true;
      cb(error, response, html);
    });

    setTimeout(function() {
      // my own force timeout
      if (!beenCalled) {
        console.log('FORCE FORCE TIMEOUT');
        cb(true); // force error
      }
    }, timeoutSecs);
  };

  // console.log('its been ' + timeSinceLastRequest + 'since last')
  if (!lastCall || timeSinceLastRequest  >= throttleTime) {
    // its been enough time shoot away
    shoot();
  } else {
    // wait and then fire
    var waitTime = ( ( Math.random() * leeWayPercentage / 100 + 1) * throttleTime ) - timeSinceLastRequest;
    console.log('waiting %d then firing', waitTime);
    setTimeout(function() {
      shoot();
    }, waitTime);
  }

}
