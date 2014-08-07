var fs = require('fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var crc = require('crc');
var async = require('async');
var utils = require('importer-utils');
var locator = require('./lib/locator');
var importer = require('./lib/importer');

var defaults = {
	xsl: {src: 'main.xsl', cwd: path.join(__dirname, 'xsl')},
	out: './out',
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
		if (!config.dest) {
			config.dest = path.join(config.out, config.prefix);
		}

		this.emit('import', config);
		importer(config, callback);
	},

	/**
	 * Поиск и импорт всех проектов в указанной папке
	 * @param  {String}   folder   Папка, в которой нужно искать проекты
	 * @param  {Object}   configs  Дополнительные конфиги для отдельных проектов.
	 * Ключём проекта является имя папки проекта (подразумевается, что эта папка —
	 * отдельный пакет, поэтому все папки будут уникальными)
	 * @param  {Function} callback
	 */
	importFrom: function(folder, configs, callback) {
		if (typeof configs === 'function') {
			callback = configs;
			configs = {};
		}

		configs = configs || {};

		var self = this;
		async.waterfall([
			function(callback) {
				self.locate(folder, callback);
			},
			function(projects, callback) {
				async.eachSeries(projects, function(project, callback) {
					self.importProject(utils.extend({}, project, configs[project.name] || configs[project.project]), callback);
				}, callback);
			}
		], callback);
	},

	resetCache: function() {
		hashLookup = {};
	}
});