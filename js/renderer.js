import { PAGE_W, PAGE_H } from './config.js';

// Sample a point on a cubic bezier at parameter t (0–1)
function bezierPoint(p0, cp1, cp2, p1, t) {
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*cp1.x + 3*u*t*t*cp2.x + t*t*t*p1.x,
    y: u*u*u*p0.y + 3*u*u*t*cp1.y + 3*u*t*t*cp2.y + t*t*t*p1.y
  };
}

// Sample the tangent (derivative) of a cubic bezier at t
function bezierTangent(p0, cp1, cp2, p1, t) {
  const u = 1 - t;
  return {
    x: 3*u*u*(cp1.x-p0.x) + 6*u*t*(cp2.x-cp1.x) + 3*t*t*(p1.x-cp2.x),
    y: 3*u*u*(cp1.y-p0.y) + 6*u*t*(cp2.y-cp1.y) + 3*t*t*(p1.y-cp2.y)
  };
}

// Approximate the total arc length of the full path by sampling
function measurePath(pts, handles, closePath) {
  const n = pts.length;
  const segs = closePath ? n : n - 1;
  let total = 0;
  const segLengths = [];
  const steps = 64;

  for (let seg = 0; seg < segs; seg++) {
    const j = (seg + 1) % n;
    const p0 = pts[seg];
    const cp1 = { x: handles[seg].outX, y: handles[seg].outY };
    const cp2 = { x: handles[j].inX, y: handles[j].inY };
    const p1 = pts[j];
    let len = 0;
    let prev = p0;
    for (let s = 1; s <= steps; s++) {
      const cur = bezierPoint(p0, cp1, cp2, p1, s / steps);
      len += Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
      prev = cur;
    }
    segLengths.push(len);
    total += len;
  }
  return { total, segLengths };
}

// Get position and angle on the path at a given distance from the start
function sampleAtDistance(pts, handles, closePath, segLengths, targetDist) {
  const n = pts.length;
  const segs = closePath ? n : n - 1;
  const steps = 64;
  let accumulated = 0;

  for (let seg = 0; seg < segs; seg++) {
    const segLen = segLengths[seg];
    if (accumulated + segLen < targetDist && seg < segs - 1) {
      accumulated += segLen;
      continue;
    }

    const j = (seg + 1) % n;
    const p0 = pts[seg];
    const cp1 = { x: handles[seg].outX, y: handles[seg].outY };
    const cp2 = { x: handles[j].inX, y: handles[j].inY };
    const p1 = pts[j];

    // Walk this segment to find the exact t
    let prev = p0;
    let dist = accumulated;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cur = bezierPoint(p0, cp1, cp2, p1, t);
      const d = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
      if (dist + d >= targetDist) {
        // Interpolate within this micro-step
        const frac = (targetDist - dist) / (d || 1);
        const exactT = (s - 1 + frac) / steps;
        const pos = bezierPoint(p0, cp1, cp2, p1, exactT);
        const tan = bezierTangent(p0, cp1, cp2, p1, exactT);
        const angle = Math.atan2(tan.y, tan.x);
        return { x: pos.x, y: pos.y, angle };
      }
      dist += d;
      prev = cur;
    }
    accumulated = dist;
  }

  // Fallback: end of path
  const lastSeg = segs - 1;
  const j = (lastSeg + 1) % n;
  const tan = bezierTangent(pts[lastSeg],
    { x: handles[lastSeg].outX, y: handles[lastSeg].outY },
    { x: handles[j].inX, y: handles[j].inY },
    pts[j], 1);
  return { x: pts[j].x, y: pts[j].y, angle: Math.atan2(tan.y, tan.x) };
}

export function drawTextOnPath(ctx, text, pts, handles, closePath, fontSize, baselineOffset, fontFamily) {
  if (!text || pts.length < 2) return;

  const { total, segLengths } = measurePath(pts, handles, closePath);
  const font = fontFamily || '-apple-system, Helvetica, Arial, sans-serif';
  ctx.font = fontSize + 'px ' + font;

  let currentDist = 0;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';

  for (let c = 0; c < text.length; c++) {
    const ch = text[c];
    const charW = ctx.measureText(ch).width;
    const midDist = currentDist + charW / 2;
    if (midDist > total) break;

    const sample = sampleAtDistance(pts, handles, closePath, segLengths, midDist);

    // Apply baseline offset perpendicular to tangent
    const offX = -Math.sin(sample.angle) * baselineOffset;
    const offY = Math.cos(sample.angle) * baselineOffset;

    ctx.save();
    ctx.translate(sample.x + offX, sample.y + offY);
    ctx.rotate(sample.angle);
    ctx.fillText(ch, -charW / 2, 0);
    ctx.restore();

    currentDist += charW;
  }
}

export function drawCurve(ctx, pts, handles, closePath, color, weight) {
  const n = pts.length;
  if (n < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'bevel';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  const last = closePath ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    ctx.bezierCurveTo(
      handles[i].outX, handles[i].outY,
      handles[j].inX, handles[j].inY,
      pts[j].x, pts[j].y
    );
  }
  ctx.stroke();
}

export function drawDebugRects(ctx, pts, closePath) {
  const n = pts.length;
  const segs = closePath ? n : n - 1;
  for (let seg = 0; seg < segs; seg++) {
    const p0 = pts[seg];
    const p1 = pts[(seg + 1) % n];
    const rx = Math.min(p0.x, p1.x);
    const ry = Math.min(p0.y, p1.y);
    const rw = Math.abs(p1.x - p0.x);
    const rh = Math.abs(p1.y - p0.y);
    const alpha = Math.max(0.15, 0.6 - seg * 0.08);
    const colA = 'rgba(255, 87, 34, ' + alpha + ')';
    const colB = 'rgba(0, 188, 212, ' + alpha + ')';

    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);

    ctx.strokeStyle = colA;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.stroke();

    ctx.strokeStyle = colB;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + rh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + rh); ctx.stroke();

    ctx.setLineDash([]);

    ctx.font = '9px monospace';
    const label = n > 3 ? '' + seg : '';
    ctx.fillStyle = colA;
    ctx.textAlign = 'center';
    ctx.fillText('A' + label + ' (' + rw + 'px)', rx + rw / 2, ry - 4);
    ctx.save();
    ctx.fillStyle = colB;
    ctx.translate(rx - 6, ry + rh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('B' + label + ' (' + rh + 'px)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

export function drawExtremaGuides(ctx, pts, handleAngle) {
  const axisOffset = (pts[0] && pts[0].axisOffset) || 0;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 3]);
  for (let i = 0; i < pts.length; i++) {
    const isA = ((i + axisOffset) % 2 === 0);
    const theta = isA ? handleAngle : handleAngle + Math.PI / 2;
    const dx = Math.cos(theta) * 1000;
    const dy = Math.sin(theta) * 1000;
    ctx.strokeStyle = 'rgba(0, 200, 83, 0.2)';
    ctx.beginPath();
    ctx.moveTo(pts[i].x - dx, pts[i].y - dy);
    ctx.lineTo(pts[i].x + dx, pts[i].y + dy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export function drawHandles(ctx, pts, handles, closePath) {
  const n = pts.length;
  for (let i = 0; i < handles.length; i++) {
    const h = handles[i];
    const isA = h.isA !== undefined ? h.isA : true;
    const hasIn = i > 0 || closePath;
    const hasOut = i < n - 1 || closePath;

    ctx.strokeStyle = isA ? 'rgba(74, 158, 255, 0.5)' : 'rgba(255, 152, 0, 0.5)';
    ctx.lineWidth = 0.75;
    ctx.fillStyle = isA ? '#4a9eff' : '#ff9800';

    if (hasIn && hasOut) {
      ctx.beginPath(); ctx.moveTo(h.inX, h.inY); ctx.lineTo(h.outX, h.outY); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.inX, h.inY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(h.outX, h.outY, 3, 0, Math.PI * 2); ctx.fill();
    } else if (hasOut) {
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(h.outX, h.outY); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.outX, h.outY, 3, 0, Math.PI * 2); ctx.fill();
    } else if (hasIn) {
      ctx.beginPath(); ctx.moveTo(h.inX, h.inY); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.inX, h.inY, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function drawAnchors(ctx, pts, handleAngle, showIndices, selected) {
  const axisOffset = (pts[0] && pts[0].axisOffset) || 0;
  const sel = selected || new Set();
  for (let i = 0; i < pts.length; i++) {
    const isA = ((i + axisOffset) % 2 === 0);
    const isSel = sel.has(i);
    ctx.fillStyle = isSel ? '#00c853' : (isA ? '#1565c0' : '#e65100');

    ctx.beginPath();
    if (isA) {
      ctx.arc(pts[i].x, pts[i].y, isSel ? 6 : 5, 0, Math.PI * 2);
    } else {
      const r = isSel ? 7 : 6;
      ctx.moveTo(pts[i].x, pts[i].y - r);
      ctx.lineTo(pts[i].x + r, pts[i].y);
      ctx.lineTo(pts[i].x, pts[i].y + r);
      ctx.lineTo(pts[i].x - r, pts[i].y);
      ctx.closePath();
    }
    ctx.fill();

    // Pinned ring (green)
    if (pts[i].pinned) {
      ctx.strokeStyle = '#00c853';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Selection ring
    if (isSel) {
      ctx.strokeStyle = '#00c853';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    // First point: double ring
    if (i === 0 && pts.length > 1) {
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Last point: square outline
    if (i === pts.length - 1 && pts.length > 1) {
      ctx.strokeStyle = '#ff5722';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pts[i].x - 9, pts[i].y - 9, 18, 18);
    }

    if (showIndices) {
      ctx.fillStyle = '#888';
      ctx.font = '9px monospace';
      ctx.fillText(i, pts[i].x + 10, pts[i].y - 6);
    }
  }
}
