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
	/** The lanes in board order, and which of them show. */
	lanes: { key: string; shown: boolean }[];
	/** Minutes between refreshes; 0 is off. */
	refresh_minutes: number;
	/** The board filters; none shows everything. */
	filters: Filter[];
	/** Each lane's order by `updated_at`; a lane not listed is newest first. */
	lane_sort: Record<string, Sort>;
};

export type Sort = 'desc' | 'asc';

export const DEFAULTS: Settings = {
	lane_size: 50,
	batch: 4,
	participating: false,
	include_read: false,
	lanes: [
		{ key: 'todo', shown: true },
		{ key: 'requested', shown: true },
		{ key: 'waiting', shown: true },
		{ key: 'done', shown: true }
	],
	refresh_minutes: 0,
	filters: [],
	lane_sort: {}
};

export const settings: Settings = $state({ ...DEFAULTS });

/** Reads the saved settings; App calls it on mount, so a test can point XDG_CONFIG_HOME first. */
export function init() {
	// 0.1.0 saved a list of repositories, and later versions hide_done; they become filters and lanes.
	const { repos, hide_done, ...saved } = (load().settings ?? {}) as Partial<Settings> & {
		repos?: string[];
		hide_done?: boolean;
	};
	Object.assign(settings, DEFAULTS, saved);
	if (repos?.length && !saved.filters) settings.filters = repos.map((value) => ({ field: 'repo', value }));
	if (hide_done && !saved.lanes) settings.lanes = DEFAULTS.lanes.map((l) => ({ ...l, shown: l.key !== 'done' }));
}

export const lane_shown = (key: string) => settings.lanes.find((l) => l.key === key)?.shown ?? true;

export const toggle_lane = (key: string) =>
	update({ lanes: settings.lanes.map((l) => (l.key === key ? { ...l, shown: !l.shown } : l)) });

export function update(changes: Partial<Settings>) {
	Object.assign(settings, changes);
	save({ settings: $state.snapshot(settings) });
}
