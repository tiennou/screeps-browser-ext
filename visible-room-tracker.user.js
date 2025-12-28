// ==UserScript==
// @name         Screeps visible room tracker
// @namespace    https://screeps.com/
// @version      0.1.2
// @author       James Cook
// @match        https://screeps.com/a/*
// @match        https://screeps.com/ptr/*
// @match        http://*.localhost:*/(*)/#!/*
// @run-at       document-ready
// @icon         https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js
// @require      https://tiennou.github.io/screeps-browser-ext/screeps-browser-core.js
// @downloadUrl  https://tiennou.github.io/screeps-browser-ext/visible-room-tracker.user.js
// ==/UserScript==

// Entry point
$(document).ready(() => {
    let monitorRunning = false;
    ScreepsAdapter.onRoomChange(function (roomName) {
        console.log("Visible room changed to:", roomName);

        function notifyCurrentRoomVisibility() {
            let roomElem = angular.element('.room');
            let roomScope = roomElem.scope();

            let tick = roomScope.Room.gameTime;
            if (tick !== undefined && roomScope.historyTimestamp === undefined) {
                ScreepsAdapter.Connection.setMemoryByPath(
                    null,
                    "rooms." + roomScope.Room.roomName + ".lastViewed",
                    roomScope.Room.gameTime
                );
            }
        }

        function ensureRoomMonitor() {
            let roomElem = angular.element('.room');
            if (!roomElem || roomElem.length === 0) {
                setTimeout(ensureRoomMonitor, 250);
                return;
            }

            notifyCurrentRoomVisibility();

            if (monitorRunning)
                return;

            let roomScope = roomElem.scope();
            roomScope.$watch(() => roomScope.Room.gameTime, notifyCurrentRoomVisibility);
            monitorRunning = true;
        }

        if (roomName && roomName !== "sim") {
            ScreepsAdapter.Connection.getMemoryByPath(null, "rooms." + roomName).then((baseRoomData) => {
                if (!baseRoomData) {
                    ScreepsAdapter.Connection.setMemoryByPath(
                        null,
                        "rooms." + roomName,
                        {}
                    ).then(ensureRoomMonitor);
                } else {
                    ensureRoomMonitor();
                }
            });
        } else {
            monitorRunning = false;
        }
    });
});
