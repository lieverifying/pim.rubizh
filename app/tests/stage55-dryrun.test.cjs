'use strict';
// Stage 5.5 (owner D-77, closes S52-03): a new supplier's goods reach the wave only after a clean dry run and the owner's
// «Постачальника перевірено». The dry run checks the YML currency (not UAH or missing → error, import blocked), ambiguous
// numbers «1.250» / «1,250» (error, such prices are not accepted), Excel date serials (1900 and 1904 systems), photos (> 15 →
// first 15 with a warning; «//» → https:), a repeated SKU with the same size and colour (conflict, no overwrite), the median
// price against the current catalogue (> 3× → «Перевірте одиниці/валюту»), the share of rows without photo, brand, size or
// description, and the data time of rule 5.1. Synthetic data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const J=(h,src)=>JSON.parse(h.run('JSON.stringify('+src+')'));
const HDR=['Артикул','Название','Цена','Бренд','Размер','Цвет','Фото','Описание'];
const MAP={sku:0,name:1,cost:2,brand:3,size:4,color:5,photos:6,desc:7};
function run(h,rows,extra={}){h.ctx.__rows=[HDR,...rows];h.ctx.__extra=extra;return J(h,"supplierDryRun({rows:Object.assign(__rows,__extra.rowsProps||{}),hdr:0,map:"+JSON.stringify(MAP)+",xml:!!__extra.xml,wb:__extra.wb||null,source_time:__extra.source_time||null})");}
const row=(sku,price,{size='M',color='Олива',photos='https://img.test/a.webp',brand='Fixture',desc='Опис.'}={})=>[sku,'Куртка '+sku,price,brand,size,color,photos,desc];

test('D-77: YML currency not UAH or not given → error; UAH passes',()=>{
 const h=createHarness();
 let r=run(h,[row('A1','1000')],{xml:true,rowsProps:{ymlCurrency:{declared:['USD'],offers:{USD:1}}}});assert.ok(r.errors.some(e=>/Валюта/.test(e)),JSON.stringify(r.errors));assert.equal(r.blocked,true);
 r=run(h,[row('A1','1000')],{xml:true,rowsProps:{ymlCurrency:{declared:[],offers:{'':1}}}});assert.ok(r.errors.some(e=>/Валюта/.test(e)));
 r=run(h,[row('A1','1000')],{xml:true,rowsProps:{ymlCurrency:{declared:['UAH'],offers:{UAH:1}}}});assert.ok(!r.errors.some(e=>/Валюта/.test(e)));
 const yml='<?xml version="1.0"?><yml_catalog date="2026-10-17 10:00"><shop><currencies><currency id="USD" rate="1"/></currencies><categories><category id="1">Куртки</category></categories><offers><offer id="1" available="true"><name>Куртка</name><price>10</price><currencyId>USD</currencyId><categoryId>1</categoryId></offer></offers></shop></yml_catalog>';
 h.ctx.DOMParser=require('./isolated-harness.cjs').appRequire('linkedom').DOMParser;h.ctx.__yml=yml;assert.deepEqual(J(h,'parseYml(__yml).rows.ymlCurrency'),{declared:['USD'],offers:{USD:1}});
});
test('D-77: ambiguous «1.250» / «1,250» → error with the rows; such a price is not accepted by the import',()=>{
 const h=createHarness();const r=run(h,[row('A1','1.250'),row('A2','1,250'),row('A3','1250'),row('A4','12.50')]);
 const e=r.errors.find(x=>/Неоднозначн/.test(x));assert.ok(e,JSON.stringify(r.errors));assert.match(e,/1\.250/);assert.match(e,/рядок 2/);assert.match(e,/рядок 3/);assert.doesNotMatch(e,/рядок 4|рядок 5/);
 assert.equal(h.run("importPrice('1.250')"),null);assert.equal(h.run("importPrice('1,250')"),null);assert.equal(h.run("importPrice('1250')"),1250);assert.equal(h.run("importPrice('12.50')"),12.5);assert.equal(h.run("importPrice(1250)"),1250);
});
test('D-77: Excel date serials — 1900 and 1904 systems',()=>{
 const h=createHarness();const kyiv=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv',dateStyle:'short',timeStyle:'short'}).format(new Date(ms));
 assert.equal(kyiv(h.run('xlsxSerialToMs(46312.5,false)')),'2026-10-17 12:00');
 assert.equal(kyiv(h.run('xlsxSerialToMs(44850.5,true)')),'2026-10-17 12:00');
 h.run("S.imp={wb:{Workbook:{WBProps:{date1904:false}}}}");assert.equal(kyiv(h.run('classificationSourceTimestamp(46312.5)')),'2026-10-17 12:00','the import reads a serial as a date, not as 1970');
 h.run("S.imp={wb:{Workbook:{WBProps:{date1904:true}}}}");assert.equal(kyiv(h.run('classificationSourceTimestamp(44850.5)')),'2026-10-17 12:00');
 assert.equal(h.run('classificationSourceTimestamp(1792000000000)'),1792000000000,'epoch milliseconds unchanged');
});
test('D-77: photos — more than 15 → the first 15 with a warning; «//» → https:',()=>{
 const h=createHarness();const many=Array.from({length:17},(_,i)=>'https://img.test/'+i+'.webp').join(' ');
 const r=run(h,[row('A1','1000',{photos:many}),row('A2','1000',{photos:'//img.test/x.webp'})]);
 assert.ok(r.warnings.some(w=>/15/.test(w)),JSON.stringify(r.warnings));
 h.ctx.__r=row('A2','1000',{photos:'//img.test/x.webp'});assert.deepEqual(J(h,'extract(__r,'+JSON.stringify(MAP)+').photos'),['https://img.test/x.webp']);
});
test('D-77: the same SKU with the same size and colour twice → conflict error (no overwrite)',()=>{
 const h=createHarness();const r=run(h,[row('A1','1000'),row('A1','1100'),row('A1','1000',{size:'L'})]);
 assert.ok(r.errors.some(e=>/Конфлікт/.test(e)&&/A1/.test(e)),JSON.stringify(r.errors));
});
test('D-77: median price 3× off the current catalogue → «Перевірте одиниці/валюту»; shares table; data time; verify',()=>{
 const h=createHarness();h.add(h.product({id:'p-x'}));
 const r=run(h,[row('A1','40'),row('A2','45',{photos:'',brand:'',size:'',desc:''}),row('A3','50')],{source_time:{at:Date.now()-2*3600000,provenance:'FILE_HEADER'}});
 assert.ok(r.warnings.some(w=>/Перевірте одиниці\/валюту/.test(w)),JSON.stringify(r.warnings));
 assert.deepEqual(r.shares,{rows:3,no_photo:1,no_brand:1,no_size:1,no_description:1});assert.match(r.data_time,/FILE_HEADER/);
 h.run("S.cfg.suppliers.push({id:'s-new',name:'New',priority:0,needsDryRun:true})");
 assert.equal(h.run("supplierDryRunVerify('s-new',{errors:['x']}).ok"),false);
 assert.equal(h.run("supplierDryRunVerify('s-new',{errors:[]}).ok"),true);assert.equal(h.run("S.cfg.suppliers.find(s=>s.id==='s-new').needsDryRun"),false);
});
