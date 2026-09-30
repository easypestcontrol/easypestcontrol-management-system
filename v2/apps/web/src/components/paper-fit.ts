'use client';

/* ============================================================================
   A document is a sheet of paper, at every size.

   The contract, the service report and the invoice are each laid out once, as
   an 820px sheet - the shape they print in. On a phone that sheet is not
   rearranged into a stack of cards (which is a web page, not the document):
   it is zoomed down to whatever the screen can give it, the way a PDF opens
   zoomed out. Smaller is fine; rearranged is not - the customer and the
   office have to be looking at the same document.

   `zoom` rather than `transform: scale`, because zoom reflows the height of
   whatever surrounds the sheet and a transform does not. The print rules in
   globals.css (`.paper`) undo it, so the saved PDF is full size.
   ========================================================================== */

import { useEffect, useState } from 'react';

/** The sheet's natural width, in px. */
export const PAPER_W = 820;

/**
 * The inline style that fits the sheet to the screen.
 *
 * `gutterRem` is the room the page keeps either side of the sheet, both sides
 * together, in rem - the page pads with `px-4` (1rem a side), and the root
 * font size is smaller on a phone, so a gutter counted in px would leave the
 * sheet a hair narrower than the cards above it.
 */
export function usePaperFit(gutterRem = 2): { zoom?: number } {
  const [fit, setFit] = useState<{ zoom?: number }>({});
  useEffect(() => {
    const size = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const room = document.documentElement.clientWidth - gutterRem * rem;
      setFit(room < PAPER_W ? { zoom: Math.max(0.34, room / PAPER_W) } : {});
    };
    size();
    window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
  }, [gutterRem]);
  return fit;
}
