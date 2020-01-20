/*\
title: $:/om/modules/server/routes/git-action.js
type: application/javascript
module-type: route

GET /git/<action>

action may be status, fetch, pull.

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";
	
const simpleGit = require('simple-git/promise');
const git = simpleGit("./tiddlers");


exports.method = "POST";

exports.path = /^\/git\/([A-z]*$)/;

exports.handler = function(request,response,state) {
	response.writeHead(200, {"Content-Type": "application/json"});

	// state.params is populated with contents of the capture group in the exports.path regex
    const action = state.params[0];
	var result = {command: action};
	var actionParam = null;
	if (state.data) {
	    var requestData = JSON.parse(state.data);
	    actionParam = requestData.param;
	}

	var actionPromise = null;
	if (actionParam) {
	    actionPromise = git[action](actionParam);
	} else {
	    actionPromise = git[action]();
	}

    actionPromise.then(output => {
            result.commandOutput = output;
            response.end(JSON.stringify(result), "utf8");
        })
        .catch(error => {
            response.writeHead(500, {"Content-Type": "application/json"});
            result.error = error.message;
            response.end(JSON.stringify(result), "utf8");
        });
};

}());

/*
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
		*/
