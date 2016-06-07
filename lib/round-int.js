
var BOUND = 0xfff;

module.exports = {
	increment(num, bound) {
		bound = bound || BOUND;
		var ctx = num & 1;
		var val = (num >>> 1);
		val++;
		if (val > bound) {
			val = 0;
			ctx ^= 1;
		}
		return ctx | (val << 1);
	},
	diff(num1, num2, bound) {
		bound = bound || BOUND;
		if ((num1 & 1) != (num2 & 1)) {
			return (num1 >>> 1) + bound - (num2 >>> 1);
		} else {
			return (num1 >>> 1) - (num2 >>> 1);
		}
	}
};
