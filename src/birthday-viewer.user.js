// ==UserScript==
// @name         Screeps Birthday viewer
// @namespace    https://screeps.com
// @version      0.1
// @description  This adds a creep's birthday to the inspector
// @author       Traxus, various
// @run-at       document-ready
// @grant        none
// @match        https://screeps.com/a/*
// @match        https://screeps.com/ptr/*
// @match        http://*.localhost:*/(*)/#!/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @require      REPO_URL/screeps-browser-core.js
// @downloadUrl  REPO_URL/gui-extender.js
// ==/UserScript==

// Original from https://github.com/screepers/screeps-snippets/blob/master/src/client-abuse/JavaScript/util.inject.Birthday.js

log("TamperMonkey - Loaded Birthday Viewer");

function log(...args) {
    console.warn(...args);
}

function formatDate(d){
    return ("0" + d.getUTCHours()).slice(-2)+":"+("0" + d.getUTCMinutes()).slice(-2)+":"+("0" + d.getUTCSeconds()).slice(-2) + " " +
        ("0" + (d.getUTCMonth()+1)).slice(-2)+"/"+("0" + d.getUTCDate()).slice(-2)+"/"+d.getUTCFullYear() + " UTC";
};

function showBdayInternal() {
    let gameEl = angular.element($('section.game'));
    let roomEl = angular.element($('section.room'));
    let $rootScope = gameEl.injector().get('$rootScope');
    let $compile = gameEl.injector().get('$compile');
    let target = $('.object-properties .aside-block-content')[0];
    let elem = $('<div class="ng-binding ng-scope"><label>BirthDate: </label>' + formatDate(new Date(parseInt(roomEl.scope().Room.selectedObject._id.substr(0,8), 16)*1000)) + '</div>');
    $compile(elem)($rootScope);
    if(target.children.length > 1) {
        elem.insertBefore(target.children[2]);
    } else {
        elem.insertBefore(target.children[0].children[2]);
    }
}

// Polls every 50 milliseconds for a given condition
async function waitFor(condition, pollInterval = 50, timeoutAfter) {
    // Track the start time for timeout purposes
    const startTime = Date.now();

    while (true) {
        // Check for timeout, bail if too much time passed
        if(typeof(timeoutAfter) === 'number' && Date.now() > startTime + timeoutAfter) {
            throw 'Condition not met before timeout';
        }

        // Check for conditon immediately
        const result = await condition();

        // If the condition is met...
        if(result) {
            // Return the result....
            return result;
        }

        // Otherwise wait and check after pollInterval
        await new Promise(r => setTimeout(r, pollInterval));
    }
}

// Entry point
$(document).ready(() => {
    waitFor(() => angular.element(document.body).scope() !== undefined).then(() => {

        ScreepsAdapter.onViewChange((view) => {
            ScreepsAdapter.$timeout(() => {
                if (view == 'view' && $('.object-properties .aside-block-content')[0]) {
                    showBdayInternal();
                }
            }, 100);
        });
    });
});
