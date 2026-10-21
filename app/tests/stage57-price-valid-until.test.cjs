'use strict';
// Stage 5.7 (owner ТЗ 2.2): a supplier without a link (manual Excel price, SHOWER PACK) has «Прайс актуальний до» in its
// terms — 30 days from the import by default, editable by hand. PIM sends it to SITE as stock_valid_until (end of that day)
// only for such a supplier and only while the date is ahead; PIM reminds the owner 3 days before the end and after it.
const test=require('node:test'),assert=require('node:assert/strict');const {createHarness}=require('./isolated-harness.cjs');
const D=86400000,day=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function harness(){const h=createHarness({runtime:true,production:true});h.run(`S.cfg.suppliers.push({id:'manual',name:'SHOWER PACK',terms:{}},{id:'linked',name:'Linked',terms:{},source:{url:'https://supplier.example/feed.xml'}});`);return h;}
const valid=(h,sid,until)=>{h.ctx.sid=sid;h.ctx.until=until;return h.run(`S.cfg.suppliers.find(s=>s.id===sid).terms.priceValidUntil=until;classificationStockMetadata({sid,s:'x'}).stock_valid_until??null`);};

test('5.7 stock_valid_until goes to SITE only for a manual-price supplier and only while the date is ahead',()=>{
 const h=harness(),future=day(Date.now()+5*D);
 assert.equal(valid(h,'manual',future),new Date(future+'T23:59:59').getTime(),'end of that day');
 assert.equal(valid(h,'manual',day(Date.now()-2*D)),null,'a past date sends nothing');
 assert.equal(valid(h,'linked',future),null,'a supplier with a link is unchanged');
 assert.equal(valid(h,'manual',''),null,'no date — nothing');
});
test('5.7 import of a manual price sets 30 days by default and never shortens a later date set by hand',()=>{
 const h=harness(),now=Date.now();h.ctx.now=now;
 assert.equal(h.run(`workflowDefaultPriceValidity(S.cfg.suppliers.find(s=>s.id==='manual'),now)`),true);
 assert.equal(h.run(`S.cfg.suppliers.find(s=>s.id==='manual').terms.priceValidUntil`),day(now+30*D));
 h.ctx.later=day(now+45*D);h.run(`S.cfg.suppliers.find(s=>s.id==='manual').terms.priceValidUntil=later`);
 assert.equal(h.run(`workflowDefaultPriceValidity(S.cfg.suppliers.find(s=>s.id==='manual'),now)`),false);assert.equal(h.run(`S.cfg.suppliers.find(s=>s.id==='manual').terms.priceValidUntil`),day(now+45*D));
 assert.equal(h.run(`workflowDefaultPriceValidity(S.cfg.suppliers.find(s=>s.id==='linked'),now)`),false,'a supplier with a link gets no date');
});
test('5.7 reminder 3 days before the end and after it; nothing earlier',()=>{
 const h=harness();
 for(const [offset,shown,text] of [[10,false],[2,true,/актуальний до/],[-1,true,/прострочений/]]){h.ctx.until=day(Date.now()+offset*D);h.run(`S.cfg.suppliers.find(s=>s.id==='manual').terms.priceValidUntil=until`);
  const html=h.run('workflowRefreshPanel()');assert.equal(/data-price-validity-supplier="manual"/.test(html),shown,'offset '+offset);if(text)assert.match(html,text);}
});
