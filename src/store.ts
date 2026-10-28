// App state that outlives a run, as JSON in $XDG_CONFIG_HOME/gitbox (default ~/.config/gitbox).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from './settings.svelte.ts';

export type Saved = { onboarded?: boolean; settings?: Partial<Settings> };

// Resolved per call, so a test can point XDG_CONFIG_HOME elsewhere after the imports.
const dir = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'gitbox');

/** The state file, for display. */
export const state_file = () => join(dir(), 'state.json');

/** The saved state; empty when there is none yet or the file is unreadable. */
export function load(): Saved {
	try {
		return JSON.parse(readFileSync(state_file(), 'utf8'));
	} catch {
		return {};
	}
}

export function save(changes: Saved) {
	mkdirSync(dir(), { recursive: true });
	writeFileSync(state_file(), JSON.stringify({ ...load(), ...changes }, null, '\t'));
}
