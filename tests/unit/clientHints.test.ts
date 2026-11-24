import { describe, expect, it } from 'vitest'
import { clientHintHeaders } from '@shared/clientHints'

describe('clientHintHeaders', () => {
  it('writes the low-entropy hints the way Chrome does', () => {
    const brands = [
      { brand: 'Not:A-Brand', version: '8' },
      { brand: 'Chromium', version: '156' }
    ]
    expect(clientHintHeaders(brands, false, 'macOS')).toEqual({
      'sec-ch-ua': '"Not:A-Brand";v="8", "Chromium";v="156"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"'
    })
    expect(clientHintHeaders(brands, true, 'Android')['sec-ch-ua-mobile']).toBe('?1')
  })

  it('escapes quotes and backslashes in brand names', () => {
    expect(clientHintHeaders([{ brand: 'Not"A\\Brand', version: '99' }], false, 'macOS')['sec-ch-ua']).toBe('"Not\\"A\\\\Brand";v="99"')
  })
})
