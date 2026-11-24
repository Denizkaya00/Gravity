# Contributing

Thanks for taking a look. Gravity is small and opinionated, so please open an issue to talk through larger changes before writing them.

## Setup

macOS, Node 22+.

```bash
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run test:e2e
```

## Code

- TypeScript everywhere, strict mode.
- Main-process code lives in `src/main`. Anything both sides need (types, IPC names, pure logic) goes in `src/shared` and gets a unit test.
- IPC channel names are defined once in `src/shared/ipc.ts`. The renderer only talks to the main process through `window.gravity` (`src/preload/index.ts`).
- Only `src/renderer/src/browser/registry.ts` and `TabView.tsx` may touch a `<webview>` directly. Everything else goes through `page.*` helpers. See `docs/ARCHITECTURE.md` for why.
- State goes in the Zustand stores under `src/renderer/src/state`. Put persisted data in `browser.ts` and anything per-page and temporary in `runtime.ts`.

## Design rules

The look is deliberate. Please keep to it:

- **Colour.** Neutrals do the work: graphite and paper surfaces, `--hairline` borders. The accent (`--accent`) is used sparingly: the active tab tick, the selected command, the loading beam. No gradients on chrome, no saturated colours, no glows.
- **Type.** System sans for content. Monospace (`font-mono`, or the `.label` class) for URLs, counts, keyboard keys and small uppercase labels.
- **Shape.** Radii of 6 to 12 px. 1 px borders. Shadows come from `var(--shadow)` only.
- **Motion.** Use the presets in `lib/springs.ts`. Don't add new ones casually. Movement should explain something: where a page came from, where it went. Avoid bounce for its own sake, rotation, confetti and particles. Everything must still work with reduced motion.
- **Words.** Plain sentences, no exclamation marks, no emoji in the UI.

## Components

Some primitives come from Magic UI and React Bits through the shadcn CLI:

```bash
npx shadcn@latest add "https://magicui.design/r/<name>.json"
npx shadcn@latest add "@react-bits/<Name>-TS-TW"
```

Check `components.json` first, because it decides where files land. Restyle anything you pull in to fit the rules above before using it.

## Commits and pull requests

Small, focused commits with messages in the imperative ("Add history scrubber"). For UI changes, include a before/after screenshot or a short recording in the pull request.
