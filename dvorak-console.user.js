// ==UserScript==
// @name        DrDvorak console thing
// @namespace   Violentmonkey Scripts
// @match       https://screeps.com/a/*
// @grant       none
// @version     1.0
// @author      -
// @description 25/10/2025 03:06:43
// @run-at      document-ready
// @icon        https://www.google.com/s2/favicons?sz=64&domain=screeps.com
// @require     http://localhost:8000/screeps-browser-core.js
// @downloadUrl  https://tiennou.github.io/screeps-browser-ext/dvorak-console.user.js
// ==/UserScript==

// Customize editor panel and add docking side toggle button
function customizeEditorPanel() {
  const aceEditor = angular.element('.ace_editor');
  if (!aceEditor.length) {
    setTimeout(customizeEditorPanel, 500);
    return;
  }

  if (angular.element('.btn-panel-dock').length) {
    return
  }

  // Add styling
  $('body').append(`<style type='text/css'>
    /** Increase console font size */
    section.console.ng-scope,
    .ace_editor {
      font-size: 14px;
    }
    section.console.ng-scope .console-messages-list .console-message .ng-scope {
      font-size: 12px;
    }
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
  </style>`);

  // Add docking side toggle button and behavior
  const editorPanel = angular.element('.editor-panel');
  const editorPanelElem = editorPanel[0];
  const room = angular.element('section.room');
  const roomElem = angular.element('section.room')[0];
  const resizeHandle = $('.resize-handle');
  const resizeVertHandler = $._data($('.resize-handle')[0], 'events').mousedown[0].handler;

  let dockToggled = false;
  let editorWidth = Math.min(750, Math.floor(window.screen.width * 0.4));
  let editorHeight = Math.min(editorPanel.height(), Math.floor(angular.element('section.room').height() / 2));

  const dockToggleButton = angular.element(`<div class="btn-panel-dock ng-scope" ng:if="!Game.popped" title="Toggle docking side">
    <svg width="16" height="16" xmlns="http://www.w3.org/400/svg" xmlns:svg="http://www.w3.org/400/svg">
      <line x1="2" y1="2" x2="14" y2="14" style="stroke:#999999;stroke-width:2" />
      <line x1="2" y1="2" x2="8" y2="2" style="stroke:#999999;stroke-width:2" />
      <line x1="2" y1="2" x2="2" y2="8" style="stroke:#999999;stroke-width:2" />
      <line x1="14" y1="14" x2="8" y2="14" style="stroke:#999999;stroke-width:2" />
      <line x1="14" y1="14" x2="14" y2="8" style="stroke:#999999;stroke-width:2" />
    </svg>
  </div>`);
  dockToggleButton.insertAfter(angular.element('.btn-panel-popup.ng-scope'));
  dockToggleButton.on('click', (e) => {
    dockToggled = !dockToggled;

    if (dockToggled) {
      // Dock panel to left
      editorWidth = Math.min(editorWidth, Math.floor(window.screen.width * 0.4));
      editorPanelElem.style.width = `${editorWidth}px`;
      editorPanelElem.style.height = '100%';
      roomElem.style.left = `${editorWidth + 5}px`;
      roomElem.style.bottom = '0';

      // Adjust positioning of left-hand controls (world map, history, etc)
      angular.element('.left-controls')[0].style['margin-left'] = '11px';

      // Show horizontal resize handle
      angular.element('.resize-handle-horizontal').show();

      // Disable vertical resize
      $('.resize-handle').off('mousedown');
      angular.element('.resize-handle')[0].style.cursor = 'default';

    } else {
      // Dock panel to bottom
      editorHeight = Math.max(Math.min(editorHeight, Math.floor(room.height() / 2)), 100);
      editorPanelElem.style.width = '100%';
      editorPanelElem.style.height = `${editorHeight}px`;
      roomElem.style.left = '0';
      roomElem.style.bottom = `${editorHeight}px`;

      // Reset positioning of left-hand controls (world map, history, etc)
      angular.element('.left-controls')[0].style['margin-left'] = null;

      // Hide horizontal resize handle
      angular.element('.resize-handle-horizontal').hide();

      // Enable vertical resize
      $('.resize-handle').on('mousedown', resizeVertHandler);
      angular.element('.resize-handle')[0].style.cursor = null;
    }

    angular.element('section.room').scope().$broadcast('resize');
  });

  const resizeHandleElem = angular.element(`<div class="resize-handle-horizontal"></div>`);
  resizeHandleElem.insertBefore(angular.element('.resize-handle')[0]);
  resizeHandleElem.on('mousedown', (e) => {
    const resizeHorizHandler = (e) => {
      editorWidth = e.clientX;
      editorPanelElem.style.width = `${editorWidth}px`;
      roomElem.style.left = `${editorWidth + 5}px`;
      angular.element('section.room').scope().$broadcast('resize');
      console.debug(e);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const endResizeHorizHandler = (e) => {
      editorPanel.off('mousemove.resizeHorizontal');
      resizeHandleElem.off('mousemove.resizeHorizontal');
      room.off('mousemove.resizeHorizontal');
      resizeHandleElem.off('mouseup.resizeHorizontal');
    };

    editorPanel.on('mousemove.resizeHorizontal', resizeHorizHandler);
    resizeHandleElem.on('mousemove.resizeHorizontal', resizeHorizHandler);
    room.on('mousemove.resizeHorizontal', resizeHorizHandler);
    resizeHandleElem.on('mouseup.resizeHorizontal', endResizeHorizHandler);
  });

  // Enable left-side dock by default
  setTimeout(() => { dockToggleButton.click() }, 0);

  // Customize editor settings
  const editor = angular.element('.ace_editor')[0].env.editor;
  editor.setOptions({
    copyWithEmptySelection: true,
    dragEnabled: false,
    enableMultiselect: false,
    fontSize: 14,
    tabSize: 2,
    tooltipFollowsMouse: false,
    wrapBehavioursEnabled: false,
  });
}

$(document).ready(() => {
  ScreepsAdapter.onViewChange((triggerName) => {
    if (triggerName !== 'roomEntered') {
      return;
    }
    customizeEditorPanel();
  });
});
