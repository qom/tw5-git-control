/*\
title: $:/om/modules/widgets/gitcontrol.js
type: application/javascript
module-type: widget

Send git commands to the tiddlywiki node server.

Note: This is version 0.1.0 of the git control widget. Before refactoring and simplifying. Re-add module-type: widget field to use.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var GitControlWidget = function(parseTreeNode,options) {

	// Config properties
	this.initActions = [];

	this.events = ["tm-git-status","tm-git-fetchaction","tm-git-mergeaction","tm-git-pullaction","tm-git-addaction","tm-git-commit","tm-git-pushaction","tm-git-sync","tm-git-diff"];

    // TODO: Eliminate unnecessary parts of this.
	this.git = {
		resourceRoot: "git/",
		action: {errorTiddler: "$:/git/error"},
		status: {resultTiddler: "$:/git/status"},
		//pull: {resource: "git/pull", resultTiddler: "$:/git/pullsummary"},
		//add: {resource: "git/add", resultTiddler: "$:/git/addresult"},
		commit: {resource: "git/commit", resultTiddler: "$:/git/commitsummary"},
		//push: {resource: "git/push", resultTiddler: "$:/git/pushsummary"},
		sync: {resource: "git/sync", resultTiddler: "$:/git/syncresult"},
		diff: {resource: "git/diff", resultTiddler: "$:/git/diffresult"},
	  localSyncStatusTiddler: "$:/git/localsyncstatus",
	  remoteSyncStatusTiddler: "$:/git/remotesyncstatus"
	}

	this.basicAction = {
	    pull: {command: 'pull', resultTiddler: "$:/git/pullsummary"},
		add: {command: 'add', data: {param: '.'}},
		commit: {command: 'commit', data: {param: null} , sourceTiddler: "$:/git/commitmessage", resultTiddler: "$:/git/commitsummary"},
		push: {command: 'push', data: {param: ["origin", "master"]}},
		remotecommits: {command: 'raw', data: {param: ['log','master..origin/master','--stat']}, resultTiddler: "$:/git/remotecommits"},
	}

	this.complexAction = {
		fetchaction: {commands: ['fetch', 'remotecommits','status']},
		pullaction: {commands: ['pull', 'status']},
		mergeaction: {commands: ['merge', 'status']},
		addaction: {commands: ['add','status']},
		pushaction: {commands: ['push','status']}
	}

	this.filesystem = {
		checkChanges: {resource: "filesystem/get-filesystem-tiddlers.json", query: "?filter=newOrDeleted", resultTiddler:"$:/sync/changedondisk"},
		loadChanges: {resource: "filesystem/load-changes-from-disk"}
	};

	this.initialise(parseTreeNode,options);

    // Add handlers for each git action
	this.events.forEach(event => this.addEventListener(event, this.handleGitActionEvent));

	this.addEventListeners([
		{type: "tm-check-changes-on-disk", handler: "handleChangesOnDiskEvent"},
		{type: "tm-load-from-disk", handler: "handleLoadFromDiskEvent"}
  ]);
};

/*
Inherit from the base widget class
*/
GitControlWidget.prototype = new Widget();

/*
Render this widget into the DOM
*/
GitControlWidget.prototype.render = function(parent,nextSibling) {
	this.computeAttributes();
	this.execute();
	this.executeStartupActions();
	this.renderChildren(parent,nextSibling);
};

/*
Compute the internal state of the widget
*/
GitControlWidget.prototype.execute = function() {
	// Example attribute (this is from action-createtiddler)
	var actions = this.getAttribute("initactions");
	if(actions && actions.includes(',')) {
		this.initActions = actions.split(',');
	} else {
		this.initActions.push(actions);
	}
	// Construct the child widgets
  this.makeChildWidgets();
};
	
/*
Execute user specified "startup" actions when this widget is rendered
*/
GitControlWidget.prototype.executeStartupActions = function() {
	this.initActions.forEach(action => {
		var message = "tm-git-" + action;
		if (this.eventListeners[message]) {
			// Execute the corresponding git message event handler
			this.eventListeners[message]({type: message});
		}
	});
};
	
/*
Call git status API and return response Promise.
*/
GitControlWidget.prototype.getGitStatus = function() {
	return $tw.utils.httpRequestAsync({url: this.urlOf(this.git.status.resource)});
}

/*
Execute handler for a git action and make the appropriate request to the server
*/
GitControlWidget.prototype.handleGitActionEvent = async function(event) {
    var self = this;
    const action = this.gitActionName(event);
    //$tw.wiki.deleteTiddler(this.git[action].resultTiddler);
    //$tw.wiki.setText(self.git.remoteSyncStatusTiddler, null, null, "Performing fetch from remote...", null);

    // Check if this is a complex action with multiple git commands to execute.
    const gitActions = this.complexAction[action] ? this.complexAction[action].commands : [action];

    for (var gitAction of gitActions) {
        var command, data, resultTiddler = null;
        if (this.basicAction[gitAction]) {
            command = this.basicAction[gitAction].command;
            // Read user input from source tiddler and put in request data. Used to get user commit message.
            if (this.basicAction[gitAction].sourceTiddler) {
                var paramData = $tw.wiki.getTiddlerText(this.basicAction[gitAction].sourceTiddler);
                var requestData = this.basicAction[gitAction].data;
                requestData.param = paramData;
                data = JSON.stringify(requestData);
            } else {
                data = JSON.stringify(this.basicAction[gitAction].data);
            }
            resultTiddler = this.basicAction[gitAction].resultTiddler;
        } else {
            data = null;
            command = gitAction;
        }

        var response = await $tw.utils.httpRequestAsync({
                type: "POST",
                url: this.urlOf(command),
                data: data
            })
            .catch(response => self.handleGitErrorResponse(response));

        var gitCommandResponse = JSON.parse(response.data);

        if (resultTiddler) {
            if (gitCommandResponse.outputType == "string") {
                $tw.wiki.setText(resultTiddler, null, null, self.makeWikiTextCodeBlock(gitCommandResponse.commandOutput), null);
            } else {
    		    $tw.wiki.setTiddlerData(resultTiddler, gitCommandResponse.commandOutput, null);
    		}
        }

        if (gitCommandResponse.command == 'status') {
                self.updateSyncStatus(gitCommandResponse.commandOutput);
                self.updateGitStatusResultTiddler(gitCommandResponse.commandOutput);
        }
    }
}

/*if (gitFetch.logSummary) {
                $tw.wiki.setText(self.git.fetch.resultTiddler, null, null, self.makeWikiTextCodeBlock(gitFetch.logSummary), null);
            } else {
                $tw.wiki.setTiddlerData(self.git.fetch.resultTiddler, gitFetch.fetchSummary, null);
            }

            // TODO: handle error
            var gitStatus = gitFetch.statusSummary;
            self.updateSyncStatus(gitStatus);

            this.updateGitStatusResultTiddler(gitStatus);*/

GitControlWidget.prototype.handleGitErrorResponse = function(response) {
    var error = "";

    // If no 'data' object in the response, the error occurred even before executing the git action.
    // Otherwise, an exception happened while executing the git action.
    if (!response.data) {
        error = "Failed to connect to server: " + response.err;
    } else {
        const gitError = JSON.parse(response.data);
        error = gitError.error;

        if (gitError.command == "fetch") {
            $tw.wiki.setText(this.git.remoteSyncStatusTiddler, null, null, "Unknown. Failed to connect to remote.", null);
        }
    }

    $tw.wiki.setText(this.git.action.errorTiddler, null, null, this.makeWikiTextCodeBlock(error), null);
}

/*
Handle the tm-git-status widget message
*/
GitControlWidget.prototype.handleGitStatusEvent = function(event) {
	var self = this;
	this.getGitStatus()
	.then(response => {

		var gitStatus = JSON.parse(response.data);
		self.updateSyncStatus(gitStatus.statusSummary);
		
		this.updateGitStatusResultTiddler(gitStatus.statusSummary);
		
	})
	.catch(response => {
		var error = response.data ? response.data : "Failed to connect to server: " + response.err;
		$tw.wiki.setText(self.git.status.resultTiddler, null, null, self.makeWikiTextCodeBlock(error), null);
	});
}

/*
Handle the tm-git-fetch widget message
*/
GitControlWidget.prototype.handleGitFetchEvent = function(event) {
	var self = this;
	$tw.wiki.deleteTiddler(this.git.fetch.resultTiddler);
	$tw.wiki.setText(self.git.remoteSyncStatusTiddler, null, null, "Performing fetch from remote...", null);
	
	$tw.utils.httpRequestAsync({url: this.urlOf(this.git.fetch.resource),})
	.then(response => {

		var gitFetch = JSON.parse(response.data);
		if (gitFetch.logSummary) {
			$tw.wiki.setText(self.git.fetch.resultTiddler, null, null, self.makeWikiTextCodeBlock(gitFetch.logSummary), null);
		} else {
			$tw.wiki.setTiddlerData(self.git.fetch.resultTiddler, gitFetch.fetchSummary, null);
		}

		// TODO: handle error
		var gitStatus = gitFetch.statusSummary;
		self.updateSyncStatus(gitStatus);
		
		this.updateGitStatusResultTiddler(gitStatus);
		
	})
	.catch(response => {
		var error = response.data ? response.data : "Failed to connect to server: " + response.err;
		$tw.wiki.setText(self.git.fetch.resultTiddler, null, null, self.makeWikiTextCodeBlock(error), null);
		$tw.wiki.setText(self.git.remoteSyncStatusTiddler, null, null, "Unknown. Failed to connect to remote.", null);
	});
}

/*
Handle the tm-git-pull widget message
*/
GitControlWidget.prototype.handleGitPullEvent = function(event) {
	var self = this;
	$tw.wiki.deleteTiddler(this.git.pull.resultTiddler);
	
	$tw.utils.httpRequestAsync({url: this.urlOf(this.git.pull.resource)})
		.then(response => {
			var gitPull = JSON.parse(response.data);
			$tw.wiki.setTiddlerData(self.git.pull.resultTiddler, gitPull, null);
		})
		.catch(response => {
			var error = response.data ? response.data : "Failed to connect to server: " + response.err;
			$tw.wiki.setText(self.git.pull.resultTiddler, null, null, self.makeWikiTextCodeBlock(error), null);
		});
}
	
/*
Handle the tm-git-add widget message
*/
GitControlWidget.prototype.handleGitAddEvent = function(event) {
	var self = this;
	$tw.wiki.deleteTiddler(this.git.add.resultTiddler);
	
	$tw.utils.httpRequestAsync({url: this.urlOf(this.git.add.resource)})
		.then(response => {
		
			var gitAdd = JSON.parse(response.data);

			// TODO: handle error
			var gitStatus = gitAdd.statusSummary;
			self.updateSyncStatus(gitStatus);

			this.updateGitStatusResultTiddler(gitStatus);
		
	})
	.catch(response => {
			var error = response.data ? response.data : "Failed to connect to server: " + response.err;
			$tw.wiki.setText(self.git.add.resultTiddler, null, null, self.makeWikiTextCodeBlock(error), null);
	});
}
	
/*
Handle the tm-git-sync widget message
*/
GitControlWidget.prototype.handleGitSyncEvent = function(event) {
	var self = this;
	var commitmessage = $tw.wiki.getTiddlerText("$:/git/commitmessage");
	$tw.utils.httpRequestAsync({
		url: this.urlOf(this.git.sync.resource),
		type: "POST",
		data: commitmessage
	})
	.then(response => {
            
		var syncResult = JSON.parse(response.data);
		$tw.wiki.setTiddlerData(self.git.commit.resultTiddler, syncResult.commitSummary, null);
		$tw.wiki.setTiddlerData(self.git.push.resultTiddler, syncResult.pushSummary, null);

		// TODO: handle error
		var gitStatus = syncResult.statusSummary;
		self.updateSyncStatus(gitStatus);

		this.updateGitStatusResultTiddler(gitStatus);
		
	})
	.catch(response => {
		var error = response.data ? response.data : "Failed to connect to server: " + response.err;
		$tw.wiki.setText(self.git.sync.resultTiddler, null, null, self.makeWikiTextCodeBlock(error), null);
	});
}

GitControlWidget.prototype.handleGitDiffEvent = function(event) {
	var self = this;
	$tw.utils.httpRequestAsync({url: this.urlOf(this.git.diff.resource)})
	.then(response => {
		
		var gitDiff = JSON.parse(response.data);
		
		var combinedDiff = "";
		$tw.utils.each(gitDiff.fileDiffs, diffMeta => {
			combinedDiff += self.makeWikiTextCodeBlock(diffMeta.diff, "diff");
		});
		
		$tw.wiki.setText(self.git.diff.resultTiddler, null, null, combinedDiff, null);
		
	})
}

GitControlWidget.prototype.handleChangesOnDiskEvent = function(event) {
	var self = this;
	var resourceUrl = $tw.syncadaptor.host + this.filesystem.checkChanges.resource + this.filesystem.checkChanges.query;
	$tw.utils.httpRequestAsync({url: resourceUrl})
		.then(response => {
		
			var filesOnDisk = JSON.parse(response.data);
		  $tw.wiki.setTiddlerData(self.filesystem.checkChanges.resultTiddler, filesOnDisk, null);
		
		});
}

GitControlWidget.prototype.handleLoadFromDiskEvent = function(event) {
	var self = this;
	var resourceUrl = $tw.syncadaptor.host + this.filesystem.loadChanges.resource;
	$tw.utils.httpRequestAsync({url: resourceUrl})
		.then(response => {
		
			var changeResult = JSON.parse(response.data);
		  $tw.wiki.setTiddlerData(self.filesystem.checkChanges.resultTiddler, changeResult, null);
			$tw.utils.each(changeResult.deleted, deletedTiddler => $tw.wiki.deleteTiddler(deletedTiddler.title));
			this.dispatchEvent({type: "tm-server-refresh"});
			console.log(changeResult);
		
		});
}

/*
Update local and remote sync status
*/
GitControlWidget.prototype.updateSyncStatus = function(gitStatus) {

	$tw.wiki.deleteTiddler(this.git.localSyncStatusTiddler);
	$tw.wiki.deleteTiddler(this.git.remoteSyncStatusTiddler);

	// Local status
	var propertyNameSubstitution = {not_added: "new"};
	var exclusion = "files";
	var changes = this.filterStatuses(gitStatus, exclusion, propertyNameSubstitution, true);

	var localSyncSummary = [];
	if (this.isEmpty(changes)) {
		localSyncSummary = "No uncommitted changes.";
	} else {
		for (var status in changes) {
			localSyncSummary.push(changes[status].length + " " + status);
		}
		localSyncSummary = localSyncSummary.join(", ") + " files.";
	}

	$tw.wiki.setText(this.git.localSyncStatusTiddler, null, null, localSyncSummary, null);

	// Remote status
	var remoteSyncStatus = "";
	if (gitStatus.ahead == 0 && gitStatus.behind == 0) {
		remoteSyncStatus = "Local repo and remote are in sync.";
	} else {
		remoteSyncStatus = "Local repo out of sync: "
	}

	if (gitStatus.ahead > 0) {
			remoteSyncStatus += gitStatus.ahead + " commits ahead.";
	}
	if (gitStatus.behind > 0) {
			remoteSyncStatus += gitStatus.behind + " commits behind.";
	}

	$tw.wiki.setText(this.git.remoteSyncStatusTiddler, null, null, remoteSyncStatus, null);

}

/*
Update git status result tiddler
*/
GitControlWidget.prototype.updateGitStatusResultTiddler = function(gitStatus) {
	var exclusion = "files";
	var statusClean = this.filterStatuses(gitStatus, exclusion, {}, false);
	$tw.wiki.deleteTiddler(this.git.status.resultTiddler);
	$tw.wiki.setTiddlerData(this.git.status.resultTiddler, statusClean, null);
}

/*
Filter git status JSON response:
*/
GitControlWidget.prototype.filterStatuses = function(gitStatus, exclude, substitution, onlyArrays) {
	var changes = {};
	for (const status in gitStatus) {
		var statusName = substitution[status] ? substitution[status] : status;
		if (gitStatus[status] instanceof Array && gitStatus[status].length > 0 && status != exclude) {
			changes[statusName] = gitStatus[status];
		} else if (!onlyArrays && !(gitStatus[status] instanceof Array)) {
			changes[statusName] = gitStatus[status];
		}
	}
	return changes;
}

/*
Take REST resource and return the full URL
*/
GitControlWidget.prototype.urlOf = function(action, queryParams) {
    const query = queryParams ? "?" + queryParams.join('&') : "";
	return $tw.syncadaptor.host + this.git.resourceRoot + action + query;
}

/*
Wrap with text with ``` to make wiki code block
*/
GitControlWidget.prototype.makeWikiTextCodeBlock = function(text, type) {
	return "\n```" + type + "\n" + text + "\n```\n";
}

/*
Check if object is empty
*/
GitControlWidget.prototype.isEmpty = function(obj) {
	return Object.keys(obj).length === 0 && obj.constructor === Object;
}

/*
Chop 'tm-git-' off of event type to get just the git action name.
*/
GitControlWidget.prototype.gitActionName = function(event) {
    return event.type.slice(7)
}

/*
Refresh the widget by ensuring our attributes are up to date
*/
GitControlWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if($tw.utils.count(changedAttributes) > 0) {
		this.refreshSelf();
		return true;
	}
	return this.refreshChildren(changedTiddlers);
};

/*
Invoke the action associated with this widget
*/
GitControlWidget.prototype.invokeAction = function(triggeringWidget,event) {
	
	return true; // Action was invoked
};

exports["gitcontrol"] = GitControlWidget;

})();

