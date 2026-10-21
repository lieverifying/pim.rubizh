'use strict';
// Stage 5.8 (owner decision 22.10, all suppliers): site price = price from the supplier's file + 30 %, rounded up to 10 UAH,
// for every supplier with «Порог маржи: без порога». Retail price lists (Svit) keep the purchase price for profit
// (retail − 20 %) while the markup goes on the retail price; the 25 % big-price rule and the margin floor do not apply.
const test=require('node:test'),assert=require('node:assert/strict');const {createHarness}=require('./isolated-harness.cjs');
function harness(){
 const h=createHarness({runtime:true,production:true});
 h.run(`Object.assign(S.cfg,OWNER_PRICE_POLICY,{round:10,roundMode:'up'});S.cfg.suppliers.push(
  {id:'svit',name:'Svit',terms:{priceType:'retail',discount:20,marginFloor:'off',rrp:'Нет, цена свободная'}},
  {id:'retail0',name:'Kiborg',terms:{priceType:'retail',discount:0,marginFloor:'off',rrp:'Нет, цена свободная'}},
  {id:'showerpack',name:'SHOWER PACK',terms:{priceType:'cost',marginFloor:'off'}},
  {id:'old',name:'Old',terms:{priceType:'retail',discount:0,rrp:'Да, обязательно'}});
  S.cfg.rules=['svit','retail0','showerpack','old'].map(value=>({scope:'supplier',value,markup:30,priority:100}));`);
 return h;
}
// The offer as the importer stores it: retail lists keep the file price as rrp and the discounted price as cost.
const offer=(sid,file)=>sid==='svit'?{cost:Math.round(file*0.8*100)/100,rrp:file}:sid==='showerpack'?{cost:file,rrp:0}:{cost:file,rrp:file};
const price=(h,sid,file)=>{h.ctx.o={s:'x',...offer(sid,file),stock:5,availability:'in',at:Date.now()};h.ctx.sid=sid;return JSON.parse(h.run(`(()=>{const p={id:'p-'+sid+o.rrp+o.cost,name:'x',variants:[{sku:'S',price:0,offers:{[sid]:o}}]};const c=calc(p,p.variants[0]);return JSON.stringify({price:c.price,payout:c.payout,low:c.lowMargin})})()`));};
const up10=x=>Math.ceil(Math.round(x*1.3*100)/100/10)*10;

test('5.8 Svit: price = YML price + 30 % rounded up to 10, purchase for profit = YML price × 0.8',()=>{
 const h=harness();
 for(const file of [189,1250,4399,12800]){const r=price(h,'svit',file);assert.equal(r.price,up10(file),'file '+file);assert.equal(r.payout,Math.round(file*0.8*100)/100);assert.equal(r.low,false);}
});
test('5.8 retail list without discount (Kiborg, Armoline, Tactical Belt): file price + 30 %, also above 10 000 UAH',()=>{
 const h=harness();for(const file of [350,2890,15400]){const r=price(h,'retail0',file);assert.equal(r.price,up10(file),'file '+file);}
});
test('5.8 SHOWER PACK keeps D-87: partner price + 30 %',()=>{
 const h=harness();assert.deepEqual([21,24.5,84,217].map(c=>price(h,'showerpack',c).price),[30,40,110,290]);
});
test('5.8 a supplier without «без порога» keeps the general floor and the RRP rule',()=>{
 const h=harness();assert.equal(price(h,'old',1000).price,1590,'(1000)/(1 − 30 % − 7 %) rounded up to 10');
});
