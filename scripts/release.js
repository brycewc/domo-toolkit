import { createWriteStream, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import archiver from 'archiver';
import pkg from '../package.json' with { type: 'json' };

const { name, version } = pkg;

const DIST_DIR = 'dist';
const OUT_DIR = 'release';

function collectFiles(dir, excluded = []) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, excluded));
    } else {
      const rel = relative(DIST_DIR, fullPath);
      if (!excluded.some((ex) => rel.includes(ex))) {
        files.push({ fullPath, relativePath: rel });
      }
    }
  }
  return files;
}

function createZip(outFileName, files, transformFile) {
  return new Promise((resolve, reject) => {
    const outPath = join(OUT_DIR, outFileName);
    const output = createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(1);
      console.log(`  ${outFileName} (${sizeKB} KB)`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);

    for (const file of files) {
      const content = transformFile
        ? transformFile(file.relativePath, file.fullPath)
        : null;

      if (content !== null && content !== undefined) {
        archive.append(content, { name: file.relativePath });
      } else {
        archive.file(file.fullPath, { name: file.relativePath });
      }
    }

    archive.finalize();
  });
}

mkdirSync(OUT_DIR, { recursive: true });

console.log(`Packaging ${name} v${version}...`);

// Chrome: exclude .crx, .pem, and .vite
const chromeFiles = collectFiles(DIST_DIR, ['.vite', 'dist.crx', 'dist.pem']);
await createZip(`chrome-${name}-${version}.zip`, chromeFiles);

// Edge: exclude .vite, strip the "key" property from manifest.json
const edgeFiles = collectFiles(DIST_DIR, ['.vite']);
await createZip(`edge-${name}-${version}.zip`, edgeFiles, (relativePath, fullPath) => {
  if (relativePath === 'manifest.json') {
    const manifest = JSON.parse(readFileSync(fullPath, 'utf-8'));
    delete manifest.key;
    return JSON.stringify(manifest, null, 2);
  }
  return null;
});

console.log('Done.');
