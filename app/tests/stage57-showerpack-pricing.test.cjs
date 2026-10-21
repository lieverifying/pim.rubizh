'use strict';
// Stage 5.7 + D-90: a supplier with «Порог маржи: без порога» is priced by its supplier price rule only, without the general
// minimum-margin floor; every other supplier keeps the floor. Rounding: up to 1 UAH below a 100 UAH supplier price, else 10 UAH.
const test=require('node:test'),assert=require('node:assert/strict');const {createHarness}=require('./isolated-harness.cjs');
const ITEMS=[[21,28],[24.5,32],[14,19],[84,110],[235,310],[270,360],[165,220],[25,33],[217,290]];
const FLOOR=[34,39,23,134,380,430,270,40,350];
function harness(){
 const h=createHarness({runtime:true,production:true});
 h.run(`Object.assign(S.cfg,OWNER_PRICE_POLICY);S.cfg.suppliers.push({id:'rule',name:'Rule',terms:{priceType:'cost',marginFloor:'off'}},{id:'other',name:'Other',terms:{priceType:'cost'}});
  S.cfg.rules=[{scope:'supplier',value:'rule',markup:30,priority:10},{scope:'supplier',value:'other',markup:30,priority:10}];`);
 return h;
}
const price=(h,sid,cost)=>{h.ctx.sid=sid;h.ctx.cost=cost;return JSON.parse(h.run(`(()=>{const p={id:'x-'+sid+cost,name:'x',variants:[{sku:'S',price:0,offers:{[sid]:{s:'x',cost,payout:cost,stock:5,availability:'in',at:Date.now()}}}]};const c=calc(p,p.variants[0]);return JSON.stringify({price:c.price,min:c.minPrice,low:c.lowMargin,used:c.minMarginUsed,blocked:modelVariant(p,p.variants[0]).margin_blocked})})()`));};

test('5.7 price rule supplier: supplier price + markup, rounded up (1 UAH below 100, else 10), no margin floor, nothing blocked',()=>{
 const h=harness();
 for(const [cost,expected] of ITEMS){const r=price(h,'rule',cost);assert.equal(r.price,expected,'cost '+cost);assert.equal(r.low,false,'cost '+cost);assert.equal(r.blocked,false,'cost '+cost);assert.equal(r.used,0);assert.ok(r.min<=r.price,'the price still covers cost + tax + acquiring');}
});
test('5.7 another supplier with the same costs keeps the general margin floor',()=>{
 const h=harness();ITEMS.forEach(([cost],i)=>{const r=price(h,'other',cost);assert.equal(r.price,FLOOR[i],'cost '+cost);assert.equal(r.used,30);});
});
test('5.7 the supplier terms form offers the margin-floor setting',()=>{
 const h=harness();assert.ok(h.run('TERM_FIELDS.some(f=>f[0]==="marginFloor")'),'«Порог маржи» in «Условия работы»');
});
