/* Scan & sign, and My profile. Everything here runs on the device: scans, mark-ups and the agent's
   saved details never leave the phone unless the agent shares the finished PDF. */
(function () {
  const q = s => document.querySelector(s);
  const h = (s, a) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
  const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const say = m => (typeof toast === 'function' ? toast(m) : alert(m));
  const uidT = () => Math.random().toString(36).slice(2, 9);
  const cap = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) {} };
  const today = () => { const d = new Date(); return [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((v, i) => i < 2 ? String(v).padStart(2, '0') : v).join('/'); };

  /* ---------------- profile (device only) ---------------- */
  const PKEY = 'rff.profile';
  const FIELDS = [['name','Full name'],['rank','Ranking / title'],['ic','IC number'],['phone','Contact number'],['email','Email'],['agentCode','Agent code']];
  let profile = (() => { try { return Object.assign({snippets: []}, JSON.parse(localStorage.getItem(PKEY)) || {}); } catch (e) { return {snippets: []}; } })();
  const saveProfile = () => { try { localStorage.setItem(PKEY, JSON.stringify(profile)); return true; } catch (e) { say('This browser blocked saving. Your details will be lost when you close the app.'); return false; } };
  const myItems = () => [...FIELDS.filter(([k]) => profile[k]).map(([k, l]) => ({label: l, text: profile[k]})), ...(profile.snippets || []).filter(s => s.text).map(s => ({label: s.label || 'Saved wording', text: s.text})), {label: "Today's date", text: today()}];

  /* ---------------- styles ---------------- */
  document.head.appendChild(h(`<style>
  .modes{display:flex;gap:6px;padding:12px 0 0;flex-wrap:wrap}
  .modes button{flex:1 1 0;min-width:100px;border:1.5px solid var(--rule);background:var(--sheet);border-radius:10px;padding:10px 8px;font-weight:600;font-size:14px;cursor:pointer;color:var(--ink)}
  .modes button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
  .thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-top:14px}
  .thumb{background:var(--sheet);border:1px solid var(--rule);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px}
  .thumb img{width:100%;aspect-ratio:3/4;object-fit:contain;background:#fff;border-radius:4px;cursor:pointer}
  .thumb .row{gap:4px;justify-content:space-between}
  .thumb .btn{padding:4px 8px;min-height:34px}
  .cropper{position:fixed;inset:0;z-index:45;background:#111;color:#fff;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 8px) max(12px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 8px) max(12px,env(safe-area-inset-left,0px))}
  .cropper .stage{flex:1;position:relative;min-height:0;display:grid;place-items:center;touch-action:none;padding:22px}
  .cropper .stage canvas{max-width:100%;max-height:100%;display:block}
  .cropper svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  .cropper .hd{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #fff;background:rgba(198,47,59,.85);touch-action:none;cursor:grab}
  .cropper .bar{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding-top:8px}
  .cropper .bar .btn{background:#222;color:#fff;border-color:#444}
  .cropper .bar .btn[aria-pressed="true"]{background:#fff;color:#111}
  .cropper .bar .btn.primary{background:var(--stamp);border-color:var(--stamp)}
  .cropper.cam video{max-width:100%;max-height:100%;display:block;object-fit:contain}
  .cropper .camlast{width:44px;height:58px;object-fit:cover;border:2px solid #fff;border-radius:6px;margin-left:8px}
  .livehint{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;padding:6px 14px;border-radius:999px;font-size:14px;white-space:nowrap;pointer-events:none}
  .livecount{color:#fff;font-size:13px;opacity:.85}
  .cropper .stage.flash{background:#fff}
  .cropper .bar .shutter{min-width:140px;padding:12px 18px;font-size:16px}
  .mk-tools{position:sticky;top:env(safe-area-inset-top,0px);z-index:6;background:var(--paper);padding:10px 0;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--rule)}
  .mk-pages{display:flex;flex-direction:column;gap:16px;padding:14px 0;max-width:820px;margin:0 auto}
  .mk-page{position:relative;background:#fff;box-shadow:0 1px 0 var(--rule),0 6px 18px rgba(16,24,40,.1);touch-action:pan-y;overflow:hidden}
  .mk-page > canvas,.mk-page > img.bg{display:block;width:100%;height:auto}
  .mk-page .wm{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
  .mk-o{position:absolute;touch-action:none;cursor:move;line-height:1.2;white-space:pre;border:1.5px dashed transparent;padding:1px 2px}
  .mk-o.sel{border-color:var(--stamp);background:rgba(198,47,59,.05)}
  .mk-o img{display:block;width:100%;height:auto;pointer-events:none}
  .mk-o .rz{display:none;position:absolute;right:-12px;bottom:-12px;width:24px;height:24px;border-radius:50%;background:var(--stamp);border:2px solid #fff;touch-action:none}
  .mk-o.sel .rz{display:block}
  .mk-panel{background:var(--sheet);border:1px solid var(--rule);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px}
  .mk-panel textarea{width:100%;min-height:60px;border:1px solid var(--rule);border-radius:6px;padding:6px 8px;background:var(--paper);font-size:16px}
  .swatch{width:30px;height:30px;border-radius:50%;border:2px solid var(--rule);cursor:pointer}
  .swatch[aria-pressed="true"]{outline:2px solid var(--pen);outline-offset:2px}
  .menu-pop{position:absolute;z-index:8;background:var(--sheet);border:1px solid var(--rule);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:6px;max-height:60vh;overflow:auto;min-width:220px}
  .menu-pop button{display:block;width:100%;text-align:left;border:0;background:none;padding:9px 10px;border-radius:7px;cursor:pointer;color:var(--ink);font-size:14px}
  .menu-pop button:hover{background:var(--rule-2)}
  .menu-pop small{display:block;color:var(--ink-2);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}
  .sigpad{width:100%;height:180px;background:#fff;border:1.5px dashed var(--rule);border-radius:10px;touch-action:none;display:block}
  .sigprev{max-height:80px;background:#fff;border:1px solid var(--rule);border-radius:8px;padding:6px}
  .snip{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:start;border-top:1px solid var(--rule-2);padding-top:8px;margin-top:8px}
  .mebar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 10px}
  .mebar .chip{border:1px solid var(--rule);background:var(--sheet);border-radius:999px;padding:5px 11px;font-size:13px;cursor:pointer;color:var(--ink)}
  .result{display:flex;flex-direction:column;gap:10px}
  .result .big{width:100%;padding:13px;font-size:15px}
  @media (max-width:760px){.modes button{font-size:13px;padding:9px 6px}}
  </style>`));

  /* ---------------- layout: three modes ---------------- */
  const mast = q('.mast'), steps = q('.steps');
  const modes = h(`<nav class="modes" aria-label="Sections"><button data-m="fill" aria-pressed="true">Fill forms</button><button data-m="scan" aria-pressed="false">Scan &amp; sign</button><button data-m="profile" aria-pressed="false">My profile</button></nav>`);
  mast.after(modes);
  const wrap = q('.wrap');
  const pScan = h(`<section class="panel" id="pScan"></section>`), pProfile = h(`<section class="panel" id="pProfile"></section>`);
  wrap.appendChild(pScan); wrap.appendChild(pProfile);
  let mode = 'fill', fillStep = 1;
  const origGo = go;
  function setMode(m) {
    mode = m;
    modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    steps.hidden = m !== 'fill';
    [1, 2, 3].forEach(i => q('#p' + i).classList.toggle('on', m === 'fill' && i === fillStep));
    pScan.classList.toggle('on', m === 'scan'); pProfile.classList.toggle('on', m === 'profile');
    if (m === 'profile') renderProfile();
    if (m === 'scan') renderScan();
    if (m === 'fill') origGo(fillStep);
    window.scrollTo({top: 0});
  }
  go = function (n) { fillStep = n; if (mode !== 'fill') { mode = 'fill'; modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === 'fill'))); steps.hidden = false; pScan.classList.remove('on'); pProfile.classList.remove('on'); } origGo(n); };
  modes.addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (b) setMode(b.dataset.m); });

  /* ---------------- My profile ---------------- */
  function renderProfile() {
    pProfile.innerHTML = `
      <div class="eyebrow">My profile</div><h2>Your details and signature</h2>
      <p class="lede">Save your details once, then add them to any form or scan with one tap. They are kept on this phone only and are never sent to the team or the server.</p>
      <div class="grid2">
        <div class="card"><h3 style="margin-bottom:10px">Details</h3><div class="fg">${FIELDS.map(([k, l]) => `<div class="f ${k === 'name' || k === 'email' ? 'wide' : ''}"><label for="pf_${k}">${l}</label><input id="pf_${k}" data-k="${k}" value="${escH(profile[k])}" ${k === 'email' ? 'type="email" autocomplete="email"' : k === 'phone' ? 'type="tel" autocomplete="tel"' : k === 'name' ? 'autocomplete="name"' : ''}></div>`).join('')}</div>
          <h3 style="margin:16px 0 4px">Saved wording</h3><p class="note" style="margin:0">Lines you type often, such as "Certified true copy" or your branch address.</p>
          <div id="snips"></div><button class="btn sm" id="addSnip" style="margin-top:10px">＋ Add wording</button>
        </div>
        <div class="card"><h3 style="margin-bottom:6px">Signature</h3>
          <div id="sigNow"></div>
          <p class="note" style="margin:6px 0">Sign in the box with your finger, or upload a photo of your signature on white paper.</p>
          <canvas class="sigpad" id="sigPad"></canvas>
          <div class="row" style="margin-top:8px"><button class="btn sm" id="sigClear">Clear</button><button class="btn sm primary" id="sigSave">Save signature</button><label class="btn sm" for="sigFile">Upload photo</label><input type="file" id="sigFile" accept="image/*" hidden><button class="btn ghost sm" id="sigDel">Remove saved</button></div>
          <h3 style="margin:18px 0 6px">Move to another phone</h3>
          <p class="note" style="margin:0 0 8px">Save a backup file, then open it on your other phone or iPad. The file contains your IC number and signature, so keep it private.</p>
          <div class="row"><button class="btn sm" id="pfExport">Save backup file</button><label class="btn sm" for="pfImport">Load backup file</label><input type="file" id="pfImport" accept=".json,application/json" hidden></div>
        </div>
      </div>`;
    pProfile.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => { profile[el.dataset.k] = el.value.trim(); saveProfile(); renderMeBar(); }));
    const snips = q('#snips');
    const drawSnips = () => {
      snips.innerHTML = (profile.snippets || []).map(s => `<div class="snip" data-id="${s.id}"><div class="fg" style="grid-template-columns:1fr"><div class="f"><label>Name</label><input data-f="label" value="${escH(s.label)}" placeholder="e.g. True copy"></div><div class="f"><label>Wording</label><textarea data-f="text" rows="2" style="border:1px solid var(--rule);border-radius:6px;padding:6px 8px;background:var(--paper);font-size:16px">${escH(s.text)}</textarea></div></div><button class="btn ghost sm" data-del aria-label="Remove">✕</button></div>`).join('') || '<p class="note">None yet.</p>';
      snips.querySelectorAll('.snip').forEach(row => {
        const s = profile.snippets.find(x => x.id === row.dataset.id);
        row.querySelectorAll('[data-f]').forEach(el => el.addEventListener('input', () => { s[el.dataset.f] = el.value; saveProfile(); renderMeBar(); }));
        row.querySelector('[data-del]').onclick = () => { profile.snippets = profile.snippets.filter(x => x !== s); saveProfile(); drawSnips(); renderMeBar(); };
      });
    };
    drawSnips();
    q('#addSnip').onclick = () => { profile.snippets = profile.snippets || []; profile.snippets.push({id: uidT(), label: '', text: ''}); saveProfile(); drawSnips(); snips.querySelector('.snip:last-child input').focus(); };
    const showSig = () => { q('#sigNow').innerHTML = profile.signature ? `<p class="note" style="margin:0 0 4px">Saved signature:</p><img class="sigprev" src="${profile.signature}" alt="Your saved signature">` : '<p class="note" style="margin:0">No signature saved yet.</p>'; };
    showSig();
    const pad = sigPad(q('#sigPad'));
    q('#sigClear').onclick = () => pad.clear();
    q('#sigSave').onclick = () => { const d = pad.dataURL(); if (!d) return say('Sign in the box first.'); profile.signature = d; if (saveProfile()) say('Signature saved.'); pad.clear(); showSig(); };
    q('#sigDel').onclick = () => { delete profile.signature; saveProfile(); showSig(); };
    q('#sigFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { profile.signature = await inkFromPhoto(f); saveProfile(); showSig(); say('Signature saved from photo. Check it looks clean.'); } catch (err) { say('That photo could not be read. Try a JPG or PNG.'); } };
    q('#pfExport').onclick = () => { const blob = new Blob([JSON.stringify(profile)], {type: 'application/json'}); downloadFile(new File([blob], 'REDEFINE-profile-backup.json', {type: 'application/json'})); };
    q('#pfImport').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const d = JSON.parse(await f.text()); if (typeof d !== 'object' || !d) throw 0; profile = Object.assign({snippets: []}, d); saveProfile(); renderProfile(); renderMeBar(); say('Profile loaded.'); } catch (err) { say('That is not a profile backup file.'); } };
  }

  function sigPad(cv) {
    const ctx = cv.getContext('2d'); let drawn = false, last = null;
    const size = () => { const r = cv.getBoundingClientRect(), k = Math.min(3, window.devicePixelRatio || 1); cv.width = r.width * k; cv.height = r.height * k; ctx.scale(k, k); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#0a1a4a'; ctx.lineWidth = 2.6; };
    size();
    const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.onpointerdown = e => { cap(cv, e); last = pt(e); drawn = true; ctx.beginPath(); ctx.arc(last[0], last[1], 1.2, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); };
    cv.onpointermove = e => { if (!last) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; };
    cv.onpointerup = cv.onpointercancel = () => { last = null; };
    return {clear() { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; }, dataURL() { return drawn ? trimmed(cv) : null; }};
  }
  function trimmed(cv) {
    const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const p = 6, o = document.createElement('canvas'); o.width = x1 - x0 + 2 * p; o.height = y1 - y0 + 2 * p;
    o.getContext('2d').drawImage(cv, x0 - p, y0 - p, o.width, o.height, 0, 0, o.width, o.height); return o.toDataURL('image/png');
  }
  async function inkFromPhoto(file) {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, c.width, c.height);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const l = .3 * d[i] + .59 * d[i + 1] + .11 * d[i + 2], a = Math.max(0, Math.min(255, (175 - l) * 3)); d[i] = 10; d[i + 1] = 26; d[i + 2] = 74; d[i + 3] = a; }
    g.putImageData(im, 0, 0); const t = trimmed(c); if (!t) throw new Error('blank'); return t;
  }

  /* ---------------- files ---------------- */
  function downloadFile(file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  const canShareFile = f => !!(navigator.canShare && navigator.canShare({files: [f]}));

  /* ---------------- scanner ---------------- */
  let scanPages = [];          // {id, src: canvas, quad, rot, filter, out: canvas}
  let doc = null;              // the document being marked up: {pages:[{kind:'img'|'pdf', canvas|index, w, h}], pdf?, name, back}
  let objs = [], selId = null, watermark = {on: false, text: 'FOR INSURANCE APPLICATION USE ONLY', opacity: .16, size: .055, angle: -30, color: '#555555', tile: true};
  let view = 'pages';

  function renderScan() {
    if (view === 'markup') return renderMarkup();
    if (view === 'result') return;
    pScan.innerHTML = `
      <div class="eyebrow">Scan &amp; sign</div><h2>Scan a document</h2>
      <p class="lede">Snap an IC, receipt or any paper. The camera stays open so you can take page after page. Then tap Adjust on each page to crop it, add text, your signature or a watermark, and send it as a PDF. Scans stay on this phone until you send them.</p>
      <div class="row">${camOK ? '<button class="btn primary" id="scOpenCam">Scan with camera</button>' : '<label class="btn primary" for="scCam">Take a photo</label>'}<input type="file" id="scCam" accept="image/*" capture="environment" hidden>
        <label class="btn" for="scPick">Add photos or a PDF</label><input type="file" id="scPick" accept="image/*,.pdf,application/pdf" multiple hidden>
        ${scanPages.length ? '<button class="btn ghost" id="scClear">Start over</button>' : ''}</div>
      <div class="status" id="scStatus" style="margin-top:8px"></div>
      ${scanPages.some(p => !p.quad && !p.adjusted) ? '<p class="note" style="margin:10px 0 0">Tap Adjust on a page to crop it: drag the four corners to the edges of the paper.</p>' : ''}<div class="thumbs" id="scThumbs">${scanPages.map((p, i) => `<div class="thumb" data-id="${p.id}"><img src="${p.out.toDataURL('image/jpeg', .5)}" alt="Page ${i + 1}" data-edit><div class="row"><span class="note">Page ${i + 1}</span><button class="btn sm" data-edit>Adjust</button></div><div class="row"><button class="btn sm" data-up ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn sm" data-down ${i < scanPages.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button class="btn sm" data-del aria-label="Delete page">✕</button></div></div>`).join('')}</div>
      ${scanPages.length ? `<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ink" id="scNext">Next: add text, signature, watermark →</button></div>` : '<p class="empty">No pages yet. Tap Scan with camera to start.</p>'}`;
    const add = e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) addFiles(fs); };
    q('#scCam').onchange = add; q('#scPick').onchange = add;
    if (q('#scOpenCam')) q('#scOpenCam').onclick = openCamera;
    if (q('#scClear')) q('#scClear').onclick = e => { if (!e.currentTarget.dataset.armed) { e.currentTarget.dataset.armed = 1; e.currentTarget.textContent = 'Tap again to remove all pages'; return; } scanPages = []; renderScan(); };
    q('#scThumbs').onclick = e => {
      const card = e.target.closest('.thumb'); if (!card) return; const i = scanPages.findIndex(p => p.id === card.dataset.id), p = scanPages[i];
      if (e.target.closest('[data-edit]')) openCropper(p);
      else if (e.target.closest('[data-up]')) { scanPages.splice(i - 1, 0, scanPages.splice(i, 1)[0]); renderScan(); }
      else if (e.target.closest('[data-down]')) { scanPages.splice(i + 1, 0, scanPages.splice(i, 1)[0]); renderScan(); }
      else if (e.target.closest('[data-del]')) { scanPages.splice(i, 1); renderScan(); }
    };
    if (q('#scNext')) q('#scNext').onclick = () => openMarkup({pages: scanPages.map(p => ({kind: 'img', canvas: p.out, w: p.out.width, h: p.out.height})), name: 'Scan_' + today().split('/').reverse().join('-'), back: 'scan'});
  }

  const camOK = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  /* in-app camera that stays open between shots; pages are cropped by hand afterwards */
  async function openCamera() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 4032}, height: {ideal: 3024}}, audio: false}); }
    catch (e) { say(e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this app in your phone settings.' : 'The camera could not start here.'); const inp = q('#scCam'); if (inp) inp.click(); return; }
    const ui = h(`<div class="cropper cam" role="dialog" aria-label="Camera"><div class="stage"><video playsinline muted autoplay></video></div>
      <div class="bar"><span class="livecount" id="camCount">Take a photo of the first page</span></div>
      <div class="bar"><button class="btn" data-a="done">Done</button><button class="btn primary shutter" data-a="shot" aria-label="Take photo">Take photo</button><img class="camlast" alt="" hidden></div></div>`);
    document.body.appendChild(ui);
    const video = ui.querySelector('video'), stage = ui.querySelector('.stage'), last = ui.querySelector('.camlast'), count = ui.querySelector('#camCount');
    video.srcObject = stream; try { await video.play(); } catch (e) {}
    let taken = 0, busy = false;
    const shoot = () => {
      if (busy || !video.videoWidth) return; busy = true;
      const full = document.createElement('canvas'), kk = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight)); full.width = Math.round(video.videoWidth * kk); full.height = Math.round(video.videoHeight * kk); full.getContext('2d').drawImage(video, 0, 0, full.width, full.height);
      stage.classList.add('flash'); setTimeout(() => stage.classList.remove('flash'), 150);
      taken++; count.textContent = taken + ' page' + (taken > 1 ? 's' : '') + ' taken. Next page, or tap Done.';
      last.src = full.toDataURL('image/jpeg', .4); last.hidden = false;
      // clean the page after the flash so the camera stays responsive for the next shot
      setTimeout(() => { const p = {id: uidT(), src: full, quad: null, rot: 0, filter: 'enhance'}; p.out = process(p); scanPages.push(p); busy = false; }, 30);
    };
    const close = () => { stream.getTracks().forEach(tr => tr.stop()); ui.remove(); const wait = () => busy ? setTimeout(wait, 50) : renderScan(); wait(); };
    ui.addEventListener('click', e => { const b2 = e.target.closest('[data-a]'); if (!b2) return; if (b2.dataset.a === 'shot') shoot(); if (b2.dataset.a === 'done') close(); });
  }

  async function addFiles(files) {
    const st = q('#scStatus'); st.className = 'status busy';
    for (const f of files) {
      try {
        st.textContent = 'Reading ' + f.name + '…';
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
          const pdf = await pdfjsLib.getDocument({data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false}).promise;
          for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
            const pg = await pdf.getPage(i), vp1 = pg.getViewport({scale: 1}), vp = pg.getViewport({scale: Math.min(2.5, 1700 / vp1.width)});
            const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
            await pg.render({canvasContext: g, viewport: vp}).promise;
            scanPages.push({id: uidT(), src: c, quad: null, rot: 0, filter: 'original', out: c});
          }
        } else {
          const bmp = await createImageBitmap(f), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          const p = {id: uidT(), src: c, quad: null, rot: 0, filter: 'enhance'}; p.out = process(p); scanPages.push(p);
        }
      } catch (e) { console.error(e); say('Could not read ' + f.name + '. iPhone HEIC photos may need to be shared as JPG.'); }
    }
    st.className = 'status'; st.textContent = ''; renderScan();
  }

  /* Page finding, CamScanner style: look for the four straight edges of the paper (Hough lines on an
     edge map) and, as a fallback, the largest bright area. Each candidate is scored by how much real edge
     lies along its outline, and the best one wins. Works on a small copy, so it is fast enough for live video. */
  function smallGray(c, maxSide) {
    const k = Math.min(1, maxSide / Math.max(c.width || c.videoWidth, c.height || c.videoHeight)), w = Math.max(8, Math.round((c.width || c.videoWidth) * k)), hh = Math.max(8, Math.round((c.height || c.videoHeight) * k));
    const s = document.createElement('canvas'); s.width = w; s.height = hh; const g = s.getContext('2d', {willReadFrequently: true}); g.drawImage(c, 0, 0, w, hh);
    const d = g.getImageData(0, 0, w, hh).data, gray = new Float32Array(w * hh);
    for (let i = 0; i < w * hh; i++) gray[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
    return {gray, w, h: hh, k};
  }
  function edgeMap(gray, w, hh) {
    const b = new Float32Array(w * hh), t = new Float32Array(w * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += gray[y * w + xx]; n++; } } t[y * w + x] = s / n; }
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy >= 0 && yy < hh) { s += t[yy * w + x]; n++; } } b[y * w + x] = s / n; }
    const mag = new Float32Array(w * hh); let mx = 0;
    for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, gx = b[i - w + 1] + 2 * b[i + 1] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - 1] - b[i + w - 1], gy = b[i + w - 1] + 2 * b[i + w] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - w] - b[i - w + 1];
      mag[i] = Math.hypot(gx, gy); if (mag[i] > mx) mx = mag[i];
    }
    const bins = new Uint32Array(256), sc = 255 / (mx || 1); for (let i = 0; i < w * hh; i++) bins[Math.min(255, (mag[i] * sc) | 0)]++;
    let acc8 = 0, bi8 = 255; while (bi8 > 0 && acc8 < w * hh * .1) acc8 += bins[bi8--];
    const thr = Math.max(16, (bi8 + 1) / sc);
    // faint edges (white paper on a light desk) count when checking an outline, though they are too weak to find lines with
    let accW = acc8, biW = bi8; while (biW > 0 && accW < w * hh * .3) accW += bins[biW--];
    const weak = Math.max(9, (biW + 1) / sc);
    const e = new Uint8Array(w * hh), ew = new Uint8Array(w * hh); for (let i = 0; i < w * hh; i++) { if (mag[i] >= thr) e[i] = 1; if (mag[i] >= weak) ew[i] = 1; }
    const near = new Uint8Array(w * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (ew[y * w + x]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < hh && xx >= 0 && xx < w) near[yy * w + xx] = 1; }
    return {e, near};
  }
  function support(quad, near, w, hh) {
    let hit = 0, tot = 0;
    for (let s = 0; s < 4; s++) { const [x0, y0] = quad[s], [x1, y1] = quad[(s + 1) % 4], n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
      for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); tot++; if (x >= 0 && y >= 0 && x < w && y < hh && near[y * w + x]) hit++; } }
    return tot ? hit / tot : 0;
  }
  const areaOf = q => Math.abs(q.reduce((s, p, i) => { const r = q[(i + 1) % 4]; return s + p[0] * r[1] - r[0] * p[1]; }, 0)) / 2;
  // a real page seen by a camera: opposite sides of similar length, corners not too sharp or too flat
  const plausible = q => { const L = i => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]), s = [0, 1, 2, 3].map(L);
    if (Math.max(s[0], s[2]) / Math.max(1, Math.min(s[0], s[2])) > 2.3 || Math.max(s[1], s[3]) / Math.max(1, Math.min(s[1], s[3])) > 2.3) return false;
    for (let i = 0; i < 4; i++) { const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4], v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]], ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)))) * 180 / Math.PI; if (ang < 45 || ang > 135) return false; }
    return true; };
  const convex = q => { let sign = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4], z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(z) < 1e-6) return false; if (!sign) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false; } return true; };
  function houghQuad(e, near, w, hh) {
    const diag = Math.ceil(Math.hypot(w, hh)), R = 2 * diag + 1, T = 180, acc = new Int32Array(T * R), cs = [], sn = [];
    for (let t = 0; t < T; t++) { cs.push(Math.cos(t * Math.PI / 180)); sn.push(Math.sin(t * Math.PI / 180)); }
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (e[y * w + x]) for (let t = 0; t < T; t++) acc[t * R + Math.round(x * cs[t] + y * sn[t]) + diag]++;
    const lines = [], work = Int32Array.from(acc); let top = 0;
    for (let k = 0; k < 24; k++) {
      let bi = 0; for (let i = 1; i < work.length; i++) if (work[i] > work[bi]) bi = i;
      const v = work[bi]; if (!k) top = v; if (v < Math.max(12, top * .2)) break;
      const t = Math.floor(bi / R), r = bi % R - diag; lines.push({t, r, v});
      for (let dt = -8; dt <= 8; dt++) for (let dr = -12; dr <= 12; dr++) { let tt = t + dt, rr = r + dr; if (tt < 0) { tt += T; rr = -rr; } if (tt >= T) { tt -= T; rr = -rr; } const j = tt * R + rr + diag; if (j >= 0 && j < work.length) work[j] = 0; }
    }
    const H = lines.filter(l => l.t >= 45 && l.t < 135).slice(0, 10), V = lines.filter(l => l.t < 45 || l.t >= 135).slice(0, 10);
    const meet = (a, b) => { const d = cs[a.t] * sn[b.t] - sn[a.t] * cs[b.t]; if (Math.abs(d) < 1e-6) return null; return [(a.r * sn[b.t] - sn[a.t] * b.r) / d, (cs[a.t] * b.r - a.r * cs[b.t]) / d]; };
    const yAt = l => (l.r - (w / 2) * cs[l.t]) / sn[l.t], xAt = l => (l.r - (hh / 2) * sn[l.t]) / cs[l.t];
    const found = [];
    for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) for (let a = 0; a < V.length; a++) for (let b = a + 1; b < V.length; b++) {
      let [t1, t2] = yAt(H[i]) < yAt(H[j]) ? [H[i], H[j]] : [H[j], H[i]], [l1, l2] = xAt(V[a]) < xAt(V[b]) ? [V[a], V[b]] : [V[b], V[a]];
      const quad = [meet(t1, l1), meet(t1, l2), meet(t2, l2), meet(t2, l1)];
      if (quad.some(p => !p || p[0] < -w * .04 || p[0] > w * 1.04 || p[1] < -hh * .04 || p[1] > hh * 1.04) || !convex(quad) || !plausible(quad)) continue;
      const area = areaOf(quad) / (w * hh); if (area < .015) continue;
      const sp = support(quad, near, w, hh); if (sp < .5) continue;
      found.push({quad, sp, area});
    }
    return found;
  }
  // a paper edge separates paper from background; a table border inside the page has paper on both sides
  function edgeContrast(quad, gray, w, hh) {
    const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4, off = Math.max(2.5, Math.hypot(w, hh) * .008), sides = [];
    const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < w && y < hh ? gray[y * w + x] : null; };
    for (let s = 0; s < 4; s++) {
      const [x0, y0] = quad[s], [x1, y1] = quad[(s + 1) % 4], L = Math.hypot(x1 - x0, y1 - y0) || 1; let nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; if ((mx + nx - cx) ** 2 + (my + ny - cy) ** 2 < (mx - cx) ** 2 + (my - cy) ** 2) { nx = -nx; ny = -ny; }
      let sum = 0, n = 0;
      for (let i = 1; i < 20; i++) { const x = x0 + (x1 - x0) * i / 20, y = y0 + (y1 - y0) * i / 20, a = at(x - nx * off, y - ny * off), b = at(x + nx * off, y + ny * off); if (a !== null && b !== null) { sum += a - b; n++; } }
      sides.push(n ? sum / n : 0);
    }
    // a real page is brighter (or darker) than its background along all four edges; patterns flip from side to side
    const same = sides.every(v => v > 0) || sides.every(v => v < 0), mags = sides.map(Math.abs).sort((a, b) => a - b);
    return {ct: (mags[1] + mags[2] + mags[3]) / 3 * .7 + mags[0] * .3, minSide: same ? mags[0] : 0};
  }
  const inside = (pt, q) => { for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; if ((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]) < -1) return false; } return true; };
  function brightQuad(gray, w, hh) {
    const hist = new Array(256).fill(0); for (let i = 0; i < w * hh; i++) hist[Math.min(255, gray[i] | 0)]++;
    let sum = 0, sumB = 0, wB = 0, best = 0, t = 128; for (let i = 0; i < 256; i++) sum += i * hist[i];
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = w * hh - wB; if (!wF) break; sumB += i * hist[i]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; t = i; } }
    const seen = new Uint8Array(w * hh); let bestComp = null;
    for (let i = 0; i < w * hh; i++) {
      if (seen[i] || gray[i] <= t) continue;
      const stack = [i], comp = []; seen[i] = 1;
      while (stack.length) { const j = stack.pop(); comp.push(j); const x = j % w, y = (j / w) | 0;
        for (const n of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < hh - 1 ? j + w : -1]) if (n >= 0 && !seen[n] && gray[n] > t) { seen[n] = 1; stack.push(n); } }
      if (!bestComp || comp.length > bestComp.length) bestComp = comp;
    }
    if (!bestComp || bestComp.length < w * hh * .015 || bestComp.length > w * hh * .97) return null;
    let tl, tr, br, bl, a = 1e9, b = -1e9, cc = -1e9, dd = 1e9;
    for (const j of bestComp) { const x = j % w, y = (j / w) | 0; if (x + y < a) { a = x + y; tl = [x, y]; } if (x + y > b) { b = x + y; br = [x, y]; } if (x - y > cc) { cc = x - y; tr = [x, y]; } if (x - y < dd) { dd = x - y; bl = [x, y]; } }
    return [tl, tr, br, bl];
  }
  // returns corners in the source's own pixels, or null; maxSide trades accuracy for speed (live video uses less)
  function detectQuad(c, maxSide, strict) {
    const {gray, w, h: hh, k} = smallGray(c, maxSide || 480), {e, near} = edgeMap(gray, w, hh);
    const cands = houghQuad(e, near, w, hh);
    const bq = brightQuad(gray, w, hh); if (bq && convex(bq) && plausible(bq)) { const sp = support(bq, near, w, hh); if (sp >= .45) cands.push({quad: bq, sp: sp * .97, area: areaOf(bq) / (w * hh)}); }
    if (!cands.length) return null;
    cands.forEach(cd => { const ec = edgeContrast(cd.quad, gray, w, hh); cd.ct = ec.ct; cd.minSide = ec.minSide; cd.score = cd.sp ** 1.5 * Math.max(.1, Math.min(1, cd.ct / 22)) * (cd.minSide >= 8 ? 1 : .5) * (.45 + .55 * Math.sqrt(Math.min(1, cd.area / .45))); });
    cands.sort((a, b) => b.score - a.score);
    let best = cands[0];
    // the page, not a box printed on it: an outline that contains the winner and nearly matches its score is the paper's edge
    for (const cd of cands) if (cd !== best && cd.area > best.area * 1.15 && cd.score >= best.score * .8 && cd.ct >= 10 && best.quad.every(p => inside(p, cd.quad))) best = cd;
    // live auto-capture must not fire on clutter: insist on a well-outlined page of a fair size with real contrast
    if (strict && (best.area < .08 || best.sp < .65 || best.minSide < 15)) return null;
    // no outline with paper-like edges on all four sides: keep the whole photo rather than guess a wrong crop
    if (!strict && (best.score < .12 || best.minSide < 8)) return null;
    const W = (c.width || c.videoWidth), H = (c.height || c.videoHeight);
    return best.quad.map(([x, y]) => [Math.max(0, Math.min(W, x / k)), Math.max(0, Math.min(H, y / k))]);
  }
  /* sharpen each edge on the full-size picture: search across the rough edge for the strongest brightness step,
     fit a straight line through those points, and meet the four lines at the corners */
  function refineQuad(c, quad) {
    if (!quad) return quad;
    const {gray, w, h: hh, k} = smallGray(c, 1600), Q = quad.map(([x, y]) => [x * k, y * k]), diag = Math.hypot(w, hh), R = Math.max(6, Math.round(diag * .012));
    const cx = Q.reduce((s, p) => s + p[0], 0) / 4, cy = Q.reduce((s, p) => s + p[1], 0) / 4;
    const G = (x, y) => { const xi = Math.max(0, Math.min(w - 2, x | 0)), yi = Math.max(0, Math.min(hh - 2, y | 0)), fx = x - xi, fy = y - yi, i = yi * w + xi; return gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy; };
    const lines = [];
    for (let s = 0; s < 4; s++) {
      const [x0, y0] = Q[s], [x1, y1] = Q[(s + 1) % 4], L = Math.hypot(x1 - x0, y1 - y0) || 1; let nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; if ((mx + nx - cx) ** 2 + (my + ny - cy) ** 2 < (mx - cx) ** 2 + (my - cy) ** 2) { nx = -nx; ny = -ny; }
      let pts = [];
      for (let i = 2; i < 38; i++) {
        const t = i / 40, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t; let bestD = 0, bestS = null;
        for (let d = -R; d <= R; d++) { const x = px + nx * d, y = py + ny * d; if (x < 2 || y < 2 || x > w - 3 || y > hh - 3) continue; const g = Math.abs(G(x + nx * 1.5, y + ny * 1.5) - G(x - nx * 1.5, y - ny * 1.5)); if (g > bestD) { bestD = g; bestS = d; } }
        if (bestS !== null && bestD > 12) pts.push([px + nx * bestS, py + ny * bestS]);
      }
      for (let it = 0; it < 3 && pts.length >= 10; it++) {
        const mxp = pts.reduce((a, p) => a + p[0], 0) / pts.length, myp = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        let sxx = 0, syy = 0, sxy = 0; pts.forEach(([x, y]) => { sxx += (x - mxp) ** 2; syy += (y - myp) ** 2; sxy += (x - mxp) * (y - myp); });
        const ang = .5 * Math.atan2(2 * sxy, sxx - syy), dx = Math.cos(ang), dy = Math.sin(ang);
        const line = {px: mxp, py: myp, dx, dy}, dist = p => Math.abs((p[0] - mxp) * dy - (p[1] - myp) * dx);
        const kept = pts.filter(p => dist(p) < (it ? 1.5 : 3)); lines[s] = line; if (kept.length === pts.length) break; pts = kept;
      }
      if (!lines[s] || pts.length < 10) return quad;
    }
    const meet = (a, b) => { const den = a.dx * b.dy - a.dy * b.dx; if (Math.abs(den) < 1e-6) return null; const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den; return [a.px + a.dx * t, a.py + a.dy * t]; };
    const out = [meet(lines[3], lines[0]), meet(lines[0], lines[1]), meet(lines[1], lines[2]), meet(lines[2], lines[3])];
    if (out.some(p => !p) || out.some((p, i) => Math.hypot(p[0] - Q[i][0], p[1] - Q[i][1]) > diag * .03)) return quad;
    const W0 = c.width || c.videoWidth, H0 = c.height || c.videoHeight;
    return out.map(([x, y]) => [Math.max(0, Math.min(W0, x / k)), Math.max(0, Math.min(H0, y / k))]);
  }
  const autoQuad = c => refineQuad(c, detectQuad(c, 480));
  const fullQuad = c => [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]];

  function solve8(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) { const [x, y] = src[i], [X, Y] = dst[i]; A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X); A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y); }
    for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
    return b.map((v, i) => v / A[i][i]);
  }
  function process(p) {
    const quad = p.quad || fullQuad(p.src), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2])), H = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
    const k = Math.min(1, 1800 / Math.max(W, H)); W = Math.round(W * k); H = Math.round(H * k);
    const out = document.createElement('canvas'); out.width = W; out.height = H; const og = out.getContext('2d');
    if (!p.quad) og.drawImage(p.src, 0, 0, W, H);
    else {
      const hm = solve8([[0, 0], [W, 0], [W, H], [0, H]], quad), sd = p.src.getContext('2d').getImageData(0, 0, p.src.width, p.src.height), sw = p.src.width, sh = p.src.height, s = sd.data;
      const od = og.createImageData(W, H), o = od.data;
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
        const z = hm[6] * u + hm[7] * v + 1, x = (hm[0] * u + hm[1] * v + hm[2]) / z, y = (hm[3] * u + hm[4] * v + hm[5]) / z;
        const x0 = Math.max(0, Math.min(sw - 2, x | 0)), y0 = Math.max(0, Math.min(sh - 2, y | 0)), fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0)), i = (y0 * sw + x0) * 4, j = (v * W + u) * 4;
        for (let ch = 0; ch < 3; ch++) o[j + ch] = s[i + ch] * (1 - fx) * (1 - fy) + s[i + 4 + ch] * fx * (1 - fy) + s[i + sw * 4 + ch] * (1 - fx) * fy + s[i + sw * 4 + 4 + ch] * fx * fy;
        o[j + 3] = 255;
      }
      og.putImageData(od, 0, 0);
    }
    filter(out, p.filter);
    if (!p.rot) return out;
    const r = document.createElement('canvas'), odd = p.rot % 180 !== 0; r.width = odd ? H : W; r.height = odd ? W : H;
    const rg = r.getContext('2d'); rg.translate(r.width / 2, r.height / 2); rg.rotate(p.rot * Math.PI / 180); rg.drawImage(out, -W / 2, -H / 2); return r;
  }
  function filter(c, kind) {
    if (kind === 'original') return;
    const g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height), d = im.data, n = c.width * c.height;
    if (kind === 'enhance') {
      // lighting estimate: shrink, erase text with a max filter, blur, enlarge
      const W = c.width, H = c.height, sw = Math.max(8, Math.round(W / 8)), sh = Math.max(8, Math.round(H / 8));
      let cur = c; while (cur.width / 2 > sw) { const t = document.createElement('canvas'); t.width = Math.max(sw, cur.width >> 1); t.height = Math.max(sh, cur.height >> 1); t.getContext('2d').drawImage(cur, 0, 0, t.width, t.height); cur = t; }
      const sm = cur.getContext('2d').getImageData(0, 0, cur.width, cur.height), a = sm.data, bw = cur.width, bh = cur.height;
      for (let pass = 0; pass < 3; pass++) { const src = Uint8ClampedArray.from(a); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = (y * bw + x) * 4; for (let ch = 0; ch < 3; ch++) { let m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = Math.min(bh - 1, Math.max(0, y + dy)), xx = Math.min(bw - 1, Math.max(0, x + dx)); m = Math.max(m, src[(yy * bw + xx) * 4 + ch]); } a[i + ch] = m; } } }
      cur.getContext('2d').putImageData(sm, 0, 0);
      const tiny = document.createElement('canvas'); tiny.width = Math.max(4, bw >> 2); tiny.height = Math.max(4, bh >> 2); tiny.getContext('2d').drawImage(cur, 0, 0, tiny.width, tiny.height);
      const big = document.createElement('canvas'); big.width = W; big.height = H; const bg = big.getContext('2d'); bg.imageSmoothingQuality = 'high'; bg.drawImage(tiny, 0, 0, W, H);
      const L = bg.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.min(255, d[i + ch] / Math.max(40, L[i + ch]) * 248);
      const hist = new Array(256).fill(0); for (let i = 0; i < n; i++) hist[(d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) | 0]++;
      let lo = 0, hi = 255, acc = 0; while (acc < n * .02 && lo < 254) acc += hist[lo++]; acc = 0; while (acc < n * .04 && hi > 1) acc += hist[hi--];
      // paper colour sets each channel's white (fixes yellow or blue light); ink level is capped so a mostly blank page is not over-stretched
      lo = Math.min(lo, 70); const sum = [0, 0, 0]; let cnt = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11 >= hi - 12) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; cnt++; }
      const f = [0, 1, 2].map(ch => 255 / Math.max(60, (cnt ? sum[ch] / cnt : 255) - lo));
      for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.min(255, (d[i + ch] - lo) * f[ch]));
    } else {
      const gray = new Float32Array(n); for (let i = 0; i < n; i++) gray[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
      if (kind === 'grey') for (let i = 0; i < n; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = gray[i];
      else {
        const W = c.width, H = c.height, I = new Float64Array((W + 1) * (H + 1)), r = Math.max(8, Math.round(W / 40));
        for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += gray[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r);
          const mean = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
          const v = gray[y * W + x] < mean * .88 ? 0 : 255; d[(y * W + x) * 4] = d[(y * W + x) * 4 + 1] = d[(y * W + x) * 4 + 2] = v;
        }
      }
    }
    g.putImageData(im, 0, 0);
  }

  function openCropper(p) {
    const draft = {quad: (p.quad || fullQuad(p.src)).map(v => v.slice()), filter: p.filter, rot: p.rot};
    const ui = h(`<div class="cropper" role="dialog" aria-label="Adjust page"><div class="stage"><canvas></canvas><svg><polygon fill="rgba(198,47,59,.15)" stroke="#fff" stroke-width="2"></polygon></svg></div>
      <div class="bar"><button class="btn sm" data-a="auto">Find edges</button><button class="btn sm" data-a="full">Whole photo</button><button class="btn sm" data-a="rot">Rotate ↻</button></div>
      <div class="bar">${[['original','Original'],['enhance','Clean'],['grey','Grey'],['bw','Black & white']].map(([k, l]) => `<button class="btn sm" data-f="${k}" aria-pressed="${draft.filter === k}">${l}</button>`).join('')}</div>
      <div class="bar"><button class="btn" data-a="cancel">Cancel</button><button class="btn primary" data-a="ok">Apply</button></div></div>`);
    document.body.appendChild(ui);
    const stage = ui.querySelector('.stage'), cv = ui.querySelector('canvas'), poly = ui.querySelector('polygon');
    const k = Math.min(1, 1400 / Math.max(p.src.width, p.src.height)); cv.width = p.src.width * k; cv.height = p.src.height * k; cv.getContext('2d').drawImage(p.src, 0, 0, cv.width, cv.height);
    const handles = draft.quad.map(() => { const d = document.createElement('div'); d.className = 'hd'; stage.appendChild(d); return d; });
    const geom = () => { const r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(); return {ox: r.left - sr.left, oy: r.top - sr.top, s: r.width / p.src.width}; };
    const place = () => { const {ox, oy, s} = geom(); draft.quad.forEach(([x, y], i) => { handles[i].style.left = ox + x * s + 'px'; handles[i].style.top = oy + y * s + 'px'; }); poly.setAttribute('points', draft.quad.map(([x, y]) => `${ox + x * s},${oy + y * s}`).join(' ')); };
    handles.forEach((d, i) => {
      d.onpointerdown = e => { e.preventDefault(); cap(d, e); d.dataset.drag = 1; };
      d.onpointermove = e => { if (!d.dataset.drag) return; const sr = stage.getBoundingClientRect(), {ox, oy, s} = geom(); draft.quad[i] = [Math.max(0, Math.min(p.src.width, (e.clientX - sr.left - ox) / s)), Math.max(0, Math.min(p.src.height, (e.clientY - sr.top - oy) / s))]; place(); };
      d.onpointerup = d.onpointercancel = () => { delete d.dataset.drag; };
    });
    requestAnimationFrame(place); const onR = () => place(); window.addEventListener('resize', onR);
    const close = () => { window.removeEventListener('resize', onR); ui.remove(); };
    ui.addEventListener('click', e => {
      const f = e.target.closest('[data-f]'); if (f) { draft.filter = f.dataset.f; ui.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', String(b === f))); return; }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'auto') { const qd = autoQuad(p.src); if (qd) { draft.quad = qd; place(); } else say('Could not find the page edges. Drag the corners instead.'); }
      if (a.dataset.a === 'full') { draft.quad = fullQuad(p.src); place(); }
      if (a.dataset.a === 'rot') { draft.rot = (draft.rot + 90) % 360; say('Turned ' + draft.rot + '°. You will see it after Apply.'); }
      if (a.dataset.a === 'cancel') close();
      if (a.dataset.a === 'ok') { a.textContent = 'Working…'; setTimeout(() => { const full = draft.quad.every((v, i) => Math.hypot(v[0] - fullQuad(p.src)[i][0], v[1] - fullQuad(p.src)[i][1]) < 2); Object.assign(p, {quad: full ? null : draft.quad, filter: draft.filter, rot: draft.rot, adjusted: true}); p.out = process(p); close(); renderScan(); }, 30); }
    });
  }

  /* ---------------- mark-up editor ---------------- */
  async function openMarkup(d) {
    if (d.pdf) {
      const pdf = await pdfjsLib.getDocument({data: d.pdf.slice(), isEvalSupported: false}).promise; d.pages = [];
      for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i), vp = pg.getViewport({scale: 1}); d.pages.push({kind: 'pdf', index: i - 1, w: vp.width, h: vp.height, pg}); }
    }
    doc = d; objs = []; selId = null; view = 'markup';
    if (mode !== 'scan') { mode = 'scan'; modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === 'scan'))); steps.hidden = true; [1, 2, 3].forEach(i => q('#p' + i).classList.remove('on')); pProfile.classList.remove('on'); pScan.classList.add('on'); }
    renderMarkup(); window.scrollTo({top: 0});
  }
  let activePage = 0;
  function renderMarkup() {
    pScan.innerHTML = `
      <div class="mk-tools">
        <div class="row" style="justify-content:space-between"><button class="btn ghost sm" id="mkBack">← ${doc.back === 'fill' ? 'Back to form' : 'Back to pages'}</button><button class="btn primary" id="mkDone">Finish &amp; send</button></div>
        <div class="row"><button class="btn sm" id="mkText">＋ Text</button><button class="btn sm" id="mkMe">＋ My details</button><button class="btn sm" id="mkSig">＋ Signature</button><button class="btn sm" id="mkDate">＋ Date</button><button class="btn sm" id="mkWm" aria-pressed="${watermark.on}">Watermark</button></div>
        <div id="mkPanel"></div>
      </div>
      <div class="mk-pages" id="mkPages"></div>`;
    const host = q('#mkPages');
    doc.pages.forEach((pg, i) => {
      const el = h(`<div class="mk-page" data-i="${i}"></div>`);
      if (pg.kind === 'img') { const img = new Image(); img.className = 'bg'; img.src = pg.canvas.toDataURL('image/jpeg', .8); img.alt = 'Page ' + (i + 1); el.appendChild(img); }
      else { const c = document.createElement('canvas'); el.appendChild(c); const w = Math.min(1600, 900 * Math.min(2, devicePixelRatio || 1)), vp = pg.pg.getViewport({scale: w / pg.w}); c.width = vp.width; c.height = vp.height; pg.pg.render({canvasContext: c.getContext('2d'), viewport: vp}); }
      el.style.aspectRatio = pg.w + ' / ' + pg.h;
      const wm = document.createElement('canvas'); wm.className = 'wm'; el.appendChild(wm);
      el.addEventListener('pointerdown', e => { activePage = i; if (e.target === el || e.target.classList.contains('bg') || e.target.tagName === 'CANVAS') { selId = null; drawObjs(); panel(); } });
      host.appendChild(el);
    });
    drawWatermarks(); drawObjs(); panel();
    q('#mkBack').onclick = () => { view = 'pages'; if (doc.back === 'fill') { doc = null; go(3); } else renderScan(); };
    q('#mkText').onclick = () => addObj({type: 'text', text: 'Type here', size: .028, color: '#0a1a4a'});
    q('#mkDate').onclick = () => addObj({type: 'text', text: today(), size: .024, color: '#0a1a4a'});
    q('#mkSig').onclick = () => { if (!profile.signature) { say('Save your signature in My profile first.'); return setMode('profile'); } const im = new Image(); im.onload = () => addObj({type: 'img', src: profile.signature, w: .26, ar: im.height / im.width}); im.src = profile.signature; };
    q('#mkMe').onclick = e => popMenu(e.currentTarget, myItems().map(it => ({label: it.label, sub: it.text, run: () => addObj({type: 'text', text: it.text, size: .024, color: '#0a1a4a'})})), 'Nothing saved yet. Add your details in My profile.');
    q('#mkWm').onclick = () => { watermark.on = !watermark.on; q('#mkWm').setAttribute('aria-pressed', String(watermark.on)); selId = watermark.on ? 'wm' : null; drawWatermarks(); panel(); };
    q('#mkDone').onclick = finish;
  }
  function visiblePage() {
    const pages = [...document.querySelectorAll('.mk-page')]; let best = activePage, bestV = -1;
    pages.forEach((el, i) => { const r = el.getBoundingClientRect(), v = Math.min(innerHeight, r.bottom) - Math.max(0, r.top); if (v > bestV) { bestV = v; best = i; } });
    return best;
  }
  function addObj(o) { const pg = visiblePage(); const ob = Object.assign({id: uidT(), page: pg, x: .3, y: .45}, o); objs.push(ob); selId = ob.id; drawObjs(); panel(); }
  function drawObjs() {
    document.querySelectorAll('.mk-o').forEach(n => n.remove());
    objs.forEach(o => {
      const page = document.querySelector(`.mk-page[data-i="${o.page}"]`); if (!page) return;
      const pw = page.clientWidth, el = document.createElement('div'); el.className = 'mk-o' + (o.id === selId ? ' sel' : ''); el.style.left = o.x * 100 + '%'; el.style.top = o.y * 100 + '%';
      if (o.type === 'text') { el.textContent = o.text; el.style.fontSize = o.size * pw + 'px'; el.style.color = o.color; el.style.fontFamily = 'var(--f-ui)'; }
      else { el.style.width = o.w * 100 + '%'; const im = new Image(); im.src = o.src; im.alt = 'Signature'; el.appendChild(im); }
      const rz = document.createElement('span'); rz.className = 'rz'; el.appendChild(rz);
      let st = null;
      el.onpointerdown = e => { e.stopPropagation(); cap(el, e); const r = page.getBoundingClientRect(); st = {mx: e.clientX, my: e.clientY, x: o.x, y: o.y, size: o.size, w: o.w, rz: e.target === rz, pw: r.width, ph: r.height, moved: false, picked: selId !== o.id}; if (st.picked) { selId = o.id; document.querySelectorAll('.mk-o').forEach(n => n.classList.remove('sel')); el.classList.add('sel'); } };
      el.onpointermove = e => { if (!st) return; const dx = (e.clientX - st.mx) / st.pw, dy = (e.clientY - st.my) / st.ph; st.moved = true;
        if (st.rz) { const f = Math.max(.25, 1 + dx * 3); if (o.type === 'text') { o.size = Math.max(.008, Math.min(.2, st.size * f)); el.style.fontSize = o.size * st.pw + 'px'; } else { o.w = Math.max(.04, Math.min(1, st.w * f)); el.style.width = o.w * 100 + '%'; } }
        else { o.x = Math.max(-.05, Math.min(.98, st.x + dx)); o.y = Math.max(-.02, Math.min(.98, st.y + dy)); el.style.left = o.x * 100 + '%'; el.style.top = o.y * 100 + '%'; } };
      // the edit panel changes height, so swap it only after the finger lifts or the page would jump mid-drag
      el.onpointerup = el.onpointercancel = () => { const picked = st && st.picked; st = null; if (picked) panel(); };
      page.appendChild(el);
    });
  }
  function panel() {
    const box = q('#mkPanel'); if (!box) return;
    if (selId === 'wm' && watermark.on) {
      box.innerHTML = `<div class="mk-panel"><b>Watermark on every page</b><textarea id="wmText" rows="2">${escH(watermark.text)}</textarea>
        <div class="row"><label class="note" for="wmOp">Strength</label><input id="wmOp" type="range" min=".05" max=".5" step=".01" value="${watermark.opacity}" style="flex:1"><label class="note" for="wmSz">Size</label><input id="wmSz" type="range" min=".025" max=".12" step=".005" value="${watermark.size}" style="flex:1"></div>
        <div class="row">${['#555555', '#c62f3b', '#1f3f9a'].map(c => `<button class="swatch" data-c="${c}" style="background:${c}" aria-label="Colour" aria-pressed="${watermark.color === c}"></button>`).join('')}<label class="chk" style="margin:0 0 0 auto"><input type="checkbox" id="wmTile" ${watermark.tile ? 'checked' : ''}> Repeat across page</label></div></div>`;
      q('#wmText').oninput = e => { watermark.text = e.target.value; drawWatermarks(); };
      q('#wmOp').oninput = e => { watermark.opacity = +e.target.value; drawWatermarks(); };
      q('#wmSz').oninput = e => { watermark.size = +e.target.value; drawWatermarks(); };
      q('#wmTile').onchange = e => { watermark.tile = e.target.checked; drawWatermarks(); };
      box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { watermark.color = b.dataset.c; box.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawWatermarks(); });
      return;
    }
    const o = objs.find(x => x.id === selId);
    if (!o) { box.innerHTML = `<p class="note" style="margin:0">Tap something on the page to edit it. Drag to move it; drag the red dot to resize.${watermark.on ? ' <button class="btn ghost sm" id="wmEdit">Edit watermark</button>' : ''}</p>`; if (q('#wmEdit')) q('#wmEdit').onclick = () => { selId = 'wm'; panel(); }; return; }
    box.innerHTML = `<div class="mk-panel">${o.type === 'text' ? `<textarea id="obText" aria-label="Text">${escH(o.text)}</textarea><div class="row">${['#0a1a4a', '#000000', '#c62f3b', '#1f3f9a'].map(c => `<button class="swatch" data-c="${c}" style="background:${c}" aria-label="Colour" aria-pressed="${o.color === c}"></button>`).join('')}<button class="btn sm" data-z="-1" aria-label="Smaller">A−</button><button class="btn sm" data-z="1" aria-label="Bigger">A＋</button>` : '<div class="row"><button class="btn sm" data-z="-1">Smaller</button><button class="btn sm" data-z="1">Bigger</button>'}
      <button class="btn sm" id="obDup">Copy</button><button class="btn ghost sm" id="obDel">Delete</button></div></div>`;
    if (q('#obText')) q('#obText').oninput = e => { o.text = e.target.value; drawObjs(); };
    box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { o.color = b.dataset.c; box.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawObjs(); });
    box.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const f = +b.dataset.z > 0 ? 1.15 : 1 / 1.15; if (o.type === 'text') o.size = Math.max(.008, Math.min(.2, o.size * f)); else o.w = Math.max(.04, Math.min(1, o.w * f)); drawObjs(); });
    q('#obDup').onclick = () => { const c = Object.assign({}, o, {id: uidT(), y: Math.min(.95, o.y + .04)}); objs.push(c); selId = c.id; drawObjs(); panel(); };
    q('#obDel').onclick = () => { objs = objs.filter(x => x !== o); selId = null; drawObjs(); panel(); };
  }
  function paintWatermark(g, W, H) {
    if (!watermark.on || !watermark.text.trim()) return;
    const fs = watermark.size * W; g.save(); g.globalAlpha = watermark.opacity; g.fillStyle = watermark.color; g.font = `700 ${fs}px "Public Sans", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = watermark.text.split('\n'), tw = Math.max(...lines.map(l => g.measureText(l).width)), th = lines.length * fs * 1.2;
    const stamp = (x, y) => { g.save(); g.translate(x, y); g.rotate(watermark.angle * Math.PI / 180); lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * fs * 1.2)); g.restore(); };
    if (!watermark.tile) stamp(W / 2, H / 2);
    else { const sx = tw + fs * 3, sy = th + fs * 4; let row = 0; for (let y = -H * .2; y < H * 1.2; y += sy, row++) for (let x = (row % 2 ? -sx / 2 : 0) - W * .2; x < W * 1.2; x += sx) stamp(x, y); }
    g.restore();
  }
  function drawWatermarks() {
    document.querySelectorAll('.mk-page').forEach(el => { const c = el.querySelector('canvas.wm'), k = Math.min(2, devicePixelRatio || 1); c.width = el.clientWidth * k; c.height = el.clientHeight * k; const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); paintWatermark(g, c.width, c.height); });
  }
  window.addEventListener('resize', () => { if (view === 'markup' && mode === 'scan') { drawObjs(); drawWatermarks(); } });

  function popMenu(anchor, items, empty) {
    document.querySelectorAll('.menu-pop').forEach(m => m.remove());
    const m = h(`<div class="menu-pop" role="menu">${items.length ? items.map((it, i) => `<button role="menuitem" data-i="${i}">${escH(it.label)}${it.sub ? `<small>${escH(it.sub)}</small>` : ''}</button>`).join('') : `<p class="note" style="padding:8px">${escH(empty)}</p>`}</div>`);
    document.body.appendChild(m); const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left + scrollX)) + 'px'; m.style.top = r.bottom + scrollY + 6 + 'px';
    m.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { items[+b.dataset.i].run(); m.remove(); } };
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  }

  /* ---------------- build the PDF ---------------- */
  function textPng(o, wPt) {
    const k = 3, fs = o.size * wPt * k, c = document.createElement('canvas'), g = c.getContext('2d'), font = `${fs}px "Public Sans", system-ui, sans-serif`;
    g.font = font; const lines = o.text.split('\n'), tw = Math.max(1, ...lines.map(l => g.measureText(l).width)), lh = fs * 1.2;
    c.width = Math.ceil(tw + fs * .3); c.height = Math.ceil(lines.length * lh + fs * .2); g.font = font; g.fillStyle = o.color; g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, fs * .15, i * lh + fs * .1)); return {png: c.toDataURL('image/png'), w: c.width / k, h: c.height / k};
  }
  async function buildPdf() {
    const {PDFDocument} = PDFLib, out = await PDFDocument.create();
    let src = null; if (doc.pdf) src = await PDFDocument.load(doc.pdf);
    for (let i = 0; i < doc.pages.length; i++) {
      const pg = doc.pages[i]; let page, W, H;
      if (pg.kind === 'pdf') { [page] = await out.copyPages(src, [pg.index]); out.addPage(page); ({width: W, height: H} = page.getSize()); }
      else { W = 595.28; H = W * pg.h / pg.w; page = out.addPage([W, H]); const jpg = await out.embedJpg(await (await new Promise(r => pg.canvas.toBlob(r, 'image/jpeg', .85))).arrayBuffer()); page.drawImage(jpg, {x: 0, y: 0, width: W, height: H}); }
      if (watermark.on) { const c = document.createElement('canvas'); c.width = Math.round(W * 2); c.height = Math.round(H * 2); paintWatermark(c.getContext('2d'), c.width, c.height); const im = await out.embedPng(c.toDataURL('image/png')); page.drawImage(im, {x: 0, y: 0, width: W, height: H}); }
      for (const o of objs.filter(x => x.page === i)) {
        if (o.type === 'text') { const t = textPng(o, W), im = await out.embedPng(t.png); page.drawImage(im, {x: o.x * W, y: H - o.y * H - t.h, width: t.w, height: t.h}); }
        else { const im = await out.embedPng(o.src), w = o.w * W, hh = w * o.ar; page.drawImage(im, {x: o.x * W, y: H - o.y * H - hh, width: w, height: hh}); }
      }
    }
    return out.save();
  }
  async function finish() {
    const btn = q('#mkDone'); btn.disabled = true; btn.textContent = 'Making PDF…';
    let bytes; try { bytes = await buildPdf(); } catch (e) { console.error(e); btn.disabled = false; btn.textContent = 'Finish & send'; return say('Could not make the PDF. Try again.'); }
    view = 'result';
    const base = (doc.name || 'Document').replace(/\.pdf$/i, '').replace(/[^\w\- ]+/g, '_');
    pScan.innerHTML = `<div class="eyebrow">Ready</div><h2>Your PDF is ready</h2>
      <div class="card result" style="max-width:520px;margin-top:14px">
        <div class="f"><label for="resName">File name</label><input id="resName" value="${escH(base)}"></div>
        <p class="note" id="resSize" style="margin:0"></p>
        <button class="btn primary big" id="resShare">Send to WhatsApp, email or Google Drive</button>
        <button class="btn big" id="resDl">Download / save to Files</button>
        <p class="note" id="resHelp" style="margin:0"></p>
        <div class="row" style="justify-content:space-between"><button class="btn ghost sm" id="resEdit">← Keep editing</button><button class="btn ghost sm" id="resNew">${doc.back === 'fill' ? 'Back to forms' : 'Scan something new'}</button></div>
      </div>`;
    const file = () => new File([bytes], (q('#resName').value.trim() || base).replace(/[\\/:*?"<>|]+/g, '_') + '.pdf', {type: 'application/pdf'});
    q('#resSize').textContent = `${doc.pages.length} page${doc.pages.length > 1 ? 's' : ''} · ${(bytes.length / 1024 / 1024).toFixed(1)} MB`;
    const share = canShareFile(file());
    q('#resHelp').textContent = share ? 'Send opens your phone’s share menu: pick WhatsApp, Mail, Gmail or Drive. To keep a copy, choose Save to Files or Download.' : 'This computer can’t send files directly. Download the PDF, then attach it in WhatsApp Web or your email, or drag it into Google Drive.';
    q('#resShare').onclick = async () => { const f = file(); if (!canShareFile(f)) { downloadFile(f); return; } try { await navigator.share({files: [f], title: f.name}); } catch (e) { if (e.name !== 'AbortError') downloadFile(f); } };
    if (!share) q('#resShare').textContent = 'Download, then attach';
    q('#resDl').onclick = () => downloadFile(file());
    q('#resEdit').onclick = () => { view = 'markup'; renderMarkup(); };
    q('#resNew').onclick = () => { const back = doc.back; doc = null; objs = []; view = 'pages'; if (back === 'fill') go(3); else { scanPages = []; renderScan(); } };
  }

  /* ---------------- form filling: sign the filled form, insert my details ---------------- */
  const pdfBtn = q('#btnPdf');
  if (pdfBtn) {
    const b = h(`<button class="btn" id="btnSign">Sign &amp; mark up</button>`); pdfBtn.before(b);
    b.onclick = async () => { const c = cur(); if (!c) return say('Select a customer first.'); b.disabled = true; try { const {bytes} = await fillFor(c); await openMarkup({pdf: bytes, name: fileName(c), back: 'fill'}); } finally { b.disabled = false; } };
  }
  let lastField = null;
  q('#cEdit').addEventListener('focusin', e => { if (e.target.matches('input[data-k]')) lastField = e.target; });
  const meBar = h(`<div class="mebar" id="meBar"></div>`); q('#p3 .cols').before(meBar);
  function renderMeBar() {
    const items = myItems().filter(i => i.label !== "Today's date" || true);
    meBar.innerHTML = `<span class="note">Insert my details:</span>${items.map((it, i) => `<button class="chip" data-i="${i}" title="${escH(it.text)}">${escH(it.label)}</button>`).join('')}${FIELDS.some(([k]) => profile[k]) ? '' : '<button class="chip" data-go>Set up My profile</button>'}`;
    meBar.querySelectorAll('[data-i]').forEach(b => { b.onpointerdown = e => e.preventDefault(); b.onclick = () => { const a = document.activeElement; if (a && a.matches && a.matches('#cEdit input[data-k]')) lastField = a; if (!lastField || !document.body.contains(lastField)) return say('Tap a field first, then tap your detail.'); lastField.value = items[+b.dataset.i].text; lastField.dispatchEvent(new Event('input', {bubbles: true})); lastField.focus(); }; });
    const g = meBar.querySelector('[data-go]'); if (g) g.onclick = () => setMode('profile');
  }
  renderMeBar();
})();
