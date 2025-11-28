(() => {

    VERSION = "0.2";

    /**
     * @param {string} a
     * @param {string} b
     */
    function compareVersion(a, b) {
        const partsA = a.split(".");
        const partsB = b.split(".");
        while (partsA.length < partsB.length) partsA.push("0");
        while (partsA.length > partsB.length) partsB.push("0");
        return partsA.reduce((cmp, current, idx) => {
            if (cmp !== 0) return cmp;
            if (current !== partsB[idx])
                return Math.sign(Number(current) - Number(partsB[idx]));
            return 0;
        }, 0);
    }

    if (window.ScreepsAdapter && !window.ScreepsAdapter.VERSION) {
        // This is unversioned adapter, just override
    } else if (window.ScreepsAdapter && compareVersion(window.ScreepsAdapter.VERSION, VERSION) >= 0) {
        // Already loaded a more recent version
        return;
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
                throw new Error('Condition not met before timeout');
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

    async function waitForAngular() {
        await waitFor(() => angular.element(document.body).injector())
    }

    const DomHelper = {};
    DomHelper.addStyle = function (css) {
        let head = document.head;
        if (!head) return;

        let style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;

        head.appendChild(style);
    }

    DomHelper.generateCompiledElement = function(parent, content) {
        let $scope = parent.scope();
        let $compile = parent.injector().get("$compile");
        return $compile(content)($scope);
    }
    window.DomHelper = DomHelper;

    const ScreepsAdapter = {};
    ScreepsAdapter.VERSION = VERSION;

    function notifyViewWatchers(newViewName, oldViewName) {
        /**
        * Compatibility with the old Tutorial-based interception.
        * Tutorial trigger names:
        * - "sendConsole": ({command})
        * - "consoleClick"
        * - "scriptClick"
        * - "submitScript": ({modules})
        * - "survivalModeStarted"
        * - "customModeStarted"
        * - "gameLobby"
        * - "controllerDowngrade": ({controller})
        * - "objectsStart"
        *   - "creep": ({creep})
        *   - "controller": ({controller})
        *   - "road": ({road})
        *   - "constructionSite": : ({constructionSite})
        * - "objectsEnd": ({objects})
        * - "roomEntered"
        * - "view": ({object})
        * - "worldMapEntered"
        *
        */
        const compatViews = {
            "top.game-room": "roomEntered",
            "top.game-world-map": "worldMapEntered",
            "top.game-lobby-world.list": "gameLobby",
            "top.game-lobby-power.list": "gameLobby",
            "top.sim-survival": "survivalModeStarted",
            "top.sim-custom": "customModeStarted",
        };
        let rootScope = angular.element(document.body).scope();
        if (!rootScope.viewChangeCallbacks) return;

        this.currentView = newViewName;

        for (let i in rootScope.viewChangeCallbacks) {
            if (compatViews[newViewName]) {
                rootScope.viewChangeCallbacks[i](compatViews[newViewName]);
            }
            rootScope.viewChangeCallbacks[i](newViewName, oldViewName);
        }
    }

    ScreepsAdapter.currentView = null;

    /**
     * Listen for changes to the main screeps view.
     * Examples: top.game-room, top.game-world-map, etc.
     *
     * For backward-compatibility purposes, the previous names used as view names are still
     * supported, but not recommended: roomEntered, scriptClick, consoleClick, worldMapEntered, gameLobby
     *
     * Those were actually tutorial events, and in some cases were meaningless or ambiguous.
     *
     * @param {(newView: string, oldView: string) => void} callback
     */
    ScreepsAdapter.onViewChange = function (callback) {
        waitForAngular().then(() => {
            let rootScope = angular.element(document.body).scope();
            if (!rootScope.viewChangeCallbacks) {
                const injector = angular.element(document.body).injector();

                const $routeSegment = injector.get('$routeSegment');
                rootScope.$watch(() => $routeSegment.name, (newName, oldName) => {
                    notifyViewWatchers(newName, oldName);
                });


                rootScope.viewChangeCallbacks = [];
            }

            rootScope.viewChangeCallbacks.push(callback);
        });
    };

    /**
     * Execute a callback if the URL hash changes.
     *
     * @param {(hash: string) => void} callback
     */
    ScreepsAdapter.onHashChange = function (callback) {
        waitForAngular().then(() => {
            const rootScope = angular.element(document.body).scope();
            if (!rootScope.hashChangeCallbacks) {
                rootScope.$watch(() => window.location.hash, function(newVal, oldVal) {
                    for (let i in rootScope.hashChangeCallbacks) {
                        rootScope.hashChangeCallbacks[i](window.location.hash);
                    }
                });

                rootScope.hashChangeCallbacks = [];
            }

            rootScope.hashChangeCallbacks.push(callback);
        });
    };

    /**
     * Execute a callback if the current room changes.
     * @param {(roomName: string) => void} callback
     */
    ScreepsAdapter.onRoomChange = function (callback) {
        ScreepsAdapter.onHashChange((hash) => {
            let rootScope = angular.element(document.body).scope();
            let $routeParams = angular.element(document.body).injector().get("$routeParams");
            let room = $routeParams.room;
            if (room !== rootScope.lastRoom) {
                callback(room);
                rootScope.lastRoom = room;
            }
        });
    };

    let currentRoomScope = null;
    let unwatchSelectedObject = null;
    async function watchSelectedObject(callback) {
        // We need a room
        await waitFor(() => angular.element(document.querySelector(".room.ng-scope")).scope())

        const scope = angular.element(document.querySelector(".room.ng-scope")).scope();
        if (scope && scope !== currentRoomScope) {
            // If we had an old watcher, remove it.
            if (unwatchSelectedObject) {
                unwatchSelectedObject();
                unwatchSelectedObject = null;
            }

            // Attach the watcher
            unwatchSelectedObject = scope.$watch(
                () => scope.Room?.selectedObject,
                (newVal, oldVal) => {
                    if (newVal !== oldVal) {
                        callback(newVal, oldVal);
                    }
                }
            );

            currentRoomScope = scope;
        }

        return unwatchSelectedObject;
    }

    function notifySelectionWatchers(object) {
        const rootScope = angular.element(document.body).scope();
        for (const callback of rootScope.objectSelectionCallbacks) {
            callback({ object });
        }
    }

    let watch;

    /**
     * Execute a callback when the selected object changes in a room.
     * @param {({ object: any})} callback
     */
    ScreepsAdapter.onSelectionChange = function(callback) {
        waitForAngular().then(() => {
            const rootScope = angular.element(document.body).scope();
            if (!rootScope.objectSelectionCallbacks) {
                rootScope.objectSelectionCallbacks = [];
                ScreepsAdapter.onViewChange((viewName, oldView) => {
                    const roomViews = ["top.game-room", "top.sim-custom", "top.sim-survival", "top.sim-tutorial"];
                    if (watch) watch();
                    if (roomViews.includes(viewName)) {
                        watchSelectedObject((newObj, oldObj) => {
                            notifySelectionWatchers(newObj);
                        }).then((watcher) => watch = watcher);
                    }
                    if (roomViews.includes(oldView)) {
                        // We notify here so listeners can deselect their stuff
                        notifySelectionWatchers(null);
                    }
                });
            }
            rootScope.objectSelectionCallbacks.push(callback);
        })
    }

    // aliases to angular services
    Object.defineProperty(ScreepsAdapter, "User", {
        get: function() {
            delete this.User;
            Object.defineProperty(this, "User", {
                value: angular.element(document.body).scope().Me()
            });
            return this.User;
        },
        configurable: true
    });

    // Define a couple properties for quick access
    ["$timeout", "$routeSegment", "$location", "Api", "Connection", "Console", "MapUtils", "Socket"].forEach((key) => {
        Object.defineProperty(ScreepsAdapter, key, {
            get: function() {
                return angular.element(document.body).injector().get(key)
            },
            configurable: true
        });
    });

    window.ScreepsAdapter = ScreepsAdapter;
})();
