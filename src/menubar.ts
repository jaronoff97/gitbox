/// <reference types="bun" />
// The native macOS menu bar (#7), built from the command registry (#4). gpuix-svelte has no menu API,
// so native/menu.m does the AppKit side and loads over Bun's FFI, as gpuix-svelte's
// examples/liquid-glass-ffi does. Node 24 has no FFI: under `npm start` GPUI's default menu stays and
// the registry's key handler keeps every shortcut.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caps, commands, enabled, native_menu, run, single, type Command, type Group } from './commands.svelte.ts';
import { open_url } from './gh.ts';
import { dock, notifier } from './notify.ts';
import { CLANG, NATIVE } from '../bundle.ts';

export type Item = {
	id?: string;
	title?: string;
	/** A key equivalent: the menu owns that shortcut. */
	keys?: string;
	/** A shortcut shown at the right only: a single key, or one a text field needs (⌘A, ⌘↩). */
	hint?: string;
	checked?: boolean;
	enabled?: boolean;
	role?: string;
	sep?: true;
};
export type Menu = { title: string; items: Item[] };

const SEP: Item = { sep: true };

function item(c: Command): Item {
	const it: Item = { id: c.id, title: c.title, enabled: enabled(c), checked: c.checked?.() ?? false };
	if (c.keys && (single(c.keys) || c.skip_editing)) it.hint = caps(c.keys).join('');
	else if (c.keys) it.keys = c.keys;
	return it;
}

/** The menu bar for the commands registered now. The Edit items stay GPUI's (hints, no keys), so ⌘C
 * and ⌘V keep reaching its text fields. */
export function menu_json(list: Command[] = commands()): Menu[] {
	const of = (g: Group) => list.filter((c) => c.group === g && !c.id.startsWith('onboarding.')).map(item);
	const role = (role: string, title: string, hint?: string): Item => ({ role, title, ...(hint && { hint }) });
	const menus: Menu[] = [
		{
			title: 'Gitbox',
			items: [
				role('about', 'About Gitbox'),
				SEP,
				...of('app'),
				SEP,
				role('services', 'Services'),
				SEP,
				role('hide', 'Hide Gitbox'),
				role('hideOthers', 'Hide Others'),
				role('showAll', 'Show All'),
				SEP,
				role('quit', 'Quit Gitbox')
			]
		},
		{ title: 'File', items: [...of('file'), SEP, role('close', 'Close Window')] },
		{
			title: 'Edit',
			items: [
				role('undo', 'Undo', '⌘Z'),
				role('redo', 'Redo', '⇧⌘Z'),
				SEP,
				role('cut', 'Cut', '⌘X'),
				role('copy', 'Copy', '⌘C'),
				role('paste', 'Paste', '⌘V'),
				role('selectAll', 'Select All', '⌘A'),
				SEP,
				...of('edit')
			]
		},
		// AppKit adds Enter Full Screen to a menu titled View by itself.
		{ title: 'View', items: of('view') },
		{ title: 'Go', items: of('go') },
		{ title: 'Notification', items: of('notification') },
		{ title: 'Window', items: [role('minimize', 'Minimize'), role('zoom', 'Zoom'), SEP, role('front', 'Bring All to Front')] },
		{ title: 'Help', items: of('help') }
	];
	// Drop empty menus, and separators at either end or next to each other.
	return menus
		.map((m) => ({ ...m, items: m.items.filter((it, i, all) => !it.sep || (i > 0 && i < all.length - 1 && !all[i - 1].sep)) }))
		.filter((m) => m.items.length);
}

/** The compiled library: in Gitbox.app's Frameworks, beside the bare binary, or built from native/
 * in development (again when a source is newer). */
function library(): string | null {
	const exe = dirname(process.execPath);
	for (const p of [join(exe, '../Frameworks/libgitbox_menu.dylib'), join(exe, 'libgitbox_menu.dylib')]) if (existsSync(p)) return p;
	const sources = NATIVE.map((f) => fileURLToPath(new URL(`../${f}`, import.meta.url)));
	if (!sources.every(existsSync)) return null;
	const out = join(dirname(sources[0]), '../dist/dev/libgitbox_menu.dylib');
	if (!existsSync(out) || sources.some((src) => statSync(src).mtimeMs > statSync(out).mtimeMs)) {
		mkdirSync(dirname(out), { recursive: true });
		execFileSync('clang', [...CLANG, '-o', out, ...sources]);
	}
	return out;
}

/** Installs the menu bar and polls it for clicks; null where it can't (not macOS, not Bun, no clang). */
export async function install(): Promise<{ set(menus: Menu[]): void; stop(): void } | null> {
	// GITBOX_NO_MENU: the headless test, which has no menu bar to install into.
	if (process.platform !== 'darwin' || !process.versions.bun || process.env.GITBOX_NO_MENU) return null;
	try {
		const path = library();
		if (!path) return null;
		const { dlopen, FFIType, CString } = await import('bun:ffi');
		const lib = dlopen(path, {
			gitbox_menu_set: { args: [FFIType.ptr], returns: FFIType.i32 },
			gitbox_menu_poll: { args: [], returns: FFIType.ptr },
			gitbox_menu_describe: { args: [], returns: FFIType.ptr },
			gitbox_menu_perform: { args: [FFIType.ptr], returns: FFIType.i32 },
			gitbox_notify_listen: { args: [], returns: FFIType.void },
			gitbox_notify_init: { args: [], returns: FFIType.void },
			gitbox_notify_allowed: { args: [], returns: FFIType.i32 },
			gitbox_notify_reason: { args: [], returns: FFIType.ptr },
			gitbox_notify_post: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.void },
			gitbox_notify_poll: { args: [], returns: FFIType.ptr },
			gitbox_dock_badge: { args: [FFIType.ptr], returns: FFIType.void }
		});
		const cstr = (s: string) => Buffer.from(`${s}\0`);
		const debug = process.env.GITBOX_MENU_DEBUG;
		let last = '';
		// Clicks on a notification open what it names, as the polled menu clicks run commands.
		lib.symbols.gitbox_notify_listen();
		const timer = setInterval(() => {
			for (let p = lib.symbols.gitbox_menu_poll(); p; p = lib.symbols.gitbox_menu_poll()) run(new CString(p).toString());
			for (let p = lib.symbols.gitbox_notify_poll(); p; p = lib.symbols.gitbox_notify_poll()) open_url(new CString(p).toString());
		}, 50);
		native_menu.on = true;
		dock.set = (label) => lib.symbols.gitbox_dock_badge(cstr(label));
		dock.set(dock.label);
		notifier.current = {
			post: (n) => lib.symbols.gitbox_notify_post(cstr(n.id), cstr(n.title), cstr(n.subtitle), cstr(n.body), cstr(n.group), cstr(n.url)),
			permission: async () => {
				lib.symbols.gitbox_notify_init();
				// macOS answers on its own thread; the first time, after the user picks in its prompt.
				for (let k = 0; k < 1200 && lib.symbols.gitbox_notify_allowed() < 0; k++) await new Promise((r) => setTimeout(r, 100));
				const allowed = lib.symbols.gitbox_notify_allowed();
				return allowed === 1 ? null : allowed < 0 ? 'macOS did not answer' : new CString(lib.symbols.gitbox_notify_reason()!).toString() || 'not allowed';
			}
		};
		if (debug?.startsWith('perform:'))
			setTimeout(() => console.error('[menubar] perform', debug, lib.symbols.gitbox_menu_perform(cstr(debug.slice(8)))), 3000);
		return {
			set(menus) {
				const json = JSON.stringify(menus);
				if (json === last) return;
				last = json;
				lib.symbols.gitbox_menu_set(cstr(json));
				if (debug) setTimeout(() => console.error(`[menubar]\n${new CString(lib.symbols.gitbox_menu_describe()!).toString()}`), 500);
			},
			stop() {
				clearInterval(timer);
				native_menu.on = false;
				notifier.current = null;
				dock.set?.('');
				dock.set = null;
				lib.close();
			}
		};
	} catch (e) {
		console.warn('[menubar] no native menu bar:', (e as Error).message);
		return null;
	}
}
