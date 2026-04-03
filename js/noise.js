// 1D Perlin noise with seeded permutation table

let perm = [];
let grad = [];

export function initNoise() {
  perm = [];
  grad = [];
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    grad[i] = Math.random() * 2 - 1;
  }
  // Fisher-Yates shuffle
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  // Extend to 512 for easy wrapping
  for (let i = 0; i < 256; i++) {
    perm[256 + i] = perm[i];
    grad[256 + i] = grad[i];
  }
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

// Returns value in -1..1
export function perlin1D(x) {
  const xi = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u = fade(xf);
  const g0 = grad[perm[xi]];
  const g1 = grad[perm[xi + 1]];
  return lerp(g0 * xf, g1 * (xf - 1), u);
}
