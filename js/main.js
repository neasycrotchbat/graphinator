/* Graphinator panel logic.
 *
 * The panel owns the DATA (points, series, chart type, formatting) and sends
 * it to jsx/graphinator.jsx to build/rebuild the chart. Color + animation +
 * scale become LIVE effect controls on the ">> GRAPH CONTROLLER <<" null
 * after the first generate; Update never overwrites tweaks made there.
 */

(function () {
  'use strict';

  var csi = new CSInterface();

  var MAX_POINTS = 60;
  var MAX_SERIES = 5;
  var DEFAULT_COLOR = '#4e8cff';
  var PRESET_KEY = 'graphinator_presets_v1';

  // ---------------------------------------------------------------- state

  // Bar/line/area share a multi-series dataset (categories × series); pie
  // keeps its own single parts-of-a-whole list. Both persist with the chart.
  var state = {
    type: 'bar',
    activeDs: 'barline',
    datasets: {
      barline: {
        seriesNames: ['Series 1'],
        rows: [
          { label: 'Q1', values: [1200], useCustom: false, color: DEFAULT_COLOR },
          { label: 'Q2', values: [1875], useCustom: false, color: DEFAULT_COLOR },
          { label: 'Q3', values: [1520], useCustom: false, color: DEFAULT_COLOR },
          { label: 'Q4', values: [2340], useCustom: false, color: DEFAULT_COLOR }
        ]
      },
      pie: [
        { label: 'Rent', value: 1200, useCustom: false, color: DEFAULT_COLOR },
        { label: 'Food', value: 800, useCustom: false, color: DEFAULT_COLOR },
        { label: 'Utilities', value: 350, useCustom: false, color: DEFAULT_COLOR },
        { label: 'Savings', value: 650, useCustom: false, color: DEFAULT_COLOR }
      ]
    }
  };

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

  /* Same ramp math the AE expressions use, so previews match the chart. */
  function rampTone(masterHex, t, spread) {
    var hsl = hexToHsl(masterHex);
    var l = clamp(hsl[2] + t * spread * 0.7, 0.08, 0.94);
    var s = clamp(hsl[1] - t * spread * 0.25, 0.05, 1);
    return hslToHex(hsl[0], s, l);
  }

  function toneT(i, n) { return n > 1 ? i / (n - 1) - 0.5 : 0; }

  function parseNum(v) { return parseFloat(String(v).replace(/,/g, '')); }

  // ------------------------------------------------------------ data grid

  function renderGrid() {
    var wrap = $('dataGrid');
    wrap.innerHTML = '';
    if (state.activeDs === 'pie') renderPieGrid(wrap);
    else renderSeriesGrid(wrap);
    renderRamp();
    schedulePreview();
  }

  function renderPieGrid(wrap) {
    var head = document.createElement('div');
    head.className = 'data-head';
    head.innerHTML = '<span class="col-label">Label</span><span class="col-value">Value</span>' +
      '<span class="col-custom" title="Override the auto tone">Custom</span><span class="col-del"></span>';
    wrap.appendChild(head);

    state.datasets.pie.forEach(function (item, i) {
      var row = document.createElement('div');
      row.className = 'data-row';

      var label = mkInput('text', item.label, 'd-label', function (v) { item.label = v; schedulePreview(); });
      var value = mkInput('text', item.value, 'd-value', function (v) { item.value = v; schedulePreview(); });

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
        schedulePreview();
      });
      picker.addEventListener('input', function () { item.color = picker.value; schedulePreview(); });
      custom.appendChild(check);
      custom.appendChild(picker);

      row.appendChild(label);
      row.appendChild(value);
      row.appendChild(custom);
      row.appendChild(mkDelBtn(function () {
        state.datasets.pie.splice(i, 1);
        renderGrid();
      }));
      wrap.appendChild(row);
    });
  }

  function renderSeriesGrid(wrap) {
    var ds = state.datasets.barline;
    var m = ds.seriesNames.length;
    var single = m === 1;

    var head = document.createElement('div');
    head.className = 'data-head';
    var lblHead = document.createElement('span');
    lblHead.className = 'col-label';
    lblHead.textContent = 'Label';
    head.appendChild(lblHead);
    ds.seriesNames.forEach(function (nm, j) {
      var inp = mkInput('text', nm, 'd-value', function (v) { ds.seriesNames[j] = v; schedulePreview(); });
      inp.title = 'Series name';
      head.appendChild(inp);
    });
    if (single) {
      var ch = document.createElement('span');
      ch.className = 'col-custom';
      ch.title = 'Override the auto tone';
      ch.textContent = 'Custom';
      head.appendChild(ch);
    }
    var dh = document.createElement('span');
    dh.className = 'col-del';
    head.appendChild(dh);
    wrap.appendChild(head);

    ds.rows.forEach(function (row, i) {
      var el = document.createElement('div');
      el.className = 'data-row';
      el.appendChild(mkInput('text', row.label, 'd-label', function (v) { row.label = v; schedulePreview(); }));
      for (var j = 0; j < m; j++) {
        (function (jj) {
          el.appendChild(mkInput('text', row.values[jj] != null ? row.values[jj] : '', 'd-value',
            function (v) { row.values[jj] = v; schedulePreview(); }));
        })(j);
      }
      if (single) {
        var custom = document.createElement('div');
        custom.className = 'd-custom';
        var check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = row.useCustom;
        var picker = document.createElement('input');
        picker.type = 'color';
        picker.value = row.color;
        picker.disabled = !row.useCustom;
        check.addEventListener('change', function () {
          row.useCustom = check.checked;
          picker.disabled = !check.checked;
          schedulePreview();
        });
        picker.addEventListener('input', function () { row.color = picker.value; schedulePreview(); });
        custom.appendChild(check);
        custom.appendChild(picker);
        el.appendChild(custom);
      }
      el.appendChild(mkDelBtn(function () {
        ds.rows.splice(i, 1);
        renderGrid();
      }));
      wrap.appendChild(el);
    });
  }

  function mkInput(type, value, cls, onInput) {
    var inp = document.createElement('input');
    inp.type = type;
    inp.className = cls;
    inp.value = value;
    inp.addEventListener('input', function () { onInput(inp.value); });
    return inp;
  }

  function mkDelBtn(onClick) {
    var del = document.createElement('button');
    del.className = 'd-del';
    del.textContent = '✕';
    del.title = 'Remove row';
    del.addEventListener('click', onClick);
    return del;
  }

  function renderRamp() {
    var wrap = $('rampPreview');
    wrap.innerHTML = '';
    var n;
    if (state.activeDs === 'pie') n = state.datasets.pie.length;
    else {
      var m = state.datasets.barline.seriesNames.length;
      n = m > 1 ? m : state.datasets.barline.rows.length;
    }
    n = Math.max(n, 2);
    var master = $('masterColor').value;
    var spread = parseFloat($('toneSpread').value) / 100;
    for (var i = 0; i < n; i++) {
      var sw = document.createElement('span');
      sw.style.background = rampTone(master, toneT(i, n), spread);
      wrap.appendChild(sw);
    }
  }

  // -------------------------------------------------------------- preview

  var previewTimer = null;
  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(drawPreview, 120);
  }

  function drawPreview() {
    var cv = $('preview');
    var W = cv.clientWidth || 360;
    cv.width = W * 2; // crisp on hidpi
    cv.height = 300;
    var ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    var H = 150;
    ctx.clearRect(0, 0, W, H);
    var master = $('masterColor').value;
    var spread = parseFloat($('toneSpread').value) / 100;
    try {
      if (state.type === 'pie') drawPiePreview(ctx, W, H, master, spread);
      else drawSeriesPreview(ctx, W, H, master, spread);
    } catch (e) { /* preview must never break the panel */ }
  }

  function seriesNumbers() {
    var ds = state.datasets.barline;
    return ds.seriesNames.map(function (_, j) {
      return ds.rows.map(function (r) {
        var v = parseNum(r.values[j]);
        return isNaN(v) ? 0 : v;
      });
    });
  }

  function drawSeriesPreview(ctx, W, H, master, spread) {
    var ds = state.datasets.barline;
    var series = seriesNumbers();
    var m = series.length, n = ds.rows.length;
    if (!n || !m) return;
    var all = [];
    series.forEach(function (sv) { sv.forEach(function (v) { all.push(v); }); });
    var maxV = Math.max(0, Math.max.apply(null, all));
    var minV = Math.min(0, Math.min.apply(null, all));
    if (maxV === 0 && minV === 0) maxV = 1;
    var pad = 14, pw = W - pad * 2, ph = H - pad * 2;
    var y0 = pad + ph * (maxV / (maxV - minV)); // zero line
    function yOf(v) { return pad + ph * ((maxV - v) / (maxV - minV)); }
    ctx.strokeStyle = 'rgba(200,200,200,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(W - pad, y0); ctx.stroke();

    var horizontal = state.type === 'bar' && $('barDir').value === 'horizontal';
    if (state.type === 'bar' && !horizontal) {
      var slot = pw / n, groupW = slot * 0.72, bw = groupW / m;
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < m; j++) {
          var v = series[j][i];
          var tone = m > 1 ? toneT(j, m) : toneT(i, n);
          var color = (m === 1 && ds.rows[i].useCustom) ? ds.rows[i].color : rampTone(master, tone, spread);
          var x = pad + slot * i + slot / 2 - groupW / 2 + bw * j;
          var yv = yOf(v);
          var g = ctx.createLinearGradient(0, Math.min(yv, y0), 0, Math.max(yv, y0));
          g.addColorStop(0, rampTone(color, -0.25, 0.5));
          g.addColorStop(1, rampTone(color, 0.25, 0.5));
          ctx.fillStyle = v >= 0 ? g : color;
          ctx.fillRect(x, Math.min(yv, y0), bw * 0.85, Math.abs(yv - y0));
        }
      }
    } else if (horizontal) {
      var x0 = pad + pw * (-minV / (maxV - minV));
      var slotH = ph / n, groupH = slotH * 0.72, bh = groupH / m;
      function xOf(v) { return pad + pw * ((v - minV) / (maxV - minV)); }
      ctx.strokeStyle = 'rgba(200,200,200,0.35)';
      ctx.beginPath(); ctx.moveTo(x0, pad); ctx.lineTo(x0, H - pad); ctx.stroke();
      for (var i2 = 0; i2 < n; i2++) {
        for (var j2 = 0; j2 < m; j2++) {
          var v2 = series[j2][i2];
          var tone2 = m > 1 ? toneT(j2, m) : toneT(i2, n);
          var color2 = (m === 1 && ds.rows[i2].useCustom) ? ds.rows[i2].color : rampTone(master, tone2, spread);
          var y = pad + slotH * i2 + slotH / 2 - groupH / 2 + bh * j2;
          ctx.fillStyle = color2;
          ctx.fillRect(Math.min(x0, xOf(v2)), y, Math.abs(xOf(v2) - x0), bh * 0.85);
        }
      }
    } else { // line / area
      var step = n > 1 ? pw / (n - 1) : 0;
      for (var j3 = 0; j3 < m; j3++) {
        var color3 = rampTone(master, toneT(j3, m), spread);
        ctx.beginPath();
        for (var i3 = 0; i3 < n; i3++) {
          var px = pad + step * i3, py = yOf(series[j3][i3]);
          if (i3 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        if (state.type === 'area') {
          ctx.save();
          ctx.lineTo(pad + step * (n - 1), y0);
          ctx.lineTo(pad, y0);
          ctx.closePath();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = color3;
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          for (var i4 = 0; i4 < n; i4++) {
            var px2 = pad + step * i4, py2 = yOf(series[j3][i4]);
            if (i4 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
          }
        }
        ctx.strokeStyle = color3;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        for (var i5 = 0; i5 < n; i5++) {
          ctx.beginPath();
          ctx.arc(pad + step * i5, yOf(series[j3][i5]), 3, 0, Math.PI * 2);
          ctx.fillStyle = rampTone(color3, -0.3, 0.5);
          ctx.fill();
        }
      }
    }
  }

  function drawPiePreview(ctx, W, H, master, spread) {
    var items = state.datasets.pie.map(function (it) {
      return { v: Math.max(parseNum(it.value) || 0, 0), useCustom: it.useCustom, color: it.color };
    }).filter(function (it) { return it.v > 0; });
    if ($('pieSort').checked) items.sort(function (a, b) { return b.v - a.v; });
    var total = items.reduce(function (s, it) { return s + it.v; }, 0);
    if (!total) return;
    var cx = W / 2, cy = H / 2, R = H / 2 - 10;
    var hole = clamp(parseFloat($('pieDonut').value) || 0, 0, 90) / 100 * R;
    var a = -Math.PI / 2;
    items.forEach(function (it, i) {
      var sweep = it.v / total * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a, a + sweep);
      ctx.arc(cx, cy, hole, a + sweep, a, true);
      ctx.closePath();
      ctx.fillStyle = it.useCustom ? it.color : rampTone(master, toneT(i, items.length), spread);
      ctx.fill();
      a += sweep;
    });
  }

  // -------------------------------------------------------- build config

  function collectConfig() {
    var type = state.type;
    var cfg = {
      version: 2,
      type: type,
      title: $('chartTitle').value,
      datasets: state.datasets, // both tabs persist with the chart
      bar: { horizontal: $('barDir').value === 'horizontal' },
      color: {
        master: $('masterColor').value,
        spread: parseFloat($('toneSpread').value)
      },
      format: {
        mode: $('fmtMode').value,
        decimals: clamp(parseInt($('fmtDecimals').value, 10) || 0, 0, 3),
        thousands: $('fmtThousands').checked,
        prefix: $('fmtPrefix').value,
        suffix: $('fmtSuffix').value,
        showValues: $('fmtShowValues').checked
      },
      pie: {
        sortDesc: $('pieSort').checked,
        includeValue: $('pieIncludeValue').checked,
        donutHole: clamp(parseFloat($('pieDonut').value) || 0, 0, 90)
      },
      anim: {
        delay: Math.max(0, parseFloat($('animDelay').value) || 0),
        duration: Math.max(0.1, parseFloat($('animDuration').value) || 2),
        stagger: Math.max(0, parseFloat($('animStagger').value) || 0),
        easing: $('animEasing').value,
        outEnabled: $('animOut').checked,
        outDuration: Math.max(0.1, parseFloat($('animOutDur').value) || 1)
      }
    };

    if (type === 'pie') {
      var items = [];
      var src = state.datasets.pie;
      for (var i = 0; i < src.length; i++) {
        var v = parseNum(src[i].value);
        if (!src[i].label || isNaN(v)) throw new Error('Pie tab, row ' + (i + 1) + ': needs a label and a numeric value.');
        if (v <= 0) throw new Error('Pie charts need every value > 0 (row ' + (i + 1) + ').');
        items.push({ label: src[i].label, value: v, useCustom: !!src[i].useCustom, color: src[i].color });
      }
      if (items.length < 2) throw new Error('Pie tab: enter at least 2 data points.');
      if (items.length > MAX_POINTS) throw new Error('Maximum ' + MAX_POINTS + ' data points.');
      cfg.items = items;
    } else {
      var ds = state.datasets.barline;
      var mN = ds.seriesNames.length;
      var categories = [], seriesOut = [], overrides = [];
      for (var j = 0; j < mN; j++) seriesOut.push({ name: ds.seriesNames[j] || ('Series ' + (j + 1)), values: [] });
      for (var r = 0; r < ds.rows.length; r++) {
        var row = ds.rows[r];
        if (!row.label) throw new Error('Bar/Line tab, row ' + (r + 1) + ': needs a label.');
        categories.push(row.label);
        overrides.push({ useCustom: !!row.useCustom, color: row.color });
        for (var j2 = 0; j2 < mN; j2++) {
          var v2 = parseNum(row.values[j2]);
          if (isNaN(v2)) throw new Error('Bar/Line tab, row ' + (r + 1) + ', "' + seriesOut[j2].name + '": needs a numeric value.');
          seriesOut[j2].values.push(v2);
        }
      }
      if (categories.length < 2) throw new Error('Bar/Line tab: enter at least 2 data points.');
      if (categories.length > MAX_POINTS) throw new Error('Maximum ' + MAX_POINTS + ' data points.');
      cfg.categories = categories;
      cfg.series = seriesOut;
      cfg.pointOverrides = overrides;
      // Legacy mirror so older JSX/readers still see something sensible.
      cfg.seriesName = seriesOut[0].name;
      cfg.items = categories.map(function (c, idx) {
        return { label: c, value: seriesOut[0].values[idx], useCustom: overrides[idx].useCustom, color: overrides[idx].color };
      });
    }
    return cfg;
  }

  function applyConfig(cfg) {
    state.type = cfg.type || 'bar';
    state.activeDs = dsForType(state.type);

    function cleanPie(arr) {
      return (arr || []).map(function (it) {
        return { label: it.label, value: it.value, useCustom: !!it.useCustom, color: it.color || DEFAULT_COLOR };
      });
    }
    function migrateBarline(d) {
      if (d && d.rows) { // v2 shape
        return {
          seriesNames: (d.seriesNames && d.seriesNames.length ? d.seriesNames : ['Series 1']).slice(0, MAX_SERIES),
          rows: d.rows.map(function (r) {
            return { label: r.label, values: (r.values || []).slice(), useCustom: !!r.useCustom, color: r.color || DEFAULT_COLOR };
          })
        };
      }
      if (d && d.length) { // v1: plain items array
        return {
          seriesNames: [cfg.seriesName || 'Series 1'],
          rows: d.map(function (it) {
            return { label: it.label, values: [it.value], useCustom: !!it.useCustom, color: it.color || DEFAULT_COLOR };
          })
        };
      }
      return null;
    }

    if (cfg.datasets) {
      var bl = migrateBarline(cfg.datasets.barline);
      if (bl) state.datasets.barline = bl;
      if (cfg.datasets.pie && cfg.datasets.pie.length) state.datasets.pie = cleanPie(cfg.datasets.pie);
    } else if (cfg.items) {
      if (state.type === 'pie') state.datasets.pie = cleanPie(cfg.items);
      else state.datasets.barline = migrateBarline(cfg.items);
    }

    $('chartTitle').value = cfg.title || '';
    if (cfg.bar) $('barDir').value = cfg.bar.horizontal ? 'horizontal' : 'vertical';
    if (cfg.color) {
      $('masterColor').value = cfg.color.master || DEFAULT_COLOR;
      $('toneSpread').value = cfg.color.spread != null ? cfg.color.spread : 45;
      $('toneSpreadVal').textContent = $('toneSpread').value;
    }
    if (cfg.format) {
      $('fmtMode').value = cfg.format.mode || 'number';
      $('fmtDecimals').value = cfg.format.decimals != null ? cfg.format.decimals : 0;
      $('fmtThousands').checked = cfg.format.thousands !== false;
      $('fmtPrefix').value = cfg.format.prefix || '';
      $('fmtSuffix').value = cfg.format.suffix || '';
      $('fmtShowValues').checked = cfg.format.showValues !== false;
    }
    if (cfg.pie) {
      $('pieSort').checked = !!cfg.pie.sortDesc;
      $('pieIncludeValue').checked = !!cfg.pie.includeValue;
      $('pieDonut').value = cfg.pie.donutHole != null ? cfg.pie.donutHole : 0;
    }
    if (cfg.anim) {
      $('animDelay').value = cfg.anim.delay != null ? cfg.anim.delay : 0.3;
      $('animDuration').value = cfg.anim.duration != null ? cfg.anim.duration : 2;
      $('animStagger').value = cfg.anim.stagger != null ? cfg.anim.stagger : 0.25;
      $('animEasing').value = cfg.anim.easing || 'smooth';
      $('animOut').checked = !!cfg.anim.outEnabled;
      $('animOutDur').value = cfg.anim.outDuration != null ? cfg.anim.outDuration : 1;
    }
    syncTypeUI();
    renderGrid();
  }

  // ------------------------------------------------------------- presets

  function loadPresets() {
    try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function storePresets(p) {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function refreshPresetList() {
    var sel = $('presetList');
    var presets = loadPresets();
    sel.innerHTML = '<option value="">(choose preset)</option>';
    Object.keys(presets).sort().forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  function currentStyle() {
    return {
      barHorizontal: $('barDir').value === 'horizontal',
      color: { master: $('masterColor').value, spread: parseFloat($('toneSpread').value) },
      format: {
        mode: $('fmtMode').value,
        decimals: parseInt($('fmtDecimals').value, 10) || 0,
        thousands: $('fmtThousands').checked,
        prefix: $('fmtPrefix').value,
        suffix: $('fmtSuffix').value,
        showValues: $('fmtShowValues').checked
      },
      pie: {
        sortDesc: $('pieSort').checked,
        includeValue: $('pieIncludeValue').checked,
        donutHole: parseFloat($('pieDonut').value) || 0
      },
      anim: {
        delay: parseFloat($('animDelay').value) || 0,
        duration: parseFloat($('animDuration').value) || 2,
        stagger: parseFloat($('animStagger').value) || 0,
        easing: $('animEasing').value,
        outEnabled: $('animOut').checked,
        outDuration: parseFloat($('animOutDur').value) || 1
      }
    };
  }

  function applyStyle(st) {
    if (!st) return;
    if (st.barHorizontal != null) $('barDir').value = st.barHorizontal ? 'horizontal' : 'vertical';
    applyConfig({ type: state.type, datasets: state.datasets, title: $('chartTitle').value,
      color: st.color, format: st.format, pie: st.pie, anim: st.anim,
      bar: { horizontal: !!st.barHorizontal } });
  }

  // ------------------------------------------------------------- actions

  function syncTypeUI() {
    var btns = $('typeSwitch').querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = btns[i].getAttribute('data-type') === state.type ? 'active' : '';
    }
    $('pieOpts').className = state.type === 'pie' ? '' : 'hidden';
    $('barDirRow').style.display = state.type === 'bar' ? '' : 'none';
    var tabs = $('dataTabs').querySelectorAll('button');
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].className = tabs[j].getAttribute('data-ds') === state.activeDs ? 'active' : '';
    }
    var isBarline = state.activeDs === 'barline';
    $('addSeries').style.display = isBarline ? '' : 'none';
    $('delSeries').style.display = isBarline && state.datasets.barline.seriesNames.length > 1 ? '' : 'none';
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
    csi.evalScript('GRAPHINATOR.generate(' + payload + ')', handleResult);
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

  function bake() {
    setStatus('Baking expressions to keyframes…', false);
    csi.evalScript('GRAPHINATOR.bake()', handleResult);
  }

  function handleResult(res) {
    res = String(res || '');
    if (res.indexOf('OK|') === 0) setStatus(res.substring(3), false);
    else if (res.indexOf('ERR|') === 0) setStatus(res.substring(4), true);
    else setStatus('Unexpected host response: ' + res, true);
  }

  function randomColor() {
    var h = Math.random();
    var s = 0.5 + Math.random() * 0.4;   // saturated but not neon
    var l = 0.42 + Math.random() * 0.16; // mid lightness so ramps have headroom
    var hex = hslToHex(h, s, l);
    $('masterColor').value = hex;
    renderRamp();
    schedulePreview();
    var r = parseInt(hex.substr(1, 2), 16) / 255;
    var g = parseInt(hex.substr(3, 2), 16) / 255;
    var b = parseInt(hex.substr(5, 2), 16) / 255;
    csi.evalScript('GRAPHINATOR.setMasterColor(' + r + ',' + g + ',' + b + ')', function (res) {
      res = String(res || '');
      if (res.indexOf('OK|') === 0) setStatus('Random color applied to the live chart.', false);
      else setStatus('Random color set. Generate a chart to use it.', false);
    });
  }

  // ------------------------------------------------------------ importers

  /* Parse CSV/TSV text into {header, rows} where rows are arrays of cells.
   * Handles quoted cells with commas; auto-detects tab vs comma. */
  function parseDelimited(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    var delim = text.indexOf('\t') >= 0 ? '\t' : ',';
    return lines.map(function (line) {
      var cells = [];
      var cur = '';
      var inQ = false;
      for (var i = 0; i < line.length; i++) {
        var c = line.charAt(i);
        if (inQ) {
          if (c === '"' && line.charAt(i + 1) === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === delim) { cells.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      cells.push(cur.trim());
      return cells;
    });
  }

  function importRows(text, sourceName) {
    var grid = parseDelimited(text);
    if (!grid.length) { setStatus(sourceName + ': no data found.', true); return; }

    // Header row? If any value column in row 0 is non-numeric, treat row 0
    // as series names.
    var first = grid[0];
    var hasHeader = first.length > 1 && first.slice(1).some(function (c) { return c !== '' && isNaN(parseNum(c)); });
    var header = hasHeader ? first : null;
    var body = hasHeader ? grid.slice(1) : grid;
    if (body.length < 2) { setStatus(sourceName + ': need at least 2 data rows.', true); return; }
    if (body.length > MAX_POINTS) { setStatus('Maximum ' + MAX_POINTS + ' data points.', true); return; }

    if (state.activeDs === 'pie') {
      var items = [];
      for (var i = 0; i < body.length; i++) {
        var v = parseNum(body[i][1]);
        if (!body[i][0] || isNaN(v)) { setStatus(sourceName + ' row ' + (i + 1) + ': expected "Label, Value".', true); return; }
        items.push({ label: body[i][0], value: v, useCustom: false, color: DEFAULT_COLOR });
      }
      state.datasets.pie = items;
      renderGrid();
      setStatus('Imported ' + items.length + ' rows into the Pie tab.', false);
      return;
    }

    var m = Math.min(Math.max(1, (body[0] || []).length - 1), MAX_SERIES);
    var names = [];
    for (var j = 0; j < m; j++) {
      names.push(header && header[j + 1] ? header[j + 1] : 'Series ' + (j + 1));
    }
    var rows = [];
    for (var r = 0; r < body.length; r++) {
      var vals = [];
      for (var j2 = 0; j2 < m; j2++) {
        var v2 = parseNum(body[r][j2 + 1]);
        if (isNaN(v2)) { setStatus(sourceName + ' row ' + (r + 1) + ', column ' + (j2 + 2) + ': "' + (body[r][j2 + 1] || '') + '" is not a number.', true); return; }
        vals.push(v2);
      }
      if (!body[r][0]) { setStatus(sourceName + ' row ' + (r + 1) + ': missing label.', true); return; }
      rows.push({ label: body[r][0], values: vals, useCustom: false, color: DEFAULT_COLOR });
    }
    state.datasets.barline = { seriesNames: names, rows: rows };
    syncTypeUI();
    renderGrid();
    setStatus('Imported ' + rows.length + ' rows × ' + m + ' series into the Bar/Line tab.', false);
  }

  // ---------------------------------------------------------------- wire

  $('typeSwitch').addEventListener('click', function (ev) {
    var t = ev.target.getAttribute && ev.target.getAttribute('data-type');
    if (!t) return;
    state.type = t;
    state.activeDs = dsForType(t); // data tab follows the chart type
    syncTypeUI();
    renderGrid();
  });

  $('dataTabs').addEventListener('click', function (ev) {
    var ds = ev.target.getAttribute && ev.target.getAttribute('data-ds');
    if (!ds || ds === state.activeDs) return;
    state.activeDs = ds;
    syncTypeUI();
    renderGrid();
  });

  $('copyDs').addEventListener('click', function () {
    if (state.activeDs === 'pie') {
      var bl = state.datasets.barline;
      state.datasets.pie = bl.rows.map(function (r) {
        return { label: r.label, value: parseNum(r.values[0]) || 0, useCustom: r.useCustom, color: r.color };
      });
      setStatus('Copied ' + state.datasets.pie.length + ' rows from the Bar/Line tab (first series).', false);
    } else {
      state.datasets.barline = {
        seriesNames: ['Series 1'],
        rows: state.datasets.pie.map(function (it) {
          return { label: it.label, values: [it.value], useCustom: it.useCustom, color: it.color };
        })
      };
      setStatus('Copied ' + state.datasets.barline.rows.length + ' rows from the Pie tab.', false);
    }
    syncTypeUI();
    renderGrid();
  });

  $('addRow').addEventListener('click', function () {
    if (state.activeDs === 'pie') {
      var pie = state.datasets.pie;
      if (pie.length >= MAX_POINTS) { setStatus('Maximum ' + MAX_POINTS + ' data points.', true); return; }
      pie.push({ label: 'Item ' + (pie.length + 1), value: 0, useCustom: false, color: DEFAULT_COLOR });
    } else {
      var ds = state.datasets.barline;
      if (ds.rows.length >= MAX_POINTS) { setStatus('Maximum ' + MAX_POINTS + ' data points.', true); return; }
      ds.rows.push({
        label: 'Item ' + (ds.rows.length + 1),
        values: ds.seriesNames.map(function () { return 0; }),
        useCustom: false, color: DEFAULT_COLOR
      });
    }
    renderGrid();
  });

  $('addSeries').addEventListener('click', function () {
    var ds = state.datasets.barline;
    if (ds.seriesNames.length >= MAX_SERIES) { setStatus('Maximum ' + MAX_SERIES + ' series.', true); return; }
    ds.seriesNames.push('Series ' + (ds.seriesNames.length + 1));
    ds.rows.forEach(function (r) { r.values.push(0); });
    syncTypeUI();
    renderGrid();
  });

  $('delSeries').addEventListener('click', function () {
    var ds = state.datasets.barline;
    if (ds.seriesNames.length <= 1) return;
    ds.seriesNames.pop();
    ds.rows.forEach(function (r) { r.values.pop(); });
    syncTypeUI();
    renderGrid();
  });

  $('togglePaste').addEventListener('click', function () {
    var box = $('pasteBox');
    box.className = box.className === 'hidden' ? '' : 'hidden';
  });

  $('importPaste').addEventListener('click', function () {
    importRows($('pasteArea').value, 'Paste');
  });

  $('importCsv').addEventListener('click', function () { $('csvFile').click(); });
  $('csvFile').addEventListener('change', function () {
    var file = $('csvFile').files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { importRows(String(reader.result), file.name); };
    reader.onerror = function () { setStatus('Could not read ' + file.name, true); };
    reader.readAsText(file);
    $('csvFile').value = '';
  });

  $('randomColor').addEventListener('click', randomColor);
  $('masterColor').addEventListener('input', function () { renderRamp(); schedulePreview(); });
  $('toneSpread').addEventListener('input', function () {
    $('toneSpreadVal').textContent = $('toneSpread').value;
    renderRamp();
    schedulePreview();
  });
  ['barDir', 'pieDonut', 'pieSort'].forEach(function (id) {
    $(id).addEventListener('change', schedulePreview);
  });

  $('savePreset').addEventListener('click', function () {
    var name = $('presetName').value.trim();
    if (!name) { setStatus('Give the preset a name first.', true); return; }
    var presets = loadPresets();
    presets[name] = currentStyle();
    storePresets(presets);
    refreshPresetList();
    $('presetList').value = name;
    setStatus('Preset "' + name + '" saved.', false);
  });

  $('applyPreset').addEventListener('click', function () {
    var name = $('presetList').value;
    if (!name) { setStatus('Choose a preset to apply.', true); return; }
    applyStyle(loadPresets()[name]);
    setStatus('Preset "' + name + '" applied. Press Update to rebuild the chart with it.', false);
  });

  $('deletePreset').addEventListener('click', function () {
    var name = $('presetList').value;
    if (!name) { setStatus('Choose a preset to delete.', true); return; }
    var presets = loadPresets();
    delete presets[name];
    storePresets(presets);
    refreshPresetList();
    setStatus('Preset "' + name + '" deleted.', false);
  });

  $('generate').addEventListener('click', generate);
  $('loadFromComp').addEventListener('click', loadFromComp);
  $('bake').addEventListener('click', bake);
  window.addEventListener('resize', schedulePreview);

  refreshPresetList();
  syncTypeUI();
  renderGrid();
})();
