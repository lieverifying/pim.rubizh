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
  const values=uniq(group.values);if(values.length>1){conflicts.push({key:group.key,label:group.label,values:values.map(value=>({value,source:uniq(group.sources).join(' · ')}))});continue;}
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
