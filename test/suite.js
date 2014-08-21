var fs = require('fs');
var path = require('path');
var assert = require('assert');
var glob = require('glob-all');
var crc = require('crc').crc32;
var del = require('del');
var importer = require('../');

function normalize(text) {
	return text.split(/\r?\n/)
		.map(function(line) {
			return line.trim()
		})
		.join('\n');
}

function compare(folder1, folder2) {
	var list1 = glob.sync('**/*.*', {cwd: folder1}).sort();
	var list2 = glob.sync('**/*.*', {cwd: folder2}).sort();

	assert.deepEqual(list1, list2, 'Comparing contents:\n' + folder1 + '\n' + list1.join('\n') + '\n   and\n\n' + folder2 + '\n' + list2.join('\n'));

	// compare file contents
	list1.forEach(function(f) {
		var content1 = fs.readFileSync(path.join(folder1, f), 'utf8');
		var content2 = fs.readFileSync(path.join(folder2, f), 'utf8');
		var hash1 = crc(normalize(content1));
		var hash2 = crc(normalize(content2));

		assert.equal(hash1, hash2, 'Comparing ' + f + ':\n\n' + content1 + '\n----------\n' + content2);
	});
}

function p(dst) {
	return path.join(__dirname, dst);
}

describe('Project importer', function() {
	before(function() {
		del.sync(['out{1,2}/**/*.*'], {cwd: __dirname});
	});

	it('simple projects', function(done) {
		importer.defaults({
			out: p('out1')
		});

		importer.importFrom(p('in'), function(err) {
			assert(!err);
			compare(p('out1/p1'), p('fixtures/out1/p1'));
			compare(p('out1/p2'), p('fixtures/out1/p2'));
			done();
		});
	});

	it('projects with resource versioning', function(done) {
		importer.defaults({
			out: p('out2'),
			rewriteScheme: function(data) {
				return '/-/' + data.version + data.url;
			}
		});

		importer.importFrom(p('in'), function(err) {
			assert(!err);
			compare(p('out2/p1'), p('fixtures/out2/p1'));
			compare(p('out2/p2'), p('fixtures/out2/p2'));
			done();
		});
	});

	it('Grunt task result', function() {
		// test generated data from Grunt task that 
		// must be performed *before* test suite
		compare(p('out-grunt/p1'), p('fixtures/out2/p1'));
		compare(p('out-grunt/p2'), p('fixtures/out2/p2'));

		compare(p('out-html'), p('fixtures/html'));
		compare(p('out-import1'), p('fixtures/html/p1'));
		compare(p('out-import2'), p('fixtures/html/p2'));

		// direct project import
		compare(p('out3'), p('fixtures/out3'));
	});
});