'use strict';
// Stage 5.2 (owner 2026-10-17): REHEARSAL of a clean catalog from supplier files, all network disabled, owner PIM untouched.
// Owner settings (from a private settings-only copy of the owner backup) → migration → approved price policy → catalog
// reset (settings kept) → every supplier file through the shipped import pipeline with its real file time → per-supplier
// quality, freshness and examples for owner decisions → the standard PIM backup (new catalog + settings) → restore of that
// backup into a clean profile and comparison. Never sends anything to SITE.
// Usage: node --max-old-space-size=6144 audit/rehearsal-5-2.cjs SETTINGS_BACKUP.json SOURCES.json OUT_DIR
//   SOURCES.json: [{"supplier_id":"…","file":"/private/…"}] in import order. Every output is private (mode 600).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{performance}=require('node:perf_hooks');
const {createHarness}=require('../app/tests/isolated-harness.cjs'),{LightDOMParser}=require('./light-xml-parser.cjs');
const log=m=>console.log(new Date().toISOString().slice(11,19),m,'rss',Math.round(process.memoryUsage().rss/1e6)+'MB');
const [backupPath,sourcesPath,outDir]=process.argv.slice(2);if(!outDir)throw Error('Usage: SETTINGS_BACKUP SOURCES OUT_DIR');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(name,data)=>{const f=path.join(outDir,name);fs.writeFileSync(f,data);fs.chmodSync(f,0o600);return f;};
const read=p=>{const b=fs.readFileSync(p);return JSON.parse(p.endsWith('.gz')?zlib.gunzipSync(b):b);};
function harness(){const h=createHarness({runtime:true,production:true});h.ctx.XLSX=require('../app/vendor/xlsx-0.20.3.min.js');h.ctx.DOMParser=LightDOMParser;h.run('render=()=>{}');return h;}
// Settings that must survive the reset and the backup → restore round trip.
const SETTINGS=`JSON.stringify({categories:(S.cfg.canonical_categories||[]).length,suppliers:S.cfg.suppliers.map(s=>({id:s.id,name:s.name,auto:s.auto,priority:s.priority,terms:s.terms,mapping:s.mapping,fulfillment:s.fulfillment,inventory_policy:s.inventory_policy||null})),
 catMap:S.cfg.catMap,catRules:S.cfg.catRules,colorMap:S.cfg.colorMap,sizeMap:S.cfg.sizeMap,brandMap:S.cfg.brandMap,supplierAliases:S.cfg.supplierAliases,supplier_category_mapping:S.cfg.supplier_category_mapping||null,
 pricing:[S.cfg.pricing_policy_version,S.cfg.minMargin,S.cfg.bigPriceFrom,S.cfg.bigPriceMargin,S.cfg.kitMargin,S.cfg.discountMarginFloor,S.cfg.donPct,S.cfg.donCapPct,S.cfg.taxPct,S.cfg.acquiringPct,S.cfg.round,S.cfg.roundMode,S.cfg.tiers,S.cfg.defaultMarkup,S.cfg.rules],
 freshness:freshnessPolicy(),inventory_policy_version:S.cfg.inventory_policy_version,classification_version:S.cfg.classification_version,model_colors_version:S.cfg.model_colors_version,autoprices_enabled:S.cfg.autoprices_enabled===true})`;
(async()=>{
 fs.mkdirSync(outDir,{recursive:true,mode:0o700});const t0=performance.now();
 const sourceBytes=fs.readFileSync(backupPath),backupSha=sha(sourceBytes);let source=read(backupPath);
 const h=harness();await h.run('Store.init()');h.ctx.source=source;
 await h.run('releaseStorage.write(Store.db,[],releaseStorage.portableRows(source))');h.ctx.source=null;source=null;await h.run('productionLoad()');
 log('settings loaded');await h.run('productionPreview()');await h.run('productionApply()');log('migration done');
 h.run('SIMPLE_UI.pricePreview=simplePricePolicyPreview()');await h.run('simpleApplyPricePolicy()');
 // The owner's freshness thresholds (stage 5.1): explicit, the approved defaults when the copy predates them.
 h.run('if(S.cfg.payFreshHours==null)S.cfg.payFreshHours=72;if(S.cfg.sellMaxDays==null)S.cfg.sellMaxDays=8;S.cfgDirty=true');
 const settingsBefore=JSON.parse(h.run(SETTINGS));
 const plan=h.run('finalCatalogResetPreview()');h.ctx.plan=plan;await h.run('finalCatalogReset(plan,FINAL_RESET_CONFIRM)');await h.run('productionLoad()');
 const settingsAfterReset=JSON.parse(h.run(SETTINGS));log('reset done');
 const empty={products:h.run('S.products.size'),queue:h.run('S.queue.size'),content:h.run('S.content.size')};
 // Throwaway copy: the per-import automatic backup (a compressed full catalog kept in the browser store) is skipped here —
 // it only protects the owner's real browser data, and on an 8 GB machine the copies exhausted the heap. The final backup
 // below is the owner's backup; the «before import» download and safety copy still run (and are released).
 h.run('createAutoBackup=async()=>({skipped:"rehearsal"})');
 // Imports: original files, their real modification time, the saved mapping of each supplier — the ИМПОРТ screen path.
 const imports=[];const now=Date.now();
 for(const src of JSON.parse(fs.readFileSync(sourcesPath,'utf8'))){
  const t=performance.now(),file=fs.readFileSync(src.file),stat=fs.statSync(src.file),name=path.basename(src.file);
  h.ctx.download={blob:new Blob([file]),url:'https://import.invalid/'+encodeURIComponent(name),lastModified:stat.mtimeMs};h.ctx.supId=src.supplier_id;
  const parsed=await h.run('workflowParseSource(download,S.cfg.suppliers.find(s=>s.id===supId))');h.ctx.parsed=parsed;
  h.run('S.imp={sup:supId,file:parsed.file,rows:parsed.rows,hdr:parsed.hdr,sheet:parsed.sheet,sheets:parsed.sheets,wb:parsed.wb||null,zero:true,xml:parsed.sheet==="XML",source_time:parsed.source_time};remap()');
  const mapped=h.run('Object.fromEntries(Object.entries(S.imp.map).filter(([,i])=>i!=null&&i!=="").map(([k,i])=>[k,String(S.imp.rows[S.imp.hdr][i])]))');
  await h.run('doImport()');const preview=JSON.parse(h.run('JSON.stringify((S.imp.preview||[]).map(r=>({created:r.created,updated:r.updated,queued:r.queued,newInQueue:r.newInQueue,errors:(r.errors||[]).length,zeroed:r.zeroed})))'));
  const audit=JSON.parse(h.run('JSON.stringify(previewAudit(S.imp))'));const applied=await h.run('applyImport()');
  const st=parsed.source_time;
  imports.push({supplier_id:src.supplier_id,supplier:h.run(`S.cfg.suppliers.find(s=>s.id===${JSON.stringify(src.supplier_id)}).name`),file_sha256:sha(file),sheet:parsed.sheet,rows:parsed.rows.length-parsed.hdr-1,mapped,preview,audit_ok:audit.ok!==false,applied:applied===true,
   source_time:{at:st.at?new Date(st.at).toISOString():null,provenance:st.provenance,header:st.header?new Date(st.header).toISOString():null,file_mtime:st.mtime?new Date(st.mtime).toISOString():null,warning:st.warning,age_hours:st.at?Math.round((now-st.at)/360000)/10:null},
   ms:Math.round(performance.now()-t)});
  log('imported '+name+' rows '+(parsed.rows.length-parsed.hdr-1)+' products '+h.run('S.products.size')+' queue '+h.run('S.queue.size'));
  if(process.env.REHEARSAL_MEMORY){if(global.gc)global.gc();const sz=h.run(`JSON.stringify({products:JSON.stringify([...S.products.values()]).length,content:JSON.stringify([...S.content.values()]).length,queue:JSON.stringify([...S.queue.values()]).length,snap:S.snap?JSON.stringify(S.snap).length:0,cfg:JSON.stringify(S.cfg).length,undo:JSON.stringify(S.cfg.undoBySupplier||{}).length,logs:JSON.stringify(S.logs||[]).length,dirty:[S.dirtyP?.size,S.dirtyQ?.size,S.dirtyC?.size]})`);log('memory '+sz+' heapUsed '+Math.round(process.memoryUsage().heapUsed/1e6)+'MB');}h.ctx.download=null;h.ctx.parsed=null;
  // applyImport offers the owner a «before import» backup download; the harness keeps every download in memory.
  h.downloads.length=0;h.run('S.imp=null');if(global.gc)global.gc();
 }
 // Owner view of the new catalog: what the queue becomes (the screens' decisions), per supplier.
 const q=JSON.parse(h.run(`JSON.stringify((()=>{
  const pol=freshnessPolicy(),by={},sup=id=>by[id]||(by[id]={products:0,skus:0,category_tier:{},category_review:{},size_tier:{},size_status:{},decision:{},moderation_reasons:{},rejected_reasons:{},
   no_photo:0,no_price:0,margin_blocked:0,availability:{},contradictory_availability:0,freshness:{fresh:0,confirm:0,hidden:0},multi_color_models:0,multi_supplier_models:0,queue:{}});
  const nameKey=p=>(finalTitle(p)||p.name||'').toLowerCase().replace(/\\s+/g,' ').trim()+'|'+(p.brand||'').toLowerCase().trim();const names=new Map(),barcodes=new Map();
  for(const p of S.products.values()){
   const sids=[...new Set(p.variants.flatMap(v=>Object.keys(v.offers||{})))];const d=finalDecision(p);
   for(const s of sids){const b=sup(s);b.products++;b.category_tier[p.category_confidence_tier||'NONE']=(b.category_tier[p.category_confidence_tier||'NONE']||0)+1;
    b.category_review[p.category_review_status||'NONE']=(b.category_review[p.category_review_status||'NONE']||0)+1;b.decision[d.state]=(b.decision[d.state]||0)+1;
    const bag=d.state==='MODERATION'?b.moderation_reasons:d.state==='REJECTED'?b.rejected_reasons:null;if(bag)for(const r of d.reasons)bag[r.code]=(bag[r.code]||0)+1;
    if(!p.archived&&!finalUsablePhotos(p).length)b.no_photo++;if(mcColors(p).length>1)b.multi_color_models++;if(sids.length>1)b.multi_supplier_models++;}
   const k=nameKey(p);names.set(k,[...(names.get(k)||[]),{id:p.id,sids}]);
   for(const v of p.variants)for(const [s,o] of Object.entries(v.offers||{})){const b=sup(s);b.skus++;
    b.size_tier[v.size_confidence_tier||'NONE']=(b.size_tier[v.size_confidence_tier||'NONE']||0)+1;b.size_status[v.size_status||'NONE']=(b.size_status[v.size_status||'NONE']||0)+1;
    const c=calc(p,v);if(!(c.price>0))b.no_price++;if(modelVariant(p,v).margin_blocked)b.margin_blocked++;
    const a=classificationAvailability(p,v).availability;b.availability[a]=(b.availability[a]||0)+1;
    const inv=classificationInventory({sid:s,...o},v);if(inv.rule==='status-quantity-contradiction')b.contradictory_availability++;
    const cl=classificationFreshnessClass(p,v,{sid:s,...o});if(cl)b.freshness[cl]++;
    if(v.barcode){const key=String(v.barcode).trim();barcodes.set(key,[...(barcodes.get(key)||[]),s]);}}
  }
  for(const it of S.queue.values()){const b=sup(it.sup);const r=it.rejected_import?.reason||it.status||(it.review?.type)||'OPEN';b.queue[r]=(b.queue[r]||0)+1;}
  const dupNames=[...names.values()].filter(l=>l.length>1),crossNames=dupNames.filter(l=>new Set(l.flatMap(x=>x.sids)).size>1);
  const crossBarcodes=[...barcodes.values()].filter(l=>new Set(l).size>1).length;
  return {by_supplier:by,same_name_models:dupNames.length,same_name_across_suppliers:crossNames.length,same_barcode_across_suppliers:crossBarcodes,
   totals:{products:S.products.size,skus:[...S.products.values()].reduce((n,p)=>n+p.variants.length,0),queue:S.queue.size,policy:pol}};
 })())`));
 // Examples for the owner's decisions (names and reasons only — no purchase prices, no supplier article data).
 const examples=JSON.parse(h.run(`JSON.stringify((()=>{const out={},add=(k,x)=>{(out[k]=out[k]||[]);if(out[k].length<3)out[k].push(x);};
  for(const p of S.products.values()){const d=finalDecision(p),title=finalTitle(p)||p.name,sids=[...new Set(p.variants.flatMap(v=>Object.keys(v.offers||{})))].map(s=>S.cfg.suppliers.find(x=>x.id===s)?.name||s);
   if(p.category_confidence_tier==='AMBIGUOUS')add('category_ambiguous',{title,suppliers:sids,category:p.canonical_category_id,suggestion:p.category_suggestion_id||null});
   if(p.category_confidence_tier==='LIKELY')add('category_likely',{title,suppliers:sids,category:p.canonical_category_id});
   for(const r of d.reasons)add('moderation_'+r.code,{title,suppliers:sids,why:r.why||''});
   if(!finalUsablePhotos(p).length&&!p.archived)add('no_photo',{title,suppliers:sids});
   if(p.variants.some(v=>v.size_confidence_tier&&v.size_confidence_tier!=='SAFE_AUTO'))add('size_unconfirmed',{title,suppliers:sids,sizes:p.variants.filter(v=>v.size_confidence_tier!=='SAFE_AUTO').slice(0,4).map(v=>v.size||(v.offers&&Object.values(v.offers)[0]?.size_raw)||'')});
   if(sids.length>1)add('multi_supplier_model',{title,suppliers:sids});}
  for(const it of S.queue.values())add('queue_'+(it.rejected_import?.reason||it.review?.type||'open'),{name:it.n,supplier:S.cfg.suppliers.find(x=>x.id===it.sup)?.name||it.sup});
  return out;})())`));
 log('report built');if(h.run('S.cfg.autoprices_enabled===true'))throw Error('AUTOPRICES must stay off');
 // The standard backup (the «Резервная копия» download), written as .json and .json.gz.
 await h.run('persist()');await h.run('backupDl("rehearsal-5-2",false)');
 const dl=h.downloads.at(-1);const backupBytes=Buffer.from(await dl.blob.arrayBuffer());
 write('rubizh-pim-backup-rehearsal-5-2.json',backupBytes);const backupGz=write('rubizh-pim-backup-rehearsal-5-2.json.gz',zlib.gzipSync(backupBytes,{level:9}));
 const backupText=backupBytes.toString('utf8');const secrets=/"(?:key|pim_key|supabasePassword|token|password|secret)"\s*:\s*"[^"]{6,}"/i.test(backupText);
 const statsOriginal=JSON.parse(h.run('JSON.stringify(catalogStats())'));const settingsFinal=JSON.parse(h.run(SETTINGS));
 const wireA=JSON.stringify(await h.run('pimSiteWire()'));
 // Restore into a clean profile (empty store, nothing loaded): validation, the restore the owner runs, persist.
 log('backup written');const h2=harness();await h2.run('Store.init()');h2.ctx.d=JSON.parse(backupText);h2.run('tzValidateBackup(d)');await h2.run('applyRestoreData(d)');await h2.run('persist()');
 const statsRestored=JSON.parse(h2.run('JSON.stringify(catalogStats())'));const settingsRestored=JSON.parse(h2.run(SETTINGS));const wireB=JSON.stringify(await h2.run('pimSiteWire()'));
 const restore={stats_equal:JSON.stringify(statsOriginal)===JSON.stringify(statsRestored),settings_equal:JSON.stringify(settingsFinal)===JSON.stringify(settingsRestored),wire_equal:sha(wireA)===sha(wireB),
  stats:statsRestored,wire_sha256:sha(wireB)};
 const report={generated_at:new Date().toISOString(),settings_backup_sha256:backupSha,settings_kept_through_reset:JSON.stringify(settingsBefore)===JSON.stringify(settingsAfterReset),settings:settingsFinal,empty_after_reset:empty,
  imports,quality:q,backup:{file:path.basename(backupGz),json_sha256:sha(backupBytes),gz_sha256:sha(fs.readFileSync(backupGz)),bytes:backupBytes.length,secrets_found:secrets,products:statsOriginal.products},restore,
  network_requests:(h.requests||[]).length+(h2.requests||[]).length,sync_sent:false,autoprices_enabled:false,ms:Math.round(performance.now()-t0)};
 write('rehearsal-report.json',JSON.stringify(report,null,1)+'\n');write('owner-decision-examples.json',JSON.stringify(examples,null,1)+'\n');
 console.log(JSON.stringify({products:q.totals.products,skus:q.totals.skus,queue:q.totals.queue,restore_ok:restore.stats_equal&&restore.settings_equal&&restore.wire_equal,secrets,net:report.network_requests,ms:report.ms}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
