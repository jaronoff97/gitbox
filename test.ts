import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mount_headless, click_test_id, all_text, check, drag, finish, press, pump, wait, wait_for, wheel, find_test_id, bounds } from 'gpuix-svelte/test';
import App from './App.svelte';
import { matches } from './src/filters.ts';
import { link, type Notification } from './src/gh.ts';

// A fake `gh` first on PATH: signed out until FAKE_AUTHED is set, then 290 notifications in API
// pages of 50 (the last has 40), titled "Note 1" to "Note 290". Note i is PR i, and i % 4 picks
// its lane: 0 review requested, 1 mention (waiting on me), 2 subscribed (todo), 3 a merged PR
// (done). Note 1 is the newest, a minute apart each, as the API sends them newest first.
// So four pages give every lane its first 50 cards, and two pages are left. Every fifth
// note is in octo/other, the rest in octo/repo; every third has the label "bug".
const bin = mkdtempSync(join(tmpdir(), 'gitbox-'));
writeFileSync(
	join(bin, 'gh'),
	`#!${process.execPath}
const args = process.argv.slice(2);
const cmd = args.join(' ');
const reason = (i) => ['review_requested', 'mention', 'subscribed', 'comment'][i % 4];
const note = (i) => ({
	id: String(i),
	reason: reason(i),
	unread: true,
	updated_at: new Date(Date.UTC(2026, 9, 27) - i * 60000).toISOString(),
	subject: { title: 'Note ' + i, type: 'PullRequest', url: 'https://api.github.com/repos/octo/repo/pulls/' + i },
	repository: {
		full_name: i % 5 === 0 ? 'octo/other' : 'octo/repo',
		html_url: 'https://github.com/octo/repo',
		owner: { login: 'octo', avatar_url: '' }
	}
});
const page = cmd.match(/^api notifications\\?per_page=50&page=(\\d+)$/);
if (cmd === '--version') console.log('gh version 9.9.9');
else if (cmd === 'api user --jq {login, avatar_url}') {
	if (!process.env.FAKE_AUTHED) { console.error('not logged in'); process.exit(1); }
	console.log(JSON.stringify({ login: 'octocat', avatar_url: '' }));
} else if (cmd === 'api notifications?per_page=1') console.log('[]');
else if (page) {
	if (!process.env.FAKE_AUTHED) { console.error('HTTP 401: Bad credentials'); process.exit(1); }
	const from = (page[1] - 1) * 50 + 1;
	const to = Math.min(from + 49, 290);
	console.log(JSON.stringify(Array.from({ length: Math.max(to - from + 1, 0) }, (_, k) => note(from + k))));
} else if (cmd === 'api --paginate --slurp repos/octo/repo/security-advisories?per_page=100') {
	console.log(JSON.stringify([[{ summary: 'Bad thing', html_url: 'https://github.com/octo/repo/security/advisories/GHSA-1' }]]));
} else if (cmd === 'api https://api.github.com/repos/octo/repo/releases/1 --jq .html_url') {
	console.log('https://github.com/octo/repo/releases/tag/v1');
} else if (args[1] === 'graphql') {
	const data = {};
	for (const [, alias, i] of args[3].matchAll(/(a\\d+): resource\\(url: "[^"]*\\/pull\\/(\\d+)"\\)/g))
		data[alias] = {
			state: reason(+i) === 'comment' ? 'MERGED' : 'OPEN',
			isDraft: i % 7 === 0,
			author: { login: i % 2 ? 'alice' : 'bob' },
			labels: { nodes: i % 3 === 0 ? [{ name: 'bug', color: 'd73a4a' }] : [] },
			reviews: { totalCount: i % 4 },
			latestReviews: { nodes: i % 4 ? [{ state: 'APPROVED' }] : [] }
		};
	console.log(JSON.stringify({ data }));
} else { console.error('unexpected: ' + cmd); process.exit(1); }
`,
	{ mode: 0o755 }
);
process.env.PATH = `${bin}:${process.env.PATH}`;
// The saved state goes to a temp dir, not the real ~/.config/gitbox.
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'gitbox-config-'));
const saved = () => JSON.parse(readFileSync(join(process.env.XDG_CONFIG_HOME!, 'gitbox', 'state.json'), 'utf8'));

const text = () => all_text().join('\n');
const has = (s: string) => all_text().includes(s);
/** Whether card `id` sits inside lane `key`, by painted x. */
const in_lane = (id: number, key: string) => {
	const c = bounds(find_test_id(`card-${id}`)!);
	const l = bounds(find_test_id(`lane-${key}`)!);
	return !!c && !!l && c.x >= l.x && c.x + c.width <= l.x + l.width;
};

/** Scrolls a lane down in 1500 px wheels, as a trackpad does: a windowed list knows the heights of
 * its mounted rows only, so one huge jump stops short. Headless, a list draws a wheel scroll, and
 * reports its new visible range, only on a later frame, so each wheel gets a moment and a pump. */
async function scroll_lane(key: string, steps = 10) {
	for (let k = 0; k < steps; k++) {
		wheel(find_test_id(`lane-${key}`)!, 0, -1500);
		await wait(40);
		pump();
	}
	wheel(find_test_id(`lane-${key}`)!, 0, -1);
	await wait(60);
	pump();
}

let app = mount_headless(App, { width: 1280, height: 800 });

await wait_for(() => text().includes('gh auth login'), { label: 'sign-in hint' });
check('a signed-out gh shows the login hint', text().includes('not logged in'));

process.env.FAKE_AUTHED = '1';
click_test_id('retry');
await wait_for(() => text().includes('Show notifications'), { label: 'all checks pass' });
check('the signed-in user is shown', text().includes('as octocat'));

click_test_id('continue');
check('finishing onboarding saves it', saved().onboarded === true);
// A lane mounts only a window of rows around what is on screen, so counts stand in for far-off cards.
const badges = (b: string) => all_text().filter((t) => t === b).length;
await wait_for(() => badges('50+') === 4, { label: 'the first 50 cards of every lane' });
await wait_for(() => !text().includes('loading…'), { label: 'the start settles' });
check('the board has the four lanes', ['Todo', 'Requested', 'Waiting on me', 'Merged / Closed'].every(has));
check(
	'each card goes in the lane for its reason and state',
	in_lane(4, 'requested') && in_lane(5, 'waiting') && in_lane(6, 'todo') && in_lane(7, 'done')
);
check('every lane starts with 50 cards', text().includes('200+ unread') && badges('50+') === 4);
check('a lane mounts a window of rows, not all of them', has('Note 4') && !has('Note 200'));
await wait(1500);
check('nothing more loads without a scroll', !has('Note 201'));

await scroll_lane('requested');
await wait_for(() => has('Note 204'), { label: 'a scroll in Requested loads its next cards', timeout: 6000 });
await wait_for(() => !text().includes('loading…'), { label: 'Requested settles' });
check('Requested gets the rest of its cards', has('72'));
check('a scroll in one lane adds no cards to the others', !has('Note 201') && !has('Note 202') && !has('Note 203'));
check('the last short page ends the loading', text().includes('290 unread') && !text().includes('290+ unread'));
await scroll_lane('requested');
await wait_for(() => text().includes('All caught up'), { label: 'the end of Requested' });
check('a lane with every card says so', text().includes('All caught up'));

await scroll_lane('todo');
await wait_for(() => has('Note 202'), { label: 'Todo shows its loaded cards on its own scroll' });
check('Todo gets its cards without other lanes', !has('Note 201') && !has('Note 203'));

// The thumb is GPUI's and can't be dragged, so a strip over it scrolls to the row at the pointer.
{
	const strip = bounds(find_test_id('gutter-waiting')!)!;
	const x = strip.x + strip.width / 2;
	const full = badges('50+');
	drag({ x, y: strip.y + 5 }, { x, y: strip.y + strip.height - 2 }, { steps: 6 });
	await wait(60);
	pump();
	await wait_for(() => has('73'), { label: 'a drag to the end of Waiting on me' });
	check('dragging the scroll strip to the end grows that lane only', has('73') && badges('50+') === full - 1);
}

click_test_id('add-filter');
await wait_for(() => has('Repository'), { label: 'the filter menu' });
click_test_id('field-repo');
await wait_for(() => has('octo/other'), { label: 'the repository values' });
check('the menu lists each value with its count', has('232') && has('58'));
click_test_id('value-octo/other');
await wait_for(() => !has('Note 4'), { label: 'the repository filter applies' });
check('a filter shows as a chip', find_test_id('chip-repo-octo/other') !== null);
check('the filter keeps only that repository', has('Note 5') && has('Note 290') && !has('Note 6'));
check('the filter applies to every lane', in_lane(20, 'requested') && in_lane(5, 'waiting') && in_lane(10, 'todo') && in_lane(15, 'done'));

click_test_id('filter-back');
await wait_for(() => has('Label'), { label: 'back to the fields' });
click_test_id('field-label');
await wait_for(() => has('bug'), { label: 'the label values' });
click_test_id('value-bug');
await wait_for(() => !has('Note 5'), { label: 'a second field narrows the board' });
check('filters on different fields must all match', has('Note 15') && has('Note 30') && !has('Note 3') && !has('Note 5'));
press('escape');

click_test_id('remove-repo-octo/other');
await wait_for(() => has('Note 3'), { label: 'a chip removed' });
check('removing a chip drops only its filter', !has('Note 4') && find_test_id('chip-repo-octo/other') === null);
click_test_id('clear-filters');
await wait_for(() => has('Note 4'), { label: 'the filters cleared' });
check('Clear removes every filter', has('Note 6') && saved().settings.filters.length === 0);

const sample = {
	reason: 'mention',
	subject: { type: 'PullRequest' },
	repository: { full_name: 'a/b' },
	labels: [{ name: 'bug', color: '' }],
	state: 'OPEN',
	draft: true,
	reviews: 4
} as unknown as Notification;
check(
	'filters match any value of one field and every field',
	matches(sample, [
		{ field: 'repo', value: 'x/y' },
		{ field: 'repo', value: 'a/b' },
		{ field: 'label', value: 'bug' }
	]) && !matches(sample, [
		{ field: 'repo', value: 'a/b' },
		{ field: 'label', value: 'docs' }
	])
);
check(
	'an open draft has the state draft, and 4 reviews count as 3+',
	matches(sample, [
		{ field: 'state', value: 'draft' },
		{ field: 'reviews', value: '3+' }
	]) && !matches(sample, [{ field: 'state', value: 'open' }])
);

// Oldest first: Waiting on me holds 1, 5, … 289, so its oldest is Note 289, on the last page.
click_test_id('sort-waiting');
await wait_for(() => has('Note 289'), { label: 'Waiting on me, oldest first' });
check(
	'oldest first puts the oldest card of the lane at its top',
	bounds(find_test_id('card-289')!)!.y < bounds(find_test_id('card-285')!)!.y && !has('Note 1')
);
check('a sort changes only its own lane', has('Note 2') && has('Note 4'));
check('the sort is saved', saved().settings.lane_sort.waiting === 'asc');

click_test_id('settings');
await wait_for(() => has('Cards per lane'), { label: 'the settings dialog' });
// The dialog covers the Waiting on me lane here; a wheel over it must not scroll the lane behind.
const behind = () => bounds(find_test_id('card-289')!)?.y;
const before = behind();
wheel({ x: 800, y: 400 }, 0, -300);
await wait(300);
check('a scroll over the settings leaves the board behind still', before !== undefined && behind() === before);
click_test_id('toggle-hide_done');
await wait_for(() => !has('Merged / Closed'), { label: 'the done lane hides' });
click_test_id('lane_size-25');
await wait_for(() => all_text().filter((t) => t === '25+').length === 3, { label: 'lanes of 25' });
check('settings change the board at once', !has('Merged / Closed') && !has('Note 120'));
check('settings are saved', saved().settings.hide_done === true && saved().settings.lane_size === 25);
press('escape');
await wait_for(() => !has('Cards per lane'), { label: 'Escape closes settings' });

await app.unmount();
app = mount_headless(App, { width: 1280, height: 800 });
await wait_for(() => has('Note 2'), { label: 'the board after a restart' });
check('a restart skips onboarding', !text().includes('Welcome to gitbox'));
// With lanes of 25, the start alone loads one batch; oldest first has to load the last page too.
await wait_for(() => has('Note 289'), { label: 'oldest first after a restart' });
check('a saved oldest first loads its whole lane after a restart', !has('Note 1'));
check('settings survive a restart', !has('Merged / Closed'));

click_test_id('settings');
await wait_for(() => has('Cards per lane'), { label: 'the settings dialog again' });
click_test_id('settings-reset');
press('escape');
await wait_for(() => has('Note 1'), { label: 'newest first again' });
check('Reset in Settings clears the lane sorts', Object.keys(saved().settings.lane_sort).length === 0);

delete process.env.FAKE_AUTHED;
click_test_id('refresh');
await wait_for(() => text().includes('Bad credentials'), { label: 'a broken gh' });
click_test_id('setup');
await wait_for(() => text().includes('gh auth login'), { label: 'onboarding again' });
check('run setup again clears the saved state', saved().onboarded === false);

// A card opens the subject's own page; an advisory, which comes with no URL, is found by its title.
const subject = (type: string, title: string, url: string | null) =>
	({ subject: { type, title, url }, repository: { full_name: 'octo/repo', html_url: 'https://github.com/octo/repo' } }) as Notification;
check(
	'an advisory card opens the advisory',
	(await link(subject('RepositoryAdvisory', 'Bad thing', null))) === 'https://github.com/octo/repo/security/advisories/GHSA-1'
);
check(
	'an advisory that is not found opens the advisory list',
	(await link(subject('RepositoryAdvisory', 'Unknown', null))) === 'https://github.com/octo/repo/security/advisories'
);
check(
	'a release card opens the release',
	(await link(subject('Release', 'v1', 'https://api.github.com/repos/octo/repo/releases/1'))) ===
		'https://github.com/octo/repo/releases/tag/v1'
);
check(
	'a PR card opens the PR',
	(await link(subject('PullRequest', 'x', 'https://api.github.com/repos/octo/repo/pulls/7'))) === 'https://github.com/octo/repo/pull/7'
);

finish('gitbox', 38);
