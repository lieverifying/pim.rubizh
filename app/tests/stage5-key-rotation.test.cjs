'use strict';
// Stage 5 (owner 2026-10-16): pim_key rotation without downtime, PIM side. The next key is kept with the site credentials
// (never in portable copies), a 401 with the current key is retried once with the next key, and the owner promotes it.
// Mocked network only; no production rotation.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
function setup(){
 const h=createHarness({runtime:true,production:true});
 h.run('PRODUCTION_MIGRATION.state="ready";render=()=>{};S.cfg.siteApi={url:"https://shop.invalid/api",key:"old-key-old-key-old-key-0001",keyNext:"new-key-new-key-new-key-0002"};');
 const calls=[];h.ctx.siteCall=async(url,opt)=>{const auth=opt.headers.Authorization;calls.push({path:new URL(url).pathname,auth});
  if(h.ctx.accept.includes(auth.replace('Bearer ','')))return {ok:true,status:200,json:async()=>({ok:true,key_slot:auth.includes('new-key')?'next':'current',key_rotation:true})};
  return {ok:false,status:401,json:async()=>({ok:false,error:'Неверный ключ PIM'})};};
 h.ctx.accept=['old-key-old-key-old-key-0001','new-key-new-key-new-key-0002'];
 h.run('FINAL_NET.fetch=siteCall');return {h,calls};
}
test('the next key never leaves PIM in a portable copy or a synced config',()=>{
 const {h}=setup();
 const clean=JSON.parse(JSON.stringify(h.run('sanitizePortableConfig(S.cfg)')));assert.equal(clean.siteApi.key,undefined);assert.equal(clean.siteApi.keyNext,undefined);
 const copy=JSON.stringify(h.run('backupData("x")'));assert.doesNotMatch(copy,/old-key-old|new-key-new/);
 assert.equal(JSON.parse(JSON.stringify(h.run('sanitizePortableConfig({a:{key_next:"x",keyNext:"y"}})'))).a.keyNext,undefined);
});
test('the next key is kept with the site credentials and restored after a config sync',async()=>{
 const {h}=setup();await h.run('Store.init()');await h.run('rememberSiteCredentials105(S.cfg)');
 const back=JSON.parse(JSON.stringify(await h.run('receiveConfig105(S.cfg)')));assert.equal(back.siteApi.key,'old-key-old-key-old-key-0001');assert.equal(back.siteApi.keyNext,'new-key-new-key-new-key-0002');
});
test('a 401 with the current key is retried once with the next key and the owner is told to promote it',async()=>{
 const {h,calls}=setup();h.ctx.accept=['new-key-new-key-new-key-0002'];
 const j=await h.run('finalSiteFetch("/pim/status")');assert.equal(j.key_slot,'next');
 assert.deepEqual(calls.map(c=>c.auth),['Bearer old-key-old-key-old-key-0001','Bearer new-key-new-key-new-key-0002']);
 assert.match(h.run('S.cfg.siteSync.keyNotice'),/Зробіть новий ключ основним/);
});
test('without a next key a 401 is an error shown as is (no retry)',async()=>{
 const {h,calls}=setup();h.ctx.accept=[];h.run('delete S.cfg.siteApi.keyNext');
 await assert.rejects(h.run('finalSiteFetch("/pim/status")'),/Неверный ключ PIM/);assert.equal(calls.length,1);
});
test('«Перевірити» expects the site to accept the next key as next; «Зробити основним» moves it to the main key',async()=>{
 const {h}=setup();
 const r=await h.run('finalCheckNextKey()');assert.equal(r.key_slot,'next');
 h.ctx.accept=['old-key-old-key-old-key-0001'];await assert.rejects(h.run('finalCheckNextKey()'),/не прийняв/);
 h.ctx.accept=['old-key-old-key-old-key-0001','new-key-new-key-new-key-0002'];
 await h.run('finalPromoteNextKey()');assert.equal(h.run('S.cfg.siteApi.key'),'new-key-new-key-new-key-0002');assert.equal(h.run('S.cfg.siteApi.keyNext'),undefined);
 const html=h.run('vFinalReady()');assert.match(html,/Новий ключ/);assert.match(html,/data-final="checkNextKey"[^>]*>Перевірити/);assert.match(html,/data-final="promoteKey"[^>]*>Зробити основним/);
});
