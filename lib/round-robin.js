module.exports = function(arr) {
	if (!Array.isArray(arr)) {
		throw new Error('Can only accept an array');
	}
	var index = 0;
	arr.robin = function() {
		var ret = arr[index];
		index = (index + 1) % arr.length;
		return ret;
	};
	return arr;
}