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
          el.className = 'turn turn-user rounded-2xl bg-slate-900 text-white px-4 py-3 shadow';
          el.textContent = text || '';
        } else {
          el.className = 'turn rounded-2xl bg-white border border-slate-200 px-5 py-4 shadow-sm';
        }
        feed.appendChild(el);
        turns.set(id, { el, buffer: '', role });
        scrollToBottom();
      }

      function appendChunk(id, text) {
        const t = turns.get(id);
        if (!t || t.role !== 'assistant') return;
        t.buffer += text;
        t.el.innerHTML = t.buffer;
        scrollToBottom();
      }

      function finalizeTurn(id) {
        const t = turns.get(id);
        if (!t || t.role !== 'assistant') return;
        const tmp = document.createElement('div');
        tmp.innerHTML = t.buffer;
        t.el.innerHTML = '';
        while (tmp.firstChild) t.el.appendChild(tmp.firstChild);
        t.el.querySelectorAll('script').forEach((oldScript) => {
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
          case 'turn-end': return finalizeTurn(msg.id);
          case 'reset':
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
