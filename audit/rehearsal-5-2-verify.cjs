'use strict';
// Stage 5.2: restore check of the rehearsal backup, then the owner report from the RESTORED catalog (private outputs only).
//  (a) a clean browser profile, production build: the backup is written to empty storage (recovery path), the 10.9.3
//      migration runs, the profile becomes writable — catalog, settings and SITE wire must equal the backup;
//  (b) an already migrated PIM (the owner's case): «Восстановить из файла» (applyRestoreData) — the same comparison.
// The supplier files are only parsed (no import) for their data time and row counts.
// Usage: node --max-old-space-size=9216 audit/rehearsal-5-2-verify.cjs BACKUP.json SOURCES.json OUT_DIR
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {createHarness}=require('../app/tests/isolated-harness.cjs'),{LightDOMParser}=require('./light-xml-parser.cjs'),{SETTINGS,quality}=require('./rehearsal-5-2-lib.cjs');
const [backupPath,sourcesPath,outDir]=process.argv.slice(2);if(!outDir)throw Error('Usage: BACKUP SOURCES OUT_DIR');
// Credentials only (the catalog has thousands of ordinary «key» fields): the config must carry no SITE/PIM key, password
// or token — sanitizePortableConfig strips them from every backup.
const backupSecrets=cfg=>{const hits=[];(function walk(o,p){if(o&&typeof o==='object')for(const [k,v] of Object.entries(o)){if(/^(?:key|key_?next|pim_key|supabasePassword|password|passwd|secret|token|access_token|refresh_token|api_?key|service_key|service_role|authorization)$/i.test(k)&&typeof v==='string'&&v)hits.push(p+k);walk(v,p+k+'.');}})(cfg,'cfg.');return hits;};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const log=m=>console.log(new Date().toISOString().slice(11,19),m,'rss',Math.round(process.memoryUsage().rss/1e6)+'MB');
const write=(name,data)=>{const f=path.join(outDir,name);fs.writeFileSync(f,data,{mode:0o600});fs.chmodSync(f,0o600);return f;};
function harness(){const h=createHarness({runtime:true,production:true});h.ctx.XLSX=require('../app/vendor/xlsx-0.20.3.min.js');h.ctx.DOMParser=LightDOMParser;h.run('render=()=>{}');return h;}
// Comparable view of a catalog: per product id the canonical JSON, plus counts.
const CATALOG=`JSON.stringify((()=>{const ids=[...S.products.keys()].sort();return {products:S.products.size,skus:[...S.products.values()].reduce((n,p)=>n+p.variants.length,0),queue:S.queue.size,content:S.content.size,
 product_ids_sha:ids.join('|'),products_sha:ids.map(id=>JSON.stringify(stableValue105(S.products.get(id)))).join('\\n')};})())`;
const digest=x=>({...x,product_ids_sha:sha(x.product_ids_sha),products_sha:sha(x.products_sha)});
(async()=>{
 fs.mkdirSync(outDir,{recursive:true,mode:0o700});fs.chmodSync(outDir,0o700);const raw=fs.readFileSync(backupPath),text=(backupPath.endsWith('.gz')?zlib.gunzipSync(raw):raw).toString('utf8');
 const result={backup_sha256:sha(raw),checks:{}};
 // Expected: the backup itself (independent of any harness).
 let d=JSON.parse(text);const expected={products:d.products.length,skus:d.products.reduce((n,p)=>n+(p.variants||[]).length,0),queue:d.queue.length,content:d.content.length};
 result.expected=expected;result.backup_has_secrets=backupSecrets(JSON.parse(text).cfg);
 // (a) clean profile, production build.
 let h=harness();await h.run('Store.init()');h.ctx.d=d;h.run('tzValidateBackup(d)');
 await h.run('releaseStorage.write(Store.db,[],releaseStorage.portableRows(d))');h.ctx.d=null;d=null;await h.run('productionLoad()');
 const stateBefore=h.run('PRODUCTION_MIGRATION.state');await h.run('productionPreview()');await h.run('productionApply()');log('clean profile restored, migration '+stateBefore+' → '+h.run('PRODUCTION_MIGRATION.state'));
 const a=JSON.parse(h.run(CATALOG)),settingsA=JSON.parse(h.run(SETTINGS)),wireA=JSON.stringify(await h.run('pimSiteWire()'));
 const {q,examples}=quality(h);log('quality computed');
 const writable=await h.run('persist().then(()=>true,e=>String(e.message))');
 result.checks.clean_profile={migration_state_before:stateBefore,migration_state_after:h.run('PRODUCTION_MIGRATION.state'),writable:writable===true?true:writable,
  counts_equal_backup:a.products===expected.products&&a.skus===expected.skus&&a.queue===expected.queue&&a.content===expected.content,catalog:digest(a),wire_sha256:sha(wireA)};
 h=null;if(global.gc)global.gc();
 // (b) an already migrated PIM: the owner's «Восстановить из файла».
 let h2=harness();await h2.run('Store.init()');h2.ctx.d=JSON.parse(text);h2.run('tzValidateBackup(d)');
 await h2.run('releaseStorage.write(Store.db,[],releaseStorage.portableRows(d))');await h2.run('productionLoad()');await h2.run('productionPreview()');await h2.run('productionApply()');
 await h2.run('applyRestoreData(d)');h2.ctx.d=null;await h2.run('persist()');
 const b=JSON.parse(h2.run(CATALOG)),settingsB=JSON.parse(h2.run(SETTINGS)),wireB=JSON.stringify(await h2.run('pimSiteWire()'));log('owner path restored');
 result.checks.owner_restore={catalog:digest(b),catalog_equal_clean_profile:a.products_sha===b.products_sha&&a.product_ids_sha===b.product_ids_sha,settings_equal_clean_profile:JSON.stringify(settingsA)===JSON.stringify(settingsB),
  wire_equal_clean_profile:sha(wireA)===sha(wireB),counts_equal_backup:b.products===expected.products&&b.skus===expected.skus&&b.queue===expected.queue&&b.content===expected.content};
 result.settings=settingsB;
 // Supplier files: parse only — data time and rows.
 const files=[];for(const src of JSON.parse(fs.readFileSync(sourcesPath,'utf8'))){const file=fs.readFileSync(src.file),stat=fs.statSync(src.file);
  h2.ctx.download={blob:new Blob([file]),url:'https://import.invalid/'+encodeURIComponent(path.basename(src.file)),lastModified:stat.mtimeMs};h2.ctx.supId=src.supplier_id;
  const p=await h2.run('workflowParseSource(download,S.cfg.suppliers.find(s=>s.id===supId))');const st=p.source_time,now=Date.now();h2.ctx.st=st;
  files.push({supplier_id:src.supplier_id,supplier:h2.run(`S.cfg.suppliers.find(s=>s.id===${JSON.stringify(src.supplier_id)}).name`),file_sha256:sha(file),rows:p.rows.length-p.hdr-1,sheet:p.sheet,
   data_time:st.at?new Date(st.at).toISOString():null,provenance:st.provenance,header:st.header?new Date(st.header).toISOString():null,file_mtime:st.mtime?new Date(st.mtime).toISOString():null,warning:st.warning,
   age_hours:st.at?Math.round((now-st.at)/360000)/10:null,note:h2.run('sourceFileTimeNote(st)')});h2.ctx.download=null;}
 result.files=files;result.quality=q;result.network_requests=(h2.requests||[]).length;result.autoprices_enabled=h2.run('S.cfg.autoprices_enabled===true');
 write('restore-and-quality.json',JSON.stringify(result,null,1)+'\n');write('owner-decision-examples.json',JSON.stringify(examples,null,1)+'\n');
 console.log(JSON.stringify({expected,clean:result.checks.clean_profile.counts_equal_backup,writable:result.checks.clean_profile.writable,owner:result.checks.owner_restore,secrets:result.backup_has_secrets}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
