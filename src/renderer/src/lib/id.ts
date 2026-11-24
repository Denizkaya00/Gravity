let n = 0
export function uid(prefix = 't'): string {
  n = (n + 1) % 1_000_000
  return `${prefix}${Date.now().toString(36)}${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
