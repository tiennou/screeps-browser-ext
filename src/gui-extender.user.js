/* globals angular, $, _ */

// ==UserScript==
// @name         Screeps GUI Extender
// @description  Extends the Screeps GUI with additional information and controls
// @namespace    https://screeps.com/
// @version      0.0.1
// @author       Dr. Dvorak
// @author       James Cook
// @tag          games
// @tag          screeps
// @match        https://screeps.com/a/*
// @match        https://screeps.com/ptr/*
// @match        http://*.localhost:*/(*)/#!/*
// @run-at       document-idle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @require      REPO_URL/screeps-browser-core.js
// @downloadUrl  REPO_URL/gui-extender.js
// ==/UserScript==

/*
 * Extend/modify various aspects of the Screeps GUI, including:
 * - General:
 *   - Automatically unlock CPU on PTR
 * - Top nav bar:
 *   - Add link while on MMO/PTR to toggle between them
 *   - Show current Game.time (Room view only)
 *   - Show current GCL and progress bar to next level (links to profile page)
 *   - Show current GPL and progress bar to next level (links to power creep page)
 * - WorldMap:
 *   - Hide client update notification (due to false positive on PTR)
 * - Room:
 *   - Display Console tab by default instead of Script tab on room views
 *   - Increase Console font size
 *   - Add button to toggle Console dock between bottom and left sides
 *   - Auto-collapse World Room accordion tab on right column
 *   - Auto-hide room Decorations accordion tab on right column
 *   - Auto-hide creep Decorations section on right column
 *   - Display additional properties in right column for selected objects
 *   - Display move controls in right column for selected creeps/powerCreeps
 * - Player Overview and Profile:
 *   - Display total energy consumption (currently broken / disabled)
 */
ScreepsAdapter.ready(() => {

  /**
   * @param {(args: ...any)=> void} callback
   * @param {number} delay
   * @returns
   */
  function debounce(callback, delay) {
    let timeout;
    return (...args) => {
      let context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => { callback.apply(context, args); }, delay);
    };
  }

  /** Unlock CPU on PTR */
  function unlockPtrCpu() {
    const scope = angular.element(document.body).scope();
    const Me = scope && scope.Me();
    const Api = ScreepsAdapter.Api;
    if (!scope || !Me || !Api) {
      setTimeout(unlockPtrCpu, 50);
      return;
    }

    // Only run on PTR
    if (!scope.ptr) {
      return;
    }

    // Only run if CPU has not been unlocked on PTR but is on MMO
    // (sum of shard CPU limits will be higher than total CPU limit)
    const shardLimits = Me.cpuShard;
    const cpu = Math.max(Me.cpu, _.sum(shardLimits));
    if (Me.cpu > 20 || Me.cpu === cpu) {
      return;
    }

    // Unlock CPU
    Api.post('user/activate-ptr').then((result) => {
      console.info('[screeps-gui-extender] unlocked CPU on PTR:', result);

      setTimeout(updatePtrShardCpuLimits, 3000);

      ScreepsAdapter.showDialog({
        title: 'Unlocked CPU',
        innerHTML: `<p>CPU unlocked for 7 days on PTR</p>`,
      });
    }).catch((error) => {
      console.error('[screeps-gui-extender] error activating CPU on PTR:', error);

      ScreepsAdapter.showDialog({
        title: 'Error Unlocking CPU on PTR',
        innerHTML: `<p>Error: ${error}</p>`,
      });
    });
  }
  unlockPtrCpu();

  /** Update shard CPU limits on PTR */
  function updatePtrShardCpuLimits() {
    const scope = angular.element(document.body).scope();
    const Me = scope && scope.Me();
    const Api = ScreepsAdapter.Api;
    if (!scope || !Me || !Api) {
      setTimeout(updatePtrShardCpuLimits, 51);
      return;
    }

    // Only run on PTR
    if (!scope.ptr) {
      return;
    }

    // Skip if CPU has not been unlocked (will be called again after unlock)
    if (Me.cpu <= 20) {
      return;
    }

    // Determine target shard CPU limits
    const shardLimits = Me.cpuShard;
    const activeShardNames = _(shardLimits).map((shardCpu, shardName) => (shardCpu > 0 ? shardName : null)).compact().value();
    const numShards = activeShardNames.length;
    const totalCpu = Math.max(Me.cpu, _.sum(shardLimits));
    const shard3CpuLimit = 60;
    const shard3Cpu = totalCpu > shard3CpuLimit * numShards ?
      shard3CpuLimit :
      Math.floor(totalCpu / numShards);
    const subtotalCpu = activeShardNames.includes('shard3') ?
      totalCpu - shard3Cpu :
      totalCpu;
    const avgShardCpu = subtotalCpu / numShards;
    const otherShardsCpu = Math.floor(avgShardCpu);
    const firstShardCpu = subtotalCpu - ((numShards - (activeShardNames.includes('shard3') ? 2 : 1)) * otherShardsCpu);
    const firstShardName = activeShardNames[0];
    const newShardLimits = _(shardLimits)
      .map((shardCpu, shardName) => {
        if (!shardCpu) {
          return [shardName, shardCpu];
        }
        if (shardName === 'shard3') {
          return [shardName, shard3Cpu];
        }
        return [shardName, shardName === firstShardName ? firstShardCpu : otherShardsCpu];
      })
      .zipObject()
      .value();
    if (JSON.stringify(shardLimits) === JSON.stringify(newShardLimits)) {
      console.debug('[screeps-gui-extender] shard CPU limits already match target limits; current:', shardLimits, '; target:', newShardLimits);
      return;
    }

    // Update CPU limits via private API endpoint
    Api.post('user/cpu-shards', { cpu: newShardLimits }).then((result) => {
      console.info('[screeps-gui-extender] updated CPU shard limits:', result, '\ncurrent shard CPU limits:', shardLimits, '\ntarget shard CPU limits:', newShardLimits);

      // Show dialog
      $('body').append(`<style type="text/css">
        app-dlg-alert table.update-ptr-cpu {
          margin: 0 auto;
        }
        app-dlg-alert table.update-ptr-cpu th, app-dlg-alert .update-ptr-cpu td {
          padding: 4px 8px;
        }
        app-dlg-alert table.update-ptr-cpu th[scope="row"] {
          text-align: left;
        }
        app-dlg-alert table.update-ptr-cpu td {
          text-align: right;
        }
      </style>`);
      ScreepsAdapter.showDialog({
        title: 'PTR Shard CPU Limits Updated',
        innerHTML: `
          <table class="update-ptr-cpu">
            <thead><tr><th scope="col">Shard</th><th scope="col">Previous<br />Limit</th><th scope="col">New<br />Limit</th></tr></thead>
            <tbody>
              ${_(shardLimits).keys().map((shardName) => `<tr><th scope="row">${shardName}</td><td>${shardLimits[shardName]}</td><td>${newShardLimits[shardName]}</td></tr>`).join('\n')}
            </tbody>
          </table>
        `,
      });
    }).catch((error) => {
      console.error('[screeps-gui-extender] error updating shard CPU limits:', error);
      ScreepsAdapter.showDialog({
        title: 'Error Updating PTR Shard CPU Limits',
        innerHTML: `<p>Error: ${error}</p>`,
      });
    });
  }
  // Disabled in public version since not all users will want this behavior
  //updatePtrShardCpuLimits();

  /**
   * Activate a specific bottom nav tab
   * @param tabName: 'script' | 'console' | 'memory'
   */
  function selectNavTab(tabName) {
    angular.element('.nav-tabs .ng-scope').controller().activeTab = tabName;
  }

  // Change default bottom nav tab to Console in Room view
  window.shouldOverrideScriptClick = false;
  ScreepsAdapter.onViewChange((triggerName) => {
    if (triggerName === 'roomEntered') {
      window.shouldOverrideScriptClick = true;
      return;
    }

    if (triggerName === 'scriptClick' && window.shouldOverrideScriptClick) {
      window.shouldOverrideScriptClick = false;
      selectNavTab('console');
    }
  });

  // Add a link to the navbar to toggle between MMO and PTR
  function addMmoPtrToggleLink() {
    // Only do this when using the web client for MMO or PTR
    const path = String(window.location.pathname);
    if (window.location.hostname !== 'screeps.com' || (!path.startsWith('/a/') && !path.startsWith('/ptr/'))) {
      return;
    }

    // Skip if button has already been added
    if (angular.element('.mmo-ptr-toggle').length) {
      return;
    }

    // Wait for relevant views/scopes to be ready
    let targetElem = angular.element('.top-content .navbar .navbar-header .navbar-brand')[0];
    if (!targetElem) {
      setTimeout(addMmoPtrToggleLink, 50);
      return;
    }

    // Add styles
    $('body').append(`<style type='text/css'>
      /* Style the MMO/PTR toggle link similarly to the credits/inventory links */
      header .mmo-ptr-toggle a:hover {
        color: inherit;
        background: #292929;
      }
      header .mmo-ptr-toggle .--flex {
        padding: 0px 8px;
      }
    </style>`);

    // Determine link locations
    let isMMO = path.startsWith('/a/');
    let href = (
      (isMMO ? path.replace('/a/', '/ptr/') : path.replace('/ptr/', '/a/'))
        + window.location.hash
        + window.location.search
    );
    let label = isMMO ? 'MMO' : 'PTR';
    let targetLabel = isMMO ? 'PTR' : 'MMO';

    // Insert toggle link
    const newElem = angular.element(`
      <div class="mmo-ptr-toggle --flex" title="Go to ${targetLabel}" style="float: left; line-height: 40px; margin: 0 8px 0 0;">
        <div class="--color-text-80">
          <a class="--flex" href="${href}" style="text-decoration: none;">
            ${label}
          </a>
        </div>
      </div>
    `);
    newElem.insertAfter(targetElem);

    // Update toggle link's hash when client hash changes
    ScreepsAdapter.onHashChange((hash) => {
      const hrefAttr = angular.element('.mmo-ptr-toggle a')[0].attributes.href;
      hrefAttr.value = hrefAttr.value.split('#')[0] + window.location.hash + window.location.search;
    });
  }
  addMmoPtrToggleLink();

  // Customize editor panel and add docking side toggle button
  function customizeEditorPanel() {
    const aceEditor = angular.element('.console-input .ace_editor');
    if (!aceEditor.length) {
      setTimeout(customizeEditorPanel, 50);
      return;
    }

    if (angular.element('.btn-panel-dock').length) {
      return
    }

    // Local storage keys
    // TODO: Add an abstraction for this
    const isPtr = angular.element('body').scope().ptr;
    const fontSizeKey = `${isPtr ? 'ptr:' : ''}console.fontSize`;
    const wordWrapKey = `${isPtr ? 'ptr:' : ''}console.wordWrap`;
    const dockLeftKey = `${isPtr ? 'ptr:' : ''}game.editor.dockLeft`;
    const minimizedKey = `${isPtr ? 'ptr:' : ''}game.editor.hidden`;
    const heightKey = `${isPtr ? 'ptr:' : ''}game.editor.height`;
    const widthKey = `${isPtr ? 'ptr:' : ''}game.editor.width`;

    if (!localStorage.getItem(fontSizeKey)) {
      localStorage.setItem(fontSizeKey, 12);
    }
    let fontSize = parseInt(localStorage.getItem(fontSizeKey));

    // Add styling
    $('body').append(`<style type='text/css'>
      section.console.ng-scope .console-messages-list .console-message {
        line-height: 1.5;
      }

      /* Dock editor/console/memory panel on the right instead of the bottom */
      .editor-panel .btn-panel-dock {
        position: absolute;
        right: 56px;
        top: 5px;
        width: 22px;
        height: 22px;
        padding: 3px 0;
        text-align: center;
        cursor: pointer;
        border-radius: 2px;
      }
      .editor-panel .btn-panel-dock:hover {
        background-color: #555;
      }
      .editor-panel .btn-panel-dock.dock-bottom svg {
        transform: rotate(-90deg);
      }
      .resize-handle-horizontal {
        position: absolute;
        left: 100%;
        top: 0px;
        width: 10px;
        height: 100%;
        background-color: #3B3E40;
        border-left: 1px solid #333;
        cursor: ew-resize;
      }

      /* Enables console message word wrapping when enabled via left column toggle button */
      section.console .console-messages-list.wrap-text .console-message span {
        text-wrap-mode: wrap;
        white-space-collapse: preserve;
      }
    </style>`);

    // Add docking side toggle button and behavior
    const dockLeftTitle = "Dock to Left";
    const dockBottomTitle = "Dock to Bottom";
    const dockToggleButton = angular.element(`<div class="btn-panel-dock" style="font-size: 0;" title="${dockBottomTitle}">
      <svg
        width="16" height="16"
        style="stroke: #999999; stroke-width: 2; fill: transparent;"
        xmlns="http://www.w3.org/400/svg"
      >
        <path d="M 1 1 H 15 V 15 H 1 Z"></path>
        <path d="M 1 1 H 6 V 15 H 1 Z" fill="#999999"></path>
      </svg>
    </div>`);
    dockToggleButton.insertAfter(angular.element('.btn-panel-popup.ng-scope'));

    const editorPanel = angular.element('.editor-panel');
    const editorPanelElem = editorPanel[0];
    const roomElem = angular.element('section.room')[0];
    const resizeHandle = $('.resize-handle');
    const resizeVertHandler = $._data($('.resize-handle')[0], 'events').mousedown[0].handler;

    const updatePanelDocking = (toggled) => {
      // section.room element is recreated when switching between history and room views;
      // need to ensure reference to it is up-to-date
      const editorPanel = angular.element('.editor-panel');
      const editorPanelElem = editorPanel[0];
      const roomElem = angular.element('section.room')[0];

      localStorage.setItem(dockLeftKey, toggled);

      if (toggled) {
        // Dock panel to left
        const editorWidth = localStorage.getItem(widthKey) || Math.floor(window.screen.width * 0.4).toString();
        localStorage.setItem(widthKey, editorWidth);
        editorPanelElem.style.width = `${editorWidth}px`;
        editorPanelElem.style.height = '100%';
        roomElem.style.left = `${parseInt(editorWidth) + 5}px`;
        roomElem.style.bottom = '0';

        // Adjust positioning of left-side controls (world map, history, etc)
        angular.element('.left-controls')[0].style['margin-left'] = '11px';

        // Show horizontal resize handle
        angular.element('.resize-handle-horizontal').show();

        // Disable vertical resize
        $('.resize-handle').off('mousedown');
        angular.element('.resize-handle')[0].style.cursor = 'default';

        // Update button style and tooltip
        dockToggleButton.addClass('dock-bottom');
        dockToggleButton.attr('title', dockBottomTitle);
      } else {
        // Dock panel to bottom
        const editorHeight = localStorage.getItem(heightKey);
        editorPanelElem.style.width = '100%';
        editorPanelElem.style.height = `${editorHeight}px`;
        roomElem.style.left = '0';
        roomElem.style.bottom = `${editorHeight}px`;

        // Reset positioning of left-side controls (world map, history, etc)
        angular.element('.left-controls')[0].style['margin-left'] = null;

        // Hide horizontal resize handle
        angular.element('.resize-handle-horizontal').hide();

        // Enable vertical resize
        $('.resize-handle').on('mousedown', resizeVertHandler);
        angular.element('.resize-handle')[0].style.cursor = null;

        // Update button style and tooltip
        dockToggleButton.removeClass('dock-bottom');
        dockToggleButton.attr('title', dockLeftTitle);
      }

      angular.element('section.room').scope().$broadcast('resize', { sameSize: !0 });

      // Update minimized state
      localStorage.setItem(minimizedKey, false);
      $('.btn-panel-toggle').removeClass('minimized');
    };
    dockToggleButton.on('click', (e) => {
      updatePanelDocking(!(localStorage.getItem(dockLeftKey) === "true"));
    });

    // Update popup/minimize buttons to force dock to bottom before triggering
    const fixPanelBtnCompatibility = (selector) => {
      const panelButton = $(selector);
      const clickHandler = $._data(panelButton[0], 'events').click[0].handler;
      panelButton.off('click');
      panelButton.on('click', (e) => {
        updatePanelDocking(false);
      });
      panelButton.on('click', clickHandler);
    };
    fixPanelBtnCompatibility('.btn-panel-popup');
    fixPanelBtnCompatibility('.btn-panel-toggle');

    const resizeHandleElem = angular.element(`<div class="resize-handle-horizontal"></div>`);
    resizeHandleElem.insertBefore(angular.element('.resize-handle')[0]);
    resizeHandleElem.on('mousedown', (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();

      const resizeHorizHandler = (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        const editorWidth = e.clientX;
        localStorage.setItem(widthKey, editorWidth);
        editorPanelElem.style.width = `${editorWidth}px`;
        roomElem.style.left = `${editorWidth + 5}px`;
        angular.element('section.room').scope().$broadcast('resize', { sameSize: !0 });
      };
      const endResizeHorizHandler = (e) => {
        editorPanel.off('mousemove.resizeHorizontal');
        resizeHandleElem.off('mousemove.resizeHorizontal');
        angular.element('section.room').off('mousemove.resizeHorizontal');
        resizeHandleElem.off('mouseup.resizeHorizontal');
      };

      editorPanel.on('mousemove.resizeHorizontal', resizeHorizHandler);
      resizeHandleElem.on('mousemove.resizeHorizontal', resizeHorizHandler);
      angular.element('section.room').on('mousemove.resizeHorizontal', resizeHorizHandler);
      resizeHandleElem.on('mouseup.resizeHorizontal', endResizeHorizHandler);
    });

    // Initialize editor panel docking state
    if (!(localStorage.getItem(minimizedKey) === "true")) {
      setTimeout(() => { updatePanelDocking(localStorage.getItem(dockLeftKey)); }, 0);
    } else {
      angular.element('.resize-handle-horizontal').hide();
    }

    // Add word wrap toggle button to console left column controls
    // TODO: Use tooltip-placement="right" uib-tooltip="Toggle word wrap" instead of title
    //  after fixing scope issue caused by re-compiling elements
    const wordWrapElem = angular.element(`<button class="md-primary md-hue-1 md-button md-ink-ripple" style="font-size: 0;" title="Toggle word wrap">
      <svg
        width="14" height="14"
        style="stroke: #7986cb; stroke-width: 1.5; fill: transparent; display: inline-block;"
        xmlns="http://www.w3.org/400/svg"
      >
        <line x1="2" y1="2" x2="12" y2="2"></line>
        <path d="M 2 6 H 8 C 14 6 14 10 8 10"></path>
        <line x1="8" y1="10" x2="10" y2="8"></line>
        <line x1="8" y1="10" x2="10" y2="12"></line>
        <line x1="2" y1="10" x2="6" y2="10"></line>
        <line class="word-wrap-disabled" x1="1" y1="13" x2="13" y2="1"></line>
      </svg>
    </button>`);
    wordWrapElem.insertAfter(angular.element('.console-controls button')[0]);

    const updateWordWrap = () => {
      const enabled = (localStorage.getItem(wordWrapKey) === "true");
      const [listMethod, buttonMethod] = enabled ?
        ['addClass', 'hide'] :
        ['removeClass', 'show'];
      angular.element('.console-messages-list')[listMethod]('wrap-text');
      angular.element('button svg .word-wrap-disabled')[buttonMethod]();
    }
    wordWrapElem.on('click', (e) => {
      localStorage.setItem(wordWrapKey, !(localStorage.getItem(wordWrapKey) === "true"));
      updateWordWrap();
    });
    updateWordWrap();

    // Add font size up/down buttons to console left column controls
    // TODO: Use tooltip-placement="right" uib-tooltip="Increase font size" instead of title
    //  after fixing scope issue caused by re-compiling elements
    const fontSmallerElem = angular.element(`<button class="md-primary md-hue-1 md-button md-ink-ripple" style="font-size: 0;" title="Decrease font size">
      <svg
        width="14" height="14"
        style="stroke: #7986cb; stroke-width: 1.5; fill: transparent; display: inline-block;"
        xmlns="http://www.w3.org/400/svg"
      >
        <line x1="1" y1="12" x2="5" y2="2"></line>
        <line x1="5" y1="2" x2="9" y2="12"></line>
        <line x1="3" y1="8" x2="7" y2="8"></line>
        <line x1="9" y1="4" x2="13" y2="4" style="stroke-width: 1;"></line>
      </svg>
    </button>`);
    fontSmallerElem.insertAfter(angular.element('.console-controls button')[0]);

    const fontLargerElem = angular.element(`<button class="md-primary md-hue-1 md-button md-ink-ripple" style="font-size: 0;" title="Increase font size">
      <svg
        width="14" height="14"
        style="stroke: #7986cb; stroke-width: 1.5; fill: transparent; display: inline-block;"
        xmlns="http://www.w3.org/400/svg"
      >
        <line x1="1" y1="12" x2="5" y2="2"></line>
        <line x1="5" y1="2" x2="9" y2="12"></line>
        <line x1="3" y1="8" x2="7" y2="8"></line>
        <line x1="8" y1="4" x2="14" y2="4" style="stroke-width: 1;"></line>
        <line x1="11" y1="1" x2="11" y2="7" style="stroke-width: 1;"></line>
      </svg>
    </button>`);
    fontLargerElem.insertAfter(angular.element('.console-controls button')[0]);

    const updateFontSize = (delta) => {
      fontSize += delta;
      localStorage.setItem(fontSizeKey, `${fontSize}px`);
      angular.element('#console-font-size').remove();
      $('body').append(`<style id='console-font-size' type='text/css'>
        /* Increase console font size */
        section.console.ng-scope,
        .console-input .ace_editor {
          font-size: ${fontSize}px;
        }
        section.console.ng-scope .console-messages-list .console-message .ng-scope {
          font-size: ${fontSize - 2}px;
        }
      </style>`);
      angular.element('.console-input .ace_editor')[0].env.editor.setOptions({
        fontSize,
      });
      if (delta) {
        console.info(`[screeps-gui-extender] updated console font size: ${fontSize}px`);
      }
    };
    fontSmallerElem.on('click', (e) => updateFontSize(-1));
    fontLargerElem.on('click', (e) => updateFontSize(1));
    updateFontSize(0);

    // Customize Console input editor settings;
    // to get a reference to the Script tab's editor, use this selector: 'section.script .ace_editor'
    const editor = angular.element('.console-input .ace_editor')[0].env.editor;
    editor.setOptions({
      copyWithEmptySelection: true,
      dragEnabled: false,
      enableMultiselect: false,
      fontSize: fontSize,
      tabSize: 2,
      tooltipFollowsMouse: false,
      wrapBehavioursEnabled: false,
    });

  }
  ScreepsAdapter.onViewChange((triggerName) => {
    if (triggerName !== 'roomEntered') {
      return;
    }

    customizeEditorPanel();
  });
  customizeEditorPanel();

  // Hack to fix game renderer viewport dimensions for side-docked editor panel
  // when returning to room view from history view
  let isHistoryViewActive = window.location.hash.startsWith('#!/history/');
  const fixViewForHistoryTransition = () => {
    if (window.location.hash.startsWith('#!/room/')) {
      if (isHistoryViewActive && (!angular.element('.editor-panel').length || !angular.element('section.room').length)) {
        setTimeout(fixViewForHistoryTransition, 50);
        return;
      }

      if (isHistoryViewActive) {
        const isPtr = angular.element('body').scope().ptr;
        const dockLeftKey = `${isPtr ? 'ptr:' : ''}game.editor.dockLeft`;
        const widthKey = `${isPtr ? 'ptr:' : ''}game.editor.width`;
        const toggled = (localStorage.getItem(dockLeftKey) === "true");
        if (toggled) {
          setTimeout(() => {
            const editorWidth = localStorage.getItem(widthKey) || Math.floor(window.screen.width * 0.4).toString();
            angular.element('section.room')[0].style.left = `${parseInt(editorWidth) + 5}px`;
            angular.element('section.room')[0].style.bottom = '0';
            angular.element('section.room').scope().$broadcast('resize', { sameSize: !0 });
          }, 750);
        }
      }
      isHistoryViewActive = false;
    }

    if (window.location.hash.startsWith('#!/history/')) {
      isHistoryViewActive = true;
    }
  };
  ScreepsAdapter.onHashChange(fixViewForHistoryTransition);

  // Auto-collapse World Room right-column tab in Room view
  function collapseWorldRoomTab() {
    const asideBlockElem = angular.element('.world-room .aside-block-header');
    if (!asideBlockElem || !asideBlockElem.scope()) {
      setTimeout(collapseWorldRoomTab, 50);
      return;
    }

    asideBlockElem.scope().AsideBlock.show = false;
  }
  ScreepsAdapter.onViewChange((triggerName) => {
    if (triggerName !== 'roomEntered') {
      return;
    }

    collapseWorldRoomTab();
  });
  collapseWorldRoomTab();

  // Add styling to hide Room/Creep decoration UIs from the right column
  $('body').append(`<style type='text/css'>
    .aside-content .room-decorations {
      display: none !important;
    }

    .aside-block .aside-block-content .body[ng-if="Top.hasFeature('inventory') && CreepProperties.getDecorations().length > 0"] {
      display: none !important;
    }
  </style>`);

  // Removes the false positive update notification on PTR
  ScreepsAdapter.onViewChange((triggerName) => {
    if (triggerName !== 'view') {
      return;
    }

    // Ensure this change only occurs on PTR
    if (angular.element(document.body).scope().ptr) {
      angular.element('.dlg-version-updated').remove();
    }
  });

  // Add game clock to top navbar
  function initGameClockDisplay() {
    // Wait for relevant views/scopes to be ready
    let targetElem = angular.element('.navbar-resources.--flex.ng-scope');
    let injector = targetElem.injector();
    let viewScope = angular.element('section.room').scope();
    if (!injector || !viewScope) {
      setTimeout(initGameClockDisplay, 50);
      return;
    }

    // Create display element
    let compile = injector.get('$compile');
    let newElem = angular.element(`
      <div class="game-time --flex" style="float: right; line-height: 40px; margin: 0 8px;">
        <div class="--color-text-80">
          <span class="--flex">
            🕙 {{Room.gameTime.toLocaleString()}}
          </span>
        </div>
      </div>
    `);
    compile(newElem)(viewScope);
    newElem.insertAfter(targetElem);
  };
  ScreepsAdapter.onHashChange((hash) => {
    const clockElem = angular.element('.game-time.--flex')[0];
    if (hash.startsWith('#!/room/')) {
      if (!clockElem) {
        initGameClockDisplay();
      }
      return;
    }

    if (clockElem) {
      clockElem.remove();
    }
  });

  // Add GPL display / power creep link to top navbar
  function initGplDisplay() {
    // Remove old display
    angular.element('.gpl-display').remove();

    // Wait for relevant views/scopes to be ready
    const targetElem = angular.element('.navbar-resources.--flex.ng-scope .--color-text-80.ng-scope');
    const viewScope = targetElem.scope() && targetElem.scope().$parent;
    const compile = ScreepsAdapter.$compile;
    if (!viewScope || !compile) {
      setTimeout(initGplDisplay, 50);
      return;
    }

    // TODO: Use POWER_LEVEL_MULTIPLY and POWER_LEVEL_POW pulled from `angular.element('section.room').scope().Room.Constants`
    const multiply = 1000;
    const pow = 2;
    viewScope.getPowerLevelProgress = (Me) => {
      const me = Me();
      const level = me.getPowerLevel();
      const toCurrent = level ? Math.round(multiply * Math.pow(level, pow)) : 0;
      const progress = me.power - toCurrent;
      const progressTotal = Math.round(multiply * Math.pow(level + (level ? 1 : 0), pow)) - toCurrent;
      return `${(progress || 0).toLocaleString()} / ${(progressTotal || 0).toLocaleString()}`;
    };
    viewScope.getPowerLevelFloat = (Me) => {
      const me = Me();
      const level = me.getPowerLevel();
      const toCurrent = level ? Math.round(multiply * Math.pow(level, pow)) : 0;
      const progress = me.power - toCurrent;
      const progressTotal = Math.round(multiply * Math.pow(level + (level ? 1 : 0), pow)) - toCurrent;
      const progressFloat = level + Math.floor((progress / progressTotal) * 1000) / 1000;
      return progressFloat.toFixed(3);
    };

    // Create display element
    const newElem = angular.element(`
      <div class="gpl-display --color-text-80" uib-tooltip-html="('Next level:<br/>' + getPowerLevelProgress(Me)) | trust" tooltip-placement="bottom">
        <a class="--flex ng-binding" ng-href="#!/overview/power" href="#!/overview/power">
          GPL {{getPowerLevelFloat(Me)}}
        </a>
      </div>
    `);
    compile(newElem)(viewScope);
    newElem.insertBefore(targetElem[0]);
  }
  initGplDisplay();

  // Add GCL display / profile overview link to top navbar
  function initGclDisplay() {
    // Remove old display
    angular.element('.gcl-display').remove();

    // Wait for relevant views/scopes to be ready
    const targetElem = angular.element('.navbar-resources.--flex.ng-scope .--color-text-80.ng-scope');
    const viewScope = targetElem.scope() && targetElem.scope().$parent;
    const compile = ScreepsAdapter.$compile;
    if (!viewScope || !compile) {
      setTimeout(initGclDisplay, 50);
      return;
    }

    // TODO: Use GCL_MULTIPLY and GCL_POW pulled from `angular.element('section.room').scope().Room.Constants`
    const multiply = 1000000;
    const pow = 2.4;
    viewScope.getGclProgress = (Me) => {
      const me = Me();
      const level = me.getGcl();
      const toCurrent = Math.round(multiply * Math.pow(level - 1, pow));
      const progress = me.gcl - toCurrent;
      const progressTotal = Math.round(multiply * Math.pow(level, pow)) - toCurrent;
      return `${(progress || 0).toLocaleString()} / ${(progressTotal || 0).toLocaleString()}`;
    };
    viewScope.getGclFloat = (Me) => {
      const me = Me();
      const level = me.getGcl();
      const toCurrent = Math.round(multiply * Math.pow(level - 1, pow));
      const progress = me.gcl - toCurrent;
      const progressTotal = Math.round(multiply * Math.pow(level, pow)) - toCurrent;
      const progressFloat = level + Math.floor((progress / progressTotal) * 1000) / 1000;
      return progressFloat.toFixed(3);
    };

    // Create display element
    const newElem = angular.element(`
      <div class="gcl-display --color-text-80" uib-tooltip-html="('Next level:<br/>' + getGclProgress(Me)) | trust" tooltip-placement="bottom">
        <a class="--flex ng-binding" ng-href="#!/overview" href="#!/overview">
          GCL {{getGclFloat(Me)}}
        </a>
      </div>
    `);
    compile(newElem)(viewScope);
    newElem.insertBefore(targetElem[0]);
  }
  initGclDisplay();

  /**
   * Helper function to extend display properties of an object
   * @param objectType: string -- if defined, must be one of the following values:
   *   - One of the `STRUCTURE_*` const values
   *   - creep
   *   - powerCreep
   *   - source
   *   - mineral
   *   - deposit
   *   - resource
   *   - tombstone
   *   - ruin
   *   - nuke
   *   - flag
   * @param callback: (selectedObject: RoomObject, objectPropsElem: HTTPElement) => void
   */
  function updateObjectProperties(objectType, callback) {
    ScreepsAdapter.onViewChange((triggerName) => {
      if (triggerName !== 'view') {
        return;
      }

      let roomScope = angular.element('section.room').scope();
      let selectedObject = roomScope.Room.selectedObject;
      if (!selectedObject || (objectType && selectedObject.type !== objectType)) {
        return;
      }

      setTimeout(() => {
        let objectPropsElem = angular.element('.object-properties .aside-block-content');
        if (!objectPropsElem[0]) {
          return;
        }

        callback(selectedObject, objectPropsElem);
      }, 50);
    });
  }

  /**
   * Called by creep/powerCreep movement buttons to move the selected creep
   * in the button's assigned direction
   */
  function move(event) {
    const selectedObject = angular.element('section.room').scope().Room.selectedObject;
    if (!selectedObject || (selectedObject.type !== 'creep' && selectedObject.type !== 'powerCreep')) {
      console.warn('[screeps-gui-extender] selected object is missing or not a creep/powerCreep:', selectedObject);
      return;
    }

    const room = angular.element('section.room').scope().Room;
    const roomName = room.roomName;
    const shardName = room.shardName;
    const btnElem = angular.element(event.currentTarget);
    const directionName = btnElem.data('direction-name');
    const directionValue = btnElem.data('direction-value');

    ScreepsAdapter.Api.post('game/add-object-intent', {
      _id: selectedObject._id,
      room: roomName,
      name: 'move',
      intent: {
        direction: directionValue,
      },
      shard: shardName,
    });

    console.debug(`[screeps-gui-extender] moving ${selectedObject.type} ${selectedObject._id} in direction ${directionName}`);
  };

  const moveCtrlsClass = 'move-ctrls';
  const moveCtrlClass = 'move-ctrl';
  const moveBtnClass = 'move-btn';

  /**
   * Add movement controls to creeps / power creeps
   */
  function addMovementControls(objectType, objectPropsElem) {
    // Don't add duplicate sets of controls
    if (objectPropsElem.find(`${objectPropsElem.selector} .${moveCtrlsClass}`).length) {
      return;
    }

    // Build movement controls element
    const ctrlElemAttrs = [
      ['⬉', 'TOP_LEFT', 8],
      ['⬆', 'TOP', 1],
      ['⬈', 'TOP_RIGHT', 2],
      ['⬅', 'LEFT', 7],
      [undefined, undefined],
      ['➡', 'RIGHT', 3],
      ['⬋', 'BOTTOM_LEFT', 6],
      ['⬇', 'BOTTOM', 5],
      ['⬊', 'BOTTOM_RIGHT', 4],
    ];
    const ctrlElems = ctrlElemAttrs.map(([icon, directionName, directionValue]) => `
      <div class="${moveCtrlClass} col col-xs-4 px-0 p-0">
        ${icon ? `<button class="md-button md-raised ${moveBtnClass}" type="button" clickable data-direction-name="${directionName}" data-direction-value="${directionValue}">${icon}</button>` : '<span>&nbsp</span>'}
      </div>
    `).join('\n');
    const ctrlsElem = angular.element(`
      <style type='text/css'>
        .${moveCtrlsClass}  {
          padding: 0;
          margin: 0;
        }
        .${moveCtrlClass}.col {
          padding: 3px;
        }
        .${moveBtnClass}.md-button.md-raised {
          width: 100%;
          font-size: 30px;
        }
      </style>
      <div class="${moveCtrlsClass} row gx-0">
        ${ctrlElems}
      </div>
    `);

    // Insert movement controls above notify checkbox
    const targetElem = angular.element(`${objectPropsElem.selector} md-checkbox`)[0];
    ctrlsElem.insertBefore(targetElem);

    // Attach event listeners
    angular.element(`.${moveBtnClass}`).on('click', move);

    console.debug(`[screeps-gui-extender] added ${objectType} movement controls`);
  }

  const copyBtnClass = 'copy-btn';

  /**
   * Appends a button to the specified target that
   * copies the named property of the selected object to the clipboard
   */
  function addCopyButton(objectPropsElem, targetSelector, propertyName) {
    // Don't add duplicate sets of controls
    const targetElem = objectPropsElem.find(targetSelector);
    if (targetElem.find(`.${copyBtnClass}`).length) {
      return;
    }

    // Add copy button
    const newElem = angular.element(`<button class="${copyBtnClass} md-button md-primary md-ink-ripple" style="padding: 0px;"><i class="fa fa-copy"></i></button>`);
    targetElem.append(newElem);

    // Add copy behavior
    newElem.on('click', (e) => {
      const selectedObject = angular.element('section.room').scope().Room.selectedObject;
      if (!selectedObject) {
        console.warn(`[screeps-gui-extender][addCopyButton][${propertyName}] no selected object found`);
        return;
      }

      const value = selectedObject[propertyName];
      navigator.clipboard.writeText(value);
      // TODO: Show tooltip
    });
  }

  updateObjectProperties('creep', (selectedObject, objectPropsElem) => {
    addMovementControls('creep', objectPropsElem);
    addCopyButton(objectPropsElem, '.ng-binding:nth-of-type(3)', 'name');
  });
  updateObjectProperties('powerCreep', (selectedObject, objectPropsElem) => {
    addMovementControls('powerCreep', objectPropsElem);
    addCopyButton(objectPropsElem, '.ng-binding:nth-of-type(3)', 'name');
  });
  updateObjectProperties('flag', (selectedObject, objectPropsElem) => {
    addCopyButton(objectPropsElem, '.ng-binding:nth-of-type(2)', 'name');
  });

  // Map view customizations
  function extendMapStats() {
    const expansionData = {};
    const pendingData = {};

    const getMissingRoomObjects = (scope) => {
      const shard = scope.WorldMap.shard;
      expansionData[shard] ||= {};
      pendingData[shard] ||= {};

      const roomNames = _(scope.WorldMap.sectors)
        .map((s) => s.name)
        .compact()
        .filter((room) => !expansionData[shard][room] && !pendingData[shard][room])
        .sort()
        .value();
      if (!roomNames.length) {
        return;
      }

      console.debug(`[screeps-gui-extender] querying room objects for rooms:`, roomNames);
      const now = Date.now();
      for (const room of roomNames) {
        pendingData[shard][room] = now;
        ScreepsAdapter.Api.get('game/room-objects', { shard, room }).then((response) => {
          if (!response.ok) {
            delete pendingData[shard][room];
            console.warn(`[screeps-gui-extender] failed to fetch room objects for ${shard}/${room}:`, response);
            return;
          }

          // Room must have an unclaimed controller
          const controller = _.find(response.objects, (o) => o.type === 'controller') || null;
          if (!controller || controller.level) {
            expansionData[shard][room] = {
              qualified: false,
              controller,
            };
            delete pendingData[shard][room];
            return;
          }

          // Room must have two sources
          const numSrcs = _.filter(response.objects, (o) => o.type === 'source').length;
          const mineral = _.find(response.objects, (o) => o.type === 'mineral');
          const qualified = numSrcs >= 2;
          expansionData[shard][room] = {
            qualified,
            controller,
            numSrcs,
            mineral,
          };
          delete pendingData[shard][room];

          if (qualified) {
            console.debug(`[screeps-gui-extender] ${shard}/${room} is a good candidate for expansion:`, expansionData[shard][room]);
            updateMapView();
          }
        });
      }
    };

    const updateMapView = debounce(() => {
      console.debug(expansionData);
      const roomElts = angular.element('div.map-container div.map-sector');
      for (let i = 0; i < roomElts.length; i++) {
        const roomElt = angular.element(roomElts[i]);
        // Stats elt is not shown for unowned rooms in owner0 mode
        /* const statsElt = roomElt.find('div.room-stats')[0];
        if (!statsElt) {
          continue;
        } */

        const [shard, room] = roomElt.find('canvas.room-objects').attr('app:game-map-room-objects');
        if (!expansionData[shard]) {
          return;
        }
        const data = expansionData[shard][room];
        roomElt.style.border = (data && data.qualified) ? 'thick double #33ff99' : '';
      }
    }, 1000);

    // Watch for new visible rooms on world map
    let removeWatcher;
    const initializeWatcher = () => {
      // Only register one watcher at a time
      if (removeWatcher) {
        removeWatcher();
      }

      // Wait for scope
      const targetElt = angular.element('section.world-map');
      const scope = targetElt && targetElt.scope();
      if (!scope) {
        setTimeout(extendMapStats, 50);
        return;
      }

      removeWatcher = scope.$watch(
        (scope) => _(scope.WorldMap.sectors).map((s) => s.name).compact().join(','),
        (newVal, oldVal, scope) => {
          getMissingRoomObjects(scope);
          updateMapView();
        },
      );
    };

    ScreepsAdapter.onViewChange((triggerName) => {
      if (triggerName === 'worldMapEntered') {
        initializeWatcher();
      }
    });
  }
  // TODO: Fix highlighting of good candidate rooms for expansion
  // extendMapStats();

  /**
   * Add custom stats to profile pages
   */
  function addCustomStats() {
    // Wait for relevant views/scopes to be ready
    const targetElem = angular.element('.row.profile-stats');
    const targetScope = targetElem && targetElem.scope();
    if (!targetScope) {
      setTimeout(addCustomStats, 50);
      return;
    }

    // Display energy consumption from power processing
    addCustomStat(
      'Power energy<br />consumed',
      'powerEnConsumed',
      'color: #eee;',
      // TODO: Use roomScope.Room.Constants.POWER_SPAWN_ENERGY_RATIO instead of hard-coding
      (scope) => scope.ProfileStats.stats.powerProcessed * 50,
      targetElem,
      targetScope,
    );

    // Display total energy consumption from known stats
    // (excludes energy spent on boosts)
    addCustomStat(
      'Total energy<br />consumed',
      'totalEnConsumed',
      'color: #eee;',
      (scope) => {
        const stats = scope.ProfileStats.stats;
        return (
          stats.energyControl +
          stats.energyConstruction +
          stats.energyCreeps +
          // TODO: Use roomScope.Room.Constants.POWER_SPAWN_ENERGY_RATIO instead of hard-coding
          (stats.powerProcessed * 50));
      },
      targetElem,
      targetScope,
    );
  }

  function addCustomStat(titleHtml, clsSuffix, valStyle, fn, targetElem, scope) {
    // Don't add multiple copies to the same page
    if (targetElem.find(`.statCol-${clsSuffix}`).length) {
      return;
    }

    // Append stat element to the end of the grid
    const elt = angular.element(`
      <div class="col-xs-2 statCol-${clsSuffix}">
        <div class="stat-${clsSuffix}">
          <div class="profile-stat-title">${titleHtml}</div>
          <div class="profile-stat-value" style="${valStyle}">${formatStat(fn(scope))}</div>
        </div>
      </div>
    `);
    targetElem.append(elt);

    // Update stat via $watch to avoid issues related to multiple template $compile calls
    // (i.e. when switching to a different profile, custom stat elements either don't show up
    // or the templates are rendered as plaintext)
    scope.$watch(
      fn,
      (newVal, prevVal, scope) => {
        targetElem.find(`.statCol-${clsSuffix} .profile-stat-value`)[0].innerHTML = formatStat(newVal);
      },
    );
  }

  function formatStat(stat) {
    // Display missing/empty stats in same format as original stats
    stat ||= 0;
    if (!stat) {
      return stat;
    }

    let suffix = '';
    let factor = 1;
    if (stat >= 1_000_000_000_000) {
      suffix = 'T';
      factor = 1_000_000_000_000;
    } else if (stat >= 1_000_000_000) {
      suffix = 'B';
      factor = 1_000_000_000;
    } else if (stat >= 1_000_000) {
      suffix = 'M';
      factor = 1_000_000;
    } else if (stat >= 1_000) {
      suffix = 'K';
      factor = 1_000;
    }

    stat /= factor;
    return `${stat.toPrecision(3)}${suffix}`;
  };

  ScreepsAdapter.onHashChange((hash) => {
    if (hash.startsWith('#!/profile/') || hash === '#!/overview') {
      // Delete old stats element to avoid race conditions when navigating
      // between profile and overview
      angular.element('.row.profile-stats').remove();
      setTimeout(addCustomStats, 0);
    }
  });
});
