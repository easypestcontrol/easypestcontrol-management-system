'use client';

/* ============================================================================
   /terms-and-conditions — the public legal page payment providers (Razorpay)
   verify on the domain before granting live access. No login, no navigation
   links point here on purpose: it is reached by its address.
   ========================================================================== */

import { useEffect, useState } from 'react';

interface Co {
  name: string; addr: string; city: string; pin: string;
  phone: string; email: string; gstin: string; state: string;
}

const H = 'text-[15px] font-bold text-[#141414] mt-7 mb-2';
const P = 'text-[13px] text-gray-700 leading-relaxed mb-3';

export default function Terms() {
  const [co, setCo] = useState<Co | null>(null);
  useEffect(() => {
    fetch('/api/public/docs/company').then((r) => r.json()).then(setCo).catch(() => {});
  }, []);

  const name = co?.name || 'Easy Pest Control';
  const addr = co ? [co.addr, co.city, co.state, co.pin].filter(Boolean).join(', ') : '';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[760px] mx-auto px-5 py-10">
        <h1 className="text-[24px] font-bold text-[#141414]">Terms &amp; Conditions</h1>
        <p className="text-[12px] text-gray-500 mt-1">
          {name}{addr ? ` · ${addr}` : ''} · Effective 20 August 2026
        </p>

        <h2 className={H}>1. About us</h2>
        <p className={P}>
          {name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) provides professional pest
          management services — including cockroach, termite, mosquito, rodent, bed bug and wood
          borer control — to residential and commercial customers in Tamil Nadu, India.
          {co?.gstin ? ` We are registered under GST (GSTIN: ${co.gstin}).` : ''} By booking a
          service, signing a service contract (AMC), or making a payment to us, you agree to
          these terms.
        </p>

        <h2 className={H}>2. Services and scheduling</h2>
        <p className={P}>
          Services are delivered exactly as described on the quotation or service contract you
          approve. Service dates and time windows are scheduled with you in advance; our
          technician travels to the service address you provide. Where a treatment requires the
          area to be vacated or prepared, this is indicated on the service sheet and is your
          responsibility to arrange. A signed digital service report is issued on completion of
          every service.
        </p>

        <h2 className={H}>3. Pricing and taxes</h2>
        <p className={P}>
          Prices are stated on the quotation, contract or invoice, are in Indian Rupees (INR),
          and are exclusive of GST unless stated otherwise. GST is charged at the applicable
          rate and shown separately on every tax invoice.
        </p>

        <h2 className={H}>4. Payments</h2>
        <p className={P}>
          We accept payment by UPI, cash, and bank transfer. Online and UPI payments are
          processed by <b>Razorpay Software Private Limited</b>, our authorised payment gateway.
          When you pay through Razorpay, the transaction is processed on Razorpay&rsquo;s secure
          systems and is subject to Razorpay&rsquo;s own terms of use; we do not receive or store
          your card, bank or UPI credentials. A receipt is recorded against your invoice for
          every payment, whatever the mode. Invoices are payable within 15 days of the invoice
          date unless your contract states otherwise; interest at 18% p.a. may be applied to
          overdue amounts.
        </p>

        <h2 className={H}>5. Cancellations and rescheduling</h2>
        <p className={P}>
          You may reschedule or cancel a scheduled service by contacting us at least 24 hours
          before the appointment at no charge. A service cancelled from an annual contract is
          removed from the schedule and from future billing — you are never charged for a
          service that was not delivered.
        </p>

        <h2 className={H}>6. Refunds</h2>
        <p className={P}>
          If you are charged for a service that was not delivered, or a duplicate payment is
          captured, we will refund the amount to the original payment method within 7–10
          working days of your request. Refunds for online payments are processed through
          Razorpay to the same instrument used to pay. To request a refund, contact us with the
          invoice or receipt number{co?.email ? ` at ${co.email}` : ''}
          {co?.phone ? ` or on ${co.phone}` : ''}.
        </p>

        <h2 className={H}>7. Warranty</h2>
        <p className={P}>
          Where a service carries a warranty period, it is stated on the quotation and the
          service report. The warranty covers re-treatment of the same pest at the same site
          within the stated period, free of charge. It does not cover new infestations, other
          pests, or other premises.
        </p>

        <h2 className={H}>8. Safety and chemicals</h2>
        <p className={P}>
          All chemicals are CIB&amp;RC-approved and applied by trained, licensed applicators.
          Quantities used are recorded on the service report. You agree to follow the
          precautions communicated by the technician (ventilation, re-entry time, covering of
          food and utensils, keeping children and pets away from treated areas as instructed).
        </p>

        <h2 className={H}>9. Liability</h2>
        <p className={P}>
          Our liability for any claim arising out of a service is limited to the amount paid
          for that service. We are not liable for indirect or consequential loss. Nothing in
          these terms limits liability that cannot be limited under Indian law.
        </p>

        <h2 className={H}>10. Governing law</h2>
        <p className={P}>
          These terms are governed by the laws of India and are subject to the exclusive
          jurisdiction of the courts of Chennai, Tamil Nadu.
        </p>

        <h2 className={H}>11. Contact</h2>
        <p className={P}>
          {name}{addr ? `, ${addr}` : ''}.
          {co?.phone ? ` Phone: ${co.phone}.` : ''}
          {co?.email ? ` Email: ${co.email}.` : ''}
        </p>

        <p className="text-[11px] text-gray-400 mt-8">
          See also our <a href="/privacy-policy" className="underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
