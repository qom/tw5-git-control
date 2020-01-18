/*\
title: $:/om/modules/server/routes/git-log.js
type: application/javascript
module-type: route

GET /git/log

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";
	
const simpleGit = require('simple-git/promise');
const git = simpleGit("./tiddlers");


exports.method = "GET";

exports.path = /^\/git\/log$/;

exports.handler = function(request,response,state) {
	response.writeHead(200, {"Content-Type": "application/json"});
	// Return the output of git log.
	git.log()
       .then(result => response.end(JSON.stringify(result, null, 2), "utf8"))
		   .catch(error => response.end(JSON.stringify(error), "utf8"));
};

}());
