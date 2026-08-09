/**
 * Generic ascending-cursor pagination: fetch pages of `limit` rows until a
 * short page (fewer than `limit`) signals the end. Dependency-free so the
 * loop-termination logic is unit-tested without a real network or
 * database.
 *
 * Fix-plan 1.6, point 5 ("Complete pull"). Ascending order + a `> cursor`
 * predicate is required for correctness: the previous implementation
 * fetched `ORDER BY updated_at DESC LIMIT 200` with no cursor, which is
 * lossy the moment a user has more than 200 rows — this loop cannot stop
 * before it has seen everything newer than `startCursor`.
 */

export interface PageResult<T> {
  rows: T[]
  error: { message: string } | null
}

export interface PaginateResult<T> {
  rows: T[]
  ok: boolean
  /**
   * High-water mark to persist. Only ever advances past pages that were
   * fetched cleanly — a failed page must not move the cursor past data
   * the caller never actually received.
   */
  cursor: string | undefined
}

export async function paginateAscending<T>(
  fetchPage: (cursor: string | undefined, limit: number) => Promise<PageResult<T>>,
  getCursorValue: (row: T) => string,
  startCursor: string | undefined,
  limit: number,
  onPage?: (rows: T[]) => Promise<void>,
): Promise<PaginateResult<T>> {
  let cursor = startCursor
  const all: T[] = []

  for (;;) {
    const { rows, error } = await fetchPage(cursor, limit)
    if (error) {
      return { rows: all, ok: false, cursor }
    }

    if (rows.length > 0) {
      if (onPage) await onPage(rows)
      all.push(...rows)
      cursor = getCursorValue(rows[rows.length - 1])
    }

    if (rows.length < limit) {
      return { rows: all, ok: true, cursor }
    }
  }
}
