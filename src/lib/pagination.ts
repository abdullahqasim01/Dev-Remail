import { Errors } from "@/lib/errors";

export interface PageParams {
  limit: number;
  after?: string;
  before?: string;
}

export function pageParams(req: Request): PageParams {
  const sp = new URL(req.url).searchParams;
  const raw = sp.get("limit");
  let limit = 20;
  if (raw !== null) {
    limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw Errors.validation("The `limit` must be an integer between 1 and 100.");
  }
  const after = sp.get("after") ?? undefined;
  const before = sp.get("before") ?? undefined;
  if (after && before) throw Errors.validation("You can only use either `after` or `before`, not both.");
  return { limit, after, before };
}

/**
 * Cursor pagination over a list ordered newest-first.
 * `fetch(opts)` must return rows ordered by `order` using the given cursor.
 */
export async function paginate<T extends { id: string }>(
  p: PageParams,
  fetch: (o: { order: "asc" | "desc"; cursor?: string; take: number }) => Promise<T[]>,
): Promise<{ rows: T[]; hasMore: boolean }> {
  if (p.before) {
    const rows = await fetch({ order: "asc", cursor: p.before, take: p.limit + 1 });
    const hasMore = rows.length > p.limit;
    return { rows: rows.slice(0, p.limit).reverse(), hasMore };
  }
  const rows = await fetch({ order: "desc", cursor: p.after, take: p.limit + 1 });
  return { rows: rows.slice(0, p.limit), hasMore: rows.length > p.limit };
}
