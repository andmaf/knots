export function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function computeHandles(pts, closePath, handlePct, angle) {
  const n = pts.length;
  if (n < 2) return [];

  const axisOffset = (pts[0] && pts[0].axisOffset) || 0;
  const handles = [];

  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const hasPrev = i > 0 || closePath;
    const hasNext = i < n - 1 || closePath;
    const prev = hasPrev ? pts[(i - 1 + n) % n] : null;
    const next = hasNext ? pts[(i + 1) % n] : null;
    const isA = ((i + axisOffset) % 2 === 0);

    const theta = isA ? angle : angle + Math.PI / 2;
    const ax = Math.cos(theta);
    const ay = Math.sin(theta);

    let s;
    if (prev && next) {
      const flow = (next.x - prev.x) * ax + (next.y - prev.y) * ay;
      s = flow >= 0 ? 1 : -1;
    } else if (next) {
      const flow = (next.x - curr.x) * ax + (next.y - curr.y) * ay;
      s = flow >= 0 ? 1 : -1;
    } else {
      const flow = (curr.x - prev.x) * ax + (curr.y - prev.y) * ay;
      s = flow >= 0 ? 1 : -1;
    }

    let inX, inY, outX, outY;

    if (prev) {
      const proj = Math.abs((curr.x - prev.x) * ax + (curr.y - prev.y) * ay);
      const len = proj * handlePct;
      inX = curr.x - s * ax * len;
      inY = curr.y - s * ay * len;
    } else { inX = curr.x; inY = curr.y; }

    if (next) {
      const proj = Math.abs((next.x - curr.x) * ax + (next.y - curr.y) * ay);
      const len = proj * handlePct;
      outX = curr.x + s * ax * len;
      outY = curr.y + s * ay * len;
    } else { outX = curr.x; outY = curr.y; }

    handles.push({ inX, inY, outX, outY, isA, theta });
  }

  return handles;
}
