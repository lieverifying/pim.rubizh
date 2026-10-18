'use strict';
// Stage 5.5.2 (owner): «Відбір для сайту» instead of the wave — all catalogue products, nothing chosen by default, the owner
// ticks products one by one or by a filter («Обрано: N»); filters and hint columns (hints never exclude); a restricted
// product (S54-04) cannot be chosen; «Опублікувати обрані» publishes the chosen ones with the cleaned supplier texts and takes
// the rest off the site without deleting, with a confirmation, a backup and an undo. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const J=(h,src)=>JSON.parse(h.run('JSON.stringify('+src+')'));
const TEXT='<p>Рюкзак тактичний для щоденного використання та тривалих походів у польових умовах.</p><p>Матеріал: нейлон 600D; вага 0,9 кг; об’єм 30 л.</p><p>Ціна 1500 грн, в наявності на складі.</p><p>Телефонуйте 067 123 45 67!</p>';
function item(h,id,{brand='Fixture',name='Рюкзак тактичний Fixture '+id.toUpperCase(),photos=3,cost=1000,desc=TEXT,sid='supplier-a',cat='Рюкзаки, сумки та баули / Рюкзаки / Тактичні рюкзаки'}={}){
 const p=h.product({id,name,brand,category:cat,desc,attrs:{},photos:Array.from({length:photos},(_,i)=>'https://img.test/'+id+'-'+i+'.webp')});
 p.variants[0].offers={[sid]:{...p.variants[0].offers['supplier-a'],cost,payout:cost}};h.add(p);return p;
}
function setup(){
 const h=createHarness();h.run("S.cfg.suppliers.push({id:'supplier-b',name:'Новий постачальник',priority:1,needsDryRun:true})");
 item(h,'a1');item(h,'a2',{brand:'',photos:1});item(h,'a3',{desc:'<p>Тепла кофта.</p><p>Термін виготовлення 14 днів.</p>',name:'Кофта Fixture A3'});
 item(h,'b1',{sid:'supplier-b',cost:3000,cat:'Взуття / Тактичні черевики',name:'Черевики Fixture B1'});item(h,'b2',{sid:'supplier-b',name:'Рюкзак тактичний Fixture A1'});
 return h;
}
const rows=h=>J(h,'selRows()');
const chosen=h=>Object.keys(J(h,'selChosen()')).sort();

test('5.5.2: every product is listed, nothing is chosen by default, publishing is disabled; no wave remains',()=>{
 const h=setup();assert.equal(rows(h).length,5);assert.deepEqual(chosen(h),[]);
 const html=h.run('vSiteSelect()');assert.match(html,/Відбір для сайту/);assert.match(html,/Обрано: 0/);assert.match(html,/data-act="ceSelPublish" disabled/);
 for(const gone of ['launchWave','launchReasons','launchRating','launchWavePublish','launchSoft'])assert.equal(h.run('typeof '+gone),'undefined',gone);
 assert.doesNotMatch(html,/хвил|Рейтинг|квот/i);
});

test('5.5.2: hints (Russian text, no brand, name, D-71) never exclude; a new supplier without a dry run and a twin name can be chosen',async()=>{
 const h=setup();h.run("{const p=S.products.get('a1');p.desc=p.desc+'<p>Рюкзак очень удобный и прочный.</p>';p.fieldMeta.desc={source:'supplier'};markProduct(p);bumpData();}");
 const r=Object.fromEntries(rows(h).map(x=>[x.id,x]));
 assert.equal(r.a1.ru,true);assert.equal(r.a2.noBrand,true);assert.deepEqual(r.a3.d71,['made_to_order']);
 const html=h.run('vSiteSelect()');for(const t of ['російський текст','немає бренду','під замовлення'])assert.match(html,new RegExp(t),t);
 await h.click('ceSelAll');assert.deepEqual(chosen(h),['a1','a2','a3','b1','b2'],'all chosen, including b1/b2 of the supplier without a dry run');
 assert.match(h.run('vSiteSelect()'),/Обрано: 5/);
});

test('5.5.2: filters — supplier, category, photos, sizes, price, «можна купити зараз», description length; choose and clear by filter',async()=>{
 const h=setup();const f=o=>{h.run(`for(const k of Object.keys(SEL_UI.f))SEL_UI.f[k]='';Object.assign(SEL_UI.f,${JSON.stringify(o)})`);return J(h,'selFiltered().map(r=>r.id)');};
 assert.deepEqual(f({sup:'supplier-b'}),['b1','b2']);assert.deepEqual(f({cat:'Взуття'}),['b1']);assert.deepEqual(f({photos:'3'}),['a1','a3','b1','b2']);
 assert.equal(f({sizes:'none'}).length,5);assert.deepEqual(f({sizes:'3'}),[]);
 const price=J(h,"selRows().find(r=>r.id==='b1').price");assert.ok(price>J(h,"selRows().find(r=>r.id==='a1').price"));assert.deepEqual(f({pmin:String(price)}),['b1']);
 assert.deepEqual(f({words:'10'}),['a1','a2','b1','b2'],'a3 has a two-sentence text');
 assert.deepEqual(f({buy:'now'}),[],'old data: nothing payable now');h.run('launchConditionHooks.fresh=()=>true;bumpData()');assert.equal(f({buy:'now'}).length,5);
 f({sup:'supplier-b'});await h.click('ceSelAll');assert.deepEqual(chosen(h),['b1','b2']);
 f({});await h.click('ceSelToggle',{id:'a1'});assert.deepEqual(chosen(h),['a1','b1','b2']);await h.click('ceSelToggle',{id:'a1'});assert.deepEqual(chosen(h),['b1','b2']);
 f({cat:'Взуття'});await h.click('ceSelNone');assert.deepEqual(chosen(h),['b2']);
 f({show:'chosen'});assert.deepEqual(J(h,'selFiltered().map(r=>r.id)'),['b2']);
});

test('5.5.2: a restricted product stays rejected and cannot be chosen',async()=>{
 const h=setup();h.run("siteBlocked=p=>p.id==='a2';bumpData()");
 assert.match(h.run('vSiteSelect()'),/data-id="a2"[^>]*disabled/);
 await h.click('ceSelToggle',{id:'a2'});await h.click('ceSelAll');assert.ok(!chosen(h).includes('a2'));
 assert.match(J(h,"selRows().find(r=>r.id==='a2').state"),/обмежена група/);
});

test('5.5.2: «Опублікувати обрані» — confirmation, chosen published with the cleaned text, the rest off the site (kept), originals unchanged, undo',async()=>{
 const h=setup();await h.click('ceSelToggle',{id:'a1'});await h.click('ceSelToggle',{id:'b1'});
 const before=J(h,"[...S.products.values()].map(p=>[p.id,p.pub,p.desc,p.fieldMeta.desc])"),wireBefore=h.run("finalDescription(S.products.get('a1'))");
 h.ctx.confirm=()=>false;await h.click('ceSelPublish');assert.equal(J(h,'S.cfg.sitePublishLast??null'),null,'cancelled');
 let asked='';h.ctx.confirm=m=>{asked=String(m);return true;};assert.deepEqual(await h.click('ceSelPublish'),[]);
 assert.match(asked,/Буде опубліковано: 2/);assert.match(asked,/знято з сайту: 3/);
 assert.deepEqual(J(h,"[...S.products.values()].map(p=>[p.id,p.pub])"),[['a1',true],['a2',false],['a3',false],['b1',true],['b2',false]]);
 assert.equal(J(h,'S.products.size'),5,'nothing deleted');
 const clean=h.run("supplierCleanText(S.products.get('a1')).html");assert.equal(h.run("finalDescription(S.products.get('a1'))"),clean);
 assert.doesNotMatch(clean,/1500 грн|067|наявності/);assert.match(clean,/0,9 кг/);
 assert.deepEqual(J(h,"[...S.products.values()].map(p=>[p.id,p.desc,p.fieldMeta.desc])"),before.map(([id,,d,m])=>[id,d,m]),'supplier originals unchanged');
 assert.ok(J(h,"backupData('t').siteSelection.a1"),'the choice is in the backup');assert.equal(J(h,"S.cfg.siteSelection??null"),null,'not in the settings');
 assert.deepEqual(await h.click('ceSelUndo'),[]);
 assert.deepEqual(J(h,"[...S.products.values()].map(p=>[p.id,p.pub])"),before.map(([id,pub])=>[id,pub]));
 assert.equal(J(h,"S.products.get('a1').supplierClean??null"),null);assert.equal(h.run("finalDescription(S.products.get('a1'))"),wireBefore);
 assert.deepEqual(chosen(h),['a1','b1'],'the choice stays after undo');
});

test('5.5.2: a manual description or a lock keeps priority; an empty cleaned text sends no description, never the raw text',async()=>{
 const h=setup();h.run("{const p=S.products.get('a2');p.desc='<p>Ціна 1500 грн, в наявності.</p>';p.fieldMeta.desc={source:'supplier'};const m=S.products.get('b2');m.desc='<p>Мій опис</p>';m.fieldMeta.desc={source:'manual'};S.products.get('b1').manual_locks={desc:true};markProduct(p);bumpData();}");
 await h.click('ceSelAll');await h.click('ceSelPublish');
 assert.equal(h.run("finalDescription(S.products.get('a2'))"),'','no raw supplier text with a price');
 assert.equal(h.run("finalDescription(S.products.get('b2'))"),'<p>Мій опис</p>');assert.equal(J(h,"S.products.get('b1').supplierClean??null"),null,'locked: no snapshot');
});

test('5.5.2: a second publish keeps the state before the FIRST one; a failed save says «НЕ збережено», never success',async()=>{
 const h=setup();h.run("S.products.get('a3').pub=true;bumpData()");await h.click('ceSelToggle',{id:'a1'});await h.click('ceSelPublish');
 await h.click('ceSelToggle',{id:'a2'});await h.click('ceSelPublish');await h.click('ceSelUndo');
 assert.deepEqual(J(h,"[...S.products.values()].map(p=>[p.id,p.pub])").find(x=>x[0]==='a3'),['a3',true]);
 const g=setup();await g.click('ceSelToggle',{id:'a1'});g.run("Store.catalogCommit=async()=>{throw new Error('disk full')}");await g.click('ceSelPublish');
 const t=g.run("document.querySelector('#toast').textContent");assert.match(t,/НЕ збережено/);assert.doesNotMatch(t,/^Опубліковано/);
});
// Found in the browser on run11 (5.5.2): «Готовність» crashed in the classification mode — buildFeed() there returns the
// contract-v3 shape without «feed», so the selection screen (on that page) never opened with the real catalogue.
test('5.5.2: the «Готовність» page with the selection screen renders in the classification mode',()=>{
 const h=setup();h.run('S.cfg.classification_version=CLASSIFICATION_VERSION;bumpData()');
 assert.match(h.run('vLaunch()'),/Відбір для сайту/);
});
// Found in the browser on run11 (5.5.2): a click took 4–5 s — saving the choice in S.cfg bumped the data version.
test('5.5.2: a click on the choice does not recompute the catalogue; the choice is stored under its own key and validated',async()=>{
 const h=setup();h.run('selRows()');const v=h.run('_dataVer');await h.click('ceSelToggle',{id:'a1'});
 assert.equal(h.run('_dataVer'),v,'no data version bump');
 assert.deepEqual(JSON.parse(await h.run("Store.get('site/selection').then(x=>JSON.stringify(x))")),{a1:true});
 assert.deepEqual(J(h,"selClean({a1:true,'bad id!':true,b1:'yes',['__proto__']:true})"),{a1:true});
 h.run("Store.set=async()=>{throw new Error('quota')}");await h.click('ceSelToggle',{id:'b1'});
 assert.match(h.run("document.querySelector('#toast').textContent"),/НЕ збережено/);
});
