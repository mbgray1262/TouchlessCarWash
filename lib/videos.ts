import { supabase } from '@/lib/supabase';

export type TouchlessVideo = { youtubeId: string; title: string };

/**
 * The active touchless-equipment video pool, managed at /admin/videos.
 * Shared by the homepage, blog posts, and the /paint-safe page so every
 * "see it in action" module draws from the same curated, ordered set.
 */
export async function getTouchlessVideoPool(limit = 6): Promise<TouchlessVideo[]> {
  const { data } = await supabase
    .from('equipment_videos')
    .select('youtube_id, title, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(limit);
  return (data ?? []).map((r) => ({
    youtubeId: r.youtube_id as string,
    title: r.title as string,
  }));
}
