/* A payment QR that is cropped wrong is a payment nobody can make, so the
   finder is tested against a poster built to look like Razorpay's: a blue
   ground, a white card, colour payment-app logos, dark text rows, and a
   dense black-and-white code in a known place.                             */
import { findCode } from './dist/index.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  — ' + d : '')); } };

/** Build a poster. `code` is [x, y, size] or null for none. */
function poster(w, h, code, { logos = true, text = true } = {}) {
  const d = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, r, g, b) => {
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  };
  // Razorpay blue ground
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, 24, 90, 219);
  // the white card
  for (let y = (h * 0.18) | 0; y < (h * 0.82) | 0; y++)
    for (let x = (w * 0.1) | 0; x < (w * 0.9) | 0; x++) put(x, y, 255, 255, 255);
  // colour logos across the top and bottom of the card — saturated, must be ignored
  if (logos) {
    for (let y = (h * 0.2) | 0; y < (h * 0.26) | 0; y++)
      for (let x = (w * 0.15) | 0; x < (w * 0.85) | 0; x++) put(x, y, 12, 140, 60);
    for (let y = (h * 0.74) | 0; y < (h * 0.8) | 0; y++)
      for (let x = (w * 0.15) | 0; x < (w * 0.85) | 0; x++) put(x, y, 200, 30, 90);
  }
  // dark text lines — thin, dark, must not be mistaken for the code
  if (text) {
    for (const ty of [0.29, 0.71, 0.88]) {
      for (let y = (h * ty) | 0; y < (h * ty + Math.max(2, h * 0.012)) | 0; y++)
        for (let x = (w * 0.2) | 0; x < (w * 0.8) | 0; x += 2) put(x, y, 20, 20, 20);
    }
  }
  // the code: a dense pseudo-random checker, ~45% dark
  if (code) {
    const [cx, cy, cs] = code;
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const mod = Math.max(1, (cs / 33) | 0);
    for (let y = cy; y < cy + cs; y += mod) {
      for (let x = cx; x < cx + cs; x += mod) {
        const dark = rnd() < 0.45;
        for (let yy = y; yy < Math.min(y + mod, cy + cs); yy++)
          for (let xx = x; xx < Math.min(x + mod, cx + cs); xx++)
            put(xx, yy, dark ? 0 : 255, dark ? 0 : 255, dark ? 0 : 255);
      }
    }
  }
  return { d, w, h };
}

/* --------------------------------------------- 1. Razorpay's actual shape */
{
  const w = 600, h = 900;
  const cs = 330, cx = ((w - cs) / 2) | 0, cy = 330;
  const p = poster(w, h, [cx, cy, cs]);
  const box = findCode(p.d, w, h);
  ok('the code is found at all', !!box);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  ok('and in the right place', box && near(box.x + box.w / 2, cx + cs / 2, 14)
    && near(box.y + box.h / 2, cy + cs / 2, 14),
    box && JSON.stringify(box));
  ok('cropping the code, not the poster', box && box.w < w * 0.75 && box.h < h * 0.55,
    box && box.w + '×' + box.h);
  ok('with a quiet zone around it', box && box.w > cs && box.w < cs * 1.3,
    box && box.w + ' vs code ' + cs);
}

/* ------------------------------------- 2. the layout moves — still found */
{
  const w = 700, h = 700;
  const cs = 300, cx = 60, cy = 360;          // shoved into a corner
  const box = findCode(poster(w, h, [cx, cy, cs]).d, w, h);
  const near = (a, b) => Math.abs(a - b) <= 16;
  ok('a redesigned poster still works', !!box
    && near(box.x + box.w / 2, cx + cs / 2) && near(box.y + box.h / 2, cy + cs / 2),
    box && JSON.stringify(box));
}

/* --------------------------- 3. no code at all — refuse, do not invent one */
{
  const box = findCode(poster(600, 900, null).d, 600, 900);
  ok('no code means no crop', box === null, JSON.stringify(box));
}

/* ---------------------- 4. text and logos alone never look like a code */
{
  const p = poster(600, 900, null, { logos: true, text: true });
  ok('logos and text are not mistaken for one', findCode(p.d, 600, 900) === null);
}

/* ------------------------------------------ 5. a blank image is refused */
{
  ok('an empty buffer is refused', findCode(new Uint8ClampedArray(4 * 100 * 100), 100, 100) === null);
  ok('zero dimensions are refused', findCode(new Uint8ClampedArray(0), 0, 0) === null);
}

/* --------------------- 6. a wide dark band is not square, so not a code */
{
  const w = 600, h = 900;
  const d = poster(w, h, null).d;
  for (let y = 400; y < 460; y++) for (let x = 60; x < 540; x++) {
    const i = (y * w + x) * 4; d[i] = d[i+1] = d[i+2] = 0; d[i+3] = 255;
  }
  ok('a dark stripe is rejected as not square', findCode(d, w, h) === null);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
