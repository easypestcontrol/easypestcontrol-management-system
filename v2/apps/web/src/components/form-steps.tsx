'use client';

/* ============================================================================
   Long forms, one step at a time — on the phone only.

   A quotation asks for a customer, a title, two addresses, tax details, the
   services, the money, the terms and a signature. On a desk that is one glance
   and a couple of tabs. On a phone it is a column of fields several screens
   tall, and the person filling it in has no idea how much is left, loses their
   place after the keyboard opens, and cannot tell whether they have missed
   something until the save fails.

   So the phone gets the same form in stages: one section on screen, a red
   tracker above it saying where you are, and one button that moves you on.
   The desktop keeps the whole form exactly as it was — `max-lg:hidden` is what
   hides an inactive stage, and it stops applying at `lg`.

   Nothing unmounts. Every field of every step stays in the DOM the whole time,
   which matters more than it sounds: the parent's state, the focus ring, a
   half-typed address and an open dropdown all survive moving between steps,
   and the save at the end sees the same object it would have seen if the form
   had never been split up.
   ========================================================================== */

import { useEffect, useRef } from 'react';

/* --------------------------------------------------------------- tracker */

/**
 * Where you are, and how much is left. Sticks under the page header so it is
 * still there after the keyboard pushes the form up.
 *
 * The rail fills red as you go. Steps already done are tappable — going back
 * to fix the address should not mean pressing Back four times — and steps
 * ahead are not, because they are the ones being counted down.
 */
export function FormSteps({ steps, at, onGo, className = '' }: {
  steps: string[]; at: number; onGo: (n: number) => void; className?: string;
}) {
  const pct = steps.length < 2 ? 100 : (at / (steps.length - 1)) * 100;
  /* `className` exists so a page can pull the bar out to the screen edges with
     its own negative margin. It has to land on THIS element: a sticky element
     only travels inside its parent's box, so wrapping it in a div its own
     height would pin it in place and it would never stick to anything. */
  return (
    <div className={'lg:hidden sticky top-0 z-20 bg-white border-b border-line px-4 pt-3 pb-2.5 ' + className}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[13px] font-bold truncate min-w-0">{steps[at]}</span>
        <span className="text-[12px] text-muted tabular-nums whitespace-nowrap shrink-0">
          Step {at + 1} of {steps.length}
        </span>
      </div>

      <div className="relative">
        {/* The rail sits behind the dots and is inset by half a dot at each
            end, so the fill starts inside the first dot and finishes inside
            the last one instead of hanging off the edges. */}
        <div className="absolute left-[13px] right-[13px] top-[12px] h-[3px] rounded-full bg-line-soft" />
        <div
          className="absolute left-[13px] top-[12px] h-[3px] rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: 'calc((100% - 26px) * ' + pct / 100 + ')' }}
        />
        <ol className="relative flex justify-between">
          {steps.map((s, i) => {
            const done = i < at;
            const here = i === at;
            return (
              <li key={s} className="flex flex-col items-center gap-1 min-w-0">
                <button
                  type="button"
                  disabled={i > at}
                  onClick={() => onGo(i)}
                  aria-current={here ? 'step' : undefined}
                  aria-label={'Step ' + (i + 1) + ': ' + s}
                  className={'w-[26px] h-[26px] rounded-full text-[11.5px] font-bold grid place-items-center '
                    + 'border-2 transition-colors duration-300 shrink-0 '
                    + (done || here
                      ? 'bg-accent border-accent text-white'
                      : 'bg-white border-line text-muted-2')
                    + (here ? ' ring-4 ring-red-wash' : '')
                    + (i > at ? ' cursor-default' : '')}>
                  {done ? '✓' : i + 1}
                </button>
                <span className={'text-[10.5px] leading-tight text-center max-w-[68px] truncate '
                  + (here ? 'text-ink-2 font-semibold' : 'text-muted-2')}>
                  {s}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stage */

/**
 * One stage of the form. Hidden on the phone unless it is the active one;
 * always visible from `lg` up, where the form is not stepped at all.
 */
export function Step({ n, at, children }: {
  n: number; at: number; children: React.ReactNode;
}) {
  return <div className={n === at ? '' : 'max-lg:hidden'}>{children}</div>;
}

/* --------------------------------------------------------------- the bar */

/**
 * The phone's bottom bar: Back, and either Next or the save.
 *
 * It is fixed above the tab bar because after a long form the buttons have to
 * be under the thumb, not scrolled off the top. An error prints above the
 * buttons rather than beside them — a message squeezed next to a button is a
 * message nobody reads.
 */
export function StepNav({ steps, at, onBack, onNext, onSave, saving, saveLabel, err }: {
  steps: number; at: number;
  onBack: () => void; onNext: () => void; onSave: () => void;
  saving?: boolean; saveLabel: string; err?: string;
}) {
  const last = at >= steps - 1;
  return (
    <div className="lg:hidden fixed left-0 right-0 z-30 bottom-[calc(max(12px,env(safe-area-inset-bottom))+70px)]
      bg-white border-t border-line px-4 pt-2.5 pb-2.5">
      {err && <p className="text-accent text-[13px] mb-2 leading-snug">{err}</p>}
      <div className="flex gap-2.5">
        {at > 0 && (
          <button type="button" onClick={onBack} disabled={saving}
            className="h-[52px] px-5 rounded-xl border border-line bg-white font-semibold text-[15px]
              active:bg-wash disabled:opacity-60">
            Back
          </button>
        )}
        <button type="button" onClick={last ? onSave : onNext} disabled={saving}
          className="flex-1 h-[52px] rounded-xl bg-accent text-white font-bold text-[16px]
            active:brightness-90 disabled:opacity-60">
          {saving ? 'Saving…' : last ? saveLabel : 'Next'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the plumbing */

/**
 * Moving to a step should start it at the top.
 *
 * Without this you press Next near the bottom of a long stage and the next one
 * opens already scrolled past its first fields — which reads as the button
 * having done nothing. Skipped on the first render so opening the form does
 * not yank the page, and skipped from `lg` up where nothing is being stepped.
 */
export function useStepScroll(at: number) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    /* The page scrolls inside <main>, not the window — the shell gives it
       `overflow-y-auto` so the sidebar and the tab bar stay put while the
       content moves. Scrolling the window would have done nothing at all,
       silently, which is the kind of thing that only shows up on a phone. */
    const box = document.querySelector('main');
    const target: Element | Window =
      box && box.scrollHeight > box.clientHeight ? box : window;
    target.scrollTo({ top: 0, behavior: 'smooth' });
  }, [at]);
}
