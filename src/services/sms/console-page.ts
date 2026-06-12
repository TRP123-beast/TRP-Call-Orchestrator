/**
 * Self-contained HTML for the SMS test console, served at GET /sms-demo.
 * No build step / external assets — polls /api/sms/messages and posts to
 * /api/sms/simulate (inbound) and /api/sms/send (outbound).
 */
export const SMS_CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nestr Realty — SMS Console (demo)</title>
<style>
  :root { --bg:#0f172a; --panel:#1e293b; --muted:#94a3b8; --in:#065f46; --out:#1e3a8a; --line:#334155; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:#e2e8f0; }
  header { padding:14px 20px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; }
  header h1 { font-size:16px; margin:0; }
  header .prov { margin-left:auto; font-size:12px; color:var(--muted); }
  .wrap { max-width:760px; margin:0 auto; padding:16px 20px 120px; }
  .thread { display:flex; flex-direction:column; gap:10px; }
  .msg { max-width:78%; padding:10px 12px; border-radius:12px; }
  .msg.inbound { align-self:flex-start; background:var(--in); border-bottom-left-radius:3px; }
  .msg.outbound { align-self:flex-end; background:var(--out); border-bottom-right-radius:3px; }
  .msg .meta { font-size:11px; color:#cbd5e1; opacity:.85; margin-bottom:3px; display:flex; gap:8px; }
  .msg .body { white-space:pre-wrap; }
  .badge { font-size:10px; text-transform:uppercase; letter-spacing:.04em; padding:1px 6px; border-radius:999px; background:#0b1220; }
  .badge.queued{color:#cbd5e1}.badge.sent{color:#93c5fd}.badge.delivered{color:#6ee7b7}
  .badge.received{color:#5eead4}.badge.failed{color:#fca5a5}
  .empty { color:var(--muted); text-align:center; padding:40px 0; }
  .composer { position:fixed; bottom:0; left:0; right:0; background:var(--panel); border-top:1px solid var(--line); padding:10px 20px; }
  .composer .row { max-width:760px; margin:0 auto; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .composer label { font-size:11px; color:var(--muted); min-width:130px; }
  input, button { font:inherit; }
  input { background:#0b1220; border:1px solid var(--line); color:#e2e8f0; border-radius:8px; padding:8px 10px; }
  input.num { width:150px; } input.body { flex:1; min-width:200px; }
  button { background:#2563eb; color:#fff; border:0; border-radius:8px; padding:8px 14px; cursor:pointer; }
  button.alt { background:#059669; }
  button:disabled { opacity:.5; cursor:default; }
</style>
</head>
<body>
<header>
  <h1>📱 Nestr Realty — SMS Console</h1>
  <span class="prov" id="prov">provider: …</span>
</header>
<div class="wrap"><div class="thread" id="thread"><div class="empty">No messages yet. Send one below ↓</div></div></div>

<div class="composer">
  <div class="row">
    <label>Listing agent → inbound</label>
    <input class="num" id="inFrom" value="+15551234567" title="agent's number" />
    <input class="body" id="inBody" placeholder="Type a message as the listing agent…" />
    <button class="alt" id="inBtn">Receive inbound</button>
  </div>
  <div class="row" style="margin-top:8px">
    <label>Agent → outbound</label>
    <input class="num" id="outTo" value="+15551234567" title="recipient" />
    <input class="body" id="outBody" placeholder="Send a message as Nestr Realty…" />
    <button id="outBtn">Send outbound</button>
  </div>
</div>

<script>
const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const fmtTime = iso => new Date(iso).toLocaleTimeString();

async function refresh() {
  try {
    const res = await fetch('/api/sms/messages');
    const { messages = [] } = await res.json();
    const thread = document.getElementById('thread');
    if (!messages.length) { thread.innerHTML = '<div class="empty">No messages yet. Send one below ↓</div>'; return; }
    // API returns newest-first; show chronological (oldest at top).
    const ordered = messages.slice().reverse();
    thread.innerHTML = ordered.map(m => \`
      <div class="msg \${m.direction}">
        <div class="meta">
          <span>\${m.direction === 'inbound' ? '📥 ' + esc(m.from) : '📤 ' + esc(m.to)}</span>
          <span class="badge \${esc(m.status)}">\${esc(m.status)}</span>
          <span>\${fmtTime(m.createdAt)}</span>
        </div>
        <div class="body">\${esc(m.body)}</div>
      </div>\`).join('');
    thread.scrollIntoView({ block: 'end' });
  } catch (_) { /* ignore transient poll errors */ }
}

async function loadProvider() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    document.getElementById('prov').textContent = 'OpenAI key: ' + (s.services?.openai?.apiKeyPresent ? 'present' : 'missing');
  } catch (_) {}
}

async function post(url, body) {
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return res.json();
}

document.getElementById('inBtn').onclick = async () => {
  const from = document.getElementById('inFrom').value.trim();
  const body = document.getElementById('inBody').value.trim();
  if (!from || !body) return;
  document.getElementById('inBody').value = '';
  await post('/api/sms/simulate', { from, body });
  refresh();
};
document.getElementById('outBtn').onclick = async () => {
  const to = document.getElementById('outTo').value.trim();
  const body = document.getElementById('outBody').value.trim();
  if (!to || !body) return;
  document.getElementById('outBody').value = '';
  await post('/api/sms/send', { to, body });
  refresh();
};
[['inBody','inBtn'],['outBody','outBtn']].forEach(([i,b]) =>
  document.getElementById(i).addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById(b).click(); }));

loadProvider();
refresh();
setInterval(refresh, 1500);
</script>
</body>
</html>`;
