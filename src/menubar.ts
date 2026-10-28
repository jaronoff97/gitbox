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

/** The compiled library: in Gitbox.app's Frameworks, beside the bare binary, or built from
 * native/menu.m in development (again when the source is newer). */
function library(): string | null {
	const exe = dirname(process.execPath);
	for (const p of [join(exe, '../Frameworks/libgitbox_menu.dylib'), join(exe, 'libgitbox_menu.dylib')]) if (existsSync(p)) return p;
	const src = fileURLToPath(new URL('../native/menu.m', import.meta.url));
	if (!existsSync(src)) return null;
	const out = join(dirname(src), '../dist/dev/libgitbox_menu.dylib');
	if (!existsSync(out) || statSync(src).mtimeMs > statSync(out).mtimeMs) {
		mkdirSync(dirname(out), { recursive: true });
		execFileSync('clang', ['-dynamiclib', '-fobjc-arc', '-framework', 'AppKit', '-o', out, src]);
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
			gitbox_menu_perform: { args: [FFIType.ptr], returns: FFIType.i32 }
		});
		const cstr = (s: string) => Buffer.from(`${s}\0`);
		const debug = process.env.GITBOX_MENU_DEBUG;
		let last = '';
		const timer = setInterval(() => {
			for (let p = lib.symbols.gitbox_menu_poll(); p; p = lib.symbols.gitbox_menu_poll()) run(new CString(p).toString());
		}, 50);
		native_menu.on = true;
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
				lib.close();
			}
		};
	} catch (e) {
		console.warn('[menubar] no native menu bar:', (e as Error).message);
		return null;
	}
}
