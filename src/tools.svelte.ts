// The board's tools for the agent behind Chat, served by src/mcp.ts: read the lanes, filter them,
// select cards and act on them. Board.svelte hands over what they need while it is mounted. A change
// waits for the user's Confirm in the chat (`confirm`), as the agent works in the user's name.
import { FIELDS, matches, words, type Filter } from './filters.ts';
import { number, type Action, type Notification } from './gh.ts';
import type { Tool } from './mcp.ts';

export type BoardHandle = {
	/** The notifications loaded so far. */
	items: () => Notification[];
	/** Whether the API has pages not loaded yet. */
	more: () => boolean;
	/** Loads every page. */
	load_all: () => Promise<void>;
	lane_of: (n: Notification) => string;
	filter: (filters: Filter[]) => void;
	select: (ids: string[]) => void;
	/** The board's own action: the cards change at once, and change back if gh fails. */
	run: (action: Action, list: Notification[]) => Promise<boolean>;
};

export const board: { current: BoardHandle | null } = { current: null };

/** A change the agent asks for, until the user answers in the chat. */
export const confirm = $state<{ request: { text: string; titles: string[]; answer: (yes: boolean) => void } | null }>({ request: null });

const ask = (text: string, list: Notification[]) =>
	new Promise<boolean>((resolve) => {
		confirm.request?.answer(false);
		confirm.request = {
			text,
			titles: list.map((n) => `${n.repository.full_name}${number(n) ? ` #${number(n)}` : ''}: ${n.subject.title}`),
			answer: (yes) => {
				confirm.request = null;
				resolve(yes);
			}
		};
	});

const LANES = ['todo', 'requested', 'waiting', 'done'];

const handle = () => {
	if (!board.current) throw new Error('The board is not open. Gitbox shows it once setup is done.');
	return board.current;
};

/** A notification as the agent reads it. */
const card = (b: BoardHandle) => (n: Notification) => ({
	id: n.id,
	lane: b.lane_of(n),
	repo: n.repository.full_name,
	number: number(n) || undefined,
	title: n.subject.title,
	type: words(n.subject.type),
	state: n.state?.toLowerCase(),
	draft: n.draft || undefined,
	reason: words(n.reason),
	author: n.author,
	labels: n.labels?.map((l) => l.name),
	review: n.review,
	unread: n.unread,
	updated_at: n.updated_at
});

const filters_schema = {
	type: 'array',
	description:
		'Board filters. Each picks one value of one field; filters on the same field match any of their values, filters on different fields must all match. Values are lower case words, as list_notifications shows them: type "pull request", reason "review requested", state "open" | "draft" | "closed" | "merged", review "approved" | "changes requested" | "commented" | "none", reviews "0" | "1" | "2" | "3+", repo "owner/name", org "owner", author a login, label a name.',
	items: {
		type: 'object',
		properties: { field: { type: 'string', enum: FIELDS.map((f) => f.key) }, value: { type: 'string' } },
		required: ['field', 'value']
	}
};

const VERBS: Record<string, string> = {
	read: 'Mark as read',
	done: 'Mark as done',
	unsubscribe: 'Unsubscribe from',
	close: 'Close',
	reopen: 'Reopen',
	open: 'Open in the browser'
};

export const TOOLS: Tool[] = [
	{
		name: 'list_notifications',
		description:
			'List the notifications on the user\'s board, newest first, with each one\'s id, lane (todo, requested, waiting, done), repo, number, title, type, state, reason, author, labels, review and unread. The board loads pages as it needs them; all:true loads every page first.',
		inputSchema: {
			type: 'object',
			properties: {
				filters: filters_schema,
				lane: { type: 'string', enum: LANES },
				all: { type: 'boolean', description: 'Load every page first.' },
				limit: { type: 'number', description: 'At most this many (default 100).' }
			}
		},
		run: async ({ filters = [], lane, all, limit = 100 }) => {
			const b = handle();
			if (all) await b.load_all();
			const found = b.items().filter((n) => matches(n, filters) && (!lane || b.lane_of(n) === lane));
			return { total: found.length, more_pages: b.more(), notifications: found.slice(0, limit).map(card(b)) };
		}
	},
	{
		name: 'filter_board',
		description: 'Show only the notifications that match these filters on the user\'s board; an empty list clears them.',
		inputSchema: { type: 'object', properties: { filters: filters_schema }, required: ['filters'] },
		run: async ({ filters }) => {
			const b = handle();
			b.filter(filters);
			return `The board shows ${b.items().filter((n) => matches(n, filters)).length} loaded notifications.`;
		}
	},
	{
		name: 'select',
		description: 'Select these notifications on the board, by id, so the user can act on them from the selection bar. An empty list clears the selection.',
		inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
		run: async ({ ids }) => {
			handle().select(ids);
			return `Selected ${ids.length}.`;
		}
	},
	{
		name: 'act',
		description:
			'Act on notifications by id: read, done (leaves the inbox), unsubscribe, close or reopen a PR or issue, or open them in the browser. The user confirms in the chat first; the reply says whether they did and whether it worked.',
		inputSchema: {
			type: 'object',
			properties: {
				action: { type: 'string', enum: Object.keys(VERBS) },
				ids: { type: 'array', items: { type: 'string' } }
			},
			required: ['action', 'ids']
		},
		run: async ({ action, ids }) => {
			const b = handle();
			const list = b.items().filter((n) => ids.includes(n.id));
			if (!list.length) throw new Error('None of those ids are on the board.');
			const k = list.length;
			if (!(await ask(`${VERBS[action]} ${k} notification${k === 1 ? '' : 's'}?`, list))) return 'The user declined. Nothing changed.';
			const ok = await b.run(action as Action, list);
			return ok ? `Done: ${VERBS[action].toLowerCase()} ${k}.` : 'Some failed; the board keeps those selected and shows why.';
		}
	}
];
