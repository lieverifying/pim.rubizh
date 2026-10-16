'use strict';
// Stage 5, 5-2 (OD-4.1): the supplier payout per SKU goes to SITE in a separate PRIVATE contract
// (rubizh-pim-private-costs v1, POST /api/pim/costs) — never inside the public wire. Synthetic catalogs, mocked network.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const Ajv2020=require('ajv/dist/2020');
const {createHarness}=require('./isolated-harness.cjs');
const schema=require('../contracts/pim-site-private-costs-v1.schema.json'),validate=new Ajv2020({strict:false}).compile(schema);
function setup(){
 const h=createHarness({runtime:true,production:true});
 h.run('render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;');
 const p=h.product({canonical_category_id:'bags_backpacks',category_locked:true,name:'Рюкзак Test Pack'});p.variants[0].offers['supplier-a'].source_description='Рюкзак 30 л. Матеріал: нейлон.';
 p.variants[0].offers['supplier-a'].payout=1234.56;
 h.add(p);h.run('classificationApplyProduct(S.products.get("p-a"));bumpData()');return h;
}
const js=(h,c)=>JSON.parse(JSON.stringify(h.run(c)));
const keysDeep=(x,out=new Set())=>{if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){out.add(k);keysDeep(v,out);}return out;};

test('private costs envelope: schema-valid, kopecks of the calc() payout, READY models only, no supplier names',()=>{
 const h=setup(),c=js(h,'pimSitePrivateCosts()');
 assert.equal(validate(c),true,JSON.stringify(validate.errors));
 assert.deepEqual(c.costs,[{sku:'RUB-00001',supplier_payout_minor:123456}]);
 assert.equal(c.costs[0].supplier_payout_minor,Math.round(h.run('calc(S.products.get("p-a"),S.products.get("p-a").variants[0]).payout')*100));
 assert.doesNotMatch(JSON.stringify(c),/Тестовий постачальник|supplier-a|feed-a/);
 h.run('S.products.get("p-a").canonical_category_id=null;S.products.get("p-a").category_locked=false;bumpData()');
 assert.notEqual(h.run('finalDecision(S.products.get("p-a")).state'),'READY');assert.deepEqual(js(h,'pimSitePrivateCosts()').costs,[],'not READY → not sent');
});
test('the public wire never carries a payout or cost',()=>{
 const h=setup(),keys=keysDeep(js(h,'pimSiteWire()'));
 for(const k of ['payout','cost','supplier_payout','supplier_payout_minor','cost_minor'])assert.ok(!keys.has(k),k);
 assert.doesNotMatch(JSON.stringify(js(h,'pimSiteWire()')),/1234\.56|123456/);
});
test('contract fixture: the exporter output on the synthetic fixture catalog equals the committed fixture (= SITE contract)',()=>{
 const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pim-costs-')),'c.json');
 execFileSync(process.execPath,[path.join(__dirname,'../tools/export-private-costs-fixture.cjs'),tmp]);
 const committed=path.join(__dirname,'../contracts/fixtures/pim-site-private-costs-v1.exact.json');
 assert.equal(fs.readFileSync(tmp,'utf8'),fs.readFileSync(committed,'utf8'));assert.equal(validate(JSON.parse(fs.readFileSync(committed,'utf8'))),true);
 const site='/Users/l/Projects/rubizh/contracts/pim-private-costs/1/schema.json';
 if(fs.existsSync(site))assert.deepEqual(JSON.parse(fs.readFileSync(site,'utf8')),schema,'same schema as SITE');
});
function mockSite(h,{commit=true,costsFail=false}={}){
 const calls=[];h.ctx.siteCall=async(url,opt)=>{const p=new URL(url).pathname;calls.push({path:p,body:opt.body?JSON.parse(opt.body):null});
  if(p.endsWith('/pim/status'))return {ok:true,json:async()=>({ok:true,capabilities:{contract_version:3,pricing_policy_version:1,category_catalog_version:2,size_catalog_version:1,inventory_policy_version:1,order_policy_version:1,model_colors_version:1,envelope:'products'}})};
  if(p.endsWith('/pim/costs'))return costsFail?{ok:false,status:500,json:async()=>({ok:false,error:'boom'})}:{ok:true,json:async()=>({ok:true,stored:1})};
  if(p.endsWith('/pim/backup'))return {ok:true,json:async()=>({ok:true,id:'pim-x'})};
  const b=JSON.parse(opt.body);
  return {ok:true,json:async()=>({ok:true,batch_id:b.batch_id,chunk_index:b.chunk_index,status:commit?'COMMITTED':'STAGED',contract_version:3,catalog_revision:'rev-1',results:b.products.map(x=>({id:x.id,status:'created'})),hidden_ids:b.hide_ids})};};
 h.run('PRODUCTION_MIGRATION.state="ready";FINAL_NET.fetch=siteCall;S.cfg.siteApi={url:"https://shop.invalid/api",key:"k"};requireBatchBackup=async()=>({local:true});');return calls;
}
test('publication sends the private costs only after the site COMMITTED the batch',async()=>{
 const h=setup(),calls=mockSite(h);const r=await h.run('sitePublish("delta")');
 const order=calls.map(c=>c.path.replace(/^.*\/pim\//,''));assert.ok(order.indexOf('costs')>order.lastIndexOf('sync'),order.join(','));
 const sent=calls.find(c=>c.path.endsWith('/pim/costs')).body;assert.equal(validate(sent),true);assert.deepEqual(sent.costs,[{sku:'RUB-00001',supplier_payout_minor:123456}]);
 assert.equal(r.costs_error,undefined);
 const h2=setup(),calls2=mockSite(h2,{commit:false});await assert.rejects(h2.run('sitePublish("delta")'));assert.ok(!calls2.some(c=>c.path.endsWith('/pim/costs')),'no costs without COMMITTED');
});
test('a failed costs upload is shown to the owner and does not undo the publication',async()=>{
 const h=setup();mockSite(h,{costsFail:true});const r=await h.run('sitePublish("delta",{silent:true})');
 assert.equal(r.sent,1);assert.match(r.costs_error,/boom/);assert.match(h.run('S.cfg.siteSync.costsError'),/boom/);
 assert.deepEqual(Object.keys(await h.run('Store.get("site/v3/hashes")')),['p-a'],'publication recorded');
});
