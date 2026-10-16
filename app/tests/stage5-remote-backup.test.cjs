'use strict';
// Stage 5, 5-4 (owner 2026-10-16): automatic PIM backup outside IndexedDB — the sanitized portable copy goes to SITE
// private storage (POST /api/pim/backup, pim_key), after a COMMITTED publication and after the daily copy (at most one
// upload per 6 h unless after a publication); «Копії на сайті» lists, downloads (sha256 checked) and restores a copy
// keeping the site credentials. Synthetic catalog, fake IndexedDB, mocked network.
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {createHarness}=require('./isolated-harness.cjs');
const KEY='site-key-site-key-site-key-0001',NEXT='next-key-next-key-next-key-0002';
async function setup(){
 const h=createHarness({runtime:true,production:true});
 h.run('PRODUCTION_MIGRATION.state="ready";render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;S.cfg.siteApi={url:"https://shop.invalid/api",key:"'+KEY+'",keyNext:"'+NEXT+'"};');
 await h.run('Store.init()');
 for(const [id,name] of [['p-a','Рюкзак Test Pack'],['p-b','Рюкзак Second Pack']]){const p=h.product({id,canonical_category_id:'bags_backpacks',category_locked:true,name});p.variants[0].sku=id==='p-a'?'RUB-00001':'RUB-00002';p.variants[0].offers['supplier-a'].source_description='Рюкзак 30 л. Матеріал: нейлон.';h.add(p);}
 h.run('for(const p of S.products.values())classificationApplyProduct(p);bumpData()');await h.run('rememberSiteCredentials105(S.cfg)');await h.run('persist()');
 const site={copies:[],calls:[]};
 h.ctx.siteCall=async(url,opt)=>{const path=new URL(url).pathname;site.calls.push({path,method:opt.method||'GET',headers:opt.headers});
  const json=(x,status=200)=>({ok:status<300,status,json:async()=>x,arrayBuffer:async()=>Buffer.from(JSON.stringify(x))});
  if(path.endsWith('/pim/backup')){const bytes=Buffer.from(await new Response(opt.body).arrayBuffer());const sha=crypto.createHash('sha256').update(bytes).digest('hex');
   if(sha!==opt.headers['X-Backup-Sha256'])return json({ok:false,error:'SHA256_MISMATCH'},422);const id='pim-20261016T120000'+String(site.copies.length).padStart(6,'0')+'Z-'+sha.slice(0,12);site.copies.unshift({id,bytes,sha256:sha,label:decodeURIComponent(opt.headers['X-Backup-Label'])});return json({ok:true,id,sha256:sha,size:bytes.length});}
  if(path.endsWith('/pim/backups'))return json({ok:true,keep:14,backups:site.copies.map(c=>({id:c.id,sha256:c.sha256,size:c.bytes.length,label:c.label,at:'2026-10-16T12:00:00Z'}))});
  const m=path.match(/\/pim\/backups\/(.+)$/);if(m){const c=site.copies.find(c=>c.id===m[1]);const bytes=site.tamper?Buffer.concat([c.bytes,Buffer.from('x')]):c.bytes;return {ok:true,status:200,json:async()=>{throw Error('binary');},arrayBuffer:async()=>bytes};}
  if(path.endsWith('/pim/status'))return json({ok:true,capabilities:{contract_version:3,pricing_policy_version:1,category_catalog_version:2,size_catalog_version:1,inventory_policy_version:1,order_policy_version:1,model_colors_version:1,envelope:'products'}});
  if(path.endsWith('/pim/costs'))return json({ok:true,stored:1});
  const b=JSON.parse(opt.body);return json({ok:true,batch_id:b.batch_id,chunk_index:b.chunk_index,status:'COMMITTED',contract_version:3,catalog_revision:'rev-1',results:b.products.map(x=>({id:x.id,status:'created'})),hidden_ids:b.hide_ids});};
 h.run('FINAL_NET.fetch=siteCall;requireBatchBackup=async()=>({local:true});');
 return {h,site};
}
const stats=h=>JSON.parse(JSON.stringify(h.run('backupStatsOf(backupData("x"))')));

test('backup → clear → restore: equal catalog, credentials kept, sync and autoprices gates off, no keys in the uploaded copy',async()=>{
 const {h,site}=await setup(),before=stats(h);
 const r=await h.run('pimRemoteBackup("Після публікації",{afterPublish:true})');assert.ok(r.id);
 const plain=zlib.gunzipSync(site.copies[0].bytes).toString('utf8');
 assert.match(plain,/Рюкзак Second Pack/);assert.ok(!plain.includes(KEY)&&!plain.includes(NEXT),'no PIM key inside the copy');assert.doesNotMatch(plain,/"auth\//);
 assert.equal(site.copies[0].label,'Після публікації');
 // Clear.
 h.run('S.products=new Map();rebuildIndex();bumpData();markAllDirty()');await h.run('persist()');assert.equal(stats(h).products,0);
 const list=JSON.parse(JSON.stringify(await h.run('finalRemoteBackups()')));assert.equal(list[0].id,r.id);
 const ok=await h.run('finalRemoteRestore("'+r.id+'")');assert.equal(ok,true);
 assert.deepEqual(stats(h),before);
 assert.equal(h.run('S.cfg.siteApi.key'),KEY);assert.equal(h.run('S.cfg.siteApi.keyNext'),NEXT);assert.equal(h.run('S.cfg.siteApi.auto'),false);
 assert.equal(h.run('S.cfg.autoprices_enabled'),false);assert.equal(h.run('S.cfg.sync_enabled'),false);
 const creds=await h.run('Store._get0("auth/site_credentials")');assert.equal(creds.key,KEY);
});
test('a downloaded copy with a wrong checksum is refused before anything changes',async()=>{
 const {h,site}=await setup();const r=await h.run('pimRemoteBackup("x",{afterPublish:true})');site.tamper=true;
 const before=stats(h);await assert.rejects(h.run('finalRemoteRestore("'+r.id+'")'),/контрольн/);assert.deepEqual(stats(h),before);
});
test('a copy that would contain a PIM key is never uploaded',async()=>{
 const {h,site}=await setup();h.run('S.products.get("p-a").name="'+KEY+'";bumpData()');
 await assert.rejects(h.run('pimRemoteBackup("x",{afterPublish:true})'),/ключ/);assert.equal(site.copies.length,0);
});
test('at most one upload per 6 h, except right after a publication',async()=>{
 const {h,site}=await setup();
 assert.ok((await h.run('pimRemoteBackup("Ежедневная")')).id);
 assert.equal((await h.run('pimRemoteBackup("Ежедневная")')).skipped,true);assert.equal(site.copies.length,1);
 assert.ok((await h.run('pimRemoteBackup("Після публікації",{afterPublish:true})')).id);assert.equal(site.copies.length,2);
 await h.run('(async()=>Store.set("autobak_meta/remote",{...(await Store.get("autobak_meta/remote")),at:Date.now()-7*3600000}))()');
 assert.ok((await h.run('pimRemoteBackup("Ежедневная")')).id);assert.equal(site.copies.length,3);
});
test('a COMMITTED publication uploads a copy afterwards; the backup screen lists «Копії на сайті»',async()=>{
 const {h,site}=await setup();await h.run('sitePublish("delta",{silent:true})');
 const order=site.calls.map(c=>c.path.replace(/^.*\/pim\//,''));assert.ok(order.lastIndexOf('backup')>order.lastIndexOf('sync'),order.join(','));
 assert.match(h.run('finalRemoteBackupPanel()'),/Копії на сайті/);
});
test('the daily copy is also sent to the site; a tick without a new daily copy sends nothing',async()=>{
 const {h,site}=await setup();await h.run('dailyBackupTick()');assert.equal(site.copies.length,1);assert.equal(site.copies[0].label,'Ежедневная');
 await h.run('dailyBackupTick()');assert.equal(site.copies.length,1);
});
test('review of stage 5: credential-like settings (…Token, …Password, …Secret, …ApiKey) never reach the uploaded copy',async()=>{
 const {h,site}=await setup();h.run('S.cfg.telegramBotToken="tg-secret-0001";S.cfg.supplierFeeds={a:{login:"x",feedPassword:"pw-secret-0002",apiKey:"ak-secret-0003"}};S.cfg.npClientSecret="np-secret-0004";S.cfgDirty=true');await h.run('persist()');
 await h.run('pimRemoteBackup("x",{afterPublish:true})');const plain=zlib.gunzipSync(site.copies[0].bytes).toString('utf8');
 for(const s of ['tg-secret-0001','pw-secret-0002','ak-secret-0003','np-secret-0004'])assert.ok(!plain.includes(s),s);
});
test('review of stage 5: a site copy that is not a PIM catalog copy is refused before anything changes',async()=>{
 const {h,site}=await setup();await h.run('pimRemoteBackup("x",{afterPublish:true})');
 const fake=zlib.gzipSync(Buffer.from(JSON.stringify({format:'rubizh-pim-backup',cfg:{}})));const sha=crypto.createHash('sha256').update(fake).digest('hex');
 site.copies.unshift({id:'pim-20261016T130000000000Z-'+sha.slice(0,12),bytes:fake,sha256:sha,label:'fake'});
 const before=stats(h);h.run('FINAL_UI.remoteBackups=null');await assert.rejects(h.run('finalRemoteRestore("'+site.copies[0].id+'")'),/не копія бази PIM/);assert.deepEqual(stats(h),before);
});
