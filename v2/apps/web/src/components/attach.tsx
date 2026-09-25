'use client';

/* ============================================================================
   Attachments, shared.

   Pick files (images, PDFs, documents), preview them in a full-screen sheet,
   and download them — the same in a plain browser and inside the Capacitor
   shell, where the Android WebView ignores <a download> and the native layer
   exposes AndroidDL.save (see mobile/.../MainActivity.java). Tasks grew its own
   copy first; this is that pattern lifted out so other screens can reuse it.
   ========================================================================== */

import { useState } from 'react';
import { Icon } from '@/components/icons';

/** A document on a record. New from a form it carries `data` (a data URL);
    back from the API it carries the `url` it is served at. */
export interface TFile { name: string; type: string; size: number; url?: string; data?: string }

export const MAX_FILE_B = 15 * 1024 * 1024;

export const fmtSize = (n: number) =>
  n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';

export const mimeExt = (dataUrl: string, fallback: string) =>
  (dataUrl.startsWith('data:') ? dataUrl.slice(5).split(';')[0].split('/')[1] || '' : '').split('+')[0] || fallback;

const dlHref = (url: string, name: string) =>
  url.startsWith('data:') ? url : url + (url.includes('?') ? '&' : '?') + 'dl=' + encodeURIComponent(name);

/** Save a file to the phone (via the native bridge) or the browser (anchor). */
export function saveFile(url: string, name: string) {
  if (!url) return;
  const bridge = typeof window !== 'undefined'
    ? (window as unknown as { AndroidDL?: { save?: (u: string, n: string) => void } }).AndroidDL
    : undefined;
  if (bridge?.save) { try { bridge.save(url, name); return; } catch { /* fall back to the browser path */ } }
  const a = document.createElement('a');
  a.href = dlHref(url, name);
  a.download = name;
  a.target = '_blank';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type Kind = 'image' | 'pdf' | 'audio' | 'video' | 'other';
interface Preview { url: string; name: string; kind: Kind }

export function kindOf(name: string, type: string, url: string): Kind {
  const t = (type || '').toLowerCase();
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (t.startsWith('image/') || url.startsWith('data:image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'].includes(ext)) return 'image';
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (t.startsWith('video/') || ['mp4', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video';
  if (t.startsWith('audio/') || url.startsWith('data:audio') || ['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
  if (ext === 'webm') return t.startsWith('video') ? 'video' : 'audio';
  return 'other';
}

/** A full-screen look at one attachment, with a Download that reaches storage
    even inside the app. */
export function AttachPreview({ p, onClose }: { p: Preview | null; onClose: () => void }) {
  if (!p) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center gap-2 px-4 h-14 shrink-0 pt-[env(safe-area-inset-top)]"
        onClick={(e) => e.stopPropagation()}>
        <span className="flex-1 min-w-0 truncate text-white text-[14px] font-medium">{p.name}</span>
        <button onClick={() => saveFile(p.url, p.name)}
          className="h-9 px-3.5 rounded-lg bg-white text-navy text-[13px] font-semibold flex items-center gap-1.5">
          <Icon name="download" size={15} /> Download
        </button>
        <button onClick={onClose} aria-label="Close"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 pb-6" onClick={onClose}>
        {p.kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.url} alt={p.name} onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded" />
        )}
        {p.kind === 'video' && (
          <video src={p.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded bg-black" />
        )}
        {p.kind === 'audio' && (
          <div className="w-full max-w-[440px] bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-semibold text-ink mb-3 truncate">{p.name}</p>
            <audio src={p.url} controls autoPlay className="w-full" />
          </div>
        )}
        {p.kind === 'pdf' && (
          <iframe src={p.url} title={p.name} onClick={(e) => e.stopPropagation()}
            className="w-full h-full bg-white rounded" />
        )}
        {p.kind === 'other' && (
          <div className="text-center text-white/90 px-6" onClick={(e) => e.stopPropagation()}>
            <Icon name="file" size={40} className="mx-auto mb-3 opacity-80" />
            <p className="text-[14px]">This file can&rsquo;t be shown here.</p>
            <button onClick={() => saveFile(p.url, p.name)}
              className="mt-3 h-10 px-4 rounded-lg bg-white text-navy text-[13px] font-semibold inline-flex items-center gap-1.5">
              <Icon name="download" size={15} /> Download to open
            </button>
          </div>
        )}
      </div>
      {p.kind === 'pdf' && (
        <p className="text-center text-white/70 text-[12px] pb-4 px-4" onClick={(e) => e.stopPropagation()}>
          If the PDF doesn&rsquo;t appear, tap Download to open it in your phone&rsquo;s viewer.
        </p>
      )}
    </div>
  );
}

/** Read-only: a row per file, tap to preview, Download on each. */
export function AttachList({ files, className }: { files: TFile[]; className?: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  if (!files.length) return null;
  return (
    <>
      <div className={'rounded border border-line divide-y divide-line-soft bg-white ' + (className || '')}>
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2">
            <button type="button"
              onClick={() => setPreview({ url: f.url || '', name: f.name, kind: kindOf(f.name, f.type, f.url || '') })}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
              <Icon name="file" size={16} className="text-muted shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium truncate">{f.name}</span>
                <span className="block text-[11px] text-muted">{fmtSize(f.size)} · tap to preview</span>
              </span>
            </button>
            <button type="button" onClick={() => saveFile(f.url || '', f.name)} title="Download"
              className="h-8 px-3 rounded border border-line text-[12px] font-semibold flex items-center
                gap-1.5 hover:bg-wash shrink-0 bg-white">
              <Icon name="download" size={13} /> Download
            </button>
          </div>
        ))}
      </div>
      <AttachPreview p={preview} onClose={() => setPreview(null)} />
    </>
  );
}

/** Read a picked FileList into TFiles, honouring the 15 MB cap. */
export async function readPicked(list: FileList, current: TFile[]): Promise<{ files: TFile[]; tooBig: string[] }> {
  const all = Array.from(list);
  const tooBig = all.filter((f) => f.size > MAX_FILE_B).map((f) => f.name);
  const fits = all.filter((f) => f.size <= MAX_FILE_B);
  const read = await Promise.all(fits.map((f) => new Promise<TFile>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: String(r.result || '') });
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  })));
  return { files: [...current, ...read], tooBig };
}

/** Form control: pick files, list them with a remove, cap enforced. */
export function AttachEditor({ files, onChange, onError, label }: {
  files: TFile[]; onChange: (files: TFile[]) => void; onError?: (msg: string) => void; label?: string;
}) {
  async function add(list: FileList) {
    const r = await readPicked(list, files);
    onChange(r.files);
    if (r.tooBig.length && onError) {
      onError(r.tooBig.join(', ') + (r.tooBig.length > 1 ? ' are' : ' is') + ' over 15 MB');
    }
  }
  return (
    <div>
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 h-9 px-2.5 rounded border border-line bg-wash">
              <Icon name="file" size={14} className="text-muted shrink-0" />
              <span className="flex-1 min-w-0 text-[12.5px] truncate">{f.name}</span>
              <span className="text-[11px] text-muted shrink-0">{fmtSize(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-accent shrink-0"
                aria-label="Remove file">
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded border border-dashed border-line
        text-[12.5px] font-medium text-muted hover:border-navy cursor-pointer">
        <Icon name="plus" size={14} /> {label || 'Add images, PDFs, documents'}
        <input type="file" multiple hidden
          onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
      </label>
    </div>
  );
}
