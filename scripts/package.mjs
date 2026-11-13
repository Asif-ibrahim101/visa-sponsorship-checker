// Zips dist/ for the Chrome Web Store: manifest.json must sit at the top of the zip.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${root}dist/manifest.json`, 'utf8'));
if (manifest.version !== version) throw new Error(`dist is stale: manifest ${manifest.version}, package ${version}. Run npm run build.`);
for (const icon of Object.values(manifest.icons)) {
  if (!existsSync(`${root}dist/${icon}`)) throw new Error(`Missing icon in dist: ${icon}`);
}

mkdirSync(`${root}release`, { recursive: true });
const out = `${root}release/visa-sponsorship-checker-${version}.zip`;
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, '.', '-x', '.*'], { cwd: `${root}dist`, stdio: 'inherit' });
console.log(`Packaged ${out}`);
