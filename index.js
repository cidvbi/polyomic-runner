#!/usr/bin/env node
var argv = require("optimist");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var fs = require('fs-extra');
var request = require('request');
var setupWorkingDirectory = require("./workingdirectory").setup;
var setupExisting = require("./workingdirectory").setupExisting;
var mountCollections= require("./collectiontools").mountCollections;
var mountJobCollections= require("./collectiontools").mountJobCollections;
var commitUpdates = require("./collectiontools").commitUpdates;
var setupTools = require("./tools").setup;
var cleanupJob = require("./job").cleanupJob;
var updateJobState = require("./job").updateJobState;
var timer = require("./timer").timer;
var Path = require("path");
var pkgJson = require("./package.json");
var pkg = fs.readJsonSync(Path.join(__dirname,"package.json"));

var argv = require("optimist")
	.usage('Polyomic Runner ' + pkg.version + "\n\n$0")
	.demand("c")
	.alias("c","config")
	.default("c", "/etc/polyrun.conf")
	.describe("c", "Path to Polyrun Config")
	.alias("j","job")
	.describe("j", "Polyomic Job URL")
	.alias("f","file")
	.describe("f", "Polyomic Job JSON File")
	.describe("C","Skip Cleanup of Working Dir on Job Completion")
	.alias("C", "nocleanup")
	.alias("W","noCloneWorkDir")
	.describe("W", "Assume CWD is already a clone of the Working Directory Collection")
	.alias("-B","noBranching")
	.describe("B","Don't branch the working collection before starting a job or merge when complete")
	.alias("v","version")
	.describe("v", "Show version information")
	.check(function(a){
		if (!a.file && !a.job){ throw "ERROR: Missing Job id (-j) or Job JSON file (-f)\n" }
	})
	.argv;


	if (!fs.existsSync(argv.config)) { throw "Config File does not exist at: " + argv.config + "."; return; }
	var startPath = process.cwd();
	var polyrun = {
		platform: process.platform,
		arch: process.arch,
		env: process.env
	}
	if (argv.version){
		console.log("polyrun version:", pkgJson.version);
		process.exit(0);
	}

	var configDef= new defer();
	console.log("Reading config file: ", argv.config);
	fs.readJson(argv.config, function(err, config){
		if (err) { configDef.reject(err); }
		polyrun.config = config;
		configDef.resolve(config);		
	});

	if (argv.noBranching){
		polyrun.noBranching = true;
	}


	var jobDef = new defer();
	if (argv.file) {
		console.log("Reading JOB file: ", argv.file);
		fs.readJson(argv.file, function(err, job){
			if (err) { jobDef.reject("JSON READ Error: "+ err); return; }
			polyrun.job = job;
			jobDef.resolve(job);
		});
	}else {
		request.get({
			url: argv.job,
			headers: {accept: "application/json"}
		}, function(err, job) { 
			if (err) { jobDef.reject(err);return; }
			polyrun.job = job;
			jobDef.resolve(job);
		});
	}	


	var setupWorkDir = function(polyrun){
		if (argv.noCloneWorkDir){
			return setupExisting(polyrun,startPath);
		}else{
			return setupWorkingDirectory(polyrun);
		}
	}

	var setupAndRun = function(){
		return when(setupWorkDir(polyrun), function(workdir){
			return when(mountJobCollections(polyrun, workdir), function(metadata){
				polyrun._collectionMeta = metadata;
				return when(setupTools(polyrun, workdir), function(executor){
					//console.log("Run Config: ", polyrun);
					return when(timer(executor), function(timerResults) {
						console.log("Execution Timer: ", new Date(timerResults.start), new Date(timerResults.end), (timerResults.duration/1000) + " seconds");
						resultMessage=timerResults.result;
						return when(commitUpdates(polyrun,workdir,resultMessage), function(commitSuccess){
							return when(updateJobState(polyrun,resultMessage,commitSuccess), function(){
								if (!argv.nocleanup) {
									return when(cleanupJob(polyrun, workdir),function(){
										process.chdir(startPath);
										console.log("Polyrun Job Complete");
									});
								}else {
									process.chdir(startPath);
									console.log("Polyrun Job Complete (skip cleanup workspace)");	
								}
							});
						});
					});
				});
			});
		});	
	}

	
	when(All([configDef,jobDef]), function(){
		return when(timer(setupAndRun), function(timerRes){
			console.log("Job Timer (setup and execute) Start: " + new Date(timerRes.start) + " End: " + new Date(timerRes.end) + " Duration: " + (timerRes.duration/1000) + " seconds"); 
			process.exit(0);
		});	
	});


