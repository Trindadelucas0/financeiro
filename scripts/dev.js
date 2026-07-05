const { spawn, execSync } = require('child_process');
const path = require('path');
const { loadEnv } = require('../src/config/env');

function freePort(port) {
  if (process.platform !== 'win32') return;

  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();

    out.split('\n').forEach((line) => {
      const match = line.trim().match(/LISTENING\s+(\d+)\s*$/);
      if (match) pids.add(match[1]);
    });

    pids.forEach((pid) => {
      try {
        execSync(`taskkill //PID ${pid} //F`, { stdio: 'ignore' });
        console.log(`[dev] Porta ${port} liberada (PID ${pid})`);
      } catch {
        /* process may have already exited */
      }
    });
  } catch {
    /* port already free */
  }
}

const root = path.join(__dirname, '..');
const tailwindCli = path.join(root, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
const { port } = loadEnv();
freePort(port);

const children = [];

function spawnChild(label, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[dev] ${label} encerrou com código ${code}`);
    }
    shutdown(code ?? 0);
  });

  children.push(child);
  return child;
}

let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGINT');
  });
  process.exit(code);
}

spawnChild('css', process.execPath, [
  tailwindCli,
  '-i', './src/styles/landing.css',
  '-o', './public/css/landing.css',
  '--watch',
]);
spawnChild('server', process.execPath, ['--watch', 'server.js']);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
