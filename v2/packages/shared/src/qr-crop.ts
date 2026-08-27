/* ============================================================================
   Finding the QR inside a poster.

   Razorpay returns a whole branded page — header, UPI marks, a payment-app
   strip, the company name — and the scannable code is about a third of it.
   The screen wants the code alone.

   Done by looking, not by hard-coded coordinates. A crop pinned to today's
   layout breaks silently the day the poster is redesigned, and a payment QR
   that is silently wrong is a QR nobody can pay.

   What makes a QR findable: it is the only part of such an image that is
   dense, black, colourless, SQUARE, and tall. Text is dense too — a line of
   heavy type can beat a QR row for darkness — but it is only a few rows tall.
   Logos are saturated. So the test is not "which band is darkest" but "which
   band stays dark for the longest", and then the search narrows:

     1. score every row across the full width, and take the longest run of
        rows that hold up. Text lines lose here on height alone.
     2. score columns WITHIN those rows only. Now the margins score zero and
        the code's left and right edges fall out exactly.
     3. score rows again within those columns, to tighten the top and bottom.

   The first version of this thresholded against the whole image height, so a
   code occupying a third of the poster could never reach the bar and was
   never found. The test below caught it before it shipped, which is the
   entire reason the arithmetic lives here instead of inside a component.
   ========================================================================== */

export interface CodeBox {
  x: number; y: number; w: number; h: number;
}

/** Dark and colourless — a QR module, not a logo and not the blue ground. */
function isModule(d: Uint8ClampedArray | number[], i: number): boolean {
  const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
  if (a < 128) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max < 110 && max - min < 40;
}

/**
 * The longest run of values that hold up against the strongest value seen.
 *
 * Relative, not absolute, because the only thing known in advance is that the
 * code is the most SUSTAINED dark thing in the picture — not the darkest. A
 * line of heavy type easily out-scores a QR row; it just cannot keep it up.
 *
 * The bar sits low on purpose. A QR's rows vary enormously — a random module
 * pattern gives one row twice the dark pixels of the next — so a bar set at
 * half the peak cuts the code into fragments and the band is lost. That was
 * the first bug the test found here. Low enough to keep the code in one
 * piece, and height decides the rest.
 */
function longestRun(arr: Float32Array): readonly [number, number] {
  let peak = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > peak) peak = arr[i];
  if (peak <= 0) return [-1, -1] as const;
  const need = Math.max(6, peak * 0.3);

  let bestA = -1, bestB = -1, a = -1;
  for (let i = 0; i < arr.length; i++) {
    const on = arr[i] >= need;
    if (on && a < 0) a = i;
    if ((!on || i === arr.length - 1) && a >= 0) {
      const b = on ? i : i - 1;
      if (b - a > bestB - bestA) { bestA = a; bestB = b; }
      a = -1;
    }
  }
  return [bestA, bestB] as const;
}

/** Dark pixels per column, counting only rows y0..y1. */
function columnScores(
  d: Uint8ClampedArray | number[], w: number, y0: number, y1: number,
): Float32Array {
  const cols = new Float32Array(w);
  for (let y = y0; y <= y1; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) if (isModule(d, (base + x) * 4)) cols[x] += 1;
  }
  return cols;
}

/** Dark pixels per row, counting only columns x0..x1. */
function rowScores(
  d: Uint8ClampedArray | number[], w: number, h: number, x0: number, x1: number,
): Float32Array {
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = x0; x <= x1; x++) if (isModule(d, (base + x) * 4)) rows[y] += 1;
  }
  return rows;
}

/**
 * Where the code sits, or null when nothing convincing is there.
 *
 * Returning null matters as much as returning a box: the caller shows the
 * original poster instead, and a big ugly QR beats a confidently wrong crop.
 */
export function findCode(
  data: Uint8ClampedArray | number[],
  w: number,
  h: number,
  /** Fraction of the code's size to leave around it — the quiet zone. */
  padding = 0.06,
): CodeBox | null {
  if (!w || !h || data.length < w * h * 4) return null;

  // 1. the tallest sustained dark band — text lines lose on height
  const [ry0, ry1] = longestRun(rowScores(data, w, h, 0, w - 1));
  if (ry0 < 0 || ry1 <= ry0) return null;

  // 2. its left and right edges, judged only within those rows
  const [x0, x1] = longestRun(columnScores(data, w, ry0, ry1));
  if (x0 < 0 || x1 <= x0) return null;

  // 3. tighten top and bottom now that the columns are known
  const [y0, y1] = longestRun(rowScores(data, w, h, x0, x1));
  if (y0 < 0 || y1 <= y0) return null;

  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return null;

  // A code is square, and a real share of the image. Anything else is a
  // misread, and a misread must not be cropped to.
  if (Math.abs(cw - ch) / Math.max(cw, ch) > 0.25) return null;
  if (cw < w * 0.15 || ch < h * 0.08) return null;

  const pad = Math.round(Math.max(cw, ch) * padding);
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return {
    x, y,
    w: Math.min(w - x, cw + pad * 2),
    h: Math.min(h - y, ch + pad * 2),
  };
}
