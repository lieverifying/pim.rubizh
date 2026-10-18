'use strict';
// Stage 5.5.1 (owner D-81): the site description is the supplier's text after the 5.5 cleaning (G1–G6), without rewriting
// or generation, technical numbers kept (D-67). (The 5.5.1 wave modes were removed in 5.5.2; publication: stage552-site-select.)
// Synthetic data only.
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

test('review: a negative number at the start of a line or sentence keeps its sign; real bullets are removed',()=>{
 const h=createHarness();item(h,'m00',{desc:'<p>-20 °C — мінімальна температура використання спальника у польових умовах.</p><p>• Матеріал: нейлон 600D. –5 °C комфорт.</p><p>- Капюшон з регулюванням.</p>'});
 const c=J(h,"supplierCleanText(S.products.get('m00'))");
 assert.match(c.text,/^-20 °C/m,c.text);assert.match(c.text,/–5 °C комфорт/,c.text);
 assert.match(c.text,/^Матеріал: нейлон 600D/m,'bullet removed: '+c.text);assert.match(c.text,/^Капюшон з регулюванням/m,'dash bullet removed: '+c.text);
});

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
