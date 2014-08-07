/**
 * Задача для Grunt по импорту проектов из указанной папки
 * Структура задачи:
 * {
 * 	task_name: {
 * 		// глобальные опции для импорта проектов в папке
 * 		src: 'path/to/web/root',
 * 		dest: 'path/to/dest',
 *
 * 		// опции, которые можно перекрыть в проектах
 * 		xsl: 'path/to/stylesheet.xsl',
 * 		html: 'html/*.mask',
 * 		css: 'css/*.mask',
 * 		files: 'files/*.mask',
 * 		rewriteScheme: function(data) {
 * 			...
 * 		},
 * 		// опции для html-import
 * 		htmlOptions: {
 * 			...
 * 		},
 * 		options: {
 * 			project_name: {
 * 				xsl: 'path/to/stylesheet.xsl',
 * 		  		html: 'html/*.mask',
 * 		    	css: 'css/*.mask'
 * 			}
 * 		}
 * 	}
 * }
 */
module.exports = function(grunt) {
	var path = require('path');
	var async = require('async');
	var utils = require('importer-utils');
	var htmlImporter = require('html-importer');
	var htmlRewrite = require('html-importer/lib/rewrite-url');
	var importer = require('../');

	function extractDefaultConfig(config) {
		var result = utils.extend({}, config);
		result.out = config.dest;
		['src', 'dest', 'options'].forEach(function(key) {
			if (key in result) {
				delete result[key];
			}
		});
		return result;
	}

	function saveFiles(files, dest, callback) {
		async.each(files, function(fileObj, callback) {
			utils.file.save(path.join(dest, fileObj.file), fileObj.content, callback);
		}, callback);
	}

	function normalizeFileSet(files, dest) {
		var fileSet = [];
		var fileSetLookup = {};

		files.forEach(function(f) {
			var key = f.orig.cwd + ':' + (f.orig.dest || dest);
			var fset = fileSetLookup[key];
			if (!fset) {
				fset = {
					src: [],
					dest: f.orig.dest || dest
				};
				if (f.orig.cwd) {
					fset.cwd = f.orig.cwd;
				}

				fileSet.push(fset);
				fileSetLookup[key] = fset;
			}

			if (Array.isArray(f.src)) {
				fset.src = fset.src.concat(f.src);
			} else {
				fset.src.push(f.src);
			}
		});

		// normalize file paths: cut out cwd
		fileSet.forEach(function(fset) {
			if (fset.cwd) {
				var absCwd = path.resolve(fset.cwd);
				fset.src = fset.src.map(function(f) {
					return path.relative(absCwd, path.resolve(f));
				});
			}
		});

		return fileSet;
	}

	importer.on('import', function(project) {
		grunt.log.writeln('Importing ', project.prefix.green, ' to ', project.dest.yellow);
	});

	grunt.registerMultiTask('site-import', 'Импорт статических сайтов в указанную папку', function() {
		this.requiresConfig('site-import');
		var config = this.data;
		
		// проверим, чтобы все данные были на месте
		if (!config.src) {
			return grunt.fatal('Не указан параметр "src"');
		}
		if (!config.dest) {
			return grunt.fatal('Не указан параметр "dest"');
		}

		var oldDefaults = importer.defaults();
		importer.defaults(extractDefaultConfig(config));

		var done = this.async();
		importer.importFrom(config.src, this.options(), function(err) {
			importer.defaults(oldDefaults, true);
			if (err) {
				grunt.fatal(err);
				done(false);
			}

			done();
		});
	});

	grunt.registerMultiTask('html-import', 'Импорт HTML-файлов в указанную папку', function() {
		var fileSet = normalizeFileSet(this.files, this.data.dest);
		var options = this.options();
		
		var importer = htmlImporter(options);

		if (options.rewriteUrl) {
			importer.use(htmlRewrite(rewriteUrl));
		}

		if (options.xsl) {
			importer.stylesheet(options.xsl, options.xslParams);
		}

		var done = this.async();
		async.forEach(fileSet, function(fset, callback) {
			if (!fset.dest) {
				return callback(new Error('Unable to save files: "dest" is undefined'));
			}

			async.waterfall([
				function(callback) {
					importer.run(fset, callback);
				},
				function(files, callback) {
					saveFiles(files, fset.dest, callback);
				}
			], callback);
		}, function(err) {
			if (err) {
				grunt.fatal(err);
				done(false);
			} else {
				done();
			}
		});
	});
};