/* ==========================================================================
   PestOps — PDF: a minimal writer for the documents we hand to customers.

   Only what a quotation or invoice needs: A4 pages, the two base-14
   Helvetica faces, text, rules and filled boxes. That is a couple of hundred
   lines, against ~350 KB for a general-purpose library in an app that has no
   build step and ships every byte to the phone.

   Coordinates are given from the TOP-left in points (1pt = 1/72 inch) because
   that is how a page reads; the PDF's own bottom-left origin is hidden here.
   ========================================================================== */
(function (w) {
  'use strict';

  const A4 = { w: 595.28, h: 841.89 };

  /* Adobe AFM advance widths, per 1000 units of em, for ASCII 32–126. The
     base-14 fonts are not embedded, so the viewer supplies the glyphs — but
     we still need the metrics here to right-align money and centre headings. */
  const W_REG = [
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584
  ];
  const W_BOLD = [
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584
  ];

  /**
   * The base-14 fonts are WinAnsi, which has no rupee sign and none of the
   * typographic dashes and quotes the app uses. Fold them to something the
   * viewer can actually draw rather than emitting a blank box.
   */
  const FOLD = {
    '₹': 'Rs.', '—': '-', '–': '-', '‘': "'", '’': "'",
    '“': '"', '”': '"', '•': '-', '…': '...', ' ': ' ',
    '×': 'x', '→': '->', '·': '-'
  };

  function ascii(str) {
    let out = '';
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (FOLD[ch] != null) { out += FOLD[ch]; continue; }
      const code = ch.charCodeAt(0);
      out += (code >= 32 && code <= 126) ? ch : (code < 32 ? ' ' : '?');
    }
    return out;
  }

  /** Escape the three characters that mean something inside a PDF string. */
  function pdfStr(str) {
    return ascii(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function widthOf(str, size, bold) {
    const table = bold ? W_BOLD : W_REG;
    const s = ascii(str);
    let units = 0;
    for (let i = 0; i < s.length; i++) {
      const idx = s.charCodeAt(i) - 32;
      units += (idx >= 0 && idx < table.length) ? table[idx] : 500;
    }
    return units * size / 1000;
  }

  function num(n) {
    // PDF wants plain decimals — no exponent notation, no trailing noise.
    return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
  }

  function rgb(hex) {
    const h = String(hex || '#000').replace('#', '');
    const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(f, 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
      .map(x => num(x)).join(' ');
  }

  /* ==================================================================== doc */
  function doc() {
    // Uploaded PDFs whose pages go on the end, and a note of any that could
    // not be read so the caller can say so rather than silently dropping them.
    const attached = [];
    const failed = [];
    const pages = [];
    let ops = null;

    const api = {
      W: A4.w,
      H: A4.h,

      page() {
        ops = [];
        pages.push(ops);
        return api;
      },

      /** Width of `str` if it were drawn — for aligning and wrapping. */
      width(str, size, bold) { return widthOf(str, size || 10, !!bold); },

      /**
       * `x` is the left edge, or the right edge when align is 'right', or the
       * centre when align is 'center'. `y` is the text baseline from the top.
       */
      text(str, x, y, o) {
        const c = o || {};
        const size = c.size || 10;
        const bold = !!c.bold;
        const body = ascii(str);
        if (!body) return api;

        let left = x;
        if (c.align === 'right') left = x - widthOf(body, size, bold);
        else if (c.align === 'center') left = x - widthOf(body, size, bold) / 2;

        ops.push(rgb(c.color || '#111827') + ' rg');
        ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + num(size) + ' Tf ' +
          num(left) + ' ' + num(A4.h - y) + ' Td (' + pdfStr(body) + ') Tj ET');
        return api;
      },

      /** Draw `str` inside `maxW`, breaking on spaces. Returns the new y. */
      paragraph(str, x, y, maxW, o) {
        const c = o || {};
        const size = c.size || 10;
        const lead = c.leading || size * 1.45;
        const words = ascii(str).split(/\s+/).filter(Boolean);
        let line = '';
        let cy = y;
        words.forEach(word => {
          const next = line ? line + ' ' + word : word;
          if (widthOf(next, size, !!c.bold) > maxW && line) {
            api.text(line, x, cy, c);
            cy += lead;
            line = word;
          } else line = next;
        });
        if (line) { api.text(line, x, cy, c); cy += lead; }
        return cy;
      },

      line(x1, y1, x2, y2, o) {
        const c = o || {};
        ops.push(num(c.width || 0.7) + ' w ' + rgb(c.color || '#D9DEE7') + ' RG');
        ops.push(num(x1) + ' ' + num(A4.h - y1) + ' m ' +
                 num(x2) + ' ' + num(A4.h - y2) + ' l S');
        return api;
      },

      rect(x, y, wd, ht, color) {
        ops.push(rgb(color || '#F3F5F8') + ' rg');
        ops.push(num(x) + ' ' + num(A4.h - y - ht) + ' ' + num(wd) + ' ' + num(ht) + ' re f');
        return api;
      },

      /* ------------------------------------------------------ serialising */
      /**
       * Objects are laid out as: 1 catalog, 2 page tree, 3/4 the two fonts,
       * then a page object and a content stream per page. The xref table
       * needs a byte offset for each, so the file is assembled as Latin-1
       * chunks where one character is exactly one byte.
       */
      bytes() {
        if (!pages.length) api.page();
        const chunks = [];
        const offsets = [];
        let len = 0;
        const put = str => { chunks.push(str); len += str.length; };

        const objs = [
          '',
          '',
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
        ];
        pages.forEach((pageOps, i) => {
          objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(A4.w) + ' ' + num(A4.h) + ']' +
            ' /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (6 + i * 2) + ' 0 R >>');
          objs.push({ stream: pageOps.join('\n') });
        });

        // Pages copied out of uploaded files land after everything this
        // document writes for itself, and join the page tree in order.
        const ours = pages.map((_, i) => 5 + i * 2);
        const theirs = [];
        attached.forEach(function (u8) {
          const got = w.PDFMerge ? w.PDFMerge.importPages(u8, objs.length + 1, 2) : null;
          if (!got) { failed.push(1); return; }
          got.objs.sort((a, b) => a.num - b.num).forEach(function (o) {
            let head = o.head;
            if (o.page) head = head.slice(0, head.length - 2) + ' /Parent 2 0 R >>';
            objs.push(o.stream != null ? { head: head, stream: o.stream } : head);
          });
          got.pageNums.forEach(n => theirs.push(n));
        });

        const kidList = ours.concat(theirs);
        objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
        objs[1] = '<< /Type /Pages /Kids [' + kidList.map(n => n + ' 0 R').join(' ') +
          '] /Count ' + kidList.length + ' >>';

        put('%PDF-1.4\n');
        objs.forEach((o, i) => {
          offsets.push(len);
          const n = i + 1;
          if (typeof o === 'string') {
            put(n + ' 0 obj\n' + o + '\nendobj\n');
          } else if (o.head) {
            put(n + ' 0 obj\n' + o.head + '\nstream\n' + o.stream + '\nendstream\nendobj\n');
          } else {
            put(n + ' 0 obj\n<< /Length ' + o.stream.length + ' >>\nstream\n' +
                o.stream + '\nendstream\nendobj\n');
          }
        });

        const xref = len;
        put('xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n');
        offsets.forEach(off => {
          put(('0000000000' + off).slice(-10) + ' 00000 n \n');
        });
        put('trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

        const text = chunks.join('');
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xFF;
        return bytes;
      },

      /**
       * Put every page of an existing PDF at the end of this one. The file is
       * held until the document is written, so imported pages always land
       * after whatever this document has to say for itself.
       */
      attach(u8) { if (u8 && u8.length) attached.push(u8); return api; },

      /** How many attached files could not be read. Valid after writing. */
      unreadable() { return failed.length; },

      blob() { return new Blob([api.bytes()], { type: 'application/pdf' }); },

      file(name) {
        const blob = api.blob();
        // Older Safari has Blob but not the File constructor; the share sheet
        // accepts a Blob with a name patched on.
        try { return new File([blob], name, { type: 'application/pdf' }); }
        catch (e) { blob.name = name; return blob; }
      }
    };

    return api.page();
  }

  w.PDF = { doc: doc, A4: A4, width: widthOf };
})(window);
