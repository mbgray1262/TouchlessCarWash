#!/usr/bin/env node
/**
 * One-command SEO integrity gate: starts the production server, runs the
 * sitemap/link integrity checker against it, then tears the server down and
 * exits with the checker's status code.
 *
 * Usage:  npm run build && npm run verify:seo
 *   (build first — this runs `next start`, which serves the existing build.)
 *
 * Exits 0 only if every invariant in check-sitemap-integrity.mjs holds.
 */
import { spawn } from 'node:child_process';

const BASE = 'http://localhost:3000';
const READY_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(`${BASE}/sitemap.xml`, { redirect: 'follow' });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  return false;
}

const server = spawn('npm', ['run', 'start'], {
  stdio: 'ignore',
  detached: true, // own process group so we can kill the whole tree
});

let exitCode = 1;
try {
  console.log('Starting server…');
  if (!(await waitForServer())) {
    console.error('Server did not become ready within timeout.');
    process.exit(1);
  }
  exitCode = await new Promise((resolve) => {
    const checker = spawn('node', ['scripts/check-sitemap-integrity.mjs', BASE], {
      stdio: 'inherit',
    });
    checker.on('exit', (code) => resolve(code ?? 1));
  });
} finally {
  try {
    process.kill(-server.pid, 'SIGKILL'); // kill the server's process group
  } catch {
    /* already gone */
  }
}
process.exit(exitCode);
