import { describe, it, expect, vi } from 'vitest'
import { paginateAscending, type PageResult } from '../pagination'

interface Row {
  id: string
  updated_at: string
}

function page(rows: Row[]): PageResult<Row> {
  return { rows, error: null }
}

describe('paginateAscending', () => {
  it('stops at the first short page and returns every row seen', async () => {
    const rows: Row[] = [
      { id: '1', updated_at: '2026-08-01T00:00:00Z' },
      { id: '2', updated_at: '2026-08-02T00:00:00Z' },
    ]
    const fetchPage = vi.fn(async () => page(rows))

    const result = await paginateAscending(fetchPage, (r) => r.updated_at, undefined, 500)

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result.rows).toEqual(rows)
    expect(result.ok).toBe(true)
    expect(result.cursor).toBe('2026-08-02T00:00:00Z')
  })

  it('pages past the limit until a short page — the fix for the old 200-row cap', async () => {
    // 450 rows across a page size of 200: two full pages (200, 200) then a
    // short page (50) ends the loop — mirrors the "seed 450 rows" done-when.
    const all: Row[] = Array.from({ length: 450 }, (_, i) => ({
      id: String(i),
      updated_at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    }))

    const fetchPage = vi.fn(async (cursor: string | undefined, limit: number) => {
      const startIdx = cursor ? all.findIndex((r) => r.updated_at === cursor) + 1 : 0
      return page(all.slice(startIdx, startIdx + limit))
    })

    const result = await paginateAscending(fetchPage, (r) => r.updated_at, undefined, 200)

    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(result.rows).toHaveLength(450)
    expect(result.ok).toBe(true)
    expect(result.cursor).toBe(all[449].updated_at)
  })

  it('a second pull starting from the persisted cursor transfers zero rows', async () => {
    const all: Row[] = Array.from({ length: 450 }, (_, i) => ({
      id: String(i),
      updated_at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    }))
    const fetchPage = async (cursor: string | undefined, limit: number) => {
      const startIdx = cursor ? all.findIndex((r) => r.updated_at === cursor) + 1 : 0
      return page(all.slice(startIdx, startIdx + limit))
    }

    const first = await paginateAscending(fetchPage, (r) => r.updated_at, undefined, 200)
    const second = await paginateAscending(fetchPage, (r) => r.updated_at, first.cursor, 200)

    expect(second.rows).toHaveLength(0)
    expect(second.ok).toBe(true)
    // Cursor does not regress when a page comes back empty.
    expect(second.cursor).toBe(first.cursor)
  })

  it('calls onPage per page so the caller can merge before advancing the cursor', async () => {
    const rows: Row[] = [{ id: '1', updated_at: '2026-08-01T00:00:00Z' }]
    const merged: Row[][] = []
    await paginateAscending(async () => page(rows), (r) => r.updated_at, undefined, 500, async (r) => {
      merged.push(r)
    })
    expect(merged).toEqual([rows])
  })

  it('stops and reports !ok on a page error without advancing the cursor past it', async () => {
    const rows: Row[] = [{ id: '1', updated_at: '2026-08-01T00:00:00Z' }]
    let call = 0
    const fetchPage = vi.fn(async () => {
      call++
      if (call === 1) return page(rows)
      return { rows: [], error: { message: 'network down' } }
    })

    const result = await paginateAscending(fetchPage, (r) => r.updated_at, undefined, 1)

    expect(result.ok).toBe(false)
    // The cursor still reflects the last page that landed cleanly.
    expect(result.cursor).toBe('2026-08-01T00:00:00Z')
  })
})
