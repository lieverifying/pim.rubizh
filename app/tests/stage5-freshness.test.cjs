'use strict';
// Stage 5.1 (owner 2026-10-16) replaces the stage 5 rule (freshHours 36, a 24 h warning, PIMC-P2: stale IN_STOCK exported
// as UNKNOWN). Supplier data age = the supplier's own observation time, else the import time (weekly imports carry no
// supplier time — stage 5 counted no age at all for them). Owner settings payFreshHours 72 / sellMaxDays 8 (validated) go
// to SITE with every sync batch; SITE applies them at every read. PIM exports the PIM decision plus the age and warns:
// «Дані постачальника X застаріють для прямої оплати через N год / товари буде приховано через N днів»; publication
// stops only when products would be hidden (older than sellMaxDays), with the counter, until the owner confirms.
const test=require('node:test'),assert=require('node:assert/strict'),Ajv=require('ajv');
const {createHarness}=require('./isolated-harness.cjs');
const validate=new Ajv({strict:false}).compile(require('../contracts/category-size-export.schema.json'));
function setup(hours,{imported=false}={}){
 const h=createHarness({runtime:true});
 h.run('render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;');
 const p=h.product({canonical_category_id:'bags_backpacks',category_locked:true,name:'Рюкзак Test Pack'}),o=p.variants[0].offers['supplier-a'],t=Date.now()-hours*3600000;
 if(imported)Object.assign(o,{at:t,imported_at:t,stock_observed_at:null,stock_observation_provenance:'UNKNOWN'});else o.at=t;
 o.source_description='Рюкзак 30 л. Матеріал: нейлон.';
 h.add(p);h.run('classificationApplyProduct(S.products.get("p-a"));bumpData()');return h;
}
const js=(h,code)=>JSON.parse(JSON.stringify(h.run(code)));
const variant=h=>js(h,'finalWireProduct(S.products.get("p-a"))').variants[0];
const cls=h=>h.run('classificationFreshnessClass(S.products.get("p-a"),S.products.get("p-a").variants[0])');

test('defaults: payFreshHours 72, sellMaxDays 8 — the policy sent to SITE',()=>{
 const h=setup(1);assert.equal(h.run('S.cfg.payFreshHours'),72);assert.equal(h.run('S.cfg.sellMaxDays'),8);
 assert.deepEqual(js(h,'freshnessPolicy()'),{version:1,pay_fresh_hours:72,sell_max_days:8});assert.equal(h.run('classificationFreshnessHours()'),72);
});
test('owner settings are validated: whole hours 1–336, whole days 1–60, hiding after direct payment ends',()=>{
 const h=setup(1),errors=cfg=>js(h,'freshnessPolicyErrors('+JSON.stringify(cfg)+')');
 assert.deepEqual(errors({payFreshHours:72,sellMaxDays:8}),[]);assert.deepEqual(errors({payFreshHours:48,sellMaxDays:3}),[]);
 for(const bad of [{payFreshHours:0,sellMaxDays:8},{payFreshHours:72.5,sellMaxDays:8},{payFreshHours:337,sellMaxDays:30},{payFreshHours:72,sellMaxDays:0},{payFreshHours:72,sellMaxDays:61},{payFreshHours:72,sellMaxDays:3},{payFreshHours:NaN,sellMaxDays:8}])
  assert.ok(errors(bad).length,JSON.stringify(bad));
 assert.match(errors({payFreshHours:72,sellMaxDays:3})[0],/позже срока прямой оплаты/);
 // Settings screen: both fields; saving an invalid pair is refused with the reason.
 h.run('S.view="prices";S.priceDraft=null');const screen=h.run('vPrices()');assert.match(screen,/data-pd="payFreshHours"[^>]*value="72"/);assert.match(screen,/data-pd="sellMaxDays"[^>]*value="8"/);
 // An invalid stored value never reaches SITE: the defaults are sent instead.
 h.run('S.cfg.payFreshHours=0');assert.deepEqual(js(h,'freshnessPolicy()'),{version:1,pay_fresh_hours:72,sell_max_days:8});
 h.run('readPrices=()=>{};S.priceDraft={...priceSlice(S.cfg),payFreshHours:72,sellMaxDays:2}');
 return assert.rejects(h.run('savePriceSettings()'),/Срок скрытия \(2 дн\.\) должен быть позже/);
});
test('2 h: in stock and payable, the warning says when direct payment ends and when products will be hidden',()=>{
 const h=setup(2),v=variant(h);assert.equal(v.availability,'IN_STOCK');assert.equal(v.payment_allowed,true);assert.equal(cls(h),'fresh');
 const f=js(h,'finalFreshness()');assert.equal(f.blocked,false);assert.equal(f.confirm_products,0);assert.equal(f.hidden_products,0);
 assert.match(h.run('finalFreshnessNotice()'),/Дані постачальника Тестовий постачальник застаріють для прямої оплати через 70 год \/ товари буде приховано через 8 днів/);
});
test('73 h: PIM exports the stock and its age (SITE narrows it to manager confirmation), publication is not blocked',()=>{
 const h=setup(73),v=variant(h);
 assert.equal(v.availability,'IN_STOCK','no export-time downgrade (stage 5 PIMC-P2 made it UNKNOWN = not orderable)');assert.equal(v.stale_source,true);assert.ok(v.stock_data_age_hours>=73);
 assert.equal(validate(js(h,'finalWireProduct(S.products.get("p-a"))')),true,JSON.stringify(validate.errors));
 assert.equal(cls(h),'confirm');const f=js(h,'finalFreshness()');assert.equal(f.blocked,false);assert.equal(f.confirm_products,1);
 assert.match(h.run('finalFreshnessNotice()'),/старші за 72 год: оплата лише після підтвердження менеджера \/ товари буде приховано через 5 днів/);
 assert.equal(h.run('finalFreshnessBlock()'),'');
});
test('9 days: publication stops with «Скільки товарів буде приховано», until the owner confirms',()=>{
 const h=setup(9*24),f=js(h,'finalFreshness()');assert.equal(cls(h),'hidden');assert.equal(f.blocked,true);assert.equal(f.hidden_products,1);
 const notice=h.run('finalFreshnessNotice()');assert.match(notice,/Скільки товарів буде приховано: 1/);assert.match(notice,/старші за 8 днів: товари приховано з сайту/);assert.match(notice,/data-final="publishStale"/);
 assert.match(h.run('finalFreshnessBlock()'),/^STALE_DATA: .*Скільки товарів буде приховано: 1/);assert.equal(h.run('finalFreshnessBlock({allowStale:true})'),'');
});
test('no supplier time of its own: the supplier FILE time is the data age and goes to SITE; the import time alone is no age (stage 5.2)',()=>{
 // Stage 5.1 used the import time here; the owner replaced it (stage 5.2): the file's generation time, never the import.
 let h=setup(80,{imported:true});h.run('Object.assign(S.products.get("p-a").variants[0].offers["supplier-a"],{source_generated_at:Date.now()-80*3600000,source_time_provenance:"FILE_HEADER",imported_at:Date.now()});bumpData()');
 let v=variant(h);assert.equal(v.stock_observed_at,null,'the import is still not an observation');assert.ok(v.stock_imported_at>0);assert.ok(v.stock_data_age_hours>=80);assert.equal(v.stale_source,true);
 assert.equal(cls(h),'confirm');assert.equal(js(h,'finalFreshness()').confirm_products,1);
 h=setup(1,{imported:true});v=variant(h);assert.equal(v.stock_imported_at,null,'imported just now, but no file time → no data time on the wire');assert.equal(v.stock_data_age_hours,null);assert.equal(cls(h),'confirm','fail closed');
});
test('a manually confirmed stock has no data age: no warning, never hidden',()=>{
 const h=setup(20*24);h.run('S.products.get("p-a").variants[0].manualFields={stock:true};bumpData()');
 assert.equal(cls(h),null);assert.equal(variant(h).availability,'IN_STOCK');assert.equal(js(h,'finalFreshness()').blocked,false);
});
test('an offer without any data time is not «fresh» (fail closed, like SITE): counted as sold after the manager confirms',()=>{
 const h=setup(1);h.run('Object.assign(S.products.get("p-a").variants[0].offers["supplier-a"],{at:null,imported_at:null,stock_observed_at:null});bumpData()');
 assert.equal(cls(h),'confirm');assert.equal(js(h,'finalFreshness()').confirm_products,1);assert.equal(js(h,'finalFreshness()').blocked,false);
});
test('stage 5.2: a READY model whose stock has no data time is counted and named on the publication screen (sold only after the manager confirms)',()=>{
 const h=setup(1,{imported:true}),f=js(h,'finalFreshness()');
 assert.equal(f.unknown_age_products,1);assert.match(h.run('finalFreshnessNotice()'),/Дата даних невідома для 1 товарів/);assert.equal(f.blocked,false);
});
