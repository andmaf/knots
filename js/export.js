import { PAGE_W, PAGE_H } from './config.js';
import { computeHandles } from './geometry.js';

export function exportSVG(paths, closePath, handlePct, weight, color) {
  const svgPaths = [];

  for (const path of paths) {
    const pts = path.points;
    if (pts.length < 2) continue;

    const handles = computeHandles(pts, closePath, handlePct, 0);
    const n = pts.length;
    const segs = closePath ? n : n - 1;

    let d = 'M ' + pts[0].x.toFixed(2) + ' ' + pts[0].y.toFixed(2);

    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      d += ' C ' +
        handles[i].outX.toFixed(2) + ' ' + handles[i].outY.toFixed(2) + ', ' +
        handles[j].inX.toFixed(2) + ' ' + handles[j].inY.toFixed(2) + ', ' +
        pts[j].x.toFixed(2) + ' ' + pts[j].y.toFixed(2);
    }

    if (closePath) d += ' Z';

    svgPaths.push(
      '  <path d="' + d + '" fill="none" stroke="' + color + '" ' +
      'stroke-width="' + weight.toFixed(2) + '" stroke-linecap="butt" stroke-linejoin="bevel"/>'
    );
  }

  const svg =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="' + PAGE_W + '" height="' + PAGE_H + '" ' +
    'viewBox="0 0 ' + PAGE_W + ' ' + PAGE_H + '">\n' +
    svgPaths.join('\n') + '\n' +
    '</svg>';

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bezier-paths.svg';
  a.click();
  URL.revokeObjectURL(url);
}
