/**
 * Custom native module rebuild script for Electron.
 * Uses @electron/rebuild to rebuild only better-sqlite3.
 * Skips cbor-extract since cbor-x has a pure JS fallback.
 */
const path = require('path');
const { fork } = require('child_process');

const rootDir = path.join(__dirname, '..');
const electronPkg = require(path.join(rootDir, 'node_modules', 'electron', 'package.json'));
const electronVersion = electronPkg.version;

console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);

// Find @electron/rebuild's rebuild module
const rebuildPath = require.resolve('@electron/rebuild', {
  paths: [path.join(rootDir, 'node_modules', '.pnpm', '@electron+rebuild@3.6.1', 'node_modules')]
});
const rebuildDir = path.dirname(rebuildPath);

async function main() {
  const { rebuild } = require(rebuildPath);
  
  await rebuild({
    buildPath: rootDir,
    electronVersion: electronVersion,
    arch: process.arch,
    onlyModules: ['better-sqlite3'],
    force: true
  });
  
  console.log('better-sqlite3 rebuilt successfully for Electron.');
}

main().catch(err => {
  console.error('Rebuild failed:', err.message);
  // Don't fail the install - better-sqlite3 might still work with prebuild
  console.error('Continuing without Electron-specific rebuild...');
});
