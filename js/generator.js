// Auto-generation of bezier curve points using Perlin-guided flow
// Ported from visualizer.html — produces points + direction vectors

import { initNoise, perlin1D } from './noise.js';

// ---------- Margin steering ----------
// Returns a force vector pushing away from edges.
// Strength increases as the point approaches the boundary.
function marginSteer(x, y, minX, minY, maxX, maxY) {
  const areaW = maxX - minX;
  const areaH = maxY - minY;
  let fx = 0, fy = 0;
  const ratioL = (x - minX) / (areaW * 0.5);
  const ratioR = (maxX - x) / (areaW * 0.5);
  const ratioT = (y - minY) / (areaH * 0.5);
  const ratioB = (maxY - y) / (areaH * 0.5);
  const strength = 1.5;
  if (ratioL < 0.5) fx += strength * (1 - ratioL * 2);
  if (ratioR < 0.5) fx -= strength * (1 - ratioR * 2);
  if (ratioT < 0.5) fy += strength * (1 - ratioT * 2);
  if (ratioB < 0.5) fy -= strength * (1 - ratioB * 2);
  return { fx, fy };
}

// ---------- Single point placement ----------
// Places next point relative to `prev`, using Perlin noise for angle
// deviation and margin steering to avoid edges. Enforces minimum
// x/y distance from ALL existing points.
function generateNextPoint(prev, prevDir, params, minX, minY, maxX, maxY, allPts, pointIndex) {
  const MAX_ATTEMPTS = 50;
  let nx, ny;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const baseAngle = Math.atan2(prevDir.uy, prevDir.ux);
    const noiseVal = perlin1D(pointIndex * params.noiseFreq + attempt * 0.1);
    let placeAngle = baseAngle + noiseVal * params.variance;

    // Blend in margin steering
    const steer = marginSteer(prev.x, prev.y, minX, minY, maxX, maxY);
    const steerMag = Math.sqrt(steer.fx * steer.fx + steer.fy * steer.fy);
    if (steerMag > 0.01) {
      const steerAngle = Math.atan2(steer.fy, steer.fx);
      let diff = steerAngle - placeAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      placeAngle += diff * Math.min(steerMag, 1);
    }

    const xDist = params.xMin + Math.random() * (params.xMax - params.xMin);
    const yDist = params.yMin + Math.random() * (params.yMax - params.yMin);
    const signX = Math.cos(placeAngle) >= 0 ? 1 : -1;
    const signY = Math.sin(placeAngle) >= 0 ? 1 : -1;

    nx = Math.max(minX, Math.min(maxX, prev.x + signX * xDist));
    ny = Math.max(minY, Math.min(maxY, prev.y + signY * yDist));

    // Enforce minimum distance from every existing point
    let tooClose = false;
    for (let k = 0; k < allPts.length; k++) {
      if (Math.abs(nx - allPts[k].x) < params.xMin &&
          Math.abs(ny - allPts[k].y) < params.yMin) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) return { x: nx, y: ny };
  }

  // Fallback: return last attempt
  return { x: nx, y: ny };
}

// ---------- Full curve generation ----------
// Generates `numPoints` points using Perlin-guided walk.
// `pinnedPoints` is an optional map: index → {x, y, dir} for points
// that should be preserved across regenerations.
//
// params shape:
//   numPoints, xMin, xMax, yMin, yMax, handlePct,
//   rotation (radians), variance (radians), noiseFreq,
//   margin, closePath, pageW, pageH
//
// Returns { points: [{x,y}], dirs: [{ux,uy}] }
export function generateCurve(params, pinnedPoints = {}) {
  initNoise(); // fresh seed each call

  const m = params.margin;
  const minX = m, maxX = params.pageW - m;
  const minY = m, maxY = params.pageH - m;
  const n = params.numPoints;

  const pts = [];
  const dirs = [];

  // Point 0
  if (pinnedPoints[0]) {
    pts.push(pinnedPoints[0].pt);
    dirs.push(pinnedPoints[0].dir);
  } else {
    pts.push({
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY)
    });
    const a = Math.random() * Math.PI * 2;
    dirs.push({ ux: Math.cos(a), uy: Math.sin(a) });
  }

  // Subsequent points
  for (let i = 1; i < n; i++) {
    const prevAngle = Math.atan2(dirs[i - 1].uy, dirs[i - 1].ux);
    const newAngle = prevAngle + params.rotation;
    const dir = { ux: Math.cos(newAngle), uy: Math.sin(newAngle) };

    if (pinnedPoints[i]) {
      pts.push(pinnedPoints[i].pt);
      dirs.push(pinnedPoints[i].dir);
    } else {
      const pt = generateNextPoint(pts[i - 1], dirs[i - 1], params, minX, minY, maxX, maxY, pts, i);
      pts.push(pt);
      dirs.push(dir);
    }
  }

  return { points: pts, dirs };
}

// ---------- Direction-based handle computation ----------
// Unlike geometry.js (axis-aligned), this computes handles along
// each point's direction vector, with length derived from the
// parallel projection of the distance to neighbors.
export function computeDirectionalHandles(pts, dirs, handlePct, closePath) {
  const n = pts.length;
  const handles = [];

  function calcLen(fromPt, toPt, ux, uy) {
    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const euclidean = Math.sqrt(dx * dx + dy * dy);
    let parallel = Math.abs(dx * ux + dy * uy);
    if (parallel < 1) parallel = euclidean;
    return Math.min(handlePct * parallel, euclidean);
  }

  for (let i = 0; i < n; i++) {
    const { ux, uy } = dirs[i];
    const curr = pts[i];

    const prevIdx = closePath ? (i - 1 + n) % n : i - 1;
    let inLen = prevIdx >= 0 ? calcLen(curr, pts[prevIdx], ux, uy) : 0;

    const nextIdx = closePath ? (i + 1) % n : i + 1;
    let outLen = nextIdx < n ? calcLen(curr, pts[nextIdx], ux, uy) : 0;

    // Mirror for open-path endpoints
    if (!closePath && i === 0) inLen = outLen;
    if (!closePath && i === n - 1) outLen = inLen;

    handles.push({
      inX:  curr.x - ux * inLen,
      inY:  curr.y - uy * inLen,
      outX: curr.x + ux * outLen,
      outY: curr.y + uy * outLen
    });
  }

  return handles;
}
