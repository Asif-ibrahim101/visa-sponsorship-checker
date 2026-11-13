// Builds the extension into dist/ without a plugin.
// The content script is one self-contained classic script: Chrome runs it
// directly, with no loader and no dynamic import (which failed on LinkedIn).
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'vite';

const watch = process.argv.includes('--watch');
const root = new URL('..', import.meta.url).pathname;
const out = `${root}dist`;
const pkg = JSON.parse(await readFile(`${root}package.json`, 'utf8'));

const manifest = {
  manifest_version: 3,
  name: 'Visa Sponsorship Checker (UK)',
  short_name: 'Visa Checker',
  version: pkg.version,
  description: 'See which UK job listings are likely to come with Skilled Worker visa sponsorship, on LinkedIn, Indeed and career sites.',
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  permissions: ['storage', 'unlimitedStorage', 'alarms'],
  // The register download. Job sites are covered by the content script below.
  host_permissions: ['https://www.gov.uk/government/publications/*', 'https://assets.publishing.service.gov.uk/*'],
  background: { service_worker: 'background.js', type: 'module' },
  // Every site, so career pages on company domains work too. The script stays
  // idle unless a site reader recognises the page. all_frames covers career
  // pages embedded in a frame; other frames exit straight away.
  content_scripts: [
    { matches: ['<all_urls>'], js: ['content.js'], css: ['content.css'], run_at: 'document_idle', all_frames: true },
  ],
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'Visa Sponsorship Checker',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  options_page: 'src/options/options.html',
};

const common = { root, configFile: false, logLevel: 'warn', build: { target: 'es2022', minify: false, watch: watch ? {} : null } };

async function writeStatic() {
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  await copyFile(`${root}src/content/styles.css`, `${out}/content.css`);
}

await rm(out, { recursive: true, force: true });

// Popup and settings pages.
await build({
  ...common,
  base: './',
  build: {
    ...common.build,
    outDir: out,
    emptyOutDir: false,
    rollupOptions: { input: { popup: `${root}src/popup/popup.html`, options: `${root}src/options/options.html` } },
  },
});

// Content script (classic script) and background worker (module).
for (const [name, format] of [['content', 'iife'], ['background', 'es']]) {
  await build({
    ...common,
    build: {
      ...common.build,
      outDir: out,
      emptyOutDir: false,
      copyPublicDir: false,
      lib: { entry: `${root}src/${name}/index.ts`, formats: [format], name: 'vsc', fileName: () => `${name}.js` },
    },
  });
}

await mkdir(out, { recursive: true });
await writeStatic();
console.log(watch ? 'Watching for changes; reload the extension after each rebuild.' : `Built ${out}`);
