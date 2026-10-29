// The user's settings: reactive, saved to state.json on every change, and kept across hot reloads.
import type { Agent } from './agents.ts';
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
	/** Appearance (#8). `system` follows macOS. */
	theme: 'dark' | 'light' | 'system';
	density: 'comfortable' | 'compact';
	/** The board's text, as a factor of the default sizes. */
	text_size: number;
	/** j, k, e… without a modifier; off leaves only the ⌘ shortcuts. */
	single_keys: boolean;
	/** A GitHub Enterprise host for gh (GH_HOST); empty is github.com. */
	gh_host: string;
	/** Where gh is; empty finds it on PATH. */
	gh_path: string;
	/** Who answers in Chat, and with which model (empty is the agent's default). */
	chat_agent: Agent;
	chat_model: string;
	/** Who drafts an empty Whiteboard, and with which model. */
	whiteboard_agent: Agent;
	whiteboard_model: string;
	/** Folders, split by commas, whose repositories (one or two levels down) Whiteboard can open PRs in (#22). */
	code_dirs: string;
	/** The settings tab last open. */
	tab: string;
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
	lane_sort: {},
	theme: 'dark',
	density: 'comfortable',
	text_size: 1,
	single_keys: true,
	gh_host: '',
	gh_path: '',
	chat_agent: 'fm',
	chat_model: '',
	whiteboard_agent: 'fm',
	whiteboard_model: '',
	code_dirs: '~/Code',
	tab: 'general'
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

/** The lanes' names, for the board and Settings → Board. */
export const LANE_TITLES: Record<string, string> = {
	todo: 'Todo',
	requested: 'Requested',
	waiting: 'Waiting on me',
	done: 'Merged / Closed'
};

export const lane_shown = (key: string) => settings.lanes.find((l) => l.key === key)?.shown ?? true;

/** Moves lane `key` one place earlier (-1) or later (1) on the board. */
export function move_lane(key: string, step: -1 | 1) {
	const lanes = [...settings.lanes];
	const at = lanes.findIndex((l) => l.key === key);
	const to = at + step;
	if (at < 0 || to < 0 || to >= lanes.length) return;
	[lanes[at], lanes[to]] = [lanes[to], lanes[at]];
	update({ lanes });
}

export const toggle_lane = (key: string) =>
	update({ lanes: settings.lanes.map((l) => (l.key === key ? { ...l, shown: !l.shown } : l)) });

export function update(changes: Partial<Settings>) {
	Object.assign(settings, changes);
	save({ settings: $state.snapshot(settings) });
}
