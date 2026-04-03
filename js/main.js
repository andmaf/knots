import { PAGE_W, PAGE_H, setPageSize } from './config.js';
import { computeHandles } from './geometry.js';
import { generateCurve } from './generator.js';
import { drawCurve, drawTextOnPath, drawDebugRects, drawExtremaGuides, drawHandles, drawAnchors } from './renderer.js';
import { setupInteraction } from './interaction.js';
import { exportSVG } from './export.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const CANVAS_MAX = 842; // max pixel dimension for display
canvas.width = PAGE_W;
canvas.height = PAGE_H;

// Each path: { points: [], text: '' }
const state = {
  paths: [{ points: [], text: '' }],
  activePath: 0,
  history: [],
  drawMode: true,
  selected: new Set(),
  customFontName: null
};

// Convenience accessors for active path
function ap() { return state.paths[state.activePath]; }
// Expose points/text of active path to interaction.js via proxy
Object.defineProperty(state, 'points', {
  get() { return state.paths[state.activePath].points; },
  set(v) { state.paths[state.activePath].points = v; }
});

const ui = {
  weight:    document.getElementById('stroke-weight'),
  color:     document.getElementById('stroke-color'),
  pathText:  document.getElementById('path-text'),
  baseline:  document.getElementById('baseline-offset'),
  fontFile:  document.getElementById('font-file'),
  handleP:   document.getElementById('handle-pct'),
  close:     document.getElementById('close-path'),
  showPts:   document.getElementById('show-points'),
  showRect:  document.getElementById('show-debug-rect'),
  showH:     document.getElementById('show-handles'),
  showEx:    document.getElementById('show-extrema'),
  showIdx:   document.getElementById('show-indices'),
  pageW:     document.getElementById('page-w'),
  pageH:     document.getElementById('page-h'),
  applyPage: document.getElementById('apply-page'),
  exportSvg: document.getElementById('export-svg'),
  drawToggle: document.getElementById('draw-mode-toggle'),
  drawLabel:  document.getElementById('draw-mode-label'),
  addPath:   document.getElementById('add-path'),
  pathList:  document.getElementById('path-list'),
  undo:      document.getElementById('undo'),
  clear:     document.getElementById('clear'),
  valW:      document.getElementById('val-weight'),
  valH:      document.getElementById('val-handle'),
  valBase:   document.getElementById('val-baseline'),
  count:     document.getElementById('point-count'),
  // Generator
  genPoints:  document.getElementById('gen-points'),
  genXMin:    document.getElementById('gen-x-min'),
  genXMax:    document.getElementById('gen-x-max'),
  genYMin:    document.getElementById('gen-y-min'),
  genYMax:    document.getElementById('gen-y-max'),
  genRotation:document.getElementById('gen-rotation'),
  genVariance:document.getElementById('gen-variance'),
  genNoise:   document.getElementById('gen-noise'),
  genMargin:  document.getElementById('gen-margin'),
  regen:      document.getElementById('regenerate'),
  valGenPts:  document.getElementById('val-gen-points'),
  valGenXMin: document.getElementById('val-gen-x-min'),
  valGenXMax: document.getElementById('val-gen-x-max'),
  valGenYMin: document.getElementById('val-gen-y-min'),
  valGenYMax: document.getElementById('val-gen-y-max'),
  valGenRot:  document.getElementById('val-gen-rotation'),
  valGenVar:  document.getElementById('val-gen-variance'),
  valGenNoise:document.getElementById('val-gen-noise'),
  valGenMarg: document.getElementById('val-gen-margin')
};

function getWeight() { return parseInt(ui.weight.value) / 10; }
function getHandlePct() { return parseInt(ui.handleP.value) / 100; }
function getBaseline() { return parseInt(ui.baseline.value); }

function getUI() {
  return {
    closePath:   ui.close.checked,
    showPoints:  ui.showPts.checked,
    showHandles: ui.showH.checked
  };
}

// --- Path list UI ---
function renderPathList() {
  ui.pathList.innerHTML = '';
  state.paths.forEach((p, i) => {
    const tab = document.createElement('div');
    tab.className = 'path-tab' + (i === state.activePath ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = 'Path ' + (i + 1) + ' (' + p.points.length + ' pts)';
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => switchPath(i));
    tab.appendChild(label);

    if (state.paths.length > 1) {
      const del = document.createElement('span');
      del.className = 'delete-path';
      del.textContent = '\u00D7';
      del.addEventListener('click', (e) => { e.stopPropagation(); deletePath(i); });
      tab.appendChild(del);
    }
    ui.pathList.appendChild(tab);
  });
}

function switchPath(i) {
  // Save current text to current path
  ap().text = ui.pathText.value;
  state.activePath = i;
  state.selected.clear();
  // Load new path's text
  ui.pathText.value = ap().text;
  renderPathList();
  draw();
}

function addPath() {
  ap().text = ui.pathText.value;
  state.paths.push({ points: [], text: '' });
  state.activePath = state.paths.length - 1;
  state.selected.clear();
  ui.pathText.value = '';
  renderPathList();
  draw();
}

function deletePath(i) {
  if (state.paths.length <= 1) return;
  state.paths.splice(i, 1);
  if (state.activePath >= state.paths.length) state.activePath = state.paths.length - 1;
  state.selected.clear();
  ui.pathText.value = ap().text;
  renderPathList();
  draw();
}

// --- Font import ---
ui.fontFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const name = 'CustomFont_' + Date.now();
  const reader = new FileReader();
  reader.onload = () => {
    const font = new FontFace(name, reader.result);
    font.load().then((loaded) => {
      document.fonts.add(loaded);
      state.customFontName = name;
      draw();
    });
  };
  reader.readAsArrayBuffer(file);
});

// --- Draw ---
function draw() {
  ctx.clearRect(0, 0, PAGE_W, PAGE_H);
  const closePath = ui.close.checked;
  const weight = getWeight();
  const pct = getHandlePct();
  const baseline = getBaseline();
  const font = state.customFontName;

  ui.valW.textContent = weight.toFixed(1);
  ui.valH.textContent = ui.handleP.value + '%';
  ui.valBase.textContent = ui.baseline.value;

  // Draw ALL paths
  for (let p = 0; p < state.paths.length; p++) {
    const path = state.paths[p];
    const pts = path.points;
    const n = pts.length;
    if (n < 2) {
      if (ui.showPts.checked && n >= 1) {
        const sel = p === state.activePath ? state.selected : new Set();
        drawAnchors(ctx, pts, 0, ui.showIdx.checked, sel);
      }
      continue;
    }

    const handles = computeHandles(pts, closePath, pct, 0);

    drawCurve(ctx, pts, handles, closePath, ui.color.value, weight);

    if (path.text) {
      const fontSize = weight * 0.85;
      drawTextOnPath(ctx, path.text, pts, handles, closePath, fontSize, baseline, font);
    }

    if (ui.showRect.checked) drawDebugRects(ctx, pts, closePath);
    if (ui.showEx.checked) drawExtremaGuides(ctx, pts, 0);
    if (ui.showH.checked) drawHandles(ctx, pts, handles, closePath);
    if (ui.showPts.checked) {
      const sel = p === state.activePath ? state.selected : new Set();
      drawAnchors(ctx, pts, 0, ui.showIdx.checked, sel);
    }
  }

  // Update count for active path
  ui.count.textContent = ap().points.length + ' points (path ' + (state.activePath + 1) + ')';
  renderPathList();
}

function toggleDrawMode() {
  state.drawMode = !state.drawMode;
  state.selected.clear();
  ui.drawToggle.classList.toggle('on', state.drawMode);
  ui.drawLabel.textContent = state.drawMode ? 'Draw mode' : 'Select mode';
  canvas.style.cursor = state.drawMode ? 'crosshair' : 'default';
  draw();
}

function saveSnapshot() {
  state.history.push(JSON.parse(JSON.stringify(state.paths)));
}

function undo() {
  if (state.history.length > 0) {
    state.paths = state.history.pop();
    if (state.activePath >= state.paths.length) state.activePath = state.paths.length - 1;
    state.selected.clear();
    ui.pathText.value = ap().text;
    draw();
  }
}

// --- Generator ---
function getGenParams() {
  const xMn = parseInt(ui.genXMin.value);
  const xMx = parseInt(ui.genXMax.value);
  const yMn = parseInt(ui.genYMin.value);
  const yMx = parseInt(ui.genYMax.value);
  return {
    numPoints:  parseInt(ui.genPoints.value),
    xMin: Math.min(xMn, xMx), xMax: Math.max(xMn, xMx),
    yMin: Math.min(yMn, yMx), yMax: Math.max(yMn, yMx),
    handlePct:  getHandlePct(),
    rotation:   parseInt(ui.genRotation.value) * Math.PI / 180,
    variance:   parseInt(ui.genVariance.value) * Math.PI / 180,
    noiseFreq:  parseInt(ui.genNoise.value) / 100,
    margin:     parseInt(ui.genMargin.value),
    closePath:  ui.close.checked,
    pageW:      PAGE_W,
    pageH:      PAGE_H
  };
}

function updateGenLabels() {
  ui.valGenPts.textContent   = ui.genPoints.value;
  ui.valGenXMin.textContent  = ui.genXMin.value;
  ui.valGenXMax.textContent  = ui.genXMax.value;
  ui.valGenYMin.textContent  = ui.genYMin.value;
  ui.valGenYMax.textContent  = ui.genYMax.value;
  ui.valGenRot.textContent   = ui.genRotation.value + '\u00B0';
  ui.valGenVar.textContent   = ui.genVariance.value + '\u00B0';
  ui.valGenNoise.textContent = (parseInt(ui.genNoise.value) / 100).toFixed(2);
  ui.valGenMarg.textContent  = ui.genMargin.value;
}

function regenerate() {
  saveSnapshot();
  const params = getGenParams();

  // Collect pinned points from active path
  const pinnedPoints = {};
  const curPts = ap().points;
  const curDirs = ap().dirs || [];
  for (let i = 0; i < curPts.length; i++) {
    if (curPts[i].pinned) {
      pinnedPoints[i] = {
        pt: { x: curPts[i].x, y: curPts[i].y, pinned: true },
        dir: curDirs[i] || { ux: 1, uy: 0 }
      };
    }
  }

  const result = generateCurve(params, pinnedPoints);

  // Restore pinned flags
  for (const idx in pinnedPoints) {
    if (result.points[idx]) result.points[idx].pinned = true;
  }

  // Ensure first point has axisOffset for alternating H/V handles
  if (result.points.length > 0 && result.points[0].axisOffset === undefined) {
    result.points[0].axisOffset = 0;
  }
  ap().points = result.points;
  ap().dirs = result.dirs;
  state.selected.clear();
  draw();
}

function applyPageSize() {
  const w = parseInt(ui.pageW.value) || 595;
  const h = parseInt(ui.pageH.value) || 842;
  setPageSize(w, h);
  // Scale canvas to fit the max dimension
  if (w >= h) {
    canvas.width = CANVAS_MAX;
    canvas.height = Math.round(CANVAS_MAX * (h / w));
  } else {
    canvas.height = CANVAS_MAX;
    canvas.width = Math.round(CANVAS_MAX * (w / h));
  }
  draw();
}

function doExportSVG() {
  exportSVG(state.paths, ui.close.checked, getHandlePct(), getWeight(), ui.color.value);
}

setupInteraction(canvas, state, getUI, draw, switchPath);

// Sync text to active path on every keystroke
ui.pathText.addEventListener('input', () => {
  ap().text = ui.pathText.value;
  draw();
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if ((e.key === 'z' || e.key === 'Z') && !e.metaKey && !e.ctrlKey) undo();
  if (e.key === 'd' || e.key === 'D') toggleDrawMode();
  if (e.key === 'r' || e.key === 'R') regenerate();
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected.size > 0) {
    saveSnapshot();
    const sorted = [...state.selected].sort((a, b) => b - a);
    for (const idx of sorted) ap().points.splice(idx, 1);
    state.selected.clear();
    if (ap().points.length > 0 && ap().points[0].axisOffset === undefined) {
      ap().points[0].axisOffset = 0;
    }
    draw();
  }
});

ui.weight.addEventListener('input', draw);
ui.color.addEventListener('input', draw);
ui.baseline.addEventListener('input', draw);
ui.handleP.addEventListener('input', draw);
ui.close.addEventListener('change', draw);
ui.showPts.addEventListener('change', draw);
ui.showRect.addEventListener('change', draw);
ui.showH.addEventListener('change', draw);
ui.showEx.addEventListener('change', draw);
ui.showIdx.addEventListener('change', draw);
ui.drawToggle.addEventListener('click', toggleDrawMode);
ui.addPath.addEventListener('click', addPath);
ui.applyPage.addEventListener('click', applyPageSize);
ui.exportSvg.addEventListener('click', doExportSVG);
ui.undo.addEventListener('click', undo);
ui.clear.addEventListener('click', () => {
  saveSnapshot();
  ap().points = [];
  state.selected.clear();
  draw();
});

// --- Generator events ---
[ui.genPoints, ui.genXMin, ui.genXMax, ui.genYMin, ui.genYMax,
 ui.genRotation, ui.genVariance, ui.genNoise, ui.genMargin
].forEach(el => el.addEventListener('input', updateGenLabels));
ui.regen.addEventListener('click', regenerate);
updateGenLabels();

// --- Collapsible sections ---
document.querySelectorAll('.section-header').forEach(header => {
  header.addEventListener('click', () => {
    const section = header.dataset.section;
    const body = document.querySelector(`.section-body[data-section="${section}"]`);
    header.classList.toggle('collapsed');
    body.classList.toggle('hidden');
  });
});

// --- Resizable sidebar ---
(function() {
  const handle = document.getElementById('resize-handle');
  const controls = document.getElementById('controls');
  let startX, startW;
  function onMouseMove(e) {
    const newW = startW + (e.clientX - startX);
    controls.style.width = Math.max(200, Math.min(500, newW)) + 'px';
  }
  function onMouseUp() {
    handle.classList.remove('active');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startW = controls.offsetWidth;
    handle.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
})();

renderPathList();
draw();
