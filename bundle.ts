// The macOS .app wrapper that build.ts (the shipped app) and dev.ts (npm start) both use. macOS takes
// the Dock and menu-bar name and the Dock icon from the bundle of the running executable, so a bare
// `bun` or `node` shows as that; inside this bundle it shows as Gitbox with the icon.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import pkg from './package.json' with { type: 'json' };

export const ICON = 'assets/icon.png';

export type BundleOptions = {
	/** Hard-link `exe` rather than copy it (dev: no 100 MB copy); falls back to a copy across file systems. */
	link?: boolean;
	name?: string;
	id?: string;
	/** A 1024 px PNG. */
	icon?: string;
};

/** Writes `app` around `exe`: Info.plist, the icon, and the executable. */
export function write_bundle(
	app: string,
	exe: string,
	{ link = false, name = 'Gitbox', id = 'io.github.jaronoff97.gitbox', icon = ICON }: BundleOptions = {}
) {
	rmSync(app, { recursive: true, force: true });
	mkdirSync(`${app}/Contents/MacOS`, { recursive: true });
	mkdirSync(`${app}/Contents/Resources`, { recursive: true });
	put_executable(app, exe, link);
	writeFileSync(`${app}/Contents/Info.plist`, plist(pkg.version, name, id));
	icns(icon, `${app}/Contents/Resources/AppIcon.icns`, `${app}.iconset`);
}

export function put_executable(app: string, exe: string, link: boolean) {
	const inner = `${app}/Contents/MacOS/gitbox`;
	rmSync(inner, { force: true });
	try {
		if (!link) throw new Error('copy');
		linkSync(exe, inner);
	} catch {
		copyFileSync(exe, inner);
		chmodSync(inner, 0o755);
	}
}

function plist(version: string, name: string, id: string) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>gitbox</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>${id}</string>
	<key>CFBundleName</key>
	<string>${name}</string>
	<key>CFBundleDisplayName</key>
	<string>${name}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>${version}</string>
	<key>CFBundleVersion</key>
	<string>${version}</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.developer-tools</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
`;
}

// iconutil reads only an .iconset holding the ten standard sizes, which sips cuts from the 1024 px
// source. assets/icon.png is assets/icon.svg rendered by `qlmanage -t -s 1024 -o <dir> assets/icon.svg`.
function icns(png: string, out: string, set: string) {
	mkdirSync(set, { recursive: true });
	for (const pt of [16, 32, 128, 256, 512]) {
		run('sips', ['-z', `${pt}`, `${pt}`, png, '--out', `${set}/icon_${pt}x${pt}.png`]);
		run('sips', ['-z', `${pt * 2}`, `${pt * 2}`, png, '--out', `${set}/icon_${pt}x${pt}@2x.png`]);
	}
	run('iconutil', ['-c', 'icns', set, '-o', out]);
	rmSync(set, { recursive: true });
}

export function run(command: string, args: string[]) {
	const { status, stdout, stderr } = spawnSync(command, args, { encoding: 'utf8' });
	if (status !== 0) {
		console.error(`${command} ${args.join(' ')} failed:\n${stderr || stdout}`);
		process.exit(1);
	}
	return stdout;
}
