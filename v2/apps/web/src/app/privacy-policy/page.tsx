'use client';

/* ============================================================================
   /privacy-policy — the public privacy page payment providers (Razorpay)
   verify on the domain. No login; reached by its address.
   ========================================================================== */

import { useEffect, useState } from 'react';

interface Co {
  name: string; addr: string; city: string; pin: string;
  phone: string; email: string; state: string;
}

const H = 'text-[15px] font-bold text-[#141414] mt-7 mb-2';
const P = 'text-[13px] text-gray-700 leading-relaxed mb-3';
const LI = 'text-[13px] text-gray-700 leading-relaxed mb-1.5 list-disc ml-5';

export default function Privacy() {
  const [co, setCo] = useState<Co | null>(null);
  useEffect(() => {
    fetch('/api/public/docs/company').then((r) => r.json()).then(setCo).catch(() => {});
  }, []);

  const name = co?.name || 'Easy Pest Control';
  const addr = co ? [co.addr, co.city, co.state, co.pin].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[760px] mx-auto px-5 py-10">
        <h1 className="text-[24px] font-bold text-[#141414]">Privacy Policy</h1>
        <p className="text-[12px] text-gray-500 mt-1">
          {name}{addr ? ` · ${addr}` : ''} · Effective 20 August 2026
        </p>

        <p className={P + ' mt-5'}>
          This policy explains what information {name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
          collects when you enquire about, book, or receive our pest management services, how
          we use it, and the choices you have. We collect only what the service genuinely
          needs, and we do not sell personal information to anyone.
        </p>

        <h2 className={H}>1. What we collect</h2>
        <ul className="mb-3">
          <li className={LI}>
            <b>Contact and site details</b> — your name, phone number, email address, and the
            address of the property to be serviced, so we can schedule and deliver the service
            and send you quotations, invoices and service reports.
          </li>
          <li className={LI}>
            <b>Service records</b> — what was treated, the chemicals applied and their
            quantities, before/after photographs of the treated areas, the technician&rsquo;s
            notes, and your signature and rating on completion. These form the service report
            you receive.
          </li>
          <li className={LI}>
            <b>Site location</b> — with consent at the first visit, the GPS coordinates of the
            service site, recorded once so later visits navigate to the right place.
          </li>
          <li className={LI}>
            <b>Payment information</b> — the invoice, amount, mode and receipt of every
            payment. Online and UPI payments are processed by <b>Razorpay Software Private
            Limited</b>; your card, bank and UPI credentials are collected and processed by
            Razorpay on its PCI-DSS-compliant systems and <b>never reach or get stored on our
            servers</b>. Razorpay&rsquo;s handling of that data is governed by Razorpay&rsquo;s
            own privacy policy.
          </li>
        </ul>

        <h2 className={H}>2. How we use it</h2>
        <ul className="mb-3">
          <li className={LI}>To schedule, deliver and document the services you book.</li>
          <li className={LI}>To raise GST tax invoices and record your payments and receipts.</li>
          <li className={LI}>To send you service reports, invoices, quotations and payment links — by WhatsApp, SMS or email at the contact details you gave us.</li>
          <li className={LI}>To honour warranties (your service history tells us what is covered).</li>
          <li className={LI}>To meet legal obligations, including GST and accounting law.</li>
        </ul>

        <h2 className={H}>3. Sharing</h2>
        <p className={P}>
          Your information is shared only with: (a) the technician assigned to your service,
          who sees the details needed to deliver it; (b) Razorpay, to process a payment you
          initiate; (c) service providers that host our systems; and (d) authorities where the
          law requires it. Nothing is sold or shared for advertising.
        </p>

        <h2 className={H}>4. Security</h2>
        <p className={P}>
          Access to your information is restricted by role — staff see only what their work
          requires, scoped to their branch. Payment credentials never touch our systems, and
          the operational keys and records we do hold are stored encrypted. Documents shared
          with you (invoice, contract, service report) are accessible only through their
          specific links.
        </p>

        <h2 className={H}>5. Retention</h2>
        <p className={P}>
          Invoices, receipts and service records are retained as required by Indian tax and
          accounting law (currently 8 years). Enquiry details that never become a booking are
          removed on request.
        </p>

        <h2 className={H}>6. Your rights</h2>
        <p className={P}>
          You may ask for a copy of the information we hold about you, ask us to correct it,
          or ask us to delete what we are not legally required to keep. Contact us
          {co?.email ? ` at ${co.email}` : ''}{co?.phone ? ` or on ${co.phone}` : ''} and we
          will respond within 30 days.
        </p>

        <h2 className={H}>7. Changes</h2>
        <p className={P}>
          If this policy changes, the new version is published at this address with a new
          effective date.
        </p>

        <h2 className={H}>8. Contact</h2>
        <p className={P}>
          {name}{addr ? `, ${addr}` : ''}.
          {co?.phone ? ` Phone: ${co.phone}.` : ''}
          {co?.email ? ` Email: ${co.email}.` : ''}
        </p>

        <p className="text-[11px] text-gray-400 mt-8">
          See also our <a href="/terms-and-conditions" className="underline">Terms &amp; Conditions</a>.
        </p>
      </div>
    </div>
  );
}
