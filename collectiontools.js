var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var Path = require("path");
var fs = require("fs-extra");
var Git = require("git-wrapper");
var URL = require("url");

exports.mountJobCollections = function(polyrun,workdir) {
	var def = new defer();
	var DepTree= {};
	console.log("Mount Job Collections into Working Directory.");
	

	if (!polyrun.job.tools) {
		throw new Error("No Tools Provided for Job Execution");
	}

	var toolCollections = polyrun.job.tools.map(function(colId){
		var parsedColUrl = URL.parse(colId);
		var parts= parsedColUrl.pathname.split("/")	
		var path = parts[parts.length-1];
		return {absoluteUrl: colId,id: path, basePath: "tools"}
	});

	var collectionMounts = []

	if (polyrun.job.collections){
		polyrun.job.collections.forEach(function(colId){
			var parsedColUrl = URL.parse(colId);
			var parts= parsedColUrl.pathname.split("/")	
			var path = parts[parts.length-1];
	
			collectionMounts.push({absoluteUrl: colId,id: path, basePath: "collections"});
		});
	}

	var allCollections = toolCollections.concat(collectionMounts);

	return when(mountCollections(polyrun,workdir,allCollections), function(mounted){
		console.log("Mounted: ", mounted);
		return mounted;
	});

	return def.promise;
}

var mountCollections = exports.mountCollections = function(polyrun, workdir,collections) {
	var metadata = {}
	if (collections) {
		var defs = collections.map(function(col){
			return when(mountCollection(polyrun,workdir,col.basePath,col.id), function(colMeta){
				if (!metadata[col.basePath]) { metadata[col.basePath]={}; }
				metadata[col.basePath][colMeta.name||col.id]=colMeta;
				return colMeta;
			});
		});

		return when(All(defs), function() { console.log("All Metadata: ", metadata); return metadata; });
	}else{ 
		console.log("No Collections, all metadata: ", metadata);
		return metadata; 
	}
}

var checkForLocalCollection = exports.checkForLocalCollection = function(polyrun,colId) {
	var def = new defer();
	if (!colId) {def.reject("Collection ID not passed to checkForLocalCollection"); }
	var colPath = Path.join((polyrun && polyrun.config && polyrun.config.localCollectionDirectory)?polyrun.config.localCollectionDirectory:"./", colId.split("-").join("/"));
	fs.exists(colPath, function(exists){
		def.resolve({path: colPath, exists: exists});
	});
	
	return def.promise;
}

var cloneCollection = exports.cloneCollection = function(polyrun, colUrl, dest) {
	var git = new Git();
	var cloneUrl = colUrl;
	var def = new defer();
	git.exec("clone",[cloneUrl, dest],  function(error,msg) {
		if (error) { return def.reject(error) }
		def.resolve(dest);
	});

	return def.promise;
} 

var addFilesToCommit = exports.addFilesToCommit=function(polyrun, workdir){
	var def = new defer();
	var git = new Git();
	fs.readdir(workdir, function(err, files) {
		if (err) { return def.reject(err); }
		var ignores = [".git","tools", "collections"];
		var addFiles = files.filter(function(name) {
			return !ignores.some(function(ign){
				return name.match(ign);
			});
		}).map(function(name) {
			return Path.join(workdir,name);	
		})

		console.log("Adding Files to commit: ", addFiles);
		git.exec("add",addFiles, function(err,msg) {
			if (err) { return def.reject(err); }
			def.resolve(msg);
		});
	});
	return def.promise;
}

var commitUpdates = exports.commitUpdates = function(polyrun, workdir,resultMessage) {
	var git = new Git();
	var def = new defer();
	var mdf = Path.join(workdir,"_metadata.json");
	var startCWD = process.cwd();
	process.chdir(workdir);
	when(addFilesToCommit(polyrun,workdir), function() {	
		console.log("exec commit");
		git.exec("commit",["-m 'commit'"],  function(error,msg) {
			if (error) { console.log("Error commiting completed results: ", error); return def.reject(error) }
			console.log("exec checkout master");
			git.exec("checkout",["master"],function(checkoutError,res){
				if (checkoutError){
					console.log("Error Checking out master branch: ", checkoutError);
					return def.reject(checkoutError);
				}
				console.log("merge polyrun");
				git.exec("merge",["polyrun"], function(mergeErr,msg){
					if (mergeErr) {
						console.log("Merging error: ", mergeErr);
						return def.reject(mergeErr); 
					}
					console.log("push origin");
					git.exec("push",["origin"], function(pushErr,msg){
						if (pushErr) { return def.reject(pushErr); }
						process.chdir(startCWD);
						def.resolve(true);
					});
				});
			});
		});
	});

	return def.promise;
}

var readCollectionMetadata = exports.readCollectionMetadata = function(path) {
	var def = new defer();
	console.log("Reading Collection Metadata from : ", path);
	fs.readJson(Path.join(path, "_metadata.json"),function(err,data){
		console.log("Collection Meta: ", err, data);
		if (err) return def.reject(err); 
		def.resolve(data);
	});
	return def.promise;
}

var mountCollection = exports.mountCollection = function(polyrun, workdir,basePath,id) {
	var collectionPath = Path.join(workdir,basePath,id);
	console.log("Mounting Collection: ", id, collectionPath);
	var def = new defer();
	var dependencies = {};
	when(checkForLocalCollection(polyrun, id), function(checkResults){
		var destDef = new defer();
		if (checkResults.exists){
			fs.mkdirs(collectionPath, function(dirCreationError){
				if (dirCreationError) { return destDef.reject(dirCreationError); }
				fs.exists(collectionPath, function(exists) {	
					if (exists) {
						fs.exists(Path.join(collectionPath,".git"), function(exists) {
							if (exists) { return destDef.resolve(collectionPath); }
							when(cloneCollection(polyrun,checkResults.path,collectionPath),function(collectionPath){
								destDef.resolve(collectionPath);
							});
						});
					}else{
						when(cloneCollection(polyrun,checkResults.path,collectionPath),function(collectionPath){
							destDef.resolve(collectionPath);
						});
					}
				});
				
			});
		}else{
			def.reject("Clone Collection Not Implemented");
		}

		var metaDef = new defer();
		when(destDef, function(collectionPath){
			console.log("Reading Collection Metadata from " + collectionPath);
			when(readCollectionMetadata(collectionPath), function(colMeta){
				console.log("colMeta: ", colMeta);
				if (colMeta && colMeta.name) {
					var alias = Path.join(workdir,basePath,colMeta.name);
					fs.exists(alias, function(exists){
						if (exists) { 
							console.log("Alias '" + alias + "' already exists for cloned collection at " + collectionPath + ". Skipping alias creation."); 
							metaDef.resolve(colMeta);	
						}else{
							fs.symlink(collectionPath,alias, function(err){
								if (err) { console.warn("Error creating Alias '" + alias + "' for cloned collection at " + collectionPath, err); }
								metaDef.resolve(colMeta);
							});
						}
					});
				}else{
					metaDef.resolve(colMeta);
				}
			});
		});
	
		when(metaDef, function(colMeta){
			def.resolve(colMeta);
		});
		
	});
	return def.promise;
}

var readCollectionMeta = exports.readCollectionMeta = function(colPath){
	var def = new defer()
	var metadataFile = Path.join(colPath,"_metadata.json");
	fs.readJson(metadataFile,function(err,colMeta){
		if (err) { return def.reject(err); }	
		def.resolve(colMeta);
	});
	return def.promise;
}

var mountDependencies = exports.mountDependencies = function(polyrun,workdir,mounted){
	var defer = new defer();
	
	return def.promise;
}

var createNewCollection = exports.createNewCollection = function(polyrun){
	var def = new defer();
	def.reject("Generate New Collection Not Implemented");
	return def.promise;
}
