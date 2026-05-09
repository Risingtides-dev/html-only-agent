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
    .turn-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(148, 163, 184, 0.18);
      opacity: 0;
      animation: actionFade 250ms ease-out 80ms forwards;
    }
    @keyframes actionFade {
      to { opacity: 1; }
    }
    .turn-actions button {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 10px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: transparent;
      color: #64748b;
      cursor: pointer;
      border-radius: 2px;
      transition: color 120ms ease-out, border-color 120ms ease-out, background 120ms ease-out;
    }
    .turn-actions button:hover {
      color: #0f172a;
      border-color: rgba(148, 163, 184, 0.55);
      background: rgba(148, 163, 184, 0.06);
    }
    .refine-input {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(148, 163, 184, 0.18);
      display: flex;
      flex-direction: column;
      gap: 8px;
      animation: actionFade 220ms ease-out forwards;
    }
    .refine-input textarea {
      width: 100%;
      padding: 10px 12px;
      background: rgba(15, 23, 42, 0.04);
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 2px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #0f172a;
      resize: none;
      outline: none;
      transition: border-color 120ms ease-out, background 120ms ease-out;
      box-sizing: border-box;
    }
    .refine-input textarea:focus {
      border-color: rgba(148, 163, 184, 0.55);
      background: rgba(15, 23, 42, 0.06);
    }
    .refine-input textarea::placeholder { color: #94a3b8; }
    .refine-input .refine-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .refine-input .refine-buttons button {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 5px 12px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 2px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      transition: color 120ms ease-out, border-color 120ms ease-out, background 120ms ease-out;
    }
    .refine-input .refine-buttons button:disabled { opacity: 0.35; cursor: not-allowed; }
    .refine-input .refine-buttons button:hover:not(:disabled) {
      color: #0f172a;
      border-color: rgba(148, 163, 184, 0.55);
      background: rgba(148, 163, 184, 0.06);
    }
    .refine-input .refine-buttons button.primary {
      background: #0f172a;
      color: #e7e7ea;
      border-color: #0f172a;
    }
    .refine-input .refine-buttons button.primary:hover:not(:disabled) {
      background: #1e293b;
      border-color: #1e293b;
      color: #fff;
    }
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
        addTurnActions(t, id);
        scrollToBottom();
      }

      function addTurnActions(t, id) {
        if (t.el.querySelector('.turn-actions')) return;
        const actions = buildActions(t, id);
        t.el.appendChild(actions);
      }

      function buildActions(t, id) {
        const actions = document.createElement('div');
        actions.className = 'turn-actions';
        const refine = document.createElement('button');
        refine.type = 'button';
        refine.textContent = 'Refine';
        refine.addEventListener('click', () => openRefine(t, id, actions));
        const html = document.createElement('button');
        html.type = 'button';
        html.textContent = 'Save HTML';
        html.addEventListener('click', () => exportTurn(id, 'html'));
        const pdf = document.createElement('button');
        pdf.type = 'button';
        pdf.textContent = 'Save PDF';
        pdf.addEventListener('click', () => exportTurn(id, 'pdf'));
        actions.append(refine, html, pdf);
        return actions;
      }

      function openRefine(t, id, actions) {
        const wrap = document.createElement('div');
        wrap.className = 'refine-input';
        const ta = document.createElement('textarea');
        ta.placeholder = 'How should I refine this? (⌘/Ctrl+Enter to send, Esc to cancel)';
        ta.rows = 2;
        const buttons = document.createElement('div');
        buttons.className = 'refine-buttons';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        const submit = document.createElement('button');
        submit.type = 'button';
        submit.className = 'primary';
        submit.textContent = 'Send';
        submit.disabled = true;
        buttons.append(cancel, submit);
        wrap.append(ta, buttons);
        actions.replaceWith(wrap);
        setTimeout(() => ta.focus(), 0);

        const doCancel = () => {
          wrap.replaceWith(buildActions(t, id));
        };
        const doSubmit = () => {
          const note = ta.value.trim();
          if (!note) return;
          window.parent.postMessage({ type: 'refine', id: id, note: note }, '*');
          doCancel();
        };
        ta.addEventListener('input', () => { submit.disabled = !ta.value.trim(); });
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSubmit(); }
          if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
        });
        cancel.addEventListener('click', doCancel);
        submit.addEventListener('click', doSubmit);
      }

      function exportTurn(id, format) {
        const t = turns.get(id);
        if (!t) return;
        const body = bodyEl(t);
        const liveHTML = body ? body.innerHTML : t.buffer;
        window.parent.postMessage({
          type: 'export',
          id: id,
          format: format,
          html: liveHTML,
          ts: Date.now(),
        }, '*');
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
