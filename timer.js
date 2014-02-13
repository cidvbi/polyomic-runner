var when = require("promised-io/promise").when;

exports.timer = function(task) {
	var start = new Date().valueOf();
	return when(task(), function(result){
		var end = new Date().valueOf();
		return {start: start, end: end, duration: end-start, result: result};
	});
	
};
