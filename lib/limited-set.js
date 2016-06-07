
class LimitedSet {
	constructor(limit) {
		this.limit = limit;
		this.queue = [];
		this.set = {};
	}
	has(val) {
		return this.set[val];
	}
	put(val) {
		this.queue.push(val);
		this.set[val] = 1;
		while (this.queue.length > this.limit) {
			val = this.queue.shift();
			delete this.set[val];
		}
	}
}

module.exports = LimitedSet;