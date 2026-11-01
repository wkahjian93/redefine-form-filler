/* REDEFINE Form Filler team server (Google Apps Script).
   Holds the Claude API key, checks the team code, and keeps the shared blank forms in a Drive folder.
   Customer details pass through to Claude and are never written to Drive or logged.

   Script properties (Project Settings > Script properties):
     ANTHROPIC_API_KEY  required
     TEAM_CODE          required, the code agents sign in with
     OWNER_CODE         required, your own code; it can remove any form
     DAILY_LIMIT        optional, Claude calls per day for the team (default 300)
     MODEL              optional (default claude-opus-5-5)
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
    case 'ai': return askClaude(q);
    case 'ver': return {ver: prop('ver') || '0'};
    case 'list': return {docs: listDocs(checkColl(q.coll))};
    case 'get': return {doc: getDoc(checkColl(q.coll), checkId(q.id))};
    case 'set': setDoc(checkColl(q.coll), checkId(q.id), q.data); return {ok: true};
    case 'del': delDoc(checkColl(q.coll), checkId(q.id), role, String(q.name || '')); return {ok: true};
  }
  fail('invalid_request');
}

function checkColl(c) { if (COLLECTIONS.indexOf(c) < 0) fail('invalid_request'); return c; }
function checkId(i) { if (!/^[\w.-]{1,120}$/.test(String(i))) fail('invalid_request'); return String(i); }

/* ---------- Claude ---------- */
function underDailyLimit() {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
    var used = prop('day') === day ? +prop('used') : 0, limit = +prop('DAILY_LIMIT') || 300;
    if (used >= limit) fail('daily_limit');
    setProp('day', day); setProp('used', used + 1);
  } finally { lock.releaseLock(); }
}

function askClaude(q) {
  var key = prop('ANTHROPIC_API_KEY'); if (!key) fail('no_api_key');
  underDailyLimit();
  var prompt = String(q.prompt || ''); if (!prompt) fail('invalid_request');
  var content = (q.images || []).slice(0, 5).map(function (b64) {
    return {type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: b64}};
  });
  content.push({type: 'text', text: prompt});
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01'},
    payload: JSON.stringify({
      model: prop('MODEL') || 'claude-opus-5-5',
      max_tokens: prompt.length > 30000 ? 32000 : 16000,
      output_config: {effort: 'medium'},
      fallbacks: 'default',
      messages: [{role: 'user', content: content}]
    })
  });
  var status = res.getResponseCode();
  if (status === 401 || status === 403) fail('bad_api_key');
  if (status === 429 || status === 529) fail('rate_limited');
  if (status === 413) fail('prompt_too_large');
  if (status !== 200) { console.error('claude status ' + status); fail('upstream_error'); }
  var msg = JSON.parse(res.getContentText());
  if (msg.stop_reason === 'refusal') fail('refused');
  var text = (msg.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  if (!text) fail('empty_completion');
  return {text: text, truncated: msg.stop_reason === 'max_tokens'};
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

/* Run once from the editor to approve Drive and external-request access. */
function setup() { folder(); UrlFetchApp.fetch('https://api.anthropic.com', {muteHttpExceptions: true}); console.log('Ready'); }
