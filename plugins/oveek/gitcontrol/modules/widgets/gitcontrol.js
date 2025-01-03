/*\
title: $:/plugins/oveek/gitcontrol/modules/widgets/gitcontrol.js
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
var httpUtils = require("$:/plugins/om/gitcontrol/modules/utils/httpasync.js");


var GitControlWidget = function(parseTreeNode,options) {

	// Config properties
	this.initActions = [];

    // For now git diff is handled separately
	this.events = ["tm-git-status","tm-git-fetchaction","tm-git-mergeaction","tm-git-pullaction","tm-git-addaction","tm-git-commitaction","tm-git-pushaction","tm-git-syncaction"];

    this.gitControl = {
        selectiveAddUi: {macroTemplate: "<<ui-list-item titleplaceholder>>", uiTiddler: "$:/git/selectiveaddui"}
    }

    var selectedFileJsonToList = (selectedFilesJson => {
        var selectedList = [];
        Object.entries(JSON.parse(selectedFilesJson)).forEach(([fileName, selected]) => {
            if (selected == "selected") {
                selectedList.push(fileName);
            }
        });
        return selectedList;
    });

    // TODO: Eliminate unnecessary parts of this.
	this.git = {
		resourceRoot: "git/",
		action: {errorTiddler: "$:/git/error", progressTiddler: "$:/git/progress"} ,
		diff: {resource: "git/diff", resultTiddler: "$:/git/diffresult"},
	  localSyncStatusTiddler: "$:/git/localsyncstatus",
	  remoteSyncStatusTiddler: "$:/git/remotesyncstatus"
	}

	this.basicAction = {
	    status: {command: 'status', resultTiddler: "$:/git/status"},
	    pull: {command: 'pull', resultTiddler: "$:/git/pullsummary"},
		add: {command: 'add', data: {param: './tiddlers'}, sourceTiddler: "$:/git/selectedforadd", sourceTiddlerParser: selectedFileJsonToList},
		commit: {command: 'commit', data: {param: null} , sourceTiddler: "$:/git/commitmessage", resultTiddler: "$:/git/commitsummary"},
		push: {command: 'push', data: {param: ["origin", "master"]}},
		remotecommits: {command: 'raw', data: {param: ['log','master..origin/master','--stat']}, resultTiddler: "$:/git/remotecommits"},
	}

	this.complexAction = {
		fetchaction: {commands: ['fetch', 'remotecommits','status']},
		pullaction: {commands: ['pull', 'status']},
		mergeaction: {commands: ['merge', 'status']},
		addaction: {commands: ['add','status']},
		commitaction: {commands: ['commit', 'status']},
		pushaction: {commands: ['push','status']},
		syncaction: {commands: ['commit','push','status']}
	}

	this.filesystem = {
		checkChanges: {resource: "filesystem/get-filesystem-tiddlers.json", query: "?filter=newOrDeleted", resultTiddler:"$:/sync/changedondisk"},
		loadChanges: {resource: "filesystem/load-changes-from-disk"}
	};

	this.initialise(parseTreeNode,options);

    // Add handlers for each git action
	this.events.forEach(event => this.addEventListener(event, this.handleGitActionEvent));

	// Git diff has a separate handler for now
	this.addEventListeners([
		{type: "tm-git-show-selectiveadd-ui-action", handler: this.handleShowGitSelectiveAddUi},
	    {type: "tm-git-diff", handler: this.handleGitDiffEvent},
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
Execute handler for a git action and make the appropriate request to the server
*/
GitControlWidget.prototype.handleGitActionEvent = async function(event) {
    var self = this;
    const action = this.gitActionName(event);
    var progressMessage = "";

    // Check if this is a complex action with multiple git commands to execute.
    const gitActions = this.complexAction[action] ? this.complexAction[action].commands : [action];

    for (var gitAction of gitActions) {
        var command, data, resultTiddler = null;

        // Show that the action has started in the UI
        $tw.wiki.setText(this.git.action.progressTiddler, null, null, "Executing " + gitAction + "...", null);

        // TODO: Simplify or factor out into a separate method
        if (this.basicAction[gitAction]) {
            command = this.basicAction[gitAction].command;
            // Read user input from source tiddler and put in request data.
            // Used to get user commit message, or files selected by user to include in the commit.
            if (this.basicAction[gitAction].sourceTiddler) {
                var requestData = this.basicAction[gitAction].data;
                var paramData = $tw.wiki.getTiddlerText(this.basicAction[gitAction].sourceTiddler);
                if (paramData != undefined) {
                    if (this.basicAction[gitAction].sourceTiddlerParser) {
                        paramData = this.basicAction[gitAction].sourceTiddlerParser(paramData);
                    }
                    requestData.param = paramData;
                }
                data = JSON.stringify(requestData);
            } else {
                data = JSON.stringify(this.basicAction[gitAction].data);
            }
            resultTiddler = this.basicAction[gitAction].resultTiddler;
        } else {
            data = null;
            command = gitAction;
        }

        // Make HTTP request
        var response = await httpUtils.httpRequestAsync({
                type: "POST",
                url: this.urlOf(command),
				headers: {"X-requested-with": "TiddlyWiki"},
                data: data
            })
            .catch(response => self.handleGitErrorResponse(response));

        var gitCommandResponse = JSON.parse(response.data);

        // Show response output in gitcontrol UI
        if (resultTiddler && gitCommandResponse.commandOutput != null) {
            if (gitCommandResponse.outputType == "string") {
                $tw.wiki.setText(resultTiddler, null, null, self.makeWikiTextCodeBlock(gitCommandResponse.commandOutput), null);
            } else {
    		    $tw.wiki.setTiddlerData(resultTiddler, gitCommandResponse.commandOutput, null);
    		}
        }

        // Update sync status summary
        if (gitCommandResponse.command == 'status') {
                self.updateSyncStatus(gitCommandResponse.commandOutput);
                self.updateGitStatusResultTiddler(gitCommandResponse.commandOutput);
        }

        // Show the action has completed in the UI
        progressMessage += "Executing git " + gitAction + "...complete.<br/>";
        $tw.wiki.setText(this.git.action.progressTiddler, null, null,progressMessage, null);
        this.clearProgress(5000);
    }
}


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

GitControlWidget.prototype.handleShowGitSelectiveAddUi = function(event) {

    var listItemMacroTemplate = this.gitControl.selectiveAddUi.macroTemplate;
    var selectionUi = "";
    var inSystemTiddlerSection = false;

    var statusTiddlerText = $tw.wiki.getTiddlerText(this.basicAction.status.resultTiddler);
    var statusJson = JSON.parse(statusTiddlerText);

    Object.entries(statusJson).forEach(([gitStatusChangeInfoType, value]) => {
        // In the git status json new files are in an array called "not_added", and modified files are in an array called "modified".
        if (value instanceof Array) {
            selectionUi += "__" + gitStatusChangeInfoType + "__<br>";

            value.forEach(tiddlerTitle => {

                // Hide system tiddlers with html5 <details> tag (tiddlers have to be sorted so that all the _system tiddlers are sequential)
                if (!inSystemTiddlerSection && tiddlerTitle.includes("tiddlers\/_system")) {
                    selectionUi += "<details><summary>system tiddlers</summary>";
                    inSystemTiddlerSection = true;
                }

                selectionUi += listItemMacroTemplate.replace("titleplaceholder", '"' + tiddlerTitle.replace(/"/g,"") + '"')

            });

            // Close the system tiddlers section
            if (inSystemTiddlerSection) {
                inSystemTiddlerSection = false;
                selectionUi += "</details>";
            }
            selectionUi += "<br>";
        }
    })

    $tw.wiki.setText(this.gitControl.selectiveAddUi.uiTiddler, null, null, selectionUi, null);

}

GitControlWidget.prototype.handleGitDiffEvent = function(event) {
	var self = this;
    const action = this.gitActionName(event);
	httpUtils.httpRequestAsync({url: this.urlOf(action)})
	.then(response => {
		
		var gitDiff = JSON.parse(response.data);
		
		var combinedDiff = "";
		$tw.utils.each(gitDiff.fileDiffs, diffMeta => {
			combinedDiff += self.makeWikiTextCodeBlock(diffMeta.diff, "diff");
		});
		
		$tw.wiki.setText(self.git.diff.resultTiddler, null, null, combinedDiff, null);
		
	}).catch(response => self.handleGitErrorResponse(response));
}

GitControlWidget.prototype.handleChangesOnDiskEvent = function(event) {
	var self = this;
	var resourceUrl = $tw.syncadaptor.host + this.filesystem.checkChanges.resource + this.filesystem.checkChanges.query;
	httpUtils.httpRequestAsync({url: resourceUrl})
		.then(response => {
		
			var filesOnDisk = JSON.parse(response.data);
		  $tw.wiki.setTiddlerData(self.filesystem.checkChanges.resultTiddler, filesOnDisk, null);
		
		});
}

GitControlWidget.prototype.handleLoadFromDiskEvent = function(event) {
	var self = this;
	var resourceUrl = $tw.syncadaptor.host + this.filesystem.loadChanges.resource;
	httpUtils.httpRequestAsync({url: resourceUrl})
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
	$tw.wiki.deleteTiddler(this.basicAction.status.resultTiddler);
	$tw.wiki.setTiddlerData(this.basicAction.status.resultTiddler, statusClean, null);
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
Delete progress tiddler after delay
*/
GitControlWidget.prototype.clearProgress = async function(delayMs) {
    setTimeout(() => {
        $tw.wiki.deleteTiddler(this.git.action.progressTiddler);
    }, delayMs)
}

/*
Wrap text with ``` to make wiki code block
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

