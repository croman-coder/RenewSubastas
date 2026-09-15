/** Tiny structured logger: one JSON line per event, timestamps in UTC. */
function line(level: 'info' | 'warn' | 'error', msg: string, err?: unknown) {
  const rec: Record<string, unknown> = { t: new Date().toISOString(), level, msg };
  if (err !== undefined)
    rec['err'] = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const out = JSON.stringify(rec);
  if (level === 'error') process.stderr.write(out + '\n');
  else process.stdout.write(out + '\n');
}

export const log = {
  info: (msg: string) => line('info', msg),
  warn: (msg: string, err?: unknown) => line('warn', msg, err),
  error: (msg: string, err?: unknown) => line('error', msg, err),
};
