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

/**
 * One turn of a conversation kept in `transcript` (a file fm reads and writes back); the first turn
 * starts it with `instructions`. The reply streams to `ontext` as it comes, and resolves whole.
 * The prompt goes through stdin, so no text can read as one of fm's options.
 */
export function respond(prompt: string, transcript: string, instructions: string, ontext: (text: string) => void): Promise<string> {
	const start = existsSync(transcript) ? ['--resume', transcript] : ['--instructions', instructions];
	return new Promise((resolve, reject) => {
		const child = spawn('fm', ['respond', ...start, '--save-transcript', transcript]);
		let out = '';
		let err = '';
		child.stdout.on('data', (d) => ontext((out += d)));
		child.stderr.on('data', (d) => (err += d));
		child.on('error', reject);
		// fm prints "Transcript saved to: …" on stderr even when it works.
		child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(plain(err).replace(/^Error:\s*/, '') || `fm exited ${code}`))));
		child.stdin.end(prompt);
	});
}
