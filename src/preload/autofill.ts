/// <reference lib="dom" />
/**
 * Password autofill and capture, inside web pages.
 *
 * Runs in the guest preload's isolated world, so the page's scripts can't reach this code
 * or the list of saved sign-ins. Main decides which sign-ins a page gets from the page's
 * real address; this side only finds the fields, fills them, and reports a submitted
 * sign-in so Gravity can offer to save it.
 */
import { ipcRenderer } from 'electron'
import { GUEST_IPC } from '../shared/ipc'

interface Cred {
  id: string
  username: string
  password: string
}

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
const TEXTISH = new Set(['text', 'email', 'tel'])
const USERNAME_HINT = /user|email|e-mail|login|identifier|account|phone|mail/i
const SUBMIT_TEXT = /log\s?in|sign\s?in|continue|next|submit|giri[sş]|anmelden|connexion|iniciar|entrar|accedi|inloggen|войти/i

let creds: Cred[] | null = null
let asking: Promise<Cred[]> | null = null
let filledOnce = false

function isWeb(): boolean {
  return location.protocol === 'https:' || location.protocol === 'http:'
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  const st = getComputedStyle(el)
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05
}

function usable(el: HTMLInputElement): boolean {
  return !el.disabled && !el.readOnly && visible(el)
}

function passwordFields(scope: ParentNode = document): HTMLInputElement[] {
  return [...scope.querySelectorAll<HTMLInputElement>('input[type=password]')].filter(usable)
}

/** Sign-up and change-password forms: never fill those with a saved password. */
function isNewPassword(pw: HTMLInputElement): boolean {
  if (/new-password/i.test(pw.autocomplete)) return true
  return passwordFields(pw.form ?? document).length > 1
}

function looksLikeUsername(el: HTMLInputElement): boolean {
  if (/\busername\b|\bemail\b|webauthn/i.test(el.autocomplete)) return true
  if (el.type === 'email') return true
  return USERNAME_HINT.test(`${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`)
}

/** The username field that goes with a password field: tagged, or the last text field before it. */
function usernameFieldFor(pw: HTMLInputElement): HTMLInputElement | null {
  const scope: ParentNode = pw.form ?? document
  const inputs = [...scope.querySelectorAll<HTMLInputElement>('input')].filter((el) => TEXTISH.has(el.type) && usable(el))
  const before = inputs.filter((el) => el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)
  const tagged = before.find((el) => /\busername\b/i.test(el.autocomplete)) ?? inputs.find((el) => /\busername\b/i.test(el.autocomplete))
  return tagged ?? before.filter(looksLikeUsername).pop() ?? before.pop() ?? null
}

/** A username field on the first page of a two-step sign-in (no password field yet). */
function lonelyUsernameField(strict = false): HTMLInputElement | null {
  const tagged = [...document.querySelectorAll<HTMLInputElement>('input')].find(
    (el) => TEXTISH.has(el.type) && usable(el) && /\busername\b|webauthn/i.test(el.autocomplete)
  )
  if (tagged || strict) return tagged ?? null
  return (
    [...document.querySelectorAll<HTMLInputElement>('input[type=email]')].find(
      (el) => usable(el) && USERNAME_HINT.test(`${el.name} ${el.id} ${el.autocomplete}`)
    ) ??
    null
  )
}

function setValue(el: HTMLInputElement, value: string): void {
  if (el.value === value) return
  // The native setter, so frameworks that wrap `value` (React and friends) see a change.
  if (valueSetter) valueSetter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function loadCreds(): Promise<Cred[]> {
  if (creds) return Promise.resolve(creds)
  asking ??= ipcRenderer
    .invoke(GUEST_IPC.credentials)
    .then((list: unknown) => (creds = Array.isArray(list) ? (list as Cred[]) : []))
    .catch(() => (creds = []))
  return asking
}

/** Fills one sign-in into the form around `field`. `force` replaces what's already typed. */
function fill(cred: Cred, field: HTMLInputElement, force: boolean): void {
  const pw = field.type === 'password' ? field : passwordFields(field.form ?? document)[0]
  const user = pw ? usernameFieldFor(pw) : field
  if (pw && isNewPassword(pw)) return
  if (user && cred.username && (force || !user.value)) setValue(user, cred.username)
  if (pw && (force || !pw.value)) setValue(pw, cred.password)
  ipcRenderer.send(GUEST_IPC.filled, cred.id)
}

/* ------------------------------------------------------------- picker */

let picker: { host: HTMLElement; root: ShadowRoot; field: HTMLInputElement } | null = null

const PICKER_CSS = `
:host { all: initial; position: fixed; z-index: 2147483647; }
.box { font: 12.5px/1.3 -apple-system, BlinkMacSystemFont, sans-serif; min-width: 220px; max-width: 320px;
  background: rgb(251 250 247 / 0.98); color: rgb(28 27 25); border: 1px solid rgb(40 32 20 / 0.14);
  border-radius: 9px; padding: 4px; box-shadow: 0 10px 30px rgb(0 0 0 / 0.18); }
.head { padding: 5px 8px 4px; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: rgb(28 27 25 / 0.45); }
button { all: unset; box-sizing: border-box; display: flex; width: 100%; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 6px; cursor: default; }
button:hover, button:focus-visible { background: rgb(40 32 20 / 0.07); }
.user { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dots { color: rgb(28 27 25 / 0.4); letter-spacing: 1px; }
@media (prefers-color-scheme: dark) {
  .box { background: rgb(27 26 24 / 0.98); color: rgb(232 228 220); border-color: rgb(255 250 240 / 0.12); }
  .head, .dots { color: rgb(232 228 220 / 0.42); }
  button:hover, button:focus-visible { background: rgb(255 250 240 / 0.08); }
}`

function hidePicker(): void {
  picker?.host.remove()
  picker = null
}

function placePicker(): void {
  if (!picker) return
  if (!picker.field.isConnected) return hidePicker()
  const r = picker.field.getBoundingClientRect()
  picker.host.style.left = `${Math.max(4, r.left)}px`
  picker.host.style.top = `${r.bottom + 4}px`
}

function showPicker(field: HTMLInputElement, list: Cred[]): void {
  if (picker?.field === field) return
  hidePicker()
  const host = document.createElement('gravity-autofill')
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = PICKER_CSS
  const box = document.createElement('div')
  box.className = 'box'
  const head = document.createElement('div')
  head.className = 'head'
  head.textContent = 'Saved in Gravity'
  box.append(head)
  for (const cred of list) {
    const b = document.createElement('button')
    b.type = 'button'
    const user = document.createElement('span')
    user.className = 'user'
    user.textContent = cred.username || '(no username)'
    const dots = document.createElement('span')
    dots.className = 'dots'
    dots.textContent = '••••••'
    b.append(user, dots)
    // mousedown, not click, so the field keeps its focus.
    b.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      fill(cred, field, true)
      hidePicker()
    })
    box.append(b)
  }
  root.append(style, box)
  document.documentElement.append(host)
  picker = { host, root, field }
  placePicker()
}

function onFocus(e: FocusEvent): void {
  const el = e.target
  if (!(el instanceof HTMLInputElement) || !creds?.length) return
  const isPw = el.type === 'password'
  if (isPw && isNewPassword(el)) return
  if (!isPw) {
    if (!TEXTISH.has(el.type)) return
    const pw = passwordFields(el.form ?? document)[0]
    const belongs = pw ? usernameFieldFor(pw) === el : el === lonelyUsernameField()
    if (!belongs) return
  }
  // One sign-in that's already in place: nothing to choose.
  const pw = isPw ? el : passwordFields(el.form ?? document)[0]
  if (creds.length === 1 && pw?.value === creds[0].password) return
  showPicker(el, creds)
}

/* ------------------------------------------------------------ autofill */

async function scan(): Promise<void> {
  if (!isWeb()) return
  const pw = passwordFields().find((el) => !isNewPassword(el))
  // Without a password field, only a field the site marks as a username gets filled
  // unasked, so a newsletter box never does.
  const field = pw ?? lonelyUsernameField(true)
  if (!field) return
  const list = await loadCreds()
  if (!list.length || filledOnce) return
  filledOnce = true
  // The most recently used sign-in goes in; the picker offers the others.
  fill(list[0], field, false)
}

let scanTimer: number | null = null
function scheduleScan(): void {
  if (scanTimer !== null) return
  scanTimer = window.setTimeout(() => {
    scanTimer = null
    void scan()
  }, 350)
}

/* ------------------------------------------------------------- capture */

/** The password a submitted form is setting: a repeated value (new + confirm), a tagged one, or the only one. */
function chosenPassword(fields: HTMLInputElement[]): HTMLInputElement | null {
  const filled = fields.filter((el) => el.value)
  if (!filled.length) return null
  const repeated = filled.find((el, i) => filled.some((o, j) => j !== i && o.value === el.value))
  return repeated ?? filled.find((el) => /new-password/i.test(el.autocomplete)) ?? filled[0]
}

function capture(scope: HTMLElement | null): void {
  if (!isWeb()) return
  const form = scope instanceof HTMLFormElement ? scope : (scope?.closest('form') ?? null)
  const fields = [...(form ?? document).querySelectorAll<HTMLInputElement>('input[type=password]')]
  const pw = chosenPassword(fields)
  if (pw) {
    const user = usernameFieldFor(pw)
    ipcRenderer.send(GUEST_IPC.submitted, { username: user?.value ?? '', password: pw.value })
    return
  }
  // The first step of a two-step sign-in: remember who is signing in.
  const user = lonelyUsernameField()
  if (user?.value) ipcRenderer.send(GUEST_IPC.username, user.value)
}

function looksLikeSubmit(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.type === 'submit' || el.type === 'image'
  if (el instanceof HTMLButtonElement && el.type === 'submit' && el.form) return true
  const text = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('value') ?? ''}`
  return text.length < 60 && SUBMIT_TEXT.test(text)
}

/* ---------------------------------------------------------------- wiring */

export function installAutofill(): void {
  if (!isWeb()) return
  const start = () => {
    void scan()
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
  window.addEventListener('load', scheduleScan, { once: true })

  document.addEventListener('focusin', onFocus, true)
  document.addEventListener(
    'focusout',
    (e) => {
      if (picker && e.target === picker.field) setTimeout(() => picker?.field !== document.activeElement && hidePicker(), 120)
    },
    true
  )
  window.addEventListener('scroll', placePicker, { passive: true, capture: true })
  window.addEventListener('resize', placePicker, { passive: true })

  window.addEventListener('submit', (e) => capture(e.target as HTMLElement), true)
  window.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, input[type=submit], input[type=image], [role=button]')
      if (el && looksLikeSubmit(el)) capture(el as HTMLElement)
    },
    true
  )
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') hidePicker()
      if (e.key !== 'Enter' || e.isComposing) return
      const el = e.target
      if (el instanceof HTMLInputElement && (el.type === 'password' || TEXTISH.has(el.type))) capture(el)
    },
    true
  )
}
