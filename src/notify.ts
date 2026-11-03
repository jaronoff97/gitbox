// Native macOS notifications (#35): the automations' "Send a macOS notification" step. native/notify.m
// does the work, loaded with the menu bar's library by src/menubar.ts, which sets `notifier` (only
// on macOS under Bun: Node has no FFI, and then the step says so). A test sets its own `notifier`.

export type Post = {
	/** One per thread and update, so a repeat replaces rather than adds. */
	id: string;
	title: string;
	subtitle: string;
	body: string;
	/** Stacks a repository's notifications in Notification Center. */
	group: string;
	/** What a click opens. */
	url: string;
};

export type Notifier = {
	post: (p: Post) => void;
	/** Asks macOS for permission (it prompts once); resolves to null when allowed, else why not. */
	permission: () => Promise<string | null>;
};

export const notifier: { current: Notifier | null } = { current: null };

/** The Dock icon's badge. `set` is the native one once the library loads (after the board has
 * counted, so the loader applies the last `label`); a test sets its own. */
export const dock: { set: ((label: string) => void) | null; label: string } = { set: null, label: '' };

/** Shows `label` on the Dock icon ('' takes it away). */
export function badge(label: string) {
	dock.label = label;
	dock.set?.(label);
}

/** Shows `p`, asking macOS for permission first; rejects with why it can't. */
export async function notify(p: Post) {
	const n = notifier.current;
	if (!n) throw new Error('macOS notifications need the Gitbox app on macOS (npm start runs on Node, which has none)');
	const refused = await n.permission();
	if (refused) throw new Error(`Notifications are off for Gitbox (${refused}): turn them on in System Settings → Notifications`);
	n.post(p);
}
