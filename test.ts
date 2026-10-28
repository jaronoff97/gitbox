import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mount_headless, click, click_test_id, hover, all_text, check, drag, finish, press, pump, type, wait, wait_for, wheel, find_test_id, bounds } from 'gpuix-svelte/test';
import App from './App.svelte';
import { matches } from './src/filters.ts';
import { score } from './src/fuzzy.ts';
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
	// The first page is where every load starts, so the test can count loads.
	if (page[1] === '1' && process.env.FAKE_LOG) require('fs').appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd }) + '\\n');
	const from = (page[1] - 1) * 50 + 1;
	const to = Math.min(from + 49, 290);
	console.log(JSON.stringify(Array.from({ length: Math.max(to - from + 1, 0) }, (_, k) => note(from + k))));
} else if (cmd === 'api --paginate --slurp repos/octo/repo/security-advisories?per_page=100') {
	console.log(JSON.stringify([[{ summary: 'Bad thing', html_url: 'https://github.com/octo/repo/security/advisories/GHSA-1' }]]));
} else if (cmd === 'api https://api.github.com/repos/octo/repo/releases/1 --jq .html_url') {
	console.log('https://github.com/octo/repo/releases/tag/v1');
} else if ((cmd.startsWith('api -X ') && cmd.includes(' notifications/threads/')) || /^(pr|issue) (close|reopen|comment) /.test(cmd)) {
	// Card actions (#2): logged for the test to read; thread 12 refuses to be marked done.
	const stdin = cmd.includes('--body-file -') ? require('fs').readFileSync(0, 'utf8') : undefined;
	require('fs').appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd, stdin }) + '\\n');
	if (cmd === 'api -X DELETE notifications/threads/12') { console.error('HTTP 403: Forbidden'); process.exit(1); }
	// FAKE_SLOW makes each action take 400 ms, so a test can see a bulk action's progress.
	if (process.env.FAKE_SLOW) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
	// As gh does, a new comment's URL on stdout.
	if (cmd.startsWith('pr comment')) console.log('https://github.com/octo/repo/pull/4#issuecomment-1');
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
// A fake `open` and `pbcopy` too, so the test opens no browser and leaves the clipboard alone.
for (const tool of ['open', 'pbcopy'])
	writeFileSync(
		join(bin, tool),
		`#!${process.execPath}
const stdin = ${JSON.stringify(tool)} === 'pbcopy' ? require('fs').readFileSync(0, 'utf8') : undefined;
require('fs').appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: ${JSON.stringify(tool)} + ' ' + process.argv.slice(2).join(' '), stdin }) + '\\n');
`,
		{ mode: 0o755 }
	);
process.env.FAKE_LOG = join(bin, 'calls.log');
/** What the fake tools were asked to do, in order. */
const calls = (): { cmd: string; stdin?: string }[] =>
	existsSync(process.env.FAKE_LOG!) ? readFileSync(process.env.FAKE_LOG!, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const called = (cmd: string) => calls().some((c) => c.cmd === cmd);
const settings_filters = () => JSON.parse(readFileSync(join(process.env.XDG_CONFIG_HOME!, 'gitbox', 'state.json'), 'utf8')).settings.filters.length;
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

// Card actions (#2): a right click opens the menu at the card.
const right_click = async (id: number) => {
	click_test_id(`card-${id}`, { button: 2 });
	await wait_for(() => has('Mark as Done'), { label: `the menu of card ${id}` });
};
await right_click(4);
check(
	'the menu of an open PR offers its actions',
	['Open in Browser', 'Copy Link', 'Mark as Read', 'Mark as Done', 'Unsubscribe', 'Comment…', 'Close pull request…'].every(has) &&
		!has('Reopen pull request')
);
click_test_id('menu-open');
await wait_for(() => called('open https://github.com/octo/repo/pull/4'), { label: 'open in the browser' });
check('Open in Browser opens the PR', !has('Mark as Done'));

await right_click(4);
click_test_id('menu-copy');
await wait_for(() => text().includes('Link copied'), { label: 'copy link' });
check('Copy Link puts the link on the clipboard', calls().some((c) => c.cmd === 'pbcopy ' && c.stdin === 'https://github.com/octo/repo/pull/4'));

await right_click(8);
click_test_id('menu-done');
await wait_for(() => !find_test_id('card-8'), { label: 'card 8 leaves at once' });
await wait_for(() => called('api -X DELETE notifications/threads/8') && text().includes('Marked as done'), { label: 'mark done' });
check('Mark as Done removes the card and tells GitHub', !find_test_id('card-8'));
check('the toast offers ⌘↩ to open what the action touched', has('⌘↩') && has('Open'));
press('cmd-enter');
await wait_for(() => called('open https://github.com/octo/repo/pull/8'), { label: '⌘↩ after done' });
check('⌘↩ opens the PR the action touched', called('open https://github.com/octo/repo/pull/8'));

await right_click(12);
click_test_id('menu-done');
await wait_for(() => text().includes('Could not mark as done: HTTP 403: Forbidden'), { label: 'a refused action' });
check('a refused action puts the card back and says why', find_test_id('card-12') !== null);

await right_click(24);
click_test_id('menu-read');
await wait_for(() => called('api -X PATCH notifications/threads/24'), { label: 'mark read' });
check('Mark as Read drops the card while read ones are hidden', !find_test_id('card-24'));

await right_click(20);
click_test_id('menu-unsubscribe');
await wait_for(() => called('api -X DELETE notifications/threads/20'), { label: 'unsubscribe' });
check('Unsubscribe mutes the thread, then marks it done', called('api -X PUT notifications/threads/20/subscription -F ignored=true') && !find_test_id('card-20'));

await right_click(16);
click_test_id('menu-close');
await wait_for(() => has('Close this pull request?'), { label: 'the close confirmation' });
check('Close asks first', !called('pr close https://github.com/octo/repo/pull/16'));
click_test_id('confirm-close');
await wait_for(() => called('pr close https://github.com/octo/repo/pull/16'), { label: 'close' });
await wait_for(() => in_lane(16, 'done'), { label: 'the closed PR moves lanes' });
check('a closed PR moves to Merged / Closed', in_lane(16, 'done'));
await right_click(16);
check('a closed PR offers Reopen', has('Reopen pull request') && !has('Close pull request…'));
click_test_id('menu-reopen');
await wait_for(() => called('pr reopen https://github.com/octo/repo/pull/16') && in_lane(16, 'requested'), { label: 'reopen' });
click(find_test_id('toast-open', { last: true })!);
await wait_for(() => called('open https://github.com/octo/repo/pull/16'), { label: 'a click on the toast' });
check('a click on the toast opens its page', called('open https://github.com/octo/repo/pull/16'));

await right_click(4);
click_test_id('menu-comment');
await wait_for(() => has('Comment on octo/repo #4'), { label: 'the comment dialog' });
// Quotes and a line break would break a command line; through stdin they arrive as typed. (The test
// keyboard types shift-' as ', not ".)
type("h i space ' a ' enter b");
await wait(50);
// ⌘↩ in the text field sends; it must not also open an older toast's page.
const opens = calls().filter((c) => c.cmd.startsWith('open ')).length;
press('cmd-enter');
await wait_for(() => called('pr comment https://github.com/octo/repo/pull/4 --body-file -'), { label: 'comment' });
check('⌘↩ in the comment field sends, and opens nothing', calls().filter((c) => c.cmd.startsWith('open ')).length === opens);
check(
	'a comment reaches gh unchanged, through stdin',
	calls().find((c) => c.cmd.startsWith('pr comment'))?.stdin === "hi 'a'\nb"
);
await wait_for(() => !has('Comment on octo/repo #4'), { label: 'the dialog closes after sending' });
press('cmd-enter');
await wait_for(() => called('open https://github.com/octo/repo/pull/4#issuecomment-1'), { label: '⌘↩ after a comment' });
check('⌘↩ after a comment opens the new comment', called('open https://github.com/octo/repo/pull/4#issuecomment-1'));

// Multi-select (#3): ⌘-click toggles, ⇧-click adds a range in the lane, and a plain click still opens.
const opened = () => calls().filter((c) => c.cmd.startsWith('open ')).length;
const before_select = opened();
click_test_id('card-6', { modifiers: 'cmd' });
await wait_for(() => has('1 selected'), { label: 'a ⌘-click selects' });
click_test_id('card-4', { modifiers: 'cmd' });
click_test_id('card-28', { modifiers: 'shift' });
await wait_for(() => has('5 selected'), { label: 'a ⇧-click range' });
check('⇧-click selects the range in the lane order', has('4 selected') && has('5 selected'));
click_test_id('card-16', { modifiers: 'cmd' });
await wait_for(() => has('4 selected'), { label: 'a ⌘-click deselects' });
check('selecting opens nothing', opened() === before_select);

await scroll_lane('requested', 3);
check('a selection keeps cards that scroll out of view', has('4 selected') && !find_test_id('card-4'));
for (let k = 0; k < 6; k++) {
	wheel(find_test_id('lane-requested')!, 0, 2000);
	await wait(40);
	pump();
}
await wait_for(() => find_test_id('card-4') !== null, { label: 'back at the top of Requested' });

// A right click on a selected card acts on the whole selection; thread 12 refuses to be done.
click_test_id('card-12', { button: 2 });
await wait_for(() => has('Mark 4 as Done'), { label: 'the menu for the selection' });
click_test_id('menu-done');
await wait_for(() => text().includes('1 of 4 failed: HTTP 403: Forbidden'), { label: 'a bulk done with one failure' });
check(
	'a bulk action calls gh once for each card',
	[6, 4, 12, 28].every((id) => called(`api -X DELETE notifications/threads/${id}`))
);
check(
	'only the card whose call failed comes back, and stays selected',
	!find_test_id('card-6') && !find_test_id('card-4') && !find_test_id('card-28') && find_test_id('card-12') !== null && has('1 selected')
);
press('escape');
await wait_for(() => !has('1 selected'), { label: 'Escape clears the selection' });

// Close needs open PRs or issues: a merged PR in the selection disables it.
click_test_id('card-3', { modifiers: 'cmd' });
click_test_id('card-32', { modifiers: 'cmd' });
await wait_for(() => has('2 selected'), { label: 'a merged and an open PR' });
click_test_id('bulk-close');
await wait(100);
check('Close is disabled while the selection has a merged PR', !has('Close 2 pull requests?'));
click_test_id('bulk-clear');
click_test_id('card-32', { modifiers: 'cmd' });
click_test_id('card-36', { modifiers: 'cmd' });
await wait_for(() => has('2 selected'), { label: 'two open PRs' });
click_test_id('bulk-close');
await wait_for(() => has('Close 2 pull requests?'), { label: 'the bulk close confirmation' });
click_test_id('confirm-close');
await wait_for(() => called('pr close https://github.com/octo/repo/pull/32') && called('pr close https://github.com/octo/repo/pull/36'), { label: 'bulk close' });
// gh logs a call just before it exits, so the app may still be finishing: wait for the selection to clear.
await wait_for(() => !has('2 selected'), { label: 'the bulk close finishes' });
// They sort below the fold of Merged / Closed, so the check is that they left Requested.
await wait_for(() => !in_lane(32, 'requested') && !in_lane(36, 'requested'), { label: 'closed PRs leave Requested' });
check('a bulk close closes each PR and clears the selection', !has('2 selected'));

click_test_id('card-10', { modifiers: 'cmd' });
click_test_id('card-14', { modifiers: 'cmd' });
await wait_for(() => has('2 selected'), { label: 'two todo cards' });
click_test_id('bulk-copy');
await wait_for(() => text().includes('Copied 2 links'), { label: 'copy links' });
check(
	'Copy Links puts every link on the clipboard, one a line',
	calls().some((c) => c.cmd === 'pbcopy ' && c.stdin === 'https://github.com/octo/repo/pull/10\nhttps://github.com/octo/repo/pull/14')
);
click_test_id('bulk-clear');

// Progress: with each call 400 ms, the bar counts them as they come back.
process.env.FAKE_SLOW = '1';
click_test_id('card-10', { modifiers: 'cmd' });
click_test_id('card-14', { modifiers: 'cmd' });
await wait_for(() => has('2 selected'), { label: 'two todo cards again' });
click_test_id('bulk-done');
await wait_for(() => text().includes('Marking 2 as done… 0/2'), { label: 'the bar shows progress' });
await wait_for(() => text().includes('Marked as done (2)'), { label: 'the bulk done finishes', timeout: 4000 });
check('a bulk action shows its progress, then a toast', !find_test_id('card-10') && !find_test_id('card-14'));
delete process.env.FAKE_SLOW;

// ⌘A: the lane under the pointer, then the whole board; Open past 10 tabs asks first.
hover(find_test_id('lane-todo')!);
press('cmd-a');
const picked = () => all_text().filter((t) => / selected$/.test(t)).map((t) => parseInt(t));
await wait_for(() => picked().length === 2, { label: '⌘A selects the lane' });
check('⌘A selects the lane under the pointer', picked()[0] === picked()[1] && picked()[0] > 10);
const lane_count = picked()[0];
press('cmd-a');
await wait_for(() => Math.max(...picked()) > lane_count, { label: '⌘A again selects the board' });
check('⌘A again selects every card on the board', Math.max(...picked()) === picked().reduce((a, b) => a + b, 0) - Math.max(...picked()));
const before_open = opened();
click_test_id('bulk-open');
await wait_for(() => /^Open \d+ tabs\?$/.test(text().split('\n').find((t) => t.startsWith('Open ') && t.endsWith('tabs?')) ?? ''), { label: 'Open asks past 10 tabs' });
click_test_id('open-cancel');
await wait(100);
check('Open past 10 tabs asks first, and Cancel opens nothing', opened() === before_open);
press('escape');
await wait_for(() => picked().length === 0, { label: 'Escape clears it all' });

// Commands (#4): every shortcut runs a command from the registry.
const loads = () => calls().filter((c) => c.cmd === 'api notifications?per_page=50&page=1').length;
const loads_before = loads();
press('cmd-r');
await wait_for(() => loads() > loads_before, { label: '⌘R' });
check('⌘R refreshes, through the registry', loads() === loads_before + 1);
await wait_for(() => !text().includes('loading…'), { label: 'the refresh settles' });
press('cmd-2');
await wait_for(() => !has('Requested'), { label: '⌘2 hides Requested' });
check('⌘2 hides the second lane, and only it', !has('Requested') && has('Todo') && has('Waiting on me'));
press('cmd-2');
await wait_for(() => has('Requested'), { label: '⌘2 shows it again' });
press('cmd-/');
await wait_for(() => has('Keyboard Shortcuts'), { label: '⌘/' });
check(
	'⌘/ lists the shortcuts, with their keys',
	['Refresh', 'Settings…', 'Select All Cards', 'Show Requested', 'Clear Selection'].every(has) && has('⌘') && has('R')
);
press('escape');
await wait_for(() => !has('Keyboard Shortcuts'), { label: 'Escape closes the shortcuts' });
// ⌘A in a text field selects the text, not cards.
click_test_id('add-filter');
await wait_for(() => has('Repository'), { label: 'the filter menu, for its search' });
click_test_id('field-repo');
await wait_for(() => find_test_id('filter-search') !== null, { label: 'the search box' });
click_test_id('filter-search');
press('cmd-a');
await wait(100);
check('⌘A in a text field selects no cards', !all_text().some((t) => / selected$/.test(t)));
press('escape');
await wait(100);

// Keyboard navigation (#5): the board's focus is a card; keys move it and act on it.
const times = (cmd: string) => calls().filter((c) => c.cmd === cmd).length;
const open_count = (id: number) => times(`open https://github.com/octo/repo/pull/${id}`);
const last_open = () => calls().filter((c) => c.cmd.startsWith('open ')).at(-1)?.cmd ?? '';
press('escape');
press('escape');
hover(find_test_id('lane-todo')!);
press('j');
press('j');
press('enter');
await wait_for(() => open_count(6) === 1, { label: 'j j ↩' });
check('the first j focuses the lane under the pointer, j moves down, ↩ opens', last_open().endsWith('/pull/6'));
const fours = open_count(4);
press('l');
press('k');
press('enter');
await wait_for(() => open_count(4) > fours, { label: 'l k ↩' });
check('l moves to the next lane at the same row, k moves up', last_open().endsWith('/pull/4'));

// Keys typed into a text field don't move the board.
click_test_id('add-filter');
await wait_for(() => has('Repository'), { label: 'the filter menu' });
click_test_id('field-repo');
await wait_for(() => find_test_id('filter-search') !== null, { label: 'the search' });
type('j j');
press('escape');
await wait(100);
press('enter');
await wait_for(() => open_count(4) > fours + 1, { label: '↩ after typing in the search' });
check('j typed in the search leaves the focus where it was', last_open().endsWith('/pull/4'));

// The filter menu by keyboard: ↓ ↩ opens the second field, ↩ toggles its first value, ⌘[ goes back.
click_test_id('add-filter');
await wait_for(() => has('Repository'), { label: 'the filter menu again' });
press('down');
press('enter');
await wait_for(() => has('pull request'), { label: 'the Type values' });
press('enter');
await wait_for(() => find_test_id('chip-type-pull request') !== null, { label: 'a chip from the keyboard' });
press('cmd-[');
await wait_for(() => has('Repository'), { label: '⌘[ goes back to the fields' });
check('the filter menu works from the keyboard', find_test_id('chip-type-pull request') !== null);
press('escape');
await wait(100);
click_test_id('chip-type-pull request');
press('backspace');
await wait_for(() => !find_test_id('chip-type-pull request'), { label: '⌫ on a chip' });
check('⌫ on a focused chip removes it', settings_filters() === 0);

// Card keys: e marks the focused card done and the focus moves to the card in its place.
press('k');
const done_4 = times('api -X DELETE notifications/threads/4');
press('e');
await wait_for(() => times('api -X DELETE notifications/threads/4') > done_4, { label: 'e' });
const eights = open_count(8);
press('enter');
await wait_for(() => open_count(8) > eights, { label: '↩ after e' });
check('e marks the focused card done, and the next card takes the focus', last_open().endsWith('/pull/8'));

// Shift+F10 opens the menu at the focused card; ↩ runs its first item.
press('shift-f10');
await wait_for(() => has('Mark as Done'), { label: 'Shift+F10' });
press('enter');
await wait_for(() => open_count(8) > eights + 1, { label: '↩ in the menu' });
check('Shift+F10 opens the card menu, and ↩ runs its first item', !has('Mark as Done'));
press('c');
await wait_for(() => has('Comment on octo/repo #8'), { label: 'c' });
check('c opens the comment dialog for the focused card', has('Comment on octo/repo #8'));
press('escape');
await wait(100);

// ⌘↓: the end of the lane, which asks for more as a scroll to the end does.
press('cmd-down');
press('enter');
await wait_for(() => !last_open().endsWith('/pull/8'), { label: '⌘↓ ↩' });
check('⌘↓ goes to the end of the lane', Number(last_open().split('/').pop()) > 150);
press('escape');

// The ⌘K palette (#6): commands from the registry, filters, lanes and notifications.
check(
	'the fuzzy match: in order, word starts and runs first',
	score('xyz', 'Refresh') === null &&
		score('sc', 'Show Commands')! > score('sc', 'Disconnect')! &&
		score('ref', 'Refresh')! > score('ref', 'Rename Filter')!
);
const palette = async (keys: string) => {
	press('cmd-k');
	await wait_for(() => find_test_id('palette') !== null, { label: '⌘K' });
	await wait(50);
	if (keys) type(keys);
	await wait(50);
};
const loads_6 = loads();
await palette('r e f r');
await wait_for(() => has('Refresh'), { label: 'Refresh in the palette' });
press('enter');
await wait_for(() => loads() > loads_6, { label: '⌘K refr ↩' });
check('a command runs from the palette as its shortcut does', !find_test_id('palette'));
await wait_for(() => !text().includes('loading…'), { label: 'the refresh settles' });

await palette('o t h e r');
await wait_for(() => has('Filter: Repository octo/other'), { label: 'a filter in the palette' });
press('enter');
await wait_for(() => find_test_id('chip-repo-octo/other') !== null, { label: 'the filter from the palette' });
check('a "Filter:" entry adds the filter', find_test_id('chip-repo-octo/other') !== null);
press('alt-cmd-f');
await wait_for(() => !find_test_id('chip-repo-octo/other'), { label: '⌥⌘F clears the filters' });

const twelves = open_count(12);
await palette('n o t e space 1 2');
await wait_for(() => has('Open: Note 12'), { label: 'a notification in the palette' });
press('enter');
await wait_for(() => open_count(12) > twelves, { label: 'open from the palette' });
check('an "Open:" entry opens the notification', last_open().endsWith('/pull/12'));

const loads_6b = loads();
await palette('');
press('enter');
await wait_for(() => loads() > loads_6b, { label: 'the recent command first' });
check('the empty palette starts with the last command run', !find_test_id('palette'));
await wait_for(() => !text().includes('loading…'), { label: 'that refresh settles' });

click_test_id('add-filter');
await wait_for(() => has('Repository'), { label: 'the filter menu' });
click_test_id('field-repo');
await wait_for(() => find_test_id('filter-search') !== null, { label: 'its search' });
press('cmd-k');
await wait_for(() => find_test_id('palette') !== null, { label: '⌘K from a text field' });
check('⌘K opens the palette while a text field has the focus', find_test_id('palette') !== null);
press('escape');
await wait(100);
press('escape');
await wait(100);

// The palette owns the arrow keys: ↓ moves its list, not the board's focus.
const opens_6 = calls().filter((c) => c.cmd.startsWith('open ')).length;
press('escape');
hover(find_test_id('lane-todo')!);
await palette('');
press('down');
press('down');
press('escape');
await wait(100);
press('enter');
await wait(150);
check('arrows in the palette leave the board alone', calls().filter((c) => c.cmd.startsWith('open ')).length === opens_6);

click_test_id('settings');
await wait_for(() => has('Cards per lane'), { label: 'the settings dialog' });
// The dialog covers the Waiting on me lane here; a wheel over it must not scroll the lane behind.
const behind = () => bounds(find_test_id('card-289')!)?.y;
const before = behind();
wheel({ x: 800, y: 400 }, 0, -300);
await wait(300);
check('a scroll over the settings leaves the board behind still', before !== undefined && behind() === before);
click_test_id('toggle-hide-done');
await wait_for(() => !has('Merged / Closed'), { label: 'the done lane hides' });
click_test_id('lane_size-25');
await wait_for(() => all_text().filter((t) => t === '25+').length === 3, { label: 'lanes of 25' });
check('settings change the board at once', !has('Merged / Closed') && badges('25+') === 3);
check('settings are saved', saved().settings.lanes.find((l: { key: string }) => l.key === 'done').shown === false && saved().settings.lane_size === 25);
press('escape');
await wait_for(() => !has('Cards per lane'), { label: 'Escape closes settings' });

// The settings dialog by keyboard: the focus starts on its first control; Space picks, → moves on.
press('cmd-,');
await wait_for(() => has('Cards per lane'), { label: '⌘, opens settings' });
// The dialog takes the focus a tick after it mounts, when its controls exist natively.
await wait(100);
press('right');
await wait(100);
check('→ on a choice picks the next option', saved().settings.lane_size === 50);
press('left');
await wait(100);
check('← picks the one before', saved().settings.lane_size === 25);
press('escape');
await wait_for(() => !has('Cards per lane'), { label: 'Escape closes settings again' });

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

// Onboarding by keyboard (#5): ↩ checks again, then ↩ shows the notifications.
process.env.FAKE_AUTHED = '1';
press('enter');
await wait_for(() => has('Show notifications'), { label: '↩ checks again' });
press('enter');
await wait_for(() => has('Todo'), { label: '↩ shows the board' });
check('onboarding works from the keyboard', saved().onboarded === true);

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

finish('gitbox', 89);
