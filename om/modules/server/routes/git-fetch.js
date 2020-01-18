/*\
title: $:/om/modules/server/routes/git-fetch.js
type: application/javascript
module-type: route

GET /git/fetch

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";
	
const simpleGit = require('simple-git/promise');
const git = simpleGit("./tiddlers");


exports.method = "GET";

exports.path = /^\/git\/fetch$/;

exports.handler = function(request,response,state) {
	response.writeHead(200, {"Content-Type": "application/json"});
	
	var result = {};
	
	git.fetch()
		.then(data => { 
			result['fetchSummary'] = data;
			return git.raw(['log','master..origin/master','--stat']);
		})
        .then(data => {
            result['logSummary'] = data;
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
