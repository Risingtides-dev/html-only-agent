export const IFRAME_SHELL = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
  <style>
    html, body { margin: 0; padding: 0; }
    body {
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .turn { animation: fadeIn 220ms ease-out; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: none; }
    }
    .turn-user { align-self: flex-end; max-width: 80%; }
    .tool-status { margin-bottom: 0.5rem; min-height: 0; }
    .tool-status:empty { display: none; }
    .status-line {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      font-size: 11px;
      color: #64748b;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: opacity 320ms ease-out, transform 320ms ease-out;
    }
    .status-line .verb { color: #475569; }
    .status-line .sep { color: #cbd5e1; margin: 0 0.4em; }
    .status-line .detail { color: #94a3b8; }
    .status-line.fading { opacity: 0; transform: translateY(-2px); }
  </style>
</head>
<body class="min-h-screen p-6">
  <div id="feed" class="mx-auto flex max-w-4xl flex-col gap-6"></div>
  <script>
    (function () {
      const feed = document.getElementById('feed');
      const turns = new Map();

      function scrollToBottom() {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }

      function startTurn(id, role, text) {
        const el = document.createElement('div');
        el.dataset.role = role;
        if (role === 'user') {
          el.className = 'turn turn-user bg-slate-900 text-white px-4 py-3';
          el.textContent = text || '';
        } else {
          el.className = 'turn bg-white border border-slate-200 px-5 py-4';
          const status = document.createElement('div');
          status.className = 'tool-status';
          el.appendChild(status);
          const body = document.createElement('div');
          body.className = 'tool-body';
          el.appendChild(body);
        }
        feed.appendChild(el);
        turns.set(id, { el, buffer: '', role, toolLines: new Map() });
        scrollToBottom();
      }

      function bodyEl(t) {
        return t.el.querySelector('.tool-body') || t.el;
      }

      const VERBS = [
        'Pondering','Cogitating','Ruminating','Mulling','Pontificating',
        'Marinating','Percolating','Brewing','Hatching','Conjuring',
        'Distilling','Sleuthing','Unspooling','Excavating','Untangling',
        'Scheming','Reasoning','Reflecting','Noodling','Synthesizing'
      ];

      function shortDetail(name, args) {
        let key = '';
        if (args && typeof args === 'object') {
          for (const k of ['query','q','url','location','symbol','ticker','place']) {
            if (args[k] !== undefined && args[k] !== '') { key = String(args[k]); break; }
          }
        }
        if (key.length > 56) key = key.slice(0, 56) + '…';
        return { name: name, detail: key };
      }

      function renderStatus(t) {
        if (!t.statusLine) return;
        t.statusLine.innerHTML = '';
        const v = document.createElement('span');
        v.className = 'verb';
        v.textContent = t.statusVerb + '…';
        t.statusLine.appendChild(v);
        if (t.statusToolName) {
          const sep = document.createElement('span');
          sep.className = 'sep';
          sep.textContent = '·';
          t.statusLine.appendChild(sep);
          const d = document.createElement('span');
          d.className = 'detail';
          d.textContent = t.statusToolDetail
            ? t.statusToolName + ' ' + t.statusToolDetail
            : t.statusToolName;
          t.statusLine.appendChild(d);
        }
      }

      function ensureStatus(t) {
        if (t.statusLine) return;
        const wrap = t.el.querySelector('.tool-status');
        if (!wrap) return;
        const line = document.createElement('div');
        line.className = 'status-line';
        wrap.innerHTML = '';
        wrap.appendChild(line);
        t.statusLine = line;
        t.statusVerb = VERBS[Math.floor(Math.random() * VERBS.length)];
        t.statusToolName = '';
        t.statusToolDetail = '';
        renderStatus(t);
        t.verbTimer = setInterval(() => {
          if (!t.statusLine) return;
          let next = t.statusVerb;
          while (next === t.statusVerb) {
            next = VERBS[Math.floor(Math.random() * VERBS.length)];
          }
          t.statusVerb = next;
          renderStatus(t);
        }, 1400);
      }

      function fadeStatus(t) {
        if (t.verbTimer) { clearInterval(t.verbTimer); t.verbTimer = null; }
        const line = t.statusLine;
        if (!line) return;
        t.statusLine = null;
        line.classList.add('fading');
        setTimeout(() => line.remove(), 350);
      }

      function appendChunk(id, text) {
        const t = turns.get(id);
        if (!t || t.role !== 'assistant') return;
        if (t.statusLine) fadeStatus(t);
        t.buffer += text;
        bodyEl(t).innerHTML = t.buffer;
        scrollToBottom();
      }

      function appendThinking(id, _text) {
        const t = turns.get(id);
        if (!t || t.role !== 'assistant') return;
        ensureStatus(t);
      }

      function handleTool(id, name, args, status, error) {
        const t = turns.get(id);
        if (!t || t.role !== 'assistant') return;
        ensureStatus(t);
        if (status === 'start') {
          const s = shortDetail(name, args);
          t.statusToolName = s.name;
          t.statusToolDetail = s.detail;
          renderStatus(t);
        } else if (status === 'end' && error) {
          const s = shortDetail(name, args);
          t.statusToolName = s.name;
          t.statusToolDetail = (s.detail ? s.detail + ' — ' : '') + 'failed';
          renderStatus(t);
        }
      }

      function finalizeTurn(id) {
        const t = turns.get(id);
        if (!t || t.role !== 'assistant') return;
        if (t.statusLine) fadeStatus(t);
        const body = bodyEl(t);
        const tmp = document.createElement('div');
        tmp.innerHTML = t.buffer;
        body.innerHTML = '';
        while (tmp.firstChild) body.appendChild(tmp.firstChild);
        body.querySelectorAll('script').forEach((oldScript) => {
          const newScript = document.createElement('script');
          for (const attr of oldScript.attributes) {
            newScript.setAttribute(attr.name, attr.value);
          }
          newScript.textContent = oldScript.textContent;
          oldScript.replaceWith(newScript);
        });
        scrollToBottom();
      }

      window.addEventListener('message', (e) => {
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        switch (msg.type) {
          case 'turn-start': return startTurn(msg.id, msg.role, msg.text);
          case 'chunk': return appendChunk(msg.id, msg.text);
          case 'thinking': return appendThinking(msg.id, msg.text);
          case 'tool': return handleTool(msg.id, msg.name, msg.args, msg.status, msg.error);
          case 'turn-end': return finalizeTurn(msg.id);
          case 'reset':
            for (const t of turns.values()) {
              if (t.verbTimer) clearInterval(t.verbTimer);
            }
            feed.innerHTML = '';
            turns.clear();
            return;
        }
      });

      function notifyReady() {
        window.parent.postMessage({ type: 'ready' }, '*');
      }
      if (document.readyState === 'complete') notifyReady();
      else window.addEventListener('load', notifyReady);
    })();
  </script>
</body>
</html>`;
