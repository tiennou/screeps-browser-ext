// ==UserScript==
// @name         Screeps room claim assistant
// @namespace    https://screeps.com/
// @version      0.1.6
// @author       James Cook
// @match        https://screeps.com/a/*
// @match        https://screeps.com/ptr/*
// @match        http://*.localhost:*/(*)/#!/*
// @run-at       document-ready
// @icon         https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @require      REPO_URL/screeps-browser-core.js
// @downloadUrl  REPO_URL/room-claim-assistant.user.js
// ==/UserScript==

let roomObjectCounts = {};
function getRoomObjectCounts(shardName, roomName, callback) {
    let scope = angular.element(document.body).scope();
    if (roomObjectCounts[roomName]) {
        callback(roomObjectCounts[roomName]);
    } else {
        //console.log("Bind socket event", roomName)
        let eventFunc = ScreepsAdapter.Socket.bindEventToScope(scope, `roomMap2:${shardName}/${roomName}`, function(objectCounts) {
            roomObjectCounts[roomName] = objectCounts;
            eventFunc.remove();
            // console.log("Data loaded", roomName);
            callback(objectCounts);
        });
    }
}

var interceptingApiPost = false;
function interceptClaim0StatsRequest() {
    if (interceptingApiPost) return;
    interceptingApiPost = true;

    let api = ScreepsAdapter.Api;
    let post = api.post;
    api.post = (uri, body) => {
        //console.log("interceptClaim0StatsRequest", uri, body);
        if (uri === "game/map-stats" && body.statName === "claim0") {
            body.statName = "minerals0";
        }
        return post(uri, body);
    }
}

function recalculateClaimOverlay() {
    // console.log("recalculateClaimOverlay");
    let user = angular.element(document.body).scope().Me();
    let mapContainerElem = angular.element(document.querySelector('.map-container'));
    let worldMap = mapContainerElem.scope().WorldMap;

    let mapSectors = document.querySelectorAll('.map-sector');
    for (let i = 0; i < mapSectors.length; i++) {
        let sectorElem = angular.element(mapSectors[i]);
        let scope = sectorElem.scope();
        let sector = scope.$parent.sector;
        let roomName = sector.name;
        if (roomName) {
            let roomStats = worldMap.roomStats[roomName];
            if (!roomStats || roomStats.status === "out of borders") {
                // can't get the room objects for this, don't bother rendering anything
                continue;
            }

            getRoomObjectCounts(worldMap.shard, roomName, (counts) => {
                if (!counts) return;
                if (!counts.s) {
                    console.log("Bad object list for". roomName, counts)
                    return;
                }

                let userOwned = (roomStats.own && roomStats.own.user === user._id);

                // show minerals if:
                let showMinerals =
                    (userOwned && roomStats.own.level > 0) || //  user has claimed it OR
                    counts.s.length > 1; // it has 2+ sources

                let state = "not-recommended";
                if (userOwned && roomStats.own.level > 0) {
                    state = "owned";
                } else if (roomStats.own && !userOwned) {
                    state = "prohibited";
                } else if (roomStats.sign && !userOwned && roomStats.sign.user !== user._id) {
                    state = "signed";
                } else if (counts.c.length === 0) {
                    state = "unclaimable";
                } else if (counts.s.length >= 2 &&
                    (!roomStats.own || (userOwned && roomStats.own.level === 0))) {
                    // recommend if it has two sources and a controller, nobody else owns it,
                    // and user hasn't already claimed
                    state = "recommended";
                }

                /** @type {HTMLDivElement} */
                let claimAssistDiv = sectorElem[0].querySelector('.claim-assist');
                if (!claimAssistDiv) {
                    claimAssistDiv = document.createElement("div");
                    sectorElem[0].appendChild(claimAssistDiv);
                }

                let claimRoom = claimAssistDiv.getAttribute("room");
                if (claimRoom !== roomName) {
                    if (showMinerals && roomStats.minerals0) {
                        claimAssistDiv.innerHTML = `
                            <div class='room-mineral-type room-mineral-type-${roomStats.minerals0.type} room-mineral-density-${roomStats.minerals0.density}'>
                                ${roomStats.minerals0.type}
                            </div>`;
                    } else {
                        claimAssistDiv.innerHTML = '';
                    }

                    claimAssistDiv.classList.add("room-stats", "claim-assist", state);
                }

                claimAssistDiv.setAttribute("room", roomName);
            });
        }
    }
}

var pendingClaimRedraws = 0;
function bindMapStatsMonitor() {
    let mapContainerElem = angular.element(".map-container");
    let scope = mapContainerElem.scope();
    let worldMap = scope.WorldMap;

    let deferRecalculation = function () {
        document.querySelectorAll('.claim-assist').forEach(e => e.remove());

        if (worldMap.displayOptions.layer === "claim0") {
            if (worldMap.zoom === 3) {
                pendingClaimRedraws++;
                setTimeout(() => {
                    pendingClaimRedraws--;
                    if (pendingClaimRedraws === 0) {
                        recalculateClaimOverlay();
                        document.querySelectorAll('.claim-assist').forEach(e => e.toggleAttribute("hidden", false));
                    }
                }, 500);
            }
        }
    }
    scope.$on("mapSectorsRecalced", deferRecalculation);
    scope.$on("mapStatsUpdated", deferRecalculation);
}

// Entry point
document.addEventListener("readystatechange", () => {
    DomHelper.addStyle(`
        .claim-assist { pointer-events: none; }
        .claim-assist.not-recommended { background: rgba(192, 192, 50, 0.3); }
        .claim-assist.recommended { background: rgba(25, 255, 25, 0.2); }
        .claim-assist.owned { background: rgba(50, 50, 255, 0.2); }
        .claim-assist.signed { background: rgba(255, 128, 0, 0.35); }
        .claim-assist.prohibited { background: rgba(255, 50, 50, 0.2); }
        .room-prohibited { display: none; }
    `);

    ScreepsAdapter.onViewChange(function(view) {
        if (view === "worldMapEntered") {
            interceptClaim0StatsRequest();
            ScreepsAdapter.$timeout(bindMapStatsMonitor);
        }
    });
});
