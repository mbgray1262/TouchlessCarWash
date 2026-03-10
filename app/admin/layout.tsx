import { AdminAuthProvider } from '@/components/AdminAuthProvider';
import { AdminAuthGate } from '@/components/AdminAuthGate';
import { AdminNav } from '@/components/AdminNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminAuthGate>
        <AdminNav />
        {/* Desktop: offset by sidebar width; Mobile: offset by top bar height */}
        <div className="md:pl-60 pt-12 md:pt-0 min-h-screen bg-gray-50">
          {children}
        </div>
      </AdminAuthGate>
    </AdminAuthProvider>
  );
}
