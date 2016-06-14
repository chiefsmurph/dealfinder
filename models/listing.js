var mongoose = require('mongoose');
var listingSchema = new mongoose.Schema({
  clId: {
    type: Number,
    set: function (v) {
      return Math.round(v);
    }
  },
  url: String,
  price: Number,
  title: String,
  make: String,
  model: String,
  sec: String,
  pics: [String],
  searchedForMakeModel: {
    type: Boolean,
    default: false
  },
  ebaySellPrice: {
    avg: Number,
    priceList: [Number]
  }
});

var Listing = mongoose.model('listing', listingSchema);
module.exports = Listing;
