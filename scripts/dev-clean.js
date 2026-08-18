import { execFileSync } from 'node:child_process';

const ports = [3001, 3002, 3003, 3004, 5173, 5174, 5175, 5176];

for (const port of ports) {
  try {
    const raw = execFileSync('lsof', ['-ti', `tcp:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    const pids = raw
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (pids.length === 0) continue;

    console.log(`Killing stale processes on port ${port}: ${pids.join(', ')}`);

    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // ignore already-dead process IDs
      }
    }
  } catch {
    // ignore ports with no listening processes
  }
}

console.log('Clean start: stale dev processes cleared.');
