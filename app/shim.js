/* Connects the app to the REDEFINE team server. It gives the page the same small interface the
   claude.ai version uses (sample, db, user, downloads), so app.html runs unchanged in both places. */
(function () {
  const API = (window.FORM_APP_CONFIG || {}).api;
  if (!API) return;
  const KEY = 'rff.session';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const store = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {} };
  let session = load(), ready = null;

  async function post(body, signal, who) {
    const s = who || session;
    let r;
    try {
      r = await fetch(API, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(Object.assign({code: s.code, name: s.name}, body)), signal});
    } catch (e) { throw e.name === 'AbortError' ? {code: 'cancelled'} : {code: 'upstream_error', message: 'No connection to the team server'}; }
    let j;
    try { j = await r.json(); } catch (e) { throw {code: 'upstream_error', message: 'The team server sent an unreadable reply'}; }
    if (j.error === 'unauthorized' && !who){ store(null); location.reload(); }
    if (j.error) throw {code: j.error, message: j.error};
    return j;
  }

  /* sign-in screen */
  function gate() {
    if (ready) return ready;
    if (session) return (ready = Promise.resolve());
    ready = new Promise(done => {
      const box = document.createElement('div');
      box.id = 'gate';
      box.style.cssText = 'position:fixed;inset:0;z-index:40;background:var(--paper);display:grid;place-items:center;padding:24px;overflow:auto';
      box.innerHTML = '<form style="width:min(100%,360px);display:flex;flex-direction:column;gap:12px"><div class="logobar" style="align-self:flex-start"></div><h2>Sign in</h2><p class="note" style="margin:0">Enter your name and the REDEFINE team code.</p><div class="f"><label for="gName">Your name</label><input id="gName" autocomplete="name" required></div><div class="f"><label for="gCode">Team code</label><input id="gCode" type="password" autocomplete="current-password" required></div><p class="note" id="gMsg" role="alert" style="margin:0;color:var(--err)"></p><button class="btn primary">Sign in</button></form>';
      const logo = document.querySelector('.logobar'); if (logo) box.querySelector('.logobar').innerHTML = logo.innerHTML;
      document.body.appendChild(box);
      box.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        const who = {name: box.querySelector('#gName').value.trim(), code: box.querySelector('#gCode').value.trim()};
        const msg = box.querySelector('#gMsg'), btn = box.querySelector('button');
        msg.textContent = ''; btn.disabled = true; btn.textContent = 'Checking…';
        try {
          const r = await post({op: 'login'}, undefined, who);
          session = Object.assign(who, {owner: !!r.owner}); store(session); box.remove(); done();
        } catch (e) {
          msg.textContent = e.code === 'unauthorized' ? 'That team code is not right.' : e.code === 'locked' ? 'Too many wrong tries. Wait 15 minutes.' : 'Could not reach the team server. Check your connection.';
          btn.disabled = false; btn.textContent = 'Sign in';
        }
      };
    });
    return ready;
  }

  /* AI, through the team server */
  async function toJpegB64(blob) {
    const bmp = await createImageBitmap(blob), k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }
  async function sample(prompt, opts) {
    opts = opts || {};
    const list = opts.images ? [].concat(opts.images) : [], images = [];
    for (const b of list) { try { images.push(await toJpegB64(b)); } catch (e) { throw {code: 'image_rejected'}; } }
    return post({op: 'ai', prompt, images}, opts.signal);
  }
  sample.json = async (prompt, opts) => {
    const {text, truncated} = await sample(prompt, opts);
    if (truncated) throw {code: 'invalid_json', message: 'Answer was cut short'};
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/), a = text.search(/[{[]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    for (const t of [text, fence && fence[1], a >= 0 && b > a && text.slice(a, b + 1)]) { if (!t) continue; try { return JSON.parse(t); } catch (e) {} }
    throw {code: 'invalid_json', message: 'Unreadable answer'};
  };
  sample.limits = async () => ({images: {maxCount: 5}});

  /* team forms */
  const docSnap = (id, data) => ({id, exists: data != null, data: () => data});
  function collection(path) {
    if (path.indexOf('team') !== 0) return {get: async () => ({docs: []})};
    return {
      get: async () => ({docs: (await post({op: 'list', coll: path})).docs.map(d => docSnap(d.id, d.data))}),
      doc: id => ({
        set: data => post({op: 'set', coll: path, id, data}),
        get: async () => docSnap(id, (await post({op: 'get', coll: path, id})).doc),
        delete: () => post({op: 'del', coll: path, id})
      }),
      onSnapshot(next, error) {
        let seen = null;
        const check = async () => {
          if (document.hidden) return;
          try {
            const {ver} = await post({op: 'ver'});
            if (ver !== seen) { seen = ver; next({docs: (await post({op: 'list', coll: path})).docs.map(d => docSnap(d.id, d.data))}); }
          } catch (e) { if (error) error(e); }
        };
        check(); const t = setInterval(check, 45000);
        document.addEventListener('visibilitychange', check);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
      }
    };
  }

  const user = {
    id: async () => session.name, can: async () => true, isOwner: async () => !!session.owner,
    profiles: async ids => Object.fromEntries(ids.map(i => [i, {id: i, name: i}]))
  };

  /* Phones save through the share sheet, which needs a fresh tap, so offer the file on a small sheet. */
  const downloads = {
    save({filename, data}) {
      const type = /\.pdf$/i.test(filename) ? 'application/pdf' : /\.zip$/i.test(filename) ? 'application/zip' : 'application/octet-stream';
      const file = new File([data], filename, {type});
      const share = matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({files: [file]});
      if (!share) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = filename; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        return Promise.resolve({status: 'saved'});
      }
      return new Promise((done, no) => {
        const m = document.createElement('div'); m.className = 'modal open';
        m.innerHTML = '<div><h3>Your file is ready</h3><p class="note" style="word-break:break-all"></p><div class="row" style="justify-content:flex-end"><button class="btn">Cancel</button><button class="btn primary">Save or share</button></div></div>';
        m.querySelector('p').textContent = filename; document.body.appendChild(m);
        const [cancel, go] = m.querySelectorAll('button');
        cancel.onclick = () => { m.remove(); no({code: 'declined'}); };
        go.onclick = async () => {
          try { await navigator.share({files: [file], title: filename}); m.remove(); done({status: 'saved'}); }
          catch (e) { m.remove(); no({code: 'declined'}); }
        };
      });
    }
  };

  const parts = {sample, user, downloads, db: {collection}};
  window.claude = {use: async n => { await gate(); return parts[n] || null; }};

  /* sign out, placed in the agent settings dialog */
  document.addEventListener('DOMContentLoaded', () => {
    const row = document.querySelector('#aSave'); if (!row) return;
    const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Sign out'; b.style.marginRight = 'auto';
    b.onclick = () => { store(null); location.reload(); };
    row.parentElement.prepend(b);
  });
})();
