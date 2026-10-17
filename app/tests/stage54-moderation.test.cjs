'use strict';
// Stage 5.4 (owner decisions on the 5.2 rehearsal, 2026-10-17). Synthetic fixtures only: invented supplier rows, names
// and articles; no supplier file, fragment or purchase price.
const test=require('node:test'),assert=require('node:assert/strict');
const XLSX=require('../vendor/xlsx-0.20.3.min.js');
const {createHarness,appRequire}=require('./isolated-harness.cjs');
const H=3600000,D=24*H;
function kyiv(ms){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;}
function yml(date){
 return `<?xml version="1.0" encoding="UTF-8"?><yml_catalog date="${date}"><shop><categories><category id="1">Рюкзаки</category></categories><offers>`+
  `<offer id="A-1" available="true"><vendorCode>A-1</vendorCode><name>Рюкзак Fixture Pack 30</name><price>1000</price><stock>3</stock><categoryId>1</categoryId>`+
  `<picture>https://rubizh.shop/media/fixture/a.webp</picture><description>Рюкзак 30 л. Матеріал: нейлон.</description></offer></offers></shop></yml_catalog>`;
}
async function harness(){const h=createHarness({runtime:true});h.ctx.XLSX=XLSX;h.ctx.DOMParser=appRequire('linkedom').DOMParser;h.run('render=()=>{};classificationEnable();');await h.run('Store.init()');return h;}
async function importFile(h,bytes,name,download){
 h.ctx.download={blob:new Blob([bytes]),url:'https://import.invalid/'+name,...download};
 const parsed=await h.run('workflowParseSource(download,S.cfg.suppliers[0])');h.ctx.parsed=parsed;
 h.run('S.imp={sup:"supplier-a",file:parsed.file,rows:parsed.rows,hdr:parsed.hdr,sheet:parsed.sheet,sheets:parsed.sheets,wb:parsed.wb||null,zero:false,xml:parsed.sheet==="XML",source_time:parsed.source_time};remap()');
 await h.run('doImport()');assert.equal(await h.run('applyImport()'),true,'import applied');return parsed;
}
function offer(h){return JSON.parse(h.run(`JSON.stringify((()=>{for(const p of S.products.values())for(const v of p.variants)if(v.offers?.["supplier-a"]?.s==="A-1")return {...v.offers["supplier-a"],_p:p.id};for(const it of S.queue.values())if(it.s==="A-1")return {...it,_queue:true};return null;})())`));}
const cls=(h,o)=>h.run('(()=>{const p=S.products.get('+JSON.stringify(o._p||'')+');const v=p&&p.variants.find(x=>x.offers&&x.offers["supplier-a"]);return p?classificationFreshnessClass(p,v,{sid:"supplier-a",...v.offers["supplier-a"]}):classificationFreshnessClass({variants:[]},{},'+JSON.stringify({...o,sid:'supplier-a'})+');})()');

// ── Owner decision M-WIN: the date inside the file is ignored for this supplier only; data time = the download date. ──
test('M-WIN decision: a supplier set to ignore the date inside the file gets the download time, with the owner note',async()=>{
 const now=Date.now();
 // Default supplier: the stale header still decides (stage 5.2 rule unchanged for everyone else).
 let h=await harness();await importFile(h,yml(kyiv(now-190*D)),'feed.xml',{lastModified:now-2*H});
 let o=offer(h);assert.equal(o.source_time_provenance,'FILE_HEADER');assert.equal(cls(h,o),'hidden');
 // The owner's supplier setting: the file saved 2 h ago (the download) is the data time; the header is ignored.
 h=await harness();h.run('S.cfg.suppliers[0].source_time_ignore_header=true');
 const parsed=await importFile(h,yml(kyiv(now-190*D)),'feed.xml',{lastModified:now-2*H});
 o=offer(h);assert.equal(o.source_time_provenance,'FILE_MTIME');assert.equal(o.source_generated_at,now-2*H);assert.equal(cls(h,o),'fresh');
 assert.equal(parsed.source_time.header_ignored,true);
 const note=h.run('sourceFileTimeNote(S.imp?.source_time||'+JSON.stringify(parsed.source_time)+')');
 assert.match(note,/дата всередині файлу ігнорується за рішенням власника/);
 // A fetched feed: the moment of the download, not the server's Last-Modified or the header.
 h=await harness();h.run('S.cfg.suppliers[0].source_time_ignore_header=true');
 await importFile(h,yml(kyiv(now-190*D)),'feed.xml',{lastModified:now-30*D,lastModifiedSource:'HTTP',fetchedAt:now-H});
 o=offer(h);assert.equal(o.source_generated_at,now-H);assert.equal(cls(h,o),'fresh');
 // No download time at all: no data time (manager only), never the import moment.
 h=await harness();h.run('S.cfg.suppliers[0].source_time_ignore_header=true');
 await importFile(h,yml(kyiv(now-190*D)),'feed.xml',{lastModified:null});
 o=offer(h);assert.equal(o.source_time_provenance,'NONE');assert.equal(cls(h,o),'confirm');
});
test('M-WIN decision: the supplier setting is saved from the source panel and survives the portable backup',async()=>{
 const h=await harness();h.run('S.cfg.suppliers[0].source_time_ignore_header=true');
 assert.match(h.run('workflowSourcePanel(S.cfg.suppliers[0])'),/data-source-ignore-header="supplier-a"[^>]*checked/);
 assert.equal(h.run('sanitizePortableConfig(S.cfg).suppliers[0].source_time_ignore_header'),true);
 // Turning it off restores the stage 5.2 rule.
 h.run('S.cfg.suppliers[0].source_time_ignore_header=false');
 const t=JSON.parse(h.run('JSON.stringify(sourceTimeForSupplier(sourceFileTime({header:"2026-04-08 14:45",mtime:Date.now()-3600000}),S.cfg.suppliers[0]))'));
 assert.equal(t.provenance,'FILE_HEADER');assert.equal(t.header_ignored,undefined);
});

// ── Task 1: model grouping auto-rule «colour slices». A supplier exports each colour of one model as its own card. ──
// Synthetic, anonymised shape of the rehearsal cases (invented names, articles and texts).
const BODY='Тактична куртка з мембраною, капюшоном і чотирма кишенями. Матеріал: софтшел 320 г/м2, підкладка фліс. Манжети на липучках, вентиляція під пахвами. Підходить для холодної погоди і тривалих виходів. ';
function slices({colors=['Койот','Мультикам','Олива'],codes=true,name='Куртка Fixture Windproof Softshell',desc=c=>BODY.repeat(2)+'Колір: '+c+'.',rcat=()=>'Куртки',sizes=['M','L'],attrs=()=>({Матеріал:'Софтшел'})}={}){
 const h=createHarness();h.run('S.cfg.category_engine={version:1,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;');
 colors.forEach((color,i)=>{const p=h.product({id:'p-'+i,name,brand:'',canonical_category_id:'clothing_jackets',last_confirmed_category_id:'clothing_jackets',primary_product_type:'clothing',created:i+1,photos:['https://images.test/'+i+'.jpg'],desc:'<p>'+desc(color,i)+'</p>',attrs:attrs(color,i)});
  p.variants=sizes.map((size,j)=>({sku:'RUB-'+i+'-'+j,color,size,offers:{'supplier-a':{s:'FX-'+i+'-'+size,source_name:name,source_model:codes?String(1000+i):null,supplier_category_raw:rcat(color,i),cost:1000,payout:1000,stock:2,availability:'in',at:Date.now(),photos:p.photos}}}));h.add(p);});
 return h;
}
const plan=h=>h.run('JSON.parse(JSON.stringify(mcPlan()))');
test('grouping rule: colour cards with one supplier code each and the same texts except colour words join automatically',()=>{
 const h=slices();const p=plan(h);assert.equal(p.automatic.length,1);assert.equal(p.automatic[0].rule,'colour-slices-supplier-codes');assert.equal(p.review.length,0);
 h.run('mcMigrate()');assert.equal(h.run('[...S.products.values()].filter(p=>!p.archived).length'),1);
 const m=JSON.parse(h.run('JSON.stringify([...S.products.values()].find(p=>!p.archived))'));assert.equal(m.variants.length,6);assert.equal(m.model_merge_rule,'colour-slices-supplier-codes');
 // The colour in the supplier category («Сітки Койот» / «Сітки Олива») is a colour word too.
 assert.equal(plan(slices({rcat:c=>'Сітки '+c})).automatic.length,1);
});
test('grouping rule: a supplier without codes joins only under a specific model name (3+ words with a proper name)',()=>{
 let h=slices({codes:false,name:'Черевики тактичні літні Фікстура'});let p=plan(h);assert.equal(p.automatic.length,1);assert.equal(p.automatic[0].rule,'colour-slices-specific-name');
 h=slices({codes:false,name:'Сумка тактична через плече'});assert.equal(plan(h).automatic.length,0,'no proper name: an owner question');assert.equal(plan(h).review.length,1);
 h=slices({codes:false,name:'Футболка Kiborg'});assert.equal(plan(h).automatic.length,0,'a short generic name never joins');
});
test('grouping rule: cards that must NOT be joined stay an owner question',()=>{
 // 0. a colourless card, an empty supplier category, a brand that is the only proper name
 {const h=slices();h.run('S.products.get("p-1").variants.forEach(v=>v.color="");markProduct(S.products.get("p-1"))');assert.ok(plan(h).automatic.every(g=>g.rule!=='colour-slices-supplier-codes'),'a colourless card is not a colour slice');}
 assert.equal(plan(slices({rcat:()=>''})).automatic.length,0,'no supplier category: no evidence');
 {const h=slices({codes:false,name:'Футболка тактична Kiborg'});h.run('for(const p of S.products.values()){p.brand="Kiborg";markProduct(p);}');assert.equal(plan(h).automatic.length,0,'the brand is not a model name');}
 // 1. a non-colour word differs in the description (material) — different products with a shared template
 assert.equal(plan(slices({desc:(c,i)=>BODY.repeat(2)+(i===1?'Склад: поліестер 100%.':'Склад: бавовна 100%.')})).automatic.length,0);
 // 2. a protection class / size word in the description differs
 assert.equal(plan(slices({desc:(c,i)=>BODY.repeat(2)+'Клас захисту '+(i+1)+'.'})).automatic.length,0);
 // 3. supplier category differs beyond colour
 assert.equal(plan(slices({rcat:(c,i)=>i?'Куртки зимові':'Куртки літні'})).automatic.length,0);
 // 4. a card holds two colours (not a colour slice)
 const h=slices();h.run('S.products.get("p-1").variants[1].color="Чорний";markProduct(S.products.get("p-1"))');assert.equal(plan(h).automatic.length,0);
 // 5. a short description is not evidence
 assert.equal(plan(slices({desc:c=>'Куртка. Колір: '+c+'.'})).automatic.length,0);
 // 6. two cards share one supplier code, a third has another: the colour-slice rule does not apply
 const g=slices();g.run('for(const v of S.products.get("p-2").variants)v.offers["supplier-a"].source_model="1000";markProduct(S.products.get("p-2"))');const pg=plan(g);
 assert.ok(pg.automatic.every(x=>x.rule==='supplier-model-code'&&!x.ids.includes('p-1')),'only the shared-code pair (existing rule), never the third card');
 // 7. per-m² cards (made-to-measure) never join
 assert.equal(plan(slices({name:'Маскувальна сітка Fixture індивідуального розміру'})).automatic.length,0);
 // 8. the same colour twice (shared cells) — the existing blocker
 assert.equal(plan(slices({colors:['Койот','Койот','Олива']})).automatic.length,0);
 // 9. different attributes (the existing blocker)
 assert.equal(plan(slices({attrs:(c,i)=>({Матеріал:i?'Нейлон':'Софтшел'})})).automatic.length,0);
});
test('grouping rule: colour words are whole word forms — «синтетика», «більше», «зимова» are not colours',()=>{
 const h=slices();const same=(a,b,stems=[])=>h.run('mcSameExceptColours('+JSON.stringify(a)+','+JSON.stringify(b)+','+JSON.stringify(stems)+')');
 assert.equal(same('Колір чорний','Колір олива'),true);assert.equal(same('Матеріал синтетика','Матеріал бавовна'),false);
 assert.equal(same('більше кишень','менше кишень'),false);assert.equal(same('куртка зимова','куртка літня'),false);
 const own=['зимовий','мультикам','хижак'];assert.equal(same('камуфляж зимовий мультикам','камуфляж хижак',own),true,'the cards\' own camouflage names');
 assert.equal(same('колір мультикамний','колір хижак',own),true,'an inflection of an own colour name');
 assert.equal(same('мультифункціональний ремінь','ремінь',own),false,'a word merely starting like a colour is not a colour');
 assert.equal(same('світловідбивні вставки','вставки',['світло','сірий']),false);assert.equal(same('reduced weight','weight',['red']),false);
});

// ── Task 2: UKR-TEC sizes from the description / characteristics (synthetic texts in the supplier's style). ──
const Sizes=require('../lib/size-evidence.js');
const opts=(text,type)=>{const r=Sizes.resolve({type,required:true,variant:{},product:{name:'Fixture',description:text,variants:[{}]},offers:[]});return {status:r.status,sku:r.sku_status,tier:r.confidence,sizes:r.confidence==='SAFE_AUTO'&&r.allowed_sizes?[r.allowed_sizes.join(',')]:[]};};
test('sizes from the description: the «р»/«рр» suffix ends the list, never cuts the range to its first size',()=>{
 assert.deepEqual(opts('Розміри: 44-60р','jacket').sizes,['44,46,48,50,52,54,56,58,60']);
 assert.deepEqual(opts('Розміри: 42-60рр. Колір: олива.','pants').sizes,['42,44,46,48,50,52,54,56,58,60']);
 assert.deepEqual(opts('Розміри: 40-46рр','boots').sizes,['40,41,42,43,44,45,46']);
 assert.deepEqual(opts('Розміри: 47,48,49р','shoes').sizes,['47,48,49']);
 // unchanged: a plain range, a letter range, a dimension (not a body size)
 assert.deepEqual(opts('Розміри: 46-58','clothing').sizes,['46,48,50,52,54,56,58']);assert.deepEqual(opts('Розміри - S-4XL','fleece').sizes,['S,M,L,XL,XXL,XXXL,4XL']);
 assert.deepEqual(opts('Розміри сумки: 28х20х12 см','clothing').sizes,[]);
});
test('sizes from the description: a «Розмірна сітка» table of this model gives its sizes; a generic production table does not',()=>{
 const table='Розмірна сітка: \n\n 40р. - 26 см.\n\n41р. - 27 см.\n\n42р. - 27,5 см.\n\n43р. - 28 см.\n\n44р. - 28,5 см.\n\n45р. - 29 см.\n\n46р. - 30 см. \n';
 let r=opts('Черевики з натуральної шкіри.\n\n'+table,'boots');assert.deepEqual(r.sizes,['40,41,42,43,44,45,46']);assert.equal(r.tier,'SAFE_AUTO');assert.equal(r.sku,'SIZE_CONFIRMATION_REQUIRED','a size of the model, confirmed by the manager per order');
 assert.deepEqual(opts('Розмірна сітка на все взуття нашого виробництва: \n36р. - 23 см.\n37р. - 24 см.\n38р. - 24,5 см.\n39р. - 25 см.','boots').sizes,[],'a generic table is not this model\'s sizes');
 assert.deepEqual(opts('Розмірна сітка: 40р. - 26 см.','boots').sizes,[],'one row is not a size table');
 assert.deepEqual(opts('Розмірна сітка: 46р. - 26 см. 41р. - 27 см. 44р. - 28 см.','boots').sizes,[],'unordered rows are not a size table');
 assert.equal(opts('Тактичні штани. Матеріал: ріп-стоп.','pants').tier,'AMBIGUOUS','no sizes in the text');
 // An explicit «Розміри: 36-46» wins over the maker's size table 35–46 (the table only explains lengths).
 r=opts('Розміри 36-46. '+table.replace('40р. - 26','35р. - 22,5 см.\n36р. - 23,5 см.\n37р. - 24,5 см.\n38р. - 25 см.\n39р. - 25,5 см.\n40р. - 26'),'shoes');assert.equal(r.tier,'SAFE_AUTO');assert.deepEqual(r.sizes,['36,37,38,39,40,41,42,43,44,45,46']);
});
test('UKR-TEC decision: a supplier set to take sizes from the description sends a sized product without sizes to moderation',()=>{
 const h=createHarness();h.run('S.cfg.category_engine={version:1,migration_validated:true};S.cfg.simple_mode_version=1;classificationEnable();');
 const p=h.product({id:'p-pants',name:'Штани тактичні Fixture',canonical_category_id:'clothing_pants',last_confirmed_category_id:'clothing_pants',primary_product_type:'pants',desc:'<p>Тактичні штани. Матеріал: ріп-стоп. Склад: 65% поліестер, 35% бавовна. Кишені на липучках.</p>'});h.add(p);
 h.run('classificationApplyProduct(S.products.get("p-pants"));bumpData()');
 const reasons=()=>h.run('finalDecision(S.products.get("p-pants")).reasons.map(r=>r.code)');
 assert.ok(!reasons().includes('size'),'other suppliers: unchanged (size request without payment, no moderation)');
 h.run('S.cfg.suppliers[0].sizes_from_description=true;bumpData()');assert.ok(reasons().includes('size'),'«розмір уточнюється» and moderation');
 // Sizes in the supplier's description: the model's sizes are found → no size moderation (sizes chosen, manager confirms).
 h.run('var q=S.products.get("p-pants");q.desc=q.variants[0].offers["supplier-a"].source_description="<p>Тактичні штани. Матеріал: ріп-стоп. Склад: 65% поліестер, 35% бавовна. Розміри: 42-60рр.</p>";markProduct(q);classificationApplyProduct(q);bumpData()');
 assert.ok(!reasons().includes('size'));
 assert.equal(h.run('sanitizePortableConfig(S.cfg).suppliers[0].sizes_from_description'),true);
});

// ── Task 4: per-m² goods → QUOTE on the site (no cart, no MonoPay), only to a SITE that applies it. ──
test('per-m² goods are published as QUOTE only to a SITE advertising quote_sale_version 1; never orderable or payable',()=>{
 const h=slices({colors:['Піксель'],name:'Маскувальна сітка Fixture індивідуального розміру (ціна за 1 кв.м.)'});
 h.run('classificationEnable();Object.assign(S.cfg,OWNER_PRICE_POLICY);for(const p of S.products.values())classificationApplyProduct(p);bumpData()');
 assert.equal(h.run('finalDecision(S.products.get("p-0")).state'),'READY','published, not an owner question');
 assert.ok(!h.run('finalDecision(S.products.get("p-0")).reasons.map(r=>r.code)').includes('price_unit'));
 const w=JSON.parse(h.run('JSON.stringify(finalWireProduct(S.products.get("p-0")))'));
 assert.ok(w.variants.every(v=>v.sale_mode==='QUOTE'&&v.price_unit==='m2'&&v.order_submission_allowed===false&&v.payment_allowed===false&&v.requires_order_confirmation===true));
 assert.equal(w.order_submission_allowed,false);assert.equal(w.payment_allowed,false);assert.deepEqual(w.size_options,[]);
 assert.equal(h.run('pimSiteWire({quoteSale:true}).products.filter(p=>p.id==="p-0").length'),1);
 assert.equal(h.run('pimSiteWire({quoteSale:false}).products.filter(p=>p.id==="p-0").length'),0,'an older SITE never receives a QUOTE model');
 assert.equal(h.run('pimSiteWire().products.filter(p=>p.id==="p-0").length'),0,'without a confirmed capability nothing is sent');
 assert.deepEqual(Array.from(h.run('pimSiteWire({published:{"p-0":{}}}).hide_ids')),['p-0'],'a QUOTE model already on an older SITE is hidden there');
 // «індивідуальний розмір» without a per-m² price: a quote without the m² unit.
 const g=slices({colors:['Піксель'],name:'Маскувальна сітка Fixture індивідуального розміру'});g.run('classificationEnable();Object.assign(S.cfg,OWNER_PRICE_POLICY);for(const p of S.products.values())classificationApplyProduct(p);bumpData()');
 const x=JSON.parse(g.run('JSON.stringify(finalWireProduct(S.products.get("p-0")))'));assert.ok(x.variants.every(v=>v.sale_mode==='QUOTE'&&v.price_unit===null&&v.order_submission_allowed===false));
});

// ── Task 3: category auto-rule «supplier category consensus» (dictionary + the supplier's own category agree). ──
function shirts({safe=10,other=0,rcat='Футболки',sup='supplier-a'}={}){
 const h=createHarness();h.run('classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.suppliers.push({id:"supplier-b",name:"Другий постачальник",auto:false,priority:1,terms:{priceType:"cost"}})');
 const desc='<p>Тактична футболка з дихаючої тканини, плоскі шви, посилена горловина. Склад: бавовна 95%, еластан 5%.</p>';
 const mk=(id,name,s=sup,cat=rcat)=>{const p=h.product({id,name,brand:'',category:'',canonical_category_id:null,catSource:'',desc});const o=p.variants[0].offers['supplier-a'];delete p.variants[0].offers['supplier-a'];
  p.variants[0].offers[s]={...o,s:'FX-'+id,supplier_category_raw:cat,source_name:name,original_name:name,source_description:desc};p.variants[0].sku='RUB-'+id;h.add(p);h.ctx.pid=id;h.run('classificationApplyProduct(S.products.get(pid))');};
 for(let i=0;i<safe;i++)mk('s'+i,'Футболка тактична Fixture '+i);
 // An owner decision placed a product of the same supplier category elsewhere (the category mixes product types).
 for(let i=0;i<other;i++){mk('o'+i,'Штани тактичні Fixture '+i,sup,rcat);h.ctx.pid='o'+i;h.run('var q=S.products.get(pid);q.category_locked=true;q.canonical_category_id="clothing_pants";delete q.classification_input_fingerprint;classificationApplyProduct(q)');}
 mk('t','Термофутболка тактична Fixture');h.run('bumpData()');return h;
}
const cat=(h,id)=>{h.ctx.pid=id;return JSON.parse(h.run('JSON.stringify([S.products.get(pid).category_confidence_tier,S.products.get(pid).canonical_category_id||null,S.products.get(pid).category_rule_id||null,(S.products.get(pid).classification_exceptions||[]).filter(e=>e.kind==="category"&&e.status==="OPEN").length])'));};
test('category rule: 10 confirmed products of one supplier category agree with the dictionary suggestion → the open product is confirmed',()=>{
 const h=shirts();assert.deepEqual(cat(h,'t').slice(0,2),['LIKELY',null],'before: an owner question');
 assert.equal(h.run('categoryConsensusPass()'),1);assert.deepEqual(cat(h,'t'),['SAFE_AUTO','clothing_tshirts','supplier-category-consensus',0]);
 assert.ok(!h.run('finalDecision(S.products.get("t")).reasons.map(r=>r.code)').includes('category'));
 // Stable: a second pass changes nothing; the confirmed product does not count as evidence for itself.
 assert.equal(h.run('categoryConsensusPass()'),0);assert.equal(h.run('categoryConsensusBuild().get(categoryConsensusKey(classificationSources(S.products.get("t"))[0])).total'),10);
});
test('category rule: no confirmation without enough, unanimous, same-supplier evidence',()=>{
 assert.equal(shirts({safe:9}).run('categoryConsensusPass()'),0,'9 confirmed products are not enough');
 let h=shirts({safe:10,other:1});h.run('categoryConsensusPass()');assert.equal(cat(h,'t')[0],'LIKELY','a supplier category that mixes types (10 of 11 = 91%) never confirms');
 // The confirmed products belong to another supplier with the same category text: no evidence for this supplier.
 h=createHarness();h.run('classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};');
 h=shirts({safe:10,sup:'supplier-b'});h.ctx.pid='t';h.run('var q=S.products.get(pid),v=q.variants[0];v.offers["supplier-a"]={...v.offers["supplier-b"]};delete v.offers["supplier-b"];delete q.classification_input_fingerprint;classificationApplyProduct(q);bumpData()');
 h.run('categoryConsensusPass()');assert.equal(cat(h,'t')[0],'LIKELY','another supplier\'s category is not this supplier\'s evidence');
 // Manual lock / owner decision: never re-judged.
 h=shirts();h.ctx.pid='t';h.run('S.products.get(pid).category_locked=true;markProduct(S.products.get(pid))');h.run('categoryConsensusPass()');assert.notEqual(cat(h,'t')[2],'supplier-category-consensus');
});
test('category rule: an empty supplier category is no evidence (never pools unrelated products)',()=>{
 const h=shirts({rcat:''});assert.equal(h.run('categoryConsensusPass()'),0);assert.notEqual(cat(h,'t')[2],'supplier-category-consensus');
});
test('category rule: a consensus confirmation lapses back to the owner when its evidence is gone; AMBIGUOUS is never confirmed',()=>{
 const h=shirts();h.run('categoryConsensusPass()');assert.equal(cat(h,'t')[2],'supplier-category-consensus');
 // The owner moves two of the ten supporting products elsewhere: 8 of 10 — no consensus any more.
 h.run('for(const id of ["s0","s1"]){const q=S.products.get(id);q.category_locked=true;q.canonical_category_id="clothing_pants";delete q.classification_input_fingerprint;classificationApplyProduct(q);}bumpData()');
 h.run('categoryConsensusPass()');assert.equal(cat(h,'t')[0],'LIKELY');assert.notEqual(cat(h,'t')[2],'supplier-category-consensus');assert.equal(cat(h,'t')[3],1,'an owner question again');
 assert.ok(h.run('finalDecision(S.products.get("t")).reasons.map(r=>r.code)').includes('category'),'not published until the owner decides');
 // An AMBIGUOUS product with a suggestion equal to the consensus is still left to the owner.
 const g=shirts();g.ctx.pid='t';g.run('categoryConsensusMap=categoryConsensusBuild()');
 assert.equal(g.run('categoryConsensusDecision(S.products.get(pid),{...classificationDecisionBase(S.products.get(pid)),tier:"AMBIGUOUS"})'),null);
});
test('M-WIN decision: the same file downloaded again does not move the data time forward (FILE_UNCHANGED)',async()=>{
 const now=Date.now();const h=await harness();h.run('S.cfg.suppliers[0].source_time_ignore_header=true');const body=yml(kyiv(now-190*D));
 await importFile(h,body,'feed.xml',{lastModified:now-50*H});let o=offer(h);assert.equal(o.source_generated_at,now-50*H);
 assert.equal(h.run('S.cfg.suppliers[0].source_time_last.at'),now-50*H);
 // Byte-identical file saved again now: the data time stays 50 h old, the owner is told why.
 h.run('S.imp=null');const parsed=await importFile(h,body,'feed.xml',{lastModified:now-H});o=offer(h);assert.equal(o.source_generated_at,now-50*H);
 assert.match(h.run('sourceFileTimeNote(sourceTimeForSupplier('+JSON.stringify(parsed.source_time)+',S.cfg.suppliers[0],S.cfg.suppliers[0].source_time_last.hash))'),/Файл не змінився/);
 // A changed file moves it.
 await importFile(h,body.replace('<stock>3</stock>','<stock>4</stock>'),'feed.xml',{lastModified:now-H});o=offer(h);assert.equal(o.source_generated_at,now-H);
});
