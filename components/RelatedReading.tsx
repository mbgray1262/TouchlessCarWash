import Link from 'next/link';
import { BookOpen, ChevronRight } from 'lucide-react';
import { RELATED_BLOGS } from '@/lib/related-blogs';

interface RelatedReadingProps {
  heading?: string;
  className?: string;
}

export function RelatedReading({
  heading = 'Helpful Reading on Touchless Car Washes',
  className = '',
}: RelatedReadingProps) {
  return (
    <section
      aria-label="Related blog posts"
      className={`mt-14 pt-10 border-t border-gray-200 ${className}`}
    >
      <div className="flex items-center gap-2 mb-5">
        <BookOpen className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-bold text-foreground">{heading}</h2>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {RELATED_BLOGS.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
            >
              <ChevronRight className="w-4 h-4 mt-1 text-blue-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              <div>
                <div className="font-semibold text-[#0F2744] group-hover:text-blue-700 leading-snug">
                  {post.title}
                </div>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{post.blurb}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
