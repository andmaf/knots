import { PAGE_W, PAGE_H, HIT_R } from './config.js';
import { dist } from './geometry.js';

export function setupInteraction(canvas, state, getUI, draw, onSwitchPath) {
  let drag = null;

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (PAGE_W / rect.width),
      y: (e.clientY - rect.top) * (PAGE_H / rect.height)
    };
  }

  // Search all paths for a hit, returns { pathIndex, pointIndex } or null
  function hitPointAnyPath(mx, my) {
    if (!getUI().showPoints) return null;
    // Check active path first for priority
    const active = state.activePath;
    const aPts = state.paths[active].points;
    for (let i = 0; i < aPts.length; i++) {
      if (dist(mx, my, aPts[i].x, aPts[i].y) < HIT_R)
        return { pathIndex: active, pointIndex: i };
    }
    // Then check other paths
    for (let p = 0; p < state.paths.length; p++) {
      if (p === active) continue;
      const pts = state.paths[p].points;
      for (let i = 0; i < pts.length; i++) {
        if (dist(mx, my, pts[i].x, pts[i].y) < HIT_R)
          return { pathIndex: p, pointIndex: i };
      }
    }
    return null;
  }

  function saveSnapshot() {
    state.history.push(JSON.parse(JSON.stringify(state.paths)));
  }

  canvas.addEventListener('mousedown', (e) => {
    const pos = getCanvasPos(e);
    const hit = hitPointAnyPath(pos.x, pos.y);

    if (state.drawMode) {
      saveSnapshot();
      const pt = { x: Math.round(pos.x), y: Math.round(pos.y) };
      if (state.points.length === 0) {
        pt.axisOffset = Math.random() < 0.5 ? 0 : 1;
      }
      state.points.push(pt);
      state.selected.clear();
      draw();
    } else {
      if (hit) {
        // Auto-switch to the hit path if different
        if (hit.pathIndex !== state.activePath) {
          onSwitchPath(hit.pathIndex);
        }

        const idx = hit.pointIndex;

        // Shift+click: toggle pinned flag (survives regeneration)
        if (e.shiftKey) {
          const pt = state.points[idx];
          pt.pinned = !pt.pinned;
          draw();
          return;
        }

        state.selected.clear();
        state.selected.add(idx);
        drag = { startX: pos.x, startY: pos.y, origins: {} };
        for (const i of state.selected) {
          drag.origins[i] = { x: state.points[i].x, y: state.points[i].y };
        }
        canvas.style.cursor = 'grabbing';
        draw();
      } else {
        state.selected.clear();
        draw();
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const pos = getCanvasPos(e);

    if (drag && !state.drawMode) {
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      for (const idx of state.selected) {
        if (drag.origins[idx]) {
          state.points[idx].x = Math.round(drag.origins[idx].x + dx);
          state.points[idx].y = Math.round(drag.origins[idx].y + dy);
        }
      }
      draw();
      return;
    }

    if (state.drawMode) {
      canvas.style.cursor = 'crosshair';
    } else {
      const hit = hitPointAnyPath(pos.x, pos.y);
      canvas.style.cursor = hit ? 'grab' : 'default';
    }
  });

  canvas.addEventListener('mouseup', () => {
    drag = null;
    if (!state.drawMode) canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => { drag = null; });
}
