/* ==========================================================================
   pdfmerge.js — reading pages out of an existing PDF.

   The app writes its own PDFs (see pdf.js), but the service information
   sheets are files somebody uploaded. To put both in one document the pages
   of those files have to be copied across, which means actually reading them:
   finding every object, expanding the compressed object streams that any
   modern writer produces, walking the page tree, and re-emitting each page
   with its references renumbered.

   Stream data is never decoded — it is copied byte for byte with its filters
   intact, so whatever the original writer produced is what the customer sees.
   Only object streams are inflated, because their contents have to be read.

   Anything it cannot read returns null, and the caller falls back rather than
   producing a broken file. Encrypted PDFs are refused outright.
   ========================================================================== */
(function (w) {
  'use strict';

  /* =================================================================
     DEFLATE — enough of RFC 1951 to read an object stream.
     ================================================================= */

  function Bits(buf, pos) {
    this.b = buf; this.p = pos || 0; this.bit = 0; this.cur = 0;
  }
  Bits.prototype.get = function (n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.bit === 0) { this.cur = this.b[this.p++]; this.bit = 8; }
      v |= ((this.cur & 1) << i);
      this.cur >>= 1; this.bit--;
    }
    return v;
  };
  Bits.prototype.align = function () { this.bit = 0; };

  /** Canonical Huffman table from a list of code lengths. */
  function huff(lengths) {
    const max = Math.max.apply(null, lengths);
    const count = new Array(max + 1).fill(0);
    lengths.forEach(l => { if (l) count[l]++; });
    const next = new Array(max + 2).fill(0);
    let code = 0;
    for (let i = 1; i <= max; i++) { code = (code + count[i - 1]) << 1; next[i] = code; }
    const map = {};
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i];
      if (l) map[l + ':' + (next[l]++)] = i;
    }
    return { map: map, max: max };
  }

  function decodeSym(bits, table) {
    let code = 0;
    for (let len = 1; len <= table.max; len++) {
      code = (code << 1) | bits.get(1);
      const v = table.map[len + ':' + code];
      if (v !== undefined) return v;
    }
    return -1;
  }

  const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  let FIXED_LIT = null, FIXED_DIST = null;
  function fixedTables() {
    if (FIXED_LIT) return;
    const l = [];
    for (let i = 0; i < 144; i++) l.push(8);
    for (let i = 144; i < 256; i++) l.push(9);
    for (let i = 256; i < 280; i++) l.push(7);
    for (let i = 280; i < 288; i++) l.push(8);
    FIXED_LIT = huff(l);
    FIXED_DIST = huff(new Array(30).fill(5));
  }

  /** Raw DEFLATE. `zlib` skips the two-byte header a PDF FlateDecode carries. */
  function inflate(bytes, zlib) {
    try {
      const bits = new Bits(bytes, zlib ? 2 : 0);
      const out = [];
      let last = false;
      while (!last) {
        last = !!bits.get(1);
        const type = bits.get(2);

        if (type === 0) {
          bits.align();
          const len = bytes[bits.p] | (bytes[bits.p + 1] << 8);
          bits.p += 4;
          for (let i = 0; i < len; i++) out.push(bytes[bits.p++]);
          continue;
        }

        let lit, dist;
        if (type === 1) { fixedTables(); lit = FIXED_LIT; dist = FIXED_DIST; }
        else if (type === 2) {
          const hlit = bits.get(5) + 257;
          const hdist = bits.get(5) + 1;
          const hclen = bits.get(4) + 4;
          const clLens = new Array(19).fill(0);
          for (let i = 0; i < hclen; i++) clLens[CL_ORDER[i]] = bits.get(3);
          const clTable = huff(clLens);

          const lens = [];
          while (lens.length < hlit + hdist) {
            const sym = decodeSym(bits, clTable);
            if (sym < 0) return null;
            if (sym < 16) lens.push(sym);
            else if (sym === 16) {
              const prev = lens[lens.length - 1];
              let n = 3 + bits.get(2);
              while (n--) lens.push(prev);
            } else if (sym === 17) { let n = 3 + bits.get(3); while (n--) lens.push(0); }
            else { let n = 11 + bits.get(7); while (n--) lens.push(0); }
          }
          lit = huff(lens.slice(0, hlit));
          dist = huff(lens.slice(hlit));
        } else return null;

        for (;;) {
          const sym = decodeSym(bits, lit);
          if (sym < 0) return null;
          if (sym === 256) break;
          if (sym < 256) { out.push(sym); continue; }
          const li = sym - 257;
          if (li >= LEN_BASE.length) return null;
          const length = LEN_BASE[li] + bits.get(LEN_EXTRA[li]);
          const ds = decodeSym(bits, dist);
          if (ds < 0 || ds >= DIST_BASE.length) return null;
          const back = DIST_BASE[ds] + bits.get(DIST_EXTRA[ds]);
          let from = out.length - back;
          if (from < 0) return null;
          for (let i = 0; i < length; i++) out.push(out[from++]);
        }
      }
      return new Uint8Array(out);
    } catch (e) { return null; }
  }

  /* =================================================================
     Reading PDF syntax.
     ================================================================= */

  const WS = ' \t\r\n\f\0';
  const DELIM = '()<>[]{}/%';
  const isWs = c => WS.indexOf(c) >= 0;
  const isDelim = c => DELIM.indexOf(c) >= 0;

  function Ref(num, gen) { this.num = num; this.gen = gen; }
  function Name(n) { this.name = n; }
  function PStr(raw, hex) { this.raw = raw; this.hex = hex; }

  /**
   * Parse one object out of `s` starting at `i`.
   * Returns { v, i } — the value, and where reading stopped.
   */
  function parse(s, i) {
    i = skip(s, i);
    const c = s[i];

    if (c === '/') {
      let j = i + 1;
      while (j < s.length && !isWs(s[j]) && !isDelim(s[j])) j++;
      return { v: new Name(s.slice(i + 1, j)), i: j };
    }

    if (c === '(') {
      let j = i + 1, depth = 1, out = '';
      while (j < s.length && depth) {
        const ch = s[j];
        if (ch === '\\') { out += ch + (s[j + 1] || ''); j += 2; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (!depth) { j++; break; } }
        out += ch; j++;
      }
      return { v: new PStr(out, false), i: j };
    }

    if (c === '<' && s[i + 1] === '<') {
      const dict = {};
      let j = i + 2;
      for (;;) {
        j = skip(s, j);
        if (s[j] === '>' && s[j + 1] === '>') { j += 2; break; }
        if (j >= s.length) break;
        if (s[j] !== '/') { j++; continue; }
        const k = parse(s, j);
        if (!(k.v instanceof Name)) { j = k.i; continue; }
        const v = parse(s, k.i);
        dict[k.v.name] = v.v;
        j = v.i;
      }
      return { v: dict, i: j };
    }

    if (c === '<') {
      const end = s.indexOf('>', i);
      return { v: new PStr(s.slice(i + 1, end < 0 ? s.length : end), true), i: (end < 0 ? s.length : end + 1) };
    }

    if (c === '[') {
      const arr = [];
      let j = i + 1;
      for (;;) {
        j = skip(s, j);
        if (s[j] === ']') { j++; break; }
        if (j >= s.length) break;
        const v = parse(s, j);
        if (v.i === j) { j++; continue; }
        arr.push(v.v); j = v.i;
      }
      return { v: arr, i: j };
    }

    // number, possibly the start of "N G R"
    if (c === '+' || c === '-' || c === '.' || (c >= '0' && c <= '9')) {
      let j = i;
      while (j < s.length && !isWs(s[j]) && !isDelim(s[j])) j++;
      const tok = s.slice(i, j);
      const n = parseFloat(tok);
      if (/^\d+$/.test(tok)) {
        const m = /^\s*(\d+)\s+R(?![a-zA-Z])/.exec(s.slice(j, j + 24));
        if (m) return { v: new Ref(parseInt(tok, 10), parseInt(m[1], 10)), i: j + m[0].length };
      }
      return { v: isNaN(n) ? 0 : n, i: j };
    }

    if (s.startsWith('true', i)) return { v: true, i: i + 4 };
    if (s.startsWith('false', i)) return { v: false, i: i + 5 };
    if (s.startsWith('null', i)) return { v: null, i: i + 4 };

    return { v: null, i: i + 1 };
  }

  /** Move past whitespace and comments. */
  function skip(s, i) {
    for (;;) {
      while (i < s.length && isWs(s[i])) i++;
      if (s[i] === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      return i;
    }
  }

  /* =================================================================
     The document.
     ================================================================= */

  /**
   * Index every object in the file. Top-level ones are found by scanning for
   * "N G obj", which works whether the file uses a classic xref table or an
   * xref stream; the ones packed inside object streams are then unpacked from
   * whatever that scan found.
   */
  function read(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }

    if (/\/Encrypt[\s\d</]/.test(s)) return null;   // not ours to open

    const objs = {};                                 // num -> { v, stream }
    const re = /(?:^|[\s>\]])(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(s))) {
      const num = parseInt(m[1], 10);
      const start = m.index + m[0].length;
      const p = parse(s, start);
      let stream = null;
      const after = skip(s, p.i);
      if (s.startsWith('stream', after)) {
        let ds = after + 6;
        if (s[ds] === '\r') ds++;
        if (s[ds] === '\n') ds++;
        let len = p.v && typeof p.v.Length === 'number' ? p.v.Length : -1;
        // An indirect /Length is common; the endstream marker is the truth.
        let end = len >= 0 ? ds + len : -1;
        if (end < 0 || !/^\s*endstream/.test(s.slice(end, end + 12))) {
          end = s.indexOf('endstream', ds);
          if (end < 0) end = s.length;
          while (end > ds && (s[end - 1] === '\n' || s[end - 1] === '\r')) end--;
        }
        stream = { from: ds, to: end };
      }
      objs[num] = { v: p.v, stream: stream };
    }

    const raw = ref => (ref instanceof Ref) ? (objs[ref.num] || {}).v : ref;
    const streamBytes = o => o.stream ? u8.subarray(o.stream.from, o.stream.to) : null;

    /* ------------------------------------------- unpack object streams */
    Object.keys(objs).forEach(function (k) {
      const o = objs[k];
      const d = o.v;
      if (!d || !d.Type || d.Type.name !== 'ObjStm' || !o.stream) return;
      const filt = d.Filter && (d.Filter.name || (d.Filter[0] && d.Filter[0].name));
      const bytes = streamBytes(o);
      const flat = filt === 'FlateDecode' ? inflate(bytes, true) : bytes;
      if (!flat) return;
      let txt = '';
      for (let i = 0; i < flat.length; i += CH) txt += String.fromCharCode.apply(null, flat.subarray(i, i + CH));

      const n = typeof d.N === 'number' ? d.N : 0;
      const first = typeof d.First === 'number' ? d.First : 0;
      const head = txt.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < n; i++) {
        const num = head[i * 2], off = head[i * 2 + 1];
        if (num === undefined || off === undefined) break;
        if (objs[num] && objs[num].v !== undefined && objs[num].fromStm !== true) {
          // A top-level object of the same number wins; it is the newer one.
          if (objs[num].v !== null) continue;
        }
        const p = parse(txt, first + off);
        objs[num] = { v: p.v, stream: null, fromStm: true };
      }
    });

    /* ------------------------------------------------- find the catalog */
    let root = null;
    const tm = /\/Root\s+(\d+)\s+(\d+)\s+R/g;
    let t;
    while ((t = tm.exec(s))) root = parseInt(t[1], 10);
    if (root == null || !objs[root]) {
      root = null;
      Object.keys(objs).some(function (k) {
        const d = objs[k].v;
        if (d && d.Type && d.Type.name === 'Catalog') { root = Number(k); return true; }
        return false;
      });
    }
    if (root == null) return null;

    /* ------------------------------------------------- walk the page tree */
    const INHERIT = ['Resources', 'MediaBox', 'CropBox', 'Rotate'];
    const pages = [];
    const seen = {};

    (function walk(node, inherited, depth) {
      if (!node || depth > 64) return;
      const d = raw(node);
      if (!d || typeof d !== 'object' || d instanceof Ref) return;

      const own = {};
      INHERIT.forEach(k => { own[k] = d[k] !== undefined ? d[k] : inherited[k]; });

      const type = d.Type && d.Type.name;
      if (type === 'Page' || (!d.Kids && d.Contents !== undefined)) {
        const key = node instanceof Ref ? node.num : null;
        if (key != null && seen[key]) return;
        if (key != null) seen[key] = 1;
        pages.push({ num: key, dict: d, inherited: own });
        return;
      }
      const kids = raw(d.Kids);
      if (Array.isArray(kids)) kids.forEach(k => walk(k, own, depth + 1));
    })((raw(new Ref(root, 0)) || {}).Pages, {}, 0);

    if (!pages.length) return null;
    return { objs: objs, pages: pages, str: s, bytes: u8, streamBytes: streamBytes };
  }

  /* =================================================================
     Re-emitting.
     ================================================================= */

  function serialise(v, mapRef) {
    if (v === null || v === undefined) return 'null';
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (typeof v === 'number') return (Math.round(v * 1000) / 1000).toString();
    if (v instanceof Ref) { const n = mapRef(v.num); return n ? n + ' 0 R' : 'null'; }
    if (v instanceof Name) return '/' + v.name;
    if (v instanceof PStr) return v.hex ? '<' + v.raw + '>' : '(' + v.raw + ')';
    if (Array.isArray(v)) return '[' + v.map(x => serialise(x, mapRef)).join(' ') + ']';
    if (typeof v === 'object') {
      let out = '<<';
      Object.keys(v).forEach(k => { out += ' /' + k + ' ' + serialise(v[k], mapRef); });
      return out + ' >>';
    }
    return 'null';
  }

  /**
   * Copy every page of `u8` into a document being written.
   *
   *   first     the object number the copied objects may start at
   *   parentRef the page-tree object they should hang off
   *
   * Returns { objs, pageNums, next } where `objs` are latin-1 chunks ready to
   * be written in order, or null when the file could not be read.
   */
  function importPages(u8, first, parentRef) {
    let doc;
    try { doc = read(u8); } catch (e) { return null; }
    if (!doc) return null;

    // Which source objects are needed: every page, plus everything they point
    // at, following references but never climbing back up through /Parent.
    const need = [];
    const idx = {};
    const want = function (num, depth) {
      if (num == null || idx[num] || depth > 96) return;
      const o = doc.objs[num];
      if (!o) return;
      idx[num] = true;
      need.push(num);
      (function scan(v, d) {
        if (!v || d > 96) return;
        if (v instanceof Ref) { want(v.num, depth + 1); return; }
        if (Array.isArray(v)) { v.forEach(x => scan(x, d + 1)); return; }
        if (v instanceof Name || v instanceof PStr) return;
        if (typeof v === 'object') {
          Object.keys(v).forEach(k => { if (k !== 'Parent') scan(v[k], d + 1); });
        }
      })(o.v, 0);
    };

    doc.pages.forEach(p => { if (p.num != null) want(p.num, 0); });
    // A page held inside an object stream has no number of its own to chase;
    // its references still have to come across.
    doc.pages.forEach(function (p) {
      if (p.num != null) return;
      Object.keys(p.dict).forEach(function (k) {
        if (k === 'Parent') return;
        (function scan(v, d) {
          if (!v || d > 96) return;
          if (v instanceof Ref) return want(v.num, 0);
          if (Array.isArray(v)) return v.forEach(x => scan(x, d + 1));
          if (v instanceof Name || v instanceof PStr) return;
          if (typeof v === 'object') Object.keys(v).forEach(kk => scan(v[kk], d + 1));
        })(p.dict[k], 0);
      });
    });

    // old number -> new number
    const map = {};
    let next = first;
    need.forEach(num => { map[num] = next++; });
    const pageless = doc.pages.filter(p => p.num == null);
    pageless.forEach(p => { p.newNum = next++; });

    const mapRef = num => map[num] || 0;
    const out = [];

    need.forEach(function (num) {
      const o = doc.objs[num];
      const isPage = doc.pages.some(p => p.num === num);
      let dict = o.v;

      if (isPage) {
        const page = doc.pages.filter(p => p.num === num)[0];
        dict = Object.assign({}, o.v);
        Object.keys(page.inherited).forEach(k => {
          if (dict[k] === undefined && page.inherited[k] !== undefined) dict[k] = page.inherited[k];
        });
        delete dict.Parent;
      }

      if (o.stream) {
        const bytes = doc.streamBytes(o);
        let raw = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          raw += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        const d = Object.assign({}, dict);
        delete d.Length;                      // copied verbatim, so it is known
        let body = serialise(d, mapRef);
        body = body.slice(0, body.length - 2) + ' /Length ' + raw.length + ' >>';
        out.push({ num: map[num], head: body, stream: raw, page: isPage, parent: isPage ? parentRef : 0 });
      } else {
        out.push({ num: map[num], head: serialise(dict, mapRef), page: isPage, parent: isPage ? parentRef : 0 });
      }
    });

    pageless.forEach(function (p) {
      const dict = Object.assign({}, p.dict);
      Object.keys(p.inherited).forEach(k => {
        if (dict[k] === undefined && p.inherited[k] !== undefined) dict[k] = p.inherited[k];
      });
      delete dict.Parent;
      out.push({ num: p.newNum, head: serialise(dict, mapRef), page: true, parent: parentRef });
    });

    const pageNums = doc.pages.map(p => p.num != null ? map[p.num] : p.newNum).filter(Boolean);
    if (!pageNums.length) return null;

    return { objs: out, pageNums: pageNums, next: next };
  }

  w.PDFMerge = { importPages: importPages, inflate: inflate, read: read };
})(window);
