// ↑↓ and ↩ for a list in a menu (#5): the filter menu, the card menu and the palette share it.
import { on_window_key, type GpuixEvent } from 'gpuix-svelte';

/**
 * While `active()`, ↑ and ↓ move `nav.index` over `count()` items, and ↩ calls `pick` with it. `back`,
 * if given, sees every other key and returns whether it went back (the filter menu uses ⌘[). Call it during
 * component setup; it registers its own effect. A text field in the list calls `submit` from its
 * `onsubmit`, since an <input> takes Enter itself.
 */
export function list_nav(opts: {
	active: () => boolean;
	count: () => number;
	pick: (index: number) => void;
	back?: (e: GpuixEvent) => boolean;
}) {
	const nav = $state({ index: 0 });
	/** ↩ from a text field, which sends Enter as `onsubmit` rather than as a key. */
	const submit = () => {
		const n = opts.count();
		if (n > 0) opts.pick(Math.min(nav.index, n - 1));
	};
	$effect(() => {
		if (!opts.active()) return;
		return on_window_key('keydown', (e: GpuixEvent) => {
			const n = opts.count();
			if (e.key === 'down') nav.index = Math.min(n - 1, nav.index + 1);
			else if (e.key === 'up') nav.index = Math.max(0, nav.index - 1);
			else if (e.key === 'enter' && !e.modifiers?.cmd) submit();
			else if (opts.back?.(e)) nav.index = 0;
			else return;
			e.preventDefault();
		});
	});
	return { nav, submit };
}
