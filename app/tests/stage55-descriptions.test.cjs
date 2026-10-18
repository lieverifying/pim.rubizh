'use strict';
// Stage 5.5 (owner D-66…D-68): supplier descriptions are cleaned by FRAGMENT, not only by whole line — prices and surcharges
// (G1), stock / lead time / delivery / payment sentences (G2), another shop and calls to action (G3), contacts and links (G4),
// the supplier's name instead of the product brand (G5), structural junk (G6). Technical facts are untouchable (D-67): a
// technical sentence keeps everything but G1/G4/G5 fragments; if commercial text cannot be cut from it, the sentence stays
// and the draft gets «Комерційний текст у технічному реченні» (not applied automatically). Everything cut is visible (D-68).
// Synthetic texts only (written for the test after the patterns of the 5.4.1 rehearsal); no supplier file, no purchase price.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
function gen(desc,{brand='Forester',name='Демісезонні черевики Forester Trail F1'}={}){
 const h=createHarness();h.add(h.product({name,brand,desc,attrs:{}}));
 return h.run("(()=>{const d=ceGenerate(S.products.get('p-a'));return JSON.parse(JSON.stringify({html:d.html,removed:d.removedFragments||[],warn:d.commercialInTechnical||[],block:ceContentBlock(d),plain:plainSupplierText(d.html)}));})()");
}
const groups=d=>d.removed.map(r=>r.group);

test('G1: a size surcharge «(Батал 58-62р +50грн)» is cut; the rest of the description stays',()=>{
 const d=gen('<p>Флісова кофта для холодної погоди.</p><p>Утеплювач синтепон, тканина фліс.</p><p>(Батал 58-62р +50грн)</p>');
 assert.doesNotMatch(d.plain,/грн|Батал/);assert.match(d.plain,/Утеплювач синтепон/);assert.ok(groups(d).includes('G1'));
});
test('G1 inside a technical sentence: only the price fragment goes, the numbers with units stay (D-67 invariant)',()=>{
 const d=gen('<p>Вага комплекту 1,2 кг, об’єм 30 л — ціна 1300 грн.</p>');
 assert.match(d.plain,/1,2 кг/);assert.match(d.plain,/30 л/);assert.doesNotMatch(d.plain,/1300|грн|ціна/i);assert.ok(groups(d).includes('G1'));assert.equal(d.block,false);
});
test('G2: «під замовлення … 20 днів» and «Виріб може виготовлятись в таких кольорах… Уточнюйте у менеджера» are cut as sentences',()=>{
 const d=gen('<p>Сітка розмиває силует техніки.</p><p>У разі відсутності товару на складі термін виготовлення під замовлення становить 20 днів.</p><p>Виріб може виготовлятись в таких кольорах, як олива, койот. Уточнюйте у менеджера.</p>');
 assert.doesNotMatch(d.plain,/замовлення|20 днів|виготовлятись|менеджер/i);assert.match(d.plain,/розмиває силует/);assert.ok(groups(d).filter(g=>g==='G2').length>=2,JSON.stringify(d.removed));
});
test('G3: «у нашому магазині» and «Інтернет-магазин "Планета Спорт"» are cut as sentences',()=>{
 const d=gen('<p>Казанок і фляга для походу.</p><p>Інтернет-магазин "Планета Спорт" пропонує вашій увазі набір.</p><p>Усі комплектуючі ви можете замовити у нашому магазині.</p>');
 assert.doesNotMatch(d.plain,/магазин|Планета Спорт/i);assert.match(d.plain,/Казанок і фляга/);assert.ok(groups(d).filter(g=>g==='G3').length>=2);
});
test('G4: a prom.ua link and a phone in the middle of a sentence are cut as fragments',()=>{
 const d=gen('<p>Підошва стійка до зносу, деталі https://prom.ua/redirect?url=x на сайті.</p><p>Модель легка, 067 123 45 67, підходить для походів.</p>');
 assert.doesNotMatch(d.plain,/prom\.ua|https?:|067|123 45 67/i);assert.match(d.plain,/Підошва стійка до зносу/);assert.match(d.plain,/підходить для походів/);assert.ok(groups(d).includes('G4'));
});
test('G5: «від Кіборг» goes for a Forester product; M-WIN stays in an M-Win product',()=>{
 let d=gen('<p>Берці від Кіборг — надійне демісезонне взуття.</p>');assert.doesNotMatch(d.plain,/Кіборг/);assert.match(d.plain,/надійне демісезонне взуття/);assert.ok(groups(d).includes('G5'));
 d=gen('<p>Маскувальна сітка від M-WIN — атрибут для маскування техніки.</p>',{brand:'M-Win',name:'Маскувальна сітка M-Win Піксель 3х6 м'});assert.match(d.plain,/M-WIN/);assert.ok(!groups(d).includes('G5'));
});
test('G6: a repeated heading «Комплектація / Комплектація:» and a heading without text are removed',()=>{
 const d=gen('<p>Комплектація</p><p>Комплектація:</p><p>Ліхтарик, карабін, кабель USB-C.</p><p>Характеристики :</p>');
 assert.equal((d.plain.match(/Комплектація/g)||[]).length,1,d.plain);assert.doesNotMatch(d.plain,/Характеристики :/);assert.ok(groups(d).includes('G6'));
});
test('D-67: commercial text that cannot be cut from a technical sentence keeps the sentence and blocks auto-apply',()=>{
 const d=gen('<p>35р. - 22,5 см (під замовлення), 36р. - 23,5 см.</p>');
 assert.match(d.plain,/22,5 см/);assert.match(d.plain,/23,5 см/);assert.ok(d.warn.length>=1);assert.equal(d.block,true,'not applied automatically');
});
test('D-67 invariant: number+unit tokens survive cleaning except inside cut price fragments',()=>{
 const h=createHarness();
 const tokens=t=>(t.match(/\d[\d.,]*\s*(?:кг|г|см|мм|л|мл|м²|м2|%|°)(?![\p{L}])/giu)||[]).map(x=>x.replace(/\s+/g,''));
 const samples=['<p>Вага 0,8 кг; ширина 5 см (за 2 шт — 400 грн).</p>','<p>Об’єм 40 л, пишіть у Viber @tactic_shop.</p>','<p>Клас захисту 1 за ДСТУ 8782:2018, від Кіборг, товщина 6 мм.</p>','<p>Температура до -20°, утеплювач 150 г/м², ціна 2 500 грн, телефонуйте 0671234567.</p>'];
 for(const desc of samples){h.add(h.product({desc,brand:'Forester',attrs:{}}));const r=h.run("(()=>{const d=ceGenerate(S.products.get('p-a'));return JSON.parse(JSON.stringify({plain:plainSupplierText(d.html),removed:d.removedFragments}));})()");
  const g1=r.removed.filter(x=>x.group==='G1').map(x=>x.text).join(' ');
  for(const t of tokens(desc.replace(/<[^>]+>/g,' ')))if(!tokens(g1).includes(t))assert.ok(tokens(r.plain).includes(t),desc+' lost '+t+' → '+r.plain);
 }
});
test('D-68: every cut fragment is listed with its group and reason; the supplier original is not changed',()=>{
 const h=createHarness();const desc='<p>Рюкзак 30 л, ціна 900 грн.</p><p>Замовляйте зараз!</p>';h.add(h.product({desc,brand:'TEST',attrs:{}}));
 const r=h.run("(()=>{const p=S.products.get('p-a');const before=JSON.stringify([p.fieldMeta.desc,p.desc]);const d=ceGenerate(p);return JSON.parse(JSON.stringify({removed:d.removedFragments,same:before===JSON.stringify([p.fieldMeta.desc,p.desc]),panel:ceMetricsHtml(d)}));})()");
 assert.equal(r.same,true,'generation never touches the supplier text');assert.ok(r.removed.length>=2);for(const x of r.removed){assert.match(x.group,/^G[1-6]$/);assert.ok(x.text&&x.reason);}
 assert.match(r.panel,/Вилучено з опису постачальника/);assert.match(r.panel,/Ціни та доплати/);
});
test('the final text check finds no G1–G5 signal in a cleaned description',()=>{
 const h=createHarness();h.add(h.product({desc:'<p>Рюкзак 30 л, ціна 900 грн, від Кіборг. Пишіть у Telegram @shop, тел. 067 123 45 67.</p><p>Є в наявності, відправка за 1 день.</p>',brand:'TEST',attrs:{}}));
 const r=JSON.parse(h.run("(()=>{const d=ceGenerate(S.products.get('p-a'));return JSON.stringify(ceCommercialSignals(plainSupplierText(d.html),S.products.get('p-a')));})()"));
 assert.deepEqual(r,[]);
});
test('G2 (stage 5.5 review): «наявність знімних лямок» in a sentence is a feature, not stock — kept; a stock sentence still goes',()=>{
 const h=createHarness();h.add(h.product({name:'Куртка Forester Trail Shell утеплена',brand:'Forester',desc:'<p>Куртка має наявність знімних лямок для рюкзака.</p><p>Тканина softshell 320 г/м².</p><p>Наявність: в наявності на складі.</p>',attrs:{}}));
 const d=h.run("(()=>{const d=ceGenerate(S.products.get('p-a'));return JSON.parse(JSON.stringify({plain:plainSupplierText(d.html),removed:d.removedFragments||[]}));})()");
 assert.match(d.plain,/знімних лямок/,'a feature sentence with «наявність» stays');
 assert.doesNotMatch(d.plain,/на складі/,'the stock sentence goes');assert.ok(d.removed.some(r=>r.group==='G2'),'stock is still cut (G2)');
});
