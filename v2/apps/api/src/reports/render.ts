/* ============================================================================
   A report on paper, in a spreadsheet, and as plain rows.

   Three writers over the one ReportResult. The PDF is the document the office
   files or sends: company block, the report's name and range, the headline
   figures, the table with its heading repeated on every page, the totals row,
   the note, and "page x of y" with who ran it. The spreadsheet keeps the
   numbers as numbers (rupees formatted the Indian way, dates as dates) so a
   pivot works on it; the CSV is the same rows for anything else.
   ========================================================================== */
import * as ExcelJS from 'exceljs';
import pdfmake = require('pdfmake');
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { money } from 'shared';
import type { Col, ReportResult, Row } from './report.types';
import { fmtCell } from './reports.service';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROBOTO = require('pdfmake/fonts/Roboto.js') as Parameters<typeof pdfmake.setFonts>[0];
pdfmake.setFonts(ROBOTO);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** "1 Sep 2026 – 25 Sep 2026" or "As of 25 Sep 2026". */
export function rangeText(r: ReportResult): string {
  return r.range.kind === 'asOf' ? 'As of ' + nice(r.range.to) : nice(r.range.from) + ' – ' + nice(r.range.to);
}

function stamp(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours(); const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${hh % 12 || 12}:${mm} ${hh < 12 ? 'am' : 'pm'}`;
}

const NUMERIC = new Set(['money', 'int', 'num', 'pct', 'days']);

/** A safe file name: the title and the range, nothing the OS objects to. */
export function fileName(r: ReportResult, ext: string): string {
  const base = (r.title + ' ' + (r.range.kind === 'asOf' ? 'as of ' + r.range.to : r.range.from + ' to ' + r.range.to))
    .replace(/[\\/:*?"<>|·]+/g, '-').replace(/\s+/g, ' ').trim();
  return base + '.' + ext;
}

/* ------------------------------------------------------------------- PDF */

export async function toPdf(r: ReportResult, co: { name: string; gstin: string; addr: string; phone: string }, landscape: boolean): Promise<Buffer> {
  const cols = r.columns;
  const head: TableCell[] = cols.map((c) => ({
    text: c.label, bold: true, fontSize: 8, color: '#4b5563', fillColor: '#f3f4f6',
    alignment: NUMERIC.has(c.type) ? 'right' : 'left', margin: [0, 3, 0, 3],
  }));
  const cell = (row: Row, c: Col, bold = false, fill?: string): TableCell => ({
    text: fmtCell(row[c.key], c.type), fontSize: 8.5, bold,
    alignment: NUMERIC.has(c.type) ? 'right' : 'left', noWrap: !!c.tight && !bold, margin: [0, 2, 0, 2],
    ...(fill ? { fillColor: fill } : {}),
  });
  const body: TableCell[][] = [head, ...r.rows.map((row) => cols.map((c) => cell(row, c)))];
  if (r.totals) body.push(cols.map((c) => cell(r.totals as Row, c, true, '#fafafa')));
  if (r.rows.length === 0) body.push([{ text: 'Nothing in this range.', colSpan: cols.length, italics: true, color: '#6b7280', fontSize: 9, margin: [0, 6, 0, 6] }, ...cols.slice(1).map(() => ({}))]);

  // pdfmake widths are a number, 'auto' or '*': free text columns share the
  // page, everything numeric or tight takes what it needs.
  let widths = cols.map((c) => (c.type === 'text' && !c.tight ? '*' : 'auto'));
  // A table of nothing but figures (the GST summary) would huddle at the left
  // of the page: share the width out evenly instead.
  if (!widths.includes('*')) widths = cols.map(() => '*');

  const stats: Content = {
    columns: r.stats.map((s) => ({
      stack: [
        { text: s.label, fontSize: 7.5, color: '#6b7280' },
        { text: fmtCell(s.value, s.type) || '0', fontSize: 12, bold: true, margin: [0, 1, 0, 0] },
        ...(r.prev ? [{ text: 'was ' + (fmtCell(r.prev.find((p) => p.label === s.label)?.value, s.type) || '0'), fontSize: 7.5, color: '#9ca3af' }] : []),
      ],
      margin: [0, 0, 8, 0] as [number, number, number, number],
    })),
    margin: [0, 10, 0, 12],
  };

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: landscape ? 'landscape' : 'portrait',
    pageMargins: [28, 34, 28, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#111827' },
    info: { title: r.title, author: co.name, creator: 'Easy Pest Control' },
    header: (page) => (page > 1 ? {
      columns: [
        { text: co.name, fontSize: 8, color: '#6b7280' },
        { text: r.title + ' · ' + rangeText(r), fontSize: 8, color: '#6b7280', alignment: 'right' },
      ],
      margin: [28, 12, 28, 0],
    } : ''),
    footer: (page, pages) => ({
      columns: [
        { text: 'Run by ' + r.generatedBy + ' on ' + stamp(r.generatedAt), fontSize: 7.5, color: '#9ca3af' },
        { text: 'Page ' + page + ' of ' + pages, fontSize: 7.5, color: '#9ca3af', alignment: 'right' },
      ],
      margin: [28, 14, 28, 0],
    }),
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: co.name, fontSize: 14, bold: true },
              ...(co.gstin ? [{ text: 'GSTIN ' + co.gstin, fontSize: 8.5, color: '#4b5563', margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
              ...(co.addr ? [{ text: co.addr, fontSize: 8.5, color: '#4b5563' }] : []),
              ...(co.phone ? [{ text: co.phone, fontSize: 8.5, color: '#4b5563' }] : []),
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: r.title, fontSize: 15, bold: true, alignment: 'right' },
              { text: rangeText(r), fontSize: 9.5, alignment: 'right', margin: [0, 3, 0, 0] },
              { text: r.branchName, fontSize: 8.5, color: '#4b5563', alignment: 'right' },
              ...r.filterText.map((t) => ({ text: t, fontSize: 8.5, color: '#4b5563', alignment: 'right' as const })),
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: landscape ? 785 : 539, y2: 0, lineWidth: 1, lineColor: '#111827' }], margin: [0, 8, 0, 0] },
      stats,
      {
        table: { headerRows: 1, widths, body, dontBreakRows: true },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
          vLineWidth: () => 0,
          hLineColor: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? '#9ca3af' : '#e5e7eb'),
          paddingLeft: () => 5, paddingRight: () => 5,
        },
      },
      ...(r.note ? [{ text: r.note, fontSize: 8, italics: true, color: '#6b7280', margin: [0, 10, 0, 0] as [number, number, number, number] }] : []),
      ...(r.description ? [{ text: r.description, fontSize: 8, color: '#9ca3af', margin: [0, 4, 0, 0] as [number, number, number, number] }] : []),
    ],
  };
  const pdf = pdfmake.createPdf(doc);
  return pdf.getBuffer();
}

/* ------------------------------------------------------------------ XLSX */

/** Rupees in Indian grouping, with the sign: ₹12,34,567. */
const RUPEE_FMT = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"#,##0';

function excelDate(iso: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : iso;
}

export async function toXlsx(r: ReportResult, co: { name: string; gstin: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Easy Pest Control';
  const ws = wb.addWorksheet(r.title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Report');
  const cols = r.columns;

  ws.addRow([co.name]).font = { bold: true, size: 13 };
  if (co.gstin) ws.addRow(['GSTIN ' + co.gstin]);
  ws.addRow([r.title]).font = { bold: true, size: 12 };
  ws.addRow([rangeText(r) + ' · ' + r.branchName + (r.filterText.length ? ' · ' + r.filterText.join(' · ') : '')]);
  ws.addRow(r.stats.map((s) => s.label + ': ' + (fmtCell(s.value, s.type) || '0')).join('   ')).font = { color: { argb: 'FF4B5563' } };
  ws.addRow([]);

  const headRow = ws.addRow(cols.map((c) => c.label));
  headRow.font = { bold: true };
  headRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  headRow.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
  const headIdx = headRow.number;

  const value = (row: Row, c: Col) => {
    const v = row[c.key];
    if (v === undefined || v === null || v === '') return null;
    if (c.type === 'date') return excelDate(String(v));
    if (c.type === 'days') return typeof v === 'number' && v <= 0 ? null : v;
    return v;
  };
  for (const row of r.rows) ws.addRow(cols.map((c) => value(row, c)));
  if (r.totals) {
    const t = ws.addRow(cols.map((c) => value(r.totals as Row, c)));
    t.font = { bold: true };
    t.border = { top: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
  }

  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.type === 'text' ? (c.tight ? 14 : Math.max(18, Math.min(48, (c.w || 1) * 22))) : c.type === 'date' ? 13 : 15;
    if (c.type === 'money') col.numFmt = RUPEE_FMT;
    else if (c.type === 'date') col.numFmt = 'dd-mmm-yyyy';
    else if (c.type === 'pct') col.numFmt = '0"%"';
    else if (c.type === 'num') col.numFmt = '0.#';
    if (NUMERIC.has(c.type)) col.alignment = { horizontal: 'right' };
    // The title rows above the table are text: keep them out of the column format.
    for (let rr = 1; rr < headIdx; rr++) ws.getCell(rr, i + 1).numFmt = '@';
  });
  ws.views = [{ state: 'frozen', ySplit: headIdx }];
  ws.autoFilter = { from: { row: headIdx, column: 1 }, to: { row: headIdx, column: cols.length } };
  if (r.note) ws.addRow([]), (ws.addRow([r.note]).font = { italic: true, color: { argb: 'FF6B7280' } });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/* ------------------------------------------------------------------- CSV */

export function toCsv(r: ReportResult): Buffer {
  const q = (v: string | number | undefined) => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines: string[] = [];
  lines.push(r.columns.map((c) => q(c.label)).join(','));
  const raw = (row: Row, c: Col) => {
    const v = row[c.key];
    if (c.type === 'days' && typeof v === 'number' && v <= 0) return '';
    return v;
  };
  for (const row of r.rows) lines.push(r.columns.map((c) => q(raw(row, c))).join(','));
  if (r.totals) lines.push(r.columns.map((c) => q(raw(r.totals as Row, c))).join(','));
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}

/** For a one-line summary in logs or a share message. */
export function statsLine(r: ReportResult): string {
  return r.stats.map((s) => s.label + ' ' + (s.type === 'money' ? money(s.value) : fmtCell(s.value, s.type))).join(' · ');
}
