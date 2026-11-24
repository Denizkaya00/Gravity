# Ideas and roadmap

A running list. Nothing here is promised. Items are grouped by how well they fit Gravity's direction: quiet, keyboard-first, physical rather than decorative.

## Next

- **Signed and notarised releases**, with auto-update through `electron-updater` and GitHub Releases.
- **Multiple windows.** `⌘N` opens a window that shares spaces and history.
- **Import** bookmarks and history from Safari, Chrome and Arc.
- **Per-space profiles**, each with its own cookie partition. Sign into the same site twice, once in Work and once in Personal.
- **Tab groups / folders** inside a space, collapsible, with drag-to-group.
- **Picture-in-picture**, starting automatically when you leave a tab that is playing video.

## Considered

- **History scrubber.** A horizontal timeline of a tab's back/forward stack with thumbnails, opened by holding `⌘[`.
- **Shelf.** A drawer for links, images and text dragged out of pages, kept per space.
- **Reader mode** with a single, well-set typeface and adjustable measure.
- **Site settings** per origin: zoom, Shield on/off, permissions, custom CSS.
- **Mini window.** Links opened from other apps land in a small floating window first, and you choose which space they belong to.
- **Sync** through an iCloud Drive folder, without a server.
- **Native Liquid Glass** through `NSGlassEffectView` once there is a public API. The current wrappers use a private API.
- **Screenshot and annotate** a region of the page.
- **Pinch to zoom out** into the Overview.

## Not planned

- Feeds, news, sponsored tiles, or anything else on the home screen that you didn't put there.
- Built-in AI that sends page contents anywhere by default. An opt-in, bring-your-own-key summariser might happen later.
- Loud themes. Accents stay muted; see CONTRIBUTING.md.
