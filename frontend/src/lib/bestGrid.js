// Pick the column count that makes n tiles of the given aspect ratio
// (width / height) as large as possible inside a w x h box.
export function bestColumns(n, w, h, aspect = 0.8) {
  if (n <= 1 || w <= 0 || h <= 0) return 1;
  let best = 1, bestSize = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = w / cols, cellH = h / rows;
    const tileW = Math.min(cellW, cellH * aspect); // largest tile that fits the cell
    if (tileW > bestSize) { bestSize = tileW; best = cols; }
  }
  return best;
}
