var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var All = require("promised-io/promise").all;
var fs = require('fs-extra');
var Path = require('path');
var ejs = require("ejs");
var spawn = require('child_process').spawn;

var baseTemplateDir = Path.join(__dirname,"templates");

var setup = exports.setup = function(polyrun,workdir) {
	console.log("Setting up tools...");
	var def = new defer();

	return when(generateTemplates(polyrun,workdir), function(){
		return generateExecutor(polyrun,workdir)
	});
}

var generateTemplates = exports.generateTemplates = function(polyrun,workdir){
	var defs = []
	Object.keys(polyrun._collectionMeta.tools).map(function(key){
		var toolConf = polyrun._collectionMeta.tools[key];
		console.log("Generating Templates for Tool '" + key + "'");
		if (toolConf.toolTemplates) {
			toolConf.toolTemplates.forEach(function(t){
				defs.push(generateTemplate(polyrun,Path.join(workdir,"tools",key) ,t))
			});			
		}	
	});
	
	return All(defs);
}

var getTemplateLocation = exports.getTemplateLocation = function(polyrun,workdir,templateFile,nosearch){
	var def = new defer();
	var wf = Path.join(workdir,templateFile);
	fs.exists(wf, function(exists) {
		if (exists) { return def.resolve(wf); }
		if (nosearch) {return def.resolve(null); }
		
		var rf = Path.join(baseTemplateDir,templateFile);
		fs.exists(rf, function(rootExists) {
			if (exists) {return def.resolve(rf); }
			return def.resolve(null);
		})
	});
	return def.promise;
}

var generateTemplate = exports.generateTemplate=function(polyrun,workdir,tempDef){
	var def = new defer();
	when(getTemplateLocation(polyrun,workdir,tempDef.path), function(tpath) {
		if (!tpath) { def.reject(null); return;}
		ejs.renderFile(tpath,polyrun, function(renderError, output){
			if (renderError) { return def.reject(renderError); }
			var outfile;
			if (tempDef.output.charAt(0)=="/") {
				outfile = tempDef.output;
			}else{
				outfile = Path.join(workdir,tempDef.output);
			}	
			console.log("Writing template output to ", outfile);	
			fs.writeFile(outfile,output, function(writeError){
				if (writeError) {return def.reject(writeError);}
				fs.chmod(outfile,"755", function(chmodErr) {
					if (chmodErr) { return def.reject(chmodErr); }
					def.resolve(outfile);
				});
			});	
		});	
	});

	return def.promise;
}

var generateExecutor = exports.generateExecutor = function(polyrun, workdir) {

	return when(generateTemplate(polyrun,baseTemplateDir,{path:"setupEnv.ejs",output:Path.join(workdir,"setupEnv.sh")}), function(){
		var scriptName = "RunJob_" + polyrun.job.id + ".sh";
		return when(generateTemplate(polyrun,baseTemplateDir,{path:"run.ejs",output:Path.join(workdir,scriptName)}), function(){
			return function() {

				var def = new defer();

				console.log("Launching '" + scriptName + "' from working directory: ", workdir);
				var proc = spawn("./" + scriptName,[],{
					cwd: workdir,
					stdio: 'inherit',
					detached: false,	
				});

				proc.on("error", function(err) {
					console.log("Error Running Job: ", err);
					def.reject(err);
				});

				proc.on('close', function(code,signal) {
					if (code && typeof code=="string") { code = parseInt(code); }

					if (!code) {
						def.resolve("Job Completed (close)");
					}else {	
						return def.reject("Job Failed - Code: " + code + " Signal: " + signal);
					}
//					def.resolve({code: code,signal: signal});
				});


	
				return def.promise;
			}
		});
	});

}

