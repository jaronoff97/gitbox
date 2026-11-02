# Changelog

## [0.3.0](https://github.com/jaronoff97/gitbox/compare/v0.2.1...v0.3.0) (2026-11-02)


### Features

* **notifications:** group an automation's notifications by any filter field ([#37](https://github.com/jaronoff97/gitbox/issues/37)) ([f00a813](https://github.com/jaronoff97/gitbox/commit/f00a8135b2fe70b5122fa70647a5f32bbb745f2e))
* **notifications:** send native macOS notifications from automations ([#36](https://github.com/jaronoff97/gitbox/issues/36)) ([3e7ef16](https://github.com/jaronoff97/gitbox/commit/3e7ef16e000d0d46044bc02fbba96cf5ae9e7abf))


### Bug Fixes

* **cards:** ignore the second click of a double-click ([#38](https://github.com/jaronoff97/gitbox/issues/38)) ([6092ee5](https://github.com/jaronoff97/gitbox/commit/6092ee5f22a7629de4888650832f060dce691726))

## [0.2.1](https://github.com/jaronoff97/gitbox/compare/v0.2.0...v0.2.1) (2026-11-02)


### Bug Fixes

* **ci:** run the test at the runner's window size, on every pull request ([#33](https://github.com/jaronoff97/gitbox/issues/33)) ([c83dc7d](https://github.com/jaronoff97/gitbox/commit/c83dc7d5f305c33d5cd8e6b487f5efa96885051b))

## [0.2.0](https://github.com/jaronoff97/gitbox/compare/v0.1.0...v0.2.0) (2026-10-30)


### Features

* add a command registry that owns every shortcut ([#11](https://github.com/jaronoff97/gitbox/issues/11)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **automations:** act on notifications that match an automation ([#18](https://github.com/jaronoff97/gitbox/issues/18)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **cards:** add a context menu with actions, and toasts that open them ([#9](https://github.com/jaronoff97/gitbox/issues/9)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **cards:** select several cards and act on them together ([#10](https://github.com/jaronoff97/gitbox/issues/10)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **cards:** show a PR's or an issue's number on its card ([#24](https://github.com/jaronoff97/gitbox/issues/24)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **chat:** chat with Apple's on-device model ([#19](https://github.com/jaronoff97/gitbox/issues/19)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **chat:** let the chat's agent act on the board through a gitbox MCP server ([#29](https://github.com/jaronoff97/gitbox/issues/29)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **keyboard:** navigate the whole UI from the keyboard ([#12](https://github.com/jaronoff97/gitbox/issues/12)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **menu:** build a native macOS menu bar from the command registry ([#14](https://github.com/jaronoff97/gitbox/issues/14)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **palette:** add a ⌘K command palette ([#13](https://github.com/jaronoff97/gitbox/issues/13)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* pick the agent and model for chat and for Whiteboard drafts ([#25](https://github.com/jaronoff97/gitbox/issues/25)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* put the app in a sidebar with Inbox, Automations and Chat tabs ([#17](https://github.com/jaronoff97/gitbox/issues/17)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **settings:** put the settings in tabs, with lanes, appearance and shortcuts ([#15](https://github.com/jaronoff97/gitbox/issues/15)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* show background work in a progress popup, and make refresh wait for a load ([#20](https://github.com/jaronoff97/gitbox/issues/20)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **whiteboard:** offer to add upstream when a PR's clone is of a fork ([#26](https://github.com/jaronoff97/gitbox/issues/26)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
* **whiteboard:** open a pull request in Whiteboard ([#23](https://github.com/jaronoff97/gitbox/issues/23)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))


### Bug Fixes

* **chat:** keep agent flags intact on Bun, and let Codex use gitbox's tools ([#30](https://github.com/jaronoff97/gitbox/issues/30)) ([7719c5a](https://github.com/jaronoff97/gitbox/commit/7719c5ab55d6a15fdb577c473c1fe53b02f939ad))
