import { supabase } from '@/lib/supabase';
import VideosManager, { type EquipmentVideoRow } from './VideosManager';

export const dynamic = 'force-dynamic';

async function getVideos(): Promise<EquipmentVideoRow[]> {
  const { data } = await supabase
    .from('equipment_videos')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data ?? []) as EquipmentVideoRow[];
}

export default async function AdminVideosPage() {
  const videos = await getVideos();
  return (
    <div className="container mx-auto px-4 max-w-4xl py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F2744]">Equipment Videos</h1>
        <p className="text-gray-500 mt-1">
          The pool of touchless-wash clips shown in the &ldquo;See a Touchless Wash in Action&rdquo;
          section on listing pages. Each listing always shows the same video from this pool.
        </p>
      </div>
      <VideosManager initial={videos} />
    </div>
  );
}
