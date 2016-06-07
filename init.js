var fs = require('fs');
var path = require('path');

module.exports = function(role) {
	var read = fs.createReadStream(path.join(__dirname, 'res', role + '.yaml'));
	var write = fs.createWriteStream(role + '.yaml');
	read.pipe(write);
	console.log('writen ' + path.join(process.cwd(), role + '.yaml'));
};
