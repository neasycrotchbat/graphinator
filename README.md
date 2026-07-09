# Graphinator

An animated chart generator for Adobe After Effects, built as a CEP extension.
Enter data in a dockable panel and generate polished, animated **bar**, **line**,
and **pie** charts as native shape + text layers — then art-direct color, timing,
and scale live in the comp without touching the panel again.

Built for AE 2025 (25.x) on Windows; the manifest accepts AE 2019 (16.0) and up.

---

## Install (Windows)

**Easy way:** double-click `install.bat`, then restart After Effects.

**Manual way:**

1. Enable unsigned panels — in `regedit`, under both
   `HKEY_CURRENT_USER\Software\Adobe\CSXS.11` and `...\CSXS.12`, add a
   **String value** named `PlayerDebugMode` set to `1`.
2. Copy this folder to
   `%APPDATA%\Adobe\CEP\extensions\Graphinator`.
3. Restart AE and open **Window > Extensions > Graphinator**.

---

## Where controls live (the hybrid contract)

| I want to change… | Go to… |
|---|---|
| Data points, labels, chart type, number format, title | **The Graphinator panel** → edit → **Generate / Update Chart** |
| Master color, tone spread, label color | **`>> GRAPH CONTROLLER <<` layer** → Effect Controls (`COLOR |` / `STYLE |` groups) — live, no regeneration |
| Build timing: delay, duration, stagger, easing | Controller layer → `ANIM |` effects — live |
| Overall chart size | Controller layer → `SCALE | Overall Scale` — live |
| Outline/highlight width, line weight | Controller layer → `STYLE |` effects — live |

Rules of the road:

- **Update never overwrites controller tweaks.** The panel's animation/color
  fields only seed the controller on first generate.
- **Manual edits to generated layers are lost on Update** — every generated
  layer says so in its Comment field.
- The controller layer's comment holds a cheat sheet **plus the chart's data
  as JSON**, so *Load From Comp* can repopulate the panel in a future session.
- Layer markers on the controller show **BUILD START / BUILD COMPLETE**. They
  are stamped at generation time — if you change timing on the controller,
  press Update once to refresh them (your timing values are preserved).

## Usage

1. Open (or let Graphinator create) a comp — geometry is authored for
   1920×1080 with the chart filling ~75% of frame, wider than tall for
   bar/line; other comp sizes scale proportionally.
2. Pick a chart type, enter data (or **Paste data…** rows of
   `Label<TAB>Value` straight from a spreadsheet).
3. Pick a master color or hit **🎲 Random** — data points are distinguished by
   ramped tones of the one color; tick **Custom** on a row to override just
   that item. Random also updates an already-generated chart live.
4. **Generate / Update Chart.** Switch chart types and press Update again to
   compare styles — data, colors, and timing carry over.

### Chart-type notes

- **Bar** — bars grow from the baseline with stagger; count-up value labels
  ride the bar tops; category labels fade in underneath. Axes, gridlines, and
  a legend are generated with them.
- **Line** — draws on via trim paths; dots and per-point value labels pop in
  as the line passes each point.
- **Pie** — slices sweep open from 12 o'clock. All labels sit **outside** the
  pie with leader lines (so thin slivers stay readable), stacked apart
  automatically when slices are thin. Optional largest-first sorting and
  raw-value-in-label toggles in the panel.
- **Number formats** — plain numbers (decimals, thousands separator,
  prefix/suffix like `$`/`k`) or **percent of total with 1 decimal**, applied
  to value labels and axis ticks. Labels count up as the chart builds.

### Limits (v1)

- 2–60 data points, single series.
- Values must be ≥ 0 (pie: > 0).
- One chart per comp — Update replaces the chart in the active comp.

## Troubleshooting

- **Panel missing from Window > Extensions** — PlayerDebugMode isn't set for
  your CEP version; re-run `install.bat` and restart AE.
- **Pie starts at 3 o'clock instead of 12** (very old AE versions) — set
  Trim Paths > Offset to `-90°` on each slice.
- **"EvalScript error"** — the JSX failed to load; make sure the whole folder
  (including `jsx/`) was copied.
- Panel debugging: open `http://localhost:8092` in Chrome while the panel is
  open (port set in `.debug`).

## Project structure

```
CSXS/manifest.xml    CEP manifest (panel + ScriptPath registration)
index.html           Panel UI
css/style.css        Panel styling (AE dark theme)
js/CSInterface.js    Minimal CEP bridge (evalScript)
js/main.js           Panel logic: data grid, config, ramp preview
jsx/graphinator.jsx  Chart builder: layers, expressions, controller rig
install.bat          Windows installer (registry + copy)
.debug               Remote-debug port config
```

## Roadmap

- v2: multi-series lines / grouped bars, richer legend, CSV file import,
  animate-out, style presets.
