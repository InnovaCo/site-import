/**
 * Модуль находит в указанной папке проекты, которые нужно импортировать, 
 * и возвращает их в виде списка конфигов для модуля `html-importer`.
 *
 * Импортируемыми проектами являются симлинки на папки
 */
var fs = require('graceful-fs');
var path = require('path');
var finder = require('findit')
var async = require('async');
var glob = require('importer-utils').file.glob;

var packageLookupCache = {};

function compact(arr) {
	return arr.filter(function(item) {
		return !!item;
	});
}

function filterLinks(links, callback) {
	var filtered = [];
	async.map(links, function(cur, next) {
		var real;
		async.waterfall([
			function(callback) {
				fs.realpath(cur, callback);
			},
			function(realPath, callback) {
				fs.stat(real = realPath, callback);
			},
			
		], function(err, stat) {
			if (err) {
				return next(err);
			}

			if (stat.isDirectory()) {
				findPackage(real, function(project) {
					next(null, {
						path: cur,
						real: real,
						project: project
					});
				});
			} else {
				next(null);
			}
		});
	}, function(err, links) {
		callback(err, links ? compact(links) : null);
	});
}

function findPackage(folder, callback) {
	var lookupPaths = [];
	var prev = null;
	while (folder && prev !== folder) {
		lookupPaths.push(folder);
		prev = folder;
		folder = path.dirname(folder);
	}

	// console.log('lookup', lookupPaths);

	var next = function() {
		if (!lookupPaths.length) {
			return callback();
		}

		var folder = lookupPaths.shift();

		if (folder in packageLookupCache) {
			var cached = packageLookupCache[folder];
			if (cached) {
				callback(cached);
			} else {
				next();
			}
			return;
		}

		glob('{.bower,bower,package}.json', {cwd: folder}, function(err, files) {
			if (err || !files || !files.length) {
				packageLookupCache[folder] = null;
				return next();
			}

			fs.readFile(path.join(folder, files[0]), 'utf8', function(err, content) {
				if (err) {
					packageLookupCache[folder] = null;
					return next();
				}

				callback(packageLookupCache[folder] = JSON.parse(content).name);
			});
		});
	};

	next();
}

function convertToConfig(basedir, links) {
	basedir = path.resolve(basedir);
	return links.map(function(link) {
		var prefix = path.resolve(link.path);
		if (prefix.substr(0, basedir.length) === basedir) {
			prefix = prefix.substr(basedir.length);
		}

		prefix = path.normalize(prefix);
		if (prefix[0] !== '/') {
			prefix = '/' + prefix;
		}

		return {
			root: link.real,
			name: link.project || path.basename(link.real),
			prefix: prefix
		}
	});
}

module.exports = function(basedir, callback) {
	var out = [];
	finder(basedir)
		.on('link', function(link, stat) {
			out.push(link);
		})
		.on('end', function() {
			packageLookupCache = {};
			filterLinks(out, function(err, links) {
				callback(err, links && convertToConfig(basedir, links));
			});
		});
};