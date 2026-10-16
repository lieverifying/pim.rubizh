'use strict';
// Stage 5 (owner 2026-10-16): supplier data freshness. freshHours 36. Older than 24 h → warning to the owner; older than
// 36 h → publication is blocked until the owner confirms, with the counter «скільки товарів стане недоступними»; PIMC-P2:
// a stale IN_STOCK observation is exported as UNKNOWN (no payment) and the change reaches SITE (model hash changes).
const test=require('node:test'),assert=require('node:assert/strict'),Ajv=require('ajv');
const {createHarness}=require('./isolated-harness.cjs');
const validate=new Ajv({strict:false}).compile(require('../contracts/category-size-export.schema.json'));
function setup(hours){
 const h=createHarness({runtime:true});
 h.run('render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;');
 const p=h.product({canonical_category_id:'bags_backpacks',category_locked:true,name:'Рюкзак Test Pack'});
 p.variants[0].offers['supplier-a'].at=Date.now()-hours*3600000;p.variants[0].offers['supplier-a'].source_description='Рюкзак 30 л. Матеріал: нейлон.';
 h.add(p);h.run('classificationApplyProduct(S.products.get("p-a"));bumpData()');return h;
}
const js=(h,code)=>JSON.parse(JSON.stringify(h.run(code)));
const variant=h=>js(h,'finalWireProduct(S.products.get("p-a"))').variants[0];

test('default freshness: freshHours 36, warning after 24 h',()=>{
 const h=setup(1);assert.equal(h.run('S.cfg.freshHours'),36);assert.equal(h.run('classificationFreshnessHours("supplier-a")'),36);assert.equal(h.run('FRESH_WARN_HOURS'),24);
});
test('fresh data: in stock, no warning, publication not blocked',()=>{
 const h=setup(2),v=variant(h);assert.equal(v.availability,'IN_STOCK');assert.equal(v.payment_allowed,true);
 const f=js(h,'finalFreshness()');assert.deepEqual(f.suppliers,[]);assert.equal(f.blocked,false);assert.equal(f.unavailable_products,0);
});
test('25 h: warning only — still in stock and payable, publication allowed',()=>{
 const h=setup(25),v=variant(h);assert.equal(v.availability,'IN_STOCK');assert.equal(v.payment_allowed,true);
 const f=js(h,'finalFreshness()');assert.equal(f.blocked,false);assert.equal(f.unavailable_products,0);
 assert.deepEqual(f.suppliers.map(s=>[s.sid,s.state,Math.floor(s.age_hours)]),[['supplier-a','warn',25]]);
 assert.match(h.run('finalFreshnessNotice()'),/старше 24 ч/);
});
test('37 h: IN_STOCK downgraded to UNKNOWN (PIMC-P2), counter, publication blocked until confirmed, hash changes',()=>{
 const fresh=setup(2),freshHash=fresh.run('finalModelHash(finalWireProduct(S.products.get("p-a")))');
 const h=setup(37),v=variant(h);
 assert.equal(v.availability,'UNKNOWN');assert.equal(v.payment_allowed,false);assert.equal(v.requires_order_confirmation,true);assert.equal(v.stock_quantity,null);
 assert.equal(validate(js(h,'finalWireProduct(S.products.get("p-a"))')),true,JSON.stringify(validate.errors));
 assert.notEqual(h.run('finalModelHash(finalWireProduct(S.products.get("p-a")))'),freshHash,'the downgrade reaches SITE');
 const f=js(h,'finalFreshness()');assert.equal(f.blocked,true);assert.equal(f.unavailable_products,1);
 assert.deepEqual(f.suppliers.map(s=>[s.sid,s.state]),[['supplier-a','block']]);
 const notice=h.run('finalFreshnessNotice()');assert.match(notice,/Скільки товарів стане недоступними: 1/);assert.match(notice,/data-final="publishStale"/);
 assert.match(h.run('finalFreshnessBlock()'),/STALE_DATA/);assert.equal(h.run('finalFreshnessBlock({allowStale:true})'),'');
});
test('a manually confirmed stock is not downgraded by age',()=>{
 const h=setup(37);h.run('S.products.get("p-a").variants[0].manualFields={stock:true};bumpData()');
 assert.equal(variant(h).availability,'IN_STOCK');
});
