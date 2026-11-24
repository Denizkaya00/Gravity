import { describe, expect, it } from 'vitest'
import { calculate, formatNumber } from '@shared/calc'

describe('calculate', () => {
  it('does arithmetic with precedence', () => {
    expect(calculate('2+3*4')).toBe(14)
    expect(calculate('(2+3)*4')).toBe(20)
    expect(calculate('2^3^2')).toBe(512)
    expect(calculate('-3 + 5')).toBe(2)
    expect(calculate('10 % 4')).toBe(2)
  })

  it('knows a few functions and constants', () => {
    expect(calculate('sqrt(16)')).toBe(4)
    expect(calculate('2*pi')).toBeCloseTo(Math.PI * 2)
  })

  it('ignores things that are not calculations', () => {
    expect(calculate('42')).toBeNull()
    expect(calculate('hello')).toBeNull()
    expect(calculate('example.com')).toBeNull()
    expect(calculate('1/0')).toBeNull()
    expect(calculate('alert(1)')).toBeNull()
  })

  it('formats results', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
  })
})
