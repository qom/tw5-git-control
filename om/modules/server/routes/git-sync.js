/*\
title: $:/om/modules/server/routes/git-sync.js
type: application/javascript
module-type: route

GET /git/sync

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";
	
const simpleGit = require('simple-git/promise');
const git = simpleGit("./tiddlers");


exports.method = "POST";

exports.path = /^\/git\/sync$/;

exports.handler = function(request,response,state) {
	response.writeHead(200, {"Content-Type": "application/json"});
	var commitMessage = state.data;
	
	var result = {};
    
	// TODO: Make remote name, and branch name params
	git.commit(commitMessage)
		.then(data => {
			result['commitSummary'] = data;
			return git.push("origin", "master");
		})
		.then(data => { 
			result['pushSummary'] = data;
			return git.status();
		})
		.then(data => {
			result['statusSummary'] = data;
			response.end(JSON.stringify(result), "utf8") 
		})
		.catch(error => {
				response.writeHead(500, {"Content-Type": "application/json"});
				response.end(JSON.stringify({error: error.message}), "utf8");
		});
};

}());
