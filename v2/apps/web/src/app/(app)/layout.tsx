import Shell from '@/components/shell';
import TripTracker from '@/components/trip-tracker';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <TripTracker />
      {children}
    </Shell>
  );
}
