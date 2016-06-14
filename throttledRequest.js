var request = require('request');

var throttleTime = 1000;  // time between requests
var leeWayPercentage = 20;  // set to 0 to disable

var lastCall = null;

module.exports = function(url, cb) {

  var now = function() { return new Date().getTime(); }
  var timeSinceLastRequest = now() - lastCall;
  var shoot = function() {
    lastCall = now();
    request({
      url: url,
      // proxy: 'http://104.255.64.79:3128'
    }, cb);
  };

  // console.log('its been ' + timeSinceLastRequest + 'since last')
  if (!lastCall || timeSinceLastRequest  >= throttleTime) {
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
