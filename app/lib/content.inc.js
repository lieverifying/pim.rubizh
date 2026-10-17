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
const ceSupplierRegexCache=new Map();
function ceSupplierNameRegex(p){const k=ceAliasKey(p?.brand);if(!ceSupplierRegexCache.has(k))ceSupplierRegexCache.set(k,ceSupplierNameRegexBuild(p));const re=ceSupplierRegexCache.get(k);if(re)re.lastIndex=0;return re;}
function ceSupplierNameRegexBuild(p){
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
const CE_G4_ONE=CE_G4.map(re=>new RegExp(re.source,'iu'));
function ceCommercialSignals(text,p){
 const t=String(text||''),out=[];
 for(const [group,re] of [['G1',CE_G1],['G2',CE_G2],['G3',CE_G3]]){const m=t.match(re);if(m)out.push({group,text:m[0].trim()});}
 for(const re of CE_G4_ONE){const m=t.match(re);if(m)out.push({group:'G4',text:m[0].trim()});}
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
 // Plain supplier text (the patterns cover Ukrainian and Russian; no translation needed for a report-only check).
 const rows=[],text=ceSourcePlain(ceSupplierSource(p)||''),variants=p?.variants||[];if(!text||!variants.length)return rows;
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
 for(const c of codes){if(!x.toLowerCase().includes(c.toLowerCase()))continue;const e=escRe(c),bracket=new RegExp('[(\\[]\\s*(?:арт\\.?|артикул|код|art\\.?|sku)?\\s*:?\\s*'+e+'\\s*[)\\]]','giu'),labelled=new RegExp('(?:арт\\.?|артикул|код|art\\.?|sku)\\s*:?\\s*'+e+'(?![\\p{L}\\d-])','giu'),bare=new RegExp('(?<![\\p{L}\\d-])'+e+'(?![\\p{L}\\d-])','giu');
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
const nameDraftMemo=memoProd('nameDraft55',nameDraft);
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

// Stage 5.5 (owner D-74): «Перша хвиля» in the strict «Запуск» mode — at most S.cfg.waveLimit (500) products; every product
// that does not pass one of the 15 conditions gets a Ukrainian reason; quotas: one supplier ≤ 40 %, one top category ≤ 15 %,
// kit slots ≥ 8 each when enough are ready; the rating decides inside the quotas (ties: the smaller id); «Завжди / Ніколи в
// хвилі» marks are stored on the product (and in the backup); «Завжди» never bypasses the conditions.
// launchConditionHooks: test seams only (a finished pipeline for synthetic products); the application never sets them.
const launchConditionHooks={fresh:null,ready:null};
const LAUNCH_KIT_SLOT={combat_shirt:'body',outer_layer:'body',fleece:'body',base_layer:'body',pants:'legs',footwear:'boots',socks:'small',gloves:'small',knee_protection:'small',carrier:'armor',plates:'armor',helmet:'head',hearing:'head',eye_protection:'head',backpack:'gear',pouch:'gear',rps:'gear',battle_belt:'gear',ifak:'med',tourniquet:'med'};
const LAUNCH_SLOT_LABEL={head:'Голова',body:'Тіло',legs:'Ноги',boots:'Взуття',armor:'Бронезахист',gear:'Спорядження',med:'Медицина',small:'Дрібниці'};
function launchSizeRelevant(p){
 const cat=String(p.category||''),free=/(пончо|гамаш|бахіл|маскувальн|бронежилет)/i.test(cat)||/(бахіл|пончо|дощовик|маскхалат|маскувальн)/i.test(String(p.name||''));
 return !free&&(/(чоловічий одяг|жіночий одяг)/i.test(cat)||/(куртк|штан|костюм|комбінезон|убакс|сороч|футболк|поло|фліс, кофт|худі|термобіл|термофутболк|шорт|жилет|светр)/i.test(cat)||/(тактичне взуття|берц|черевик|кросівк|лофер)/i.test(cat));
}
function launchSlot(p){try{return LAUNCH_KIT_SLOT[RubizhModel.normalized(p,{path:canonicalPath}).kit_component]||null;}catch{return null;}}
const launchSlotMemo=memoProd('launchSlot55',launchSlot);
function launchSupplierIds(p){return uniq((p.variants||[]).flatMap(v=>Object.keys(v.offers||{})));}
function launchMainSupplier(p){for(const v of p.variants||[]){const o=calc(p,v).o;if(o?.sid)return o.sid;}return launchSupplierIds(p)[0]||'';}
function launchKeyFacts(p){
 const facts=p.contentEngine?.facts?.length?p.contentEngine.facts:ceExtract(p).facts;const profile=CE_PROFILES[ceCategory(p)];
 const keys=new Set(String(profile?.focus||'').split('|').concat(profile?.expected||[]));return new Set(facts.map(f=>String(f.key).split(':')[0]).filter(k=>keys.has(k))).size;
}
const launchKeyFactsMemo=memoProd('launchKeyFacts55',launchKeyFacts);
function launchPayable(p,v){const c=calc(p,v);if(c.avail!=='in'||c.price==null)return false;if(launchConditionHooks.fresh)return launchConditionHooks.fresh(p,v);return classificationAvailability(p,v).payment_allowed===true&&classificationFreshnessClass(p,v)==='fresh';}
function launchReasons(p){
 const r=[],manual=p.fieldMeta?.desc?.source==='manual';
 if(p.waveMark==='never')r.push('Ніколи в хвилі (позначка власника)');
 if(p.fieldMeta?.pub?.source==='manual'&&p.pub===false&&p.waveLaunchHidden!==true)r.push('Товар приховано вручну');
 if(!manual&&!(ceAccepted(p)&&Number(p.contentEngine?.quality)>=60))r.push('Опис не прийнято: потрібен чистий застосований опис (повнота ≥ 60) або ручний');
 const nd=nameDraftMemo(p);if(nd.reasons.length)r.push(...nd.reasons);else if(nd.apply)r.push('Назва: є чиста чернетка — застосуйте її');else if(ceCommercialSignals(p.name,p).length)r.push('Назва: комерційний текст');
 const photos=(p.photos||[]).map(String);if(photos.length<3||new Set(photos).size!==photos.length||photos.some(u=>!/^https:\/\//i.test(u)))r.push('Фото: потрібно щонайменше 3 різні, лише https://');
 if(!realBrand(p))r.push('Немає справжнього бренду');
 // 9: the markup passes the current PIM rules (readyStatus is not used: it checks the old category tree; category, moderation
 // and readiness come from finalDecision, condition 7).
 if((p.variants||[]).some(v=>{const c=calc(p,v);return c.price!=null&&(c.lowMargin||c.rrpViolation)&&!v.marginOverride;}))r.push('Націнка не проходить правила PIM');
 if(launchSizeRelevant(p)){const vs=p.variants||[],sizes=uniq(vs.map(v=>realVal(v.size)).filter(Boolean));if(sizes.length<3)r.push('Розміри: менше 3');if(vs.some(v=>!realVal(v.size)||v.size_unconfirmed))r.push('Розмір уточнюється');}
 if(!(p.variants||[]).some(v=>launchPayable(p,v)))r.push('Немає SKU з прямою оплатою (свіжі дані та наявність)');
 if(finalQuoteModel(p))r.push('«По заявці» (ціна за м²)');
 if(!(launchConditionHooks.ready?launchConditionHooks.ready(p):finalDecision(p).state==='READY'))r.push('Не готовий до публікації: модерація, обмежена група або відхилено');
 const prices=(p.variants||[]).map(v=>calc(p,v).price).filter(x=>x!=null).map(Number),min=Math.max(0,Math.min(5000,Number(S.cfg.waveMinPrice??500)));
 if(!prices.length||Math.min(...prices)<min)r.push('Ціна на сайті нижче '+min+' грн');
 if(supplierTextChecksMemo(p).length)r.push('Перевірка постачальника: можлива недоплата або «під замовлення» (D-71)');
 // 11 is checked for products whose description passed (1): the others already have a reason, and extracting facts is costly.
 if((manual||ceAccepted(p))&&launchKeyFactsMemo(p)<3)r.push('Характеристики: менше 3 ключових для категорії');
 if(launchSupplierIds(p).some(sid=>S.cfg.suppliers.find(s=>s.id===sid)?.needsDryRun===true))r.push('Новий постачальник не перевірений (сухий прогін)');
 if(!manual){const need=ceNeedReason(p);if(need)r.push('Опис: '+CE_NEED_LABELS[need]);}
 return r;
}
// Rating 0–100: data freshness (≤ 20), sizes in stock (2 each, ≤ 20), photos (2.5 each up to 8, ≤ 20), description
// completeness (×0.2, ≤ 20), key characteristics (2 each, ≤ 20). Ties: the smaller id.
function launchRating(p){
 let fresh=0;for(const v of p.variants||[]){if(!launchPayable(p,v))continue;const o=calc(p,v).o;const age=o?classificationStockMetadata(o).stock_data_age_hours:null;fresh=Math.max(fresh,launchConditionHooks.fresh?20:age==null?0:Math.max(0,20-age/3.6));}
 const sizes=uniq((p.variants||[]).filter(v=>calc(p,v).avail==='in').map(v=>realVal(v.size)||'—')).length;
 const q=p.fieldMeta?.desc?.source==='manual'?60:Number(p.contentEngine?.quality)||0;
 return Math.round((fresh+Math.min(10,sizes)*2+Math.min(8,(p.photos||[]).length)*2.5+Math.min(100,q)*0.2+Math.min(10,launchKeyFactsMemo(p))*2)*100)/100;
}
const LAUNCH_RATING_HINT='Рейтинг 0–100: свіжість даних (до 20), розміри в наявності (по 2, до 20), фото (по 2,5 до 8 фото, до 20), повнота опису (×0,2, до 20), ключові характеристики (по 2, до 20). За рівності — менший id.';
const launchWave=memoByData(function(){
 const L=Math.max(50,Math.min(3000,Math.round(Number(S.cfg.waveLimit)||500))),capSup=Math.floor(L*0.4),capCat=Math.floor(L*0.15);
 const reasons={},rating={},eligible=[];
 for(const p of S.products.values()){if(p.archived||p.merged_into)continue;const r=launchReasons(p);if(r.length){reasons[p.id]=r;continue;}rating[p.id]=launchRating(p);eligible.push(p);}
 const order=(a,b)=>(b.waveMark==='always')-(a.waveMark==='always')||rating[b.id]-rating[a.id]||a.id.localeCompare(b.id);eligible.sort(order);
 const drop=(p,why)=>{reasons[p.id]=[why];delete rating[p.id];};
 // 14: one card of a colour group waiting for the owner's merge decision (S541-02).
 try{const pos=new Map(eligible.map((p,i)=>[p.id,i]));for(const g of mcPlan().groups||[]){if(g.automatic)continue;const ids=(g.ids||g.products?.map(x=>x.id)||[]).filter(id=>pos.has(id)).sort((a,b)=>pos.get(a)-pos.get(b));for(const id of ids.slice(1))drop(S.products.get(id),'Дубль моделі, чекає склейки');}}catch{}
 // D-75: names are unique within the wave; a colour tells two cards apart, otherwise «Назва дублюється».
 const renames={},byName=new Map();for(const p of eligible){if(!Object.hasOwn(rating,p.id))continue;const k=norm(p.name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(p);}
 for(const group of byName.values()){if(group.length<2)continue;const colors=group.map(p=>uniq((p.variants||[]).map(v=>realVal(v.color)).filter(Boolean)));
  const distinct=colors.every(c=>c.length===1)&&new Set(colors.map(c=>norm(c[0]))).size===group.length;
  if(distinct)group.forEach((p,i)=>{renames[p.id]=p.name+' '+String(colors[i][0]).toLowerCase();});else group.slice(1).forEach(p=>drop(p,'Назва дублюється'));}
 const pool=eligible.filter(p=>Object.hasOwn(rating,p.id)),picked=new Set(),sup={},cat={},slots={};
 const fits=p=>{const s=launchMainSupplier(p),c=String(p.category||'').split(' / ')[0];return (sup[s]||0)<capSup&&(cat[c]||0)<capCat;};
 const take=p=>{const s=launchMainSupplier(p),c=String(p.category||'').split(' / ')[0],sl=launchSlotMemo(p);picked.add(p.id);sup[s]=(sup[s]||0)+1;cat[c]=(cat[c]||0)+1;if(sl)slots[sl]=(slots[sl]||0)+1;};
 for(const sl of Object.keys(LAUNCH_SLOT_LABEL))for(const p of pool){if(picked.size>=L||(slots[sl]||0)>=8)break;if(!picked.has(p.id)&&launchSlotMemo(p)===sl&&fits(p))take(p);}
 for(const p of pool){if(picked.size>=L)break;if(!picked.has(p.id)&&fits(p))take(p);}
 for(const p of pool)if(!picked.has(p.id))reasons[p.id]=['Поза лімітом або квотою (постачальник ≤ 40 %, категорія ≤ 15 %)'];
 const ids=pool.filter(p=>picked.has(p.id)).map(p=>p.id);
 const why={};for(const r of Object.values(reasons))for(const x of r){const k=x.replace(/\d+ грн/,'N грн');why[k]=(why[k]||0)+1;}
 const warnings=Object.entries(LAUNCH_SLOT_LABEL).filter(([k])=>(slots[k]||0)<8).map(([k,l])=>`Слот ${l}: лише ${slots[k]||0} товарів — комплект збирати важко`);
 const names=Object.fromEntries((S.cfg.suppliers||[]).map(s=>[s.id,s.name]));
 return {limit:L,ids,rating:Object.fromEntries(ids.map(id=>[id,rating[id]])),reasons,why,warnings,renames:Object.fromEntries(ids.filter(id=>renames[id]).map(id=>[id,renames[id]])),
  breakdown:{suppliers:Object.fromEntries(Object.entries(sup).map(([k,v])=>[names[k]||k,v])),categories:cat,slots:Object.fromEntries(Object.entries(LAUNCH_SLOT_LABEL).map(([k,l])=>[l,slots[k]||0]))}};
});
function launchWaveBlock(){
 const w=launchWave(),table=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('');
 const pubNow=[...S.products.values()].filter(p=>!p.archived&&!w.ids.includes(p.id)&&(p.pub||finalDecision(p).state==='READY')&&!finalOwnerUnpublished(p)).length;
 return `<div class="panel" data-launch-wave style="border:2px solid var(--accent);margin-bottom:18px"><h2 style="margin-top:0">Перша хвиля запуску · режим «Запуск»</h2>
 <label class="chk small"><input type="checkbox" data-launch-strict ${S.cfg.waveStrict!==false?'checked':''}> Строгий режим «Запуск» (15 умов)</label>
 <div class="stats"><div class="stat"><b style="color:var(--ok)">${w.ids.length}</b><span>з ${w.limit} у хвилі</span></div><div class="stat"><b>${Object.keys(w.reasons).length}</b><span>не пройшли</span></div><div class="stat"><b>${pubNow}</b><span>буде знято з сайту</span></div></div>
 <div class="row"><label class="f small">Ліміт хвилі<input type="number" min="50" max="3000" data-launch-cfg="waveLimit" value="${w.limit}" style="width:100px"></label><label class="f small">Мінімальна ціна, грн<input type="number" min="0" max="5000" data-launch-cfg="waveMinPrice" value="${Math.max(0,Math.min(5000,Number(S.cfg.waveMinPrice??500)))}" style="width:100px"></label><button class="btn small" data-act="ceWaveSaveCfg">Зберегти</button></div>
 <p class="small muted">${esc(LAUNCH_RATING_HINT)} Квоти: один постачальник — до 40 %, одна категорія верхнього рівня — до 15 %, у кожному з 8 слотів «Свій комплект» — щонайменше 8 товарів, якщо готових вистачає. Позначки в картці товару: «Завжди в хвилі» (не обходить умови) і «Ніколи в хвилі» (прибирає безумовно).</p>
 ${w.warnings.map(x=>`<p class="small ce-warning">${esc(x)}</p>`).join('')}
 <div class="row" style="align-items:flex-start;gap:18px"><div><h3>Постачальники</h3><table>${table(w.breakdown.suppliers)}</table></div><div><h3>Категорії</h3><table>${table(w.breakdown.categories)}</table></div><div><h3>Слоти</h3><table>${table(w.breakdown.slots)}</table></div></div>
 <details open><summary><b>Не пройшли</b> — причини</summary><table><thead><tr><th>Причина</th><th class="num">Товарів</th></tr></thead><tbody>${table(w.why)}</tbody></table></details>
 <div class="row" style="margin-top:12px"><button class="btn primary" data-act="ceWavePublish" ${w.ids.length?'':'disabled'}>Опублікувати хвилю (${w.ids.length})</button>${S.cfg.waveLastPublish?'<button class="btn" data-act="ceWaveUndo">Скасувати публікацію хвилі</button>':''}</div></div>`;
}
const waveBlock55=waveBlock;waveBlock=function(){return S.cfg.waveStrict===false?`<label class="chk small"><input type="checkbox" data-launch-strict> Строгий режим «Запуск» (15 умов)</label>`+waveBlock55():launchWaveBlock();};
async function launchWavePublish(){
 const w=launchWave(),wave=new Set(w.ids);if(!wave.size){toast('У хвилі немає товарів');return;}
 const hide=[...S.products.values()].filter(p=>!p.archived&&!wave.has(p.id)&&!finalOwnerUnpublished(p)&&(p.pub||finalDecision(p).state==='READY'));
 if(!confirm(`Буде опубліковано: ${wave.size}. Буде знято з публікації: ${hide.length} (товари залишаться в PIM). Продовжити?`))return;
 const prev={};const remember=p=>{if(!prev[p.id])prev[p.id]=[p.pub,p.fieldMeta?.pub?.source??null,p.name,!!p.waveLaunchHidden];};
 for(const id of wave){const p=S.products.get(id);remember(p);ensureFieldMeta(p);p.pub=true;p.fieldMeta.pub={...(p.fieldMeta.pub||{}),source:'manual'};p.waveLaunchHidden=false;
  if(w.renames[id])nameApply(p,{apply:true,name:w.renames[id],reasons:[],changes:['відмінна характеристика в хвилі']});p.syncStatus='pending';markProduct(p);}
 for(const p of hide){remember(p);ensureFieldMeta(p);p.pub=false;p.fieldMeta.pub={...(p.fieldMeta.pub||{}),source:'manual'};p.waveLaunchHidden=true;p.syncStatus='pending';markProduct(p);}
 S.cfg.waveLastPublish={at:Date.now(),prev};S.cfgDirty=true;invalidateLaunchCache();await persist();toast(`Опубліковано ${wave.size}, знято ${hide.length}`);render();
}
async function launchWaveUndo(){
 const prev=S.cfg.waveLastPublish?.prev;if(!prev)return;if(!confirm('Повернути публікацію до стану перед хвилею?'))return;
 for(const [id,[pub,source,name,hidden]] of Object.entries(prev)){const p=S.products.get(id);if(!p)continue;ensureFieldMeta(p);p.pub=pub;if(source==null){if(p.fieldMeta.pub)delete p.fieldMeta.pub.source;}else p.fieldMeta.pub={...(p.fieldMeta.pub||{}),source};if(p.name!==name&&p.nameHistory?.[0]?.name===name)nameUndo(p);p.waveLaunchHidden=hidden;p.syncStatus='pending';markProduct(p);}
 S.cfg.waveLastPublish=null;S.cfgDirty=true;invalidateLaunchCache();await persist();toast('Публікацію хвилі скасовано');render();
}
function launchMarkPanel(p){return `<div class="row" data-wave-mark><span class="small">Перша хвиля:</span><button class="btn small" data-act="ceWaveMark" data-mark="always" aria-pressed="${p.waveMark==='always'}">Завжди в хвилі</button><button class="btn small" data-act="ceWaveMark" data-mark="never" aria-pressed="${p.waveMark==='never'}">Ніколи в хвилі</button>${p.waveMark?'<button class="btn small" data-act="ceWaveMark" data-mark="">Без позначки</button>':''}</div>`;}
const ceProductPanel55w=ceProductPanel;ceProductPanel=function(p){return launchMarkPanel(p)+ceProductPanel55w(p);};
const ceAction55w=ceAction;ceAction=async function(a,t){
 if(a==='ceWavePublish'){await launchWavePublish();return;}
 if(a==='ceWaveUndo'){await launchWaveUndo();return;}
 if(a==='ceWaveMark'){const p=S.edit;if(!p)return;if(t.dataset.mark)p.waveMark=t.dataset.mark;else delete p.waveMark;markProduct(p);await persist();render();return;}
 if(a==='ceWaveSaveCfg'){for(const el of $$('[data-launch-cfg]')){const k=el.dataset.launchCfg,v=Number(el.value);if(k==='waveLimit'&&Number.isFinite(v))S.cfg.waveLimit=Math.max(50,Math.min(3000,Math.round(v)));if(k==='waveMinPrice'&&Number.isFinite(v))S.cfg.waveMinPrice=Math.max(0,Math.min(5000,Math.round(v)));}const strict=$('[data-launch-strict]');if(strict)S.cfg.waveStrict=strict.checked;S.cfgDirty=true;bumpData();await persist();render();return;}
 return ceAction55w(a,t);
};

// Stage 5.5 (owner D-77, S52-03): import hardening and the dry run of a new supplier.
// A price written «1.250» or «1,250» can be 1.25 or 1250: it is not accepted (the product stays without a price).
function importPrice(v){if(typeof v==='number')return Number.isFinite(v)?v:null;const t=String(v??'').trim().replace(/[\s  ]/g,'');if(/^\d{1,3}[.,]\d{3}$/.test(t))return null;return parseNum(v);}
// Excel serial days → the moment in Kyiv time (the 1904 system starts 1462 days later).
function xlsxSerialToMs(serial,date1904=false){
 const days=Number(serial)+(date1904?1462:0),utc=Math.round((days-25569)*86400000);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(utc)).map(x=>[x.type,x.value]));
 const asKyiv=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);return utc-(asKyiv-utc);
}
function supplierDryRun(I){
 const errors=[],warnings=[],rows=(I?.rows||[]).slice((I?.hdr??0)+1),map=I?.map||{},g=(r,k)=>map[k]!=null&&map[k]!==''?r[map[k]]:'';
 if(I?.xml){const c=I.rows?.ymlCurrency||{declared:[],offers:{}},offers=Object.keys(c.offers||{});const bad=offers.filter(x=>!['UAH','ГРН'].includes(x)),declaredOk=(c.declared||[]).some(x=>['UAH','ГРН'].includes(x));
  if(bad.length||!offers.length||!declaredOk&&offers.every(x=>!x))errors.push('Валюта YML: '+(bad.filter(Boolean).join(', ')||'не вказана')+' — потрібна гривня (UAH); імпорт цього постачальника заблоковано');}
 const amb=[];rows.forEach((r,i)=>{for(const k of ['cost','rrp']){const t=String(g(r,k)??'').trim().replace(/[\s ]/g,'');if(/^\d{1,3}[.,]\d{3}$/.test(t))amb.push('рядок '+(i+2)+': «'+t+'»');}});
 if(amb.length)errors.push('Неоднозначні числа (1.250 — це 1,25 чи 1250?): '+amb.slice(0,8).join('; ')+(amb.length>8?' …':'')+' — такі ціни не приймаються');
 const seen=new Map(),conflicts=[];rows.forEach((r,i)=>{const sku=String(g(r,'sku')??'').trim();if(!sku)return;const k=sku+'|'+String(g(r,'size')??'').trim().toLowerCase()+'|'+String(g(r,'color')??'').trim().toLowerCase();if(seen.has(k))conflicts.push(sku+' (рядки '+seen.get(k)+' і '+(i+2)+')');else seen.set(k,i+2);});
 if(conflicts.length)errors.push('Конфлікт: той самий артикул з тим самим розміром і кольором — '+conflicts.slice(0,8).join('; ')+'; без перезапису');
 const manyPhotos=rows.filter(r=>String(g(r,'photos')??'').split(/[\s,;]+/).filter(Boolean).length>15).length;if(manyPhotos)warnings.push('Фото: у '+manyPhotos+' рядках більше 15 — беруться перші 15');
 const slash=rows.filter(r=>/(?:^|[\s,;])\/\//.test(String(g(r,'photos')??''))).length;if(slash)warnings.push('Фото: у '+slash+' рядках адреси «//» — перетворено на https:');
 const med=a=>{const s=a.filter(x=>x>0).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;};
 const mine=med(rows.map(r=>importPrice(g(r,'cost'))).filter(x=>x!=null)),ours=med([...S.products.values()].filter(p=>!p.archived).flatMap(p=>(p.variants||[]).map(v=>calc(p,v).price)).filter(x=>x!=null));
 if(mine&&ours&&(mine>ours*3||mine*3<ours))warnings.push(`Медіана ціни постачальника ${mine} грн, у каталозі ${ours} грн — Перевірте одиниці/валюту`);
 const shares={rows:rows.length,no_photo:0,no_brand:0,no_size:0,no_description:0};for(const r of rows){if(!String(g(r,'photos')??'').trim())shares.no_photo++;if(!String(g(r,'brand')??'').trim())shares.no_brand++;if(!String(g(r,'size')??'').trim())shares.no_size++;if(!String(g(r,'desc')??'').trim())shares.no_description++;}
 const st=I?.source_time,data_time=st?.at?new Date(st.at).toISOString()+' ('+(st.provenance||'?')+')':'без дати даних — продаж лише через менеджера';
 return {errors,warnings,shares,data_time,blocked:errors.length>0};
}
function supplierDryRunVerify(sid,report){const s=S.cfg.suppliers.find(x=>x.id===sid);if(!s)return {ok:false,why:'Постачальника не знайдено'};if(report?.errors?.length)return {ok:false,why:'Спершу виправте помилки сухого прогону'};s.needsDryRun=false;s.dryRunVerifiedAt=Date.now();S.cfgDirty=true;bumpData();return {ok:true};}
function supplierDryRunPanel(){
 const I=S.imp;if(!I?.rows)return '';const sup=S.cfg.suppliers.find(s=>s.id===I.sup),r=supplierDryRun(I),pct=n=>r.shares.rows?Math.round(n*100/r.shares.rows)+' %':'—';
 return `<section class="panel" data-dry-run><h2>Сухий прогін постачальника${sup?' · '+esc(sup.name):''}</h2>${sup?.needsDryRun?'<p class="small">Новий постачальник: його товари потраплять у хвилю лише після чистого прогону й підтвердження.</p>':''}
 ${r.errors.map(e=>`<p class="small ce-warning" role="alert">Помилка: ${esc(e)}</p>`).join('')}${r.warnings.map(w=>`<p class="small">Попередження: ${esc(w)}</p>`).join('')}
 <table><thead><tr><th>Рядків</th><th>Без фото</th><th>Без бренду</th><th>Без розмірів</th><th>Без опису</th></tr></thead><tbody><tr><td>${r.shares.rows}</td><td>${pct(r.shares.no_photo)}</td><td>${pct(r.shares.no_brand)}</td><td>${pct(r.shares.no_size)}</td><td>${pct(r.shares.no_description)}</td></tr></tbody></table>
 <p class="small">Час даних: ${esc(r.data_time)}</p>${sup?.needsDryRun?`<button class="btn" data-act="wfDryRunVerify" data-sid="${esc(sup.id)}" ${r.errors.length?'disabled':''}>Постачальника перевірено</button>`:''}</section>`;
}
const vImport55=vImport;vImport=function(){return supplierDryRunPanel()+vImport55();};
const workflowAction55=workflowAction;workflowAction=async function(action,t){
 if(action==='wfDryRunVerify'){const r=supplierDryRunVerify(t.dataset.sid,supplierDryRun(S.imp));toast(r.ok?'Постачальника перевірено':r.why);if(r.ok)await persist();render();return;}
 return workflowAction55(action,t);
};
