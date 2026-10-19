'use strict';
// Stage 5.5.4 (owner, class A): with a «Відбір для сайту» selection (at least one chosen product) every send to the site — full
// sync, «Опубликовать изменения», the automatic publish after an import — carries ONLY the chosen products; the rest stay off
// the site (a not-chosen product the site shows goes to hide_ids); products of a new import are not chosen. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const SUP='supplier-a',NEW='supplier-new';
function setup(){
 const h=createHarness({runtime:true,production:true});
 h.run('render=()=>{};toast=()=>{};confirm=()=>true;Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;');
 for(const id of ['p-1','p-2','p-3']){
  const p=h.product({id,canonical_category_id:'bags_backpacks',category_locked:true,name:'Рюкзак Fixture '+id.toUpperCase()});
  p.variants[0].sku='RUB-'+id.toUpperCase();p.variants[0].offers[SUP].s='feed-'+id;p.variants[0].offers[SUP].source_description='Рюкзак 30 л. Матеріал: нейлон.';h.add(p);h.ctx.pid=id;h.run('classificationApplyProduct(S.products.get(pid))');
 }
 h.run(`S.cfg.suppliers.push({id:'${NEW}',name:'Новий прайс',auto:true,priority:1,terms:{priceType:'cost'}});bumpData()`);return h;
}
function mockSite(h){
 const calls=[];h.ctx.siteCall=async(url,opt)=>{calls.push({url,body:opt.body?JSON.parse(opt.body):null});const path=new URL(url).pathname;
  if(path.endsWith('/pim/status'))return {ok:true,json:async()=>({ok:true,products:{visible:0},capabilities:{contract_version:3,pricing_policy_version:1,category_catalog_version:2,size_catalog_version:1,inventory_policy_version:1,order_policy_version:1,model_colors_version:1,envelope:'products',freshness_policy_version:1,quote_sale_version:1}})};
  const b=JSON.parse(opt.body),last=b.chunk_index===b.chunk_count-1;
  return {ok:true,json:async()=>last?{ok:true,batch_id:b.batch_id,chunk_index:b.chunk_index,status:'COMMITTED',contract_version:3,catalog_revision:'rev',results:b.products.map(p=>({id:p.id,status:'created',contract_version:3})),hidden_ids:b.hide_ids}:{ok:true,batch_id:b.batch_id,chunk_index:b.chunk_index,status:'STAGED'}};};
 h.run('PRODUCTION_MIGRATION.state="ready";FINAL_NET.fetch=siteCall;S.cfg.siteApi={url:"https://shop.invalid/api",key:"k"};requireBatchBackup=async()=>({local:true});');
 const sent=()=>{const s=calls.filter(c=>c.url.endsWith('/pim/sync'));return {ids:s.flatMap(c=>c.body.products.map(p=>p.id)).sort(),hide:[...new Set(s.flatMap(c=>c.body.hide_ids))].sort()};};
 return {sent,reset:()=>{calls.length=0;}};
}
const ready=h=>JSON.parse(h.run('JSON.stringify([...S.products.values()].filter(p=>finalDecision(p).state==="READY").map(p=>p.id).sort())'));
const choose=(h,id)=>h.run(`(async()=>{selChosen()[${JSON.stringify(id)}]=true;await selSave();})()`);
async function importNew(h){
 // A real import (the path of «Загрузить прайс» → «Обработать прайс» → «Всё верно — применить») with two new products.
 h.ctx.rows=[['Артикул','Название','Категория','Фото','Цена','Описание'],
  ['NEW-1','Рюкзак тактичний Fixture Новий 1','Рюкзаки','https://rubizh.shop/media/new-1.webp',900,'Рюкзак 30 л. Матеріал: нейлон.'],
  ['NEW-2','Рюкзак тактичний Fixture Новий 2','Рюкзаки','https://rubizh.shop/media/new-2.webp',950,'Рюкзак 35 л. Матеріал: нейлон.']];
 await h.run('Store.init()');h.run(`S.imp={sup:'${NEW}',file:'new.xml',rows,hdr:0,map:{sku:0,name:1,category:2,photos:3,cost:4,desc:5}}`);await h.run('doImport()');assert.equal(await h.run('applyImport()'),true);
 const fresh=JSON.parse(h.run('JSON.stringify([...S.products.values()].filter(p=>!["p-1","p-2","p-3"].includes(p.id)&&!p.archived).map(p=>p.id))'));
 assert.ok(fresh.length>=1,'the import created products');
 // The imported cards made READY like reviewed ones, so the test proves the selection (not moderation) keeps them off the site.
 h.ctx.fresh=fresh;h.run('for(const id of fresh){const p=S.products.get(id);p.canonical_category_id="bags_backpacks";p.category_locked=true;classificationApplyProduct(p);}bumpData()');
 for(const id of fresh)assert.ok(ready(h).includes(id),id+' is READY');
 return fresh;
}

test('5.5.4: without a selection a full sync sends every READY product (unchanged behaviour)',async()=>{
 const h=setup(),site=mockSite(h);assert.deepEqual(ready(h),['p-1','p-2','p-3']);
 await h.run('sitePublish("full")');assert.deepEqual(site.sent().ids,['p-1','p-2','p-3']);
});

test('5.5.4: with a selection — import + full sync → the site gets only the chosen products; new import products are not chosen',async()=>{
 const h=setup(),site=mockSite(h);await choose(h,'p-1');
 const fresh=await importNew(h);
 for(const id of fresh)assert.equal(h.run(`!!selChosen()[${JSON.stringify(id)}]`),false,id+' not chosen by the import');
 await h.run('sitePublish("full")');
 assert.deepEqual(site.sent().ids,['p-1'],'only the chosen product, although '+ready(h).length+' are READY');
 site.reset();await h.run('sitePublish("delta")');assert.deepEqual(site.sent().ids,[],'«Опубликовать изменения» sends nothing new');
});

test('5.5.4: a product the site shows that is not chosen is taken off (hide_ids); choosing it again brings it back',async()=>{
 const h=setup(),site=mockSite(h);
 await h.run('sitePublish("full")');assert.deepEqual(site.sent().ids,['p-1','p-2','p-3'],'all on the site before the selection');
 await choose(h,'p-2');
 site.reset();await h.run('sitePublish("delta")');assert.deepEqual(site.sent(),{ids:[],hide:['p-1','p-3']},'not chosen → off the site');
 site.reset();const again=await h.run('sitePublish("full")');assert.equal(again.nothing,true,'they stay off: nothing more to send');assert.deepEqual(site.sent(),{ids:[],hide:[]});
 await choose(h,'p-3');
 site.reset();await h.run('sitePublish("full")');assert.deepEqual(site.sent(),{ids:['p-3'],hide:[]},'chosen again → back on the site');
});

test('5.5.4: every send button follows the selection; the production build has no timer auto-publish; the export feed matches',async()=>{
 const h=setup(),site=mockSite(h);await choose(h,'p-3');await importNew(h);
 h.run('S.cfg.siteApi.auto=true;window._siteLastEdit=0;SITE.lastVer=null');assert.equal(h.run('siteAutoTick()'),false,'no automatic send at all in the production build');
 assert.deepEqual(site.sent().ids,[]);
 for(const [act,data] of [['siteFull',{}],['sitePub',{}],['syncAll',{}],['',{final:'publish'}]]){
  await h.run('(async()=>{await Store.set("site/v3/hashes",{});await Store.set("site/v3/published",{});})()');site.reset();
  const errors=await h.click(act,data);assert.deepEqual(errors,[],act||'final publish');
  assert.deepEqual(site.sent().ids,['p-3'],(act||'«Отправить на сайт»')+': only the chosen product');
 }
 assert.deepEqual(JSON.parse(h.run('JSON.stringify(buildFeed().products.map(p=>p.id))')),['p-3'],'the export feed matches the send');
});

test('5.5.4: ids of deleted products are no selection (an emptied catalogue sends as before); the counter ignores them',()=>{
 const h=setup();h.run('S.siteSelection={"gone-1":true};bumpData()');assert.equal(h.run('selActive()'),false);
 assert.equal(JSON.parse(h.run('JSON.stringify(pimSiteWire().products.length)')),3,'a stale selection does not restrict');
 assert.match(h.run('waveBlock()'),/обрано 0/);
});
