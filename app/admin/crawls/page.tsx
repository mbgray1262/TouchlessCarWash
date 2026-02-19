import { redirect } from 'next/navigation';

export default function CrawlsAdminPage() {
  redirect('/admin/crawls/new');
}
