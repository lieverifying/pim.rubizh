// Stage 5.5 (owner D-80): the catalogue of the closed staging site. From a rehearsal backup: READY products that pass the
// current «Перша хвиля» rules, at most LIMIT (stable order by id), sent to a LOCAL SITE exactly like PIM's own publish
// (contract v3 chunks, categories and the freshness policy in chunk 0, Bearer pim_key). The supplier data time of the
// chosen products is moved to the build moment minus 6 h IN MEMORY ONLY (the rehearsal files are weeks old and would be
// hidden by the 5.1 rule; the test fixture does the same), so the buyer path with card payment can be checked on staging.
// No costs are sent. The backup file is not modified.
// Usage: node audit/staging-dump-5-5.cjs BACKUP.json.gz SITE_BASE PIM_KEY OUT.json [LIMIT]
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const {createHarness}=require('../app/tests/isolated-harness.cjs');
const [backupPath,siteBase,pimKey,outPath,limitArg]=process.argv.slice(2);if(!outPath)throw Error('Usage: BACKUP SITE_BASE PIM_KEY OUT.json [LIMIT]');
const LIMIT=Math.max(1,Math.min(3000,Number(limitArg)||500)),AGE_MS=6*3600000;
const raw=fs.readFileSync(backupPath);const d=JSON.parse((backupPath.endsWith('.gz')?zlib.gunzipSync(raw):raw).toString('utf8'));
const h=createHarness({runtime:true,production:true});h.run('render=()=>{}');
h.ctx.__d=d;h.run('S.cfg=__d.cfg;S.products=new Map(__d.products.map(p=>[p.id,p]));S.queue=new Map((__d.queue||[]).map(q=>[q.k,q]));S.content=new Map((__d.content||[]).map(c=>[c.key,c]));');h.ctx.__d=null;
const chosen=JSON.parse(h.run(`JSON.stringify([...S.products.values()].filter(p=>!p.archived&&finalDecision(p).state==="READY"&&waveStatus(p).ok).map(p=>p.id).sort().slice(0,${LIMIT}))`));
h.ctx.__ids=chosen;h.ctx.__at=Date.now()-AGE_MS;
h.run(`for(const id of __ids){const p=S.products.get(id);for(const v of p.variants||[])for(const o of Object.values(v.offers||{})){
 if(o.source_generated_at!=null)o.source_generated_at=__at;if(typeof o.stock_observed_at==='number')o.stock_observed_at=__at;if(typeof o.source_updated_at==='number')o.source_updated_at=__at;}markProduct(p,true);}bumpData();`);
const wire=JSON.parse(h.run('JSON.stringify(pimSiteWire({quoteSale:true}))'));
const keep=new Set(chosen);wire.products=wire.products.filter(p=>keep.has(p.id));
const freshness=JSON.parse(h.run('JSON.stringify(freshnessPolicy())'));
const head=Object.fromEntries(JSON.parse(h.run('JSON.stringify(Object.keys(PIM_SITE_CONTRACT).filter(k=>k!=="envelope"))')).map(k=>[k,wire[k]]));
const CHUNK=100,chunks=[];for(let i=0;i<wire.products.length;i+=CHUNK)chunks.push(wire.products.slice(i,i+CHUNK));if(!chunks.length)chunks.push([]);
const batchId='PB-'+wire.catalog_revision+'-'+h.run('fnvHash('+JSON.stringify('staging-5.5-'+chosen.join(','))+')');
(async()=>{
 for(let i=0;i<chunks.length;i++){
  const body={...head,version:wire.version,pim_version:wire.pim_version,currency:wire.currency,generated_at:wire.generated_at,catalog_revision:wire.catalog_revision,batch_id:batchId,chunk_index:i,chunk_count:chunks.length,products:chunks[i],hide_ids:[]};
  if(i===0){body.categories=wire.categories;body.category_catalog_hash=wire.category_catalog_hash;body.freshness_policy=freshness;}
  const r=await fetch(siteBase.replace(/\/$/,'')+'/api/pim/sync',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+pimKey},body:JSON.stringify(body)});
  const t=await r.text();if(!r.ok)throw Error('SITE refused chunk '+i+': '+r.status+' '+t.slice(0,300));
 }
 const by=f=>wire.products.reduce((m,p)=>{const k=f(p);m[k]=(m[k]||0)+1;return m;},{});
 const supplier=JSON.parse(h.run('JSON.stringify(Object.fromEntries((S.cfg.suppliers||[]).map(s=>[s.id,s.name])))'));
 const summary={backup:path.basename(backupPath),built_at:new Date().toISOString(),data_time_shifted_to:new Date(Date.now()-AGE_MS).toISOString(),limit:LIMIT,products:wire.products.length,skus:wire.products.reduce((n,p)=>n+p.variants.length,0),
  by_supplier:by(p=>supplier[p.variants[0]?.fulfillment_supplier_id]||String(p.variants[0]?.fulfillment_supplier_id||'?')),by_root_category:by(p=>String(p.category_path?.[0]||p.category||'?').split(' / ')[0]),freshness_policy:freshness,chunks:chunks.length};
 fs.writeFileSync(outPath,JSON.stringify(summary,null,1)+'\n');console.log(JSON.stringify({products:summary.products,skus:summary.skus,chunks:summary.chunks}));
})().catch(e=>{console.error(String(e.message||e));process.exit(1);});
