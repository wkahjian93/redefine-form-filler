// Builds the installable app into docs/ (GitHub Pages serves that folder).
// app/app.html is the full page; config.json holds the public team-server URL. No secrets belong in this repo.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const here = (...p) => path.join(__dirname, ...p);
const config = JSON.parse(fs.readFileSync(here('config.json'), 'utf8'));
let page = fs.readFileSync(here('app', 'app.html'), 'utf8');
const shim = fs.readFileSync(here('app', 'shim.js'), 'utf8');

const swap = (a, b) => { if (!page.includes(a)) throw new Error('Missing text: ' + a); page = page.split(a).join(b); };
swap('Client data goes to Claude on your own account.', 'Client details go through the REDEFINE team server to OpenAI. REDEFINE does not save them.');
swap('Claude isn’t available in this view'.replace('’', "'"), 'The team server is not connected yet');
swap('Open this app on claude.ai while signed in. ', '');
swap('Team forms appear when you open this app on claude.ai while signed in.', 'Team forms appear once the team server is connected.');
const AI_ERRORS = `const AI_EXTRA = {daily_limit:'The team has reached today’s AI limit. Try again tomorrow, or ask the app owner to raise it.', bad_api_key:'The team server’s OpenAI key isn’t working. Tell the app owner.', no_api_key:'The team server has no OpenAI key yet. Tell the app owner.', no_credit:'The OpenAI account is out of credit. Tell the app owner.', bad_model:'The OpenAI account can’t use this AI model. Tell the app owner.', locked:'Too many wrong codes. Wait 15 minutes.'}; Object.assign(AI_COPY, AI_EXTRA);`;
swap('async function askJSON(prompt, opts)', AI_ERRORS + '\nasync function askJSON(prompt, opts)');

// the claude.ai version keeps its wording; this build runs on OpenAI
page = page.split('Claude').join('AI');

const head = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="description" content="REDEFINE team tool that fills blank forms from customer files.">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="REDEFINE Forms">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script>window.FORM_APP_CONFIG=${JSON.stringify({api: config.api || ''})};</script>
<script>${shim}</script>
</head><body>
`;
const html = head + page + '\n<script>if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));</script>\n</body></html>\n';

const out = here('docs');
fs.mkdirSync(path.join(out, 'icons'), {recursive: true});
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
for (const f of fs.readdirSync(here('app', 'icons'))) fs.copyFileSync(here('app', 'icons', f), path.join(out, 'icons', f));
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'REDEFINE Form Filler', short_name: 'REDEFINE Forms', start_url: './', scope: './', display: 'standalone',
  background_color: '#000000', theme_color: '#000000', description: 'REDEFINE team tool that fills blank forms from customer files.',
  icons: [
    {src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png'},
    {src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png'},
    {src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'}
  ]
}, null, 2));
const version = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(here('app', 'sw.template.js'), 'utf8').replace('__VERSION__', version));
console.log('built', version, (html.length / 1024).toFixed(0) + 'KB', config.api ? 'server connected' : 'NO SERVER URL YET');
