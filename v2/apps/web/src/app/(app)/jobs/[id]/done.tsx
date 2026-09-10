'use client';

/* ============================================================================
   The service, once it is finished — on a phone.

   Until now the phone showed the desk's version of this: a stack of bordered
   panels, four stat boxes at desk proportions, photographs at thumbnail size
   and a signature squeezed into a corner. It was legible, but it did not read
   as the record of a completed job — and it is the screen a technician shows
   a customer who asks "so what did you do?".

   So it is built like the report itself: what happened, when, what it looked
   like before and after, what was used, and the customer's own signature at
   the bottom. Nothing about travelling anywhere — that is over.
   ========================================================================== */

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { BackBar } from '@/components/mobile';
import ShareLink from '@/components/share-link';
import { durationText, fmtTime, relDay, type JobDetail } from '../format';
import { Lightbox } from '../ui';
import { TechMoney } from './money';

/** A labelled figure. Four of these say when the visit happened. */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-[18px] px-4 py-3">
      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="text-[17px] font-bold mt-1 leading-none">{value}</p>
    </div>
  );
}

/** A section of the report. Heading, then the thing itself. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-[20px] px-4 py-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted mb-3">{title}</p>
      {children}
    </section>
  );
}

export default function TechDone({ j }: { j: JobDetail }) {
  const x = j.exec;
  const cl = j.client;
  const [zoom, setZoom] = useState<string | null>(null);
  const inv = new Map(j.inventory.map((i) => [i.id, i]));

  const photos = (list: string[], alt: string) => (
    <div className="grid grid-cols-2 gap-2.5">
      {list.map((p, i) => (
        <button key={i} type="button" onClick={() => setZoom(p)}
          className="rounded-[14px] overflow-hidden border border-line active:brightness-95">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p} alt={alt + ' ' + (i + 1)} className="w-full h-32 object-cover" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="lg:hidden min-h-full bg-ground pb-[calc(env(safe-area-inset-bottom)+110px)]">
      <BackBar title="Today's work" sub={j.id} fallback="/jobs" />

      <div className="px-4 pt-4 flex flex-col gap-3">
        {/* Done, and who now has the report. */}
        <div className="bg-mint rounded-[20px] px-4 py-4 flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-white text-mint-ink flex items-center justify-center shrink-0">
            <Icon name="check" size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15.5px] font-bold text-mint-ink">Service completed</span>
            <span className="block text-[13px] text-mint-ink/80 mt-0.5">
              {fmtTime(x?.finishedAt)} · {durationText(x?.durationMins || j.mins)} on site ·
              report sent to {cl?.contact || 'the customer'}
            </span>
          </span>
        </div>

        {/* Who it was for. No directions — the visit is over. */}
        <section className="bg-white rounded-[20px] px-4 py-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="h-6 px-2.5 rounded-full bg-wash text-[11.5px] font-bold text-ink-2 flex items-center">
              {j.type}
            </span>
            <span className="text-[12px] text-muted-2 font-mono">{j.id}</span>
          </div>
          <p className="text-[18px] font-bold tracking-[-0.01em]">{cl?.name || '—'}</p>
          <p className="text-[13.5px] text-muted mt-0.5">
            {j.title}{j.visitNo ? ' · service ' + j.visitNo + ' of ' + j.ofVisits : ''}
          </p>
          <p className="text-[13.5px] text-ink-2 mt-2">
            {fmtTime(j.slot)} · {relDay(j.date)}
          </p>
          {(cl?.addr || cl?.city) && (
            <p className="text-[13.5px] text-muted mt-1">
              {cl?.addr}{cl?.city ? ', ' + cl.city : ''}
            </p>
          )}
          {cl?.phone && (
            <a href={'tel:' + cl.phone}
              className="mt-3 h-12 rounded-xl border border-line flex items-center justify-center gap-2
                text-[14.5px] font-semibold active:bg-wash">
              <Icon name="phone" size={16} /> Call {(cl.contact || '').split(' ')[0] || 'the customer'}
            </a>
          )}
        </section>

        <TechMoney j={j} />

        {/* The report, in the order it is read. */}
        <div className="grid grid-cols-2 gap-2.5">
          <Link href={'/report/' + j.id} target="_blank" rel="noreferrer"
            className="h-12 rounded-xl bg-accent text-white text-[14.5px] font-bold
              flex items-center justify-center gap-2 active:brightness-90">
            <Icon name="report" size={17} /> View report
          </Link>
          <div className="[&>*]:w-full [&_button]:h-12 [&_button]:w-full [&_button]:rounded-xl
            [&_button]:text-[14.5px] [&_button]:font-semibold [&_a]:h-12 [&_a]:w-full
            [&_a]:rounded-xl [&_a]:text-[14.5px] [&_a]:font-semibold">
            <ShareLink path={'/report/' + j.id} title={'Service report ' + j.id}
              phone={cl?.phone}
              text={'Service report for ' + j.id + ' — what was done, photos and your signed acknowledgement:'} />
          </div>
        </div>

        {x && (
          <>
            {/* Only the stamps that exist. A tile reading "Checked in —" is a
                gap in the record dressed up as a fact. */}
            <div className="grid grid-cols-2 gap-2.5">
              {([
                ['Checked in', fmtTime(x.checkinAt)],
                ['Work started', fmtTime(x.startedAt)],
                ['Completed', fmtTime(x.finishedAt)],
                ['Time on site', durationText(x.durationMins || j.mins)],
              ] as Array<[string, string]>)
                .filter(([, v]) => v && v !== '—')
                .map(([label, value]) => <Tile key={label} label={label} value={value} />)}
            </div>

            {x.geo && (
              <p className="text-[12.5px] text-muted px-1">GPS verified at check-in — {x.geo}</p>
            )}

            {(x.areaFindings || []).length > 0 && (
              <Block title="Work carried out">
                <div className="flex flex-col gap-2.5">
                  {(x.areaFindings || []).map((a, i) => (
                    <div key={i} className="rounded-[14px] bg-ground px-3.5 py-2.5">
                      <p className="text-[13.5px] font-bold capitalize">{a.area || 'Area ' + (i + 1)}</p>
                      <p className="text-[13.5px] text-ink-2 mt-0.5">{a.text}</p>
                    </div>
                  ))}
                </div>
              </Block>
            )}

            {x.photosBefore.length > 0 && (
              <Block title="Before treatment">{photos(x.photosBefore, 'Before')}</Block>
            )}
            {x.photosAfter.length > 0 && (
              <Block title="After treatment">{photos(x.photosAfter, 'After')}</Block>
            )}

            {x.chemicals.length > 0 && (
              <Block title="Chemicals used">
                <div className="flex flex-col gap-2">
                  {x.chemicals.map((c, i) => {
                    const it = inv.get(c.id);
                    return (
                      <div key={i} className="flex items-baseline justify-between gap-3">
                        <span className="text-[14px] font-semibold truncate">{it?.name || c.id}</span>
                        <span className="text-[14px] font-bold tabular-nums shrink-0">
                          {c.qty} {it?.unit || ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Block>
            )}

            {(x.techNotes || x.observations) && (
              <Block title="Technician's notes">
                <p className="text-[14px] text-ink-2 leading-relaxed whitespace-pre-wrap">
                  {[x.observations, x.techNotes].filter(Boolean).join('\n')}
                </p>
              </Block>
            )}

            {(x.signature || x.rating > 0) && (
              <Block title="Customer acknowledgement">
                {x.signatureImage && (
                  /* A signature is a wide thing. Held in a tall box it was
                     printed at the size of a stamp with white space either
                     side of it — this frame has the proportions of the line
                     somebody actually signs on. */
                  <button type="button" onClick={() => setZoom(x.signatureImage)}
                    className="block w-full h-[92px] rounded-[14px] border border-line bg-white
                      overflow-hidden active:brightness-95">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.signatureImage} alt="Customer signature"
                      className="w-full h-full object-contain p-2" />
                  </button>
                )}
                <p className="text-[15px] font-bold mt-2.5">{x.signedBy || cl?.contact || '—'}</p>
                <p className="text-[12.5px] text-muted">Digitally signed on completion</p>
                {x.rating > 0 && (
                  <p className="text-[20px] tracking-[0.12em] mt-2">
                    <span className="text-accent">{'★'.repeat(x.rating)}</span>
                    <span className="text-line">{'★'.repeat(5 - x.rating)}</span>
                  </p>
                )}
              </Block>
            )}

            {j.invoice && (
              <Link href={'/invoices/' + j.invoice.id}
                className="bg-white rounded-[20px] px-4 py-4 flex items-center gap-3 active:bg-wash">
                <span className="w-10 h-10 rounded-full bg-sky text-sky-ink flex items-center justify-center shrink-0">
                  <Icon name="invoice" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold">Invoice {j.invoice.id}</span>
                  <span className="block text-[12.5px] text-muted">Raised {j.invoice.date}</span>
                </span>
                <Icon name="chevRight" size={16} className="text-muted-2 shrink-0" />
              </Link>
            )}
          </>
        )}
      </div>

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
