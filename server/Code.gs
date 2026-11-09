/* REDEFINE Form Filler team server (Google Apps Script).
   Holds the OpenAI API key, checks the team code, and keeps the shared blank forms in a Drive folder.
   Customer details pass through to OpenAI and are never written to Drive or logged.

   Script properties (Project Settings > Script properties):
     OPENAI_API_KEY     required
     TEAM_CODE          required, the code agents sign in with
     OWNER_CODE         required, your own code; it can remove any form
     DAILY_LIMIT        optional, AI calls per day for the team (default 300)
     MODEL              optional (default gpt-6.1-terra)
*/
var COLLECTIONS = ['teamforms', 'teamformfiles'];
var FOLDER_NAME = 'REDEFINE Form Filler Data';

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function setProp(k, v) { PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail(code) { var e = new Error(code); e.appCode = code; throw e; }

function doGet() { return reply({ok: true, app: 'REDEFINE Form Filler'}); }

function doPost(e) {
  try {
    return reply(handle(JSON.parse(e.postData.contents)));
  } catch (err) {
    if (err.appCode) return reply({error: err.appCode});
    console.error('server error: ' + (err && err.name));
    return reply({error: 'upstream_error'});
  }
}

function roleOf(code) {
  var cache = CacheService.getScriptCache(), fails = +(cache.get('fails') || 0);
  if (fails >= 20) fail('locked');
  var owner = prop('OWNER_CODE'), team = prop('TEAM_CODE');
  if (owner && code === owner) return 'owner';
  if (team && code === team) return 'agent';
  cache.put('fails', String(fails + 1), 900);
  Utilities.sleep(800);
  fail('unauthorized');
}

function handle(q) {
  var role = roleOf(String(q.code || ''));
  switch (q.op) {
    case 'login': return {ok: true, owner: role === 'owner'};
    case 'ai': return askAI(q);
    case 'ver': return {ver: prop('ver') || '0'};
    case 'list': return {docs: listDocs(checkColl(q.coll))};
    case 'get': return {doc: getDoc(checkColl(q.coll), checkId(q.id))};
    case 'set': setDoc(checkColl(q.coll), checkId(q.id), q.data); return {ok: true};
    case 'del': delDoc(checkColl(q.coll), checkId(q.id), role, String(q.name || '')); return {ok: true};
    case 'psget': return {items: vaultRead(checkVault(q.vault))};
    case 'psput': return {items: vaultMerge(checkVault(q.vault), q.items)};
    case 'kbget': return kbGet(String(q.have || ''));
    case 'kbput': if (role !== 'owner') fail('not_allowed'); return kbPut(q.text);
    case 'iopack': return ioPackGet(String(q.have || ''));
    case 'ioput': if (role !== 'owner') fail('not_allowed'); return ioPut(String(q.name || ''), q.text);
    case 'ioask': return ioAsk(q);
  }
  fail('invalid_request');
}

function checkColl(c) { if (COLLECTIONS.indexOf(c) < 0) fail('invalid_request'); return c; }
function checkId(i) { if (!/^[\w.-]{1,120}$/.test(String(i))) fail('invalid_request'); return String(i); }

/* ---------- OpenAI ---------- */
function underDailyLimit() {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
    var used = prop('day') === day ? +prop('used') : 0, limit = +prop('DAILY_LIMIT') || 300;
    if (used >= limit) fail('daily_limit');
    setProp('day', day); setProp('used', used + 1);
  } finally { lock.releaseLock(); }
}

function askAI(q, maxImages) {
  var key = prop('OPENAI_API_KEY'); if (!key) fail('no_api_key');
  underDailyLimit();
  var prompt = String(q.prompt || ''); if (!prompt) fail('invalid_request');
  var content = [{type: 'input_text', text: prompt}];
  (q.images || []).slice(0, maxImages || 5).forEach(function (b64) {
    content.push({type: 'input_image', image_url: 'data:image/jpeg;base64,' + b64, detail: 'high'});
  });
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + key},
    payload: JSON.stringify({
      model: prop('MODEL') || 'gpt-6.1-terra',
      store: false,
      max_output_tokens: prompt.length > 30000 ? 32000 : 16000,
      reasoning: {effort: 'medium'},
      text: {format: {type: 'json_object'}},
      input: [{role: 'user', content: content}]
    })
  });
  var status = res.getResponseCode();
  if (status === 401) fail('bad_api_key');
  if (status === 404 || status === 403) fail('bad_model');
  if (status === 429) fail(/insufficient_quota/.test(res.getContentText()) ? 'no_credit' : 'rate_limited');
  if (status === 413) fail('prompt_too_large');
  if (status !== 200) { console.error('openai status ' + status); fail('upstream_error'); }
  var msg = JSON.parse(res.getContentText()), text = '';
  (msg.output || []).forEach(function (item) {
    if (item.type !== 'message') return;
    (item.content || []).forEach(function (c) {
      if (c.type === 'refusal') fail('refused');
      if (c.type === 'output_text') text += c.text;
    });
  });
  var why = msg.incomplete_details && msg.incomplete_details.reason;
  if (why === 'content_filter') fail('refused');
  if (!text) fail('empty_completion');
  return {text: text, truncated: msg.status === 'incomplete'};
}

/* ---------- shared blank forms, one Drive file per document ---------- */
function folder() {
  var id = prop('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder(FOLDER_NAME); setProp('FOLDER_ID', f.getId()); return f;
}
function fileName(coll, id) { return coll + '__' + id + '.json'; }
function findFile(coll, id) { var it = folder().getFilesByName(fileName(coll, id)); return it.hasNext() ? it.next() : null; }
function bump() { setProp('ver', (+prop('ver') || 0) + 1); }

function listDocs(coll) {
  var out = [], prefix = coll + '__', it = folder().searchFiles("title contains '" + prefix + "'");
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (n.indexOf(prefix) !== 0) continue;
    out.push({id: n.slice(prefix.length, -5), data: JSON.parse(f.getBlob().getDataAsString())});
  }
  return out;
}
function getDoc(coll, id) { var f = findFile(coll, id); return f ? JSON.parse(f.getBlob().getDataAsString()) : null; }
function setDoc(coll, id, data) {
  if (!data || typeof data !== 'object') fail('invalid_request');
  var text = JSON.stringify(data), f = findFile(coll, id);
  if (f) f.setContent(text); else folder().createFile(fileName(coll, id), text, MimeType.PLAIN_TEXT);
  if (coll === 'teamforms') bump();
}
function delDoc(coll, id, role, name) {
  var f = findFile(coll, id); if (!f) return;
  if (coll === 'teamforms' && role !== 'owner') {
    var d = JSON.parse(f.getBlob().getDataAsString());
    if (d.savedBy !== name) fail('not_allowed');
  }
  f.setTrashed(true);
  if (coll === 'teamforms') bump();
}

/* ---------- Policy Summary Power Tools: device sync ----------
   Each agent's clients are encrypted on their own device with their personal sync passphrase.
   The server only ever sees the vault id (derived from the passphrase) and scrambled data; it cannot read clients.
   One Drive file per agent vault: pspt__<vault>.json = {caseId: {u: updated, d: deleted?, iv, ct}} */
function checkVault(v) { if (!/^[0-9a-f]{64}$/.test(String(v))) fail('invalid_request'); return String(v); }
function vaultFile(v) { var it = folder().getFilesByName('pspt__' + v + '.json'); return it.hasNext() ? it.next() : null; }
function vaultRead(v) { var f = vaultFile(v); return f ? JSON.parse(f.getBlob().getDataAsString()) : {}; }
function vaultMerge(v, items) {
  if (!items || typeof items !== 'object') fail('invalid_request');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var cur = vaultRead(v), n = 0;
    Object.keys(items).forEach(function (id) {
      if (!/^[\w-]{1,40}$/.test(id) || ++n > 500) fail('invalid_request');
      var it = items[id];
      if (!it || typeof it.u !== 'string' || (!it.d && (typeof it.ct !== 'string' || typeof it.iv !== 'string'))) fail('invalid_request');
      if (!cur[id] || cur[id].u < it.u) cur[id] = it.d ? {u: it.u, d: true} : {u: it.u, iv: it.iv, ct: it.ct};
    });
    var text = JSON.stringify(cur);
    if (text.length > 20000000) fail('vault_full');
    var f = vaultFile(v);
    if (f) f.setContent(text); else folder().createFile('pspt__' + v + '.json', text, MimeType.PLAIN_TEXT);
    return cur;
  } finally { lock.releaseLock(); }
}

/* ---------- What-If Fund Projector: GE ILP rate tables ----------
   GE internal agency material. Kept as one file in the (private) Drive folder; only signed-in agents can read it,
   only the owner code can replace it. "have" lets a phone skip the download when it already has this version. */
var KB_FILE = 'ge_ilp_knowledge.json';
function kbFile() { var it = folder().getFilesByName(KB_FILE); return it.hasNext() ? it.next() : null; }
function kbGet(have) {
  var f = kbFile(); if (!f) fail('no_kb');
  var ver = prop('kbver') || '1';
  if (have && have === ver) return {same: true, ver: ver};
  return {ver: ver, text: f.getBlob().getDataAsString()};
}
function kbPut(text) {
  text = String(text || '');
  if (text.length < 1000 || text.length > 5000000) fail('invalid_request');
  var k; try { k = JSON.parse(text); } catch (e) { fail('invalid_request'); }
  if (!k || !k.coi_tables || !k.products || !k.medical_riders || !k.other_riders) fail('invalid_request');
  var f = kbFile();
  if (f) f.setContent(text); else folder().createFile(KB_FILE, text, MimeType.PLAIN_TEXT);
  var ver = String(Date.now()); setProp('kbver', ver);
  return {ok: true, ver: ver};
}

/* ---------- No Need Ask IO: ePartner guides + AI answers ----------
   nnaio_pack.json   = guides + screenshots, downloaded by signed-in phones ("have" skips repeat downloads).
   nnaio_lib_N.json  = ePartner text library (internal PDFs); never leaves the server, only searched here.
   Both are uploaded by the owner code from the app. Questions are not stored. */
function ioFile(name) { var it = folder().getFilesByName(name); return it.hasNext() ? it.next() : null; }
function ioPackGet(have) {
  var f = ioFile('nnaio_pack.json'); if (!f) fail('no_pack');
  var ver = prop('iover') || '1';
  if (have && have === ver) return {same: true, ver: ver};
  return {ver: ver, text: f.getBlob().getDataAsString()};
}
function ioPut(name, text) {
  text = String(text || '');
  var m = /^(pack|lib([1-9]))$/.exec(name); if (!m) fail('invalid_request');
  if (text.length < 100 || text.length > 6000000) fail('invalid_request');
  var k; try { k = JSON.parse(text); } catch (e) { fail('invalid_request'); }
  if (m[1] === 'pack' ? (!k || k.app !== 'nnaio' || !k.guides) : (!k || k.app !== 'nnaio-lib' || !k.chunks || k.part !== +m[2])) fail('invalid_request');
  var file = m[1] === 'pack' ? 'nnaio_pack.json' : 'nnaio_lib_' + m[2] + '.json', f = ioFile(file);
  if (f) f.setContent(text); else folder().createFile(file, text, MimeType.PLAIN_TEXT);
  if (m[1] === 'pack') setProp('iover', String(k.ver || Date.now()));
  else for (var n = k.of + 1; n <= 9; n++) { var old = ioFile('nnaio_lib_' + n + '.json'); if (old) old.setTrashed(true); } // drop parts from an older, longer upload
  return {ok: true, name: name, ver: k.ver};
}
function ioLibrary() {
  var all = [], first = null;
  for (var n = 1; n <= 9; n++) {
    var f = ioFile('nnaio_lib_' + n + '.json'); if (!f) break;
    var k = JSON.parse(f.getBlob().getDataAsString());
    if (n === 1) first = k;
    all = all.concat(k.chunks);
  }
  if (!first) fail('no_pack');
  return {chunks: all, catalog: first.catalog || [], syn: first.syn || {}};
}
/* plain keyword search: question words (plus Chinese/Malay synonyms) weighted by how rare they are */
var IO_STOP = ' a an the to of in on for and or is are do does how what where when can i my me we you it this that with from be at by as please check find get need want ask nak saya macam mana boleh ';
function ioTerms(question, syn) {
  var q = String(question).toLowerCase(), extra = [];
  Object.keys(syn).forEach(function (k) { if (syn[k] && ioHas(q, k.toLowerCase())) extra.push(syn[k]); });
  var words = (q + ' ' + extra.join(' ')).replace(/[^a-z0-9&\-\/\s]/g, ' ').split(/\s+/), seen = {}, out = [];
  words.forEach(function (w) { w = w.replace(/^[-\/]+|[-\/]+$/g, ''); if (w.length < 2 || IO_STOP.indexOf(' ' + w + ' ') >= 0 || seen[w]) return; seen[w] = 1; out.push(w); });
  return out.slice(0, 14);
}
/* Chinese keys match anywhere; English/Malay keys only as whole words ("sig" must not match "signature") */
function ioHas(q, k) {
  if (/[^\x00-\x7f]/.test(k)) return q.indexOf(k) >= 0;
  return new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(q);
}
function ioCount(text, w) { var c = 0, i = text.indexOf(w); while (i >= 0 && c < 20) { c++; i = text.indexOf(w, i + w.length); } return c; }
function ioSearch(question, lib, max, main) {
  var terms = ioTerms(question, lib.syn), N = lib.chunks.length;
  if (!terms.length) return [];
  var mainTerms = main ? ioTerms(main, lib.syn) : terms;   // words of the newest question count double
  var low = lib.chunks.map(function (c) { return (c.h + ' \n' + c.x).toLowerCase(); });
  var idf = terms.map(function (w) { var df = 0; for (var i = 0; i < N; i++) if (low[i].indexOf(w) >= 0) df++; return df ? Math.log(N / df) * (mainTerms.indexOf(w) >= 0 ? 2 : 1) : 0; });
  var scored = [];
  for (var i = 0; i < N; i++) {
    var s = 0, hit = 0, head = lib.chunks[i].h.toLowerCase();
    for (var t = 0; t < terms.length; t++) {
      if (!idf[t]) continue;
      var c = ioCount(low[i], terms[t]); if (!c) continue;
      hit++; s += idf[t] * (1 + Math.log(c)) * (head.indexOf(terms[t]) >= 0 ? 1.6 : 1);
    }
    if (!s) continue;
    s *= (0.4 + hit / terms.length);                       // reward chunks matching more of the question
    if (/^Study Pack/.test(lib.chunks[i].s)) s *= 1.7;     // curated answers first
    scored.push([s, i]);
  }
  scored.sort(function (a, b) { return b[0] - a[0]; });
  var out = [], size = 0;
  for (var j = 0; j < scored.length && out.length < (max || 10); j++) {
    var ch = lib.chunks[scored[j][1]]; if (size + ch.x.length > 22000) continue;
    out.push(ch); size += ch.x.length;
  }
  return out;
}
/* chat history from the phone: [{q, a}] oldest first, last 4 turns, trimmed; never trusted as a source */
function ioHistory(h) {
  if (!Array.isArray(h)) return [];
  return h.slice(-4).map(function (t) {
    return {q: String((t && t.q) || '').slice(0, 600), a: String((t && t.a) || '').slice(0, 1500)};
  }).filter(function (t) { return t.q; });
}
/* photos / PDF pages (JPEG base64) and PDF text the agent attached; used for this one answer, never stored */
var IO_MAX_IMAGES = 8;
function ioAttachments(q) {
  var images = q.images == null ? [] : q.images;
  if (!Array.isArray(images) || images.length > IO_MAX_IMAGES) fail('invalid_request');
  images.forEach(function (b) { if (typeof b !== 'string' || b.length > 3000000 || !/^[A-Za-z0-9+\/]+=*$/.test(b.slice(0, 200))) fail('invalid_request'); });
  return {images: images, doc: String(q.doc || '').slice(0, 40000)};
}
function ioPrompt(question, found, catalog, history, att) {
  att = att || {images: [], doc: ''};
  var src = found.map(function (c, i) { return '[' + (i + 1) + '] ' + c.s + ' | ' + c.h + '\n' + c.x; }).join('\n\n---\n\n');
  var chat = (history || []).map(function (t) { return 'Agent: ' + t.q + '\nYou answered: ' + (t.a || '(a step-by-step guide)'); }).join('\n\n');
  return [
    'You are "No Need Ask IO", the helper that answers Great Eastern Life Malaysia agents\' questions about the ePartner agent portal, GE procedures, forms and products, for the REDEFINE agency.',
    'RULES:',
    '1. Use ONLY the SOURCES below. Never invent menu paths, form codes, phone numbers, product features, premiums, dates or rules. If the sources do not answer the question, set "kind" to "not_covered" and say so plainly.',
    '2. Teach the agent to find it themselves: give short numbered steps with the exact ePartner tap path (e.g. ["Applications","List of Applications","Income","Disbursement Amount"]).',
    '3. If one of the GUIDES matches, put its id in "guide" (the app then shows screenshots). Otherwise null.',
    '4. Reply in the same language as the question (English, Chinese or Malay; Malaysian mixed language is fine). Keep ePartner menu names in English exactly as written in the sources.',
    '5. For anything about a specific client (their premium, underwriting decision, claim outcome), explain where the agent checks it, never guess the result. Never repeat personal data.',
    '6. Product or rule details: quote the document name and date from the source, and remind them to confirm with the latest PDF on ePartner. Do not give personalised financial advice.',
    '7. If unsure or the sources conflict, say so, set confidence "low", and suggest ICM (Home → Quick Links → Mailbox) or Agent Careline 03-4259 8111.',
    'Return ONLY a JSON object: {"kind":"steps"|"info"|"not_covered","title":"short title","answer":"1-3 sentence direct answer","steps":[{"t":"step text","path":["Menu","Sub-menu"]}],"notes":["extra tip"],"guide":"guide id or null","sources":[source numbers used],"confidence":"high"|"medium"|"low"}',
    '', 'GUIDES (id: title):', catalog.map(function (g) { return g.id + ': ' + g.title; }).join('\n'),
    '8. This may be a follow-up in a chat. Use the CONVERSATION SO FAR only to understand what the agent means (e.g. "that form", "how about SRM", "那个呢"). Facts must still come from the SOURCES, never from earlier answers alone. If the follow-up changes topic, just answer the new question.',
    att.images.length || att.doc ? '9. ATTACHMENTS: the agent attached ' + (att.images.length ? att.images.length + ' image(s) (photos, screenshots or PDF pages, after this text)' : '') + (att.images.length && att.doc ? ' and ' : '') + (att.doc ? 'text from a PDF (below)' : '') + '. Read them for the details of this case (product, plan code, status, error message, dates, amounts, which form) and answer about THIS document. Rules and procedures must still come from the SOURCES. Never repeat names, IC, addresses, phone, policy or account numbers from the attachments: say "the policyholder" or "this policy". If an attachment is unreadable, say which one and ask for a clearer photo.' : '',
    '', 'SOURCES:', src || '(none found)',
    att.doc ? '\nATTACHED PDF TEXT (from the agent, not a GE source):\n' + att.doc : '',
    chat ? '\nCONVERSATION SO FAR (oldest first):\n' + chat : '',
    '', 'AGENT QUESTION: ' + question
  ].join('\n');
}
function ioAsk(q) {
  var question = String(q.question || '').trim();
  if (!question || question.length > 600) fail('invalid_request');
  var history = ioHistory(q.history), att = ioAttachments(q), lib = ioLibrary();
  // search with the new question first, then the earlier questions (and the start of an attached PDF), so short follow-ups still find the right documents
  var searchText = [question].concat(history.slice().reverse().map(function (t) { return t.q; })).concat(att.doc ? [att.doc.slice(0, 600)] : []).join(' ');
  var found = ioSearch(searchText, lib, 10, question);
  var r = askAI({prompt: ioPrompt(question, found, lib.catalog, history, att), images: att.images}, IO_MAX_IMAGES);
  return {text: r.text, truncated: r.truncated, sources: found.map(function (c) { return {s: c.s, h: c.h}; })};
}

/* Run once from the editor to approve Drive and external-request access. */
function setup() { folder(); UrlFetchApp.fetch('https://api.openai.com/v1/models', {muteHttpExceptions: true}); console.log('Ready'); }
