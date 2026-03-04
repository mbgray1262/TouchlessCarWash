import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 12;

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  baseHref: string;
  pageSize?: number;
}

export { PAGE_SIZE };

export function Pagination({ currentPage, totalItems, baseHref, pageSize = PAGE_SIZE }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const separator = baseHref.includes('?') ? '&' : '?';

  function pageHref(page: number) {
    if (page === 1) return baseHref;
    return `${baseHref}${separator}page=${page}`;
  }

  // Build page number array with ellipsis
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 mt-10">
      {currentPage > 1 ? (
        <Link
          href={pageHref(currentPage - 1)}
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-100 text-gray-300">
          <ChevronLeft className="w-4 h-4" />
        </span>
      )}

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="inline-flex items-center justify-center w-10 h-10 text-gray-400 text-sm">
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(p)}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
              p === currentPage
                ? 'bg-[#0F2744] text-white'
                : 'border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
            }`}
            aria-current={p === currentPage ? 'page' : undefined}
          >
            {p}
          </Link>
        )
      )}

      {currentPage < totalPages ? (
        <Link
          href={pageHref(currentPage + 1)}
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-100 text-gray-300">
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </nav>
  );
}

// Client-side version for use in 'use client' components
interface ClientPaginationProps {
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}

export function ClientPagination({ currentPage, totalItems, onPageChange, pageSize = PAGE_SIZE }: ClientPaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 mt-10">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:text-gray-300 disabled:border-gray-100 disabled:hover:bg-transparent"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="inline-flex items-center justify-center w-10 h-10 text-gray-400 text-sm">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
              p === currentPage
                ? 'bg-[#0F2744] text-white'
                : 'border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
            }`}
            aria-current={p === currentPage ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:text-gray-300 disabled:border-gray-100 disabled:hover:bg-transparent"
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
