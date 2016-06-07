var EventEmitter = require('events').EventEmitter;
var shortid = require('shortid');
var LimitedSet = require('./limited-set');
var strongSock = require('./strong-sock');
var roundRobin = require('./round-robin');
var codec = require('./codec');

module.exports = function(config, cb) {
	if (config.type == 'connect') {
		cb(new ConnectTube(config));
	} else {
		var server = new BindTube(config);
		server.on('client', client => cb(client));
	}
};

class ConnectTube extends EventEmitter {
	constructor(config) {
		super();

		this.uid = shortid.generate();
		this.ordered = !!config.ordered;
		if (this.ordered) {
			this.collector = new PackCollector(this);
		}

		this.sock = roundRobin([]);
		for (var i = 0; i < 30; i++) {
			var sock = strongSock.connect(config.port, config.addr);
			sock.on('data', this.onData.bind(this));
			sock.write(codec.encode({ action: 'hi', uid: this.uid }));
			this.sock.push(sock);
		}
	}
	onData(data) {
		data = codec.parse(data);
		if (this.ordered) {
			this.collector.push(data);
		} else {
			this.emit('message', data.payload, data.pid, data.prev);
		}
	}
	send(data, pid, prev) {
		data = {
			action: 'data',
			payload: data,
			pid: pid || shortid.generate(),
			prev: prev,
		};
		if (this.ordered) {
			data.prev = this.prevPid || '@';
			this.prevPid = data.pid;
		}
		data = codec.encode(data);
		this.sock.robin().write(data);
	}
}

class BindTube extends EventEmitter {
	constructor(config) {
		super();

		this.ordered = !!config.ordered;
		this.peer2client = {};
		this.client2peer = {};

		this.clients = {};

		var sock = this.sock = strongSock.bind(config.port, config.addr);
		sock.on('data', this.onData.bind(this));
	}
	onData(data, from) {
		data = codec.parse(data);
		if (data.action == 'hi') {
			this.peer2client[from] = data.uid;
			var client = this.clients[data.uid];
			if (!client) {
				this.client2peer[data.uid] = roundRobin([]);
				client = new ClientTube(this);
				this.clients[data.uid] = client;
				this.emit('client', client);
			}
			this.client2peer[data.uid].push(from);
			client.setUID(data.uid);
		} else {
			var client = this.clients[this.peer2client[from]];
			if (client) {
				client.onData(data);
			}
		}
	}
	writeTo(uid, data) {
		if (this.client2peer[uid]) {
			this.sock.writeTo(this.client2peer[uid].robin(), data);
		}
	}
}

class ClientTube extends EventEmitter {
	constructor(bindTube) {
		super();
		this.parent = bindTube;
		if (bindTube.ordered) {
			this.collector = new PackCollector(this);
		}
	}
	setUID(uid) {
		this.uid = uid;
	}
	onData(data) {
		if (this.parent.ordered) {
			this.collector.push(data);
		} else {
			this.emit('message', data.payload, data.pid, data.prev);
		}
	}
	send(data, pid, prev) {
		data = {
			action: 'data',
			payload: data,
			pid: pid || shortid.generate(),
			prev: prev,
		};
		if (this.parent.ordered) {
			data.prev = this.prevPid || '@';
			this.prevPid = data.pid;
		}
		data = codec.encode(data);
		this.parent.writeTo(this.uid, data);
	}
}

class PackCollector {
	constructor(parent) {
		this.parent = parent;
		this.buffer = {};
	}
	push(pack) {
		if (pack.prev == '@' || pack.prev == this.waiting) {
			this.drain(pack);
		} else {
			this.buffer[pack.prev] = pack;
		}
	}
	drain(pack) {
		while (pack) {
			this.parent.emit('message', pack.payload, pack.pid, pack.prev);
			var next = this.buffer[pack.pid];
			if (next) {
				delete this.buffer[pack.pid];
			} else {
				this.waiting = pack.pid;
			}
			pack = next;
		}
	}
}
