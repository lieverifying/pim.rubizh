function ceSupplierRewrite(text,style){
 if(!style)return text;
 // Literal restatements only: counts, negations, units and supplier evidence stay intact.
 return text.replace(/^(?:Виріб|Рюкзак|Сумка|Підсумок) має /iu,'Конструкція передбачає ').replace(/^Має /iu,'Передбачено ').replace(/^Матеріал:\s*/iu,'Матеріал виробу: ').replace(/^Об[’']єм:\s*/iu,'Об’єм виробу: ').replace(/^Вага:\s*/iu,'Вага виробу: ');
}
// Preserve product information; language gaps and contradictions must be visible.
function ceContentBlock(d){return !!(d?.conflicts?.length||d?.languageWarnings?.length||d?.sourceCoverage<1||d?.attributeCoverage<1||d?.commercialInTechnical?.length);}
// Decode supplier entities before segmentation: the semicolon in &deg; is not a sentence.
ceSourcePlain=function(raw){
 let text=String(raw||'');
 const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',deg:'°',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',sup2:'²',sup3:'³',times:'×',hellip:'…',bull:'•',copy:'©',reg:'®'};
 for(let pass=0;pass<3;pass++){
  const decoded=text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/giu,(all,key)=>{
   if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):all;}
   return entities[key.toLowerCase()]??all;
  });if(decoded===text)break;text=decoded;
 }
 text=text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 text=text.replace(/<br\s*\/?>|<\/(?:p|li|div|h[1-6]|tr)>/gi,'\n').replace(/<\/(?:td|th)>/gi,'; ').replace(/<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi,' ');
 const el=document.createElement('textarea');el.innerHTML=text;
 return el.value.replace(/[^\S\n]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
};
function ceSourceUnits(text){
 // Protect still unknown HTML entities from the list separator as well.
 return String(text).split(/\n+|(?<!&[a-zA-Z]{1,20});\s*|(?<=[!?])\s+|(?<=\.)\s+(?=[A-ZА-ЯІЇЄҐ])/u).map(s=>s.replace(/^[•▪–—-]+\s*/u,'').trim()).filter(Boolean);
}
function ceCommercialOnly(text){
 const hasTechnical=/\d\s*(?:кг|г|гр|см|мм|л|мл|м[²2]|%|°)(?=$|[^\p{L}])|комплект(?:аці|аци)|не вход|не міст|не содерж|не використ|не использ|не можна|нельзя|заборон|запрещ|\b(?:molle|cordura|stanag|ykk)\b/iu.test(text);
 if(hasTechnical)return false;
 return /^(?:(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+|(?:\+?380)[\d ()-]{8,})$/iu.test(text)||/^(?:ціна|цена|вартість|стоимость|доставка|оплата|передплат\p{L}*|предоплат\p{L}*|наявність|наличие|замовляйте|заказывайте|наш магазин|наш менеджер|для замовлення|вкажіть у коментар|обов.?язково вкажіть|зв.яжеться з вами|ми пропонуємо|мы предлагаем)(?=$|[^\p{L}])/iu.test(text);
}
// Stage 5.5 (owner D-66…D-68): commercial text is cut by FRAGMENT. G1 prices and surcharges, G2 stock / lead time / delivery /
// payment, G3 another shop and calls to action, G4 contacts and links, G5 the supplier's name where the product brand differs,
// G6 structural junk. D-67: a technical sentence (numbers with units, kit contents, «not included», protection class,
// standards, materials, sizes) loses only G1/G4/G5 fragments; G2/G3 in it cannot be cut without touching facts, so the sentence
// stays and the draft is marked (never applied automatically). Everything cut is listed (D-68); the supplier original is
// never changed — only the draft is built from the cleaned text.
const CE_GROUP_LABEL={G1:'Ціни та доплати',G2:'Наявність, строки, умови',G3:'Чужий магазин і заклики',G4:'Контакти й посилання',G5:'Постачальник замість бренду',G6:'Службова структура'};
const CE_UNIT_RE=/\d[\d.,]*\s*(?:кг|г|гр|см|мм|л|мл|м[²2]|%|°)(?=$|[^\p{L}])/giu;
const CE_TECH=/\d[\d.,]*\s*(?:кг|г|гр|см|мм|л|мл|м[²2]|%|°)(?=$|[^\p{L}])|комплект(?:аці|аци)|не вход|не міст|не содерж|клас\p{L}*\s+захист|класс\p{L}*\s+защит|дсту|stanag|матеріал|материал|(?<![\p{L}])(?:molle|cordura|ykk)(?![\p{L}])|(?:розмір|размер)\p{L}*\s*[:–-]?\s*\d|\d+\s*[xх×*]\s*\d+/iu;
const CE_G1=/(?:^|[^\p{L}\d])[+]?\s*\d[\d\s.,]*\s?(?:грн|₴|uah|usd|eur|\$|€)\.?(?=$|[^\p{L}])|[$€]\s?\d|(?:^|[^\p{L}])(?:ціна|ціни|ціною|цена|цены|вартість|вартості|стоимость|знижк\p{L}*|скидк\p{L}*|акці[яії]\p{L}*|акци[яи]\p{L}*|розпродаж\p{L}*|распродаж\p{L}*|опт|оптом|оптов\p{L}*|гуртом|гуртов\p{L}*|безкоштовн\p{L}*\s+доставк\p{L}*|бесплатн\p{L}*\s+доставк\p{L}*)(?=$|[^\p{L}])/iu;
const CE_G2=/(?:^|[^\p{L}])(?:є\s+в\s+наявності|в\s+наявності|немає\s+в\s+наявності|наявність|в\s+наличии|нет\s+в\s+наличии|наличие|під\s+замовлення|на\s+замовлення|под\s+заказ|на\s+заказ|термін\p{L}*\s+виготовлен\p{L}*|срок\p{L}*\s+изготовлен\p{L}*|відправк\p{L}*|відправля\p{L}*|відправимо|отправк\p{L}*|отправля\p{L}*|доставк\p{L}*|оплат\p{L}*|передоплат\p{L}*|предоплат\p{L}*|накладен\p{L}*\s+плат\p{L}*|наложенн\p{L}*\s+плат\p{L}*|уточнюйте|уточняйте|може\s+виготовлят\p{L}*|можуть\s+виготовлят\p{L}*|может\s+изготавлива\p{L}*)(?=$|[^\p{L}])|(?:^|[^\p{L}\d])\d+(?:\s*[-–/]\s*\d+)?\s*(?:робочих\s+|рабочих\s+)?(?:днів|дні|дня|дней|дн\.)(?=$|[^\p{L}])/iu;
const CE_G3=/(?:^|[^\p{L}])(?:наш\p{L}*\s+(?:інтернет[\s-]?|интернет[\s-]?)?магазин\p{L}*|(?:інтернет|интернет)[\s-]?магазин\p{L}*|у\s+нас|наш\p{L}*\s+менеджер\p{L}*|замовляйте|заказывайте|купуйте|покупайте|поспішайте|спешите|телефонуйте|звоніть|звоните|пишіть|пишите|для\s+замовлення|для\s+заказа|вкажіть\s+у\s+коментар\p{L}*|обов.?язково\s+вкажіть|зв.яжеться\s+з\s+вами|ми\s+пропонуємо|мы\s+предлагаем|планета\s+спорт)(?=$|[^\p{L}])/iu;
const CE_G4=[/(?:https?:\/\/|www\.)\S+/giu,/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/giu,/(?:(?:тел\.?|телефон|tel\.?)\s*:?\s*)?(?<![\d.\-\/])(?:\+?\s?38\s?)?\(?0\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?![\d.\-])/giu,/(?<![\p{L}])(?:telegram|телеграм\p{L}*|viber|вайбер\p{L}*|whatsapp|вотсап\p{L}*|instagram|інстаграм\p{L}*|инстаграм\p{L}*)(?:\s*:?\s*@?[A-Za-z0-9_.]{3,})?/giu,/(?<![\w.@])@[A-Za-z0-9_.]{3,}/giu,/(?<![\p{L}\d.@-])[a-z0-9-]{2,}\.(?:com\.ua|in\.ua|org\.ua|kiev\.ua|com|ua|net|org|shop|store)(?![\p{L}\d])/giu];
const CE_SUPPLIER_ALIASES=[['кіборг','киборг','kiborg'],['mwin','мвін','мвин','militarywinner'],['tacticalbelt','тактикалбелт'],['armoline','армолайн'],['ukrtec','укртек']];
const CE_SUPPLIER_WORDS={кіборг:'к[іи]борг',киборг:'к[иі]борг',kiborg:'kiborg',mwin:'m[\\s-]?win',мвін:'м[\\s-]?він',мвин:'м[\\s-]?вин',militarywinner:'military\\s+winner',tacticalbelt:'tactical[\\s-]?belt',тактикалбелт:'тактикал[\\s-]?белт',armoline:'armoline',армолайн:'армолайн',ukrtec:'ukr[\\s-]?tec',укртек:'укр[\\s-]?тек'};
const ceAliasKey=s=>String(s||'').toLowerCase().replace(/[^\p{L}\d]+/gu,'');
function ceSupplierNameRegex(p){
 const brand=ceAliasKey(p?.brand),groups=CE_SUPPLIER_ALIASES.filter(g=>!g.some(a=>brand&&(brand===a||brand.includes(a))));
 if(!groups.length)return null;
 const alt=uniq(groups.flat().map(a=>CE_SUPPLIER_WORDS[a]).filter(Boolean)).join('|');
 return new RegExp('(?:\\s*(?:від|от|by|компанії|компании|фірми|фирмы|бренду|бренда|виробника|производителя)\\s+)?[«"“]?(?<![\\p{L}\\d])(?:'+alt+')(?![\\p{L}\\d])[»"”]?','giu');
}
function ceTechTokens(t){return (String(t).match(CE_UNIT_RE)||[]).map(x=>x.replace(/\s+/g,'').toLowerCase());}
function ceTidy(t,end){
 let x=String(t).replace(/\(\s*[,;:.]?\s*\)/g,'').replace(/\s+([,.;:!?)])/g,'$1').replace(/([(])\s+/g,'$1').replace(/([,;:])\s*(?=[,;:.!?])/g,'').replace(/\s{2,}/g,' ').replace(/^[\s,;:—–\-/]+/u,'').replace(/[\s,;:—–\-/]+$/u,'').trim();
 if(x&&end&&!/[.!?…]$/.test(x))x+=end;return x;
}
// A table cell such as «105 мм» is data, never an empty line.
function ceMeaningful(t){return (String(t).match(/\p{L}/gu)||[]).length>=3||ceTechTokens(t).length>0;}
// Cuts the price parts of a sentence: a parenthesis with a price, else the part between commas, dashes or slashes.
function ceCutG1(text,removed){
 const out=text.replace(/\([^()]*\)/g,m=>{if(CE_G1.test(m)){removed.push({group:'G1',text:m,reason:'ціна або доплата'});return '';}return m;});
 const parts=out.split(/(\s*[,;]\s*|\s[—–-]\s|\s\/\s)/);
 for(let i=0;i<parts.length;i+=2)if(CE_G1.test(parts[i])){removed.push({group:'G1',text:parts[i].trim(),reason:'ціна або доплата'});parts[i]='';if(i>0)parts[i-1]='';else if(parts[1]!=null)parts[1]='';}
 return parts.join('');
}
function ceCutSpans(text,re,group,reason,removed){return text.replace(re,m=>{if(!m.trim())return m;removed.push({group,text:m.trim(),reason});return ' ';});}
function ceCleanUnit(text,p){
 const end=/[.!?…]$/.test(text)?text.slice(-1):'',technical=CE_TECH.test(text);
 if(!technical){
  if(CE_G3.test(text))return {text:'',removed:[{group:'G3',text,reason:'інший магазин або заклик'}],warning:null};
  if(CE_G2.test(text))return {text:'',removed:[{group:'G2',text,reason:'наявність, строки чи умови продажу'}],warning:null};
 }
 const removed=[];let x=ceCutG1(text,removed);const afterG1=ceTechTokens(x);
 for(const re of CE_G4)x=ceCutSpans(x,re,'G4','контакт або посилання',removed);
 const supplier=ceSupplierNameRegex(p);if(supplier)x=ceCutSpans(x,supplier,'G5','назва постачальника замість бренду «'+(p?.brand||'—')+'»',removed);
 // D-67 invariant: only a cut price fragment may take a number with a unit away.
 if(afterG1.some(t=>!ceTechTokens(x).includes(t))){const keep=[];const back=ceCutG1(text,keep);return {text:ceTidy(back,end),removed:keep,warning:'Комерційний текст у технічному реченні'};}
 x=ceTidy(x,end);
 if(!ceMeaningful(x))return {text:'',removed:removed.length?removed:[{group:'G6',text,reason:'рядок без тексту'}],warning:null};
 return {text:x,removed,warning:technical&&(CE_G2.test(x)||CE_G3.test(x))?'Комерційний текст у технічному реченні':null};
}
// The final check of a ready text (D-69 condition 5 and the stage acceptance): any G1–G5 signal left.
function ceCommercialSignals(text,p){
 const t=String(text||''),out=[];
 for(const [group,re] of [['G1',CE_G1],['G2',CE_G2],['G3',CE_G3]]){const m=t.match(new RegExp(re.source,'iu'));if(m)out.push({group,text:m[0].trim()});}
 for(const re of CE_G4){const m=t.match(new RegExp(re.source,'iu'));if(m)out.push({group:'G4',text:m[0].trim()});}
 const supplier=ceSupplierNameRegex(p);if(supplier){const m=t.match(new RegExp(supplier.source,'iu'));if(m)out.push({group:'G5',text:m[0].trim()});}
 return out;
}
const CE_HEADING_WORDS=/^(?:комплектація|комплектация|комплект поставки|характеристики|технічні характеристики|технические характеристики|опис|описание|особливості|особенности|переваги|преимущества|ключові переваги|призначення|назначение|матеріали?|материалы?|догляд|уход|розміри|размеры|розмірна сітка|размерная сетка|конструкція|конструкция)$/iu;
function ceHeadingLike(text){const t=String(text).trim().replace(/\s*:\s*$/,'');return !/\d/.test(t)&&t.split(/\s+/).length<=4&&(CE_HEADING_WORDS.test(t)||/:\s*$/.test(text));}
function ceSourceSectionTitle(text){
 if(/не вход|не міст|не содерж|не можна|нельзя|заборон|запрещ|обмежен|ограничен|попереджен|предупрежден|правил\p{L}* експлуатац/iu.test(text))return 'Обмеження та важливі зауваження';
 if(/комплект|поставк/iu.test(text))return 'Комплектація';
 if(/догляд|прання|прати|сушити/iu.test(text))return 'Догляд';
 if(/захист|випроб|дсту|stanag|клас|стандарт/iu.test(text))return 'Захист: дані постачальника';
 if(/матеріал|тканин|бавовн|нейлон|поліестер|cordura|softshell/iu.test(text))return 'Матеріали';
 if(/признач|використ|підходить/iu.test(text))return 'Призначення';
 return 'Конструкція та особливості';
}
function tzSourceSections(p,data=ceExtract(p)){
 const sources=[ceSupplierSource(p),...(p.contentSourceKeys||[]).map(k=>S.content.get(k)?.originalDesc||S.content.get(k)?.d||'')].filter(Boolean);
 const seen=new Set(),sections=[],languageWarnings=[],omitted=[],excluded=[];let total=0;
 const removed=[],commercialInTechnical=[];
 for(const source of sources){let hint=null,pending=null;const emptyHeading=()=>{if(pending)removed.push({group:'G6',text:pending,reason:'заголовок без тексту'});pending=null;};for(const line of ceSourceUnits(ceSourcePlain(source))){
  const raw=autoUkText(line).replace(/^[•▪–—-]+\s*/u,'').trim();if(!raw)continue;
  if(/^[\p{P}\p{S}\s]+$/u.test(raw)){removed.push({group:'G6',text:raw,reason:'рядок без тексту'});continue;}
  // Stage 5.5 (G6): a supplier heading gives its section to the next lines; a repeated or empty heading is removed.
  if(ceHeadingLike(raw)){emptyHeading();const k='h:'+raw.toLowerCase().replace(/[\s:]+$/,'');if(seen.has(k))removed.push({group:'G6',text:raw,reason:'повторний заголовок'});else{seen.add(k);const t=ceSourceSectionTitle(raw);hint=t==='Конструкція та особливості'?null:t;pending=raw;}continue;}
  const clean=ceCleanUnit(raw,p);for(const r of clean.removed)removed.push(r);
  if(!clean.text){excluded.push(raw);continue;}
  if(clean.warning)commercialInTechnical.push(clean.text);
  const text=clean.text;
  const key=text.toLowerCase().replace(/\s+/g,' ').replace(/[\s.:;]+$/,'');if(seen.has(key))continue;seen.add(key);pending=null;
  total++;
  const field=ceFactField(text.split(/[:—–]/u)[0]),conflict=data.conflicts.find(c=>c.key===field?.[0]||c.values.some(v=>{
   const value=autoUkText(v.value).toLowerCase();if(value.length<3)return false;
   return ceLiteralRule(value,'')[0].test(text.toLowerCase());
  }));
  if(conflict){omitted.push({reason:'conflict',text});continue;}
  if(hasRussianText(text)){languageWarnings.push({label:'Речення постачальника',value:text,source:'Опис постачальника'});omitted.push({reason:'language',text});continue;}
  const own=ceSourceSectionTitle(text),title=hint&&own==='Конструкція та особливості'?hint:own;
  sections.push({title,text});
 }emptyHeading();}
 return {sections,languageWarnings,omitted,excluded,removed,commercialInTechnical,total,coverage:total?sections.length/total:1};
}
function ceSupplementalFacts(p){
 const groups=new Map(),languageWarnings=[],excluded=[],removed=[];
 const sets=[{attrs:p.attrs,source:'Характеристики master'},...(p.contentSourceKeys||[]).map(k=>({attrs:S.content.get(k)?.a,source:'Характеристики прайсу '+k.split('|')[0]}))];
 const technicalLabel=label=>!/^(?:sku|артикул|код|id|постачальник|поставщик|supplier|залишок|остаток|stock|наявність|наличие|url|посилання|ссылка|фото|photos?|images?|опис|description|категорія|category)(?=$|[^\p{L}])/iu.test(label)&&!/(?:^|[^\p{L}])(?:ціна|цена|вартість|стоимость|cost|payout|price|purchase|wholesale|profit|margin|commission|закуп\p{L}*|собіварт\p{L}*|маржа|націн\p{L}*|прибут\p{L}*|коміс\p{L}*)(?=$|[^\p{L}])/iu.test(label);
 for(const set of sets)for(const [raw,value] of Object.entries(set.attrs||{})){
  if(ceFactField(raw)||value==null||typeof value==='object')continue;
  const label=autoUkText(ceSourcePlain(raw)).trim(),val=autoUkText(ceSourcePlain(String(value))).trim();
  if(!label||!val||/^(?:-|—|n\/?a|null|undefined)$/iu.test(val))continue;
  if(!technicalLabel(label)){excluded.push(label);continue;}
  // Stage 5.5 (D-66): a supplier attribute about stock, lead time, delivery or payment, or the product name repeated as an
  // attribute, is not a characteristic; a price, contact or link in a value is cut with the attribute.
  if(CE_G2.test(label)||/^(?:назва|название|назва модифікації|название модификации)$/iu.test(label)){removed.push({group:CE_G2.test(label)?'G2':'G6',text:label+': '+val,reason:CE_G2.test(label)?'наявність, строки чи умови продажу':'назва товару як характеристика'});continue;}
  {const sig=ceCommercialSignals(label+': '+val,p).filter(x=>x.group!=='G5');if(sig.length){removed.push({group:sig[0].group,text:label+': '+val,reason:CE_GROUP_LABEL[sig[0].group]});continue;}}
  if(hasRussianText(label+' '+val)){languageWarnings.push({label,value:val,source:set.source});continue;}
  const key=label.toLowerCase(),group=groups.get(key)||{key:'extra:'+key,label,values:[],sources:[]};
  group.values.push(val);group.sources.push(set.source);groups.set(key,group);
 }
 const facts=[],conflicts=[];
 for(const group of groups.values()){
  // Stage 5.5 (D-70): one value in different formats is one value.
 const values=[...new Map(group.values.map(v=>[ceFormatKey(v),v])).values()];if(values.length>1){conflicts.push({key:group.key,label:group.label,values:values.map(value=>({value,source:uniq(group.sources).join(' · ')}))});continue;}
  facts.push({key:group.key,label:group.label,value:values[0],sources:uniq(group.sources),source:group.sources[0]});
 }
 return {facts,conflicts,languageWarnings,excluded,removed,coverage:languageWarnings.length||conflicts.length?0:1};
}
const tzAccepted=memoProd('ceAccepted103',ceAccepted);ceAccepted=p=>tzAccepted(p);
const tzOldGenerate=ceGenerate;
const tzOldSignature=ceInputSignature;ceInputSignature=function(p,data=ceExtract(p)){return tzOldSignature(p,data)+'|'+fnvHash(JSON.stringify([ceTranslationSignature(),p.attrs,ceSupplierSource(p),...(p.contentSourceKeys||[]).map(k=>{const c=S.content.get(k);return [c?.a,c?.originalDesc||c?.d||''];})]))};
ceGenerate=function(p,style=0){
 const draft=tzOldGenerate(p,style),source=tzSourceSections(p,draft),extra=ceSupplementalFacts(p),groups=new Map();
 for(const {title,text} of source.sections){if(!groups.has(title))groups.set(title,[]);groups.get(title).push(text);}
 const n=((Number(style)||0)%4+4)%4,headings=[...groups];if(n===1)headings.reverse();if(n===2)headings.sort(([a],[b])=>a.localeCompare(b));
 const nameRemoved=[],name=ceTidy(ceCutG1(cleanLocalizedName(autoUkText(String(p.name||''))).trim(),nameRemoved),'');
 let html=name&&!hasRussianText(name)?`<p><strong>${htmlSafeText(name)}</strong></p>`:'';
 for(const [title,lines] of headings){html+=`<p><strong>${htmlSafeText(title)}</strong></p>`;html+=n===3?'<ul>'+lines.map(s=>`<li>${htmlSafeText(ceSupplierRewrite(s,n))}</li>`).join('')+'</ul>':lines.map(s=>`<p>${htmlSafeText(ceSupplierRewrite(s,n))}</p>`).join('');}
 if(!source.sections.length)html=draft.html;
 else if(draft.facts.length)html+='<p><strong>Характеристики</strong></p><ul>'+draft.facts.filter(f=>!ceCommercialSignals(f.label+': '+f.value,p).length).map(f=>'<li>'+htmlSafeText(f.label+': '+f.value)+'</li>').join('')+'</ul>';
 if(extra.facts.length)html+='<p><strong>Додаткові характеристики постачальника</strong></p><ul>'+extra.facts.map(f=>'<li>'+htmlSafeText(f.label+': '+f.value)+'</li>').join('')+'</ul>';
 if(!name||hasRussianText(name))html='';
 // Stage 5.5: one last pass over every paragraph and list item — facts of the base generator and the name heading included —
 // so no path of the draft skips the cleaning (D-66).
 const post=[],postWarn=[],plainOf=t=>String(t).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&amp;/g,'&');
 html=html.replace(/<(p|li)>([\s\S]*?)<\/\1>/g,(all,tag,inner)=>{const strong=/^<strong>([\s\S]*)<\/strong>$/.exec(inner),body=strong?strong[1]:inner;if(/<[a-z]/i.test(body))return all;
  const text=plainOf(body),clean=ceCleanUnit(text,p);if(clean.text===text&&!clean.removed.length)return all;
  for(const r of clean.removed)post.push(r);if(clean.warning)postWarn.push(clean.text);if(!clean.text)return '';
  const out=htmlSafeText(clean.text);return '<'+tag+'>'+(strong?'<strong>'+out+'</strong>':out)+'</'+tag+'>';}).replace(/<ul><\/ul>/g,'');
 const languageWarnings=[...draft.languageWarnings,...source.languageWarnings,...extra.languageWarnings];
 if(hasRussianText(name))languageWarnings.push({label:'Назва товару',value:name,source:'Master'});
 return {...draft,html,short:plainSupplierText(html).slice(0,280),facts:[...draft.facts,...extra.facts],factsUsed:draft.factsUsed+extra.facts.length,supplementalFacts:extra.facts.length,conflicts:[...draft.conflicts,...extra.conflicts],sourceCoverage:source.coverage,attributeCoverage:extra.coverage,sourceSentences:source.total,retainedSentences:source.sections.length,omittedSentences:source.omitted,excludedSentences:source.excluded,excludedAttributes:extra.excluded,removedFragments:[...nameRemoved.map(r=>({...r,reason:r.reason+' (у назві)'})),...source.removed,...extra.removed,...post],commercialInTechnical:[...source.commercialInTechnical,...postWarn],languageWarnings};
};
// Rendering and draft validation revisit the same cards; avoid repeating the translation pipeline.
const ceGenerateUncached108=ceGenerate,ceGeneratedCache108=new Map();let ceGeneratedChars108=0;
ceGenerate=function(p,style=0){
 const signature=JSON.stringify([CE_VERSION,style,p.id,p.name,p.category,p.brand,p.attrs,ceTranslationSignature(),ceSupplierSource(p),p.variants?.map(v=>[v.size,v.color]),(p.contentSourceKeys||[]).map(k=>{const c=S.content.get(k);return [k,c?.a,c?.originalDesc??c?.d];})]);
 const prior=ceGeneratedCache108.get(p);
 if(prior?.signature===signature){ceGeneratedCache108.delete(p);ceGeneratedCache108.set(p,prior);return structuredClone(prior.draft);}
 if(prior){ceGeneratedChars108-=prior.chars;ceGeneratedCache108.delete(p);}
 const draft=ceGenerateUncached108(p,style),chars=signature.length+JSON.stringify(draft).length;
 if(chars<=3000000){while(ceGeneratedCache108.size&&(ceGeneratedCache108.size>=128||ceGeneratedChars108+chars>3000000)){const key=ceGeneratedCache108.keys().next().value;ceGeneratedChars108-=ceGeneratedCache108.get(key).chars;ceGeneratedCache108.delete(key);}ceGeneratedCache108.set(p,{signature,chars,draft:structuredClone(draft)});ceGeneratedChars108+=chars;}
 return draft;
};
const ceMetrics108=ceMetricsHtml;
ceMetricsHtml=function(d){return ceMetrics108(d)+(d.supplementalFacts?`<p class="small">Додатково збережено характеристик поза шаблонами: ${d.supplementalFacts}.</p>`:'')+(d.commercialInTechnical?.length?`<p class="small" style="color:var(--warn)">Комерційний текст у технічному реченні · ${d.commercialInTechnical.length}: опис не застосовується автоматично.</p>`:'')+(d.removedFragments?.length?`<details><summary class="small">Вилучено з опису постачальника · ${d.removedFragments.length}</summary><ul class="small">${d.removedFragments.map(r=>'<li><b>'+esc(CE_GROUP_LABEL[r.group]||r.group)+'</b> — '+esc(r.text)+' <span class="muted">('+esc(r.reason)+')</span></li>').join('')}</ul></details>`:'');};

// Stage 5.5 (owner D-70): one value written in different formats is one value — case, spaces, см/cm, мм/mm, кг/kg, decimal
// «,»/«.», «х»/«x»/«×»/«*», the Russian/Ukrainian variant of one word (autoUkText). A different value stays a contradiction.
function ceFormatKey(v){
 return autoUkText(String(v??'')).toLowerCase().replace(/(\d),(\d)/g,'$1.$2').replace(/(\d)\s*[x×*х]\s*(?=\d)/giu,'$1х')
  .replace(/(?<![\p{L}])(?:cm)(?![\p{L}])/giu,'см').replace(/(?<![\p{L}])(?:mm)(?![\p{L}])/giu,'мм').replace(/(?<![\p{L}])(?:kg)(?![\p{L}])/giu,'кг').replace(/(?<![\p{L}])(?:g|гр)(?![\p{L}])/giu,'г')
  .replace(/[\s.:;,]+$/u,'').replace(/\s+/g,'');
}
const ceCanonical55=ceCanonical;ceCanonical=function(key,v){return ceFormatKey(ceCanonical55(key,v));};
// Stage 5.5 (owner D-69): a draft is applied automatically only when all five hold: no remarks after cleaning (ceContentBlock),
// completeness ≥ 60, similarity to another product < 85 % (ceChoose), the description is not manual, the final text has no
// G1–G5 signal. ceContentBlock and both thresholds are unchanged.
const CE_NEED_LABELS={conflict:'Суперечність даних',language:'Неперекладене речення',commercial:'Комерційний текст у технічному реченні',quality:'Мало даних (повнота < 60)',similar:'Схожий на інший товар'};
function ceAutoApplyReasons(p,d=p?.contentDraft){
 if(!p||!d)return ['draft'];
 const r=[];if(p.fieldMeta?.desc?.source==='manual')r.push('manual');if(ceContentBlock(d))r.push('block');
 if(!(Number(d.quality)>=60))r.push('quality');if(Number(d.similarity?.pct)>=85)r.push('similar');
 if(!d.html||ceCommercialSignals(plainSupplierText(d.html),p).length)r.push('commercial');
 return r;
}
function ceAutoApply(p,index){
 if(p.fieldMeta?.desc?.source==='manual')return {ok:false,reasons:['manual']};
 p.contentDraft=ceChoose(p,index);const reasons=ceAutoApplyReasons(p);if(reasons.length)return {ok:false,reasons};
 const r=ceApply(p);return r.ok?{ok:true}:{ok:false,reasons:['apply'],why:r.why};
}
// D-70: what is not applied stays a draft (the site shows the basic description from facts); the queue shows why.
function ceNeedReason(p,d=p?.contentDraft){
 if(!p||!d||p.fieldMeta?.desc?.source==='manual')return null;
 if(d.conflicts?.length)return 'conflict';if(d.languageWarnings?.length||!d.html)return 'language';
 if(d.commercialInTechnical?.length)return 'commercial';if(!(Number(d.quality)>=60))return 'quality';
 if(Number(d.similarity?.pct)>=85)return 'similar';if(ceContentBlock(d))return 'conflict';
 return null;
}
const ceNeedCounts=memoByData(function(){const c=Object.fromEntries(Object.keys(CE_NEED_LABELS).map(k=>[k,0]));for(const p of S.products.values()){if(p.archived||ceAccepted(p))continue;const k=ceNeedReason(p);if(k)c[k]++;}return c;});
const ceList55=ceList;ceList=function(){
 const f=String(CE_UI.filter||'');if(!f.startsWith('need:'))return ceList55();
 const need=f.slice(5);CE_UI.filter='all';try{return ceList55().filter(p=>!ceAccepted(p)&&ceNeedReason(p)===need);}finally{CE_UI.filter=f;}
};
const vContentEngine55=vContentEngine;vContentEngine=function(){
 const counts=ceNeedCounts(),last=(S.cfg.ceLastClean?.ids?.length||0)+(S.cfg.ceLastClean?.names?.length||0);
 return `<div class="panel" data-ce-need><h2>Потребують рішення</h2><p class="small muted">Описи, які не пройшли автоматичну перевірку, лишаються чернетками; на сайті — базовий опис із характеристик.</p><div class="row" role="group" aria-label="Причини">${Object.entries(CE_NEED_LABELS).map(([k,l])=>`<button class="btn small" data-act="ceNeedFilter" data-need="${k}" aria-pressed="${CE_UI.filter==='need:'+k}">${esc(l)} · ${counts[k]}</button>`).join('')}${String(CE_UI.filter).startsWith('need:')?'<button class="btn small" data-act="ceNeedFilter" data-need="">Усі</button>':''}</div>
 <div class="row" style="margin-top:10px"><button class="btn primary" data-act="ceApplyClean" ${CE_UI.busy?'disabled':''}>Застосувати всі чисті описи</button>${last?`<button class="btn" data-act="ceUndoClean" ${CE_UI.busy?'disabled':''}>Скасувати останнє застосування (${last})</button>`:''}</div></div>`+vContentEngine55();
};
async function ceApplyClean(){
 if(CE_UI.busy||S.snap){toast('Завершіть поточну операцію');return;}
 CE_UI.busy=true;const index=ceBuildIndex(),ready=[];
 try{
  let n=0;for(const p of S.products.values()){if(p.archived||p.fieldMeta?.desc?.source==='manual'||(ceAccepted(p)&&p.contentEngine?.inputFingerprint===ceFingerprint(p)))continue;
   p.contentDraft=ceChoose(p,index);markProduct(p,true);if(!ceAutoApplyReasons(p).length)ready.push(p);if(++n%25===0)await new Promise(r=>setTimeout(r,0));}
 }finally{CE_UI.busy=false;}
 // Stage 5.5 (D-75): clean name drafts go with the same button (history and undo of their own).
 const names=[...S.products.values()].filter(p=>!p.archived&&p.fieldMeta?.name?.source!=='manual'&&nameDraft(p).apply);
 if(!ready.length&&!names.length){toast('Чистих описів і назв для застосування немає');render();return;}
 if(!confirm(`Застосувати ${ready.length} чистих описів і ${names.length} чистих назв? Ручні описи й назви не зміняться. Попередні збережено — дію можна скасувати.`)){render();return;}
 try{const backup=await createAutoBackup('Перед застосуванням чистих описів',{force:true});if(!backup)await Store.set('contentengine/before_apply',backupData('Перед застосуванням чистих описів'));}catch(e){toast('Резервну копію не створено. Описи не змінено.');return;}
 const ids=[];for(const p of ready){if(ceApply(p).ok){ids.push(p.id);index.add(p,p.desc);}}
 const nameIds=[];for(const p of names)if(nameApply(p).ok)nameIds.push(p.id);
 S.cfg.ceLastClean={at:Date.now(),ids,names:nameIds};S.cfgDirty=true;bumpData();await persist();toast('Застосовано чистих описів: '+ids.length);render();
}
async function ceUndoClean(){
 const ids=S.cfg.ceLastClean?.ids||[],nameIds=S.cfg.ceLastClean?.names||[];if(!ids.length&&!nameIds.length)return;
 if(!confirm(`Повернути попередні описи (${ids.length}) і назви (${nameIds.length})?`))return;
 let n=0;for(const id of ids){const p=S.products.get(id);if(p&&ceUndo(p).ok)n++;}for(const id of nameIds){const p=S.products.get(id);if(p)nameUndo(p);}
 S.cfg.ceLastClean=null;S.cfgDirty=true;bumpData();await persist();toast('Повернуто описів: '+n);render();
}
const ceAction55=ceAction;ceAction=async function(a,t){
 if(a==='ceNeedFilter'){CE_UI.filter=t.dataset.need?'need:'+t.dataset.need:'all';CE_UI.page=0;render();return;}
 if(a==='ceApplyClean'){await ceApplyClean();return;}
 if(a==='ceUndoClean'){await ceUndoClean();return;}
 return ceAction55(a,t);
};

// Stage 5.5 (owner D-71): report-only checks of the supplier text against PIM data. Nothing is changed — prices, stock flags
// and lead times stay as they are; a product with a row stays out of the first wave (D-74, condition 10).
//  «Можлива недоплата»: the supplier asks a surcharge for some sizes («58-62р +50грн»), PIM prices them no higher than the base.
//  «Постачальник пише «під замовлення», а в PIM — в наявності»: made to order / N days of manufacturing in the text, while a
//  SKU is in stock in PIM without a confirmed lead time.
function supplierTextChecks(p){
 const rows=[],text=autoUkText(ceSourcePlain(ceSupplierSource(p)||'')),variants=p?.variants||[];if(!text||!variants.length)return rows;
 const priced=variants.map(v=>({v,size:String(realVal(v.size)||''),c:calc(p,v)})).filter(x=>x.c.price!=null);
 const base=priced.length?Math.min(...priced.map(x=>+x.c.price)):null;
 for(const m of text.matchAll(/((\d{2,3})\s*(?:[-–]\s*(\d{2,3})|(?:\s*,\s*\d{2,3})+)\s*р\.?\p{L}*[^+\n]{0,20}\+\s*(\d[\d\s]*)\s*(?:грн|₴))/giu)){
  const list=(m[0].match(/\d{2,3}(?=\s*[-–,р]|\s*р)/g)||[]).map(Number),lo=Number(m[2]),hi=m[3]?Number(m[3]):null;
  let matched=false;
  for(const x of priced){const n=Number(x.size);if(!x.size||!Number.isFinite(n))continue;const hit=hi!=null?n>=lo&&n<=hi:list.includes(n);if(!hit)continue;matched=true;
   if(base!=null&&+x.c.price<=base)rows.push({kind:'underpaid',label:'Можлива недоплата',size:x.size,sku:x.v.sku,text:m[0].trim(),price:+x.c.price,base_price:base});}
  // One price for every size (the size is confirmed by the manager): the surcharged sizes are sold at the base price.
  if(!matched&&base!=null&&!priced.some(x=>Number.isFinite(Number(x.size))&&x.size))rows.push({kind:'underpaid',label:'Можлива недоплата',size:hi!=null?lo+'–'+hi:list.join(', '),sku:priced.map(x=>x.v.sku).join(', '),text:m[0].trim(),price:base,base_price:base});
 }
 if(/під\s+замовлення|на\s+замовлення|под\s+заказ|термін\p{L}*\s+виготовлен\p{L}*\s*[:—–-]?\s*(?:від\s+)?\d|срок\p{L}*\s+изготовлен\p{L}*/iu.test(text)){
  const inStock=priced.filter(x=>x.c.avail==='in'&&confirmedPreorderDays(x.c.o||x.c.ref)==null);
  if(inStock.length){const m=text.match(/[^.\n]*(?:під\s+замовлення|на\s+замовлення|под\s+заказ|термін\p{L}*\s+виготовлен|срок\p{L}*\s+изготовлен)[^.\n]*/iu);rows.push({kind:'made_to_order',label:'Постачальник пише «під замовлення», а в PIM — в наявності',sku:inStock.map(x=>x.v.sku).join(', '),size:inStock.map(x=>x.size).filter(Boolean).join(', '),text:(m?.[0]||'').trim().slice(0,200)});}
 }
 return rows;
}
const supplierTextChecksMemo=memoProd('supplierTextChecks55',supplierTextChecks);

// Stage 5.5 (owner D-75): literate product names — a draft with history and undo, like descriptions. Scheme «<тип> <бренд>
// <модель> <ключова характеристика>»; the word order of the supplier is kept (the name is cleaned, not rewritten).
const NAME_ABBR=new Set(['MOLLE','YKK','ЗСУ','НАТО','NATO','ДСТУ','STANAG','ДСНС','НГУ','СБУ','МВС','ТРО','LED','USB','UV','IR','GPS','PE','UHMWPE','EVA','PVC','TPU','IFAK','CAT','SOF','FAST','MICH','ACH','PASGT','QRS','GEN','II','III','IV','NIJ','EDC','AK','АК','РПС','РПК','ВОГ','БК','СВД','ПМ','АКМ','IP','XL','XXL','XXXL','XS','RAL','MK']);
const NAME_PROMO=/(?<![\p{L}])(?:новинка|новинки|хіт|хит|акція|акция|розпродаж|распродажа|sale|new|hit)(?![\p{L}])/giu;
const NAME_TYPE_WORDS=/(?:куртк|штан|костюм|кофт|фліс|футболк|сороч|поло|шорт|жилет|худі|светр|термобіл|кепк|шапк|балаклав|бафф|рукавиц|рукавич|берц|черевик|кросівк|чоботи|взутт|рюкзак|сумк|баул|підсум|рпс|розвантаж|плитоноск|бронежилет|бронепластин|бронеплит|плит|пакет|напашник|шолом|кавер|навушник|окуляр|маск|сітк|намет|спальн|каремат|килим|ремін|пояс|ліхтар|ніж|мультитул|турнікет|аптечк|бандаж|кобур|чохол|павербанк|станці|бінокл|приціл|казанок|фляг|термос|пончо|дощовик|бахіл|гамаш|наколінник|налокітник|комплект|набір|анорак|фартух|горжет|захист|гідратор|магазин|антен|адаптер|кріпленн|шеврон|патч|нашивк|карабін|ковдр|спальник|бронекомплект|тримач|підставк|кейс|сітк|чохл|вкладиш|устілк|шнурк|пряжк|стропа|мотузк|ліхтарик)/iu;
// The product type also comes from the category leaf: a 4–5 letter stem of its words in the name.
function nameHasType(name,category){if(NAME_TYPE_WORDS.test(name))return true;const leaf=String(category||'').split(' / ').pop()||'';const words=leaf.toLowerCase().match(/\p{L}{4,}/gu)||[];const n=String(name).toLowerCase();return words.some(w=>n.includes(w.slice(0,w.length>=6?5:4)));}
function nameCaseWord(w,brandWords){
 const core=w.replace(/^[«"“(]+|[»"”),.;:!?]+$/gu,'');if(!core)return w;
 if(brandWords.has(core.toLowerCase()))return w.replace(core,brandWords.get(core.toLowerCase()));
 if(/\d/.test(core)||/^[A-Z]+\.[A-Z.]+$/.test(core))return w;
 const up=core===core.toUpperCase()&&core!==core.toLowerCase();if(!up)return w;
 if(NAME_ABBR.has(core.toUpperCase()))return w;
 if(/^\p{Script=Cyrillic}+$/u.test(core)&&core.length<=3)return w;
 if(/^[A-Z]{1,3}$/.test(core))return w;
 const low=core.toLowerCase();return w.replace(core,/^[A-Za-z]/.test(core)?core.charAt(0)+low.slice(1):low);
}
function nameDraft(p){
 const original=String(p?.name||''),changes=[],reasons=[];let x=original;
 const step=(label,next)=>{if(next!==x){changes.push(label);x=next;}};
 step('емодзі',x.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu,' '));
 step('знаки «!!!»',x.replace(/!{2,}|!(?=\s|$)/g,' '));
 step('рекламні слова',x.replace(NAME_PROMO,' '));
 const codes=uniq((p?.variants||[]).flatMap(v=>Object.values(v.offers||{}).map(o=>String(o?.s||'').trim())).filter(c=>c.length>=3));
 // The supplier code goes only where it is clearly the supplier's: in brackets, after «арт./код», digits only, or at the very end
 // not right after the brand (a manufacturer model code such as «VIDEX VLF-H035C» stays).
 for(const c of codes){const e=escRe(c),bracket=new RegExp('[(\\[]\\s*(?:арт\\.?|артикул|код|art\\.?|sku)?\\s*:?\\s*'+e+'\\s*[)\\]]','giu'),labelled=new RegExp('(?:арт\\.?|артикул|код|art\\.?|sku)\\s*:?\\s*'+e+'(?![\\p{L}\\d-])','giu'),bare=new RegExp('(?<![\\p{L}\\d-])'+e+'(?![\\p{L}\\d-])','giu');
  let next=x.replace(bracket,' ').replace(labelled,' ');if(/^\d{4,}$/.test(c))next=next.replace(bare,' ');
  else{const t=next.trim(),bq=realBrand(p);if(new RegExp(e+'[\\s!.]*$','iu').test(t)&&!(bq&&new RegExp(escRe(bq)+'\\s+'+e+'[\\s!.]*$','iu').test(t)))next=t.replace(new RegExp('\\s*'+e+'[\\s!.]*$','iu'),'');}
  step('код постачальника '+c,next);}
 step('ціна в назві',ceCutG1(x,[]));
 for(const re of CE_G4)step('контакт або посилання',x.replace(re,' '));
 {const re=ceSupplierNameRegex(p);if(re)step('назва постачальника замість бренду',x.replace(re,' '));}
 step('повтор слів',x.replace(/(?<![\p{L}])(\p{L}{3,})(\s+\1)+(?![\p{L}])/giu,'$1'));
 const brand=realBrand(p),brandWords=new Map(brand?brand.split(/\s+/).map(b=>[b.toLowerCase(),b]):[]);
 if(brand)brandWords.set(brand.toLowerCase(),brand);
 // CAPS only in a «shouting» name (at least half of the words in capitals); otherwise capitals are deliberate abbreviations
 // («НВМПЕ», «VLF-H035C») and only the brand is written as p.brand.
 const long=x.match(/[\p{L}]{3,}/gu)||[],shouting=long.length&&long.filter(w=>w===w.toUpperCase()).length*2>=long.length;
 step('регістр',x.split(/(\s+)/).map(w=>/\s/.test(w)?w:shouting?nameCaseWord(w,brandWords):(brandWords.get(w.replace(/[^\p{L}\d-]/gu,'').toLowerCase())?w.replace(w.replace(/[^\p{L}\d-]/gu,''),brandWords.get(w.replace(/[^\p{L}\d-]/gu,'').toLowerCase())):w)).join(''));
 step('пробіли',ceTidy(x.replace(/\s{2,}/g,' '),''));
 if(x)step('велика літера на початку',x.charAt(0).toUpperCase()+x.slice(1));
 const hasBrand=!!brand&&x.toLowerCase().includes(brand.toLowerCase()),hasType=nameHasType(x,p?.category);
 if(!hasBrand||!hasType)return {name:original,original,changes:[],reasons:['Назва: немає типу товару/бренду'],apply:false};
 if(x.length<20||x.length>120)reasons.push('Назва: довжина '+x.length+' (потрібно 20–120)');
 return {name:x,original,changes,reasons,apply:!reasons.length&&x!==original};
}
function nameApply(p,d=nameDraft(p)){
 if(!p||p.fieldMeta?.name?.source==='manual')return {ok:false,why:'Ручна назва захищена'};
 if(!d.apply)return {ok:false,why:d.reasons.join('; ')||'Змін немає'};
 ensureFieldMeta(p);p.fieldMeta.name.supplierOriginal??=p.name;
 p.nameHistory=[{name:p.name,at:Date.now()},...(p.nameHistory||[])].slice(0,10);
 p.name=d.name;p.fieldMeta.name.source='generated';markProduct(p);return {ok:true};
}
function nameUndo(p){
 if(!p||p.fieldMeta?.name?.source==='manual'||!p.nameHistory?.length)return {ok:false,why:'Немає попередньої назви'};
 const [last,...rest]=p.nameHistory;p.name=last.name;p.nameHistory=rest;markProduct(p);return {ok:true};
}
function nameDraftPanel(p){
 const d=nameDraft(p),orig=p.fieldMeta?.name?.supplierOriginal??d.original;
 return `<div class="ce-panel" data-name-panel><b>Назва</b><p class="small">Назва постачальника: ${esc(orig)}</p>${d.apply?`<p class="small">Чернетка: ${esc(d.name)} <span class="muted">(${esc(d.changes.join(', '))})</span></p>`:''}${d.reasons.length?`<p class="small ce-warning">${esc(d.reasons.join('; '))}</p>`:''}<div class="row">${d.apply&&p.fieldMeta?.name?.source!=='manual'?'<button class="btn small" data-act="ceNameApplyOne">Застосувати назву</button>':''}${p.nameHistory?.length?'<button class="btn small" data-act="ceNameUndoOne">Повернути попередню назву</button>':''}</div></div>`;
}
const ceProductPanel55=ceProductPanel;ceProductPanel=function(p){return nameDraftPanel(p)+ceProductPanel55(p);};
const ceAction55n=ceAction;ceAction=async function(a,t){
 if(a==='ceNameApplyOne'||a==='ceNameUndoOne'){const p=S.edit;if(!p)return;const r=a==='ceNameApplyOne'?nameApply(p):nameUndo(p);toast(r.ok?'Назву оновлено':r.why);if(r.ok)await persist();render();return;}
 return ceAction55n(a,t);
};
