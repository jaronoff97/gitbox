// Every command the app has, in one registry (#4). The keyboard shortcuts, the ⌘/ overlay, the ⌘K
// palette (#6) and the menu bar (#7) all read it, so a command exists in one place.
import { on_window_key, type GpuixEvent } from 'gpuix-svelte';
import { untrack } from 'svelte';

export type Group = 'app' | 'file' | 'edit' | 'view' | 'go' | 'notification' | 'window' | 'help';

export type Command = {
	/** 'board.refresh' */
	id: string;
	title: string;
	group: Group;
	/** GPUI keystroke syntax: 'cmd-r', 'j', 'shift-cmd-c', 'cmd-/'. */
	keys?: string;
	/** Other keys that run it too, not shown: 'down' beside 'j'. */
	also?: string[];
	/** Whether it applies now (a card has focus, a filter is set…); a command that doesn't, doesn't run. */
	when?: () => boolean;
	/** For a toggle: whether it is on. */
	checked?: () => boolean;
	/** A ⌘ shortcut that a text field has a use for (⌘A, ⌘↩): it doesn't run while one has focus. */
	skip_editing?: boolean;
	run: () => unknown;
};

export const GROUPS: { key: Group; title: string }[] = [
	{ key: 'app', title: 'Gitbox' },
	{ key: 'file', title: 'File' },
	{ key: 'edit', title: 'Edit' },
	{ key: 'view', title: 'View' },
	{ key: 'go', title: 'Go' },
	{ key: 'notification', title: 'Notification' },
	{ key: 'window', title: 'Window' },
	{ key: 'help', title: 'Help' }
];

let registry = $state.raw<Command[]>([]);

/** The registered commands, in the order they were registered. */
export const commands = () => registry;

/** Adds `list`; returns what takes them away again (for an `$effect`, which must not depend on the
 * registry it writes, hence the untrack). */
export function register(list: Command[]) {
	registry = [...untrack(() => registry), ...list];
	return () => (registry = registry.filter((c) => !list.includes(c)));
}

export const enabled = (c: Command) => !c.when || c.when();

/** Runs command `id` if it is registered and applies now; returns whether it ran. */
export function run(id: string) {
	const c = registry.find((c) => c.id === id);
	if (!c || !enabled(c)) return false;
	c.run();
	return true;
}

const MODS = ['ctrl', 'alt', 'shift', 'cmd'] as const;

/** 'shift-cmd-c' → { mods: Set(shift, cmd), key: 'c' }; the key is last, and may itself be '-'. */
export function parse(keys: string) {
	const parts = keys.split('-');
	const key = keys.endsWith('--') ? '-' : parts.pop()!;
	return { mods: new Set(parts.filter(Boolean)), key };
}

/** A shortcut with no ⌘, ⌃ or ⌥ is a single key: typing in a text field must not run it. */
export const single = (keys: string) => !['cmd', 'ctrl', 'alt'].some((m) => parse(keys).mods.has(m));

function matches(e: GpuixEvent, keys: string) {
	const { mods, key } = parse(keys);
	if (e.key !== key) return false;
	return MODS.every((m) => Boolean(e.modifiers?.[m]) === mods.has(m));
}

/** Key caps for display: 'shift-cmd-c' → ['⇧', '⌘', 'C']. */
export function caps(keys: string): string[] {
	const { mods, key } = parse(keys);
	const SYM: Record<string, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘' };
	const NAMES: Record<string, string> = {
		enter: '↩',
		escape: '⎋',
		up: '↑',
		down: '↓',
		left: '←',
		right: '→',
		backspace: '⌫',
		delete: '⌦',
		space: 'Space',
		tab: '⇥'
	};
	return [...MODS.filter((m) => mods.has(m)).map((m) => SYM[m]), NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)];
}

/** While true, the registry leaves ⌘ shortcuts to the native menu bar (#7), which owns them then. */
export const native_menu = $state({ on: false });

/** A panel with its own list and search (the ⌘K palette) claims the plain keys while open: its ↑ ↓ ↩ ⎋
 * and typing are its own, not the board's. `e.editing` can't tell, as gpuix doesn't set it for every
 * key a text field gets. ⌘ shortcuts still run. */
export const keys_claimed = $state({ by: 0 });

/** The one window key handler: the first command whose keys match and that applies runs. */
export function listen() {
	return on_window_key('keydown', (e: GpuixEvent) => {
		for (const c of registry) {
			const keys = [c.keys, ...(c.also ?? [])].filter((k): k is string => Boolean(k));
			const hit = keys.find((k) => matches(e, k));
			if (!hit) continue;
			if ((single(hit) || c.skip_editing) && e.editing) return;
			if (single(hit) && keys_claimed.by > 0) return;
			if (native_menu.on && parse(hit).mods.has('cmd')) return;
			if (!enabled(c)) continue;
			e.preventDefault();
			c.run();
			return;
		}
	});
}
