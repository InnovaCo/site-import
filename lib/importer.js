/**
 * Модуль импортирует указанные подпроекты в заданную папку
 */
var assert = require('assert');
var path = require('path');
var async = require('async');
var glob = require('glob-all');
var utils = require('importer-utils');
var htmlImporter = require('html-importer');
var htmlRewrite = require('html-importer/lib/rewrite-url');
var htmlCleanup = require('html-importer/lib/cleanup');
var htmlEscape = require('html-importer/lib/escape');
var cssImporter = require('css-importer');
var cssRewrite = require('css-importer/lib/rewrite-url');

function defaults(src, project) {
	return {
		src: src, 
		cwd: project.root
	};
}

/**
 * Возвращает абсолютный путь файла в папке импорта
 * @param  {Object} project Проект, который импортируем
 * @param  {String} file    Путь к исходному файлу
 * @return {String}
 */
function getTargetPath(project, file) {
	if (typeof file === 'object') {
		if (typeof file.dest === 'function') {
			return file.dest(project);
		}

		file = file.file;
	}

	return path.join(project.dest, file);
}

function saveFiles(files, project, callback) {
	async.each(files, function(fileObj, callback) {
		utils.file.save(getTargetPath(project, fileObj), fileObj.content, callback);
	}, callback);
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
	var importer = htmlImporter(utils.extend({prefix: project.project}, project.htmlOptions));

	if (project.xsl) {
		importer.stylesheet(project.xsl, project.xslParams);
	}
	importer
		.use(htmlRewrite(utils.extend({}, project, project.rewriteUrl)))
		.use(htmlCleanup())
		.use(htmlEscape())
		.run(defaults(project.html || ['**/*.html', '!**/{node_modules,git}/**'], project), function(err, files) {
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
		.run(defaults(project.css || ['**/*.css', '!**/{node_modules,git}/**'], project), function(err, files) {
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
			var obj = utils.file.normalize(defaults(project.files || ['**/*.*', '!**/{node_modules,git}/**', '!**/*.html'], project));
			glob(obj.files, obj.options, callback);
		},
		function(files, callback) {
			async.each(files, function(file, next) {
				utils.file.copy(path.join(project.root, file), path.join(project.dest, file), next);
			}, callback);
		}
	], callback);
}

module.exports = function(project, callback) {
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