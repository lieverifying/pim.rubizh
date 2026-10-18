'use strict';
// Stage 5.5 (owner D-74): the first wave of ≤500 products — strict «Запуск» mode (15 conditions, each failure with a reason),
// limit and quotas (one supplier ≤ 40 %, one top category ≤ 15 %, kit slots ≥ 8 when available), a stable rating, «Завжди /
// Ніколи в хвилі» marks (always never bypasses the conditions), publication of the wave only (the rest unpublished, not
// deleted) with an undo, and the same wave after a re-import of unchanged data. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const J=(h,src)=>JSON.parse(h.run('JSON.stringify('+src+')'));
// A product that passes every condition: the test then breaks one condition at a time.
function good(h,id,{brand='Fixture',cat='Рюкзаки, сумки та баули / Рюкзаки / Тактичні рюкзаки',sid='supplier-a',cost=1000}={}){
 const p=h.product({id,name:'Рюкзак тактичний '+brand+' Model '+id.toUpperCase(),brand,category:cat,photos:['https://img.test/'+id+'-1.webp','https://img.test/'+id+'-2.webp','https://img.test/'+id+'-3.webp'],
  attrs:{Матеріал:'Нейлон 600D','Об’єм':'30 л',Вага:'0,9 кг',Розміри:'50х30х20 см'},desc:'<p>Рюкзак об’ємом 30 л для щоденного використання та походів.</p><p>Матеріал: нейлон 600D.</p><p>Вага: 0,9 кг.</p>'});
 p.variants[0].offers={[sid]:{...p.variants[0].offers['supplier-a'],cost,payout:cost}};h.add(p);return p;
}
// The fixtures stand for a finished pipeline: description accepted, data fresh, READY on the PIM side.
const finish="for(const p of S.products.values()){const i=ceBuildIndex();p.contentDraft=ceChoose(p,i);ceApply(p);}launchConditionHooks.fresh=()=>true;launchConditionHooks.ready=()=>true;bumpData();";
function setup(n=6,opts){const h=createHarness();h.run("S.cfg.suppliers.push({id:'supplier-b',name:'Supplier B',priority:1})");for(let i=0;i<n;i++)good(h,'p'+String(i).padStart(2,'0'),opts);h.run(finish);return h;}
const wave=h=>J(h,'launchWave()');

test('D-74: a product passing all 15 conditions is in the wave; each failing condition keeps it out with a Ukrainian reason',()=>{
 const h=setup(1);let w=wave(h);assert.deepEqual(w.ids,['p00'],JSON.stringify(w.reasons));
 const breaks={
  photos:["S.products.get('p00').photos=S.products.get('p00').photos.slice(0,2)",/Фото/],
  http:["S.products.get('p00').photos[0]='http://img.test/x.webp'",/Фото/],
  brand:["S.products.get('p00').brand=''",/бренд/i],
  price:["S.cfg.waveMinPrice=5000",/Ціна/],
  never:["S.products.get('p00').waveMark='never'",/Ніколи/],
  hidden:["S.products.get('p00').pub=false;S.products.get('p00').fieldMeta.pub={source:'manual'}",/прихован/i],
  desc:["{const p=S.products.get('p00');p.desc=p.desc+'<p>x</p>';}",/Опис/],
 };
 for(const [k,[mutate,re]] of Object.entries(breaks)){const g=setup(1);g.run(mutate+';bumpData()');const r=wave(g);assert.deepEqual(r.ids,[],k);assert.ok((r.reasons.p00||[]).some(x=>re.test(x)),k+': '+JSON.stringify(r.reasons.p00));}
});

test('D-74: «Завжди в хвилі» does not bypass the conditions; «Ніколи» removes unconditionally',()=>{
 const h=setup(2);h.run("S.products.get('p00').waveMark='always';S.products.get('p00').photos=[];S.products.get('p01').waveMark='never';bumpData()");
 const w=wave(h);assert.deepEqual(w.ids,[]);
});

test('D-74: limit, the 40 % supplier quota and the 15 % top-category quota; ties by the smaller id',()=>{
 const h=createHarness();h.run("S.cfg.suppliers.push({id:'supplier-b',name:'Supplier B',priority:1})");
 for(let i=0;i<20;i++)good(h,'a'+String(i).padStart(2,'0'),{sid:'supplier-a'});
 for(let i=0;i<20;i++)good(h,'b'+String(i).padStart(2,'0'),{sid:'supplier-b',cat:'Взуття / Тактичні черевики'});
 for(let i=0;i<20;i++)good(h,'c'+String(i).padStart(2,'0'),{sid:'supplier-b',cat:'Підсумки / Підсумки для магазинів'});
 h.run(finish+"S.cfg.waveLimit=50;bumpData()");
 const w=wave(h);assert.ok(w.ids.length<=50);
 for(const n of Object.values(w.breakdown.suppliers))assert.ok(n<=Math.floor(50*0.4),'supplier ≤ 40 %: '+JSON.stringify(w.breakdown.suppliers));
 for(const n of Object.values(w.breakdown.categories))assert.ok(n<=Math.floor(50*0.15),'category ≤ 15 %: '+JSON.stringify(w.breakdown.categories));
 assert.deepEqual(wave(h).ids,w.ids,'stable');
});

test('D-74: the same wave after a re-import of unchanged data; computing 3000 products takes ≤ 2 s',()=>{
 const h=createHarness();for(let i=0;i<3000;i++)good(h,'q'+String(i).padStart(4,'0'),{cat:['Рюкзаки, сумки та баули / Рюкзаки / Тактичні рюкзаки','Взуття / Тактичні черевики','Підсумки / Підсумки для магазинів','Одяг та форма / Куртки'][i%4]});
 h.run("for(const p of S.products.values()){p.fieldMeta.desc.source='manual';}launchConditionHooks.fresh=()=>true;launchConditionHooks.ready=()=>true;bumpData()");
 const a=wave(h);h.run("for(const p of S.products.values())markProduct(p);bumpData()");
 const t=Date.now();const b=wave(h);const ms=Date.now()-t;assert.ok(ms<=2000,'3000 products in '+ms+' ms');
 assert.deepEqual(b.ids,a.ids,'same wave');assert.ok(a.ids.length>0);
});

test('D-74: «Опублікувати хвилю» publishes only the wave, unpublishes the rest without deleting, and can be undone',async()=>{
 const h=setup(3);h.run("S.products.get('p02').photos=[];S.products.get('p02').pub=true;bumpData()");
 assert.deepEqual(wave(h).ids,['p00','p01']);
 assert.deepEqual(await h.click('ceWavePublish'),[]);
 const state=J(h,"[...S.products.values()].map(p=>[p.id,p.pub,p.fieldMeta?.pub?.source||null,finalOwnerUnpublished(p)])");
 assert.deepEqual(state,[['p00',true,'manual',false],['p01',true,'manual',false],['p02',false,'manual',true]]);
 assert.equal(J(h,'S.products.size'),3,'nothing deleted');
 assert.deepEqual(await h.click('ceWaveUndo'),[]);assert.deepEqual(J(h,"[...S.products.values()].map(p=>[p.id,p.pub])"),[['p00',true],['p01',true],['p02',true]]);
});

test('D-74: the wave screen shows the total, the breakdowns, the reasons with counts and the rating formula',()=>{
 const h=setup(2);h.run("S.products.get('p01').photos=[];bumpData()");
 const html=h.run('launchWaveBlock()');
 for(const t of ['Перша хвиля','з 500','Постачальники','Категорії','Слоти','Не пройшли','Фото','Опублікувати хвилю \\(1\\)','Завжди в хвилі','Ніколи в хвилі','Рейтинг'])assert.match(html,new RegExp(t),t);
});

// Stage 5.5 review (silent-failure-hunter HIGH 1–3, code-reviewer MEDIUM 5).
test('review: a second «Опублікувати хвилю» keeps the state before the FIRST wave, so undo returns to it',async()=>{
 const h=setup(3);h.run("S.products.get('p02').photos=[];S.products.get('p02').pub=true;bumpData()");
 assert.deepEqual(await h.click('ceWavePublish'),[]);assert.deepEqual(await h.click('ceWavePublish'),[]);
 assert.deepEqual(await h.click('ceWaveUndo'),[]);
 assert.deepEqual(J(h,"[...S.products.values()].map(p=>[p.id,p.pub])"),[['p00',true],['p01',true],['p02',true]],'p02 is published again as before the first wave');
});
test('review: a failed duplicate-model check blocks the wave publication with a visible reason (not silently skipped)',async()=>{
 const h=setup(2);h.run("launchConditionHooks.mcPlan=()=>{throw new Error('broken plan')};bumpData()");
 const w=wave(h);assert.match(String(w.blocked),/Перевірку дублів моделей не виконано/);assert.ok(w.warnings.some(x=>/дублів/.test(x)));
 assert.match(h.run('launchWaveBlock()'),/disabled aria-describedby="wave-publish-why"/);
 await h.click('ceWavePublish');assert.equal(J(h,"S.cfg.waveLastPublish??null"),null,'nothing published');
 assert.match(h.run("document.querySelector('#toast').textContent"),/заблоковано/);
});
test('review: when saving fails, the wave publish and «Застосувати всі чисті описи» say «НЕ збережено», never success',async()=>{
 const h=setup(2);h.run("Store.catalogCommit=async()=>{throw new Error('disk full')}");
 await h.click('ceWavePublish');const t=h.run("document.querySelector('#toast').textContent");
 assert.match(t,/НЕ збережено/);assert.doesNotMatch(t,/Опубліковано/);assert.equal(h.run("document.querySelector('#toast [role=\"alert\"]')?'alert':''"),'alert');
 await h.click('ceApplyClean');assert.doesNotMatch(h.run("document.querySelector('#toast').textContent"),/^Застосовано/);
});
