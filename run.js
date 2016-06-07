var fs = require('fs');
var yaml = require('yamljs');
var net = require('net');
var tube = require('./lib/tube');
var roundRobin = require('./lib/round-robin');
var roundInt = require('./lib/round-int');

module.exports = function(role) {
	fs.readFile(role + '.yaml', 'utf-8', function(err, content) {
		run[role](yaml.parse(content)[role]);
	});
}

var run = {
	entrance(config) {
		var upstream = roundRobin([]);
		var connIndex = 0;
		var connTable = [];
		config.upstream.map(cfg => {
			cfg.ordered = true;
			tube(cfg, up => {
				upstream.push(up);
				up.on('message', msg => {
					var sock = connTable[msg.id];
					try {
						switch(msg.action) {
						case 'data':
							sock.write(msg.data);
							break;
						case 'end':
							sock.end();
							break;
						case 'close':
							sock.destroy();
							delete sock[msg.id];
							break;
						};
					} catch(e) {
						console.error(e.stack);
					}
				});
			});
		});
		var server = net.createServer({ allowHalfOpen: true }, socket => {
			var id = connIndex = roundInt.increment(connIndex, 0xffff);
			connTable[id] = socket;
			var uptube = upstream.robin();
			uptube.send({
				id: id,
				action: 'connect',
			});
			socket.on('data', data => {
				uptube.send({
					id: id,
					action: 'data',
					data: data
				});
			});
			socket.on('end', () => {
				uptube.send({
					id: id,
					action: 'end'
				});
			});
			socket.on('close', () => {
				uptube.send({
					id: id,
					action: 'close'
				});
			});
			socket.on('error', err => console.error(err.message));
		}).on('error', err => {
			console.error(err.stack);
			process.exit(1);
		});
		server.listen(config.serviceport, () => {
			address = server.address();
			console.log('opened server on %j', address);
		});
	},
	joint(config) {
		var upstream = roundRobin([]);
		var downstream = [], downTable = [];
		config.upstream.map(cfg => {
			cfg.ordered = false;
			tube(cfg, up => {
				upstream.push(up);
				up.on('message', (msg, pid, prev) => {
					var cell = downTable[msg.id];
					if (cell && downstream[cell.index]) {
						downstream[cell.index].send(msg, pid, prev);
					}
				});
			})
		});
		config.downstream.map(cfg => {
			cfg.ordered = false;
			tube(cfg, down => {
				var index = downstream.length;
				downstream.push(down);
				down.on('message', (msg, pid, prev) => {
					var cell = downTable[msg.id] = downTable[msg.id] || {};
					cell.up = cell.up || upstream.robin();
					cell.index = index;
					cell.up.send(msg, pid, prev);
				});
			});
		});
	},
	exit(config) {
		var downstream = [];
		var connTable = [];
		config.downstream.map(cfg => {
			cfg.ordered = true;
			tube(cfg, down => {
				downstream.push(down);

				down.on('message', msg => {
					var socket = connTable[msg.id];
					try {
						switch(msg.action) {
						case 'connect':
							socket = net.createConnection(config.targetport);
							connTable[msg.id] = socket;
							socket.on('data', data => {
								down.send({
									id: msg.id,
									action: 'data',
									data: data
								});
							});
							socket.on('end', () => {
								down.send({
									id: msg.id,
									action: 'end'
								});
							});
							socket.on('close', () => {
								down.send({
									id: msg.id,
									action: 'close'
								});
							});
							socket.on('error', err => console.error(err.message));
							break;
						case 'data':
							socket.write(msg.data);
							break;
						case 'end':
							socket.end();
							break;
						case 'close':
							socket.destroy();
							delete connTable[msg.id];
							break;
						};
					} catch(e) {
						console.error(e.stack);
					}
				});
			});
		});
	}
};
