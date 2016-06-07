var roles = ['entrance', 'joint', 'exit'];

var argv = require('yargs')
	.usage('Usage: $0 <command> -r <role>')
	.command('init', 'Setup configuration file for designated role')
	.command('run', 'Start up service for designated role')

	.nargs('r', 1)
	.alias('r', 'role')
	.describe('r', [
		'role to run command against, separate multiple roles with ","',
		'possible values are ' + roles.join(', '),
	].join('\n'))

	.help('h')
	.alias('h', 'help')
	.argv;

if (!argv._[0]) {
	console.log('Must provide command, run with -h for more information');
	process.exit(1);
}
if (['init', 'run'].indexOf(argv._[0]) == -1) {
	console.log('Invalid command, run with -h for more information');
	process.exit(1);
}
if (!argv.r) {
	console.log('Must provide role, run with -h for more information');
	process.exit(1);
}

var fs = require('fs');
var path = require('path');
var os = require('os');

var wdir = path.join(os.homedir(), '.fan-tunnel');

fs.mkdir(wdir, function(err) {
	process.chdir(wdir);
	var cmd = require('./' + argv._[0]);
	argv.r.split(',').map(function(role) {
		role = role.trim();
		if (roles.indexOf(role) == -1) {
			console.log(role + ' is not a valid role');
			process.exit(1);
		}
		return role;
	}).map(function(role) {
		cmd(role);
	});
});