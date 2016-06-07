var net = require('net');
var EventEmitter = require('events').EventEmitter;
var messageStream = require('./message-stream');
var roundInt = require('./round-int');

class Line extends EventEmitter {
	constructor(config) {
		this.config = config;
		this.index = 0;
		if (config.addr == '0.0.0.0') {
			config.addr = '127.0.0.1';
		}
		if (config.type == 'connect') {
			this.sendBuffer = {};
			this.connect();
		} else {
			this.bind();
		}
	}
	connect() {
		this.sock = net.createConnection(this.config.port, this.config.addr);
		this.sock.on('error', err => {
			console.error(err.message);
		});
		this.sock.on('close' () => {
			this.connect();
		});
		messageStream.read(this.sock, (msg, index) => {
			this.emit('message', msg);
		});
	}
	bind() {

	}
	send(msg, clientId) {
		this.sendBuffer[this.index] = {
			data: messageStream.prepare(msg, this.index),
			expire: 0
		};
		this.flushBuffer();
	}
	flushBuffer() {
		var now = Date.now();
		var nexpire = now + 3000;
		Object.keys(this.sendBuffer).map(index => {
			var payload = this.sendBuffer[index];
			if (payload.expire < now) {
				payload.expire = nexpire;
			}
		});
	}
}

module.exports = Line;