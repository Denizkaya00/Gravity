import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const stores = new Set<JsonStore<unknown>>()

/**
 * A small JSON file store in `userData`. Writes are debounced and atomic
 * (write a temp file, then rename), so a crash never leaves a half-written file.
 */
export class JsonStore<T> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  readonly file: string

  constructor(
    name: string,
    private readonly fallback: () => T,
    private readonly delay = 400
  ) {
    const dir = process.env.GRAVITY_USER_DATA ?? app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.file = join(dir, `${name}.json`)
    this.data = this.read()
    stores.add(this as JsonStore<unknown>)
  }

  private read(): T {
    try {
      if (existsSync(this.file)) return JSON.parse(readFileSync(this.file, 'utf8')) as T
    } catch (err) {
      console.warn(`[store] ${this.file} is unreadable, starting fresh`, err)
    }
    return this.fallback()
  }

  get(): T {
    return this.data
  }

  set(next: T): void {
    this.data = next
    this.schedule()
  }

  update(fn: (current: T) => T): T {
    this.data = fn(this.data)
    this.schedule()
    return this.data
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.delay)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data))
      renameSync(tmp, this.file)
    } catch (err) {
      console.error(`[store] failed to write ${this.file}`, err)
    }
  }
}

export function flushAllStores(): void {
  for (const s of stores) s.flush()
}
