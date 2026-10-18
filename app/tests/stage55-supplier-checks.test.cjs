'use strict';
// Stage 5.5 (owner D-71): report-only checks of the supplier text against PIM data — prices, flags and lead times are NOT
// changed; since 5.5.2 a hint column on «Відбір для сайту», never an exclusion. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const J=(h,src)=>JSON.parse(h.run('JSON.stringify('+src+')'));
function jacket(h,desc,prices){
 const p=h.product({id:'p-j',name:'Куртка флісова Fixture Delta',desc,attrs:{}});
 const base=p.variants[0];p.variants=Object.entries(prices).map(([size,cost],i)=>({...structuredClone(base),sku:'RUB-9'+i,size,offers:{'supplier-a':{...structuredClone(base.offers['supplier-a']),s:'FX-'+size,cost,payout:cost}}}));
 h.add(p);return p;
}

test('D-71: «58-62р +50грн» while those sizes cost no more than the base size → «Можлива недоплата»; prices are not changed',()=>{
 const h=createHarness();jacket(h,'<p>Тепла кофта.</p><p>(Батал 58-62р +50грн)</p>',{'54':1000,'56':1000,'58':1000,'60':1300,'62':1000});
 const before=J(h,"S.products.get('p-j').variants.map(v=>[v.sku,calc(S.products.get('p-j'),v).price])");
 const rows=J(h,"supplierTextChecks(S.products.get('p-j'))");
 const under=rows.filter(r=>r.kind==='underpaid');assert.deepEqual(under.map(r=>r.size).sort(),['58','62'],'60 is priced higher, 58 and 62 are not');
 for(const r of under){assert.equal(r.label,'Можлива недоплата');assert.match(r.text,/\+50грн/);assert.ok(r.price<=r.base_price);}
 assert.deepEqual(J(h,"S.products.get('p-j').variants.map(v=>[v.sku,calc(S.products.get('p-j'),v).price])"),before,'report only');
});

test('D-71: «під замовлення / термін виготовлення N днів» while the SKU is in stock without a lead time → a report row',()=>{
 const h=createHarness();jacket(h,'<p>Тепла кофта.</p><p>Термін виготовлення 14 днів.</p>',{'54':1000});
 const rows=J(h,"supplierTextChecks(S.products.get('p-j'))");
 assert.equal(rows.length,1);assert.equal(rows[0].kind,'made_to_order');assert.equal(rows[0].label,'Постачальник пише «під замовлення», а в PIM — в наявності');
 assert.equal(J(h,"supplierTextChecks(S.products.get('p-j')).length"),1,'stable');
 h.run("{const p=S.products.get('p-j');for(const v of p.variants){const o=v.offers['supplier-a'];o.preorderManual=true;o.preorder=true;o.productionDays=14;}markProduct(p);}");
 assert.deepEqual(J(h,"supplierTextChecks(S.products.get('p-j'))"),[],'a confirmed lead time in PIM: no row');
});

test('D-71: one price for every size (the manager confirms the size) and a surcharge in the text → «Можлива недоплата» for the size range',()=>{
 const h=createHarness();jacket(h,'<p>Кофта.</p><p>(Батал 58,60р +50грн)</p>',{'':1000});
 const rows=J(h,"supplierTextChecks(S.products.get('p-j'))");assert.equal(rows.length,1);assert.equal(rows[0].kind,'underpaid');assert.equal(rows[0].size,'58, 60');
});
test('D-71: no supplier remark, no row',()=>{
 const h=createHarness();jacket(h,'<p>Тепла кофта з фліса.</p>',{'54':1000,'56':1000});
 assert.deepEqual(J(h,"supplierTextChecks(S.products.get('p-j'))"),[]);
});
