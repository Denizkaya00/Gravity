export interface UABrand {
  brand: string
  version: string
}

/** Structured-header string value, as Chrome writes them: "macOS", "Chromium". */
function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * The low-entropy client hints Chrome sends with every secure request, built
 * from navigator.userAgentData so headers and script always agree:
 *   sec-ch-ua: "Not:A-Brand";v="8", "Chromium";v="156"
 *   sec-ch-ua-mobile: ?0
 *   sec-ch-ua-platform: "macOS"
 */
export function clientHintHeaders(brands: UABrand[], mobile: boolean, platform: string): Record<string, string> {
  return {
    'sec-ch-ua': brands.map((b) => `${quote(b.brand)};v=${quote(b.version)}`).join(', '),
    'sec-ch-ua-mobile': mobile ? '?1' : '?0',
    'sec-ch-ua-platform': quote(platform)
  }
}
