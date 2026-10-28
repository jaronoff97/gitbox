// `npm start` / `bun run start`: app.ts with hot reload, as the gpuix-svelte bin would run it. On macOS
// the runtime runs from dist/dev/Gitbox Dev.app (a hard link), so the Dock and menu bar show
// "Gitbox Dev" with the icon inverted, apart from an installed Gitbox, rather than "bun" or "node".

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { put_executable, run, write_bundle } from './bundle.ts';

const bun = process.versions.bun != null;
let runtime = process.execPath;

if (process.platform === 'darwin') {
	const app = 'dist/dev/Gitbox Dev.app';
	const icon = 'dist/dev/icon-dev.png';
	const stale = (out: string, source: string) => !existsSync(out) || statSync(source).mtimeMs > statSync(out).mtimeMs;
	if (stale(icon, 'assets/icon.svg')) invert('assets/icon.svg', icon);
	if (stale(`${app}/Contents/Resources/AppIcon.icns`, icon))
		write_bundle(app, process.execPath, { link: true, name: 'Gitbox Dev', id: 'io.github.jaronoff97.gitbox.dev', icon });
	// Linked again each start, so it is always the runtime this script runs on.
	else put_executable(app, process.execPath, true);
	runtime = `${app}/Contents/MacOS/gitbox`;
}

const loader = bun
	? ['--preload', fileURLToPath(import.meta.resolve('gpuix-svelte/plugin'))]
	: ['--import', import.meta.resolve('gpuix-svelte/register')];

const child = spawn(
	runtime,
	['--conditions', 'custom-renderer', '--conditions', 'development', ...loader, 'app.ts', ...process.argv.slice(2)],
	{ stdio: 'inherit' }
);
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

/** Renders `svg` with its colours inverted (alpha kept, in sRGB) to a 1024 px PNG, as QuickLook draws it. */
function invert(svg: string, png: string) {
	const dir = 'dist/dev/invert';
	mkdirSync(dir, { recursive: true });
	const data = `data:image/svg+xml;base64,${readFileSync(svg).toString('base64')}`;
	writeFileSync(
		`${dir}/icon.svg`,
		`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
	<filter id="invert" color-interpolation-filters="sRGB">
		<feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0" />
	</filter>
	<image width="1024" height="1024" filter="url(#invert)" href="${data}" />
</svg>`
	);
	run('qlmanage', ['-t', '-s', '1024', '-o', dir, `${dir}/icon.svg`]);
	renameSync(`${dir}/icon.svg.png`, png);
}
