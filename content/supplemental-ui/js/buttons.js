(function () {
  'use strict';

  // ── Send-to Terminal ──────────────────────────────────────────────────────
  // Role name maps directly to URL path in the terminal iframe src.
  // Alerts if the matching iframe is not found.
  //
  //   role="send-to-wetty"    → looks for iframe with /wetty in src (bastion)
  //   role="send-to-terminal" → looks for iframe with /terminal in src (node)
  //
  // The path after "send-to-" must match the terminal URL in ui-config.yml.
  // Combine with execute for the theme copy button alongside ▶:
  //   role="execute send-to-wetty"

  function initSendTo() {
    // Find all elements whose class list contains a class starting with 'send-to-'
    document.querySelectorAll('[class*="send-to-"]').forEach(function (block) {
      if (block.dataset.sendToButtonAdded) return;
      var listingBlock = block.closest('.listingblock');
      if (!listingBlock) return;

      // Extract the target path from the class name e.g. 'send-to-wetty' → '/wetty'
      var targetClass = Array.from(block.classList).find(function (c) { return /^send-to-.+/.test(c); });
      if (!targetClass) return;
      var targetPath = '/' + targetClass.replace('send-to-', '');

      var btn = document.createElement('button');
      btn.className = 'send-to-command-btn';
      btn.title = 'Send to ' + targetPath;
      btn.innerHTML = '▶';
      btn.onclick = function () {
        var cmd = (block.querySelector('code') || block).textContent.trim();
        sendToTerminal(cmd, btn, targetPath);
      };
      listingBlock.appendChild(btn);
      block.dataset.sendToButtonAdded = 'true';
    });
  }

  function findFrame(targetPath) {
    try {
      if (!window.parent || window.parent === window) return null;
      var frames = window.parent.document.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++) {
        if ((frames[i].src || '').indexOf(targetPath) !== -1) return frames[i];
      }
    } catch (e) {}
    return null;
  }

  function sendToTerminal(command, button, targetPath) {
    var frame = findFrame(targetPath);
    var original = button.innerHTML;
    if (!frame) {
      alert('Cannot find terminal at ' + targetPath + ' in this showroom.\nCheck ui-config.yml has a tab with ' + targetPath + ' URL.');
      return;
    }

    // Inject execute-listener into terminal if not already done
    // Only inject for /terminal, not for /wetty (which has native support)
    if (targetPath === '/terminal') {
      ensureTerminalListener(frame);
    }

    frame.contentWindow.postMessage({ type: 'execute', data: command + '\r' }, '*');
    button.classList.add('success'); button.innerHTML = '✓ Sent!';
    setTimeout(function () { button.classList.remove('success'); button.innerHTML = original; }, 2000);
  }

  function ensureTerminalListener(frame) {
    if (frame.dataset.listenerInjected) return;

    var listenerScript = `
(function() {
  if (window.__terminalListenerInstalled) return;
  window.__terminalListenerInstalled = true;

  window.addEventListener("message", function(event) {
    if (event.data && event.data.type === "execute") {
      var command = event.data.data;
      var term = window.term;

      if (term) {
        command = command.replace(/[\\r\\n]+$/, "");

        // Method 1: Try terminal client object (most reliable)
        if (window.client && typeof window.client.sendData === 'function') {
          window.client.sendData(command + '\\r');
          return;
        }

        // Method 2: Simulate keyboard input using xterm.js internal API
        if (term._core && term._core.coreService && term._core.coreService._inputHandler) {
          for (var i = 0; i < command.length; i++) {
            term._core.coreService._inputHandler.parse(command[i]);
          }
          term._core.coreService._inputHandler.parse('\\r');
          return;
        }

        // Method 3: Try accessing onData handler through _core
        if (term._core && term._core._onData) {
          term._core._onData.fire(command + '\\r');
          return;
        }

        // Method 4: Fallback - write to display only (won't execute)
        term.write(command + '\\r\\n');
      }
    }
  }, false);
})();`;

    try {
      var script = frame.contentWindow.document.createElement('script');
      script.textContent = listenerScript;
      frame.contentWindow.document.body.appendChild(script);
      frame.dataset.listenerInjected = 'true';
    } catch (e) {
      console.error('Failed to inject terminal listener:', e);
    }
  }

  // ── Solve / Validate buttons ──────────────────────────────────────────────

  function initSolve() {
    document.querySelectorAll('.solve-button-placeholder').forEach(function (p) {
      var m = p.getAttribute('data-module');
      var wrap = document.createElement('div');
      wrap.className = 'btn-section';
      wrap.innerHTML = '<button class="solve-btn" data-module="' + m + '">🚀 Solve Module</button>';
      p.replaceWith(wrap);
    });
    document.querySelectorAll('.solve-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { runStream('solve', this.getAttribute('data-module'), this.closest('.btn-section')); });
    });
  }

  function initValidate() {
    document.querySelectorAll('.validate-button-placeholder').forEach(function (p) {
      var m = p.getAttribute('data-module');
      var wrap = document.createElement('div');
      wrap.className = 'btn-section';
      wrap.innerHTML = '<button class="validate-btn" data-module="' + m + '">✓ Validate Module</button>';
      p.replaceWith(wrap);
    });
    document.querySelectorAll('.validate-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { runStream('validate', this.getAttribute('data-module'), this.closest('.btn-section')); });
    });
  }

  // ── Live panel ────────────────────────────────────────────────────────────

  function runStream(stage, moduleName, section) {
    var btn = section.querySelector('.' + stage + '-btn');
    var label = stage === 'solve' ? '🚀 Solve Module' : '✓ Validate Module';

    // Remove existing panel if re-running
    var old = section.querySelector('.stream-panel');
    if (old) old.remove();

    // Create live panel — no IDs, use querySelector on the panel itself
    var panel = document.createElement('div');
    panel.className = 'stream-panel';
    panel.innerHTML =
      '<div class="stream-status">' +
        '<span class="sp-spinner">Running...</span>' +
      '</div>' +
      '<div class="stream-steps">' +
        '<div class="sp-steps-label">Steps</div>' +
        '<ul class="sp-step-list"></ul>' +
      '</div>' +
      '<details class="stream-logs-wrap">' +
        '<summary class="sp-logs-toggle">Show logs</summary>' +
        '<pre class="sp-log-content"></pre>' +
      '</details>';
    section.appendChild(panel);

    btn.disabled = true;
    btn.textContent = '⏳ Running...';

    // Reference elements directly from panel — no getElementById, no duplicate ID issues
    var statusEl  = panel.querySelector('.stream-status');
    var stepList  = panel.querySelector('.sp-step-list');
    var logEl     = panel.querySelector('.sp-log-content');

    // State for solve step tracking
    var currentTask = null;
    var pendingLi   = null;

    var es = new EventSource('/stream/' + stage + '/' + moduleName);

    es.onmessage = function (event) {
      if (event.data === '__DONE__') {
        es.close();
        btn.disabled = false;
        btn.textContent = label;
        finalize(stage, statusEl, stepList, logEl);
        return;
      }

      var line = '';
      try { line = JSON.parse(event.data); } catch (x) { line = event.data; }

      // ── Append to full log ──
      logEl.textContent += line;
      logEl.scrollTop = logEl.scrollHeight;

      // ── Update steps live ──
      // Parse TASK names → step chips
      parseSolveLine(line, stepList, { currentTask: currentTask, pendingLi: pendingLi },
        function (state) { currentTask = state.currentTask; pendingLi = state.pendingLi; });
      // Parse validation_check msg field → ✅/❌ step chips
      parseValidationMsg(line, stepList);
    };

    es.onerror = function () {
      es.close();
      btn.disabled = false;
      btn.textContent = label;
      logEl.textContent += '\n❌ Connection closed\n';
      finalize(stage, statusEl, stepList, logEl);
    };
  }

  // ── Live solve parser ─────────────────────────────────────────────────────
  // Tracks TASK [name] → ok/changed/failed lines and updates step chips live.
  // Strips ANSI escape codes before matching (Ansible uses color codes).

  function stripAnsi(s) {
    return s.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '');
  }

  function parseSolveLine(line, stepList, state, setState) {
    var clean = stripAnsi(line);
    var taskMatch = clean.match(/TASK \[([^\]]+)\]/);
    if (taskMatch) {
      var name = taskMatch[1].trim();
      // Skip internal housekeeping tasks not meaningful to students
      if (/^Gathering Facts$|^Build task results|^build task|^set_fact|^ansible\.builtin\.set_fact|^Validate all tasks$/i.test(name)) {
        setState({ currentTask: null, pendingLi: null }); return;
      }
      var li = document.createElement('li');
      li.className = 'sp-step sp-step-pending';
      li.textContent = name;
      stepList.appendChild(li);
      setState({ currentTask: name, pendingLi: li });
      return;
    }
    if (!state.pendingLi) return;

    if (/^ok:\s*\[/.test(clean)) {
      state.pendingLi.className = 'sp-step sp-step-ok';
      state.pendingLi.textContent = state.currentTask;
      setState({ currentTask: null, pendingLi: null });
    } else if (/^changed:\s*\[/.test(clean)) {
      state.pendingLi.className = 'sp-step sp-step-changed';
      state.pendingLi.textContent = state.currentTask;
      setState({ currentTask: null, pendingLi: null });
    } else if (/^fatal:|^failed:\s*\[/i.test(clean)) {
      state.pendingLi.className = 'sp-step sp-step-fail';
      state.pendingLi.textContent = state.currentTask;
      setState({ currentTask: null, pendingLi: null });
    } else if (/^skipping:/i.test(clean)) {
      state.pendingLi.remove();
      setState({ currentTask: null, pendingLi: null });
    }
  }

  // ── Live validate parser ──────────────────────────────────────────────────
  // Adds ✅/❌ chips as validation_check lines stream in.

  function parseValidateLine(line, stepList) {
    var t = stripAnsi(line).trim();
    if (/^✅/.test(t)) {
      var li = document.createElement('li');
      li.className = 'sp-step sp-step-ok';
      li.textContent = t;
      stepList.appendChild(li);
    } else if (/^❌/.test(t)) {
      var li2 = document.createElement('li');
      li2.className = 'sp-step sp-step-fail';
      li2.textContent = t;
      stepList.appendChild(li2);
    }
  }

  // ── validation_check msg parser ───────────────────────────────────────────
  // validation_check writes pass/error msg to output.txt AND returns it in
  // result['msg'] which appears in Ansible stdout as:
  //   "msg": "✅ Task 1: ...\n✅ Task 2: ...\n : Message written to log"
  // Extract each ✅/❌ line and show as a step chip.

  function parseValidationMsg(line, stepList) {
    var clean = stripAnsi(line).trim();
    // Look for the "msg": "..." pattern from validation_check
    // "msg": "..." — no closing } on this line, match to end of string
    var msgMatch = clean.match(/"msg":\s*"(.+)"$/);
    if (!msgMatch) return;
    var msg = msgMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    msg.split('\n').forEach(function (part) {
      var t = part.trim();
      if (/^✅/.test(t)) {
        var li = document.createElement('li');
        li.className = 'sp-step sp-step-ok';
        li.textContent = t;
        stepList.appendChild(li);
      } else if (/^❌/.test(t)) {
        var li2 = document.createElement('li');
        li2.className = 'sp-step sp-step-fail';
        li2.textContent = t;
        stepList.appendChild(li2);
      }
    });
  }

  // ── Finalize status banner ────────────────────────────────────────────────

  function finalize(stage, statusEl, stepList, logEl) {
    var hasFail = stepList.querySelector('.sp-step-fail');
    var hasPending = stepList.querySelector('.sp-step-pending');
    if (hasPending) { hasPending.className = 'sp-step sp-step-fail'; }
    hasFail = stepList.querySelector('.sp-step-fail');

    var passed = !hasFail;
    var text = stage === 'solve'
      ? (passed ? 'Solve completed' : 'Solve failed')
      : (passed ? 'All checks passed' : 'Validation failed');
    var cls  = passed ? 'sp-status-pass' : 'sp-status-fail';

    statusEl.innerHTML = '<span class="' + cls + '">' + escHtml(text) + '</span>';
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function init() { initSendTo(); initSolve(); initValidate(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
