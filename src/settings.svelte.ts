// The user's settings: reactive, saved to state.json on every change, and kept across hot reloads.
import type { Filter } from './filters.ts';
import { load, save } from './store.ts';

export type Settings = {
	/** Cards a lane starts with, and adds per scroll near its end. */
	lane_size: number;
	/** API pages fetched at once. */
	batch: number;
	/** Only threads the user takes part in (the API's `participating`). */
	participating: boolean;
	/** Read notifications too (the API's `all`). */
	include_read: boolean;
	hide_done: boolean;
	/** Minutes between refreshes; 0 is off. */
	refresh_minutes: number;
	/** The board filters; none shows everything. */
	filters: Filter[];
};

export const DEFAULTS: Settings = {
	lane_size: 50,
	batch: 4,
	participating: false,
	include_read: false,
	hide_done: false,
	refresh_minutes: 0,
	filters: []
};

export const settings: Settings = $state({ ...DEFAULTS });

/** Reads the saved settings; App calls it on mount, so a test can point XDG_CONFIG_HOME first. */
export function init() {
	// 0.1.0 saved a list of repositories; it becomes repository filters.
	const { repos, ...saved } = (load().settings ?? {}) as Partial<Settings> & { repos?: string[] };
	Object.assign(settings, DEFAULTS, saved);
	if (repos?.length && !saved.filters) settings.filters = repos.map((value) => ({ field: 'repo', value }));
}

export function update(changes: Partial<Settings>) {
	Object.assign(settings, changes);
	save({ settings: $state.snapshot(settings) });
}
