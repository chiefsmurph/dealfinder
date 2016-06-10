module.exports = {
  removeExtremes: function(data) {
    var l = data.length;
    var low = Math.round(l * 0.025);
    var high = l - low;
    var data2 = data.slice(low,high);
    return data2;
  },
  removeOutsideSD: function(data) {
    var l = data.length;
    var sum=0;     // stores sum of elements
    var sumsq = 0; // stores sum of squares
    for(var i=0;i<data.length;++i) {
        sum+=data[i];
        sumsq+=data[i]*data[i];
    }
    var mean = sum/l;
    var varience = sumsq / l - mean*mean;
    var sd = Math.sqrt(varience);
    var data3 = new Array(); // uses for data which is 3 standard deviations from the mean
    for(var i=0;i<data.length;++i) {
        if(data[i]> mean - 3 *sd && data[i] > mean / 2 && data[i] < mean + 3 * sd) {
          data3.push(data[i]);
        } else {
          console.warn('removed ' + data[i]);
        }
    }
    return data3;
  }
};
