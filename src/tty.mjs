// A tiny raw-mode terminal reader for `bbs-door dev` — the local twin of the
// gateway's PHP Terminal. Keeps stdin in raw mode and exposes blocking-style
// readKey()/readLine() so the dev harness behaves like the real board.

export function openTty() {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const raw = stdin.isTTY === true;
  if (raw) stdin.setRawMode(true);
  stdin.resume();

  const queue = [];
  const waiters = [];
  const onData = (buf) => {
    const s = buf.toString('utf8');
    if (waiters.length) waiters.shift()(s);
    else queue.push(s);
  };
  stdin.on('data', onData);

  function nextChunk() {
    if (queue.length) return Promise.resolve(queue.shift());
    return new Promise((resolve) => waiters.push(resolve));
  }

  // Internal byte buffer so multi-byte escape sequences decode cleanly.
  let buf = '';
  async function readChar() {
    while (buf === '') buf += await nextChunk();
    const c = buf[0];
    buf = buf.slice(1);
    return c;
  }

  async function readKey() {
    const c = await readChar();
    if (c === '\x03') { // Ctrl-C — let the dev quit the door
      close();
      process.exit(0);
    }
    if (c !== '\x1b') return c;
    if ((buf[0] ?? '') !== '[') return 'ESCAPE';
    buf = buf.slice(1);
    const final = buf[0] ?? '';
    buf = buf.slice(1);
    return { A: 'UP', B: 'DOWN', C: 'RIGHT', D: 'LEFT' }[final] ?? 'ESCAPE';
  }

  async function readLine() {
    let line = '';
    while (true) {
      const c = await readChar();
      if (c === '\r' || c === '\n') { stdout.write('\r\n'); return line; }
      const code = c.charCodeAt(0);
      if (code === 8 || code === 127) {
        if (line) { line = line.slice(0, -1); stdout.write('\b \b'); }
        continue;
      }
      if (c === '\x03') { close(); process.exit(0); }
      if (code < 32) continue;
      line += c;
      stdout.write(c);
    }
  }

  function write(s) { stdout.write(s); }

  function close() {
    stdin.off('data', onData);
    if (raw) stdin.setRawMode(false);
    stdin.pause();
  }

  return { readKey, readLine, write, close };
}
