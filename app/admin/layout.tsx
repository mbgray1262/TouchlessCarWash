import { AdminAuthProvider } from '@/components/AdminAuthProvider';
import { AdminAuthGate } from '@/components/AdminAuthGate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminAuthGate>
        {children}
      </AdminAuthGate>
    </AdminAuthProvider>
  );
}
