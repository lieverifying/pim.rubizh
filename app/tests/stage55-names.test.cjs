'use strict';
// Stage 5.5 (owner D-75): literate product names as a DRAFT with history and undo (like descriptions): the supplier code
// (unless it is part of the model), «НОВИНКА», «ХІТ», «АКЦІЯ», «!!!», emoji and repeated words go; CAPS become normal case
// except abbreviations (MOLLE, YKK, ЗСУ, НАТО, ДСТУ, STANAG …) and the brand, written as p.brand; spaces collapse; price,
// contact and supplier-name fragments are cut (D-66). 20–120 characters. A name without brand or product type is not changed
// automatically. The supplier's name is kept and shown. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const J=(h,src)=>JSON.parse(h.run('JSON.stringify('+src+')'));
function draft(name,{brand='M-Tac',category='Одяг та форма / Куртки',code='FX-123'}={}){
 const h=createHarness();const p=h.product({id:'p-n',name,brand,category});p.variants[0].offers['supplier-a'].s=code;h.add(p);
 return {h,d:J(h,"nameDraft(S.products.get('p-n'))")};
}

test('D-75: promo words, emoji, «!!!», the supplier code and repeats go; CAPS to normal case; brand as p.brand',()=>{
 const {d}=draft('НОВИНКА!!! КУРТКА ТАКТИЧНА тактична M-TAC SOFT SHELL мультикам FX-123 🔥');
 assert.equal(d.name,'Куртка тактична M-Tac Soft Shell мультикам');assert.deepEqual(d.reasons,[]);
 assert.ok(d.changes.length>=4,JSON.stringify(d.changes));
});
test('D-75: abbreviations and model codes stay as written',()=>{
 const {d}=draft('ПЛИТОНОСКА M-TAC CUIRASS FAST QRS GEN.II МУЛЬТИКАМ ЗСУ MOLLE',{category:'Бронезахист / Плитоноски'});
 assert.equal(d.name,'Плитоноска M-Tac Cuirass FAST QRS GEN.II мультикам ЗСУ MOLLE');
});
test('D-75: a price fragment and the supplier name instead of the brand are cut (D-66 in names)',()=>{
 let {d}=draft('Маскувальна сітка M-Win Піксель індивідуального розміру (ціна за 1 кв.м.)',{brand:'M-Win',category:'Маскування / Маскувальні сітки'});
 assert.equal(d.name,'Маскувальна сітка M-Win Піксель індивідуального розміру');
 ({d}=draft('Балістичний пакет для напашника Kiborg 29*29*15 Militex (2 клас захисту)',{brand:'Militex',category:'Бронезахист / Балістичні пакети'}));
 assert.doesNotMatch(d.name,/Kiborg/);assert.match(d.name,/Militex/);assert.match(d.name,/29\*29\*15/);
});
test('D-75: no brand or no product type → not changed automatically, with a reason; length 20–120',()=>{
 let {d}=draft('ТОВАР ДЛЯ ВСІХ ЛЮДЕЙ СУПЕР',{brand:'',category:'Одяг та форма / Куртки'});
 assert.deepEqual(d.reasons,['Назва: немає типу товару/бренду']);assert.equal(d.apply,false);
 ({d}=draft('Куртка M-Tac',{}));assert.ok(d.reasons.some(r=>/довжина/.test(r)),JSON.stringify(d.reasons));
});
test('D-75: apply keeps history and the supplier original; undo restores; a manual name is never touched',()=>{
 const {h}=draft('КУРТКА ТАКТИЧНА M-TAC SOFT SHELL мультикам FX-123');
 const r=J(h,"nameApply(S.products.get('p-n'))");assert.equal(r.ok,true);
 assert.equal(h.run("S.products.get('p-n').name"),'Куртка тактична M-Tac Soft Shell мультикам');
 assert.equal(h.run("S.products.get('p-n').fieldMeta.name.supplierOriginal"),'КУРТКА ТАКТИЧНА M-TAC SOFT SHELL мультикам FX-123');
 assert.equal(J(h,"nameUndo(S.products.get('p-n')).ok"),true);assert.equal(h.run("S.products.get('p-n').name"),'КУРТКА ТАКТИЧНА M-TAC SOFT SHELL мультикам FX-123');
 h.run("S.products.get('p-n').fieldMeta.name.source='manual'");assert.equal(J(h,"nameApply(S.products.get('p-n')).ok"),false);
 assert.match(h.run("nameDraftPanel(S.products.get('p-n'))"),/Назва постачальника/);
});
