# Architecture

Gravity is an Electron app with three kinds of process code and one unusual rendering decision. This note covers both.

```
src/
  main/        Electron main process: window, menu, sessions, stores, Shield, downloads, permissions
  preload/     index.ts → the typed `window.gravity` API for the UI
               guest.ts → the only script injected into web pages (swipe + Peek clicks)
  shared/      Types, IPC channel names, URL parsing, calculator, ranking. Used by both sides and unit-tested.
  renderer/    The browser chrome, written in React
    browser/   Live pages: registry, TabView, WebviewLayer, slots, page overlays
    chrome/    Sidebar, tabs, address field, spaces, favorites
    features/  Command Bar, Overview, Peek, find, downloads, settings, onboarding…
    state/     Zustand stores: browser (persisted), runtime (per-tab, ephemeral), ui, settings
```

## Pages are DOM elements

Each tab is an Electron `<webview>`. Electron recommends `WebContentsView` for new projects, and that is the better choice for most apps. It draws pages as native layers *above* the UI, though, so the UI can't clip, scale, blur or animate a live page. Gravity's interaction model depends on exactly that, so it uses `<webview>`, where a page is an out-of-process iframe inside the DOM.

A spike on Electron 45 confirmed that a live `<webview>` handles `transform`, `border-radius` clipping and `backdrop-filter` overlays correctly.

Two rules keep this reliable:

1. **A `<webview>` is never re-parented.** Moving one in the DOM reloads it. All live pages are rendered once, in `WebviewLayer`, as fixed-position elements.
2. **Layout is expressed as slots.** Components that want to show a page render an invisible `<Slot name="main" | "split-a" | "split-b" | "peek" | "full">`. The slot measures itself (a `ResizeObserver`, plus a short `requestAnimationFrame` burst during animations) and publishes its rect. `useAssignments()` decides which tab occupies which slot, and each page surface positions itself over its slot. When a tab's slot changes (peek → tab, tab → split), Motion's layout animation morphs it there. The page is never unmounted, so it never reloads.

This also makes the embedding swappable. Only `browser/registry.ts` and `browser/TabView.tsx` know about `<webview>`, and slot rects map directly onto `WebContentsView.setBounds` if that switch ever happens.

## Memory

Only tabs in the `mounted` list (most-recently-used first, capped at 12) have a live page. Tabs that have been in the background longer than the sleep timer, by default 15 minutes, are unmounted and keep their last screenshot. On launch, only the active tab loads.

## Security

- The UI runs with `contextIsolation`, `sandbox` and no Node integration, and it is not allowed to navigate.
- `will-attach-webview` in `main/webviews.ts` overrides every page's preferences: sandboxed, context-isolated, no Node, only Gravity's own `guest.ts` preload, a fixed partition, and only `http(s)`, `about`, `data` and `blob` URLs.
- Real popups (`window.open` with features, used by OAuth and payment flows) open as sandboxed windows so `window.opener` keeps working. Everything else becomes a tab.
- Permissions are denied by default. Camera, microphone, location, notifications and similar requests show a prompt, and decisions are remembered per origin (except in private spaces). On macOS, the system camera and microphone prompts are asked for as well.
- The user agent drops the `Electron/…` token, so Google sign-in and similar flows don't reject the browser as embedded.

## Shortcuts

Keyboard shortcuts are native menu accelerators (`main/menu.ts`) forwarded to the renderer over IPC. Accelerators fire even while focus is inside a web page, which a renderer `keydown` handler can't see. The `⌘` hold for the cheatsheet and `esc` inside Peek reach the UI through `before-input-event`.

## Persistence

`main/store.ts` is a small JSON store with debounced, atomic writes (write to a temp file, then rename). Separate files hold the session, history (capped at 20k entries, ranked by frecency), favorites, archive, settings and permission decisions. Private spaces and Peek tabs are never written.

## Motion

All movement uses the presets in `renderer/src/lib/springs.ts`. `snappy` is for small controls, `gentle` for panels, `heavy` for pages and cards, `settle` for things landing, and `morph` for shared-element transitions. Things leaving the screen use `fallEase`, an accelerating curve, so they fall rather than fade. The app is wrapped in `<MotionConfig reducedMotion>`, controlled by Settings → Motion, which follows the system preference by default.

## Testing

- `tests/unit`: Vitest for URL parsing, the calculator, ranking and the tab/space store.
- `tests/e2e`: Playwright drives the built app against a local test site: Command Bar, tabs, Overview, Peek → tab, split, find, focus mode, settings, a new space, session restore and onboarding. `packaged.spec.ts` runs the same smoke test against a packaged `.app` when `GRAVITY_APP` is set.
