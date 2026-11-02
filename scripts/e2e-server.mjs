// Starts a production-like local server for Playwright: fresh build, fresh D1/R2 state,
// migrations applied, then `wrangler pages dev` with the e2e environment (tests/e2e/e2e.env).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

const PORT = process.env.E2E_PORT ?? '8789';
const STATE_DIR = '.wrangler/e2e-state';

/** KEY=VALUE pairs from tests/e2e/e2e.env, passed as explicit --binding flags. */
const bindings = readFileSync('tests/e2e/e2e.env', 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
  .flatMap((line) => ['--binding', line]);

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npx', ['astro', 'build']);
rmSync(STATE_DIR, { recursive: true, force: true });
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STATE_DIR]);

const server = spawn(
  'npx',
  [
    'wrangler',
    'pages',
    'dev',
    'dist',
    '--ip',
    '127.0.0.1',
    '--port',
    PORT,
    '--persist-to',
    STATE_DIR,
    ...bindings,
    '--show-interactive-dev-session=false',
  ],
  { stdio: 'inherit' },
);

for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
