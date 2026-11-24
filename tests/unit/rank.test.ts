import { describe, expect, it } from 'vitest'
import { frecency, fuzzyScore, rankItems } from '@shared/rank'

describe('fuzzyScore', () => {
  it('prefers prefix matches over inner matches', () => {
    expect(fuzzyScore('git', 'github')).toBeGreaterThan(fuzzyScore('git', 'legit'))
  })
  it('matches subsequences and rejects misses', () => {
    expect(fuzzyScore('gthb', 'github')).toBeGreaterThan(0)
    expect(fuzzyScore('xyz', 'github')).toBe(0)
  })
  it('requires every word', () => {
    expect(fuzzyScore('react doc', 'React — Documentation')).toBeGreaterThan(0)
    expect(fuzzyScore('react zebra', 'React — Documentation')).toBe(0)
  })
})

describe('frecency', () => {
  it('rewards recent and frequent visits', () => {
    const now = Date.now()
    expect(frecency(5, now, now)).toBeGreaterThan(frecency(5, now - 30 * 864e5, now))
    expect(frecency(20, now, now)).toBeGreaterThan(frecency(2, now, now))
  })
})

describe('rankItems', () => {
  it('ranks by match and boost', () => {
    const items = [
      { title: 'Mail', url: 'https://mail.example.com' },
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'Gist', url: 'https://gist.github.com' }
    ]
    expect(rankItems('git', items)[0].title).toBe('GitHub')
    expect(rankItems('git', items, (i) => (i.title === 'Gist' ? 500 : 0))[0].title).toBe('Gist')
  })
})
