import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PestOps',
  description: 'Pest-control operations — leads to visits to invoices.',
};

/*
 * Without this every phone renders the page at ~980px and scales it down, so
 * the field app arrives as a tiny unreadable desktop. The technician is the
 * one user guaranteed to be on a phone.
 *
 * `viewportFit: cover` lets the finish bar sit above the home indicator on
 * notched phones rather than under it.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#141414',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
