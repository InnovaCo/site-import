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

	function createRewriteConfig(project) {
		var destBaseDir = path.resolve(project.destRoot || project.dest);
		var destDir = path.resolve(project.dest);
		return {
			root: path.resolve(project.srcRoot || project.src),
			prefix: '/' + path.relative(destBaseDir, destDir)
		};
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

	var setupLogger = (function() {
		var attached = false;
		return function() {
			if (attached) {
				return;
			}

			importer.on('import', function(project) {
				grunt.log.writeln('Importing ', project.prefix.green, ' to ', project.dest.yellow);
			});
			attached = true;
		};
	})();

	/**
	 * Импорт сайта в указанную папку.
	 * Находит все симлинки на подсайты внутри `src` и использует 
	 * эту информацию для переноса сайта в папку `dest` с последущей перезаписью 
	 * ссылок на файлы (CSS, JS и т.д.)
	 */
	grunt.registerMultiTask('site-import', 'Импорт статических сайтов в указанную папку', function() {
		var config = this.data;
		
		// проверим, чтобы все данные были на месте
		if (!config.src) {
			return grunt.fatal('Не указан параметр "src"');
		}
		if (!config.dest) {
			return grunt.fatal('Не указан параметр "dest"');
		}

		var done = this.async();
		setupLogger();
		importer.importFrom(path.resolve(config.src), utils.extend({}, config, this.options()), function(err) {
			if (err) {
				grunt.fatal(err);
				done(false);
			}

			done();
		});
	});

	/**
	 * Импорт проекта в указанную папку.
	 * Является «облегчённой» версией задачи `site-import`: в отличие от неё
	 * поиск симлинков не осуществляется, а просто копирюется файлы из
	 * папки `src` в папку `dest` с перезаписью ресурсов и опциональным наложением 
	 * XSL-шаблона.
	 *
	 * Так как из-за отсутствия симлинков будет отсутствовать информация, 
	 * необходимая для корректного импорта, эта задача принимает дополнительные
	 * параметры:
	 * - srcRoot: путь к корню импортируемого проекта. Если указан, все абсолютные
	 *   ссылки внутри документов будут высчитаны относительно этой папки. Если не указан,
	 *   корнем считается путь в параметре `src`
	 * - destRoot: путь к корню основного, в который импортируется подпроект. 
	 *   Используется для получения префикса перезаписанных ссылок (то есть используется
	 *   в формировании конечной ссылки на ресурс). Если не указан, берётся значение `dest`
	 */
	grunt.registerMultiTask('project-import', 'Импорт проекта в указанную папку', function() {
		var config = this.data;
		
		// проверим, чтобы все данные были на месте
		if (!config.src) {
			return grunt.fatal('Не указан параметр "src"');
		}
		if (!config.dest) {
			return grunt.fatal('Не указан параметр "dest"');
		}

		config.cwd = path.resolve(config.src);

		// подготовим конфиг для импорта проекта
		// var rewriteConfig = createRewriteConfig(config);
		// utils.extend(config, rewriteConfig);

		var done = this.async();
		importer.importProject(utils.extend({}, config, this.options()), function(err) {
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
					files.forEach(function(file) {
						file.save(fset.dest);
					});
					callback();
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