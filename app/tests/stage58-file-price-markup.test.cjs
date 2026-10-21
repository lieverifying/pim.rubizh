'use strict';
// Stage 5.8 + D-90 (owner decisions 22.10, all suppliers): with «Порог маржи: без порога» the site price is the price from the
// supplier's file plus the supplier price rule, rounded up — to 1 UAH while the supplier price is below 100 UAH, else to 10 UAH.
// A retail price list with a discount keeps the discounted price for profit while the rule applies to the file price; the
// big-price rule and the margin floor do not apply.
const test=require('node:test'),assert=require('node:assert/strict');const {createHarness}=require('./isolated-harness.cjs');
function harness(){
 const h=createHarness({runtime:true,production:true});
 h.run(`Object.assign(S.cfg,OWNER_PRICE_POLICY,{round:10,roundMode:'up'});S.cfg.suppliers.push(
  {id:'disc',name:'A',terms:{priceType:'retail',discount:20,marginFloor:'off',rrp:'Нет, цена свободная'}},
  {id:'retail0',name:'B',terms:{priceType:'retail',discount:0,marginFloor:'off',rrp:'Нет, цена свободная'}},
  {id:'cost',name:'C',terms:{priceType:'cost',marginFloor:'off'}},
  {id:'old',name:'D',terms:{priceType:'retail',discount:0,rrp:'Да, обязательно'}});
  S.cfg.rules=['disc','retail0','cost','old'].map(value=>({scope:'supplier',value,markup:30,priority:100}));`);
 return h;
}
// The offer as the importer stores it: retail lists keep the file price as rrp and the discounted price as cost.
const offer=(sid,file)=>sid==='disc'?{cost:Math.round(file*0.8*100)/100,rrp:file}:sid==='cost'?{cost:file,rrp:0}:{cost:file,rrp:file};
const price=(h,sid,file)=>{h.ctx.o={s:'x',...offer(sid,file),stock:5,availability:'in',at:Date.now()};h.ctx.sid=sid;return JSON.parse(h.run(`(()=>{const p={id:'p-'+sid+o.rrp+o.cost,name:'x',variants:[{sku:'S',price:0,offers:{[sid]:o}}]};const c=calc(p,p.variants[0]);return JSON.stringify({price:c.price,payout:c.payout,low:c.lowMargin})})()`));};
const up=(x,step)=>Math.ceil(Math.round(x*1.3*100)/100/step)*step;

test('5.8 retail list with a discount: file price + rule, profit counted from the discounted price',()=>{
 const h=harness();
 for(const file of [189,1250,4399,12800]){const r=price(h,'disc',file);assert.equal(r.price,up(file,10),'file '+file);assert.equal(r.payout,Math.round(file*0.8*100)/100);assert.equal(r.low,false);}
});
test('5.8 retail list without discount: file price + rule, also above 10 000 UAH',()=>{
 const h=harness();for(const file of [350,2890,15400]){const r=price(h,'retail0',file);assert.equal(r.price,up(file,10),'file '+file);}
});
test('D-90 boundary: 99 UAH → rounded up to 1 UAH, 100 UAH → to 10 UAH, for every kind of price list',()=>{
 const h=harness();
 for(const sid of ['disc','retail0','cost']){
  assert.equal(price(h,sid,99).price,129,sid+' 99 × 1.3 = 128.7 → 129');
  assert.equal(price(h,sid,99.99).price,130,sid+' 99.99 × 1.3 = 129.99 → 130');
  assert.equal(price(h,sid,100).price,130,sid+' 100 × 1.3 = 130');
  assert.equal(price(h,sid,101).price,140,sid+' 101 × 1.3 = 131.3 → 140');
 }
 assert.deepEqual([21,24.5,14,25,45,72].map(c=>price(h,'cost',c).price),[28,32,19,33,59,94]);
});
test('5.8 a supplier without «без порога» keeps the general floor and the RRP rule',()=>{
 const h=harness();assert.equal(price(h,'old',1000).price,1590,'(1000)/(1 − 30 % − 7 %) rounded up to 10');
 assert.equal(price(h,'old',50).price,80,'below 100 UAH: 50/0.63 = 79.4 → 80 (1 UAH step)');
});
