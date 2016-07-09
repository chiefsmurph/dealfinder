var mongoose = require('mongoose');
var cronSearchSchema = new mongoose.Schema({
  params: {},
  socketRoom: String,
  nextRun: Date
});

var CronSearch = mongoose.model('cronSearch', cronSearchSchema);
module.exports = CronSearch;
