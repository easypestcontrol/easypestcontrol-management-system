/* Shared looks and shapes for the Expenses module — one source so every
   screen matches.

   The colours answer the one question the office asks of an expense: has it
   been paid? Red while nobody has looked at it, amber once it is approved and
   the money is still owed (in part or in full), green when it has been paid,
   grey when it was turned down. */

import type { IconName } from '@/components/icons';

const ICON: Record<string, IconName> = {
  'Trip / Travel': 'road',
  'Petrol / Fuel': 'fuel',
  'Materials': 'tools',
  'Parking': 'receipt',
  'Toll': 'road',
  'Vehicle Maintenance': 'wrench',
  'Food': 'food',
  'Tools / Equipment': 'tools',
  'Office': 'report',
  'Miscellaneous': 'receipt',
};
export const catIcon = (name: string): IconName => ICON[name] || 'receipt';

export const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  pending:        { label: 'PENDING',        cls: 'bg-rose text-rose-ink' },
  approved:       { label: 'APPROVED · TO PAY', cls: 'bg-amber text-amber-ink' },
  partial:        { label: 'PARTLY PAID',    cls: 'bg-amber text-amber-ink' },
  processing:     { label: 'PAYING…',        cls: 'bg-amber text-amber-ink' },
  reimbursed:     { label: 'PAID',           cls: 'bg-mint text-mint-ink' },
  rejected:       { label: 'REJECTED',       cls: 'bg-wash text-muted border border-line' },
  payment_failed: { label: 'PAYMENT FAILED', cls: 'bg-rose text-rose-ink border border-red-line' },
};
export const chip = (s: string) => STATUS_CHIP[s] || STATUS_CHIP.pending;

/** Money still owed on an expense: approved and unpaid, part paid, or bounced. */
export const PAYABLE = ['approved', 'partial', 'payment_failed'];

export interface Summary {
  count: number; employees: number; total: number;
  pending: number; approved: number; partial: number; reimbursed: number; rejected: number;
  paid: number; due: number;
}

export interface Exp {
  id: string; userId: string; employeeName: string; employeeColor: string;
  date: string; category: string; merchant: string; note: string; amount: number; paidAmount: number;
  status: string; source: string; tripId: string; rejectReason: string; hasReceipt: boolean;
  km: number; rate: number;
}

export interface Category { id: string; name: string; active: boolean }

const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
/** "25 Sep" — or "25 Sep 2026" with the year. */
export const niceDate = (iso: string, year = false) => {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${Number(p[2])} ${M[Number(p[1]) - 1]}${year ? ' ' + p[0] : ''}` : iso;
};
/** "September 2026" from "2026-09". */
export const niceMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
export const shiftDay = (iso: string, by: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + by);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
};

/** The field look every expenses form uses. */
export const inputCls = 'w-full h-12 lg:h-10 px-3.5 lg:px-3 rounded-xl lg:rounded-lg border border-line '
  + 'text-[15px] lg:text-[13.5px] outline-none transition-colors bg-wash focus:border-accent focus:bg-white '
  + 'focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]';
