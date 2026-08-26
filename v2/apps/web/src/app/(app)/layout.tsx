import Shell from '@/components/shell';
import HardwareBack from '@/components/hardware-back';
import TripTracker from '@/components/trip-tracker';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      {/* Android's back key, which was closing the app from every screen. */}
      <HardwareBack />
      <TripTracker />
      {children}
    </Shell>
  );
}
