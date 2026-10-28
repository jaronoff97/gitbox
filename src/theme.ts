// The look (#8): two palettes (Catppuccin Mocha and Latte), and the board's text size and density, all
// CSS variables that App sets with set_css_vars. GPUI's rem is a fixed 16 px, so text size scales the
// board's own sizes (cards, lane headers, toolbar) rather than everything.
import { execFile } from 'node:child_process';
import type { Settings } from './settings.svelte.ts';

const DARK = {
	bg: '#11111b',
	lane: '#181825',
	toolbar: '#1a1a28',
	separator: '#00000099',
	'tool-hover': '#ffffff14',
	surface: '#1e1e2e',
	raised: '#24273a',
	border: '#313244',
	thumb: '#585b70',
	ink: '#cdd6f4',
	muted: '#7f849c',
	accent: '#89b4fa',
	ok: '#a6e3a1',
	warn: '#f9e2af',
	fail: '#f38ba8',
	'fail-bg': '#f38ba81a',
	merged: '#cba6f7',
	scrim: '#00000099',
	'popover-surface': '#1e1e2e',
	'popover-border': '#313244',
	'popover-ink': '#cdd6f4',
	'tooltip-surface': '#313244',
	'tooltip-ink': '#cdd6f4'
};

const LIGHT: typeof DARK = {
	bg: '#eff1f5',
	lane: '#e6e9ef',
	toolbar: '#e6e9ef',
	separator: '#00000024',
	'tool-hover': '#0000000f',
	surface: '#ffffff',
	raised: '#f4f5f8',
	border: '#ccd0da',
	thumb: '#9ca0b0',
	ink: '#4c4f69',
	muted: '#6c6f85',
	accent: '#1e66f5',
	ok: '#40a02b',
	warn: '#df8e1d',
	fail: '#d20f39',
	'fail-bg': '#d20f391a',
	merged: '#8839ef',
	scrim: '#00000040',
	'popover-surface': '#ffffff',
	'popover-border': '#ccd0da',
	'popover-ink': '#4c4f69',
	'tooltip-surface': '#4c4f69',
	'tooltip-ink': '#eff1f5'
};

export const palette = (dark: boolean) => (dark ? DARK : LIGHT);

/** Every variable for `s`, with `dark` saying which palette ("system" is decided by the caller). */
export function css_vars(s: Settings, dark: boolean): Record<string, string> {
	const px = (n: number) => `${Math.round(n * s.text_size)}px`;
	const compact = s.density === 'compact';
	return {
		...palette(dark),
		'text-xs': px(11),
		'text-sm': px(12),
		'text-md': px(13),
		'line-md': px(18),
		'text-title': px(13),
		'card-pad': compact ? '8px 10px' : '12px',
		'card-gap': compact ? '5px' : '8px',
		'row-gap': compact ? '6px' : '8px'
	};
}

/** Whether macOS is in dark mode now (elsewhere, dark). `defaults` fails when the mode is light. */
export function system_dark(): Promise<boolean> {
	if (process.platform !== 'darwin') return Promise.resolve(true);
	return new Promise((resolve) =>
		execFile('defaults', ['read', '-g', 'AppleInterfaceStyle'], (err, out) => resolve(!err && out.trim() === 'Dark'))
	);
}
