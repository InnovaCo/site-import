/**
 * Модуль импортирует указанные подпроекты в заданную папку
 */
var assert = require('assert');
var path = require('path');
var async = require('async');
var utils = require('importer-utils');
var htmlImporter = require('html-importer');
var htmlRewrite = require('html-importer/lib/rewrite-url');
var htmlCleanup = require('html-importer/lib/cleanup');
var htmlEscape = require('html-importer/lib/escape');
var cssImporter = require('css-importer');
var cssRewrite = require('css-importer/lib/rewrite-url');

var globalExcludePattern = '!**/{node_modules,bower_components,.git}/**';

function defaults(src, project) {
	return {
		src: src, 
		cwd: project.cwd,
		prefix: project.prefix
	};
}

function saveFiles(files, project, callback) {
	files.forEach(function(file) {
		file.save(project.dest);
	});
	callback && callback(null);
}

/**
 * Импорт HTML-файлов проекта.
 * Сценарий импорта HTML следующий:
 * 1. Сначала перезаписываем ссылки на ресурсы в подпроекте на новые,
 * которые будут в родительском проекте
 * 2. Накладываем XSL
 * 3. В полученном документе снова переписываем ссылки: на этот раз для
 * шардирования ресурсов
 * @param  {Object}   project  Описание проекта
 * @param  {Function} callback
 */
function importHTML(project, callback) {
	var importer = htmlImporter(project.htmlOptions);

	if (project.xsl) {
		importer.stylesheet(project.xsl, project.xslParams);
	}
	importer
		.use(htmlRewrite(utils.extend({}, project, project.rewriteUrl)))
		.use(htmlCleanup())
		.use(htmlEscape())
		.run(defaults(project.html || ['**/*.html', globalExcludePattern], project), function(err, files) {
			if (err) {
				callback(err);
			} else {
				saveFiles(files, project, callback);
			}
		});
}

/**
 * Импорт CSS-файлов проекта с перезаписью ссылок
 * @param  {Object}   project  Описание проекта, который нужно импортировать
 * @param  {Function} callback
 */
function importCSS(project, callback) {
	cssImporter()
		.use(cssRewrite(utils.extend({}, project, project.rewriteUrl)))
		.run(defaults(project.css || ['**/*.css', globalExcludePattern], project), function(err, files) {
			if (err) {
				callback(err);
			} else {
				saveFiles(files, project, callback);
			}
		});
}

/**
 * Импорт всех остальных файлов проекта
 * @param  {Object} project Описание проекта, который импортируем
 * @param  {Function} callback
 */
function importFiles(project, callback) {
	async.waterfall([
		function(callback) {
			var patterns = defaults(project.files || ['**', globalExcludePattern, '!*.html'], project)
			utils.file.read(patterns, callback);
		},
		function(files, callback) {
			async.each(files, function(file, next) {
				utils.file.copy(file.origin, path.join(project.dest, file.dest), next);
			}, callback);
		}
	], callback);
}

module.exports = function(project, callback) {
	assert(project.cwd, 'Не указана папка, из которой нужно считывать файлы (project.cwd)');
	assert(project.dest, 'Не указана папка, в которую нужно сохранять результат (project.dest)');

	// Запускаем импорт в правильном порядке:
	// сначала обычные файлы, затем те, что переписываем
	async.series([
		function(callback) {
			importFiles(project, callback);
		},
		function(callback) {
			async.parallel([
				function(callback) {
					importHTML(project, callback);
				},
				function(callback) {
					importCSS(project, callback);
				}
			], callback);
		}
	], callback);
};
