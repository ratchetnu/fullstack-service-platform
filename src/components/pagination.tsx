import Link from "next/link";

/** Previous / next links that keep the current filters in the query string. */
export function Pagination({ page, pageSize, total, basePath, query }: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query: Record<string, string | undefined>;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  };
  const linkClass = "rounded-md px-3 py-1.5 ring-1 ring-inset ring-slate-300 hover:bg-slate-50";
  const disabledClass = "rounded-md px-3 py-1.5 text-slate-400 ring-1 ring-inset ring-slate-200";

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        Page {page} of {pageCount} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? <Link className={linkClass} href={href(page - 1)}>Previous</Link> : <span className={disabledClass}>Previous</span>}
        {page < pageCount ? <Link className={linkClass} href={href(page + 1)}>Next</Link> : <span className={disabledClass}>Next</span>}
      </div>
    </nav>
  );
}
