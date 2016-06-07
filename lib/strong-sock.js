var net = require('net');
var shortid = require('shortid');
var Message = require('amp-message');
var EventEmitter = require('events').EventEmitter;

exports.connect = function(port, addr) {
	return new Client(port, addr);
};

exports.bind = function(port, addr, cb) {
	return new Server(port, addr, cb);
};


class Client extends EventEmitter {
	constructor(port, addr, id) {
		super();

		if (!addr || addr == '0.0.0.0') {
			addr = '127.0.0.1';
		}
		this._id = id || shortid.generate();
		this.port = port;
		this.addr = addr;
		this.writer = new Writer(this._id);
		this.receiver = new Receiver();

		this.connect();
	}
	connect() {
		this.sock = net.createConnection(this.port, this.addr, this.onConnect.bind(this));
		this.sock.on('error', err => console.error(err.message));
		this.sock.on('close', errored => {
			this.writer.setTarget(null);
			this.sock = null;
			if (errored) {
				setTimeout(this.connect.bind(this), 500);
			}
		});
		this.receiver.read(this.sock, (data, from) => this.emit('data', data, from));
	}
	onConnect() {
		var header = new Buffer(4);
		header[0] = this.writer._idBuffer.length;
		this.sock.write(Buffer.concat([header, this.writer._idBuffer]), () => {
			this.writer.setTarget(this.sock);
		});
	}
	write(buffer) {
		this.writer.write(buffer);
	}
}

class Server extends EventEmitter {
	constructor(port, addr, id) {
		super();

		if (!addr) {
			addr = '0.0.0.0';
		}
		this._id = id || shortid.generate();
		this.clients = {};
		this.server = net.createServer(this.accept.bind(this));
		this.server.on('error', err => {
			console.error(err.stack);
		});
		this.server.listen(port, addr);
	}
	accept(conn) {
		var client, initialLen, initialBuf = new Buffer(30), initialBufPos = 0;
		conn.on('error', err => console.error(err.message));
		conn.on('close', () => {

		});
		var onInitialData = data => {
			if (!initialLen) {
				initialLen = data[0] + 4;
			}
			var len = Math.min(data.length, initialLen - initialBufPos);
			data.copy(initialBuf, initialBufPos, 0, len);
			initialBufPos += len;
			if (initialBufPos == initialLen) {
				var id = toBase64(initialBuf, 4, initialBufPos);
				client = this.getClient(id);
				conn.removeListener('data', onInitialData);
				client.attach(conn);
				if (len < data.length) {
					var remain = new Buffer(data.length - len);
					data.copy(remain, 0, len, data.length);
					client.unshift(remain);
				}
			}
		};
		conn.on('data', onInitialData);
	}
	getClient(id) {
		var client = this.clients[id];
		if (!client) {
			client = this.clients[id] = new ServerClient(this);
		}
		return client;
	}
	writeTo(id, data) {
		this.getClient(id).write(data);
	}
	onData(data, from) {
		this.emit('data', data, from);
	}
}

class ServerClient extends EventEmitter {
	constructor(server) {
		super();

		this.server = server;
		this.receiver = new Receiver();
		this.writer = new Writer(this.server._id);
	}
	attach(sock) {
		this.receiver.read(sock, this.onData.bind(this));
		this.writer.setTarget(sock);
	}
	write(data) {
		this.writer.write(data);
	}
	unshift(data) {
		this.receiver.recv(data);
	}
	onData(data, from) {
		this.server.onData(data, from);
	}
}


class Receiver extends EventEmitter {
	constructor() {
		super();

		this.recv = this.recv.bind(this);
		this.bufferLen = 0;
		this.buffer = [];
		this.history = [];
	}
	read(readable, cb) {
		if (this.prevReadable) {
			this.prevReadable.removeListener('data', this.recv);
		}
		this.cb = cb;
		this.prevReadable = readable;
		readable.on('data', this.recv);
	}
	recv(data) {
		this.buffer.push(data);
		this.bufferLen += data.length;
		this.parsePack();
	}
	parsePack() {
		while (this.bufferLen > 8) {
			while (this.buffer[0].length < 8 && this.buffer.length > 1) {
				this.buffer[0] = Buffer.concat(this.buffer[0], this.buffer[1]);
				this.buffer.splice(1, 1);
			}
			var waitLen = this.buffer[0].readUInt32LE() + 10;
			if (waitLen <= this.bufferLen) {
				var picked = [], pickedLen = 0;
				while (pickedLen < waitLen) {
					var pick = this.buffer.shift();
					pickedLen += pick.length;
					picked.push(pick);
				}
				picked = Buffer.concat(picked);
				var res = new Buffer(waitLen - 10 - picked[5]), idBuf = new Buffer(picked[5]);
				picked.copy(res, 0, 8 + idBuf.length, waitLen - 2);
				picked.copy(idBuf, 0, 8, 8 + idBuf.length);
				if (picked.length > waitLen) {
					var back = new Buffer(picked.length - waitLen);
					picked.copy(back, 0, picked.length - waitLen, picked.length);
					this.buffer.unshift(picked);
				}
				this.bufferLen -= waitLen;
				this.emitPack(res, toBase64(idBuf), picked[4]);
			} else {
				break;
			}
		}
	}
	emitPack(data, from, id) {
		if (this.history.indexOf(id) == -1) {
			this.cb && this.cb(data, from);
			this.history.push(id);
			if (this.history.length > 10) {
				this.history.splice(0, this.history.length - 10);
			}
		}
	}
}

const NL = new Buffer(2);
NL[0] = 13;
NL[1] = 10;

class Writer extends EventEmitter {
	constructor(id) {
		super();

		this.flush = this.flush.bind(this);

		this.pindex = 0;
		this.sentBuffers = [];
		this.buffers = [];
		this._idBuffer = new Buffer(id, 'base64');
	}
	setTarget(target) {
		this.target = target;
		if (target) {
			this.buffers = this.sentBuffers.concat(this.buffers);
			this.sentBuffers = [];
			this.flush();
		}
	}
	write(buffer) {
		var header = new Buffer(8);
		header.writeUInt32LE(buffer.length + this._idBuffer.length);
		header[4] = this.pindex;
		header[5] = this._idBuffer.length;
		this.pindex++;
		if (this.pindex > 250) {
			this.pindex = 0;
		}
		buffer = Buffer.concat([header, this._idBuffer, buffer, NL]);
		this.buffers.push(buffer);
		this.flush();
	}
	flush() {
		if (!this.flushing && this.target && this.buffers.length) {
			this.flushing = true;
			var buff = this.buffers.shift();
			this.sentBuffers.push(buff);
			if (this.sentBuffers.length > 10) {
				this.sentBuffers.splice(0, this.sentBuffers.length - 10);
			}
			this.target.write(buff, () => {
				this.flushing = false;
				this.flush();
			});
		}
	}
}

function toBase64(buffer, start, end) {
	return buffer.toString('base64', start || 0, end || buffer.length)
		.replace(/\//g, '_')
		.replace(/\+/g, '-')
		.replace(/\=/g, '');
}
