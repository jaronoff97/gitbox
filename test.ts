import { all_text, bounds, check, click, click_test_id, drag, find_all, find_test_id, finish, hover, mount_headless, press, pump, screenshot, type, wait, wait_for, wheel } from 'gpuix-svelte/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import App from './App.svelte';
import { automations, check as check_automations, put } from './src/automations.svelte.ts';
import { matches } from './src/filters.ts';
import { score } from './src/fuzzy.ts';
import { link, type Notification } from './src/gh.ts';
import { menu_json } from './src/menubar.ts';
import { update } from './src/settings.svelte.ts';
import { palette as colors } from './src/theme.ts';

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
	// FAKE_SLOW_PAGES makes each page take 300 ms, so a test can see a refresh in progress.
	if (process.env.FAKE_SLOW_PAGES) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
	const from = (page[1] - 1) * 50 + 1;
	const to = Math.min(from + 49, 290);
	console.log(JSON.stringify(Array.from({ length: Math.max(to - from + 1, 0) }, (_, k) => note(from + k))));
} else if (cmd === 'api --paginate --slurp repos/octo/repo/security-advisories?per_page=100') {
	console.log(JSON.stringify([[{ summary: 'Bad thing', html_url: 'https://github.com/octo/repo/security/advisories/GHSA-1' }]]));
} else if (cmd === 'api https://api.github.com/repos/octo/repo/releases/1 --jq .html_url') {
	console.log('https://github.com/octo/repo/releases/tag/v1');
} else if (cmd.startsWith('pr diff ')) {
	// A PR for the Whiteboard draft: a file with two hunks, a deleted file and a lock file.
	console.log(['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +1,3 @@', ' a', '+b', ' c', '@@ -10,2 +10,4 @@', ' x', '+y', '+z', ' w',
		'diff --git a/old.ts b/old.ts', 'deleted file mode 100644', '--- a/old.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-gone', '-too',
		'diff --git a/package-lock.json b/package-lock.json', '--- a/package-lock.json', '+++ b/package-lock.json', '@@ -1 +1 @@', '-1', '+2'].join('\\n'));
} else if (cmd.startsWith('pr view ')) {
	console.log(JSON.stringify({ title: 'Note 4', body: 'Why it changes.' }));
} else if ((cmd.startsWith('api -X ') && cmd.includes(' notifications/threads/')) || /^(pr|issue) (close|reopen|comment|review) /.test(cmd)) {
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
// A fake `fm` (Apple's on-device model, #chat): it echoes the prompt with the turn, which it keeps in
// the transcript file, and logs the call with its instructions. FAKE_NO_FM makes the model missing.
writeFileSync(
  join(bin, 'fm'),
  `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
if (args[0] === 'available') {
	if (process.env.FAKE_NO_FM) { console.error('\\x1b[31mApple Intelligence is not enabled\\x1b[0m'); process.exit(1); }
	console.log('System model available');
} else if (args[0] === 'respond' && args.includes('--guardrails')) {
	// A one-shot question for a Whiteboard draft: a file's summary, the opening, or what to check
	// (quoted, with a bullet inside, as the real model sometimes answers).
	const prompt = fs.readFileSync(0, 'utf8');
	const ins = opt('--instructions');
	fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: 'fm once', instructions: ins }) + '\\n');
	if (ins.includes('one file')) process.stdout.write('It changes ' + prompt.match(/^File: (\\S+)/m)[1] + '.');
	else if (ins.includes('opening')) process.stdout.write('It adds a feature.');
	else process.stdout.write('"- Check A."\\n- "Check B."');
} else if (args[0] === 'respond') {
	const prompt = fs.readFileSync(0, 'utf8');
	const turn = (opt('--resume') ? JSON.parse(fs.readFileSync(opt('--resume'), 'utf8')).turn : 0) + 1;
	fs.writeFileSync(opt('--save-transcript'), JSON.stringify({ turn }));
	fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: 'fm respond', stdin: prompt, instructions: opt('--instructions') }) + '\\n');
	if (prompt === 'fail') { console.error('Error: \\x1b[31mThe model refused\\x1b[0m'); process.exit(1); }
	process.stdout.write('You said ' + prompt + ', turn ' + turn);
	console.error('Transcript saved to: ' + opt('--save-transcript'));
}
`,
  { mode: 0o755 }
);
// A fake `whiteboard` CLI (#22): not running until `app launch`; session_create makes the PR's board
// the first time and returns it after. Every call goes to the log, with its JSON input as stdin.
writeFileSync(
  join(bin, 'whiteboard'),
  `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
const up = __dirname + '/whiteboard-up';
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: 'whiteboard ' + args.slice(0, 2).join(' '), stdin: args[2] }) + '\\n');
if (args[0] === 'app' && args[1] === 'launch') {
	fs.writeFileSync(up, '');
	console.log(JSON.stringify({ event: 'launched' }));
} else if (args[0] === 'api') {
	if (!fs.existsSync(up)) { console.error('Whiteboard stable is not running. Start it with whiteboard app launch.'); process.exit(1); }
	if (args[1] === 'session_list') console.log('[]');
	else if (args[1] === 'session_create') {
		// One board per PR: s-<number>.
		const id = 's-' + JSON.parse(args[2]).target.pullRequest.split('/').pop();
		const again = fs.existsSync(up + '-made-' + id);
		fs.writeFileSync(up + '-made-' + id, '');
		console.log(JSON.stringify({ created: !again, sessionId: id, opened: !again }));
	} else if (args[1] === 'session_open') console.log('{}');
	// A board is empty until its first edit.
	else if (args[1] === 'session_get') console.log(fs.existsSync(up + '-edits-' + JSON.parse(args[2]).sessionId) ? '{"0":{"id":"block-1"}}' : '{}');
	else if (args[1] === 'session_activity_begin') console.log('{"activityId":"a-1"}');
	else if (args[1] === 'session_activity_end') console.log('{}');
	else if (args[1] === 'session_edit') {
		const edits = up + '-edits-' + JSON.parse(args[2]).sessionId;
		const k = (fs.existsSync(edits) ? +fs.readFileSync(edits, 'utf8') : 0) + 1;
		fs.writeFileSync(edits, String(k));
		console.log(JSON.stringify({ targetId: 'block-' + k, children: [{ id: 'block-' + k + '-1', type: 'markdown' }] }));
	}
}
`,
  { mode: 0o755 }
);
// Fake agent CLIs (Settings → Models): Claude streams its reply and names its session; Codex names a
// thread and fails on "fail" as Codex does, with the API's error inside its message. In Whiteboard mode
// Claude calls a Whiteboard tool. Each call is logged with its arguments, stdin and folder.
writeFileSync(
	join(bin, 'claude'),
	`#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
const input = fs.readFileSync(0, 'utf8');
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: 'claude', args, stdin: input, cwd: process.cwd() }) + '\\n');
const out = (e) => console.log(JSON.stringify({ ...e, session_id: 'claude-1' }));
if (args.includes('--allowedTools')) {
	out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__plugin_whiteboard_whiteboard__session_edit' }] } });
	out({ type: 'result', subtype: 'success', is_error: false, result: 'Done.' });
} else {
	const reply = 'Claude says ' + input + (args.includes('--resume') ? ' again' : '');
	out({ type: 'stream_event', event: { type: 'message_start' } });
	out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: reply } } });
	out({ type: 'result', subtype: 'success', is_error: false, result: reply });
}
`,
	{ mode: 0o755 }
);
writeFileSync(
	join(bin, 'codex'),
	`#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
const input = fs.readFileSync(0, 'utf8');
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: 'codex', args, stdin: input, cwd: process.cwd() }) + '\\n');
const out = (e) => console.log(JSON.stringify(e));
if (args[1] !== 'resume') out({ type: 'thread.started', thread_id: 'codex-1' });
if (input === 'fail') {
	out({ type: 'turn.failed', error: { message: JSON.stringify({ type: 'error', status: 400, error: { message: "The 'x' model is not supported." } }) } });
	process.exit(1);
}
out({ type: 'item.completed', item: { type: 'agent_message', text: 'Codex says ' + input.split('\\n').pop() } });
`,
	{ mode: 0o755 }
);
process.env.FAKE_LOG = join(bin, 'calls.log');
/** What the fake tools were asked to do, in order. */
const calls = (): { cmd: string; stdin?: string; instructions?: string }[] =>
  existsSync(process.env.FAKE_LOG!) ? readFileSync(process.env.FAKE_LOG!, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const called = (cmd: string) => calls().some((c) => c.cmd === cmd);
const settings_filters = () => JSON.parse(readFileSync(join(process.env.XDG_CONFIG_HOME!, 'gitbox', 'state.json'), 'utf8')).settings.filters.length;
process.env.PATH = `${bin}:${process.env.PATH}`;
// No native menu bar in a headless run; menu_json() is checked below instead.
process.env.GITBOX_NO_MENU = '1';
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

let app = mount_headless(App, { width: 1470, height: 800 });

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
check('a card shows its PR’s number after the repository', has('#4') && has('#1'));
if (process.env.SHOT) screenshot(process.env.SHOT.replace('.png', '-cards.png'));
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

// The menu bar (#7) comes from the registry: menus in the macOS order, ⌘ keys as key equivalents,
// single keys and the ones a text field needs (⌘A, ⌘↩) as hints only, toggles with their check.
{
  const menus = menu_json();
  const find = (menu: string, title: string) => menus.find((m) => m.title === menu)?.items.find((i) => i.title === title);
  check(
    'the menu bar has the Mac menus in order',
    menus.map((m) => m.title).join(',') === 'Gitbox,File,Edit,View,Go,Notification,Window,Help'
  );
  check(
    '⌘ shortcuts are key equivalents; single keys and ⌘A are hints',
    find('File', 'Refresh')?.keys === 'cmd-r' &&
    find('Go', 'Next Card')?.hint === 'J' &&
    !find('Go', 'Next Card')?.keys &&
    find('Edit', 'Select All Cards')?.hint === '⌘A' &&
    !find('Edit', 'Select All Cards')?.keys
  );
  check(
    'toggles carry their state, and the standard items their roles',
    find('View', 'Show Todo')?.checked === true &&
    find('Gitbox', 'Quit Gitbox')?.role === 'quit' &&
    find('Edit', 'Copy')?.role === 'copy' &&
    !find('Edit', 'Copy')?.keys
  );
}

const dialog_open = () => find_test_id('settings-dialog') !== null;
click_test_id('settings');
await wait_for(dialog_open, { label: 'the settings dialog' });
// The dialog covers the Waiting on me lane here; a wheel over it must not scroll the lane behind.
const behind = () => bounds(find_test_id('card-289')!)?.y;
const before = behind();
wheel({ x: 800, y: 400 }, 0, -300);
await wait(300);
check('a scroll over the settings leaves the board behind still', before !== undefined && behind() === before);

// Settings in tabs (#8). Board: lanes on and off, their order and sort; cards per lane.
click_test_id('tab-board');
await wait_for(() => has('Cards per lane'), { label: 'the Board tab' });
click_test_id('lane-shown-done');
await wait_for(() => !find_test_id('lane-done'), { label: 'the done lane hides' });
click_test_id('lane_size-25');
await wait_for(() => all_text().filter((t) => t === '25+').length === 3, { label: 'lanes of 25' });
check('settings change the board at once', !find_test_id('lane-done') && badges('25+') === 3);
check('settings are saved', saved().settings.lanes.find((l: { key: string }) => l.key === 'done').shown === false && saved().settings.lane_size === 25);
const x = (key: string) => bounds(find_test_id(`lane-${key}`)!)!.x;
click_test_id('lane-up-waiting');
await wait_for(() => x('waiting') < x('requested'), { label: 'Waiting on me moves left' });
check(
  '↑ moves a lane earlier on the board, and the order is saved',
  saved().settings.lanes.map((l: { key: string }) => l.key).join(',') === 'todo,waiting,requested,done'
);
click_test_id('lane-down-waiting');
await wait_for(() => x('waiting') > x('requested'), { label: 'and back' });

// Appearance: density and text size change a card's size; the theme is saved, and its palettes differ.
click_test_id('tab-appearance');
await wait_for(() => has('Theme'), { label: 'the Appearance tab' });
const card_h = () => bounds(find_test_id('card-2')!)!.height;
const h0 = card_h();
click_test_id('density-compact');
await wait_for(() => card_h() < h0, { label: 'compact cards' });
click_test_id('density-comfortable');
await wait_for(() => card_h() === h0, { label: 'comfortable again' });
click_test_id('text_size-1.3');
await wait_for(() => card_h() > h0, { label: 'larger text' });
check('density and text size change the cards', card_h() > h0 && saved().settings.text_size === 1.3);
click_test_id('text_size-1');
click_test_id('theme-light');
await wait(100);
check('the theme is saved, and light and dark differ', saved().settings.theme === 'light' && colors(false).bg !== colors(true).bg);
click_test_id('theme-dark');

// Shortcuts: the registry's list, and single keys off.
click_test_id('tab-shortcuts');
await wait_for(() => has('Single-key shortcuts'), { label: 'the Shortcuts tab' });
check('the Shortcuts tab lists the commands', ['Next Card', 'Refresh', 'Command Palette…'].every(has));
click_test_id('toggle-single_keys');
press('escape');
await wait_for(() => !dialog_open(), { label: 'Escape closes settings' });
const opens_8 = calls().filter((c) => c.cmd.startsWith('open ')).length;
hover(find_test_id('lane-todo')!);
press('escape');
press('j');
press('enter');
await wait(150);
check('with single keys off, j does nothing', calls().filter((c) => c.cmd.startsWith('open ')).length === opens_8);

// The dialog opens on the last tab; ⌘] goes to the next.
press('cmd-,');
await wait_for(() => has('Single-key shortcuts'), { label: '⌘, opens on the last tab' });
click_test_id('toggle-single_keys');
press('cmd-]');
await wait_for(() => has('Whiteboard drafts'), { label: '⌘] goes to Models' });
check('the dialog remembers its tab, and ⌘] moves on', saved().settings.single_keys === true);
// Models: the agents found on PATH (here fm, claude and codex, all fakes); an agent's model is a field.
check('Models offers the agents on PATH', badges('Apple') === 2 && badges('Claude') === 2 && badges('Codex') === 2 && !find_test_id('chat-model'));
click_test_id('chat_agent-claude');
pump();
if (process.env.SHOT) screenshot(process.env.SHOT.replace('.png', '-models.png'));
check('an agent gets a model field, and the choice is saved', !!find_test_id('chat-model') && saved().settings.chat_agent === 'claude');
click_test_id('chat_agent-fm');
press('cmd-]');
await wait_for(() => has('Pages fetched at once'), { label: '⌘] goes to Advanced' });

// The dialog by keyboard: its first control (a tab) has the focus; ← and → change tabs, and on a
// choice they change the option.
press('escape');
await wait_for(() => !dialog_open(), { label: 'closed' });
press('cmd-,');
await wait_for(dialog_open, { label: '⌘, opens settings' });
// The dialog takes the focus a tick after it mounts, when its controls exist natively.
await wait(100);
press('left');
await wait_for(() => has('Whiteboard drafts'), { label: '← on the tabs' });
check('← and → on the tabs change the tab', has('Whiteboard drafts'));
click_test_id('tab-board');
await wait_for(() => has('Cards per lane'), { label: 'the Board tab again' });
click_test_id('lane_size-25');
press('right');
await wait(100);
check('→ on a choice picks the next option', saved().settings.lane_size === 50);
press('left');
await wait(100);
check('← picks the one before', saved().settings.lane_size === 25);
press('escape');
await wait_for(() => !dialog_open(), { label: 'Escape closes settings again' });

await app.unmount();
app = mount_headless(App, { width: 1470, height: 800 });
await wait_for(() => has('Note 2'), { label: 'the board after a restart' });
check('a restart skips onboarding', !text().includes('Welcome to gitbox'));
// With lanes of 25, the start alone loads one batch; oldest first has to load the last page too.
await wait_for(() => has('Note 289'), { label: 'oldest first after a restart' });
check('a saved oldest first loads its whole lane after a restart', !has('Note 1'));
check('settings survive a restart', !find_test_id('lane-done'));

click_test_id('settings');
await wait_for(dialog_open, { label: 'the settings dialog again' });
click_test_id('tab-advanced');
await wait_for(() => find_test_id('settings-reset') !== null, { label: 'the Advanced tab' });
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

// Background jobs: a refresh shows its progress in the top-right corner, and Refresh (the button and
// ⌘R) waits for it rather than starting it over.
await wait_for(() => !find_test_id('job'), { label: 'no load in progress' });
process.env.FAKE_SLOW_PAGES = '1';
const loads_at_refresh = loads();
click_test_id('refresh');
await wait_for(() => has('Refreshing inbox'), { label: 'the refresh popup' });
if (process.env.SHOT) screenshot(process.env.SHOT.replace('.png', '-job.png'));
check('a refresh shows its progress in the corner', has('Starting…') && (bounds(find_test_id('job')!)?.x ?? 0) > 1100);
click_test_id('refresh');
press('cmd-r');
await wait_for(() => !find_test_id('job'), { timeout: 8000, label: 'the refresh ends' });
delete process.env.FAKE_SLOW_PAGES;
check('Refresh waits for the load in progress', loads() === loads_at_refresh + 1);

// The sidebar: Automations and Chat cover the board, which stays loaded behind them, keys and all.
await wait_for(() => !!find_test_id('card-4'), { label: 'the board again' });
click_test_id('nav-automations');
pump();
const calls_before = calls().length;
press('enter');
await wait(100);
check('Automations hides the board and rests its keys', badges('Automations') === 2 && !bounds(find_test_id('card-4')!) && calls().length === calls_before);
if (process.env.SHOT) screenshot(process.env.SHOT);
press('ctrl-3');
pump();
check('ctrl-3 opens Chat', badges('Chat') === 2 && badges('Automations') === 1);
press('ctrl-1');
pump();
click(find_test_id('card-4')!);
await wait_for(() => calls().length > calls_before, { label: 'a card opens again' });
check('the board is back as it was', badges('50+') === 4);

// Automations: a condition per row, its field from a menu, then the steps; saved in automations.json.
const automations_json = () => JSON.parse(readFileSync(join(process.env.XDG_CONFIG_HOME!, 'gitbox', 'automations.json'), 'utf8'));
click_test_id('nav-automations');
click_test_id('new-automation');
pump();
click_test_id('automation-name');
type('b o b');
click_test_id('add-condition');
pump();
click_test_id('cond-value-1');
type('b o b');
click_test_id('add-condition');
pump();
click_test_id('cond-field-2');
pump();
click_test_id('cond-pick-org');
pump();
click_test_id('cond-value-2');
type('shift-o c t o');
click_test_id('step-done');
if (process.env.SHOT) screenshot(process.env.SHOT.replace('.png', '-editor.png'));
click_test_id('automation-save');
pump();
const made = automations_json()[0];
check(
  'a new automation is saved with its conditions and steps',
  made?.name === 'bob' &&
  JSON.stringify(made.when) ===
  JSON.stringify([
    { field: 'reason', value: 'review requested' },
    { field: 'author', value: 'bob' },
    { field: 'org', value: 'Octo' }
  ]) &&
  made.then.join() === 'approve,done'
);
check('the list describes it', has('When reason is review requested and author is bob and organization is Octo, approve the pull request, then mark as done.'));

// Saved now, it leaves the notifications already there alone; made earlier, it acts on bob's review
// requests (4, 8 … 48 on the first page) once each. Thread 12 refuses to be marked done.
await check_automations();
check('a new automation leaves older notifications alone', !calls().some((c) => c.cmd.startsWith('pr review')));
put({ ...automations.list[0], created: '2000-01-01T00:00:00.000Z' });
const automating = check_automations();
await wait_for(() => has('Running automations'), { label: 'the automations job' });
check('the automations show their progress', text().includes('of 12'));
await automating;
const approved = calls().filter((c) => c.cmd.startsWith('pr review'));
check('it approves each matching PR', approved.length === 12 && called('pr review https://github.com/octo/repo/pull/4 --approve'));
check('then marks it done', called('api -X DELETE notifications/threads/48'));
check('a failed step is in the log', saved().automation_log.filter((r: { error?: string }) => r.error).length === 1);
await check_automations();
check('it acts on a thread once', calls().filter((c) => c.cmd.startsWith('pr review')).length === 12);
pump();
check('the activity lists what it did', has('Note 48') && text().includes('HTTP 403'));
if (process.env.SHOT) screenshot(process.env.SHOT.replace('.png', '-list.png'));

click_test_id(`automation-${made.id}`);
pump();
click_test_id('automation-enabled');
click_test_id('automation-save');
pump();
check('a change is saved', automations_json()[0].enabled === false);
click_test_id(`automation-${made.id}`);
pump();
click_test_id('automation-delete');
pump();
check('Delete removes it', automations_json().length === 0 && has('No automations yet. Make one to approve, read or clear notifications as they arrive.'));
click_test_id('new-automation');
pump();
click_test_id('cond-remove-0');
click_test_id('automation-save');
pump();
check('an automation needs a condition', text().includes('Add a condition') && automations_json().length === 0);
click_test_id('automation-cancel');
press('ctrl-1');

// Chat: Apple's on-device model through fm. The first turn starts the transcript with the user and
// their notifications as instructions; later turns resume it. The chat outlives a switch of tabs.
const turns = () => calls().filter((c) => c.cmd === 'fm respond');
/** The model's replies: markdown, which GPUI keeps as source rather than text. */
const replies = () =>
  find_all((n) => n.testId === 'chat-reply').map((n) => (n as { customProps?: { source?: string } }).customProps?.source);
press('ctrl-3');
await wait_for(() => !!find_test_id('chat-input'), { label: 'the model is ready' });
click_test_id('chat-input');
type('h i');
press('enter');
await wait_for(() => replies().includes('You said hi, turn 1'), { label: 'the first reply' });
await wait_for(() => !find_test_id('chat-busy'), { label: 'the turn ends' });
check(
  'the first turn sends the prompt, with the notifications as instructions',
  turns()[0].stdin === 'hi' && !!turns()[0].instructions?.includes('The user is octocat') && !!turns()[0].instructions?.includes('"Note 1"')
);
type('a g a i n');
press('enter');
await wait_for(() => replies().includes('You said again, turn 2'), { label: 'the second reply' });
await wait_for(() => !find_test_id('chat-busy'), { label: 'the turn ends' });
check('a later turn resumes the transcript', turns()[1].stdin === 'again' && turns()[1].instructions === undefined);
if (process.env.SHOT) screenshot(process.env.SHOT.replace('.png', '-chat.png'));
press('ctrl-1');
press('ctrl-3');
await wait_for(() => !!find_test_id('chat-input'), { label: 'the chat again' });
check('the chat outlives a switch of tabs', has('hi') && has('again') && replies().length === 2);
type('f a i l');
press('enter');
await wait_for(() => has('The model refused'), { label: 'an fm error' });
await wait(50);
check('an fm error shows in the chat, without its colours', has('The model refused'));
click_test_id('chat-new');
pump();
check('New chat empties it', !has('again'));
click_test_id('chat-input');
type('n e w');
press('enter');
await wait_for(() => turns().length === 4, { label: 'a new chat' });
check('a new chat starts a new transcript', turns()[3].instructions !== undefined);
await wait_for(() => !find_test_id('chat-busy'), { label: 'the turn ends' });

// History: each conversation is saved in chats/, newest first in the list; an old one opens with its
// messages and resumes its transcript, and Delete removes both files.
const chats_dir = join(process.env.XDG_CONFIG_HOME!, 'gitbox', 'chats');
const saved_chats = () =>
  readdirSync(chats_dir)
    .filter((f) => !f.endsWith('.fm.json'))
    .map((f) => JSON.parse(readFileSync(join(chats_dir, f), 'utf8')) as { id: string; title: string; messages: unknown[] });
const first_chat = saved_chats().find((c) => c.title === 'hi')!;
check('both chats are saved, with their messages', saved_chats().length === 2 && first_chat.messages.length === 6);
check('the list holds both, by their first message', has('hi') && has('new'));
click_test_id(`chat-${first_chat.id}`);
pump();
check('a past chat opens with its messages', has('again') && replies().includes('You said again, turn 2'));
click_test_id('chat-input');
type('m o r e');
press('enter');
await wait_for(() => replies().includes('You said more, turn 4'), { label: 'a turn in a past chat' });
await wait_for(() => !find_test_id('chat-busy'), { label: 'the turn ends' });
check('a past chat resumes its transcript', turns()[4].instructions === undefined);
click_test_id(`chat-delete-${first_chat.id}`);
pump();
check(
  'Delete removes a chat and its transcript',
  saved_chats().length === 1 && !existsSync(join(chats_dir, `${first_chat.id}.fm.json`)) && !has('again')
);
process.env.FAKE_NO_FM = '1';
press('ctrl-1');
press('ctrl-3');
await wait_for(() => has('Apple Intelligence is not enabled'), { label: 'no model' });
check('without the model, Chat says why', has('Chat needs macOS 27 or later, with Apple Intelligence on.'));
delete process.env.FAKE_NO_FM;

// Settings → Models: a new chat goes to Claude Code with its model and the chat's instructions as the
// system prompt, and no tools; its next turn resumes Claude's session. A Codex chat gets the
// instructions in its first prompt, resumes its thread, and shows the API's error from inside
// Codex's message. A chat keeps the agent it started with.
const agent_calls = (cmd: string) => calls().filter((c) => c.cmd === cmd) as unknown as { args: string[]; stdin: string; cwd: string }[];
const say = async (keys: string, reply: string) => {
  click_test_id('chat-input');
  type(keys);
  press('enter');
  await wait_for(() => replies().includes(reply), { label: reply });
  await wait_for(() => !find_test_id('chat-busy'), { label: 'the turn ends' });
};
update({ chat_agent: 'claude', chat_model: 'haiku' });
// The chat open here was deleted above, so it is a new one already.
if (find_test_id('chat-new')) click_test_id('chat-new');
await wait_for(() => !!find_test_id('chat-input'), { label: 'a Claude chat' });
check('the header names the agent, its model and where the words go', has('Claude Code (haiku): what you ask goes to Anthropic'));
await say('h e l l o', 'Claude says hello');
const first_claude = agent_calls('claude')[0].args;
check(
  'a Claude chat has its model, no tools, and the instructions as its system prompt',
  first_claude.includes('--safe-mode') && first_claude[first_claude.indexOf('--model') + 1] === 'haiku' &&
  first_claude[first_claude.indexOf('--tools') + 1] === '' && first_claude[first_claude.indexOf('--system-prompt') + 1].includes('The user is octocat')
);
await say('m o r e', 'Claude says more again');
check('its next turn resumes Claude’s session', agent_calls('claude')[1].args.join(' ').includes('--resume claude-1'));
const claude_chat = saved_chats().find((c) => c.title === 'hello')!;
update({ chat_agent: 'codex', chat_model: '' });
click_test_id('chat-new');
await say('h i', 'Codex says hi');
check('a Codex chat starts with the instructions in its prompt', agent_calls('codex')[0].stdin.startsWith('You are the assistant in Gitbox'));
await say('a g a i n', 'Codex says again');
check('and resumes its thread', agent_calls('codex')[1].args.slice(0, 2).join() === 'exec,resume' && agent_calls('codex')[1].args.includes('codex-1'));
click_test_id('chat-input');
type('f a i l');
press('enter');
await wait_for(() => has("The 'x' model is not supported."), { label: 'a Codex error' });
check('a Codex error shows its message', has("The 'x' model is not supported."));
await wait_for(() => !find_test_id('chat-busy'), { label: 'the turn ends' });
click_test_id(`chat-${claude_chat.id}`);
pump();
await say('b a c k', 'Claude says back again');
check('a chat keeps the agent it started with', agent_calls('claude').length === 3 && agent_calls('codex').length === 3);
update({ chat_agent: 'fm', chat_model: '' });
press('ctrl-1');

// Whiteboard (#22): a PR opens on its board, in a checkout found by its remote under the code folders
// (two levels down here, in a folder not named like the repository; a decoy named "repo" points
// elsewhere). The first call starts Whiteboard; the second opens the board that exists.
const code = mkdtempSync(join(tmpdir(), 'gitbox-code-'));
const git_repo = (path: string, remote: string) => {
  execFileSync('git', ['init', '-q', path]);
  execFileSync('git', ['-C', path, 'remote', 'add', 'origin', remote]);
};
git_repo(join(code, 'repo'), 'https://github.com/someone-else/repo.git');
git_repo(join(code, 'team', 'renamed'), 'git@github.com:Octo/Repo.git');
update({ code_dirs: code });
const wb = () => calls().filter((c) => c.cmd.startsWith('whiteboard '));
await right_click(4);
click_test_id('menu-whiteboard');
await wait_for(() => has('Made a Whiteboard for the pull request'), { label: 'the PR in Whiteboard' });
const made_board = wb().find((c) => c.cmd === 'whiteboard api session_create');
check(
  'Open in Whiteboard starts Whiteboard, then makes the board in the checkout with the PR’s remote',
  wb().map((c) => c.cmd).slice(0, 3).join() === 'whiteboard api session_list,whiteboard app launch,whiteboard api session_list' &&
  JSON.stringify(JSON.parse(made_board!.stdin!)) ===
  JSON.stringify({ target: { kind: 'pullRequest', repositoryPath: join(code, 'team', 'renamed'), pullRequest: 'https://github.com/octo/repo/pull/4' } })
);
check('the checkout is remembered', saved().repo_paths['octo/repo'] === join(code, 'team', 'renamed'));
// The new board is empty: Apple's on-device model drafts it. The structure goes down first, each
// summarized file gets a link and a peek at its largest hunk, a lock file is only listed, and the
// placeholder becomes the summary.
await wait_for(() => has('Drafted the Whiteboard for Note 4'), { timeout: 8000, label: 'the draft' });
const edits = wb()
  .filter((c) => c.cmd === 'whiteboard api session_edit')
  .map((c) => JSON.parse(c.stdin!) as { activityId: string; edit: { type: string; parentId?: string; targetId?: string; changes?: { markdown: string }; content?: { type: string; title?: string; markdown?: string; source?: string; children?: { markdown: string }[] } } });
const contents = edits.map((e) => e.edit.content);
check(
  'the draft writes a note, What and why, and Changes first',
  contents[0]?.type === 'callout' && contents[1]?.title === 'What and why' && contents[2]?.title === 'Changes' && edits.every((e) => e.activityId === 'a-1')
);
check(
  'a summarized file links its largest hunk and peeks at it',
  contents.some((c) => c?.markdown === '**[src/a.ts](whiteboard:source/head/src/a.ts#L10-L13)** · +3 −0\n\nIt changes src/a.ts.') &&
  contents.some((c) => c?.type === 'code_peek' && c.source === 'head/src/a.ts#L10-L13') &&
  contents.some((c) => c?.markdown === '**old.ts** · +0 −2\n\nIt changes old.ts.') &&
  contents.some((c) => c?.markdown === 'Also changed: `package-lock.json` (+1 −1).')
);
check(
  'the summary replaces the placeholder, and What to check comes as clean bullets',
  edits.some((e) => e.edit.type === 'update' && e.edit.targetId === 'block-2-1' && e.edit.changes?.markdown === 'It adds a feature.') &&
  contents.at(-1)?.title === 'What to check' && contents.at(-1)?.children?.[0].markdown === '- Check A.\n- Check B.'
);
check('the draft ends its activity', wb().some((c) => c.cmd === 'whiteboard api session_activity_end'));
click_test_id('card-4');
press('w');
await wait_for(() => has('Opened the pull request’s Whiteboard'), { label: 'w opens the board again' });
check(
  'w on a PR opens its board, which exists now and has content, so nothing drafts it again',
  wb().some((c) => c.cmd === 'whiteboard api session_open') && calls().filter((c) => c.cmd === 'fm once').length === 4
);
// With Claude Code chosen for drafts, Claude writes an empty board itself, in the PR's checkout, with
// Whiteboard's tools and only read-only others; the popup shows the tool it calls.
update({ whiteboard_agent: 'claude', whiteboard_model: 'sonnet' });
await right_click(8);
click_test_id('menu-whiteboard');
await wait_for(() => has('Claude Code wrote the Whiteboard for Note 8'), { label: 'Claude drafts the board' });
const drafter = agent_calls('claude').at(-1)!;
check(
  'Claude writes the board in the checkout, with Whiteboard’s tools and its model',
  drafter.cwd === realpathSync(join(code, 'team', 'renamed')) && drafter.stdin.includes('session s-8') &&
  drafter.args.includes('mcp__plugin_whiteboard_whiteboard') && !drafter.args.includes('Bash') && drafter.args[drafter.args.indexOf('--model') + 1] === 'sonnet'
);
update({ whiteboard_agent: 'fm', whiteboard_model: '' });
// Note 20 is a review request in octo/other, which has no checkout here.
await right_click(20);
click_test_id('menu-whiteboard');
await wait_for(() => text().includes('No checkout of octo/other'), { label: 'no checkout' });
check('a repository with no checkout says where gitbox looked', text().includes(`No checkout of octo/other in ${code}`));
await wait_for(() => !find_test_id('job'), { label: 'the job ends' });

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

finish('gitbox', 147);
