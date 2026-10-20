'use strict';
// Stage 5.6-1 (D-82): Армолайн and Киборг exports send no CORS header, so the browser PIM cannot read them directly.
// When the direct download fails (CORS or network), PIM repeats it through the site: POST {site}/pim/supplier-fetch with
// the PIM key; the file is then parsed and imported exactly like a direct download (the file time comes from
// yml_catalog@date, else the supplier's Last-Modified passed in X-Supplier-Last-Modified). The owner's button
// «Обновить прайсы по ссылкам» stays the same; the home screen shows per supplier «оновлено / потрібна перевірка /
// помилка (причина)». Synthetic supplier file and invented site address only — no real network.
const test=require('node:test'),assert=require('node:assert/strict');
const XLSX=require('../vendor/xlsx-0.20.3.min.js');
const {createHarness,appRequire}=require('./isolated-harness.cjs');
const SITE='https://site.invalid/api',KEY='pim-site-key-at-least-24-characters';
const yml=date=>`<?xml version="1.0" encoding="UTF-8"?><yml_catalog date="${date}"><shop><categories><category id="1">Підсумки</category></categories><offers>`+
 `<offer id="SYN-1" available="true"><name>Синтетичний підсумок для тесту, олива</name><vendorCode>SYN-1</vendorCode><price>450</price><currencyId>UAH</currencyId><categoryId>1</categoryId><quantity_in_stock>4</quantity_in_stock></offer>`+
 `<offer id="SYN-2" available="false"><name>Синтетичний підсумок для тесту, чорний</name><vendorCode>SYN-2</vendorCode><price>460</price><currencyId>UAH</currencyId><categoryId>1</categoryId><quantity_in_stock>0</quantity_in_stock></offer></offers></shop></yml_catalog>`;
function kyiv(ms){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;}
async function harness({site=true}={}){
 const h=createHarness({runtime:true});h.ctx.XLSX=XLSX;h.ctx.DOMParser=appRequire('linkedom').DOMParser;h.run('render=()=>{};classificationEnable();');await h.run('Store.init()');
 if(site)h.run(`S.cfg.siteApi={url:${JSON.stringify(SITE)},key:${JSON.stringify(KEY)}};`);
 h.run(`S.cfg.suppliers[0].source={url:'https://tactic-shop.in.ua/content/export/feed.xml',hours:24,enabled:true,autoApply:false};`);
 return h;
}
// Direct supplier request fails like a CORS refusal; the site endpoint answers with `answer`.
function network(h,answer){const calls=[];h.ctx.fetch=async(url,opt={})=>{calls.push({url:String(url),opt});if(String(url).startsWith('https://tactic-shop.in.ua/')||String(url).startsWith('https://www.armoline.com.ua/'))throw new TypeError('Failed to fetch');if(String(url)===SITE+'/pim/supplier-fetch')return answer(JSON.parse(opt.body));throw Error('unexpected '+url);};return calls;}

test('5.6-1 direct download blocked by CORS → PIM repeats through the site by the PIM key and imports the file',async()=>{
 const h=await harness(),now=Date.now(),date=kyiv(now-2*3600000);
 const calls=network(h,()=>new Response(yml(date),{status:200,headers:{'content-type':'application/octet-stream','x-supplier-content-type':'text/xml','x-supplier-last-modified':new Date(now-3600000).toUTCString()}}));
 const r=await h.run("workflowFetchSource('supplier-a')");
 assert.equal(r.status,'review','first download of a source is reviewed once, as before');
 assert.equal(calls.length,2,'one direct attempt, one through the site');
 const viaSite=calls[1];assert.equal(viaSite.opt.method,'POST');assert.equal(viaSite.opt.headers.Authorization,'Bearer '+KEY);
 assert.deepEqual(JSON.parse(viaSite.opt.body),{url:'https://tactic-shop.in.ua/content/export/feed.xml'});assert.equal(viaSite.opt.credentials,'omit');
 assert.equal(h.run('S.imp.xml'),true);assert.equal(h.run('S.imp.source_time.provenance'),'FILE_HEADER','yml_catalog@date is the data time');
 assert.equal(h.run('S.cfg.suppliers[0].source.lastVia'),'site');
 await h.run('doImport()');assert.equal(await h.run('applyImport()'),true,'PIM imports the file');
 const cost=h.run(`(()=>{for(const it of S.queue.values())if(it.s==='SYN-1')return it.cost;for(const p of S.products.values())for(const v of p.variants)if(v.offers?.['supplier-a']?.s==='SYN-1')return v.offers['supplier-a'].cost;return null;})()`);
 assert.equal(cost,450,'the offer of the site-fetched file is in PIM');
});

test('5.6-1 the site refusal reaches the owner with its reason; nothing is imported; no site → CORS explained',async()=>{
 const h=await harness();network(h,()=>new Response(JSON.stringify({ok:false,error:'Домену постачальника немає у списку дозволених (supplier_fetch_hosts у налаштуваннях сайту).',error_code:'HOST_NOT_ALLOWED'}),{status:422,headers:{'content-type':'application/json'}}));
 await assert.rejects(h.run("workflowFetchSource('supplier-a')"),/списку дозволених.*HOST_NOT_ALLOWED/s);
 assert.match(h.run('S.cfg.suppliers[0].source.lastError'),/HOST_NOT_ALLOWED/);assert.equal(h.run('S.imp'),null);assert.equal(h.run('S.queue.size'),0);
 // The site returned an HTML login page (closed mode without the key, a proxy) — never an import file.
 const html=await harness();network(html,()=>new Response('<!doctype html><html>Вхід</html>',{status:200,headers:{'x-supplier-content-type':'text/html'}}));
 await assert.rejects(html.run("workflowFetchSource('supplier-a')"),/сторінку|страницу/);
 // Site unreachable.
 const down=await harness();down.ctx.fetch=async()=>{throw new TypeError('Failed to fetch');};
 await assert.rejects(down.run("workflowFetchSource('supplier-a')"),/сайт/i);
 const none=await harness({site:false});none.ctx.fetch=async()=>{throw new TypeError('Failed to fetch');};
 await assert.rejects(none.run("workflowFetchSource('supplier-a')"),/CORS[\s\S]*сайт/);
});

test('5.6-1 «Обновить прайсы по ссылкам»: per supplier on the home screen — оновлено / потрібна перевірка / помилка (причина)',async()=>{
 const h=await harness();
 h.run(`S.cfg.suppliers.push({id:'supplier-b',name:'Армолайн',terms:{priceType:'cost',preorderDefault:'no',preorderConfirmed:true},source:{url:'https://www.armoline.com.ua/content/export/feed.xml',hours:24,enabled:true}},{id:'supplier-c',name:'Tactical Belt',terms:{priceType:'cost',preorderDefault:'no',preorderConfirmed:true},source:{url:'https://tacticalbelt.salesdrive.me/export/x/export.yml?publicKey=SECRETKEY',hours:24,enabled:true}});S.cfg.suppliers[0].name='Киборг';`);
 // Киборг: the site answers 504 (supplier too slow); Армолайн: review; Tactical Belt is not reached in this pass.
 h.ctx.fetch=async(url,opt={})=>{url=String(url);if(url!==SITE+'/pim/supplier-fetch')throw new TypeError('Failed to fetch');const u=JSON.parse(opt.body).url;
  if(u.includes('tactic-shop'))return new Response(JSON.stringify({ok:false,error:'Постачальник не віддав файл вчасно.',error_code:'TIMEOUT'}),{status:504});
  return new Response(yml(kyiv(Date.now()-3600000)),{status:200,headers:{'x-supplier-content-type':'text/xml'}});};
 const r=await h.run('workflowRefreshSources(false)');assert.deepEqual({...r},{applied:0,review:1,failed:1});
 const rows=JSON.parse(h.run('JSON.stringify(WORKFLOW.lastRefresh.rows)'));
 assert.deepEqual(rows.map(x=>[x.name,x.status]),[['Киборг','error'],['Армолайн','review'],['Tactical Belt','skipped']]);
 assert.match(rows[0].reason,/вчасно.*TIMEOUT/s);
 // The home screen (vToday) renders this panel; the full screen needs the catalog feed, the panel is checked on its own.
 const home=require('node:fs').readFileSync(require('node:path').join(__dirname,'../lib/workflow.inc.js'),'utf8');assert.match(home.slice(home.indexOf('vToday=function(){'),home.indexOf('async function workflowSourceBody')),/workflowRefreshPanel\(\)/,'the home screen shows the refresh result');
 const html=h.run('workflowRefreshPanel()');
 assert.match(html,/Киборг[\s\S]*помилка[\s\S]*вчасно/);assert.match(html,/Армолайн[\s\S]*потрібна перевірка/);assert.match(html,/Tactical Belt[\s\S]*не перевірено/);
 assert.doesNotMatch(html,/SECRETKEY|publicKey/,'the link key is never shown');
 assert.equal(h.run("workflowRefreshLabel('applied')"),'оновлено');
});

test('5.6-1 review fixes: the key never goes to the supplier or over http; 401 explains the key; the result survives a reload',async()=>{
 const h=await harness();const calls=network(h,()=>new Response(JSON.stringify({ok:false,error:'Неверный ключ PIM'}),{status:401}));
 await assert.rejects(h.run("workflowFetchSource('supplier-a')"),/невірний ключ PIM/);
 assert.ok(!calls[0].opt.headers||!('Authorization' in calls[0].opt.headers),'the direct supplier request carries no PIM key');
 const plain=await harness();plain.run(`S.cfg.siteApi={url:'http://site.invalid/api',key:${JSON.stringify(KEY)}};`);const pc=network(plain,()=>new Response('x'));
 await assert.rejects(plain.run("workflowFetchSource('supplier-a')"),/https:\/\//);assert.equal(pc.length,1,'nothing is sent to an http site');
 // A site error text with a query never reaches the owner's screen.
 const q=await harness();network(q,()=>new Response(JSON.stringify({ok:false,error:'Помилка https://x.example/feed.yml?publicKey=SECRETKEY',error_code:'UPSTREAM_HTTP'}),{status:502}));
 await assert.rejects(q.run("workflowFetchSource('supplier-a')"),e=>!/SECRETKEY|publicKey/.test(e.message));
 // The refresh result is kept in the PIM settings; a scheduled pass with nothing due keeps it.
 const r=await harness();network(r,()=>new Response(JSON.stringify({ok:false,error:'Постачальник не віддав файл вчасно.',error_code:'TIMEOUT'}),{status:504}));
 await r.run('workflowRefreshSources(false)');r.run('WORKFLOW.lastRefresh=null');
 assert.match(r.run('workflowRefreshPanel()'),/помилка[\s\S]*TIMEOUT/,'shown from the saved settings after a reload');
 r.run("S.cfg.suppliers[0].source.lastAttempt=Date.now()");await r.run('workflowRefreshSources(true)');assert.match(r.run('workflowRefreshPanel()'),/TIMEOUT/);
});
