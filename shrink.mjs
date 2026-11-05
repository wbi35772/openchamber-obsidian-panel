import WebSocket from 'ws';
const port = process.argv[2] || '59392';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.title.includes('brain'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const send = (method, params = {}) => new Promise((resolve) => {
  const my = ++id;
  const onMsg = (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id === my) { ws.off('message', onMsg); resolve(m); }
  };
  ws.on('message', onMsg);
  ws.send(JSON.stringify({ id: my, method, params }));
});
if (process.argv[3] === 'shrink') {
  await send('Runtime.evaluate', { expression: 'window.resizeTo(700,700)' });
  await new Promise((r) => setTimeout(r, 600));
}
const g = await send('Runtime.evaluate', { expression: 'JSON.stringify({w:outerWidth,h:outerHeight,iw:innerWidth,ih:innerHeight})', returnByValue: true });
console.log(g.result.result.value);
ws.close();
