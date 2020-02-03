/*\
title: $:/plugins/oveek/gitcontrol/modules/server/routes/git-diff.js
type: application/javascript
module-type: route

GET /git/sync

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";
	
const simpleGit = require('simple-git/promise');
const git = simpleGit();


exports.method = "GET";

exports.path = /^\/git\/diff$/;

exports.handler = function(request,response,state) {
	response.writeHead(200, {"Content-Type": "application/json"});
	//var files = state.data;
       
    /* 
    filenames in simple-git's git status JSON summary are enclosed in 2 pairs of double quotes
    if the filename contains spaces.
    */
    var quoteIfWhiteSpace = (fileName => fileName.includes(" ") ? "\"" + fileName + "\"" : fileName);


    // Need status so we can avoid trying to diff deleted files. 
    // Note the async function passed to the second then(). This is necessary for 'await' to work
    // so we can wait for git.diff() promises to resolve. Also, had to use for loop instead of $tw.utils.each() to iteratate
    // through summary.files array because the await statement needs to be in the same closure / function body as response.end(),
    // otherwise the HTTP response is sent before the git.diff() calls resolve.
    var result = {fileDiffs: []};  
    git.status()
        .then(status => {
            result['statusSummary'] = status;
            return git.diffSummary(['./tiddlers']);
        })
        .then(async summary => {
            result['diffSummary'] = summary;

             // Get a diff for each file in the summary. Skip deleted files.
            for (const diffSummary of summary.files) {
                if (!result['statusSummary'].deleted.includes(quoteIfWhiteSpace(diffSummary.file))) {
                    var fileDiff = await git.diff([diffSummary.file]);
                    result['fileDiffs'].push({fileName: diffSummary.file, diff: fileDiff});
                }
            }
            
            response.end(JSON.stringify(result), "utf8"); 
        })
        .catch(error => {
                response.writeHead(500, {"Content-Type": "application/json"});
                response.end(JSON.stringify({error: error.message}), "utf8");
        });  
   
};
   

}());
