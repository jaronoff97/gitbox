// App state that outlives a run, as JSON in $XDG_CONFIG_HOME/gitbox (default ~/.config/gitbox).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Saved = { onboarded?: boolean };

// Resolved per call, so a test can point XDG_CONFIG_HOME elsewhere after the imports.
const dir = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'gitbox');

/** The saved state; empty when there is none yet or the file is unreadable. */
export function load(): Saved {
	try {
		return JSON.parse(readFileSync(join(dir(), 'state.json'), 'utf8'));
	} catch {
		return {};
	}
}

export function save(changes: Saved) {
	mkdirSync(dir(), { recursive: true });
	writeFileSync(join(dir(), 'state.json'), JSON.stringify({ ...load(), ...changes }, null, '\t'));
}
