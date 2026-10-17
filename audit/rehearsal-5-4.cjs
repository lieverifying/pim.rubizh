'use strict';
// Stage 5.4 (owner 2026-10-17): the stage 5.2 REHEARSAL repeated with the owner's decisions on it and the moderation
// auto-rules (model grouping «colour slices», UKR-TEC sizes from the description, supplier-category consensus, per-m²
// goods as a manager QUOTE). Same flow as rehearsal-5-2.cjs; network disabled, owner PIM untouched.
// Owner settings (from a private settings-only copy of the owner backup) → migration → approved price policy → catalog
// reset (settings kept) → every supplier file through the shipped import pipeline with its real file time → per-supplier
// quality, freshness and examples for owner decisions → the standard PIM backup (new catalog + settings) → restore of that
// backup into a clean profile and comparison. Never sends anything to SITE.
// Usage: node --max-old-space-size=9216 audit/rehearsal-5-4.cjs SETTINGS_BACKUP.json SOURCES.json OUT_DIR DECISIONS.json
//   DECISIONS.json: {"suppliers":{"<supplier id>":{"source_time_ignore_header":true}|{"sizes_from_description":true}}} — owner
//   supplier settings (only these two keys are accepted).
//   SOURCES.json: [{"supplier_id":"…","file":"/private/…"}] in import order. Every output is private (mode 600).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{performance}=require('node:perf_hooks');
const {createHarness}=require('../app/tests/isolated-harness.cjs'),{LightDOMParser}=require('./light-xml-parser.cjs');
const log=m=>console.log(new Date().toISOString().slice(11,19),m,'rss',Math.round(process.memoryUsage().rss/1e6)+'MB');
const [backupPath,sourcesPath,outDir,decisionsPath]=process.argv.slice(2);if(!decisionsPath)throw Error('Usage: SETTINGS_BACKUP SOURCES OUT_DIR DECISIONS');
// Private outputs never land inside the repository (supplier data, catalog backup).
if(!path.relative(path.resolve(__dirname,'..'),path.resolve(outDir)).startsWith('..'))throw Error('OUT_DIR must be outside the repository');
// Credentials only (the catalog has thousands of ordinary «key» fields): the config must carry no SITE/PIM key, password
// or token — sanitizePortableConfig strips them from every backup.
const backupSecrets=cfg=>{const hits=[];(function walk(o,p){if(o&&typeof o==='object')for(const [k,v] of Object.entries(o)){if(/^(?:key|key_?next|pim_key|supabasePassword|password|passwd|secret|token|access_token|refresh_token|api_?key|service_key|service_role|authorization)$/i.test(k)&&typeof v==='string'&&v)hits.push(p+k);walk(v,p+k+'.');}})(cfg,'cfg.');return hits;};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(name,data)=>{const f=path.join(outDir,name);fs.writeFileSync(f,data,{mode:0o600});fs.chmodSync(f,0o600);return f;};
const read=p=>{const b=fs.readFileSync(p);return JSON.parse(p.endsWith('.gz')?zlib.gunzipSync(b):b);};
function harness(){const h=createHarness({runtime:true,production:true});h.ctx.XLSX=require('../app/vendor/xlsx-0.20.3.min.js');h.ctx.DOMParser=LightDOMParser;h.run('render=()=>{}');return h;}
// Settings that must survive the reset and the backup → restore round trip.
const {SETTINGS,quality}=require('./rehearsal-5-2-lib.cjs'),{RULES,SAMPLE}=require('./rehearsal-5-4-lib.cjs');
(async()=>{
 fs.mkdirSync(outDir,{recursive:true,mode:0o700});fs.chmodSync(outDir,0o700);const t0=performance.now();
 const sourceBytes=fs.readFileSync(backupPath),backupSha=sha(sourceBytes);let source=read(backupPath);
 const h=harness();await h.run('Store.init()');h.ctx.source=source;
 await h.run('releaseStorage.write(Store.db,[],releaseStorage.portableRows(source))');h.ctx.source=null;source=null;await h.run('productionLoad()');
 log('settings loaded');await h.run('productionPreview()');await h.run('productionApply()');log('migration done');
 h.run('SIMPLE_UI.pricePreview=simplePricePolicyPreview()');await h.run('simpleApplyPricePolicy()');
 // The owner's freshness thresholds (stage 5.1): explicit, the approved defaults when the copy predates them.
 h.run('if(S.cfg.payFreshHours==null)S.cfg.payFreshHours=72;if(S.cfg.sellMaxDays==null)S.cfg.sellMaxDays=8;S.cfgDirty=true');
 // Owner decisions on the 5.2 rehearsal: per-supplier settings, only the two approved keys.
 const decisions=JSON.parse(fs.readFileSync(decisionsPath,'utf8'));h.ctx.decisions=Object.fromEntries(Object.entries(decisions.suppliers||{}).map(([id,o])=>[id,Object.fromEntries(Object.entries(o).filter(([k,v])=>['source_time_ignore_header','sizes_from_description'].includes(k)&&v===true))]));
 if(h.run('Object.keys(decisions).filter(id=>!S.cfg.suppliers.some(s=>s.id===id)).length'))throw Error('decision for an unknown supplier');
 h.run('for(const [id,o] of Object.entries(decisions))Object.assign(S.cfg.suppliers.find(s=>s.id===id),o);S.cfgDirty=true;decisions=null');
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
 const {q,examples}=quality(h);const rules=JSON.parse(h.run(RULES)),sample=JSON.parse(h.run(SAMPLE));
 log('report built');if(h.run('S.cfg.autoprices_enabled===true'))throw Error('AUTOPRICES must stay off');
 // The standard backup (the «Резервная копия» download), written as .json and .json.gz.
 await h.run('persist()');await h.run('backupDl("rehearsal-5-4",false)');
 const dl=h.downloads.at(-1);const backupBytes=Buffer.from(await dl.blob.arrayBuffer());
 write('rubizh-pim-backup-rehearsal-5-4.json',backupBytes);const backupGz=write('rubizh-pim-backup-rehearsal-5-4.json.gz',zlib.gzipSync(backupBytes,{level:9}));
 const backupText=backupBytes.toString('utf8');const secrets=backupSecrets(JSON.parse(backupText).cfg);
 const statsOriginal=JSON.parse(h.run('JSON.stringify(catalogStats())'));const settingsFinal=JSON.parse(h.run(SETTINGS));
 const wireA=JSON.stringify(await h.run('pimSiteWire()'));
 // Restore into a clean profile (empty store, nothing loaded): validation, the restore the owner runs, persist.
 log('backup written');
 const partial={generated_at:new Date().toISOString(),settings_backup_sha256:backupSha,settings_kept_through_reset:JSON.stringify(settingsBefore)===JSON.stringify(settingsAfterReset),settings:settingsFinal,empty_after_reset:empty,imports,quality:q,rules,
  backup:{file:path.basename(backupGz),json_sha256:sha(backupBytes),bytes:backupBytes.length,secrets_found:secrets,stats:statsOriginal},wire_sha256:sha(wireA),autoprices_enabled:false,sync_sent:false};
 write('rehearsal-report.json',JSON.stringify(partial,null,1)+'\n');write('owner-decision-examples.json',JSON.stringify(examples,null,1)+'\n');write('auto-merge-sample.json',JSON.stringify(sample,null,1)+'\n');
 // Restore check: audit/rehearsal-5-2-verify.cjs (a clean profile and an already-migrated PIM), run separately.
 console.log(JSON.stringify({products:q.totals.products,skus:q.totals.skus,queue:q.totals.queue,rules,secrets,ms:Math.round(performance.now()-t0)}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
