var crypto = require('crypto');
var shortid = require('shortid');

exports.encode = function(obj) {
	var password = new Buffer(shortid.generate(), 'base64');
	password[0] = password.length;
	var cipher = crypto.createCipher('aes128', password);
	var arr = [ password ];
	encode(obj, {
		push(chunk) {
			arr.push(cipher.update(chunk));
		}
	});
	arr.push(cipher.update(new Buffer(8)));
	arr.push(cipher.final());
	return Buffer.concat(arr);
};

exports.parse = function(buffer) {
	var password = new Buffer(buffer[0]);
	var payload = new Buffer(buffer.length - buffer[0]);
	buffer.copy(password, 0, 0, buffer[0]);
	buffer.copy(payload, 0, buffer[0], buffer.length);
	var decipher = crypto.createDecipher('aes128', password);
	return parse(Buffer.concat([ decipher.update(payload), decipher.final() ]), 0)[0];
};


function oneByte(i) {
	var ret = new Buffer(1);
	ret[0] = i;
	return ret;
}
function int2Byte(i) {
	var ret = new Buffer(4);
	ret.writeInt32LE(i);
	return ret;
}

var TYPE = {
	nil: oneByte(0),
	buffer: oneByte(1),
	keyValue: oneByte(2),
	list: oneByte(3),
	number: oneByte(4),
	string: oneByte(5),
	cTrue: oneByte(6),
	cFalse: oneByte(7),
};

function encode(obj, arr, depth) {
	if (depth > 10 || obj === null) {
		arr.push(TYPE.nil);
	} else if (typeof obj == 'object') {
		if (Buffer.isBuffer(obj)) {
			arr.push(TYPE.buffer);
			arr.push(int2Byte(obj.length));
			arr.push(obj);
		} else if (Array.isArray(obj)) {
			arr.push(TYPE.list);
			arr.push(int2Byte(obj.length));
			for (var i = 0; i < obj.length; i++) {
				encode(obj[i], arr, depth + 1);
			}
		} else {
			arr.push(TYPE.keyValue);
			var keys = Object.keys(obj);
			arr.push(int2Byte(keys.length));
			for (var i = 0; i < keys.length; i++) {
				encode(keys[i], arr, depth);
				encode(obj[keys[i]], arr, depth + 1);
			}
		}
	} else if (typeof obj == 'string') {
		arr.push(TYPE.string);
		obj = new Buffer(obj, 'utf8');
		arr.push(int2Byte(obj.length));
		arr.push(obj);
	} else if (typeof obj == 'number') {
		arr.push(TYPE.number);
		obj = new Buffer(obj + '', 'utf8');
		arr.push(int2Byte(obj.length));
		arr.push(obj);
	} else if (typeof obj == 'boolean') {
		arr.push(obj ? TYPE.cTrue : TYPE.cFalse);
	} else {
		arr.push(TYPE.nil);
	}
}

function parse(buffer, pos) {
	var type = buffer[pos];
	if (type == TYPE.nil[0]) {
		return [undefined, 1];
	} else if (type == TYPE.cTrue[0]) {
		return [true, 1];
	} else if (type == TYPE.cFalse[0]) {
		return [false, 1];
	} else if (type == TYPE.string[0]) {
		var len = buffer.readInt32LE(pos + 1);
		return [buffer.toString('utf8', pos + 5, pos + 5 + len), len + 5];
	} else if (type == TYPE.number[0]) {
		var len = buffer.readInt32LE(pos + 1);
		return [buffer.toString('utf8', pos + 5, pos + 5 + len) - 0, len + 5];
	} else if (type == TYPE.buffer[0]) {
		var len = buffer.readInt32LE(pos + 1);
		var ret = new Buffer(len);
		buffer.copy(ret, 0, pos + 5, pos + 5 + len);
		return [ret, len + 5];
	} else if (type == TYPE.list[0]) {
		var len = buffer.readInt32LE(pos + 1);
		var consume = 5;
		var ret = [];
		for (var i = 0; i < len; i++) {
			var r = parse(buffer, pos + consume);
			ret[i] = r[0];
			consume += r[1];
		}
		return [ret, consume];
	} else if (type == TYPE.keyValue[0]) {
		var len = buffer.readInt32LE(pos + 1);
		var consume = 5;
		var ret = {};
		for (var i = 0; i < len; i++) {
			var r = parse(buffer, pos + consume);
			var k = r[0];
			consume += r[1];
			r = parse(buffer, pos + consume);
			ret[k] = r[0];
			consume += r[1];
		}
		return [ret, consume];
	} else {
		return [undefined, 1];
	}
}
