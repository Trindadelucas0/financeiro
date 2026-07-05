const { spawn, execSync } = require('child_process');
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

const { port } = loadEnv();
freePort(port);

const child = spawn(process.execPath, ['--watch', 'server.js'], {
  stdio: 'inherit',
  cwd: require('path').join(__dirname, '..'),
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
