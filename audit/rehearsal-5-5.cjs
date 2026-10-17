// Stage 5.5 rehearsal run11 (owner TZ §7, §9): restore run10 → clean descriptions and names (D-66…D-69, D-75) → the launch wave
// with default settings (D-74) → backup run11 → «Відновити з файлу» → field-by-field comparison. Private outputs only.
// The supplier files of run10 are weeks old: the wave is computed as on a Monday with fresh prices — a SKU's direct payment
// is judged by its own flags, without the data age (launchConditionHooks.fresh, in memory only; the backup is not changed).
// Usage: node --expose-gc --max-old-space-size=9216 audit/rehearsal-5-5.cjs RUN10_BACKUP.json.gz OUT_DIR [SEED]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{performance}=require('node:perf_hooks');
const {createHarness}=require('../app/tests/isolated-harness.cjs'),{LightDOMParser}=require('./light-xml-parser.cjs');
const [backupPath,outDir,seedArg]=process.argv.slice(2);if(!outDir)throw Error('Usage: RUN10_BACKUP OUT_DIR [SEED]');
const SEED=Number(seedArg)||5511,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const log=m=>console.log(new Date().toISOString().slice(11,19)+' '+m+' rss '+Math.round(process.memoryUsage().rss/1048576)+'MB');
const write=(name,data)=>{const f=path.join(outDir,name);fs.writeFileSync(f,data,{mode:0o600});fs.chmodSync(f,0o600);return f;};
function harness(){const h=createHarness({runtime:true,production:true});h.ctx.XLSX=require('../app/vendor/xlsx-0.20.3.min.js');h.ctx.DOMParser=LightDOMParser;h.run('render=()=>{}');return h;}
async function restoreClean(h,text){await h.run('Store.init()');h.ctx.d=JSON.parse(text);h.run('tzValidateBackup(d)');await h.run('releaseStorage.write(Store.db,[],releaseStorage.portableRows(d))');h.ctx.d=null;await h.run('productionLoad()');await h.run('productionPreview()');await h.run('productionApply()');}
async function restoreOwner(h,text){await restoreClean(h,text);h.ctx.d=JSON.parse(text);h.run('tzValidateBackup(d)');await h.run('applyRestoreData(d)');h.ctx.d=null;await h.run('persist()');}
const MONDAY="launchConditionHooks.fresh=(p,v)=>classificationAvailability(p,v).payment_allowed===true;bumpData();";
// What must not change (prices, stock, moderation, originals) and what is counted (TZ §7).
const SUMMARY=`JSON.stringify((()=>{const act=[...S.products.values()].filter(p=>!p.archived),dec={},vd=[],md=[],orig=[];
 for(const p of act){const f=finalDecision(p);dec[f.state]=(dec[f.state]||0)+1;md.push(p.id+'|'+f.state+'|'+(f.reasons||[]).map(r=>r.code||r).join(','));
  for(const v of p.variants||[]){const c=calc(p,v);vd.push(p.id+'|'+v.sku+'|'+c.price+'|'+c.avail+'|'+c.payout);}}
 for(const p of [...S.products.values()].sort((a,b)=>a.id.localeCompare(b.id)))orig.push(p.id+'|'+JSON.stringify([p.fieldMeta?.desc?.supplierOriginal??null,p.fieldMeta?.desc?.supplierValue??null,p.fieldMeta?.name?.supplierOriginal??null]));
 for(const c of [...S.content.values()].sort((a,b)=>String(a.key).localeCompare(String(b.key))))orig.push('c|'+c.key+'|'+JSON.stringify([c.originalDesc??null,c.d??null]));
 return {models:act.length,skus:[...S.products.values()].reduce((n,p)=>n+p.variants.length,0),decisions:dec,variants:vd.sort().join('\\n'),moderation:md.sort().join('\\n'),originals:orig.join('\\n')};})())`;
const digest=s=>({models:s.models,skus:s.skus,decisions:s.decisions,variants_sha:sha(s.variants),moderation_sha:sha(s.moderation),originals_sha:sha(s.originals)});
// Independent final-text check (criterion 1): its own patterns, not the cleaning functions.
const PATTERNS={G1:/\d[\d\s.,]*\s?(?:грн|₴|uah)(?![\p{L}])|(?<![\p{L}])(?:ціна|цена|вартість|стоимость|знижк\p{L}*|скидк\p{L}*)(?![\p{L}])/iu,
 G2:/в\s+наявності|в\s+наличии|під\s+замовлення|под\s+заказ|термін\s+виготовлен|срок\s+изготовлен|(?<![\p{L}])(?:доставк\p{L}*|оплат\p{L}*|передоплат\p{L}*|відправк\p{L}*)(?![\p{L}])/iu,
 G3:/(?<![\p{L}])(?:наш\p{L}*\s+(?:інтернет-)?магазин\p{L}*|інтернет-магазин\p{L}*|у\s+нас|замовляйте|купуйте|телефонуйте|пишіть|планета\s+спорт)(?![\p{L}])/iu,
 G4:/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+|(?<!\d)0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)|(?<![\p{L}])(?:viber|telegram|whatsapp|instagram)(?![\p{L}])|prom\.ua/iu};
const SUPPLIER_WORDS={kiborg:/к[іи]борг|kiborg/iu,mwin:/m[\s-]?win|м[\s-]?він/iu,tb:/tactical[\s-]?belt|тактикал[\s-]?белт/iu,arm:/armoline|армолайн/iu,ukr:/ukr[\s-]?tec|укр[\s-]?тек/iu};
const plain=html=>String(html||'').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
function textViolations(text,brand){const out=[];for(const [g,re] of Object.entries(PATTERNS))if(re.test(text))out.push(g);const b=String(brand||'').toLowerCase().replace(/[^\p{L}\d]/gu,'');for(const re of Object.values(SUPPLIER_WORDS)){const m=text.match(re);if(m&&!b.includes(m[0].toLowerCase().replace(/[^\p{L}\d]/gu,'')))out.push('G5');}return [...new Set(out)];}
let rnd=SEED;const random=()=>((rnd=Math.imul(rnd^(rnd>>>15),2246822519)+0x9e3779b9>>>0)/4294967296);
(async()=>{
 fs.mkdirSync(outDir,{recursive:true,mode:0o700});const raw=fs.readFileSync(backupPath),text=(backupPath.endsWith('.gz')?zlib.gunzipSync(raw):raw).toString('utf8');
 const result={run10_backup_sha256:sha(raw),seed:SEED,started:new Date().toISOString(),checks:{}};
 let h=harness();await restoreClean(h,text);log('run10 restored');
 const before=JSON.parse(h.run(SUMMARY));result.run10=digest(before);
 result.desc_before_541=JSON.parse(h.run(`JSON.stringify((()=>{const o={};for(const p of S.products.values()){if(p.archived)continue;const sid=Object.keys(p.variants?.[0]?.offers||{})[0]||'?';const s=S.cfg.suppliers.find(x=>x.id===sid)?.name||sid;o[s]??={products:0,applied:0,manual:0,basic:0};o[s].products++;if(p.fieldMeta?.desc?.source==='manual')o[s].manual++;else if(ceAccepted(p))o[s].applied++;else o[s].basic++;}return o;})())`));
 const names541=JSON.parse(h.run('JSON.stringify(Object.fromEntries([...S.products.values()].filter(p=>!p.archived).map(p=>[p.id,p.name])))'));
 let t=performance.now();
 result.apply=JSON.parse(h.run(`JSON.stringify((()=>{const i=ceBuildIndex(),o={};for(const p of S.products.values()){if(p.archived)continue;const sid=Object.keys(p.variants?.[0]?.offers||{})[0]||'?';const s=S.cfg.suppliers.find(x=>x.id===sid)?.name||sid;o[s]??={products:0,applied:0,manual:0,queue:{},basic:0};o[s].products++;
  if(p.fieldMeta?.desc?.source==='manual'){o[s].manual++;continue;}const r=ceAutoApply(p,i);if(r.ok){o[s].applied++;i.add(p,p.desc);continue;}const need=ceNeedReason(p);if(need)o[s].queue[CE_NEED_LABELS[need]]=(o[s].queue[CE_NEED_LABELS[need]]||0)+1;else o[s].basic++;}
  let names=0;for(const p of S.products.values())if(!p.archived&&nameDraft(p).apply&&nameApply(p).ok)names++;return {bySupplier:o,names};})())`));
 result.apply.ms=Math.round(performance.now()-t);log('applied descriptions and names');
 const removed=JSON.parse(h.run(`JSON.stringify((()=>{const all=[];for(const p of S.products.values()){if(p.archived)continue;const d=p.contentDraft||ceGenerate(p);for(const r of d.removedFragments||[])all.push({id:p.id,group:r.group,text:r.text,reason:r.reason});}return all;})())`));
 write('descriptions-removed.json',JSON.stringify(removed)+'\n');
 const freq={};for(const r of removed){const k=r.group+' | '+r.text.slice(0,120);freq[k]=(freq[k]||0)+1;}result.removed={total:removed.length,by_group:removed.reduce((m,r)=>(m[r.group]=(m[r.group]||0)+1,m),{}),top50:Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,50)};
 result.checks.invariant=JSON.parse(h.run(`JSON.stringify((()=>{let bad=0;const ex=[];for(const p of S.products.values()){if(p.archived)continue;const d=p.contentDraft||ceGenerate(p);const src=ceTechTokens(autoUkText(ceSourcePlain(ceSupplierSource(p)||'')));const kept=ceTechTokens(plainSupplierText(d.html)+' '+(d.omittedSentences||[]).map(o=>o.text).join(' '));const g1=ceTechTokens((d.removedFragments||[]).filter(x=>x.group==='G1').map(x=>x.text).join(' '));const lost=src.filter(x=>!kept.includes(x)&&!g1.includes(x));if(lost.length){bad++;if(ex.length<10)ex.push({id:p.id,lost});}}return {violations:bad,examples:ex};})())`));
 result.checks.structure=JSON.parse(h.run(`JSON.stringify((()=>{let dup=0,empty=0;const ex=[];for(const p of S.products.values()){if(p.archived||!ceAccepted(p))continue;const heads=[...String(p.desc).matchAll(/<p><strong>([^<]*)<\\/strong><\\/p>/g)].map(m=>m[1].trim().toLowerCase());if(new Set(heads).size!==heads.length){dup++;if(ex.length<5)ex.push(p.id);}if(/<p><strong>[^<]*<\\/strong><\\/p>\\s*(?:<p><strong>[^<]*<\\/strong><\\/p>|$)/.test(String(p.desc).trim()))empty++;}return {repeated_headings:dup,empty_sections:empty,examples:ex};})())`));
 log('invariant and structure checked');
 h.run(MONDAY);t=performance.now();const waveA=JSON.parse(h.run('JSON.stringify(launchWave())'));const waveMs=Math.round(performance.now()-t);
 h.run('for(const p of S.products.values())markProduct(p);bumpData()');t=performance.now();const waveA2=JSON.parse(h.run('JSON.stringify(launchWave())'));const waveMs2=Math.round(performance.now()-t);
 result.wave={count:waveA.ids.length,limit:waveA.limit,breakdown:waveA.breakdown,warnings:waveA.warnings,why:waveA.why,ms_first:waveMs,ms_after_change:waveMs2,repeat_equal:JSON.stringify(waveA.ids)===JSON.stringify(waveA2.ids)};
 write('wave.json',JSON.stringify(waveA)+'\n');log('wave '+waveA.ids.length);
 const waveCheck=JSON.parse(h.run(`JSON.stringify((()=>{const ids=${JSON.stringify(waveA.ids)};return ids.map(id=>{const p=S.products.get(id);const prices=(p.variants||[]).map(v=>calc(p,v).price).filter(x=>x!=null);return {id,name:p.name,brand:p.brand,desc:p.desc,manual:p.fieldMeta?.desc?.source==='manual',accepted:ceAccepted(p),photos:p.photos||[],price_min:prices.length?Math.min(...prices):null,quote:finalQuoteModel(p),state:finalDecision(p).state,supplier:launchMainSupplier(p),top:String(p.category||'').split(' / ')[0],removed:(p.contentDraft?.removedFragments||[]).slice(0,5)};});})())`));
 const viol=[],cond=[],sup={},cat={};
 for(const w of waveCheck){const v=textViolations(plain(w.desc)+' '+w.name,w.brand);if(v.length)viol.push({id:w.id,groups:v});
  const bad=[];if(!(w.manual||w.accepted))bad.push('desc');if(w.photos.length<3||new Set(w.photos).size!==w.photos.length||w.photos.some(u=>!/^https:\/\//.test(u)))bad.push('photos');if(!w.brand)bad.push('brand');if(!(w.price_min>=500))bad.push('price');if(w.quote)bad.push('quote');if(w.state!=='READY')bad.push('state');if(bad.length)cond.push({id:w.id,bad});
  sup[w.supplier]=(sup[w.supplier]||0)+1;cat[w.top]=(cat[w.top]||0)+1;}
 const L=waveA.limit;result.checks.criterion1={wave_texts_with_signals:viol.length,examples:viol.slice(0,10)};
 result.checks.criterion5={count:waveA.ids.length,limit_ok:waveA.ids.length<=500,supplier_quota_ok:Object.values(sup).every(n=>n<=Math.floor(L*0.4)),category_quota_ok:Object.values(cat).every(n=>n<=Math.floor(L*0.15)),products_failing_independent_checks:cond.length,examples:cond.slice(0,10)};
 const pick=[],pool=[...waveCheck];while(pick.length<30&&pool.length)pick.push(pool.splice(Math.floor(random()*pool.length),1)[0]);
 write('cards30.json',JSON.stringify(pick.map(w=>({id:w.id,name_before:names541[w.id],name_after:w.name,first_lines:plain(w.desc).split(/(?<=[.!?])\s+/).slice(0,3),removed:w.removed})),null,1)+'\n');
 const d71=JSON.parse(h.run(`JSON.stringify((()=>{const o={underpaid:[],made_to_order:[]};for(const p of S.products.values()){if(p.archived)continue;for(const x of supplierTextChecks(p))o[x.kind].push({id:p.id,name:p.name,...x});}return o;})())`));
 write('d71.json',JSON.stringify(d71,null,1)+'\n');result.d71={underpaid:d71.underpaid.length,made_to_order:d71.made_to_order.length};
 result.by_supplier_wave=JSON.parse(h.run(`JSON.stringify((()=>{const w=launchWave(),o={};for(const p of S.products.values()){if(p.archived)continue;const sid=Object.keys(p.variants?.[0]?.offers||{})[0]||'?';const s=S.cfg.suppliers.find(x=>x.id===sid)?.name||sid;o[s]??={in_wave:0,reasons:{}};if(w.ids.includes(p.id))o[s].in_wave++;else for(const r of (w.reasons[p.id]||[]).slice(0,1))o[s].reasons[r]=(o[s].reasons[r]||0)+1;}return o;})())`));
 const after=JSON.parse(h.run(SUMMARY));result.run11=digest(after);
 await h.run('persist()');await h.run('backupDl("rehearsal-5-5",false)');const dl=h.downloads.at(-1);const backupBytes=Buffer.from(await dl.blob.arrayBuffer());
 write('rubizh-pim-backup-rehearsal-5-5.json.gz',zlib.gzipSync(backupBytes,{level:9}));result.backup={file:'rubizh-pim-backup-rehearsal-5-5.json.gz',json_sha256:sha(backupBytes),bytes:backupBytes.length};
 h=null;if(global.gc)global.gc();log('backup written');
 let h2=harness();await restoreOwner(h2,backupBytes.toString('utf8'));log('run11 restored (owner path)');
 const restored=JSON.parse(h2.run(SUMMARY));h2.run(MONDAY);const waveB=JSON.parse(h2.run('JSON.stringify(launchWave())'));
 result.checks.catalog_vs_run10={models_equal:after.models===before.models,skus_equal:after.skus===before.skus,decisions_equal:JSON.stringify(after.decisions)===JSON.stringify(before.decisions),variants_equal:after.variants===before.variants,moderation_equal:after.moderation===before.moderation,originals_equal:after.originals===before.originals,run10:result.run10,run11:result.run11};
 result.checks.restore={catalog_equal:JSON.stringify(digest(restored))===JSON.stringify(digest(after)),wave_equal:JSON.stringify(waveB.ids)===JSON.stringify(waveA.ids),wave_count_after_restore:waveB.ids.length};
 result.finished=new Date().toISOString();write('rehearsal-run11.json',JSON.stringify(result,null,1)+'\n');
 console.log(JSON.stringify({run10:result.run10,catalog:result.checks.catalog_vs_run10,restore:result.checks.restore,wave:{count:result.wave.count,repeat:result.wave.repeat_equal,ms:[waveMs,waveMs2]},c1:result.checks.criterion1.wave_texts_with_signals,c2:result.checks.invariant.violations,c3:result.checks.structure,c5:result.checks.criterion5}));
})().catch(e=>{console.error(e);process.exit(1);});
