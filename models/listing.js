var mongoose = require('mongoose');
var listingSchema = new mongoose.Schema({
  clId: Number,
  url: String,
  price: Number,
  title: String,
  make: String,
  model: String,
  sec: String,
  pics: [String],
  query: String,
  ignore: {
    type: Boolean,
    default: false
  },
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
