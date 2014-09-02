var fs = require('graceful-fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var crc = require('crc');
var async = require('async');
var utils = require('importer-utils');
var locator = require('./lib/locator');
var importer = require('./lib/importer');

var defaults = {
	rewriteScheme: null,
	transform: function(url, info) {
		if (this.rewriteScheme && info.actual) {
			try {
				var stat = fs.statSync(info.actual);
				if (stat.isFile()) {
					url = this.rewriteScheme({
						version: getFileHash(info.actual),
						url: url
					});
				}
			} catch (e) {
				// console.error(e);
			}
		}

		return url;
	}
};

var hashLookup = {};

function getFileHash(file) {
	if (!hashLookup[file]) {
		hashLookup[file] = crc.crc32(fs.readFileSync(file));
	}

	return hashLookup[file];
}

module.exports = utils.extend(new EventEmitter(), {
	/**
	 * Задаёт или возвращает базовые настройки для всех проектов
	 * @param  {Object} value Новые базовые настройки
	 * @return {Object}
	 */
	defaults: function(value, overwrite) {
		if (value) {
			defaults = overwrite ? value : utils.extend({}, defaults, value);
		}

		return defaults;
	},

	/**
	 * Ищет проекты для импорта в указанной папке
	 */
	locate: locator,

	/**
	 * Импортирует указанный проект
	 * @param  {Object}   project  Конфиг проекта
	 * @param  {Function} callback
	 */
	importProject: function(project, callback) {
		// prepare project config
		var config = utils.extend({}, defaults, project);
		this.emit('import', config);
		importer(config, callback);
	},

	/**
	 * Поиск и импорт всех проектов в указанной папке
	 * @param  {String}   folder   Папка, в которой нужно искать проекты
	 * @param  {Object}   config   Конфиг экспорта:
	 * - dest: путь к рабочей папке, куда сохранять результат
	 * - project_name*: дополнительные конфиги для отдельных проектов
	 * Ключём проекта является имя папки проекта (подразумевается, что эта папка —
	 * отдельный пакет, поэтому все папки будут уникальными)
	 * @param  {Function} callback
	 */
	importFrom: function(folder, config, callback) {
		if (typeof configs === 'function') {
			callback = config;
			config = {};
		}

		config = config || {};

		var self = this;
		async.waterfall([
			function(callback) {
				self.locate(folder, callback);
			},
			function(projects, callback) {
				async.eachSeries(projects, function(project, callback) {
					var localConfig = utils.extend({}, config, {
						cwd: project.root,
						dest: config.dest,
						prefix: project.prefix
					}, config[project.name]);
					self.importProject(localConfig, callback);
				}, callback);
			}
		], callback);
	},

	resetCache: function() {
		hashLookup = {};
	}
});