'use strict';
// Stage 5.5.1 (owner D-81): the site description is the supplier's text after the 5.5 cleaning (G1–G6), without rewriting
// or generation, technical numbers kept (D-67); the «м’який режим» of the wave (default) keeps only the mandatory conditions
// and turns the name, brand, characteristics, completeness and similarity into warnings; «Опублікувати очищені описи
// постачальника» with a confirmation and an undo; the supplier original never changes. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const J=(h,src)=>JSON.parse(h.run('JSON.stringify('+src+')'));
const SUPPLIER='<p>Рюкзак тактичний для щоденного використання та тривалих походів у польових умовах.</p><p>Характеристики:</p>'+
 '<p>Матеріал: нейлон 600D з водовідштовхувальним просоченням; вага 0,9 кг; об’єм 30 л.</p>'+
 '<p>Має систему MOLLE на фронтальній панелі, широкі лямки та вентильовану спинку.</p><p>Характеристики:</p>'+
 '<p>Ціна 1500 грн, в наявності на складі.</p><p>Телефонуйте 067 123 45 67!</p><p>Купуйте в нашому магазині Кіборг!</p>';
function item(h,id,{brand='',name='Рюкзак '+id,cat='Рюкзаки, сумки та баули / Рюкзаки / Тактичні рюкзаки',desc=SUPPLIER,sizes=null}={}){
 const p=h.product({id,name,brand,category:cat,desc,photos:['https://img.test/'+id+'-1.webp','https://img.test/'+id+'-2.webp','https://img.test/'+id+'-3.webp'],attrs:{}});
 if(sizes)p.variants=sizes.map((size,i)=>({...structuredClone(p.variants[0]),sku:'RUB-'+id+'-'+i,size}));
 for(const v of p.variants)v.offers['supplier-a']={...v.offers['supplier-a'],cost:1000,payout:1000};h.add(p);return p;
}
const ready="launchConditionHooks.fresh=()=>true;launchConditionHooks.ready=()=>true;bumpData();";
const wave=h=>J(h,'launchWave()');

test('D-81: the cleaned supplier text drops G1–G6 and keeps every technical number of the supplier (D-67), word for word',()=>{
 const h=createHarness();item(h,'s00');
 const c=J(h,"supplierCleanText(S.products.get('s00'))");
 for(const cut of ['1500 грн','в наявності','067 123 45 67','Телефонуйте','нашому магазині','Кіборг'])assert.ok(!c.html.includes(cut),cut+' left: '+c.html);
 for(const kept of ['600D','0,9 кг','30 л','MOLLE','Рюкзак тактичний для щоденного використання'])assert.ok(c.html.includes(kept),kept+' lost: '+c.html);
 assert.equal((c.html.match(/Характеристики/g)||[]).length,1,'the repeated heading is removed');
 assert.ok(['G2','G3','G6'].every(g=>c.removed.some(r=>r.group===g)),JSON.stringify(c.removed));
 // No rewriting: every paragraph is the supplier's own text.
 const plain=h.run(`ceSourcePlain(${JSON.stringify(SUPPLIER)})`);
 for(const m of c.text.split('\n'))assert.ok(plain.includes(m),'rewritten: '+m);
 const tokens=J(h,`ceTechTokens(ceSourcePlain(${JSON.stringify(SUPPLIER)}))`),g1=J(h,`ceTechTokens(${JSON.stringify(c.removed.filter(r=>r.group==='G1').map(r=>r.text).join(' '))})`),kept=J(h,`ceTechTokens(${JSON.stringify(c.text)})`);
 assert.deepEqual(tokens.filter(t=>!kept.includes(t)&&!g1.includes(t)),[],'D-67');
 assert.ok(c.words>=20,'words '+c.words);assert.deepEqual(c.signals,[]);
});

test('D-81: the soft mode is the default; name, brand, characteristics and the 5.5 draft are warnings, not exclusions',()=>{
 const h=createHarness();item(h,'s00');h.run(ready);
 const w=wave(h);assert.equal(w.mode,'soft');assert.deepEqual(w.ids,['s00'],JSON.stringify(w.reasons));
 const warn=w.softWarnings.s00.join(' | ');for(const re of [/бренд/i,/Опис не прийнято/,/Характеристики/])assert.match(warn,re);
 h.run('S.cfg.waveSoft=false;bumpData()');const strict=wave(h);assert.equal(strict.mode,'strict');assert.deepEqual(strict.ids,[]);
 assert.ok(strict.reasons.s00.some(x=>/бренд/i.test(x))&&strict.reasons.s00.some(x=>/Опис не прийнято/.test(x)),'strict mode unchanged: '+JSON.stringify(strict.reasons.s00));
});

test('D-81: each mandatory condition of the soft mode keeps the product out with a reason',()=>{
 const breaks={
  photos:[h=>h.run("S.products.get('s00').photos=S.products.get('s00').photos.slice(0,2)"),/Фото/],
  price:[h=>h.run('S.cfg.waveMinPrice=5000'),/Ціна/],
  payable:[h=>h.run('launchConditionHooks.fresh=()=>false'),/прямою оплатою/],
  ready:[h=>h.run('launchConditionHooks.ready=()=>false'),/Не готовий/],
  never:[h=>h.run("S.products.get('s00').waveMark='never'"),/Ніколи/],
  short:[h=>h.run("{const p=S.products.get('s00');p.desc='<p>Рюкзак тактичний, вага 0,9 кг.</p>';p.fieldMeta.desc={source:'supplier'};markProduct(p);}"),/менше 20 слів/],
  empty:[h=>h.run("{const p=S.products.get('s00');p.desc='<p>Ціна 1500 грн, в наявності.</p>';p.fieldMeta.desc={source:'supplier'};markProduct(p);}"),/порожній/],
  commercialTechnical:[h=>h.run("{const p=S.products.get('s00');p.desc=p.desc+'<p>Вага 0,9 кг, доставка Новою поштою.</p>';p.fieldMeta.desc={source:'supplier'};markProduct(p);}"),/технічному реченні/],
 };
 for(const [k,[mutate,re]] of Object.entries(breaks)){const h=createHarness();item(h,'s00');h.run(ready);mutate(h);h.run('bumpData()');const r=wave(h);
  assert.deepEqual(r.ids,[],k);assert.ok((r.reasons.s00||[]).some(x=>re.test(x)),k+': '+JSON.stringify(r.reasons.s00));}
 // Sizes are mandatory for clothing and footwear only.
 const h=createHarness();item(h,'c00',{cat:'Одяг та форма / Куртки',name:'Куртка c00',sizes:['M']});item(h,'b00');h.run(ready);
 const r=wave(h);assert.deepEqual(r.ids,['b00']);assert.ok(r.reasons.c00.some(x=>/Розміри/.test(x)),JSON.stringify(r.reasons.c00));
});

test('D-81: «Опублікувати очищені описи постачальника» — confirmation, the export sends the cleaned text, the original stays, undo',async()=>{
 const h=createHarness();item(h,'s00');h.run(ready);
 const before=J(h,"[S.products.get('s00').desc,S.products.get('s00').fieldMeta.desc]"),wireBefore=h.run("finalDescription(S.products.get('s00'))");
 const clean=h.run("supplierCleanText(S.products.get('s00')).html");assert.notEqual(wireBefore,clean);
 assert.match(h.run('launchWaveBlock()'),/Опублікувати очищені описи постачальника \(1\)/);
 assert.match(h.run('launchWaveBlock()'),/data-act="ceWavePublish" disabled/,'the soft wave waits for the cleaned texts');
 await h.click('ceWavePublish');assert.equal(J(h,'S.cfg.waveLastPublish??null'),null,'wave not published without the cleaned texts');
 h.ctx.confirm=()=>false;await h.click('ceSupplierCleanPublish');assert.equal(J(h,"S.products.get('s00').supplierClean??null"),null,'cancelled');
 h.ctx.confirm=()=>true;assert.deepEqual(await h.click('ceSupplierCleanPublish'),[]);
 assert.equal(h.run("finalDescription(S.products.get('s00'))"),clean);assert.equal(h.run("cePublishedDescription(S.products.get('s00'))"),clean);
 assert.deepEqual(J(h,"[S.products.get('s00').desc,S.products.get('s00').fieldMeta.desc]"),before,'the supplier original is not changed');
 assert.equal(J(h,"backupData('t').products.find(p=>p.id==='s00').supplierClean.html"),clean,'kept in the backup');
 assert.match(h.run('launchWaveBlock()'),/опубліковано 1 з 1/);assert.deepEqual(await h.click('ceWavePublish'),[]);assert.ok(J(h,'S.cfg.waveLastPublish'));
 assert.deepEqual(await h.click('ceSupplierCleanUndo'),[]);
 assert.equal(J(h,"S.products.get('s00').supplierClean??null"),null);assert.equal(h.run("finalDescription(S.products.get('s00'))"),wireBefore);
 // A manual description keeps priority over the cleaned text.
 await h.click('ceSupplierCleanPublish');h.run("{const p=S.products.get('s00');p.desc='<p>Мій опис</p>';p.fieldMeta.desc={source:'manual'};}");
 assert.equal(h.run("finalDescription(S.products.get('s00'))"),'<p>Мій опис</p>');
});

test('D-81: the «м’який режим» switch is saved; a changed supplier text is shown as waiting for a new publication',async()=>{
 const h=createHarness();item(h,'s00');h.run(ready);await h.click('ceSupplierCleanPublish');
 h.run("{const p=S.products.get('s00');p.desc=p.desc+'<p>Додано кишеню для гідратора об’ємом 2 л та петлі для кріплення спорядження.</p>';if(p.fieldMeta.desc.supplierOriginal!=null)p.fieldMeta.desc.supplierOriginal=p.desc;if(p.fieldMeta.desc.supplierValue!=null)p.fieldMeta.desc.supplierValue=p.desc;markProduct(p);bumpData();}");
 assert.match(h.run('launchWaveBlock()'),/текст постачальника змінився після публікації: 1/);
 h.run("document.body.innerHTML=launchWaveBlock()");h.run("document.querySelector('[data-launch-soft]').checked=false");
 await h.click('ceWaveSaveCfg');assert.equal(J(h,'S.cfg.waveSoft'),false);assert.equal(wave(h).mode,'strict');
});

// Review 5.5.1 (code-reviewer HIGH): a leading minus is a sign, not a bullet — «-20 °C» must not become «20 °C» (D-67).
test('review: a negative number at the start of a line or sentence keeps its sign; real bullets are removed',()=>{
 const h=createHarness();item(h,'m00',{desc:'<p>-20 °C — мінімальна температура використання спальника у польових умовах.</p><p>• Матеріал: нейлон 600D. –5 °C комфорт.</p><p>- Капюшон з регулюванням.</p>'});
 const c=J(h,"supplierCleanText(S.products.get('m00'))");
 assert.match(c.text,/^-20 °C/m,c.text);assert.match(c.text,/–5 °C комфорт/,c.text);
 assert.match(c.text,/^Матеріал: нейлон 600D/m,'bullet removed: '+c.text);assert.match(c.text,/^Капюшон з регулюванням/m,'dash bullet removed: '+c.text);
});
// Review 5.5.1 (code-reviewer MEDIUM): undo warns about products already on the site; a manual lock keeps priority everywhere.
test('review: undo of the cleaned texts names the published products; a description lock wins in the export and the preview',async()=>{
 const h=createHarness();item(h,'s00');h.run(ready);await h.click('ceSupplierCleanPublish');await h.click('ceWavePublish');
 let asked='';h.ctx.confirm=m=>{asked=String(m);return false;};await h.click('ceSupplierCleanUndo');
 assert.match(asked,/1 з цих товарів уже опубліковано/);assert.ok(J(h,"S.products.get('s00').supplierClean"),'cancelled undo changes nothing');
 h.run("S.products.get('s00').manual_locks={desc:true};bumpData()");
 const snap=h.run("S.products.get('s00').supplierClean.html");
 assert.notEqual(h.run("finalDescription(S.products.get('s00'))"),snap);assert.notEqual(h.run("cePublishedDescription(S.products.get('s00'))"),snap);
});
// Found on run11 (D-67): a first line that repeats the product name but carries technical data is not dropped.
test('review: a line repeating the product name is dropped only when it has no technical data',()=>{
 const h=createHarness();item(h,'t00',{name:'Плити 3-го класу. Розмір 25 на 30 см.',desc:'<p>Плити 3-го класу. Розмір 25 на 30 см.</p><p>Балістичні пластини для захисту грудей і спини, товщина 23 мм.</p>'});
 item(h,'t01',{name:'Рюкзак Альфа',desc:'<p>Рюкзак Альфа</p><p>Рюкзак для походів, об’єм 30 л.</p>'});
 assert.match(J(h,"supplierCleanText(S.products.get('t00'))").text,/30 см/);
 assert.doesNotMatch(J(h,"supplierCleanText(S.products.get('t01'))").text,/^Рюкзак Альфа$/m);
});
// Found on run11 (5.5.1): specification tables are label / value lines; a short value is data, not junk or a repeat.
test('review: table values such as «440С», «G10» and a second «3 мм» stay in the cleaned text; long repeats are still removed',()=>{
 const h=createHarness();item(h,'k00',{name:'Ніж Ganzo G7211',desc:'<p>Ніж для риболовлі, полювання та туристичних походів у будь-яку погоду.</p><table><tr><td>Марка сталі</td></tr><tr><td>440С</td></tr><tr><td>Матеріал рукоятки</td></tr><tr><td>G10</td></tr><tr><td>Товщина клинка</td></tr><tr><td>3 мм</td></tr><tr><td>Товщина рукоятки</td></tr><tr><td>3 мм</td></tr></table><p>Ніж для риболовлі, полювання та туристичних походів у будь-яку погоду.</p>'});
 const t=J(h,"supplierCleanText(S.products.get('k00'))").text;
 for(const v of ['440С','G10'])assert.match(t,new RegExp('^'+v,'mu'),v+': '+t);
 assert.equal((t.match(/^3 мм/gmu)||[]).length,2,t);assert.equal((t.match(/Ніж для риболовлі/g)||[]).length,1,t);
});
test('review: the same description stored twice (supplier text and the price-list record) appears once',()=>{
 const h=createHarness();const desc='<p>Рюкзак для походів і щоденного використання у місті та в полі.</p><p>Вага</p><p>0,9 кг</p>';item(h,'d00',{desc});
 h.run(`S.content.set('k1',{k:'k1',originalDesc:${JSON.stringify(desc)}});S.products.get('d00').contentSourceKeys=['k1'];markProduct(S.products.get('d00'))`);
 const t=J(h,"supplierCleanText(S.products.get('d00'))").text;assert.equal((t.match(/0,9 кг/g)||[]).length,1,t);
});
test('review: a block stored again for every SKU appears once, short lines included',()=>{
 const h=createHarness();const block='<p>Куртка для холодної погоди з утеплювачем і капюшоном.</p><p>застібка на двох кнопках</p><p>Вага</p><p>0,9 кг</p>';
 item(h,'r00',{name:'Куртка r00',desc:block+block+block});
 const t=J(h,"supplierCleanText(S.products.get('r00'))").text;
 for(const v of ['застібка на двох кнопках','0,9 кг','Куртка для холодної погоди'])assert.equal(t.split(v).length-1,1,v+': '+t);
});
