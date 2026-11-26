import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import type { PaginationMeta } from '../types/domain';

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  compact?: boolean;
}

function buildPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) {
    pages.push(p);
  }
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [8, 15, 30],
  itemLabel = 'items',
  compact = false,
}: PaginationProps) {
  const { tr } = useLanguage();
  const { page, pageSize, totalItems, totalPages, hasPrevPage, hasNextPage } = pagination;

  if (totalItems === 0 && !onPageSizeChange) return null;

  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);
  const pageNumbers = buildPageNumbers(page, totalPages);

  return (
    <nav
      aria-label={`Pagination for ${itemLabel}`}
      className={`flex flex-col gap-3 border-t border-slate-200 bg-white sm:flex-row sm:items-center sm:justify-between ${
        compact ? 'px-4 py-2.5 typo-helper' : 'px-5 py-3 typo-helper'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 text-slate-600">
        <span className="tabular-nums">
          {totalItems === 0
            ? tr(`0 ${itemLabel}`)
            : tr(`Showing ${startItem}–${endItem} of ${totalItems} ${itemLabel}`)}
        </span>

        {onPageSizeChange && !compact && (
          <label className="inline-flex items-center gap-1.5 typo-label text-slate-600">
            <span>{tr('Rows:')}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label={`Rows per page for ${itemLabel}`}
              className="rounded border border-slate-300 bg-white px-2 py-1 typo-input font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!hasPrevPage}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            className={`inline-flex items-center gap-1 rounded border border-slate-300 bg-white typo-btn text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${
              compact ? 'h-8 px-2' : 'min-h-9 px-2.5 py-1'
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{tr('Prev')}</span>
          </button>

          {!compact && (
            <div className="hidden items-center gap-1 sm:flex">
              {pageNumbers.map((entry, idx) =>
                entry === 'ellipsis' ? (
                  <span key={`e_${idx}`} className="px-1.5 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => onPageChange(entry)}
                    aria-current={entry === page ? 'page' : undefined}
                    className={`min-h-9 min-w-9 rounded border px-2 font-mono typo-btn tabular-nums transition-colors ${
                      entry === page
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {entry}
                  </button>
                )
              )}
            </div>
          )}

          <span
            className={`px-2 font-mono typo-helper text-slate-600 tabular-nums ${
              compact ? 'inline' : 'inline sm:hidden'
            }`}
          >
            {page} / {totalPages}
          </span>

          <button
            type="button"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            className={`inline-flex items-center gap-1 rounded border border-slate-300 bg-white typo-btn text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${
              compact ? 'h-8 px-2' : 'min-h-9 px-2.5 py-1'
            }`}
          >
            <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{tr('Next')}</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
