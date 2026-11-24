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

1. **A `<webview>` is never re-parented.** Moving one in the DOM reloads it, as a new page with no history. All live pages are rendered once, in `WebviewLayer`, as fixed-position elements, in a fixed order (by tab id), so switching tabs never makes React reorder them.
2. **Layout is expressed as slots.** Components that want to show a page render an invisible `<Slot name="main" | "split-a" | "split-b" | "peek" | "full">`. The slot measures itself (a `ResizeObserver`, plus a short `requestAnimationFrame` burst during animations) and publishes its rect. `useAssignments()` decides which tab occupies which slot, and each page surface positions itself over its slot. When a tab's slot changes (peek → tab, tab → split), Motion's layout animation morphs it there. The page is never unmounted, so it never reloads.

This also makes the embedding swappable. Only `browser/registry.ts` and `browser/TabView.tsx` know about `<webview>`, and slot rects map directly onto `WebContentsView.setBounds` if that switch ever happens.

## Memory

Only tabs in the `mounted` list (most-recently-used first, capped at 12) have a live page. Tabs that have been in the background longer than the sleep timer, by default 15 minutes, are unmounted and keep their last screenshot. On launch, only the active tab loads.

A mounted tab without a slot is hidden but still running, so `main/backgroundMedia.ts` pauses its video. The UI reports each tab entering or leaving view (any slot counts: the main page, either half of a split, Peek, fullscreen), and main runs a small script in every frame of that page, iframes included, since embeds are usually another origin and Gravity's preload only runs in the top frame. Video that starts while the tab is away (autoplay, a page that loads) waits too. When the tab is back, what was paused plays on. Video is paused rather than muted, so it doesn't run on past what you missed. Sound-only playback (music, podcasts, a `<video>` with no picture) keeps going, as in other browsers, and so does video in picture-in-picture; tabs making sound show a speaker in the sidebar, are never put to sleep, and can be muted.

## Security

- The UI runs with `contextIsolation`, `sandbox` and no Node integration, and it is not allowed to navigate.
- `will-attach-webview` in `main/webviews.ts` overrides every page's preferences: sandboxed, context-isolated, no Node, only Gravity's own `guest.ts` preload, a fixed partition, and only `http(s)`, `about`, `data` and `blob` URLs.
- Real popups (`window.open` with features, used by OAuth and payment flows) open as sandboxed windows so `window.opener` keeps working. Everything else becomes a tab.
- Permissions are denied by default. Camera, microphone, location, notifications and similar requests show a prompt, and decisions are remembered per origin (except in private spaces). On macOS, the system camera and microphone prompts are asked for as well.
- The user agent names Gravity (`… Gravity/0.1.0 Chrome/… Safari/537.36`) and drops only the `Electron/…` token. Google sign-in rejects Electron that poses as stock Chrome, because its scripts can tell the difference, but accepts a browser that names itself, as Edge and Opera do. Electron doesn't send the `Sec-CH-UA` client hints, so `main/clientHints.ts` adds them from Chromium's own `navigator.userAgentData`, keeping headers and script in agreement.

## Tunnel

`main/tunnel.ts` runs the bundled `tor` (fetched by `scripts/fetch-tor.mjs` into `resources/tor/<arch>`, packaged as `Contents/Resources/tor`) as a local SOCKS5 proxy and points sessions at it with `session.setProxy`. Gravity runs no server; traffic leaves through the Tor network.

- **What goes through it.** `private` covers the private partition, `all` covers both partitions, and either one also covers the default session: Gravity's own requests (`net.fetch`) and the favicons the UI draws.
- **Isolation.** Each session gets its own SOCKS port, and tor never puts streams from different ports on one circuit.
- **No leaks.** With SOCKS5, Chromium resolves host names at the exit. Covered web contents get the `disable_non_proxied_udp` WebRTC policy. Sessions are switched to tor before it is ready and have no direct fallback, so when tor is down, requests fail instead of going out directly.
- **Lifecycle.** tor starts with no torrc and its own data directory (`userData/tor`), and `__OwningControllerProcess` makes it exit with Gravity. If it crashes, it restarts up to three times. Its bootstrap log drives the status shown in Settings and the sidebar badge.
- **Bridges.** Networks block different things, so tor tries transports in turn: direct, then Snowflake (needs UDP), then meek (ordinary-looking HTTPS to a CDN, slow but hard to block). Bridges run through the bundled `lyrebird`, with bridge lines from the Tor Project's `pt_config.json`, which ships next to tor and updates with it. Tor's public obfs4 bridges are left out: on networks that block Tor they were blocked too, and meek covers the rest. A transport that makes no bootstrap progress for 20 s (direct), 45 s (Snowflake) or 60 s (meek) gives way to the next. Past 25% it has already got through and is only downloading the directory, slowly over a bridge, so it gets two minutes. Single "Problem bootstrapping" warnings don't count, because they're normal on IPv4-only networks. `always` skips direct, and `never` uses only direct.
- **Networks.** What worked is saved per network (keyed by its IPv4 subnets) in `userData/tunnel.json`, and that transport is tried first there next time. Changing the Bridge setting starts again from the top. The interface addresses are polled every 4 s, and again just after waking up; when they change, tor reconnects for the new network. Without this, a Mac that slept on one network and woke on another that blocks Tor kept a dead connection.

## Passwords

`main/passwords.ts` is the vault. Entries and the never-save list are one JSON document, encrypted with `safeStorage` (its key lives in the macOS keychain) and written atomically to `passwords.json` with mode 600. If the keychain can't encrypt, or the file can't be decrypted, the vault is unavailable and nothing is written, so a vault is never overwritten or stored in plain text.

- **The UI** (`features/passwords`) only manages the vault from Gravity's own window and only while it's unlocked: Touch ID where the Mac has it, then five idle minutes, and closing Settings locks it again. Lists carry no passwords; one is fetched only to show, copy or edit it.
- **Pages.** `preload/autofill.ts` runs in the guest preload's isolated world. It finds sign-in forms, asks main for credentials, fills the most recently used one with the native value setter (so React and friends see the change), and offers the others in a closed shadow-root picker. Sign-up and change-password forms are never filled. Main answers only top-level frames of Gravity's own `<webview>`s and reads the page address from the frame itself; `shared/passwords.ts` matches a site and its subdomains, never look-alikes, and keeps https passwords off plain http.
- **Saving.** A submitted form (submit, Enter, or a sign-in button) reports the username and password to main, which decides between nothing, save and update, keeps the password itself, and sends the UI only the site and username for the prompt. Two-step sign-ins remember the username from the first step. Private spaces and sites on the never list are never offered.

## Shortcuts

Keyboard shortcuts are native menu accelerators (`main/menu.ts`) forwarded to the renderer over IPC. Accelerators fire even while focus is inside a web page, which a renderer `keydown` handler can't see. The `⌘` hold for the cheatsheet and `esc` inside Peek reach the UI through `before-input-event`.

The Edit menu's Undo, Redo, Cut, Copy, Paste and Select All are standard roles, so they act on whatever Chromium has focused. A hidden `<webview>` keeps focus, so `browser/usePageFocus.ts` gives the keyboard to the page on screen whenever the active tab changes, and back to it when the Command Bar, the Overview or Settings closes. Text fields in Gravity's own UI keep it.

## Trackpad gestures

Two-finger swipes are scrolls, so they reach the page: `guest.ts` reports horizontal overscroll to the UI, which goes back or forward.

A pinch never reaches the page. Chromium treats a `<webview>` like an iframe and hands touchpad pinch to the outermost frame, which is the UI. It arrives there as `wheel` events with `ctrlKey` set, aimed at the `<webview>` element, with `deltaY = -100 · ln(scale)`. This is why Gravity doesn't use Chromium's own pinch (visual) zoom: `setVisualZoomLevelLimits` would magnify the whole window, sidebar included. (It also means pages that handle pinch themselves, like maps, don't get it.) Instead, `TabView` passes those events to `features/pinch`, which turns them into the tab's page zoom, the same zoom `⌘+` and `⌘−` change. The page grows exactly as far as the fingers spread. Pinching in brings it back down to 100% and stops there, as in Safari. A pinch that starts at or below 100% and closes the fingers to two thirds of their spread opens the Overview. The gesture math is in `shared/zoom.ts`. The wheel events carry no begin or end, so a gesture ends after 450 ms without events, and holding an armed pinch still for 160 ms opens the Overview.

## Persistence

`main/store.ts` is a small JSON store with debounced, atomic writes (write to a temp file, then rename). Separate files hold the session, history (capped at 20k entries, ranked by frecency), favorites, archive, settings and permission decisions. Private spaces and Peek tabs are never written.

Each space has its own favorites (`favorites.json`, keyed by space id, at most 12 per space; private spaces' lists stay in memory, and a list from before spaces had their own is copied into every space). The active space's list is behind three views: the sidebar tiles, the row on Home (`features/newtab/HomePins.tsx`) and a Command Bar group. The rules live in `shared/favorites.ts`: two addresses are the same favorite if they differ only in scheme, `www`, a trailing slash or the fragment, and a favorite on a site's home page covers the whole site, so opening it goes back to a tab already there. A favorite added by typing its address has no title or icon yet; `browser/favorites.ts` fills them in from the first page it opens. Private spaces teach it nothing.

## The black hole

`features/blackhole/shader.ts` ray traces a Schwarzschild black hole per pixel in WebGL2. Rays follow the closed-form null-geodesic equation `x'' = -3/2 h² x / r⁵` (Schwarzschild radius = 1) with a velocity-Verlet integrator and adaptive steps. Disk light uses a Shakura–Sunyaev temperature profile, Keplerian orbits, relativistic Doppler beaming and gravitational redshift, mapped through a blackbody colour and an ACES tone curve.

Two details keep it clean at a reduced internal resolution, which adapts to the GPU between 0.3 and 0.9 CSS px:
- Pixels whose impact parameter is near the critical value `3√3/2` (the shadow's edge) take four rotated-grid samples. Everything else takes one.
- The photon ring is drawn analytically from the impact parameter, so it's a perfect, anti-aliased circle at any resolution.

`BlackHole.tsx` owns the WebGL context, a smoothed orbit camera and the render loop. The loop pauses while the hole is covered or hidden, and in Still mode it only redraws when something changes. Interactive instances publish a camera controller in `features/blackhole/store.ts`, so overlays can steer them. The same store carries `flare()`, which closing tabs triggers.

## Scenes

Settings → Background chooses what is behind Home and the Overview. Settings holds the default; a space can keep its own (`Space.background`, saved with the session), and `features/scenes/background.ts` resolves which one shows. A change shows at once in the current space; then, per Settings → Apply to (`backgroundScope`), a small card under the picker asks whether every space should have it, or it goes straight to this space or to all of them (which clears the spaces' own). Besides the black hole there are four painted scenes in `features/scenes`, each a single fragment shader drawn by `ShaderScene.tsx` (one WebGL context, 30fps, paused while hidden or covered, a still frame in Still mode or with reduced motion, the line drawing when Off). Mountains, dunes and forest are photographs (`photo.ts`, credits in the README): the frame drifts very slowly, the photo's own fog flows where it has any (bright, colourless areas slide downwind in two staggered phases that cross-fade, so nothing jumps), and nothing is drawn over the picture. The great wave is Hokusai's print (`wave.ts`), with only its water heaving.

Each painted scene has a day and a night, eased across by the `uNight` uniform. The dunes cross to a night photo; the mountains' and the forest's day photos are graded down to moonlight instead, so their mist and snow stay. Mountains has a choice of photos (`MOUNTAINS` in `scenes.ts`, Settings → Background opens them beneath the picker), and the Milky Way can take the night instead (`mountainPhoto`, `mountainStars`). Each choice is its own scene, so changing it crossfades to a fresh canvas. Settings → Time of day picks Auto, Day or Night. Auto is `features/scenes/daylight.ts`: it asks for the location through `navigator.geolocation` (macOS location services, only while a painted scene is showing), coarsens it to 0.1° and keeps it in memory, and works out the sun's elevation with `shared/sun.ts`. Until a location arrives, or if it's refused, the time zone's main city stands in (`shared/timezones.ts`, from the tz database's `zone.tab`); with no usable time zone, 07:00 to 19:00 is day. Nothing about the location leaves the Mac.

## Motion

All movement uses the presets in `renderer/src/lib/springs.ts`. `snappy` is for small controls, `gentle` for panels, `heavy` for pages and cards, `settle` for things landing, and `morph` for shared-element transitions. Things leaving the screen use `fallEase`, an accelerating curve, so they fall rather than fade. The app is wrapped in `<MotionConfig reducedMotion>`, controlled by Settings → Motion, which follows the system preference by default.

## Testing

- `tests/unit`: Vitest for URL parsing, the calculator, ranking, the tab/space store, favorites, password matching and generation, and the sun's position.
- `tests/e2e`: Playwright drives the built app against a local test site: Command Bar, tabs, Overview, Peek → tab, split, find, focus mode, settings, a new space, session restore and onboarding. `pinch.spec.ts` sends real trackpad pinches and swipes through Chromium's synthetic gestures, which on macOS take the same path as the trackpad. `scenes.spec.ts` picks every background, switches Day and Night and checks the sky really gets darker, and checks that Auto agrees with `shared/sun.ts`. `favorites.spec.ts` adds favorites from a page and from Home, opens, reorders (keys and dragging), removes and restores them, then photographs Home over every background. `passwords.spec.ts` adds a password, checks the sign-in page fills itself in, saves and updates sign-ins from the prompt, and checks the file on disk is ciphertext. `media.spec.ts` plays a looping video and checks it pauses when its tab leaves view (also inside a cross-origin iframe), plays on when it's back, and keeps playing in a split and under Peek, while sound-only audio carries on. `editing.spec.ts` types into a page, switches tabs (with ⌘1 and the sidebar) and navigates, and checks the keyboard is on the page on screen, that page wasn't reloaded while away, and ⌘Z, ⇧⌘Z and ⌘A still work there and in the Command Bar. `packaged.spec.ts` runs the same smoke test against a packaged `.app` when `GRAVITY_APP` is set.
