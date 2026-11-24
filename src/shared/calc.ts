/**
 * A tiny, safe arithmetic evaluator for the Command Bar (no eval, no Function).
 * Grammar:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/' | '%') factor)*
 *   factor := unary ('^' factor)?
 *   unary  := ('-' | '+') unary | call
 *   call   := ident '(' expr ')' | primary
 *   primary:= number | ident | '(' expr ')'
 */

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 }

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === ',') {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9._]/.test(src[j])) j++
      const n = Number(src.slice(i, j).replace(/_/g, ''))
      if (Number.isNaN(n)) return null
      out.push({ t: 'num', v: n })
      i = j
      continue
    }
    if (/[a-z]/i.test(c)) {
      let j = i
      while (j < src.length && /[a-z]/i.test(src[j])) j++
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() })
      i = j
      continue
    }
    if ('+-*/%^()×÷'.includes(c)) {
      out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c })
      i++
      continue
    }
    return null
  }
  return out
}

class Parser {
  private i = 0
  constructor(private toks: Tok[]) {}

  parse(): number {
    const v = this.expr()
    if (this.i !== this.toks.length) throw new Error('trailing')
    return v
  }
  private peek(): Tok | undefined {
    return this.toks[this.i]
  }
  private isOp(v: string): boolean {
    const t = this.peek()
    return !!t && t.t === 'op' && t.v === v
  }
  private expr(): number {
    let v = this.term()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.toks[this.i++] as { v: string }).v
      const r = this.term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  private term(): number {
    let v = this.factor()
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.toks[this.i++] as { v: string }).v
      const r = this.factor()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  private factor(): number {
    const base = this.unary()
    if (this.isOp('^')) {
      this.i++
      return Math.pow(base, this.factor())
    }
    return base
  }
  private unary(): number {
    if (this.isOp('-')) {
      this.i++
      return -this.unary()
    }
    if (this.isOp('+')) {
      this.i++
      return this.unary()
    }
    return this.call()
  }
  private call(): number {
    const t = this.peek()
    if (t && t.t === 'id') {
      this.i++
      if (t.v in FUNCS) {
        if (!this.isOp('(')) throw new Error('call')
        this.i++
        const v = this.expr()
        if (!this.isOp(')')) throw new Error('paren')
        this.i++
        return FUNCS[t.v](v)
      }
      if (t.v in CONSTS) return CONSTS[t.v]
      throw new Error('ident')
    }
    return this.primary()
  }
  private primary(): number {
    const t = this.peek()
    if (!t) throw new Error('eof')
    if (t.t === 'num') {
      this.i++
      return t.v
    }
    if (this.isOp('(')) {
      this.i++
      const v = this.expr()
      if (!this.isOp(')')) throw new Error('paren')
      this.i++
      return v
    }
    throw new Error('unexpected')
  }
}

/**
 * Evaluates `input` if it is clearly a calculation. Returns null for plain
 * numbers, words, or anything that is not maths, so the Command Bar only
 * shows a result row when it is useful.
 */
export function calculate(input: string): number | null {
  const src = input.trim().replace(/^=/, '')
  if (!src || src.length > 120) return null
  // Must contain an operator or a function call to count as a calculation.
  if (!/[+\-*/%^×÷]|[a-z]+\(/i.test(src)) return null
  if (/^[a-z]+$/i.test(src)) return null
  const toks = tokenize(src)
  if (!toks || toks.length < 2) return null
  try {
    const v = new Parser(toks).parse()
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  const fixed = Number(n.toPrecision(12))
  return fixed.toLocaleString('en-US', { maximumFractionDigits: 10 })
}
