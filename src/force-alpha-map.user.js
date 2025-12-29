// ==UserScript==
// @name        Screeps Force Alpha map
// @namespace   https://screeps.com/
// @match       https://screeps.com/a/*
// @match       https://screeps.com/ptr/*
// @match       http://*.localhost:*/(*)/#!/*
// @grant       none
// @version     0.0.1
// @author      -
// @description Always open the world map on the alpha map
// @run-at      document-ready
// @icon        https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @require     https://github.com/Esryok/screeps-browser-ext/raw/master/screeps-browser-core.js
// ==/UserScript==

/**
 * Polls every 50 milliseconds for a given condition
 * @param {() => boolean} condition
 * @param {number} [pollInterval=50]
 * @param {number} timeoutAfter
 */
async function waitFor(condition, pollInterval = 50, timeoutAfter) {
    // Track the start time for timeout purposes
    const startTime = Date.now();

    while (true) {
        // Check for timeout, bail if too much time passed
        if(typeof(timeoutAfter) === 'number' && Date.now() > startTime + timeoutAfter) {
            throw 'Condition not met before timeout';
        }

        // Check for condition immediately
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

(() => {
    const MAP_LAYERS = {
        rooms: "rooms",
        safeMode: "safe-mode",
        units: "units",
        users: "users",
        stats: "stats",
        minerals: "minerals",
        visual: "visual",
        decorations: "decorations",
    };

    function getSetting(setting) {
        const item = window.localStorage.getItem(`screeps.alpha-map.${setting}`);
        return item !== null ? JSON.parse(item) : null;
    }

    function setSetting(setting, value) {
        window.localStorage.setItem(`screeps.alpha-map.${setting}`, value);
    }

    function getMapComponent() {
        return ng.probe(document.querySelector("app-world-map-map"))?.componentInstance;
    }

    function getCurrentRoom() {
        return angular.element(document.querySelector('.room.ng-scope')).scope()?.Room;
    }

    async function overrideRoom() {
        await waitFor(() => getCurrentRoom());
        getCurrentRoom().goToMap = function () {
            const router = ScreepsAdapter.$routeSegment;
            const roomCoords = ScreepsAdapter.MapUtils.roomNameToXY(router.$routeParams.room);

            const query = new URLSearchParams();
            query.set("pos", `${roomCoords[0] + .5},${roomCoords[1] + .5}`);
            query.set("units", getSetting("units") ?? true);
            query.set("visual", getSetting("visual") ?? true);
            query.set("claim", getSetting("claim") ?? true);

            ScreepsAdapter.$location.url(router.getSegmentUrl("top.map2shard") + "?" + query.toString());
        }
    }

    async function overrideMap() {
        await waitFor(() => getMapComponent());
        const map = getMapComponent().screepsMap._mapContainer;
        if (map._toggleLayer) return;
        map._toggleLayer = map.toggleLayer;
        map.toggleLayer = function (layer, state) {
            if (layer === MAP_LAYERS.units) {
                setSetting("units", state);
            }
            if (layer === MAP_LAYERS.visual) {
                setSetting("visual", state);
            }
            if (layer === MAP_LAYERS.stats) {
                setSetting("claim", state);
            }
            map._toggleLayer(layer, state);
        }
        map.toggleUnitsLayer = function (state) {
            map.toggleLayer(MAP_LAYERS.units, state);
        }
        map.toggleStatsLayer = function (state) {
            map.toggleLayer(MAP_LAYERS.stats, state);
        }
        map.toggleUsersLayer = function (state) {
            map.toggleLayer(MAP_LAYERS.users, state);
        }
    }

    document.addEventListener("readystatechange", async () => {
        await waitFor(() => angular.element(document.body).scope() !== undefined);
        console.warn("AlphaMap: Loaded");

        ScreepsAdapter.onViewChange(async (triggerName) => {
            if (triggerName === "top.game-room") {
                overrideRoom();
            } else if (triggerName === "top.game-world-map") {
                const hash = window.location.hash;
                const queryLoc = hash.indexOf("?");
                const queryStr = queryLoc !== -1 ? "?" + hash.substring(queryLoc) : "";
                const url = ScreepsAdapter.$routeSegment.getSegmentUrl("top.map2shard") + queryStr;
                console.warn('AlphaMap: redirecting to', url);
                ScreepsAdapter.$location.url(url);
            } else if (triggerName === "top.map2shard") {
                // Restore alpha map settings; not sure why it's not doing that automatically but hey
                await waitFor(() => getMapComponent());
                overrideMap();
                getMapComponent().toggleLayer(MAP_LAYERS.units, getSetting("units") ?? true)
                getMapComponent().toggleLayer(MAP_LAYERS.visual, getSetting("visual") ?? true)
                getMapComponent().toggleLayer(MAP_LAYERS.stats, getSetting("claim") ?? true)
            }
        });
    });
})();
