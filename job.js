var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var Path = require("path");
var fs = require("fs-extra");

var cleanupJob = exports.cleanupJob = function(polyrun,workdir) {
	var def = new defer();
	console.log("Job Cleanup");
	fs.remove(workdir, function(err) {
		if (err) { return def.reject("Unable to Cleanup Job: " + err);  }
		def.resolve(true);
	});
	//def.resolve(true);
	return def.promise;
}

var updateJobState = exports.updateJobState= function(polyrun,workdir) {
	var def = new defer();
	console.log("Update Job State");
	def.resolve(true);
	return def.promise;
}
