import { describe, expect, it, vi } from 'vitest'
import { buildRecentMonths, monthKey, pctChange } from './financeFormat'

describe('financeFormat', () => {
  it('builds stable month keys', () => {
    expect(monthKey(new Date('2026-04-20T12:00:00Z'))).toBe('2026-04')
  })

  it('returns ordered recent months', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'))

    const months = buildRecentMonths(3)

    expect(months.map(month => month.key)).toEqual(['2026-02', '2026-03', '2026-04'])

    vi.useRealTimers()
  })

  it('calculates positive percentage deltas', () => {
    expect(pctChange(120, 100)).toBe(20)
  })

  it('returns null when previous value is zero and current is zero', () => {
    expect(pctChange(0, 0)).toBeNull()
  })
})