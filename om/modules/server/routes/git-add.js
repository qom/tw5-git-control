/*\
title: $:/om/modules/server/routes/git-add.js
type: application/javascript
module-type: route

GET /git/add

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";
	
const simpleGit = require('simple-git/promise');
const git = simpleGit("./tiddlers");


exports.method = "GET";

exports.path = /^\/git\/add$/;

exports.handler = function(request,response,state) {
	response.writeHead(200, {"Content-Type": "application/json"});
	
	var result = {};
	
	// Stage every new and modified file in the tiddlers directory for commit.
	// The git add command doesn't return any output.
	git.add('.')
		.then(data => git.status())
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
