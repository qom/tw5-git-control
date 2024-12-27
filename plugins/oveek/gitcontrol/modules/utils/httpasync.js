/*\
title: $:/plugins/om/gitcontrol/modules/utils/httpasync.js
type: application/javascript
module-type: utils

Browser HTTP support with promises.

\*/
(function () {

    /*jslint node: true, browser: true */
    /*global $tw: false */
    "use strict";

    exports.httpRequestAsync = function (options) {
        return new Promise((resolve, reject) => {
            // Add the required callback property for TiddlyWiki's httpRequest
            options.callback = (err, data, xhr) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ data, xhr });
                }
            };
    
            // Call TiddlyWiki's httpRequest method
            $tw.utils.httpRequest(options);
        });
    };

})();