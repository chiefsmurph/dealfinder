(function(exports){

    var price = function(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };
    // your code goes here
   exports.convert = function (listings, header, htmlTemplateFlag) {
     console.log(listings, header);

     var displayText = (header) ? '<h2>' + header + '</h2>' : '';

     if (!listings.length) {
       displayText += 'No listings found.';
       return displayText;
     }

     listings.forEach(function(listing) {
       displayText += "<div class='listing' data-clid='" + listing.clId + "'>";
       if (!htmlTemplateFlag) displayText += "<div class='updown'><a href='javascript:ignoreListing(\"" +listing.clId+ "\")' class='ignorelink'><i class='fa fa-times fa-fw'>IGNORE</i></a></div>";
       if (listing.pics.length) {
         displayText += '<img src="' + listing.pics[0] + '" class="pic">'
         if (htmlTemplateFlag) displayText += "<br>"
       }
       ['title', 'url', 'make', 'model'].forEach(function(key) {
         if (listing[key]) {
           displayText += ( (listing[key].indexOf('http') !== -1) ? '<a href="' + listing[key] + '">' + listing[key] + '</a>' : listing[key]) + '<br>';
         }
       });

       displayText += "selling on cl for $" + price(listing.price);


       var ebayQuery = (listing.make + ' ' + listing.model).trim();
       var minSellPrice = listing.price*.5;
       var ebayUrl = 'http://www.ebay.com/sch/i.html?_from=R40&_sacat=0&LH_Complete=1&LH_Sold=1&_nkw=' + encodeURIComponent(ebayQuery) + '&_udlo=' + minSellPrice + '&_skc=100&rt=nc';
       if (listing.ebaySellPrice && listing.ebaySellPrice.avg) {
         displayText += ' and on ebay for <a href="' +ebayUrl+ '">$' + price(listing.ebaySellPrice.avg) + '</a><br>';
         displayText += 'potential profit: $' + price(listing.profit);
       }
       displayText += '</div>';
       if (htmlTemplateFlag) displayText += '<br><br>'
     });

     return displayText;
   }


})(typeof exports === 'undefined'? this['displayListings']={}: exports);
