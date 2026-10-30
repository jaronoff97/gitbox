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

## Commits and releases

- A pull request's title is a [Conventional Commit](https://www.conventionalcommits.org):
  `type(scope): subject`, the subject in lower case and the imperative, with no full stop.
  Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`;
  scopes name the part (`chat`, `whiteboard`, `cards`…). `.github/workflows/pr-title.yml` checks it.
  Write commit messages the same way.
- PRs are squash-merged, with the title as the commit's message; only squash merges are on.
  [release-please](https://github.com/googleapis/release-please) reads those commits: `feat` raises
  the minor version, `fix` the patch, and before 1.0 a breaking change (`feat!:`, or a
  `BREAKING CHANGE:` footer) raises the minor too. Its config is `release-please-config.json`, and
  `.release-please-manifest.json` holds the released version.
- A PR description can replace its commit for the changelog with lines between
  `BEGIN_COMMIT_OVERRIDE` and `END_COMMIT_OVERRIDE`, one Conventional Commit per line.
- Stacked PRs: squash-merge from the bottom; then rebase the next branch onto `main`
  (`git rebase --onto main <old base>`), as the squash leaves its old commits behind.

## TypeScript

`.ts` files run through Node's and Bun's built-in type stripping, not a compiler, and `tsconfig.json`
enforces what that allows: no enums, namespaces or constructor parameter properties, `import type`
for anything that is only a type, and relative imports spelled with their extension (`./util.ts`).

## Dependencies

`gpuix-svelte` brings its own build of Svelte, the one with the custom renderer API, and resolves
every `svelte` import to it. Keep `svelte` itself out of `package.json`.

## Files

- `app.ts` — the entry: `render_hot` opens the window and remounts `App.svelte` on save. On macOS
  the title bar is transparent (`titlebarTransparent`), so the top 52 px of the sidebar and the
  toolbar are the title bar, and the traffic lights sit atop the sidebar; `standalone.ts` has the
  same options.
- `dev.ts` — what `npm start` runs: `app.ts` as the gpuix-svelte bin would, but on macOS from a hard
  link to the runtime inside `dist/dev/Gitbox Dev.app`, so the Dock and menu bar show "Gitbox Dev"
  with the icon inverted (rendered from `assets/icon.svg` through an SVG colour filter) rather than
  "bun" or "node". `npm run build` deletes `dist/`; the next start makes it again.
- `bundle.ts` — the macOS `.app` wrapper (`Info.plist`, `.icns` from `assets/icon.png`) that
  `dev.ts` and `build.ts` share.
- `App.svelte` — the root component: the palette, then onboarding until it passes, then a sidebar
  with three tabs (Inbox, Automations, Chat; ⌃1–⌃3). The board stays mounted while another tab
  covers it (`active={false}` hides it with `visibility: hidden` and rests its keys), so its cards
  and scroll survive a switch. `--sidebar` is the sidebar's width; toasts and the selection bar
  centre beside it.
- `src/gh.ts` — every call to the `gh` CLI, the onboarding checks, and `open_url`. Each page of
  notifications gets its PRs' and issues' state, draft flag, author, labels and reviews from one
  batched GraphQL call (GraphQL has no notifications; `reviewDecision` is left out, as it made a
  page 4 s slower). `gh` runs with Homebrew's directories added to `PATH`, since an app started
  from Finder gets launchd's minimal one.
- `src/store.ts` — state kept between runs (`onboarded`, `settings`, `automation_log`, `repo_paths`), as JSON in
  `$XDG_CONFIG_HOME/gitbox` (default `~/.config/gitbox/state.json`); the automations themselves
  are in `automations.json` beside it.
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
- `src/Palette.svelte` — ⌘K (#6): one search over the registry's commands (that apply now), "Filter:"
  entries from `options()`, "Go to" lanes, and "Open:" notifications (⌘↩ focuses the card).
  `>`, `#`, `@` narrow it to commands, filters, authors. `src/fuzzy.ts` scores the match; the last
  5 commands run (`recent` in state.json) lead the empty palette.
- `src/menubar.ts`, `native/menu.m` — the native macOS menu bar (#7), from the registry. gpuix-svelte
  has no menu API, so `menu.m` (AppKit) loads over `bun:ffi`: compiled by clang into
  `dist/dev/libgitbox_menu.dylib` in development, into `Gitbox.app/Contents/Frameworks` by
  `build.ts`. A click queues the command id; JS polls it every 50 ms. ⌘ keys are key equivalents
  (the registry then leaves them to the menu); single keys, ⌘A, ⌘↩ and the Edit items are hints
  only, so text fields keep them. Same-shaped menus update in place, as AppKit adds its own Edit
  items to each new menu. Node has no FFI: `npm start` keeps GPUI's menu. The headless test sets
  `GITBOX_NO_MENU`; `GITBOX_MENU_DEBUG=1` logs the menu bar, `=perform:<id>` also clicks an item.
- `src/automations.svelte.ts` — automations: conditions (board `Filter`s, so `matches` decides;
  case doesn't matter) and steps (approve, read, done, unsubscribe, in that order). `watch()`, from
  `App.svelte` once onboarded, fetches the first unread page every minute and runs each enabled
  automation on what it matches, once per thread and only on threads updated after it was made.
  Each run goes to `automation_log`, which is also what stops a second run.
- `src/Automations.svelte` — the Automations tab: the list (with on/off switches) and its activity
  on the left, the editor on the right. A condition is a field from a menu, `is`, and a value, with
  GitHub's values as chips for the fields that have a fixed set. Edits are a copy until Save.
- `src/fm.ts`, `src/Chat.svelte` — the Chat tab: Apple's on-device model through the `fm` CLI that
  macOS 27 ships. `fm available` decides whether the tab offers a chat or says why not. Each
  conversation is two files in `~/.config/gitbox/chats`: `<id>.json` (title, time, messages) and
  `<id>.fm.json`, fm's transcript (`--save-transcript`, then `--resume`), so an old chat goes on
  after a restart. The list beside the chat opens or deletes them, newest first. A first turn gives
  as instructions the user's login and their 20 newest unread notifications, as the model's
  context is about 4,000 tokens. The prompt goes through stdin, and the reply streams into a
  `<markdown>`. The chats are module state, so they outlive a switch of tabs. The model only talks
  for now. `once` asks one question with no conversation (the Whiteboard draft). The test puts a
  fake `fm` beside the fake `gh`.
- `src/agents.ts` — who answers, picked in Settings → Models for Chat and for Whiteboard drafts,
  with an optional model: Apple's `fm`, Claude Code (`claude -p`, stream-json) or Codex
  (`codex exec --json`), whichever are on PATH. `ask()` is one turn and returns the session that
  continues it (fm's is the transcript file). A chat runs Claude with none of the user's settings, no built-in tools, the
  board's tools and the instructions as the system prompt; Codex gets them in its first prompt, read-only. A Whiteboard
  draft runs the agent in the PR's checkout with `--permission-mode dontAsk` and only Whiteboard's
  MCP tools, file reads, `git diff/log/show` and `gh pr view/diff`. A chat keeps the agent and
  model it started with. The test has fake `claude` and `codex` CLIs.
- `src/mcp.ts`, `src/tools.svelte.ts` — the board's tools for the agent behind Chat: a small MCP
  server inside gitbox (JSON-RPC over HTTP on 127.0.0.1, a random token in its URL, started on the
  first agent chat) with `list_notifications` (board filters, a lane, `all` loads every page),
  `filter_board`, `select` and `act` (read, done, unsubscribe, close, reopen, open). Board.svelte
  hands its items and actions to `board.current` while mounted; `act` runs the board's own action,
  so cards, toasts and progress behave as for a click, and it waits for the user's Confirm in the
  chat (`confirm`). Claude gets the server through `--mcp-config` with `--setting-sources ''`
  (`--safe-mode` would drop it) and only `mcp__gitbox` allowed; Codex through
  `-c mcp_servers.gitbox.url`, with its tools approved (`default_tools_approval_mode`), as `codex
  exec` refuses MCP tools that need approval; fm can't call tools. No agent argument may be empty:
  Bun's spawn drops it. The test's fake `claude` calls the server as a
  real MCP client.
- `src/ago.ts` — "now", "5m", "3h", "2d", then a date: cards, automation activity and chats.
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
  reason, author, organization): any value of one field, and every field. `matches` is what the lanes use.
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
- `src/whiteboard.ts` — Open in Whiteboard (#22): a PR card's menu, `w`, the palette and the
  Notification menu. Through the `whiteboard` CLI (in `~/.local/bin`, which `env()` in `gh.ts` adds
  to PATH): `session_create` with a `pullRequest` target fetches the PR into a local checkout and
  makes the PR's board, or returns the one it has; `session_open` opens one that didn't open itself.
  A Whiteboard that isn't running is started with `whiteboard app launch`. The checkout is the one
  remembered in `repo_paths`, one Whiteboard knows (`session_list`), or a git repository one or
  two levels under Settings → Advanced → Code folders whose remote is the PR's `owner/repo`. If
  none has it but a clone's remote is a fork of it (GitHub's `parent` or `source`), `ForkCheckout`
  names the clone, and the toast's "Add upstream" adds the repository as `upstream` (or its owner's
  name), in the fork remote's protocol, then opens the PR: Whiteboard fetches a PR only from a
  remote for its repository. An
  empty board (`session_get --json` gives `{}`) gets a first draft from Apple's on-device model
  (`draft`, through `once` in `src/fm.ts`), in the background: a note that the model wrote it, What
  and why, Changes (each of the 15 largest files: the model's sentence or two, a link to and a
  `code_peek` of its largest hunk, whose lines come from the diff, not the model; lock files are
  only listed) and What to check. The structure goes down first, under a Whiteboard activity, so a
  reader watches it fill. The test has a fake `whiteboard`, real temporary git repositories, and
  fake answers from `fm`.
- `src/Toast.svelte` — short messages at the bottom of the window.
- `src/jobs.svelte.ts`, `src/Jobs.svelte` — background work and its progress popup, in the
  top-right corner under the toolbar on every tab. `track(title, work)` shows a job until `work`
  settles; `work` sets its `detail`, and a `total` with `done` draws a bar. The popup takes no
  clicks. The board's loads ("Refreshing inbox") and the automations (only when they have
  something to do, as they check every minute) use it. Refresh, the button and ⌘R, does nothing
  while a load runs.
- `src/Card.svelte` — one notification; a click or Enter opens `link(n)` in the browser: the PR or
  issue, the advisory (found by its title, as advisory notifications carry no URL), or the page
  the subject's API object names.
- `src/Settings.svelte` — the settings dialog in tabs (#8): General, Board (cards per lane; lanes
  shown, ordered and sorted), Appearance, Shortcuts (`ShortcutList.svelte`, as ⌘/ shows), Models (`src/agents.ts`) and Advanced
  (pages at once, `gh_host` → GH_HOST, `gh_path`, code folders, setup, reset). It opens on the last tab; ⌘[ ⌘]
  change tabs.
- `src/theme.ts` — the palettes (Catppuccin Mocha dark, Latte light) and the board's text size and
  density, as CSS variables App sets. GPUI's rem is fixed, so text size scales the board's own
  sizes. "System" reads `defaults read -g AppleInterfaceStyle` every 30 s.
- `src/icons.ts` — Octicons as raw markup for `<svg source>`, which a compiled binary needs.
- `assets/icon.svg`, `assets/icon.png` — the app icon and its 1024 px render (see `build.ts`).
- `test.ts` — the headless test (`gpuix-svelte/test`); a plain script that exits 1 on failure. It
  puts a fake `gh` first on `PATH` and points `XDG_CONFIG_HOME` at a temp dir, so it needs no
  GitHub account and leaves the real saved state alone. A fake `open` and `pbcopy` sit beside it,
  and every action call goes to a log the test reads (`calls()`), so no browser opens and the
  clipboard stays as it was.
- `standalone.ts`, `build.ts` — the entry and the Bun build script behind `npm run build`; on
  macOS it also makes `dist/Gitbox.app` and a `.dmg`, signed from `CODESIGN_IDENTITY`.
- `.github/workflows/release.yml` — release-please on every push to `main` (the release PR, then the
  tag and the GitHub release when it merges), and the macOS build that attaches the `.dmg`. Run by
  hand, it is a dry run that keeps the `.dmg` as an artifact.
- `.github/workflows/pr-title.yml` — checks that a PR's title is a Conventional Commit.
- `release-please-config.json`, `.release-please-manifest.json` — release-please's settings, and the
  last released version.
- `tsconfig.json`, `svelte.d.ts`, `svelte.config.js` — TypeScript and svelte-check setup.
