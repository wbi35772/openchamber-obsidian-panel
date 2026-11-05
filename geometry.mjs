import WebSocket from 'ws';

const port = process.argv[2] || '63078';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pages = list.filter((t) => t.type === 'page');
const probe = (wsUrl) => new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  const timer = setTimeout(() => { ws.terminate(); reject(new Error('timeout')); }, 5000);
  ws.on('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'JSON.stringify({x:screenX,y:screenY,w:outerWidth,h:outerHeight,iw:innerWidth,ih:innerHeight})', returnByValue: true } }));
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id === 1) { clearTimeout(timer); ws.close(); resolve(JSON.parse(msg.result.result.value)); }
  });
  ws.on('error', (e) => { clearTimeout(timer); reject(e); });
});

for (const p of pages) {
  try {
    const g = await probe(p.webSocketDebuggerUrl);
    console.log(p.title, '=>', JSON.stringify(g));
  } catch (e) { console.log(p.title, 'ERR', e.message); }
}
