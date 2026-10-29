// Apple's on-device Foundation Model, through the `fm` CLI that macOS 27 ships in /usr/bin. The model
// runs on the Mac, so nothing it reads leaves it.
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** fm colours its errors even into a pipe. */
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').trim();

/** Null when the model is ready; else why not (no fm before macOS 27, Apple Intelligence off…). */
export function unavailable(): Promise<string | null> {
	return new Promise((resolve) =>
		execFile('fm', ['available'], (err, out, errout) =>
			resolve(!err ? null : (err as { code?: string }).code === 'ENOENT' ? 'fm was not found' : plain(errout || out) || err.message)
		)
	);
}

/** Runs `fm respond` with `args`; the prompt goes through stdin, so no text can read as one of fm's
 * options. The reply streams to `ontext` as it comes, and resolves whole. */
function run(args: string[], prompt: string, ontext?: (text: string) => void): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn('fm', ['respond', ...args]);
		let out = '';
		let err = '';
		child.stdout.on('data', (d) => {
			out += d;
			ontext?.(out);
		});
		child.stderr.on('data', (d) => (err += d));
		child.on('error', reject);
		// fm prints "Transcript saved to: …" on stderr even when it works.
		child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(plain(err).replace(/^Error:\s*/, '') || `fm exited ${code}`))));
		child.stdin.end(prompt);
	});
}

/** One turn of a conversation kept in `transcript` (a file fm reads and writes back); the first turn
 * starts it with `instructions`. */
export function respond(prompt: string, transcript: string, instructions: string, ontext: (text: string) => void): Promise<string> {
	const start = existsSync(transcript) ? ['--resume', transcript] : ['--instructions', instructions];
	return run([...start, '--save-transcript', transcript], prompt, ontext);
}

/** One question with no conversation, for a Whiteboard's summaries (#22). They rework text the user
 * gave the model (a diff, a PR's description), which fm's permissive guardrails are for. */
export const once = (prompt: string, instructions: string) =>
	run(['--instructions', instructions, '--guardrails', 'permissive-content-transformations'], prompt);
