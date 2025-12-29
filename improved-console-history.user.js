// ==UserScript==
// @name        Screeps improved console history
// @namespace   https://screeps.com/
// @match       https://screeps.com/a/*
// @match       https://screeps.com/ptr/*
// @match       http://*.localhost:*/(*)/#!/*
// @grant       none
// @version     1.5.0
// @author      -
// @description Gives super-powers to the Console; history that survives across tabs and view changes, a couple @-variables linked to the viewer's state, etc.
// @run-at      document-ready
// @icon        https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @downloadURL https://gist.github.com/tiennou/405f811e294efbf237725c9b27475898/raw/improved-console-history.user.js
// @require     https://github.com/Esryok/screeps-browser-ext/raw/master/screeps-browser-core.js
// ==/UserScript==

/**
 * Changelog:
 * - 1.0: initial release
 * - 1.1: added a `@history [num]` command that will list the command history or execute the given one
 * - 1.2:
 *   - added `@replay` to switch to the history view.
 *   - added `@map` to switch to the map view.
 *   - added `@navigate dir`/`@n dir` to move around the viewer. Takes left/right/top/bottom and a bunch of others.
 * - 1.3:
 *   - added `@navigate $room` to move directly to another room
 *   - added `@navigate $num $num` to move around based on an offset
 * - 1.4:
 *   - support for PTR.
 *   - made the history size configurable through setting `screeps.history-size` in localStorage
 *   - added `/history size [num]` to get and set the history size
 *   - disabled snippet expansion in the console since those have a tendency of firing randomly
 *   - changed commands to use a `/`-prefix
 *   - added a `/help` command
 * - 1.5:
 *   - added a room navigation history tracking
 */

const SICH_VERSION = "1.5.0";

/**
 * @typedef CommandDefinition
 * @property {string} name
 * @property {string | string[]} alias
 * @property {string | [cmd: string, desc: string][]} desc
 * @property {(args: string[])} run
 */

/**
 * @typedef RoomHistoryEntry
 * @property {string} server
 * @property {string} shard
 * @property {string} room
 */

/**
 * Clamp a number between a min and max value (inclusive)
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns
 */
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

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

/**
 *
 * @param {string} roomName
 * @returns
 */
function goToRoomName(roomName) {
    try {
        ScreepsAdapter.MapUtils.roomNameToXY(roomName); // throws in case of garbage
        const router = ScreepsAdapter.$routeSegment;
        const roomURL = router.getSegmentUrl(router.name, { room: roomName.toUpperCase() });
        ScreepsAdapter.$location.url(roomURL);
        return true;
    } catch {}
    return false;
}

/**
 *
 * @param {RoomHistoryEntry} room
 * @returns
 */
function goToRoom(room) {
    try {
        ScreepsAdapter.MapUtils.roomNameToXY(room.room); // throws in case of garbage
        const router = ScreepsAdapter.$routeSegment;
        const roomURL = router.getSegmentUrl(router.name, { room: room.room.toUpperCase(), shard: room.shard });
        ScreepsAdapter.$location.url(roomURL);
        return true;
    } catch {}
    return false;
}

/**
 * Like `Number.parseInt` but works better with optional chaining
 *
 * @param {string | number} str
 * @param {number} radix
 * @returns
 */
function parseInt(str, radix = 10) {
    const val = Number.parseInt(str, radix);
    if (isNaN(val)) return null;
    return val;
}

(() => {
    const NAVIGATION_SIZE_KEY = "screeps.room-history-size";
    const HISTORY_STORAGE_KEY = "screeps.console-history";
    const HISTORY_SIZE_KEY = "screeps.history-size";
    const VARIABLE_SIGIL = "@";
    const COMMAND_SIGIL = "/";

    /** The line we're at in the history */
    let historyIdx = -1;
    /** The thing we were currently typing */
    let buffer = "";

    /** List of single-letter "variables" that can be substitued on the fly into a command */
    const CLI_VARS = {
        "r": () => `"${getCurrentRoom().roomName}"`,
        "s": () => `"${getCurrentRoom().shardName}"`,
        "i": () => `"${selectedObject()._id}"`,
        "p": () => {
            const obj = selectedObject();
            return `${obj.x}, ${obj.y}, "${obj.room}"`
        },
    };

    /**
     * List of extended commands that can be executed
     * @type {CommandDefinition[]}
     */
    const CLI_CMDS = [
        {
            name: "help",
            desc: "Show this help",
            run: () => {
                /**
                 * @param {[cmd, desc]} str
                 * @returns
                 */
                const fmtCmd = (str) => {
                    return `  ${COMMAND_SIGIL}${str[0]} - ${str[1]}`
                }
                const msg = `Screeps improved console history: version ${SICH_VERSION}\n` +
                `Available commands:\n` +
                CLI_CMDS.map(c => {
                    if (c.alias) {
                        return fmtCmd([c.name, `An alias for ${COMMAND_SIGIL}${c.alias}`]);
                    }
                    if (!c.desc) return;

                    const strs = (typeof c.desc === "string" ? [[c.name, c.desc]] : c.desc);
                    const strs2 = strs.map(str => fmtCmd(str));
                    return strs2.join("\n");
                }).filter(c => !!c).join(`\n`);
                appendConsoleMessage(msg);
            }
        },
        {
            name: "history",
            desc: [
                ["history", "Show the saved history"],
                ["history [cmdId]", "Execute a previous entry from it"],
                ["history clear", "Clear the history"],
                ["history size [num]", "Set the size of the saved history"],
            ],
            run: (args) => {
                const history = loadHistory();
                if (!args.length) {
                    const msg = `Command history (${history.length} entries):\n` +
                        history.map((h, idx) => ` - ${idx}: ${h}`).join("\n");
                    appendConsoleMessage(msg);
                    return;
                }
                if (args[0] === "clear") {
                    clearHistory();
                    appendConsoleMessage(`History cleared`, true);
                    return;
                }
                if (args[0] === "size") {
                    if (args[1] === undefined) {
                        appendConsoleMessage(`Current history size is ${getHistorySize()}`);
                        return;
                    }
                    const size = parseInt(args[1]);
                    if (size === null) {
                        appendConsoleMessage(`Invalid size argument!`, true);
                        return;
                    }
                    localStorage.setItem(HISTORY_SIZE_KEY, size);
                    appendConsoleMessage(`Set history size to ${size}`);
                    saveHistory(loadHistory()); // Roundabout way of enforcing the new size
                    return;
                }
                const cmdIdx = parseInt(args[0]);
                if (cmdIdx < 0 || cmdIdx >= history.length) {
                    appendConsoleMessage(`Command index ${cmdIdx} is out of bounds!`, true);
                    return;
                }
                const cmd = history[cmdIdx];
                appendConsoleMessage(`Executing "${cmd}"`);
                executeCommand(cmd);
            },
        },
        {
            name: "map",
            desc: "Change the view to the map",
            run: () => {
                getCurrentRoom().goToMap();
            },
        },
        {
            name: "navigate",
            desc: [
                ["navigate left|right|bottom|top", "Navigate in the given direction"],
                ["navigate <roomName>", "Navigate to the given room name"],
                ["navigate <x>,<y>", "Navigate from the current room based on an offset"],
                ["navigate back", "Navigate back to the previous room"],
            ],
            run: (args) => {
                const dirArg = args[0];
                if (!dirArg) {
                    appendConsoleMessage(`Missing argument for direction!`, true);
                    return;
                }

                // @navigate offX, offY
                if (args.length === 2) {
                    const [offX, offY] = [Number.parseInt(args[0]), Number.parseInt(args[1])];
                    if (isNaN(offX) || isNaN(offY)) {
                        appendConsoleMessage(`Invalid offset ${args}; both must be integers!`, true);
                        return;
                    }
                    const [roomX, roomY] = ScreepsAdapter.MapUtils.roomNameToXY(getCurrentRoom().roomName);
                    const newRoom = ScreepsAdapter.MapUtils.getRoomNameFromXY(roomX + offX, roomY + offY);
                    if (!goToRoomName(newRoom)) {
                        appendConsoleMessage(`Invalid room name ${newRoom} from offsets!`, true);
                        return;
                    }
                    return;
                }

                if (dirArg === "back") {
                    const roomHistory = loadRoomHistory();
                    const targetRoom = roomHistory.pop();
                    console.warn("Navigating back to", targetRoom);
                    if (!targetRoom) {
                        appendConsoleMessage(`No room saved in room history!`, true);
                        return;
                    }
                    saveRoomHistory(roomHistory);
                    if (!goToRoom(targetRoom)) {
                        appendConsoleMessage(`Invalid room ${JSON.stringify(targetRoom)} from history!`, true);
                        return;
                    }
                    return;
                }

                // @navigate E5N5
                if (goToRoomName(dirArg)) return;

                // @navigate $dir
                /** @type {Record<string, string[]>} */
                const dirs = {
                    left:   ["left",   "west"],
                    right:  ["right",  "east"],
                    bottom: ["bottom", "south", "down"],
                    top:    ["top",    "north", "up"  ],
                }
                let dir;
                for (const keyDir in dirs) {
                    const alias = dirs[keyDir].find(aliasDir => dirArg === aliasDir || dirArg[0] === aliasDir[0]);
                    if (alias) {
                        dir = keyDir;
                        break;
                    }
                }
                console.warn(`navigate: arg: "${dirArg}", dir: ${dir}`);
                if (!dir) {
                    appendConsoleMessage(`Unknown direction "${args[0]}"!`, true);
                    return;
                }
                getCurrentRoom().switchRoom(dir);
            },
        },
        {
            name: "n",
            alias: "navigate",
        },
        {
            name: "b",
            alias: ["navigate", "back"],
        },
        {
            name: "replay",
            desc: "Open the replay view",
            run: () => {
                getCurrentRoom().goToHistory();
            }
        },
    ];

    function loadHistory() {
        const history = /** @type {string[]} */ (JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]"));
        console.warn(`History loaded, ${history.length} entries found`);
        window.screepsHistory = history; // TODO: remove, debugging only
        return history;
    }
    window.loadHistory = loadHistory;

    /**
     * @param {string[]} history
     */
    function saveHistory(history) {
        console.warn(`Saving history`, history);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    }

    function clearHistory() {
        historyIdx = -1;
        buffer = "";
        saveHistory([]);
        console.warn(`History cleared`);
    }
    window.clearHistory = clearHistory;

    function getHistorySize() {
        return parseInt(localStorage.getItem(HISTORY_SIZE_KEY)) ?? 100;
    }

    function getCurrentRoom() {
        return angular.element(document.querySelector('.room.ng-scope')).scope().Room;
    }

    function selectedObject() {
        const obj = getCurrentRoom().selectedObject;
        if (!obj) throw new Error("No object selected!");
        return obj;
    }

    const roomHistory = [];
    function loadRoomHistory() {
        return roomHistory;
    }
    window.loadRoomHistory = loadRoomHistory;

    /**
     * @param {RoomHistoryEntry[]} history
     */
    function saveRoomHistory(history) {
        console.warn(`Saving room history`, history);
        // roomHistory.splice(0, roomHistory.length, ...history);
    }

    function clearRoomHistory() {
        roomHistory.splice(0, roomHistory.length);
        console.warn(`Room history cleared`);
    }
    window.clearRoomHistory = clearRoomHistory;

    function getRoomHistorySize() {
        return parseInt(localStorage.getItem(NAVIGATION_SIZE_KEY)) ?? 100;
    }

    function trackRoomNavigation() {
        const currentRoom = /** @type {RoomHistoryEntry} */ (angular.element(document.body).injector().get("$routeParams"));
        console.warn(currentRoom);
        if (!currentRoom.shard || !currentRoom.room) return;

        currentRoom.server = window.location.host;

        const roomHistory = loadRoomHistory();
        const dup = roomHistory.findIndex(h => h.server === currentRoom.server && h.room == currentRoom.room && h.shard === currentRoom.shard);
        if (dup !== -1) {
            roomHistory.splice(dup, 1);
        }
        roomHistory.push({ ...currentRoom });
        while (roomHistory.length > getRoomHistorySize())
            roomHistory.pop();
        console.warn(`Navigated to room ${JSON.stringify(currentRoom)}, navigation stack: ${JSON.stringify(roomHistory)}`);
        saveRoomHistory(roomHistory);
    }

    const MAX_CONSOLE_MESSAGE_COUNT = 100; // From engine

    /**
     * @param {string} msg
     * @param {boolean} [error=false]
     * @returns
     */
    function appendConsoleMessage(msg, error = false) {
        const console = ScreepsAdapter.Console;
        const userId = ScreepsAdapter.User._id;
        console.messages[userId] ??= [];
        if (!console.enabled) return;
        console.messages[userId].push({
            // date: new Date(),
            // shard: getCurrentRoom().shardName,
            text: msg.replace(/\n/g, "<br>"),
            error,
        });
        if (console.messages[userId].length > MAX_CONSOLE_MESSAGE_COUNT)
            console.messages[userId] = console.messages[userId].slice(-MAX_CONSOLE_MESSAGE_COUNT);
    };
    window.appendConsoleMessage = appendConsoleMessage;

    const Range = ace.require("ace/range").Range;

    function addMarker(start, end) {
        console.warn(`addMarker: ${start}-${end}`);
        aceEditor.getSession().addMarker(new Range(1, start, 1, end), "subst-error-highlight", "text", true);
    }

    function clearMarkers() {
        const session = aceEditor.getSession();
        const markers = session.getMarkers(true);
        for (const markerId in markers) {
            if (markers[markerId].clazz === "subst-error-highlight") {
                session.removeMarker(markerId);
            }
        }
        console.warn(`clearMarkers`);
    }

    /**
     * @param {string} line
     * @returns
     */
    function substituteVariables(line) {
        let hasError = false;
        for (const v in CLI_VARS) {
            const regex = new RegExp([`(?<![\w\"'])${VARIABLE_SIGIL}${v}(?![\w\"])`], "g")
            try {
                let replacement = CLI_VARS[v]();
                line = line.replaceAll(regex, replacement);
            } catch (e) {
                for (const match of [...line.matchAll(regex)]) {
                    addMarker(match.index, match.index + match[0].length);
                    hasError = true
                }
            }
        }
        if (hasError) {
            throw new Error("Substitution error");
        }
        console.warn(`final line: ${line}`);
        return line;
    }

    /**
     *
     * @param {string} name
     * @param {string[]} args
     * @returns
     */
    function getCommand(name, args) {
        const cmd = CLI_CMDS.find(c => c.name === name);
        if (Array.isArray(cmd.alias)) {
            args.unshift(cmd.alias[1]);
            return getCommand(cmd.alias[0]);
        } else if (cmd.alias) {
            return getCommand(cmd.alias);
        }
        return cmd;
    }

    /**
     * @param {string} line
     */
    function parseCommand(line) {
        let [cmdName, ...args] = line.split(" ");
        if (!cmdName.startsWith(COMMAND_SIGIL)) return false;
        cmdName = cmdName.slice(1);
        const cmd = getCommand(cmdName, args);
        if (!cmd) {
            appendConsoleMessage(`Unknown console command: ${COMMAND_SIGIL}${cmdName}`, true);
            return true;
        }
        cmd.run(args);
        return true;
    }

    /**
     * @param {string} line
     */
    function executeCommand(line) {
        line = line.replace(/\r?\n/g, " ").trim();
        if (!line.length) return;
        console.warn(`Executing "${line}"`);
        if (parseCommand(line)) {
            return;
        }

        // Is an actual console command for the game
        // We substitute first then add to the history so we don't add an erroring command to the history
        const realLine = substituteVariables(line);
        appendCommand(line);
        const userId = ScreepsAdapter.User._id;
        ScreepsAdapter.Connection.sendConsoleCommand(realLine, userId);
    }

    /**
     * @param {string} line
     */
    function appendCommand(line) {
        console.warn(`appending command: ${line}`);
        const history = loadHistory();

        // If same as a saved line, yank it so it moves to the top of the stack
        const dupIdx = history.findIndex(l => l === line);
        if (dupIdx !== -1) {
            console.warn(`Found dup at #${dupIdx}, removing…`);
            history.splice(dupIdx, 1);
        }

        console.warn(`Adding "${line}" to the history`);
        history.unshift(line);
        if (history.length > getHistorySize()) console.warn(`Too many entries ${history.length - getHistorySize()}, pruning…`);
        while (history.length > getHistorySize())
            history.pop();

        saveHistory(history);
        historyIdx = -1; // Put us back down at the top of the stack
    }

    let timer;
    const setupConsoleHistory = () => {
        const consoleEl = document.querySelector('.console.ng-scope'); // "Top.Game.Console"
        if (!consoleEl) {
            timer = setTimeout(setupConsoleHistory, 500);
            return
        }
        const consoleScope = angular.element(consoleEl).scope();
        const gameConsole = consoleScope.Console;

        // Stop us from overriding multiple times
        if (gameConsole.extendedHistory) {
            return;
        }
        gameConsole.extendedHistory = true;

        window.gameConsole = gameConsole; // TODO: debugging

        const aceEditor = ace.edit(angular.element('.ace_editor')[1])
        window.aceEditor = aceEditor; // TODO: debugging

        // Snippets have a tendency to activate in the middle of other things
        aceEditor.$enableSnippets = false;

        console.warn(`Overriding Console methods`);
        const _sendCommand = gameConsole.sendCommand;
        gameConsole.sendCommand = function() {
            let line = aceEditor.getValue();
            executeCommand(line);
        }

        const _keydown = gameConsole.keydown;
        gameConsole.keydown = function(e) {
            console.warn(`keydown:`, e);
            if (e.keyCode === 38 || e.keyCode === 40) {
                clearMarkers();
                const isPrev = e.keyCode === 38;
                const history = loadHistory();
                if (!history.length) return;
                const lastIdx = historyIdx;
                if (isPrev) {
                    historyIdx = clamp(++historyIdx, -1, history.length - 1);
                } else {
                    historyIdx = clamp(--historyIdx, -1, history.length - 1);
                }

                const value = aceEditor.getValue();
                if (!isPrev && lastIdx === -1 && value === buffer) {
                    // We're at the "editing" entry but it was already restored; clear
                    console.warn("clearing buffer");
                    buffer = "";
                    aceEditor.setValue(buffer);
                    return;
                } else if (!isPrev && lastIdx === 0) {
                    // We're entering the "editing" entry; load it
                    console.warn("restoring buffer");
                    aceEditor.setValue(buffer);
                    return;
                } else if (isPrev && lastIdx === -1) {
                    // We're leaving the "editing" entry; save that
                    console.warn("saving buffer");
                    buffer = aceEditor.getValue();
                }

                const entry = history[historyIdx];
                console.warn(`history entry #${historyIdx}: ${entry ?? '<typing>'}`);
                aceEditor.setValue(entry, 1); // set and place cursor at the end
                return;
            } else if (e.keyCode === 13) {
                this.sendCommand();
                aceEditor.setValue("");
                clearMarkers();
                return;
            }
            _keydown.call(this, e); // Let the game do its thing
        }
        clearTimeout(timer);
    };

    document.addEventListener("readystatechange", async () => {
        await waitFor(() => angular.element(document.body).scope() !== undefined);
        DomHelper.addStyle(`.ace_marker-layer .subst-error-highlight {
            position: absolute;
            background-color: rgba(255, 0, 0, 0.2);
            z-index: 20;
        }`);
        ScreepsAdapter.onViewChange((triggerName) => {
            if (triggerName !== 'roomEntered') {
                return;
            }
            setupConsoleHistory();
        });

        ScreepsAdapter.onRoomChange((room) => {
            console.warn(`Room changed: ${room}`);
            trackRoomNavigation();
        });
    });
})();
// Add a couple more things to the adapter
["Console", "MapUtils"].forEach((key) => {
    Object.defineProperty(ScreepsAdapter, key, {
        get: function() {
            delete this[key];
            Object.defineProperty(this, key, {
                value: angular.element(document.body).injector().get(key)
            });
            return this[key];
        },
        configurable: true
    });
});

["$routeSegment", "$location"].forEach((key) => {
    Object.defineProperty(ScreepsAdapter, key, {
        get: function() {
            return angular.element(document.body).injector().get(key)
        },
        configurable: true
    });
});
