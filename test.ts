import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mount_headless, click_test_id, all_text, check, finish, wait, wait_for, wheel, find_test_id, bounds } from 'gpuix-svelte/test';
import App from './App.svelte';

// A fake `gh` first on PATH: signed out until FAKE_AUTHED is set, then 290 notifications in API
// pages of 50 (the last has 40), titled "Note 1" to "Note 290". Note i is PR i, and i % 4 picks
// its lane: 0 review requested, 1 mention (waiting on me), 2 subscribed (todo), 3 a merged PR
// (done). So four pages give every lane its first 50 cards, and two pages are left. Every fifth
// note is in octo/other, the rest in octo/repo.
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
	updated_at: '2026-10-27T18:56:58Z',
	subject: { title: 'Note ' + i, type: 'PullRequest', url: 'https://api.github.com/repos/octo/repo/pulls/' + i },
	repository: { full_name: i % 5 === 0 ? 'octo/other' : 'octo/repo' }
});
const page = cmd.match(/^api notifications\\?per_page=50&page=(\\d+)$/);
if (cmd === '--version') console.log('gh version 9.9.9');
else if (cmd === 'api user --jq .login') {
	if (!process.env.FAKE_AUTHED) { console.error('not logged in'); process.exit(1); }
	console.log('octocat');
} else if (cmd === 'api notifications?per_page=1') console.log('[]');
else if (page) {
	if (!process.env.FAKE_AUTHED) { console.error('HTTP 401: Bad credentials'); process.exit(1); }
	const from = (page[1] - 1) * 50 + 1;
	const to = Math.min(from + 49, 290);
	console.log(JSON.stringify(Array.from({ length: Math.max(to - from + 1, 0) }, (_, k) => note(from + k))));
} else if (args[1] === 'graphql') {
	const data = {};
	for (const [, alias, i] of args[3].matchAll(/(a\\d+): resource\\(url: "[^"]*\\/pull\\/(\\d+)"\\)/g))
		data[alias] = { state: reason(+i) === 'comment' ? 'MERGED' : 'OPEN' };
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

let app = mount_headless(App, { width: 1280, height: 800 });

await wait_for(() => text().includes('gh auth login'), { label: 'sign-in hint' });
check('a signed-out gh shows the login hint', text().includes('not logged in'));

process.env.FAKE_AUTHED = '1';
click_test_id('retry');
await wait_for(() => text().includes('Show notifications'), { label: 'all checks pass' });
check('the signed-in user is shown', text().includes('as octocat'));

click_test_id('continue');
check('finishing onboarding saves it', saved().onboarded === true);
await wait_for(() => has('Note 200'), { label: 'the first 50 cards of every lane' });
await wait_for(() => !text().includes('loading…'), { label: 'the start settles' });
check('the board has the four lanes', ['Todo', 'Requested', 'Waiting on me', 'Merged / Closed'].every(has));
check(
	'each card goes in the lane for its reason and state',
	in_lane(4, 'requested') && in_lane(5, 'waiting') && in_lane(6, 'todo') && in_lane(7, 'done')
);
check('every lane starts with 50 cards', text().includes('200 unread+') && (all_text().filter((t) => t === '50+').length === 4));
await wait(1500);
check('nothing more loads without a scroll', !has('Note 201'));

wheel(find_test_id('lane-requested')!, 0, -20000);
await wait_for(() => has('Note 204'), { label: 'a scroll in Requested loads its next cards', timeout: 6000 });
await wait_for(() => !text().includes('loading…'), { label: 'Requested settles' });
check('Requested gets the rest of its cards', has('Note 288'));
check('a scroll in one lane adds no cards to the others', !has('Note 201') && !has('Note 202') && !has('Note 203'));
check('the last short page ends the loading', text().includes('290 unread') && !text().includes('290 unread+'));
check('a lane with every card says so', text().includes('All caught up'));

wheel(find_test_id('lane-todo')!, 0, -20000);
await wait_for(() => has('Note 202'), { label: 'Todo shows its loaded cards on its own scroll' });
check('Todo gets its cards without other lanes', !has('Note 201') && !has('Note 203'));

click_test_id('repo-filter');
await wait_for(() => has('octo/other'), { label: 'the repository menu' });
check('the menu lists each repository with its count', has('232') && has('58'));
click_test_id('repo-octo/other');
await wait_for(() => !has('Note 4'), { label: 'the filter applies' });
check('the filter keeps only that repository', has('Note 5') && has('Note 290') && !has('Note 6'));
check('the filter applies to every lane', in_lane(20, 'requested') && in_lane(5, 'waiting') && in_lane(10, 'todo') && in_lane(15, 'done'));
click_test_id('repo-all');
await wait_for(() => has('Note 4'), { label: 'the filter clears' });
check('All repositories shows every card again', has('Note 6'));

await app.unmount();
app = mount_headless(App, { width: 1280, height: 800 });
await wait_for(() => has('Note 1'), { label: 'the board after a restart' });
check('a restart skips onboarding', !text().includes('Welcome to gitbox'));

delete process.env.FAKE_AUTHED;
click_test_id('refresh');
await wait_for(() => text().includes('Bad credentials'), { label: 'a broken gh' });
click_test_id('setup');
await wait_for(() => text().includes('gh auth login'), { label: 'onboarding again' });
check('run setup again clears the saved state', saved().onboarded === false);

finish('gitbox', 18);
