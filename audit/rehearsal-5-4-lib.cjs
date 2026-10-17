'use strict';
// Stage 5.4 rehearsal (private outputs only): what each moderation auto-rule did, and a fixed pseudo-random sample of
// automatic model merges for the owner to check (names, colours and SKU counts only — no prices, no supplier articles).
const RULES=`JSON.stringify((()=>{
 const sup=id=>S.cfg.suppliers.find(s=>s.id===id)?.name||id,sids=p=>uniq((p.variants||[]).flatMap(v=>Object.keys(v.offers||{}))),bump=(o,k,n=1)=>{o[k]=(o[k]||0)+n;};
 const merges={},absorbed={},consensus={},quote={},sizes={},provenance={};
 for(const p of S.products.values()){
  if(p.model_merge_rule&&!p.archived)for(const s of sids(p)){bump(merges[sup(s)]||(merges[sup(s)]={}),p.model_merge_rule);bump(absorbed[sup(s)]||(absorbed[sup(s)]={}),p.model_merge_rule,(p.model_source_ids||[]).length-1);}
  if(p.archived)continue;
  if(p.category_rule_id==='supplier-category-consensus')for(const s of sids(p))bump(consensus,sup(s));
  if(p.variants.some(finalUnitPriced))for(const s of sids(p))bump(quote[sup(s)]||(quote[sup(s)]={}),finalDecision(p).state);
  for(const v of p.variants)for(const [s,o] of Object.entries(v.offers||{})){const b=sizes[sup(s)]||(sizes[sup(s)]={});bump(b,(v.size_confidence_tier||'NONE')+'|'+(v.size_status||'NONE'));bump(provenance[sup(s)]||(provenance[sup(s)]={}),o.source_time_provenance||'NONE');}
 }
 const sizeModeration={};for(const p of S.products.values()){if(p.archived)continue;const d=finalDecision(p);if(d.reasons.some(r=>r.code==='size'))for(const s of sids(p))bump(sizeModeration,sup(s));}
 return {model_merges:merges,cards_absorbed:absorbed,category_consensus:consensus,quote_products:quote,size_states:sizes,size_moderation:sizeModeration,data_time_provenance:provenance,
  suppliers:S.cfg.suppliers.map(s=>({name:s.name,source_time_ignore_header:s.source_time_ignore_header===true,sizes_from_description:s.sizes_from_description===true}))};
})())`;
const SAMPLE=`JSON.stringify((()=>{
 const sup=id=>S.cfg.suppliers.find(s=>s.id===id)?.name||id;
 const merged=[...S.products.values()].filter(p=>!p.archived&&/^colour-slices-/.test(p.model_merge_rule||''));
 // Deterministic «random»: order by a hash of the model id, take 20.
 return merged.sort((a,b)=>fnvHash(a.id).localeCompare(fnvHash(b.id))).slice(0,20).map(p=>({model:p.model_name||p.name,rule:p.model_merge_rule,
  supplier:uniq(p.variants.flatMap(v=>Object.keys(v.offers||{}))).map(sup).join('+'),colours:mcColors(p).map(c=>[c.color,c.camouflage].filter(Boolean).join(' / ')),skus:p.variants.length,
  source_cards:(p.model_source_ids||[]).map(id=>S.products.get(id)?.name).filter(Boolean),category:canonicalPath(p.canonical_category_id)||null}));
})())`;
module.exports={RULES,SAMPLE};
