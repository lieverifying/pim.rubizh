'use strict';
// Stage 5.2 rehearsal: shared pieces (private outputs only). The settings that must survive reset/backup/restore, the
// per-supplier quality view of a catalog and anonymous-safe examples for owner decisions (names and reasons only).
const SETTINGS=`JSON.stringify({categories:(S.cfg.canonical_categories||[]).length,suppliers:S.cfg.suppliers.map(s=>({id:s.id,name:s.name,auto:s.auto,priority:s.priority,terms:s.terms,mapping:s.mapping,fulfillment:s.fulfillment,inventory_policy:s.inventory_policy||null,source_time_ignore_header:s.source_time_ignore_header,sizes_from_description:s.sizes_from_description})),
 catMap:S.cfg.catMap,catRules:S.cfg.catRules,colorMap:S.cfg.colorMap,sizeMap:S.cfg.sizeMap,brandMap:S.cfg.brandMap,supplierAliases:S.cfg.supplierAliases,supplier_category_mapping:S.cfg.supplier_category_mapping||null,
 pricing:[S.cfg.pricing_policy_version,S.cfg.minMargin,S.cfg.bigPriceFrom,S.cfg.bigPriceMargin,S.cfg.kitMargin,S.cfg.discountMarginFloor,S.cfg.donPct,S.cfg.donCapPct,S.cfg.taxPct,S.cfg.acquiringPct,S.cfg.round,S.cfg.roundMode,S.cfg.tiers,S.cfg.defaultMarkup,S.cfg.rules],
 freshness:freshnessPolicy(),inventory_policy_version:S.cfg.inventory_policy_version,classification_version:S.cfg.classification_version,model_colors_version:S.cfg.model_colors_version,autoprices_enabled:S.cfg.autoprices_enabled===true})`;
function quality(h){
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
 return {q,examples};
}
module.exports={SETTINGS,quality};
