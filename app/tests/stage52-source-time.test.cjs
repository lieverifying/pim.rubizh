'use strict';
// Stage 5.2 (owner 2026-10-17): without a per-offer supplier time the data time is the supplier FILE's generation date —
// YML yml_catalog@date, XLSX document properties — else the file's modification time, never the PIM import time.
// A file three weeks old imported today must not get direct payment (> 72 h → manager confirmation, > 8 days → hidden on
// SITE). Data age = stock_observed_at (supplier, per offer) else the file time; the file time goes to SITE in the existing
// wire field stock_imported_at (legacy name). Synthetic fixtures only: invented supplier rows, no real prices or files.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const XLSX=require('../vendor/xlsx-0.20.3.min.js');
const {createHarness,appRequire}=require('./isolated-harness.cjs');
const H=3600000,D=24*H;
// Kyiv wall time «YYYY-MM-DD HH:mm» of an instant, the way a Ukrainian YML generator writes it.
function kyiv(ms){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;}
const minute=ms=>Math.floor(ms/60000)*60000;
function yml({date,observed,stock=3,available=true}={}){
 return `<?xml version="1.0" encoding="UTF-8"?><yml_catalog${date?` date="${date}"`:''}><shop><categories><category id="1">Рюкзаки</category></categories><offers>`+
  `<offer id="A-1" available="${available}"><vendorCode>A-1</vendorCode><name>Рюкзак Fixture Pack 30</name><price>1000</price><stock>${stock}</stock><categoryId>1</categoryId>`+
  `<picture>https://rubizh.shop/media/fixture/a.webp</picture><description>Рюкзак 30 л. Матеріал: нейлон.</description>${observed?`<stock_observed_at>${observed}</stock_observed_at>`:''}</offer></offers></shop></yml_catalog>`;
}
function xlsx({modified}={}){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['SKU','Name','Price','Stock'],['A-1','Рюкзак Fixture Pack 30',1000,3]]),'Products');if(modified)wb.Props={ModifiedDate:new Date(modified),CreatedDate:new Date(modified)};return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
async function harness(){const h=createHarness({runtime:true});h.ctx.XLSX=XLSX;h.ctx.DOMParser=appRequire('linkedom').DOMParser;h.run('render=()=>{};classificationEnable();');await h.run('Store.init()');return h;}
// The ИМПОРТ screen path for a fetched/selected file: parse → S.imp → preview → apply.
async function importFile(h,bytes,name,lastModified){
 h.ctx.download={blob:new Blob([bytes]),url:'https://import.invalid/'+name,lastModified};
 const parsed=await h.run('workflowParseSource(download,S.cfg.suppliers[0])');h.ctx.parsed=parsed;
 h.run('S.imp={sup:"supplier-a",file:parsed.file,rows:parsed.rows,hdr:parsed.hdr,sheet:parsed.sheet,sheets:parsed.sheets,wb:parsed.wb||null,zero:false,xml:parsed.sheet==="XML",source_time:parsed.source_time};remap()');
 await h.run('doImport()');assert.equal(await h.run('applyImport()'),true,'import applied');return parsed;
}
// The one offer of SKU A-1 (in a product or, if not yet grouped, in the queue).
function offer(h){return JSON.parse(h.run(`JSON.stringify((()=>{for(const p of S.products.values())for(const v of p.variants)if(v.offers?.["supplier-a"]?.s==="A-1")return {...v.offers["supplier-a"],sid:"supplier-a",_p:p.id};for(const it of S.queue.values())if(it.s==="A-1")return {...it,sid:"supplier-a",_queue:true};return null;})())`));}
const meta=(h,o)=>JSON.parse(h.run('JSON.stringify(classificationStockMetadata('+JSON.stringify(o)+'))'));
const cls=(h,o)=>{const m=meta(h,o),p=JSON.parse(h.run('JSON.stringify(freshnessPolicy())'));if(m.stock_data_age_hours==null)return 'confirm';return m.stock_data_age_hours<=p.pay_fresh_hours?'fresh':m.stock_data_age_hours<=p.sell_max_days*24?'confirm':'hidden';};

test('Kyiv wall time: summer +03, winter +02, the repeated autumn hour → earlier instant, the spring gap is invalid; explicit zones kept',async()=>{
 const h=await harness(),k=s=>h.run('sourceKyivTime('+JSON.stringify(s)+')');
 assert.equal(k('2026-10-01 12:15'),Date.UTC(2026,9,1,9,15));assert.equal(k('2026-12-01 12:15'),Date.UTC(2026,11,1,10,15));
 assert.equal(k('2026-10-25 03:30'),Date.UTC(2026,9,25,0,30),'ambiguous hour → the older instant');assert.equal(k('2026-03-29 03:30'),null,'spring-forward gap');
 assert.equal(k('2026-10-01T12:15:00Z'),Date.UTC(2026,9,1,12,15));assert.equal(k('2026-10-01'),Date.UTC(2026,8,30,21,0));assert.equal(k('вчора'),null);
 // The same answer on a machine in another time zone.
 const src=fs.readFileSync(path.join(__dirname,'../lib/workflow.inc.js'),'utf8');const fn=src.slice(src.indexOf('const SOURCE_TIME_MIN'),src.indexOf('function sourceFileTime'));
 const r=spawnSync(process.execPath,['-e',fn+';console.log(sourceKyivTime("2026-10-01 12:15"),sourceKyivTime("2026-12-01 12:15"))'],{env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});
 assert.equal(r.stdout.trim(),`${Date.UTC(2026,9,1,9,15)} ${Date.UTC(2026,11,1,10,15)}`);
});
test('file time choice: header beats file mtime; a header later than the file or in the future is not trusted; old header warns',async()=>{
 const h=await harness(),now=Date.now(),t=a=>JSON.parse(h.run('JSON.stringify(sourceFileTime('+JSON.stringify(a)+'))'));
 let r=t({header:kyiv(now-21*D),mtime:now-20*D});assert.equal(r.provenance,'FILE_HEADER');assert.equal(r.at,minute(now-21*D));assert.equal(r.warning,null);
 r=t({header:kyiv(now-190*D),mtime:now-14*D});assert.equal(r.provenance,'FILE_HEADER');assert.equal(r.warning,'HEADER_OLDER_THAN_FILE','a stale header is shown, not silently replaced');
 r=t({header:kyiv(now-H),mtime:now-5*D});assert.equal(r.provenance,'FILE_MTIME');assert.equal(r.at,now-5*D);assert.equal(r.warning,'HEADER_AFTER_FILE');
 r=t({header:kyiv(now+2*D),mtime:now-3*D});assert.equal(r.provenance,'FILE_MTIME','a future header is skipped, not clamped');
 r=t({header:'2019-12-31 10:00',mtime:null});assert.equal(r.provenance,'NONE');assert.equal(r.at,null);assert.equal(r.warning,'HEADER_DATE_INVALID');
 r=t({});assert.equal(r.provenance,'NONE');assert.match(h.run('sourceFileTimeNote('+JSON.stringify(r)+')'),/оплата лише після підтвердження менеджера/);
});
test('a YML file three weeks old imported today: data time = yml_catalog@date, not the import → hidden on SITE; 80 h → manager confirmation',async()=>{
 const now=Date.now();
 let h=await harness();const parsed=await importFile(h,yml({date:kyiv(now-21*D)}),'feed.xml',now-20*D);
 assert.equal(parsed.source_time.provenance,'FILE_HEADER');
 let o=offer(h);assert.ok(o,'offer imported');
 assert.equal(o.source_generated_at,minute(now-21*D));assert.equal(o.source_time_provenance,'FILE_HEADER');assert.ok(Math.abs(o.imported_at-now)<5*60000,'the import time stays an audit field');
 let m=meta(h,o);assert.equal(m.stock_imported_at,minute(now-21*D),'SITE gets the file time');assert.ok(m.stock_data_age_hours>=21*24);assert.equal(m.stale_source,true);
 assert.equal(cls(h,o),'hidden');
 h=await harness();await importFile(h,yml({date:kyiv(now-80*H)}),'feed.xml',now);o=offer(h);assert.equal(cls(h,o),'confirm','80 h → only after the manager confirms');
 h=await harness();await importFile(h,yml({date:kyiv(now-2*H)}),'feed.xml',now);o=offer(h);assert.equal(cls(h,o),'fresh');
});
test('no date inside the file: the file modification time; XLSX: document properties, else modification time; nothing → no age (manager only)',async()=>{
 const now=Date.now();
 let h=await harness();await importFile(h,yml(),'feed.xml',now-10*D);let o=offer(h);assert.equal(o.source_time_provenance,'FILE_MTIME');assert.equal(o.source_generated_at,now-10*D);assert.equal(cls(h,o),'hidden');
 h=await harness();await importFile(h,xlsx({modified:now-25*D}),'price.xlsx',now-23*D);o=offer(h);assert.equal(o.source_time_provenance,'FILE_HEADER');assert.ok(Math.abs(o.source_generated_at-(now-25*D))<1000);assert.equal(cls(h,o),'hidden');
 h=await harness();await importFile(h,xlsx(),'price.xlsx',now-4*D);o=offer(h);assert.equal(o.source_time_provenance,'FILE_MTIME');assert.equal(cls(h,o),'confirm');
 h=await harness();await importFile(h,yml(),'feed.xml',undefined);o=offer(h);assert.equal(o.source_time_provenance,'NONE');assert.equal(o.source_generated_at,null);
 assert.equal(meta(h,o).stock_imported_at,null,'no file time → SITE has no data time and sells only after the manager confirms');assert.equal(cls(h,o),'confirm');
});
test('a new product created from the import queue keeps the data times of its offer (an empty catalog creates every product this way)',async()=>{
 const now=Date.now(),h=await harness();await importFile(h,yml({date:kyiv(now-21*D),observed:new Date(now-30*H).toISOString()}),'feed.xml',now);
 const queued=offer(h);assert.equal(queued._queue,true,'a new row waits in the queue');assert.equal(queued.source_generated_at,minute(now-21*D));
 h.run('render=()=>{};const g=groupsOfQueue()[0];createFromGroup(g)');const o=offer(h);assert.ok(o._p,'product created');
 assert.equal(o.source_generated_at,minute(now-21*D));assert.equal(o.source_time_provenance,'FILE_HEADER');assert.equal(o.stock_observation_provenance,'SUPPLIER_FIELD');
 assert.equal(meta(h,o).stock_observed_at,now-30*H,'the supplier per-offer time survives the queue');assert.equal(cls(h,o),'fresh','30 h by the supplier time');
 assert.equal(meta(h,o).stock_imported_at,minute(now-21*D),'the file time reaches the wire');
});
test('a per-offer supplier time still wins over the file time; the same file keeps its time; a file with an unchanged header date still updates the stock',async()=>{
 const now=Date.now();
 let h=await harness();await importFile(h,yml({date:kyiv(now-21*D),observed:new Date(now-2*H).toISOString()}),'feed.xml',now);let o=offer(h);
 assert.equal(o.stock_observation_provenance,'SUPPLIER_FIELD');assert.equal(cls(h,o),'fresh','the supplier per-offer time');
 h=await harness();await importFile(h,yml({date:kyiv(now-30*H)}),'feed.xml',now);h.run('createFromGroup(groupsOfQueue()[0])');const first=offer(h);assert.ok(first._p);
 await importFile(h,yml({date:kyiv(now-30*H)}),'feed.xml',now);assert.equal(offer(h).source_generated_at,first.source_generated_at,'same file → same data time');
 // A supplier whose generator never updates the header date (seen in a real feed): new stock must still come through —
 // the file time is the data age, never a reason to keep old stock.
 assert.equal(first.availability,'in');await importFile(h,yml({date:kyiv(now-30*H),stock:0,available:false}),'feed.xml',now);const after=offer(h);assert.equal(after.availability,'out','availability updated');assert.equal(after.source_generated_at,first.source_generated_at);
});
test('the import screen shows the data time of the file and warns about a stale header (owner sees it before applying)',async()=>{
 const now=Date.now(),h=await harness();h.ctx.download={blob:new Blob([yml({date:kyiv(now-190*D)})]),url:'https://import.invalid/feed.xml',lastModified:now-14*D};
 const parsed=await h.run('workflowParseSource(download,S.cfg.suppliers[0])');h.ctx.parsed=parsed;
 h.run('S.imp={sup:"supplier-a",file:parsed.file,rows:parsed.rows,hdr:parsed.hdr,sheet:"XML",sheets:["XML"],wb:null,zero:false,xml:true,source_time:parsed.source_time};remap();S.view="import"');
 const screen=h.run('vImport()');assert.match(screen,/data-source-time/);assert.match(screen,/дата у файлі .* а файл збережено/);
});
