var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var checkForLocalCollection = require("./collectiontools").checkForLocalCollection;
var cloneCollection = require("./collectiontools").cloneCollection;
var Path = require('path');
var URL = require("url");
var fs = require("fs-extra");
var Git = require("git-wrapper");

var git = new Git();

exports.setup = function(polyrun) {
	var def = new defer();
	var basePath = polyrun.config.workingDir;
	var workingCollectionURL = polyrun.job.workingCollection;

	if (!workingCollectionURL) {
		return def.reject(new Error("Job Config does not contain a 'workingCollection'"));
	}		

	var parsedColUrl = URL.parse(workingCollectionURL);
	var parts= parsedColUrl.pathname.split("/")	
	var colId = parts[parts.length-1];

	var dest =  Path.join(basePath,colId);
	console.log("Preparing ", colId);
	console.log("Cloning Working Collection (" + workingCollectionURL + ") into " + dest);
	when(checkForLocalCollection(polyrun,colId), function(checkRes){
		if (checkRes.exists) {
			fs.exists(Path.join(dest,".git"), function(exists) {
				if (exists) {
					console.log("Working Repo Already Exists...skipping clone TODO:Update Behavior Here"); 
					def.resolve(dest);
				}else {		
					when(cloneCollection(polyrun, checkRes.path, dest), function(meta){
						console.log("Working Directory Ready: ", Path.join(basePath,colId));
						process.chdir(Path.join(basePath,colId));
						git.exec("branch", ["polyrun"], function(branchError,msg){
							if (branchError) { return def.reject(branchError); }
							git.exec("checkout",["polyrun"], function(checkoutError, msg) {
								if (checkoutError) { return def.reject(checkoutError); }
								def.resolve(dest);
							});
						});
					});			
				}
			});
		}else{	
			console.log("Local Clone doesn't exist...do a bare clone into our local 'remote' repo dir here");
			return def.reject("Local Clone of Remote Repo Not Implemented");

			return when(cloneCollection(polyrun, workingCollectionURL, dest), function(meta){
				console.log("Working Directory Ready: ", Path.join(basePath,colId));
				git.exec("branch", ["polyrun"], function(branchError,msg){
					if (branchError) { return def.reject(branchError); }
					git.exec("checkout",["polyrun"], function(checkoutError, msg) {
						if (checkoutError) { return def.reject(checkoutError); }
						def.resolve(dest);
					});
				});
			});
		}
			
	});

	return def.promise;
}

var setupExisting = exports.setupExisting = function(polyrun, workingDirectory){
	var def = new defer();
	fs.exists(Path.join(workingDirectory), function(exists) {
		if (exists) {
			console.log("Working Directory Ready: ", workingDirectory);
			process.chdir(workingDirectory);
			git.exec("branch", ["polyrun"], function(branchError,msg){
				if (branchError) { return def.reject(branchError); }
				git.exec("checkout",["polyrun"], function(checkoutError, msg) {
					if (checkoutError) { return def.reject(checkoutError); }
					def.resolve(dest);
				});
			});
		}else{
			console.log("Expected pre-existing working directory clone, but it wasn't found");
		}
	});
	return def.promise;
}
