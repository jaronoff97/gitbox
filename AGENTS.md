# AGENTS.md

This is a gpuix-svelte app: Svelte 5 components rendered
into a native desktop window by GPUI, the GPU-accelerated UI framework behind the Zed editor. It runs
on Node.js >= 24 or Bun >= 1.4.

## Documentation

GPUI's elements, styling and events follow their own rules, so read the docs before writing UI code.
Fetch https://gpuix-svelte.stanislav.garden/llms.txt, then the pages it links for the task at hand.

## Commands

```bash
npm start            # opens the window; saving a .svelte file hot-reloads it
npm test             # headless test (test.ts) through GPUI's real hit testing; macOS and Windows
npm run typecheck    # tsc, then svelte-check against GPUI's element types
npm run build        # dist/app (dist/app.exe on Windows): the app as one executable; needs Bun
```

With Bun: `bun run start`, `bun run test`. After a change, run `npm run typecheck` and `npm test`.
To see what the window draws, run `GPUIX_SCREENSHOT=/tmp/app.png npm start`: it writes a PNG after
every mount and hot reload.

## Building

**Building standalone executables requires Bun** (>= 1.4), even in a project that uses npm and Node.

`npm run build` runs `build.ts`, which compiles `standalone.ts` with Bun into a single executable
(about 95 MB) that carries the Bun runtime, Svelte and the GPUI addon.

- The executable is for the platform it was built on: macOS arm64, Windows x64 or Linux x64, the
  three GPUI ships prebuilt. To release for all three, run `npm run build` on each, for example in a
  GitHub Actions matrix over `macos-latest`, `windows-latest` and `ubuntu-latest`.
- `standalone.ts` mounts `App.svelte` with `render` and a static import, since a binary has no
  source files to hot-reload. Keep its window options in step with `app.ts`.
- macOS keeps a downloaded, unsigned executable from opening until it is allowed under System
  Settings → Privacy & Security. Signing, notarizing and wrapping it as a `.app` are covered on the
  Shipping page of the docs.

## Writing components

- Elements are GPUI's: `div`, `text`, `img`, `svg`, `input`, `textarea`, `code`, `markdown`,
  `virtual-list`, `anchored`. `<img src>` takes a file path, a `data:` URL or an http(s) URL, plus
  a width and a height.
- Style with `<style>` class rules (`.btn`, `.btn.primary`, `.btn:hover`, `.btn:active`,
  `.btn:focus-visible` with `outline-*` for the keyboard focus ring) and inline
  `style=`. Layout is flexbox in logical pixels: lengths in `px` or `rem` (16 px), and `%`/`auto` for `width`,
  `height`, `min-*` and `max-*`. Use `flex-grow: 1` for `flex: 1`, and `border-width` plus
  `border-color` for `border`. The styling page lists every property.
- Colours go in `var(--token)`, with the palette set once from the root through
  `set_css_vars({ token: '#fff' })`.
- Inputs report through events: `<input value={text} onchange={(e) => (text = e.value)} />`.
  `{@attach (node) => ...}` hands you an element.
- A click goes to the element under the pointer. Put `hitbox="self"` on a clickable element whose
  children paint a background, and it receives their clicks. `onclick` is the primary button; right
  and middle clicks are `onauxclick`.
- App-wide keyboard shortcuts: `on_window_key('keydown', handler)` from `gpuix-svelte`, returned
  from an `$effect` so it unsubscribes. Tab and Shift+Tab already move focus between `tabindex`
  elements; don't wire them to `focus_next()`, and call `e.preventDefault()` in a key handler to
  keep a Tab.
- On GNOME under Wayland, which draws no title bar for the window, `render()` draws one (title,
  minimise, maximise, close) and mounts the app in the box below it, which its `rootStyle` styles.
  `render(App, { titlebar: false })` turns it off, `true` draws it everywhere.
- Scrolling content goes in `Scroller` (`gpuix-svelte/components/Scroller.svelte`), which draws the
  scrollbar; modals, menus and toasts go in `Portal` (`gpuix-svelte/components/Portal.svelte`),
  which paints on top; hover tips and dropdowns that sit beside a trigger go in `Tooltip` and
  `Popover` from the same directory.
- State that should survive a hot reload goes in a `.svelte.ts` module; editing one needs a restart.
- Handlers take `GpuixEvent` and `{@attach}` gets a `ShadowNode`, both importable as types from
  `gpuix-svelte`.

## TypeScript

`.ts` files run through Node's and Bun's built-in type stripping, not a compiler, and `tsconfig.json`
enforces what that allows: no enums, namespaces or constructor parameter properties, `import type`
for anything that is only a type, and relative imports spelled with their extension (`./util.ts`).

## Dependencies

`gpuix-svelte` brings its own build of Svelte, the one with the custom renderer API, and resolves
every `svelte` import to it. Keep `svelte` itself out of `package.json`.

## Files

- `app.ts` — the entry: `render_hot` opens the window and remounts `App.svelte` on save. On macOS
  the title bar is transparent (`titlebarTransparent`), so the board's 52 px toolbar is the title bar
  and the traffic lights sit in it; `standalone.ts` has the same options.
- `dev.ts` — what `npm start` runs: `app.ts` as the gpuix-svelte bin would, but on macOS from a hard
  link to the runtime inside `dist/dev/Gitbox Dev.app`, so the Dock and menu bar show "Gitbox Dev"
  with the icon inverted (rendered from `assets/icon.svg` through an SVG colour filter) rather than
  "bun" or "node". `npm run build` deletes `dist/`; the next start makes it again.
- `bundle.ts` — the macOS `.app` wrapper (`Info.plist`, `.icns` from `assets/icon.png`) that
  `dev.ts` and `build.ts` share.
- `App.svelte` — the root component: the palette, then onboarding until it passes, then the board.
- `src/gh.ts` — every call to the `gh` CLI, the onboarding checks, and `open_url`. Each page of
  notifications gets its PRs' and issues' state, draft flag, author, labels and reviews from one
  batched GraphQL call (GraphQL has no notifications; `reviewDecision` is left out, as it made a
  page 4 s slower). `gh` runs with Homebrew's directories added to `PATH`, since an app started
  from Finder gets launchd's minimal one.
- `src/store.ts` — state kept between runs (`onboarded`, `settings`), as JSON in
  `$XDG_CONFIG_HOME/gitbox` (default `~/.config/gitbox/state.json`).
- `src/commands.svelte.ts` — every command in one registry (#4): id, title, menu group, keys,
  `when`, `checked`, `run`. Components `register()` theirs in an `$effect`; `listen()`, called once
  in `App.svelte`, is the only app-wide key handler (dialogs keep their own Escape/Enter). A single
  key, or a command with `skip_editing`, doesn't run while a text field has focus. `caps()` draws
  keys; `src/Shortcuts.svelte` (⌘/) lists them.
- Keyboard (#5): the board's focus is state, `{ lane, id, index }`, as most cards aren't mounted.
  j/k/h/l (or arrows) move it, ↩ opens, r/e/u/c act, Shift+F10 opens the menu (`card_nodes.ts`
  finds where the card is drawn). A key move bumps `reveal`, and the lane scrolls the card into
  view; a click does not. `src/listnav.svelte.ts` gives the filter menu and the card menu ↑↓↩.
  An `<input>` takes Enter as `onsubmit` and ⌫/← as its own editing keys (no key event), so the
  filter menu's back key is ⌘[. The settings dialog keeps Tab inside it and focuses its first
  control a tick after it mounts, when the controls exist natively.
- `src/settings.svelte.ts` — the user's settings: reactive, saved on every `update`, and read by
  `init()` when `App` mounts.
- `src/Onboarding.svelte` — runs the checks in order and shows a fix hint for a failed one.
- `src/Board.svelte` — the toolbar and a board of the signed-in user's notifications in four lanes
  (Todo, Requested, Waiting on me, Merged / Closed; `lane_of` sorts them). Each lane starts with
  `lane_size` cards; a scroll near a lane's end shows that many more in that lane only, and fetches
  API pages only if they are not loaded yet. Each lane sorts newest or oldest first by `updated_at`
  (`settings.lane_sort`); since the API sends newest first, oldest first loads the whole lane before
  it shows a card.
- `src/filters.ts` — the board filters (repository, type, state, label, reviews, review status,
  reason, author): any value of one field, and every field. `matches` is what the lanes use.
- `src/FilterMenu.svelte` — the toolbar's filter button and menu: a field, then its values with
  counts.
- `src/FilterBar.svelte` — the scope bar under the toolbar, shown while filters apply: a chip for
  each filter, Clear, and the match count.
- `src/Lane.svelte` — one lane as a windowed `<virtual-list>`: GPUI paints only the rows on screen
  and Svelte mounts only about 40 around them (`itemCount` + `windowStart`, moved by
  `onvisiblerange`). GPUI paints the thumb; a strip over it scrolls with `scrollToItem` when dragged.
  GPUI reports no visible range after `scrollToItem`, so a jump moves the window itself. Headless,
  a list draws a wheel scroll only on a later frame, so tests wheel in steps and pump.
- `src/CardActions.svelte` — the actions on cards, always on a list: a card's context menu (right
  click, or Shift+F10), the selection bar, and their dialogs (Close and opening over 10 tabs ask
  first; Comment takes the text). In `Board.svelte`, `apply()` changes the board for one card and
  returns its undo; `act()` runs one card (with a ⌘↩ toast), `bulk()` several, 4 calls at a time
  through `gh.pool`, with progress in the bar, undoing only the cards whose calls fail.
- Selection (#3) is a set of thread ids on the board, as the lanes are windowed: ⌘-click toggles,
  ⇧-click adds a range in the lane's order, ⌘A takes the lane under the pointer and then the board,
  Escape clears. Cards that a filter, refresh or sort hides leave it. The `gh` calls
  (`mark_read`, `mark_done`, `unsubscribe`, `set_state`, `comment`, `copy`) are in `src/gh.ts`;
  a comment goes to `gh` through stdin.
- `src/Toast.svelte` — short messages at the bottom of the window.
- `src/Card.svelte` — one notification; a click or Enter opens `link(n)` in the browser: the PR or
  issue, the advisory (found by its title, as advisory notifications carry no URL), or the page
  the subject's API object names.
- `src/Settings.svelte` — the settings dialog (⌘, opens it; ⌘R refreshes the board).
- `src/icons.ts` — Octicons as raw markup for `<svg source>`, which a compiled binary needs.
- `assets/icon.svg`, `assets/icon.png` — the app icon and its 1024 px render (see `build.ts`).
- `test.ts` — the headless test (`gpuix-svelte/test`); a plain script that exits 1 on failure. It
  puts a fake `gh` first on `PATH` and points `XDG_CONFIG_HOME` at a temp dir, so it needs no
  GitHub account and leaves the real saved state alone. A fake `open` and `pbcopy` sit beside it,
  and every action call goes to a log the test reads (`calls()`), so no browser opens and the
  clipboard stays as it was.
- `standalone.ts`, `build.ts` — the entry and the Bun build script behind `npm run build`; on
  macOS it also makes `dist/Gitbox.app` and a `.dmg`, signed from `CODESIGN_IDENTITY`.
- `.github/workflows/release.yml` — a `v*` tag builds the `.dmg` and attaches it to a release.
- `tsconfig.json`, `svelte.d.ts`, `svelte.config.js` — TypeScript and svelte-check setup.
