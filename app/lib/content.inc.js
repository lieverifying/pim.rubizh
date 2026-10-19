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
// Stage 5.5 (wave timing): every finalDecision pass decodes the same supplier texts again; the result depends on the text only.
const ceSourcePlainRaw55=ceSourcePlain,ceSourcePlainCache55=new Map();let ceSourcePlainChars55=0;
ceSourcePlain=function(raw){
 const k=String(raw||'');if(k.length<200||k.length>65536)return ceSourcePlainRaw55(k);
 let v=ceSourcePlainCache55.get(k);
 if(v===undefined){v=ceSourcePlainRaw55(k);if(ceSourcePlainChars55+k.length+v.length>24000000){ceSourcePlainCache55.clear();ceSourcePlainChars55=0;}ceSourcePlainCache55.set(k,v);ceSourcePlainChars55+=k.length+v.length;}
 return v;
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
// Stage 5.5 review: «наявність» / «наличие» is stock only as a label (before «:», at the end) or with склад/товар/розмір/колір
// («Наявність капюшона» is a feature). Stage 5.5 (owner D-66…D-68): commercial text is cut by FRAGMENT. G1 prices and surcharges, G2 stock / lead time / delivery /
// payment, G3 another shop and calls to action, G4 contacts and links, G5 the supplier's name where the product brand differs,
// G6 structural junk. D-67: a technical sentence (numbers with units, kit contents, «not included», protection class,
// standards, materials, sizes) loses only G1/G4/G5 fragments; G2/G3 in it cannot be cut without touching facts, so the sentence
// stays and the draft is marked (never applied automatically). Everything cut is listed (D-68); the supplier original is
// never changed — only the draft is built from the cleaned text.
const CE_GROUP_LABEL={G1:'Ціни та доплати',G2:'Наявність, строки, умови',G3:'Чужий магазин і заклики',G4:'Контакти й посилання',G5:'Постачальник замість бренду',G6:'Службова структура'};
const CE_UNIT_RE=/\d[\d.,]*\s*(?:кг|г|гр|см|мм|л|мл|м[²2]|%|°)(?=$|[^\p{L}])/giu;
const CE_TECH=/\d[\d.,]*\s*(?:кг|г|гр|см|мм|л|мл|м[²2]|%|°)(?=$|[^\p{L}])|комплект(?:аці|аци)|не вход|не міст|не содерж|клас\p{L}*\s+захист|класс\p{L}*\s+защит|дсту|stanag|матеріал|материал|(?<![\p{L}])(?:molle|cordura|ykk)(?![\p{L}])|(?:розмір|размер)\p{L}*\s*[:–-]?\s*\d|\d+\s*[xх×*]\s*\d+/iu;
const CE_G1=/(?:^|[^\p{L}\d])[+]?\s*\d[\d\s.,]*\s?(?:грн|₴|uah|usd|eur|\$|€)\.?(?=$|[^\p{L}])|[$€]\s?\d|(?:^|[^\p{L}])(?:ціна|ціни|ціною|цена|цены|вартість|вартості|стоимость|знижк\p{L}*|скидк\p{L}*|акці[яії]\p{L}*|акци[яи]\p{L}*|розпродаж\p{L}*|распродаж\p{L}*|опт|оптом|оптов\p{L}*|гуртом|гуртов\p{L}*|безкоштовн\p{L}*\s+доставк\p{L}*|бесплатн\p{L}*\s+доставк\p{L}*)(?=$|[^\p{L}])/iu;
const CE_G2=/(?:^|[^\p{L}])(?:є\s+в\s+наявності|в\s+наявності|немає\s+в\s+наявності|наявність(?=\s*(?:[:;,.!?–—-]|$)|\s+(?:на\s+склад|товар|розмір|кольор|уточн))|в\s+наличии|нет\s+в\s+наличии|наличие(?=\s*(?:[:;,.!?–—-]|$)|\s+(?:на\s+склад|товар|размер|цвет|уточн))|під\s+замовлення|на\s+замовлення|под\s+заказ|на\s+заказ|термін\p{L}*\s+виготовлен\p{L}*|срок\p{L}*\s+изготовлен\p{L}*|відправк\p{L}*|відправля\p{L}*|відправимо|отправк\p{L}*|отправля\p{L}*|доставк\p{L}*|оплат\p{L}*|передоплат\p{L}*|предоплат\p{L}*|накладен\p{L}*\s+плат\p{L}*|наложенн\p{L}*\s+плат\p{L}*|уточнюйте|уточняйте|може\s+виготовлят\p{L}*|можуть\s+виготовлят\p{L}*|может\s+изготавлива\p{L}*)(?=$|[^\p{L}])|(?:^|[^\p{L}\d])\d+(?:\s*[-–/]\s*\d+)?\s*(?:робочих\s+|рабочих\s+)?(?:днів|дні|дня|дней|дн\.)(?=$|[^\p{L}])/iu;
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
// Stage 5.5.1 review (HIGH, D-67): a dash right before a digit is a sign («-20 °C»), never stripped as leading junk.
function ceTidy(t,end){
 let x=String(t).replace(/\(\s*[,;:.]?\s*\)/g,'').replace(/\s+([,.;:!?)])/g,'$1').replace(/([(])\s+/g,'$1').replace(/([,;:])\s*(?=[,;:.!?])/g,'').replace(/\s{2,}/g,' ').replace(/^(?:[\s,;:/]|[—–-](?!\d))+/u,'').replace(/[\s,;:—–\-/]+$/u,'').trim();
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
 const supplier=ceSupplierNameRegex(p);if(supplier){const k='one|'+ceAliasKey(p?.brand);if(!ceSupplierRegexCache.has(k))ceSupplierRegexCache.set(k,new RegExp(supplier.source,'iu'));const m=t.match(ceSupplierRegexCache.get(k));if(m)out.push({group:'G5',text:m[0].trim()});}
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
// Stage 5.5 review: every bulk action reports a failed save instead of its success (persist() returns false, the change
// stays unsaved in memory and is retried on the next save).
async function persist55(){const ok=await persist();if(ok===false)toast('Зміни НЕ збережено: '+(S.lastPersistError||'помилка сховища')+'. Не закривайте PIM — повторіть дію або «Сохранить».','error');return ok!==false;}
async function ceApplyClean(){
 if(CE_UI.busy||S.snap){toast('Завершіть поточну операцію');return;}
 CE_UI.busy=true;ceBusyRender55();
 try{
  // Stage 5.5 (D-75): clean name drafts go with the same button (history and undo of their own). Names first: the
  // description heading is built from the name, so drafts made after the names are not out of date at once.
  const names=[...S.products.values()].filter(p=>!p.archived&&p.fieldMeta?.name?.source!=='manual'&&nameDraftMemo(p).apply);
  const index=ceBuildIndex(),draftable=[...S.products.values()].filter(p=>!p.archived&&p.fieldMeta?.desc?.source!=='manual'&&!(ceAccepted(p)&&p.contentEngine?.inputFingerprint===ceFingerprint(p)));
  if(!draftable.length&&!names.length){toast('Чистих описів і назв для застосування немає');return;}
  if(!confirm(`Застосувати чисті назви (${names.length}) і чисті описи (перевіряється ${draftable.length})? Ручні описи й назви не зміняться. Попередні збережено — дію можна скасувати.`))return;
  try{const backup=await createAutoBackup('Перед застосуванням чистих описів',{force:true});if(!backup)await Store.set('contentengine/before_apply',backupData('Перед застосуванням чистих описів'));}catch(e){toast('Резервну копію не створено ('+(e?.message||e)+'). Описи й назви не змінено.','error');return;}
  const nameIds=[],nameFailed=[];for(const p of names){const r=nameApply(p,nameDraftMemo(p));if(r.ok)nameIds.push(p.id);else nameFailed.push(p.id);}
  const ids=[],failed=[];let n=0;
  for(const p of draftable){p.contentDraft=ceChoose(p,index);markProduct(p,true);if(!ceAutoApplyReasons(p).length){if(ceApply(p).ok){ids.push(p.id);index.add(p,p.desc);}else failed.push(p.id);}if(++n%25===0)await new Promise(r=>setTimeout(r,0));}
  // A second apply keeps the earlier undo list (merged), so the first batch can still be undone.
  const last=S.cfg.ceLastClean;S.cfg.ceLastClean={at:Date.now(),ids:uniq([...(last?.ids||[]),...ids]),names:uniq([...(last?.names||[]),...nameIds])};S.cfgDirty=true;bumpData();
  if(!(await persist55()))return;
  toast(`Застосовано: описів ${ids.length}, назв ${nameIds.length}`+(failed.length||nameFailed.length?`; не застосовано: описів ${failed.length}, назв ${nameFailed.length} (див. «Потребують рішення»)`:''));
 }finally{CE_UI.busy=false;render();}
}
// a11y (WCAG 4.1.3): while the bulk check runs, the panel says so and its buttons are disabled.
function ceBusyRender55(){const panel=document.querySelector?.('[data-ce-need]');if(!panel)return;panel.setAttribute('aria-busy','true');for(const b of panel.querySelectorAll('button'))b.disabled=true;const st=document.getElementById('workflow-status');if(st)st.textContent='Триває перевірка описів і назв…';}
async function ceUndoClean(){
 const ids=S.cfg.ceLastClean?.ids||[],nameIds=S.cfg.ceLastClean?.names||[];if(!ids.length&&!nameIds.length)return;
 if(!confirm(`Повернути попередні описи (${ids.length}) і назви (${nameIds.length})?`))return;
 const leftIds=[],leftNames=[];let n=0,m=0;
 for(const id of ids){const p=S.products.get(id);if(p&&ceUndo(p).ok)n++;else if(p)leftIds.push(id);}
 for(const id of nameIds){const p=S.products.get(id);if(p&&nameUndo(p).ok)m++;else if(p)leftNames.push(id);}
 // What could not be undone stays in the list (a later retry), and is reported.
 S.cfg.ceLastClean=leftIds.length||leftNames.length?{at:Date.now(),ids:leftIds,names:leftNames}:null;S.cfgDirty=true;bumpData();
 if(!(await persist55())){render();return;}
 toast(`Повернуто: описів ${n}, назв ${m}`+(leftIds.length||leftNames.length?`; не вдалося: описів ${leftIds.length}, назв ${leftNames.length}`:''));render();
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
 p.nameHistory=[{name:p.name,source:p.fieldMeta.name.source??null,at:Date.now()},...(p.nameHistory||[])].slice(0,10);
 p.name=d.name;p.fieldMeta.name.source='generated';markProduct(p);return {ok:true};
}
function nameUndo(p){
 if(!p||p.fieldMeta?.name?.source==='manual'||!p.nameHistory?.length)return {ok:false,why:'Немає попередньої назви'};
 const [last,...rest]=p.nameHistory;p.name=last.name;p.nameHistory=rest;
 // The name source before that apply (history of 5.5 before this field: the supplier's, once nothing is left to undo).
 ensureFieldMeta(p);if(last.source!==undefined)p.fieldMeta.name.source=last.source??'supplier';else if(!rest.length)p.fieldMeta.name.source='supplier';
 markProduct(p);return {ok:true};
}
// The site title follows an applied name (the import may have left a cleaned supplier title in p.model_name, which wins
// otherwise); the owner's marketing name still comes first. The product ADDRESS does not move: the slug is built from the
// title the product would have without the applied name (SITE keeps no redirect from an old product slug; S55-13).
const finalTitleRaw55=finalTitle;
finalTitle=function(p){return !p?.marketing_name_uk&&p?.fieldMeta?.name?.source==='generated'&&p.name?finalTitleRaw55({...p,model_name:''}):finalTitleRaw55(p);};
function finalSlugTitle(p){return p?.fieldMeta?.name?.source==='generated'&&p.fieldMeta.name.supplierOriginal?finalTitleRaw55({...p,name:p.fieldMeta.name.supplierOriginal}):finalTitleRaw55(p);}
function nameDraftPanel(p){
 const d=nameDraft(p),orig=p.fieldMeta?.name?.supplierOriginal??d.original;
 return `<div class="ce-panel" data-name-panel><b>Назва</b><p class="small">Назва постачальника: ${esc(orig)}</p>${d.apply?`<p class="small">Чернетка: ${esc(d.name)} <span class="muted">(${esc(d.changes.join(', '))})</span></p>`:''}${d.reasons.length?`<p class="small ce-warning">${esc(d.reasons.join('; '))}</p>`:''}<div class="row">${d.apply&&p.fieldMeta?.name?.source!=='manual'?'<button class="btn small" data-act="ceNameApplyOne">Застосувати назву</button>':''}${p.nameHistory?.length?'<button class="btn small" data-act="ceNameUndoOne">Повернути попередню назву</button>':''}</div></div>`;
}
const ceProductPanel55=ceProductPanel;ceProductPanel=function(p){return nameDraftPanel(p)+ceProductPanel55(p);};
const ceAction55n=ceAction;ceAction=async function(a,t){
 if(a==='ceNameApplyOne'||a==='ceNameUndoOne'){const p=S.edit;if(!p)return;const r=a==='ceNameApplyOne'?nameApply(p):nameUndo(p);if(!r.ok){toast(r.why);return;}if(await persist55())toast('Назву оновлено');render();return;}
 return ceAction55n(a,t);
};

// Stage 5.5.2 (owner, replaces D-74 and the 5.5.1 wave modes): no wave, no conditions, rating, limit or quotas — the owner
// picks the products for the site on the «Відбір для сайту» screen (below). Helpers kept from 5.5.
// launchConditionHooks: test seam only (synthetic products with fresh data); the application never sets it.
const launchConditionHooks={fresh:null};
function launchSupplierIds(p){return uniq((p.variants||[]).flatMap(v=>Object.keys(v.offers||{})));}
function launchMainSupplier(p){for(const v of p.variants||[]){const o=calc(p,v).o;if(o?.sid)return o.sid;}return launchSupplierIds(p)[0]||'';}
function launchPayable(p,v){const c=calc(p,v);if(c.avail!=='in'||c.price==null)return false;if(launchConditionHooks.fresh)return launchConditionHooks.fresh(p,v);return classificationAvailability(p,v).payment_allowed===true&&classificationFreshnessClass(p,v)==='fresh';}
const render55=render;render=function(){
 const a=typeof document!=='undefined'?document.activeElement:null,act=a?.dataset?.act,attrs=act?['need','sid','id','page'].map(k=>a.dataset[k]==null?'':`[data-${k}="${CSS.escape(a.dataset[k])}"]`).join(''):'',panel=act?a.closest('[data-ce-need],[data-site-select],[data-dry-run],[data-name-panel]'):null,mark=panel?['ceNeed','siteSelect','dryRun','namePanel'].find(k=>k in panel.dataset):null;
 const out=render55.apply(this,arguments);
 if(act&&document.activeElement===document.body){const again=document.querySelector(`[data-act="${CSS.escape(act)}"]${attrs}`);
  if(again&&!again.disabled)again.focus({preventScroll:true});else if(mark){const box=document.querySelector('[data-'+mark.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']'),h=box?.querySelector('h2,b');if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true});}}}
 return out;
};

// Stage 5.5 (owner D-77, S52-03): import hardening and the dry run of a new supplier.
// A price written «1.250» or «1,250» can be 1.25 or 1250: it is not accepted (the product stays without a price).
function importPrice(v){if(typeof v==='number')return Number.isFinite(v)?v:null;const t=String(v??'').trim().replace(/[\s  ]/g,'');if(/^\d{1,3}[.,]\d{3}$/.test(t))return null;return parseNum(v);}
// Excel serial days → the moment in Kyiv time (the 1904 system starts 1462 days later).
function xlsxSerialToMs(serial,date1904=false){
 const days=Number(serial)+(date1904?1462:0),utc=Math.round((days-25569)*86400000);if(!Number.isFinite(utc)||Math.abs(utc)>8.64e15)return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(utc)).map(x=>[x.type,x.value]));
 const asKyiv=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);return utc-(asKyiv-utc);
}
const supplierCatalogueMedian55=memoByData(function(){const s=[...S.products.values()].filter(p=>!p.archived).flatMap(p=>(p.variants||[]).map(v=>calc(p,v).price)).filter(x=>x!=null&&x>0).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;});
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
 const mine=med(rows.map(r=>importPrice(g(r,'cost'))).filter(x=>x!=null)),ours=supplierCatalogueMedian55();
 if(mine&&ours&&(mine>ours*3||mine*3<ours))warnings.push(`Медіана ціни постачальника ${mine} грн, у каталозі ${ours} грн — Перевірте одиниці/валюту`);
 const shares={rows:rows.length,no_photo:0,no_brand:0,no_size:0,no_description:0};for(const r of rows){if(!String(g(r,'photos')??'').trim())shares.no_photo++;if(!String(g(r,'brand')??'').trim())shares.no_brand++;if(!String(g(r,'size')??'').trim())shares.no_size++;if(!String(g(r,'desc')??'').trim())shares.no_description++;}
 const st=I?.source_time,data_time=st?.at?new Date(st.at).toISOString()+' ('+(st.provenance||'?')+')':'без дати даних — продаж лише через менеджера';
 return {errors,warnings,shares,data_time,blocked:errors.length>0};
}
function supplierDryRunVerify(sid,report){const s=S.cfg.suppliers.find(x=>x.id===sid);if(!s)return {ok:false,why:'Постачальника не знайдено'};if(report?.errors?.length)return {ok:false,why:'Спершу виправте помилки сухого прогону'};s.needsDryRun=false;s.dryRunVerifiedAt=Date.now();S.cfgDirty=true;bumpData();return {ok:true};}
function supplierDryRunPanel(){
 const I=S.imp;if(!I?.rows)return '';const sup=S.cfg.suppliers.find(s=>s.id===I.sup),r=supplierDryRun(I),pct=n=>r.shares.rows?Math.round(n*100/r.shares.rows)+' %':'—';
 return `<section class="panel" data-dry-run><h2>Сухий прогін постачальника${sup?' · '+esc(sup.name):''}</h2>${sup?.needsDryRun?'<p class="small">Новий постачальник: його товари потраплять у хвилю лише після чистого прогону й підтвердження.</p>':''}
 <div role="status" id="dry-run-notes">${r.errors.map(e=>`<p class="small ce-warning">Помилка: ${esc(e)}</p>`).join('')}${r.warnings.map(w=>`<p class="small">Попередження: ${esc(w)}</p>`).join('')}</div>
 <table><caption class="sr-only">Частки рядків файлу без даних</caption><thead><tr><th scope="col">Рядків</th><th scope="col">Без фото</th><th scope="col">Без бренду</th><th scope="col">Без розмірів</th><th scope="col">Без опису</th></tr></thead><tbody><tr><td>${r.shares.rows}</td><td>${pct(r.shares.no_photo)}</td><td>${pct(r.shares.no_brand)}</td><td>${pct(r.shares.no_size)}</td><td>${pct(r.shares.no_description)}</td></tr></tbody></table>
 <p class="small">Час даних: ${esc(r.data_time)}</p>${sup?.needsDryRun?`<button class="btn" data-act="wfDryRunVerify" data-sid="${esc(sup.id)}" ${r.errors.length?'disabled aria-describedby="dry-run-notes"':''}>Постачальника перевірено</button>`:''}</section>`;
}
const vImport55=vImport;vImport=function(){return supplierDryRunPanel()+vImport55();};
const workflowAction55=workflowAction;workflowAction=async function(action,t){
 if(action==='wfDryRunVerify'){const r=supplierDryRunVerify(t.dataset.sid,supplierDryRun(S.imp));if(!r.ok){toast(r.why,'error');return;}if(await persist55())toast('Постачальника перевірено');render();return;}
 return workflowAction55(action,t);
};

// Stage 5.5.1 (owner D-81): the site description is the supplier's own text after the 5.5 cleaning (G1–G6: prices, contacts,
// links, stock and lead times, «our shop», other shops, the supplier's name instead of the brand, repeated or empty headings,
// lines without text) — no rewriting, no generation, no translation. Technical numbers stay (D-67, ceCleanUnit). The supplier
// original is never changed: the cleaned text is stored next to it (p.supplierClean) when the owner publishes the chosen
// products («Опублікувати обрані», with an undo); the export sends it instead of the current text.
const SUPPLIER_CLEAN_VERSION=1;
// A list marker is a bullet, or a dash followed by a space; «-20 °C» keeps its sign (review HIGH, D-67).
const SUPPLIER_CLEAN_BULLET=/^(?:[•▪●◦·]+|[–—-]+(?=\s))\s*/u;
const SUPPLIER_CLEAN_SPLIT=/((?<!&[a-zA-Z]{1,20});\s*|(?<=[!?])\s+|(?<=\.)\s+(?=[A-ZА-ЯІЇЄҐ]))/u;
function supplierCleanSources(p){
 const own=ceSupplierSource(p)||simpleSource(p);
 return uniq([own,...(p.contentSourceKeys||[]).map(k=>S.content.get(k)?.originalDesc||S.content.get(k)?.d||'')].map(s=>String(s||'')).filter(s=>s.trim()));
}
function supplierCleanText(p){
 const sources=supplierCleanSources(p),removed=[],commercialInTechnical=[],paras=[],seen=new Set();
 let prev='';const titles=new Set([p.name,p.model_name,p.marketing_name_uk,p.fieldMeta?.name?.supplierOriginal].filter(Boolean).map(t=>norm(t)));
 const done=[];
 for(const source of sources){let pending=null;const emptyHeading=()=>{if(pending)removed.push({group:'G6',text:pending,reason:'заголовок без тексту'});pending=null;};
  // The same description stored again (the price-list record of the product) is one text, not a second copy.
  const whole=norm(ceSourcePlain(source));if(done.some(d=>d.includes(whole))){removed.push({group:'G6',text:'(повний повтор опису постачальника)',reason:'повтор опису'});continue;}done.push(whole);
  for(const rawLine of ceSourcePlain(source).split('\n')){
   const line=rawLine.replace(SUPPLIER_CLEAN_BULLET,'').trim();if(!line)continue;
   if(/^[\p{P}\p{S}\s]+$/u.test(line)){removed.push({group:'G6',text:line,reason:'рядок без тексту'});continue;}
   if(ceHeadingLike(line)){emptyHeading();const k='h:'+line.toLowerCase().replace(/[\s:]+$/,'');prev=k;if(seen.has(k))removed.push({group:'G6',text:line,reason:'повторний заголовок'});else{seen.add(k);pending=line;}continue;}
   if(titles.has(norm(line))&&!ceTechTokens(line).length){removed.push({group:'G6',text:line,reason:'повтор назви товару'});continue;}
   const parts=line.split(SUPPLIER_CLEAN_SPLIT),kept=[];
   for(let i=0;i<parts.length;i+=2){
    const unit=parts[i].replace(SUPPLIER_CLEAN_BULLET,'').trim(),sep=String(parts[i+1]||'').trim();if(!unit)continue;
    let c=ceCleanUnit(unit,p);
    // A specification value («440С», «G10») is data even without three letters: only G6 «рядок без тексту» is undone.
    if(!c.text&&c.removed.length===1&&c.removed[0].group==='G6'&&/[\p{L}\p{N}]/u.test(unit))c={...c,text:ceTidy(unit,''),removed:[]};
    for(const r of c.removed)removed.push(r);if(!c.text)continue;
    // Short units are table values («3 мм» of two different rows): a short unit repeats only together with the unit before it
    // (a block stored again for every SKU), a long one (25+ characters, as simpleDescription) repeats by itself.
    const own=c.text.toLowerCase().replace(/\s+/g,' ').replace(/[\s.:;]+$/,''),key=own.length>=25?own:'pair:'+prev+'|'+own;prev=own;if(seen.has(key)){removed.push({group:'G6',text:c.text,reason:'повтор речення'});continue;}seen.add(key);
    if(c.warning)commercialInTechnical.push(c.text);kept.push({text:c.text,sep});
   }
   if(!kept.length)continue;
   if(pending){paras.push({heading:pending});pending=null;}
   paras.push({text:kept.map((u,i)=>u.text+(i<kept.length-1?(u.sep?u.sep+' ':' '):'')).join('')});
  }
  emptyHeading();
 }
 const body=paras.filter(x=>x.text).map(x=>x.text).join('\n'),text=paras.map(x=>x.heading||x.text).join('\n');
 const html=paras.map(x=>x.heading?`<p><strong>${htmlSafeText(x.heading)}</strong></p>`:`<p>${htmlSafeText(x.text)}</p>`).join('');
 return {version:SUPPLIER_CLEAN_VERSION,html,text,short:body.replace(/\s+/g,' ').slice(0,280),words:(body.match(/[\p{L}\p{N}]+(?:[’'ʼ-][\p{L}\p{N}]+)*/gu)||[]).length,
  removed,commercialInTechnical,signals:ceCommercialSignals(text,p),sourceHash:fnvHash(JSON.stringify(sources))};
}
const supplierCleanMemo=memoProd('supplierClean551',supplierCleanText);
function supplierCleanApplies(p){return !!p&&p.fieldMeta?.desc?.source!=='manual'&&!classificationLocked(p,'desc');}
// The export (contract v3 and the older feed) sends the published cleaned text; a manual description keeps priority.
const finalDescription551=finalDescription;
// Stage 5.5.2: a published snapshot is sent even when empty — an empty cleaned text means «no description» (never the raw text).
finalDescription=function(p){return p?.supplierClean&&supplierCleanApplies(p)?String(p.supplierClean.html||''):finalDescription551(p);};
const cePublishedDescription551=cePublishedDescription;
cePublishedDescription=function(p){return p?.supplierClean&&supplierCleanApplies(p)?String(p.supplierClean.html||''):cePublishedDescription551(p);};

// Stage 5.5.2 (owner): «Відбір для сайту» instead of the wave — every catalogue product, nothing chosen by default; the owner
// ticks products one by one or all that match a filter («Обрано: N»). Filters: supplier, category, photos, sizes, price,
// «можна купити зараз» (data fresh ≤ pay_fresh_hours — direct payment; ≤ sell_max_days — after confirmation), length of the
// cleaned supplier text. Hint columns, never exclusions: Russian text, no brand, the name, D-71. A restricted product (S54-04)
// stays rejected and cannot be chosen. «Опублікувати обрані» publishes the chosen ones with the cleaned supplier texts and
// takes the rest off the site (kept in PIM), with a confirmation, a backup and an undo. The choice is S.siteSelection, stored
// under its own key «site/selection» and in backups: not in S.cfg, because every S.cfg change (the cfgDirty setter) bumps the
// data version and recomputes the whole catalogue — 4–5 s per click on run11.
const SEL_UI={f:{q:'',sup:'',cat:'',photos:'',sizes:'',pmin:'',pmax:'',buy:'',words:'',show:''},page:0,size:100};
const SEL_D71={underpaid:'можлива недоплата',made_to_order:'під замовлення'};
function selClean(x){const out={};if(x&&typeof x==='object'&&!Array.isArray(x))for(const [id,v] of Object.entries(x))if(v===true&&/^[-A-Za-z0-9_.]{1,128}$/.test(id))out[id]=true;return out;}
function selChosen(){if(!S.siteSelection||typeof S.siteSelection!=='object')S.siteSelection={};return S.siteSelection;}
const selProductionLoad=productionLoad;productionLoad=async function(){const r=await selProductionLoad(...arguments);try{S.siteSelection=selClean(await Store.get('site/selection'));}catch(e){console.error('site/selection',e);S.siteSelection={};}return r;};
const selBackupData=backupData;backupData=function(){const d=selBackupData(...arguments);d.siteSelection={...selChosen()};return d;};
const selApplyRestore=applyRestoreData;applyRestoreData=async function(d){const r=await selApplyRestore(...arguments);S.siteSelection=selClean(d?.siteSelection);await Store.set('site/selection',S.siteSelection);return r;};
function selRow(p){
 const c=supplierCleanMemo(p),prices=(p.variants||[]).map(v=>calc(p,v).price).filter(x=>x!=null).map(Number),fd=finalDecision(p),nd=nameDraftMemo(p);
 let buy='no';for(const v of p.variants||[]){if(launchPayable(p,v)){buy='now';break;}const k=calc(p,v);if(k.avail==='in'&&k.price!=null&&classificationFreshnessClass(p,v)==='confirm')buy='confirm';}
 const why=(fd.reasons||[]).filter(r=>r.code!=='OWNER_UNPUBLISHED').map(r=>r.why||r.code),restricted=siteBlocked(p);
 const state=restricted?'Відхилено: обмежена група':fd.state==='READY'?'Готовий':why.length?(fd.state==='MODERATION'?'Модерація: ':'Відхилено: ')+why[0]:'Знято з сайту';
 return {id:p.id,name:finalTitle(p)||p.name||p.id,supplier:launchMainSupplier(p),top:String(p.category||'').split(' / ')[0]||'—',photos:finalUsablePhotos(p).length,
  sizes:uniq((p.variants||[]).map(v=>realVal(v.size)).filter(Boolean)).length,price:prices.length?Math.min(...prices):null,buy,own:!supplierCleanApplies(p),words:c.words,
  ru:hasRussianText(c.text),noBrand:!realBrand(p),nameHint:nd.reasons[0]||(nd.apply?'є чиста чернетка назви':''),d71:uniq(supplierTextChecksMemo(p).map(x=>x.kind)),
  commercial:!!(c.commercialInTechnical.length||c.signals.length),state,ready:fd.state==='READY',restricted,onSite:!!p.pub&&fd.state==='READY'};
}
// Own cache, by the data version only (memoByData also expires every minute, and the screen is clicked often); a 10-minute
// bucket keeps «можна купити зараз» current as data ages.
let selRowsVer=null,selRowsVal=null;
function selRows(){const ver=_dataVer+'|'+Math.floor(Date.now()/600000);if(selRowsVer!==ver){selRowsVal=[...S.products.values()].filter(p=>!p.archived&&!p.merged_into).sort((a,b)=>a.id.localeCompare(b.id)).map(selRow);selRowsVer=ver;}return selRowsVal;}
function selMatch(r,f,chosen){
 const n=v=>v===''||v==null?null:Number(v);
 if(f.q&&!(norm(r.name).includes(norm(f.q))||r.id===f.q.trim()))return false;
 if(f.sup&&r.supplier!==f.sup)return false;if(f.cat&&r.top!==f.cat)return false;
 if(n(f.photos)!=null&&r.photos<n(f.photos))return false;
 if(f.sizes==='none'?r.sizes!==0:n(f.sizes)!=null&&r.sizes<n(f.sizes))return false;
 if(n(f.pmin)!=null&&!(r.price>=n(f.pmin)))return false;if(n(f.pmax)!=null&&!(r.price!=null&&r.price<=n(f.pmax)))return false;
 if(f.buy&&r.buy!==f.buy)return false;if(n(f.words)!=null&&r.words<n(f.words))return false;
 if(f.show==='chosen'&&!chosen[r.id]||f.show==='not'&&chosen[r.id])return false;
 return true;
}
function selFiltered(){const chosen=selChosen();return selRows().filter(r=>selMatch(r,SEL_UI.f,chosen));}
function selBlock(){
 const rows=selRows(),chosen=selChosen(),list=selFiltered(),pol=freshnessPolicy(),pages=Math.max(1,Math.ceil(list.length/SEL_UI.size));SEL_UI.page=Math.min(SEL_UI.page,pages-1);
 const n=rows.filter(r=>chosen[r.id]).length,onSite=rows.filter(r=>r.onSite).length,selectable=list.filter(r=>!r.restricted).length,f=SEL_UI.f;
 const opt=(key,values,label)=>`<label class="f small">${esc(label)}<select data-sel-f="${key}">${values.map(([v,t])=>`<option value="${esc(v)}" ${String(f[key])===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
 const num=(key,label,w=80)=>`<label class="f small">${esc(label)}<input type="number" min="0" data-sel-f="${key}" value="${esc(f[key])}" style="width:${w}px"></label>`;
 const sups=uniq(rows.map(r=>r.supplier).filter(Boolean)).map(id=>[id,supName(id)]).sort((a,b)=>a[1].localeCompare(b[1])),cats=uniq(rows.map(r=>r.top)).sort((a,b)=>a.localeCompare(b));
 const buyText={now:`Так (дані ≤ ${pol.pay_fresh_hours} год)`,confirm:`Після підтвердження (≤ ${pol.sell_max_days} днів)`,no:'Ні'};
 const tag=t=>`<span class="tag">${esc(t)}</span>`;
 const hints=r=>[r.ru?tag('російський текст'):'',r.noBrand?tag('немає бренду'):'',r.nameHint?tag('назва: '+r.nameHint.replace(/^Назва:\s*/,'')):'',...r.d71.map(k=>tag(SEL_D71[k]||k)),r.commercial?tag('реклама в технічному реченні'):''].join(' ');
 const page=list.slice(SEL_UI.page*SEL_UI.size,(SEL_UI.page+1)*SEL_UI.size);
 const row=r=>`<tr><td><input type="checkbox" data-act="ceSelToggle" data-id="${esc(r.id)}" aria-label="Обрати: ${esc(r.name)}" ${chosen[r.id]?'checked':''} ${r.restricted?'disabled':''}></td><td><span class="link" data-open="${esc(r.id)}">${esc(r.name)}</span></td><td>${esc(supName(r.supplier)||'—')}</td><td>${esc(r.top)}</td><td class="num">${r.photos}</td><td class="num">${r.sizes}</td><td class="num">${r.price==null?'—':money(r.price)}</td><td>${esc(buyText[r.buy])}</td><td class="num">${r.own?'ручний':r.words}</td><td>${hints(r)}</td><td class="small">${esc(r.state)}${r.onSite?' · на сайті':''}</td></tr>`;
 return `<div class="panel" data-site-select style="border:2px solid var(--accent);margin-bottom:18px"><h2 style="margin-top:0">Відбір для сайту</h2>
 <p class="small muted">Усі товари каталогу. Позначте товари для сайту — по одному або всі за фільтром. «Опублікувати обрані» публікує позначені товари з очищеними описами постачальника, решту знімає з сайту (товари залишаються в PIM). Підказки не відсівають товари.</p>
 <div class="stats"><div class="stat"><b style="color:var(--ok)" role="status">Обрано: ${n}</b><span>з ${rows.length} товарів</span></div><div class="stat"><b>${onSite}</b><span>зараз на сайті</span></div><div class="stat"><b>${list.length}</b><span>за фільтром</span></div></div>
 <div class="row" style="flex-wrap:wrap;align-items:flex-end"><label class="f small">Пошук<input type="search" data-sel-f="q" value="${esc(f.q)}" style="width:160px"></label>
 ${opt('sup',[['','усі'],...sups],'Постачальник')}${opt('cat',[['','усі'],...cats.map(c=>[c,c])],'Категорія')}${num('photos','Фото, від')}${opt('sizes',[['','усі'],['none','без розмірів'],['1','від 1'],['3','від 3']],'Розміри')}
 ${num('pmin','Ціна від, грн',90)}${num('pmax','Ціна до, грн',90)}${opt('buy',[['','усі'],['now',buyText.now],['confirm',buyText.confirm],['no','Ні']],'Можна купити зараз')}${num('words','Опис, слів від')}
 ${opt('show',[['','усі'],['chosen','обрані'],['not','не обрані']],'Показати')}<button class="btn small" data-act="ceSelFilter">Застосувати фільтр</button><button class="btn small" data-act="ceSelReset">Скинути</button></div>
 <div class="row"><button class="btn small" data-act="ceSelAll" ${selectable?'':'disabled'}>Обрати всі за фільтром (${selectable})</button><button class="btn small" data-act="ceSelNone" ${list.some(r=>chosen[r.id])?'':'disabled'}>Зняти вибір за фільтром</button></div>
 <div class="tablewrap"><table><caption class="sr-only">Товари каталогу для відбору на сайт</caption><thead><tr><th scope="col"><span class="sr-only">Обрано</span></th><th scope="col">Товар</th><th scope="col">Постачальник</th><th scope="col">Категорія</th><th scope="col" class="num">Фото</th><th scope="col" class="num">Розміри</th><th scope="col" class="num">Ціна від</th><th scope="col">Можна купити зараз</th><th scope="col" class="num">Опис, слів</th><th scope="col">Підказки</th><th scope="col">Стан у PIM</th></tr></thead><tbody>${page.map(row).join('')||'<tr><td colspan="11" class="muted">Немає товарів за фільтром</td></tr>'}</tbody></table></div>
 <div class="row"><button class="btn small" data-act="ceSelPage" data-page="${SEL_UI.page-1}" ${SEL_UI.page>0?'':'disabled'}>← Попередня</button><span class="small">Сторінка ${SEL_UI.page+1} з ${pages}</span><button class="btn small" data-act="ceSelPage" data-page="${SEL_UI.page+1}" ${SEL_UI.page<pages-1?'':'disabled'}>Наступна →</button></div>
 <div class="row" style="margin-top:12px"><button class="btn primary" data-act="ceSelPublish" ${n?'':'disabled'}>Опублікувати обрані (${n})</button>${S.cfg.sitePublishLast?'<button class="btn" data-act="ceSelUndo">Скасувати останню публікацію</button>':''}</div></div>`;
}
async function selPublish(){
 const chosen=selChosen(),ids=new Set(Object.keys(chosen).filter(id=>{const p=S.products.get(id);return chosen[id]&&p&&!p.archived&&!siteBlocked(p);}));
 if(!ids.size){toast('Нічого не обрано');return;}
 const hide=[...S.products.values()].filter(p=>!p.archived&&!ids.has(p.id)&&!finalOwnerUnpublished(p)&&(p.pub||finalDecision(p).state==='READY'));
 const noText=[...ids].filter(id=>{const p=S.products.get(id);return supplierCleanApplies(p)&&!supplierCleanMemo(p).words;}).length;
 if(!confirm(`Буде опубліковано: ${ids.size} (з очищеними описами постачальника). Буде знято з сайту: ${hide.length} (товари залишаться в PIM).`+(noText?` Без тексту постачальника після чистки: ${noText} — на сайт не підуть.`:'')+' Продовжити?'))return;
 try{const backup=await createAutoBackup('Перед публікацією обраних',{force:true});if(!backup)await Store.set('contentengine/before_site_selection',backupData('Перед публікацією обраних'));}catch(e){toast('Резервну копію не створено ('+(e?.message||e)+'). Нічого не опубліковано.','error');return;}
 // A repeated publish keeps the state before the FIRST one for every product already recorded (undo returns to it).
 const prev={...(S.cfg.sitePublishLast?.prev||{})},at=Date.now(),remember=p=>{if(!prev[p.id])prev[p.id]=[p.pub??null,p.fieldMeta?.pub?.source??null,!!p.waveLaunchHidden,p.supplierClean?structuredClone(p.supplierClean):null];};
 for(const id of ids){const p=S.products.get(id);remember(p);ensureFieldMeta(p);p.pub=true;p.fieldMeta.pub={...(p.fieldMeta.pub||{}),source:'manual'};p.waveLaunchHidden=false;
  if(supplierCleanApplies(p)){const c=supplierCleanMemo(p);p.supplierClean={version:SUPPLIER_CLEAN_VERSION,html:c.html,short:c.short,sourceHash:c.sourceHash,at};}p.syncStatus='pending';markProduct(p);}
 for(const p of hide){remember(p);ensureFieldMeta(p);p.pub=false;p.fieldMeta.pub={...(p.fieldMeta.pub||{}),source:'manual'};p.waveLaunchHidden=true;p.syncStatus='pending';markProduct(p);}
 S.cfg.sitePublishLast={at,prev};S.cfgDirty=true;invalidateLaunchCache();
 if(!(await persist55())){render();return;}
 const ready=[...ids].filter(id=>finalDecision(S.products.get(id)).state==='READY').length;
 toast(`Опубліковано ${ids.size}: на сайт підуть ${ready}`+(ready<ids.size?`, ще не готові в PIM — ${ids.size-ready} (див. «Стан у PIM»)`:'')+`; знято з сайту ${hide.length}`,ready<ids.size?'error':undefined);render();
}
async function selUndo(){
 const prev=S.cfg.sitePublishLast?.prev;if(!prev)return;if(!confirm('Повернути публікацію і описи до стану перед публікацією обраних?'))return;
 for(const [id,[pub,source,hidden,clean]] of Object.entries(prev)){const p=S.products.get(id);if(!p)continue;ensureFieldMeta(p);p.pub=pub;if(source==null){if(p.fieldMeta.pub)delete p.fieldMeta.pub.source;}else p.fieldMeta.pub={...(p.fieldMeta.pub||{}),source};
  p.waveLaunchHidden=hidden;if(clean)p.supplierClean=clean;else delete p.supplierClean;p.syncStatus='pending';markProduct(p);}
 S.cfg.sitePublishLast=null;S.cfgDirty=true;invalidateLaunchCache();
 if(!(await persist55())){render();return;}
 toast('Публікацію обраних скасовано');render();
}
async function selSave(msg){
 try{await Store.set('site/selection',{...selChosen()});}catch(e){toast('Вибір НЕ збережено: '+(e?.message||e)+'. Повторіть дію.','error');render();return;}
 if(msg)toast(msg);render();
}
function vSiteSelect(){return '<h1>Відбір для сайту</h1>'+selBlock();}
// Stage 5.5.4 (owner, class A): once the selection holds at least one product of the catalogue, EVERY send to the site — full
// sync, «Опубликовать изменения», the automatic publish after an import — carries only the chosen READY products; a product
// the site already shows and that is not chosen goes to hide_ids. New products of an import are not chosen, so they never
// reach the site by themselves. Ids left over from deleted products do not count (an emptied catalogue sends as before).
function selActive(){const c=selChosen();for(const id in c)if(c[id]&&S.products.has(id))return true;return false;}
const selWire554=pimSiteWire;pimSiteWire=function(){const w=selWire554(...arguments);if(!selActive())return w;const c=selChosen(),products=w.products.filter(p=>c[p.id]);return {...w,products,catalog_revision:fnvHash(stableValue105(products.map(finalModelHash)))};};
const selHide554=finalExplicitHideIds;finalExplicitHideIds=function(published){const out=new Set(selHide554(published));if(selActive()){const c=selChosen();for(const id of Object.keys(published||{}))if(!c[id]&&S.products.has(id))out.add(id);}return [...out].sort();};
// The «Готовність» page keeps only a link: its own checks are heavy, the selection screen is clicked often.
waveBlock=function(){const n=Object.keys(selChosen()).filter(id=>S.products.has(id)).length;return `<div class="panel" style="border:2px solid var(--accent);margin-bottom:18px"><b>Відбір для сайту</b> · обрано ${n} <button class="btn small" data-view="siteSelect">Відкрити</button></div>`;};
const ceAction552=ceAction;ceAction=async function(a,t){
 if(a==='ceSelToggle'){const id=t.dataset.id,p=S.products.get(id);if(!p||siteBlocked(p))return;const c=selChosen();if(c[id])delete c[id];else c[id]=true;await selSave();return;}
 if(a==='ceSelFilter'){for(const el of $$('[data-sel-f]'))SEL_UI.f[el.dataset.selF]=String(el.value??'').trim();SEL_UI.page=0;render();return;}
 if(a==='ceSelReset'){for(const k of Object.keys(SEL_UI.f))SEL_UI.f[k]='';SEL_UI.page=0;render();return;}
 if(a==='ceSelPage'){SEL_UI.page=Math.max(0,Number(t.dataset.page)||0);render();return;}
 if(a==='ceSelAll'){const c=selChosen(),list=selFiltered().filter(r=>!r.restricted);for(const r of list)c[r.id]=true;await selSave('Обрано за фільтром: '+list.length);return;}
 if(a==='ceSelNone'){const c=selChosen();let k=0;for(const r of selFiltered())if(c[r.id]){delete c[r.id];k++;}await selSave('Знято вибір: '+k);return;}
 if(a==='ceSelPublish'){await selPublish();return;}
 if(a==='ceSelUndo'){await selUndo();return;}
 return ceAction552(a,t);
};
