'use strict';
// Stage 5.5 (owner D-69, D-70): a cleaned draft is applied automatically only when all five hold — no remarks after cleaning
// (ceContentBlock), completeness ≥ 60, similarity < 85 % (ceChoose rule unchanged), not a manual description, and no G1–G5
// signal in the final text. Everything else waits in «Потребують рішення» by reason. A format-only difference of one value
// («1,2 кг» / «1.2кг») is not a contradiction. The setting is on for a new installation only. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const J=(h,src)=>JSON.parse(h.run('JSON.stringify('+src+')'));

test('D-70: a format-only difference of one value is not a contradiction; a different value is',()=>{
 const conflicts=(a,b)=>{const h=createHarness();h.add(h.product({attrs:{Вага:a},desc:'<p>Рюкзак для походів.</p>',contentSourceKeys:['supplier-a|A-1']}));
  h.run(`S.content.set('supplier-a|A-1',{key:'supplier-a|A-1',a:{Вага:${JSON.stringify(b)}},originalDesc:''})`);return J(h,"ceGenerate(S.products.get('p-a')).conflicts.length");};
 assert.equal(conflicts('1,2 кг','1.2кг'),0,'«1,2 кг» = «1.2кг»');
 assert.equal(conflicts('1,2 кг','1,4 кг'),1,'«1,2 кг» ≠ «1,4 кг»');
 assert.equal(conflicts('30x40 см','30×40 cm'),0,'x / × and см / cm');
 assert.equal(conflicts('Олива','олива '),0,'case and spaces');
});

test('D-69: the five conditions, each one alone stops automatic application',()=>{
 const h=createHarness();h.add(h.product({desc:'<p>Рюкзак 30 л. Матеріал: нейлон.</p>'}));
 const ok={html:'<p>Рюкзак 30 л</p>',quality:72,similarity:{pct:40},conflicts:[],languageWarnings:[],sourceCoverage:1,attributeCoverage:1,commercialInTechnical:[]};
 const reasons=(draft,manual=false)=>J(h,`(()=>{const p=S.products.get('p-a');p.fieldMeta.desc.source=${manual?"'manual'":"'supplier'"};return ceAutoApplyReasons(p,${JSON.stringify(draft)});})()`);
 assert.deepEqual(reasons(ok),[]);
 assert.deepEqual(reasons({...ok,conflicts:[{key:'weight'}]}),['block']);
 assert.deepEqual(reasons({...ok,quality:59}),['quality']);
 assert.deepEqual(reasons({...ok,similarity:{pct:85}}),['similar']);
 assert.deepEqual(reasons(ok,true),['manual']);
 assert.deepEqual(reasons({...ok,html:'<p>Рюкзак 30 л, ціна 900 грн</p>'}),['commercial'],'condition 5 re-checks the final text');
});

test('D-70: «Потребують рішення» groups drafts by the first reason',()=>{
 const h=createHarness();h.add(h.product({desc:'<p>Рюкзак.</p>'}));
 const need=d=>J(h,`ceNeedReason(S.products.get('p-a'),${JSON.stringify({html:'<p>x</p>',quality:72,similarity:{pct:10},conflicts:[],languageWarnings:[],commercialInTechnical:[],sourceCoverage:1,attributeCoverage:1,...d})})`);
 assert.equal(need({conflicts:[{key:'w'}]}),'conflict');assert.equal(need({languageWarnings:[{label:'x'}]}),'language');
 assert.equal(need({commercialInTechnical:['x']}),'commercial');assert.equal(need({quality:50}),'quality');assert.equal(need({similarity:{pct:90}}),'similar');
 assert.equal(need({}),null,'a clean draft is not waiting');
 assert.deepEqual(Object.values(J(h,'CE_NEED_LABELS')),['Суперечність даних','Неперекладене речення','Комерційний текст у технічному реченні','Мало даних (повнота < 60)','Схожий на інший товар']);
});

test('D-69: «Застосувати всі чисті описи» applies only clean drafts after confirmation and is undone with ceUndo',async()=>{
 const h=createHarness({runtime:true});h.run('render=()=>{}');await h.run('Store.init()');
 h.add(h.product({id:'p-a',name:'Рюкзак тактичний Fixture Alpha 30',desc:'<p>Рюкзак об’ємом 30 л для щоденного використання та походів.</p><p>Матеріал: нейлон 600D.</p><p>Вага: 0,9 кг.</p><p>Розміри: 50х30х20 см.</p>',attrs:{Матеріал:'Нейлон 600D','Об’єм':'30 л',Вага:'0,9 кг',Розміри:'50х30х20 см',Застібка:'Блискавка YKK','Система кріплення':'MOLLE'}}));
 h.add(h.product({id:'p-b',name:'Рюкзак тактичний Fixture Beta 40',desc:'<p>Рюкзак 40 л, ціна 900 грн.</p><p>35р. - 22,5 см (під замовлення).</p>',attrs:{}}));
 h.add(h.product({id:'p-m',name:'Рюкзак ручний Fixture Gamma',desc:'<p>Ручний опис.</p>',attrs:{}}));h.run("S.products.get('p-m').fieldMeta.desc.source='manual'");
 const before=J(h,"[...S.products.values()].map(p=>[p.id,p.desc])");
 h.run('S.view="contentEngine"');const errors=await h.click('ceApplyClean');assert.deepEqual(errors,[]);
 const after=J(h,"[...S.products.values()].map(p=>[p.id,ceAccepted(p)])");
 const accepted=Object.fromEntries(after);assert.equal(accepted['p-a'],true,'the clean one');assert.equal(accepted['p-b'],false,'commercial text in a technical sentence waits');assert.equal(accepted['p-m'],false,'manual stays');
 assert.deepEqual(J(h,'S.cfg.ceLastClean.ids'),['p-a']);
 assert.deepEqual(await h.click('ceUndoClean'),[]);
 assert.deepEqual(J(h,"[...S.products.values()].map(p=>[p.id,p.desc])"),before,'undo restores every description');
});

test('D-69: the setting is called «Автоматично застосовувати чисті описи», lists the five conditions and is on for a new installation only',()=>{
 const h=createHarness();
 const view=h.run('vSettings()');assert.match(view,/Автоматично застосовувати чисті описи/);for(const t of ['немає зауважень','повнота','85','ручн','ціни, наявність'])assert.match(view,new RegExp(t,'i'),t);
 assert.equal(h.run('cfgForInstall(null).contentAutoApply'),true,'new installation');
 assert.equal(h.run('cfgForInstall({minMargin:30}).contentAutoApply===true'),false,'an existing installation is not switched on');
 assert.equal(h.run('cfgForInstall({contentAutoApply:true}).contentAutoApply'),true);
});
