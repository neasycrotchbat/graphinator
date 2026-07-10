/* Graphinator panel logic.
 *
 * The panel owns the DATA (points, chart type, formatting) and sends it to
 * jsx/graphinator.jsx to build/rebuild the chart. Color + animation + scale
 * become LIVE effect controls on the ">> GRAPH CONTROLLER <<" null after the
 * first generate; Update never overwrites tweaks made there.
 */

(function () {
  'use strict';

  var csi = new CSInterface();

  var MAX_POINTS = 60;

  // ---------------------------------------------------------------- state

  // Two independent datasets: bar & line share a series; pie keeps its own
  // parts-of-a-whole values. The active tab edits one of them; generation
  // sends whichever matches the chart type. Both persist in the comp.
  var state = {
    type: 'bar',
    activeDs: 'barline',
    datasets: {
      barline: [
        { label: 'Q1', value: 1200, useCustom: false, color: '#4e8cff' },
        { label: 'Q2', value: 1875, useCustom: false, color: '#4e8cff' },
        { label: 'Q3', value: 1520, useCustom: false, color: '#4e8cff' },
        { label: 'Q4', value: 2340, useCustom: false, color: '#4e8cff' }
      ],
      pie: [
        { label: 'Rent', value: 1200, useCustom: false, color: '#4e8cff' },
        { label: 'Food', value: 800, useCustom: false, color: '#4e8cff' },
        { label: 'Utilities', value: 350, useCustom: false, color: '#4e8cff' },
        { label: 'Savings', value: 650, useCustom: false, color: '#4e8cff' }
      ]
    }
  };

  function activeItems() { return state.datasets[state.activeDs]; }
  function dsForType(type) { return type === 'pie' ? 'pie' : 'barline'; }

  // ------------------------------------------------------------- helpers

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, isErr) {
    var el = $('status');
    el.textContent = msg;
    el.className = isErr ? 'err' : 'ok';
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function hexToHsl(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substr(0, 2), 16) / 255;
    var g = parseInt(hex.substr(2, 2), 16) / 255;
    var b = parseInt(hex.substr(4, 2), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }

  function hslToHex(h, s, l) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    function c(x) { return ('0' + Math.round(x * 255).toString(16)).slice(-2); }
    return '#' + c(r) + c(g) + c(b);
  }

  /* Same ramp math the AE expressions use, so the preview matches the chart. */
  function rampTone(masterHex, t, spread) {
    var hsl = hexToHsl(masterHex);
    var l = clamp(hsl[2] + t * spread * 0.7, 0.08, 0.94);
    var s = clamp(hsl[1] - t * spread * 0.25, 0.05, 1);
    return hslToHex(hsl[0], s, l);
  }

  // ------------------------------------------------------------ data grid

  function renderRows() {
    var wrap = $('dataRows');
    wrap.innerHTML = '';
    activeItems().forEach(function (item, i) {
      var row = document.createElement('div');
      row.className = 'data-row';

      var label = document.createElement('input');
      label.type = 'text';
      label.className = 'd-label';
      label.value = item.label;
      label.addEventListener('input', function () { item.label = label.value; });

      var value = document.createElement('input');
      value.type = 'text';
      value.className = 'd-value';
      value.value = item.value;
      value.addEventListener('input', function () { item.value = value.value; });

      var custom = document.createElement('div');
      custom.className = 'd-custom';
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = item.useCustom;
      var picker = document.createElement('input');
      picker.type = 'color';
      picker.value = item.color;
      picker.disabled = !item.useCustom;
      check.addEventListener('change', function () {
        item.useCustom = check.checked;
        picker.disabled = !check.checked;
      });
      picker.addEventListener('input', function () { item.color = picker.value; });
      custom.appendChild(check);
      custom.appendChild(picker);

      var del = document.createElement('button');
      del.className = 'd-del';
      del.textContent = '✕';
      del.title = 'Remove row';
      del.addEventListener('click', function () {
        activeItems().splice(i, 1);
        renderRows();
        renderRamp();
      });

      row.appendChild(label);
      row.appendChild(value);
      row.appendChild(custom);
      row.appendChild(del);
      wrap.appendChild(row);
    });
    renderRamp();
  }

  function renderRamp() {
    var wrap = $('rampPreview');
    wrap.innerHTML = '';
    var n = Math.max(activeItems().length, 2);
    var master = $('masterColor').value;
    var spread = parseFloat($('toneSpread').value) / 100;
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) - 0.5 : 0;
      var sw = document.createElement('span');
      sw.style.background = rampTone(master, t, spread);
      wrap.appendChild(sw);
    }
  }

  // -------------------------------------------------------- build config

  function collectConfig() {
    var type = state.type;
    var dsName = dsForType(type);
    var tabLabel = dsName === 'pie' ? 'Pie' : 'Bar & Line';
    var source = state.datasets[dsName];

    var items = [];
    for (var i = 0; i < source.length; i++) {
      var it = source[i];
      var v = parseFloat(String(it.value).replace(/,/g, ''));
      if (!it.label || isNaN(v)) {
        throw new Error(tabLabel + ' tab, row ' + (i + 1) + ': needs a label and a numeric value.');
      }
      items.push({ label: it.label, value: v, useCustom: !!it.useCustom, color: it.color });
    }
    if (items.length < 2) throw new Error(tabLabel + ' tab: enter at least 2 data points.');
    if (items.length > MAX_POINTS) throw new Error('Maximum ' + MAX_POINTS + ' data points.');

    if (type === 'pie') {
      for (var j = 0; j < items.length; j++) {
        if (items[j].value <= 0) throw new Error('Pie charts need every value > 0 (row ' + (j + 1) + ').');
      }
    } else {
      for (var m = 0; m < items.length; m++) {
        if (items[m].value < 0) throw new Error('v1 supports non-negative values only (row ' + (m + 1) + ').');
      }
    }

    return {
      version: 1,
      type: type,
      title: $('chartTitle').value,
      seriesName: $('seriesName').value || 'Series 1',
      items: items,
      datasets: state.datasets, // both tabs persist with the chart
      color: {
        master: $('masterColor').value,
        spread: parseFloat($('toneSpread').value)
      },
      format: {
        mode: $('fmtMode').value,
        decimals: clamp(parseInt($('fmtDecimals').value, 10) || 0, 0, 3),
        thousands: $('fmtThousands').checked,
        prefix: $('fmtPrefix').value,
        suffix: $('fmtSuffix').value
      },
      pie: {
        sortDesc: $('pieSort').checked,
        includeValue: $('pieIncludeValue').checked
      },
      anim: {
        delay: Math.max(0, parseFloat($('animDelay').value) || 0),
        duration: Math.max(0.1, parseFloat($('animDuration').value) || 2),
        stagger: Math.max(0, parseFloat($('animStagger').value) || 0),
        easing: $('animEasing').value
      }
    };
  }

  function applyConfig(cfg) {
    state.type = cfg.type || 'bar';
    state.activeDs = dsForType(state.type);
    function cleanItems(arr) {
      return (arr || []).map(function (it) {
        return {
          label: it.label, value: it.value,
          useCustom: !!it.useCustom, color: it.color || '#4e8cff'
        };
      });
    }
    if (cfg.datasets) {
      if (cfg.datasets.barline && cfg.datasets.barline.length) state.datasets.barline = cleanItems(cfg.datasets.barline);
      if (cfg.datasets.pie && cfg.datasets.pie.length) state.datasets.pie = cleanItems(cfg.datasets.pie);
    } else {
      // Chart stored before per-type datasets existed — its items belong to
      // whichever tab matches its type.
      state.datasets[state.activeDs] = cleanItems(cfg.items);
    }
    $('chartTitle').value = cfg.title || '';
    $('seriesName').value = cfg.seriesName || 'Series 1';
    if (cfg.color) {
      $('masterColor').value = cfg.color.master || '#4e8cff';
      $('toneSpread').value = cfg.color.spread != null ? cfg.color.spread : 45;
      $('toneSpreadVal').textContent = $('toneSpread').value;
    }
    if (cfg.format) {
      $('fmtMode').value = cfg.format.mode || 'number';
      $('fmtDecimals').value = cfg.format.decimals != null ? cfg.format.decimals : 0;
      $('fmtThousands').checked = cfg.format.thousands !== false;
      $('fmtPrefix').value = cfg.format.prefix || '';
      $('fmtSuffix').value = cfg.format.suffix || '';
    }
    if (cfg.pie) {
      $('pieSort').checked = !!cfg.pie.sortDesc;
      $('pieIncludeValue').checked = !!cfg.pie.includeValue;
    }
    if (cfg.anim) {
      $('animDelay').value = cfg.anim.delay != null ? cfg.anim.delay : 0.3;
      $('animDuration').value = cfg.anim.duration != null ? cfg.anim.duration : 2;
      $('animStagger').value = cfg.anim.stagger != null ? cfg.anim.stagger : 0.25;
      $('animEasing').value = cfg.anim.easing || 'smooth';
    }
    syncTypeUI();
    renderRows();
  }

  // ------------------------------------------------------------- actions

  function syncTypeUI() {
    var btns = $('typeSwitch').querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = btns[i].getAttribute('data-type') === state.type ? 'active' : '';
    }
    $('pieOpts').className = state.type === 'pie' ? '' : 'hidden';
    var tabs = $('dataTabs').querySelectorAll('button');
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].className = tabs[j].getAttribute('data-ds') === state.activeDs ? 'active' : '';
    }
  }

  function generate() {
    var cfg;
    try {
      cfg = collectConfig();
    } catch (e) {
      setStatus(e.message, true);
      return;
    }
    setStatus('Building ' + cfg.type + ' chart…', false);
    var payload = JSON.stringify(JSON.stringify(cfg));
    csi.evalScript('GRAPHINATOR.generate(' + payload + ')', function (res) {
      handleResult(res);
    });
  }

  function loadFromComp() {
    csi.evalScript('GRAPHINATOR.readData()', function (res) {
      res = String(res || '');
      if (res.indexOf('DATA|') === 0) {
        try {
          applyConfig(JSON.parse(res.substring(5)));
          setStatus('Loaded chart data from the active comp. Edit and press Update.', false);
        } catch (e) {
          setStatus('Stored data could not be parsed: ' + e.message, true);
        }
      } else {
        handleResult(res);
      }
    });
  }

  function handleResult(res) {
    res = String(res || '');
    if (res.indexOf('OK|') === 0) setStatus(res.substring(3), false);
    else if (res.indexOf('ERR|') === 0) setStatus(res.substring(4), true);
    else setStatus('Unexpected host response: ' + res, true);
  }

  function randomColor() {
    var h = Math.random();
    var s = 0.5 + Math.random() * 0.4;   // stay saturated but not neon
    var l = 0.42 + Math.random() * 0.16; // mid lightness so ramps have headroom
    var hex = hslToHex(h, s, l);
    $('masterColor').value = hex;
    renderRamp();
    // Push straight onto an existing chart's controller so Random is live too.
    var hsl = hexToHsl(hex); // unused, kept computed for clarity of intent
    var r = parseInt(hex.substr(1, 2), 16) / 255;
    var g = parseInt(hex.substr(3, 2), 16) / 255;
    var b = parseInt(hex.substr(5, 2), 16) / 255;
    csi.evalScript('GRAPHINATOR.setMasterColor(' + r + ',' + g + ',' + b + ')', function (res) {
      res = String(res || '');
      if (res.indexOf('OK|') === 0) setStatus('Random color applied to the live chart.', false);
      else setStatus('Random color set. Generate a chart to use it.', false);
    });
  }

  function importPaste() {
    var lines = $('pasteArea').value.split(/\r?\n/);
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var parts = line.split(/\t/);
      if (parts.length < 2) {
        // fall back to last comma so labels may contain commas-free text
        var ci = line.lastIndexOf(',');
        if (ci < 0) { setStatus('Line ' + (i + 1) + ': expected "Label<tab or comma>Value".', true); return; }
        parts = [line.substring(0, ci), line.substring(ci + 1)];
      }
      var v = parseFloat(parts[1].replace(/,/g, '').trim());
      if (isNaN(v)) { setStatus('Line ' + (i + 1) + ': "' + parts[1].trim() + '" is not a number.', true); return; }
      items.push({ label: parts[0].trim(), value: v, useCustom: false, color: '#4e8cff' });
    }
    if (items.length < 2) { setStatus('Paste at least 2 lines of data.', true); return; }
    if (items.length > MAX_POINTS) { setStatus('Maximum ' + MAX_POINTS + ' data points.', true); return; }
    state.datasets[state.activeDs] = items;
    renderRows();
    setStatus('Imported ' + items.length + ' data points into the ' +
      (state.activeDs === 'pie' ? 'Pie' : 'Bar & Line') + ' tab.', false);
  }

  // ---------------------------------------------------------------- wire

  $('typeSwitch').addEventListener('click', function (ev) {
    var t = ev.target.getAttribute && ev.target.getAttribute('data-type');
    if (!t) return;
    state.type = t;
    state.activeDs = dsForType(t); // data tab follows the chart type
    syncTypeUI();
    renderRows();
  });

  $('dataTabs').addEventListener('click', function (ev) {
    var ds = ev.target.getAttribute && ev.target.getAttribute('data-ds');
    if (!ds || ds === state.activeDs) return;
    state.activeDs = ds;
    syncTypeUI();
    renderRows();
  });

  $('copyDs').addEventListener('click', function () {
    var other = state.activeDs === 'pie' ? 'barline' : 'pie';
    state.datasets[state.activeDs] = state.datasets[other].map(function (it) {
      return { label: it.label, value: it.value, useCustom: it.useCustom, color: it.color };
    });
    renderRows();
    setStatus('Copied ' + state.datasets[state.activeDs].length + ' rows from the ' +
      (other === 'pie' ? 'Pie' : 'Bar & Line') + ' tab.', false);
  });

  $('addRow').addEventListener('click', function () {
    var items = activeItems();
    if (items.length >= MAX_POINTS) { setStatus('Maximum ' + MAX_POINTS + ' data points.', true); return; }
    items.push({ label: 'Item ' + (items.length + 1), value: 0, useCustom: false, color: '#4e8cff' });
    renderRows();
  });

  $('togglePaste').addEventListener('click', function () {
    var box = $('pasteBox');
    box.className = box.className === 'hidden' ? '' : 'hidden';
  });

  $('importPaste').addEventListener('click', importPaste);
  $('randomColor').addEventListener('click', randomColor);
  $('masterColor').addEventListener('input', renderRamp);
  $('toneSpread').addEventListener('input', function () {
    $('toneSpreadVal').textContent = $('toneSpread').value;
    renderRamp();
  });
  $('generate').addEventListener('click', generate);
  $('loadFromComp').addEventListener('click', loadFromComp);

  syncTypeUI();
  renderRows();
})();
