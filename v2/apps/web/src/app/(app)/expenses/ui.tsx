/* Shared looks for the Expenses module — the category icons and the status
   chips, one source so the shelf and the folder always match. */

import type { IconName } from '@/components/icons';

export const CATEGORY_ICON: Record<string, IconName> = {
  'Fuel / Petrol': 'fuel',
  'Food & tea': 'food',
  'Travel (bus / train / auto)': 'bus',
  'Materials & supplies': 'tools',
  'Vehicle repair': 'wrench',
  'Mobile recharge': 'phone',
  'Accommodation': 'bed',
  'Other': 'receipt',
  'Trip allowance': 'road',
};

export const catIcon = (name: string): IconName => CATEGORY_ICON[name] || 'receipt';

export const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  open: { label: 'OPEN', cls: 'bg-wash text-muted border border-line' },
  submitted: { label: 'AWAITING APPROVAL', cls: 'bg-red-wash text-accent' },
  approved: { label: 'TO PAY', cls: 'bg-navy text-white' },
  rejected: { label: 'RETURNED', cls: 'bg-red-wash text-accent border border-red-line' },
  paid: { label: 'PAID', cls: 'bg-wash text-navy border border-navy' },
};
