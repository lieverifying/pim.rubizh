// Unified workflow, actionable problems and supplier source automation.
const WORKFLOW={active:null,last:null,unsaved:false,controls:new Map(),sources:new Map(),timer:null};
const WORKFLOW_SAVES=new Set(['saveProduct','priceAccept','priceReject','archiveProduct','restoreProduct','syncError','deleteForever','bulkDeleteForever','bulkPubWave','bulkPub','bulkUnpub','bulkAds','bulkNoAds','bulkArchive','bulkRestore','gCreate','gLink','gIgnore','gCreateAll','gCreateSelected','gIgnoreAll','addSup','toggleSup','deleteSupData','savePrices','saveMaps','applyCats','impApply','undoLast','splitVariants','bulkMerge','autoBakNow','restoreConfirm','cleanStart','tbApply','massUndo','adsClearAll','adsOverride','locAccept','locDesc','locAcceptPage','locDescPage','locOk','locOkPage','mergePair','mergeReject','mergeUnreject','mergeAll','termsSave','autoDist','saveUnsorted','persistStorage','wfSaveSource','wfSaveAutomation','wfRetrySave',"pubSel","pubDescOk","pubArchive","pubDeleteForever","pubArchiveOne","pubRestore","pubDelOne","wavePublishAll","waveHideRest","bulkCat","bulkDel","unignore","bulkCreate","undoStored","clearCatalog","clearCatalogSuppliers","factoryReset"]);
const WORKFLOW_REMOTE=new Set(['backupDl','driveUp','sitePub','siteFull','siteCheck','sbSyncNow','sbConnect','impRun','impForce','docSave','docDel','docDl','docZip','dlGoogle','dlMeta','dlAll','dlJson','dlCsv','autoBakDl','restoreLastGood','restoreBeforeImport','restorePreRepair','restoreBeforeMerge','wfFetchSource','wfRefreshSources']);
function workflowManaged(action){return WORKFLOW_SAVES.has(action)||WORKFLOW_REMOTE.has(action)||/^ce(?:Preview|Apply|Batch)/.test(action);}
function workflowActionStart(action,button){
 if(!workflowManaged(action))return null;
 if(WORKFLOW.active){workflowToast('Дождитесь завершения текущего действия');return false;}
 const ctx={action,label:(button?.textContent||action).trim().slice(0,100),requiresSave:WORKFLOW_SAVES.has(action)||/^ce.*Row$/.test(action)||action==='ceBatchApply',attempted:false,saved:false,failed:false,message:'',error:'',started:Date.now()};
 WORKFLOW.active=ctx;workflowRenderStatus();return ctx;
}
function workflowActionError(ctx,error){const message=error?.message||String(error);if(ctx)ctx.error=message;else workflowToast(message);}
function workflowActionFinish(ctx){
 if(!ctx||WORKFLOW.active!==ctx)return;
 if(ctx.error||ctx.failed){WORKFLOW.last={kind:'error',text:ctx.error||S.lastPersistError||'Изменения не сохранены. Повторите сохранение.',at:Date.now()};workflowToast(WORKFLOW.last.text);}
 else if(ctx.requiresSave&&!ctx.attempted){WORKFLOW.last={kind:'notice',text:ctx.message||(S.snap?'Изменения подготовлены в предпросмотре. Примените импорт для сохранения.':'Данные не изменились. Проверьте выбранные товары и заполненные поля.'),at:Date.now()};workflowToast(WORKFLOW.last.text);}
 else{const text=ctx.message||(ctx.saved?'Изменения сохранены':'Действие завершено');WORKFLOW.last={kind:'success',text,at:Date.now()};workflowToast(text);}
 WORKFLOW.active=null;for(const [el,disabled] of WORKFLOW.controls)el.disabled=disabled;WORKFLOW.controls.clear();workflowRenderStatus();
}
const workflowToast=toast;
// Stage 5.5 review (a11y): the kind is passed on; a message that reads as an error is shown as one (longer, role=alert).
const WORKFLOW_ERROR_RE=/(?:^|\s)(?:ошибка|помилка)(?:\s|:|$)|не удалось|не сохран|не збереж|не найден|не создан|не вдалося/iu;
toast=function(message,kind){const ctx=WORKFLOW.active;if(ctx){ctx.message=String(message);if(WORKFLOW_ERROR_RE.test(ctx.message))ctx.error=ctx.message;if(ctx.requiresSave)return;}workflowToast(message,kind||(WORKFLOW_ERROR_RE.test(String(message))?'error':undefined));};
const workflowPersist=persist;
persist=async function(...args){const ctx=WORKFLOW.active;let ok=false;try{ok=await workflowPersist(...args);return ok;}finally{
 if(!S.snap){if(ctx&&ctx===WORKFLOW.active){ctx.attempted=true;ctx.saved=ok;ctx.failed=!ok;}
  WORKFLOW.unsaved=!ok;if(!ok)WORKFLOW.last={kind:'error',text:(S.lastPersistError?S.lastPersistError+'. ':'')+'Изменения остались в памяти и не сохранены. Повторите сохранение перед обновлением страницы.',at:Date.now()};workflowRenderStatus();}
}};
function workflowRenderStatus(){
 const view=$('#view');if(!view)return;let box=$('#workflow-status');if(!box){box=document.createElement('div');box.id='workflow-status';box.setAttribute('role','status');box.setAttribute('aria-live','polite');view.parentNode.insertBefore(box,view);}
 const active=WORKFLOW.active,last=WORKFLOW.last;
 box.hidden=!active&&!WORKFLOW.unsaved&&!last;
 box.className='workflow-status '+(active?'is-busy':WORKFLOW.unsaved||last?.kind==='error'?'is-error':last?.kind==='success'?'is-success':'');
 box.innerHTML=active?`<span class="workflow-spinner" aria-hidden="true"></span><b>${esc(active.label)}: выполняется…</b>`:WORKFLOW.unsaved?`<div><b>Изменения не сохранены</b><div class="small">Правки остаются в памяти. ${esc(last?.text||'Повторите сохранение.')}</div></div><button class="btn small" data-act="wfRetrySave">Повторить сохранение</button>`:last?`<span>${esc(last.text)}</span><button class="btn small" data-act="wfDismiss" aria-label="Закрыть сообщение">×</button>`:'';
 if(active){for(const el of $$('#view button,#drawer button,#view input,#view select,#view textarea,#drawer input,#drawer select,#drawer textarea')){
  if(el.dataset.act==='ceCancel'||el.dataset.act==='wfDismiss')continue;
  if(!WORKFLOW.controls.has(el))WORKFLOW.controls.set(el,!!el.disabled);el.disabled=true;
 }}
}
const workflowCatalogProblems=memoByData(function(){
 const rows=[],ids=new Set(),offerTimes=new Map(),tree=treeSet();
 const add=(kind,key,title,detail,target,severity='warning',extra={})=>{const id=kind+':'+key;if(ids.has(id))return;ids.add(id);rows.push({id,kind,title,detail,target,severity,...extra});};
 for(const p of S.products.values()){
  if(p.archived)continue;
  for(const v of p.variants||[])for(const [sid,o] of Object.entries(v.offers||{}))if(!o.discontinued){const t=offerTimes.get(sid)||{latest:0,live:0,stale:0};t.latest=Math.max(t.latest,+o.at||0);if(p.pub){t.live++;if(offerStale(o))t.stale++;}offerTimes.set(sid,t);}
  for(const [vi,v] of (p.variants||[]).entries())for(const [sid,o] of Object.entries(v.offers||{}))if(o.priceAlert)add('price',p.id+'|'+v.sku+'|'+sid,p.name,`${v.sku}: закупка меняется на ${Math.round(o.priceAlert.changePct||0)}%.`,p.id,'error',{pid:p.id,vi,sid,alert:o.priceAlert});
  if(!p.pub)continue;
  if(!p.photos?.length)add('photo',p.id,p.name,'Добавьте хотя бы одно фото для публикации.',p.id,'error');
  if(!p.category||!tree.has(p.category))add('category',p.id,p.name,'Выберите категорию сайта.',p.id,'error');
  const price=[],review=[];
  for(const v of p.variants||[]){const c=calc(p,v);if(!Object.values(v.offers||{}).some(o=>o.priceAlert)&&(c.price==null||c.lowMargin||c.rrpViolation))price.push(v.sku);if(sourceReviewRequired108(v)&&!v.source_review_confirmed)review.push(v.sku);}
  if(price.length)add('finance',p.id,p.name,'Нет допустимой цены: '+price.slice(0,5).join(', ')+(price.length>5?'…':''),p.id,'error');
  if(review.length)add('source',p.id,p.name,'Нужно подтвердить данные поставщика: '+review.join(', '),p.id,'error');
  const draft=p.contentDraft;
  if(draft&&ceContentBlock(draft)){const reasons=[];if(draft.conflicts?.length)reasons.push('противоречивые характеристики');if(draft.languageWarnings?.length)reasons.push('неполный перевод');if(draft.sourceCoverage<1||draft.attributeCoverage<1)reasons.push('потеря важных подробностей');add('content',p.id,p.name,'Черновик: '+reasons.join(', ')+'.',p.id,'warning');}
  else if(!localizationStatus({...p,desc:cePublishedDescription(p)}).ok)add('language',p.id,p.name,'В опубликованном тексте остался русский язык. Проверьте перевод.',p.id,'error');
  const unconfirmed=(p.variants||[]).filter(v=>{const c=calc(p,v);return c.avail==='order'&&confirmedPreorderDays(c.o||c.ref)==null;});
  if(unconfirmed.length)add('lead',p.id,p.name,'Для предзаказа не подтверждён срок изготовления.',p.id,'warning');
 }
 for(const supplier of S.cfg.suppliers||[]){if(supplier.disabled)continue;const t=offerTimes.get(supplier.id),hours=+S.cfg.freshHours||0,source=supplier.source||{};
  if(t?.stale&&hours>0)add('stock',supplier.id,supplier.name,'Наличие требует обновления у '+t.stale+' предложений.', 'sup:'+supplier.id,'warning',{sid:supplier.id});
  if(source.lastError)add('feed',supplier.id,supplier.name,source.lastError,'sup:'+supplier.id,'error',{sid:supplier.id});
  else if(source.lastTimeNote)add('feed',supplier.id,supplier.name,source.lastTimeNote,'sup:'+supplier.id,'warning',{sid:supplier.id});
  const tm=supplier.terms||{};if(tm.preorderDefault==='yes'&&(!tm.preorderConfirmed||RubizhKits.preorderDays({lead_time:tm.preorderDays})==null))add('terms',supplier.id,supplier.name,'Подтвердите срок изготовления в условиях поставщика.','sup:'+supplier.id,'warning',{sid:supplier.id});
 }
 const I=computeIssues();for(const x of I.dupBc)add('identity','barcode|'+x.code,'Повторяется штрихкод',x.arr.map(a=>a.v.sku).join(', '),x.arr[0]?.p.id,'error');
 for(const x of I.dupLink)add('identity','supplier|'+x.sid+'|'+x.s,'Конфликт артикула поставщика',x.a.sku+' и '+x.b.sku,x.a.pid,'error');
 for(const x of pimKitPublication().blocked)add('kit',x.id,x.name,x.issues.join(' · '),'kits','error');
 return rows.sort((a,b)=>(a.severity==='error'?-1:1)-(b.severity==='error'?-1:1)||pimCompare(a.title,b.title));
});
function workflowProblems(){const rows=workflowCatalogProblems();return WORKFLOW.unsaved?[{id:'save',kind:'save',severity:'error',title:'Правки не сохранены',detail:'Повторите запись данных.',target:'save'},...rows]:rows;}
function workflowProblemCount(){return workflowProblems().length+groupsOfQueue().length;}
const WORKFLOW_KINDS={save:'Сохранение',price:'Изменение закупки',finance:'Цена и маржа',stock:'Наличие',feed:'Автопрайсы',content:'Описания',language:'Перевод',photo:'Фото',category:'Категории',source:'Данные поставщика',lead:'Срок изготовления',terms:'Условия поставщика',identity:'Артикулы и штрихкоды',kit:'Комплекты'};
function workflowProblemCard(x){const target=x.target,button=target==='save'?`data-act="wfRetrySave"`:target==='kits'?`data-view="kits"`:String(target).startsWith('sup:')?`data-view="${esc(target)}"`:`data-open="${esc(target)}"`;
 const price=x.kind==='price';return `<article class="panel workflow-problem"><div class="row"><span class="tag ${x.severity==='error'?'bad':'order'}">${esc(WORKFLOW_KINDS[x.kind]||x.kind)}</span><span class="spacer"></span><button class="btn small" ${button}>${price?'Открыть товар':'Исправить'}</button></div><h2>${esc(x.title)}</h2><p>${esc(x.detail)}</p>${price?`<div class="row"><span>Было: ${money2(x.alert.fromCost)} → ${money2(x.alert.cost)}</span><span class="spacer"></span><button class="btn small primary" data-act="priceAccept" data-pid="${esc(x.pid)}" data-vi="${x.vi}" data-sid="${esc(x.sid)}">Принять цену</button><button class="btn small" data-act="priceReject" data-pid="${esc(x.pid)}" data-vi="${x.vi}" data-sid="${esc(x.sid)}">Отклонить изменение</button></div>`:''}${x.kind==='stock'&&S.cfg.suppliers.find(s=>s.id===x.sid)?.source?.url?`<button class="btn small" data-act="wfFetchSource" data-sid="${esc(x.sid)}">Обновить по ссылке</button>`:''}</article>`;
}
function vQueue(){const all=workflowProblems(),kind=S.ui.workflowKind||'',query=norm(S.ui.workflowQuery||''),rows=all.filter(x=>(!kind||x.kind===kind)&&(!query||norm(x.title+' '+x.detail).includes(query))),per=30,pages=Math.max(1,Math.ceil(rows.length/per));S.ui.workflowPage=Math.max(0,Math.min(+S.ui.workflowPage||0,pages-1));const groups=groupsOfQueue();
 return `<h1>Проблемы</h1>${categoriesOverviewLink()}<p class="lead">Здесь собраны причины, которые требуют действия: цены, наличие, описания и передача на сайт.</p><div class="stats"><div class="stat"><b>${all.filter(x=>x.severity==='error').length}</b><span>ошибок</span></div><div class="stat"><b>${all.filter(x=>x.severity!=='error').length}</b><span>нужно проверить</span></div><div class="stat"><b>${groups.length}</b><span>решений по импорту</span></div></div><div class="panel row"><label class="f">Поиск<input id="workflow-query" type="search" value="${esc(S.ui.workflowQuery||'')}" placeholder="Товар, артикул, поставщик"></label><label class="f">Тип<select id="workflow-kind"><option value="">Все проблемы</option>${Object.entries(WORKFLOW_KINDS).filter(([k])=>all.some(x=>x.kind===k)).map(([k,v])=>`<option value="${k}" ${kind===k?'selected':''}>${v}</option>`).join('')}</select></label><button class="btn" data-act="wfFilter">Показать</button></div>${rows.slice(S.ui.workflowPage*per,(S.ui.workflowPage+1)*per).map(workflowProblemCard).join('')||`<div class="panel">${all.length?'По выбранному фильтру проблем нет.':'Текущие проверки не нашли проблем.'}</div>`}${pages>1?`<div class="pager"><button class="btn" data-act="wfProblemPage" data-d="-1" ${S.ui.workflowPage?'':'disabled'}>Назад</button><span>${S.ui.workflowPage+1} / ${pages}</span><button class="btn" data-act="wfProblemPage" data-d="1" ${S.ui.workflowPage+1<pages?'':'disabled'}>Дальше</button></div>`:''}${groups.length?`<details class="panel" open><summary><b>Новые товары и спорные совпадения · ${groups.length}</b></summary>${vImportDecisions()}</details>`:''}<details class="panel"><summary>Дополнительная диагностика</summary><p>Совпадения размеров и цветов допустимы и не включены в счётчик проблем.</p><button class="btn" data-view="check">Открыть диагностику</button></details>`;
}
function workflowProductionInputs(o,i){const mode=o.discontinued?'discontinued':o.preorderManual?(o.preorder?'make':'stock'):'inherit';return `<label class="f small">Правило наличия<select data-production="${esc(o.sid)}" data-vi="${i}"><option value="inherit" ${mode==='inherit'?'selected':''}>По прайсу и условиям поставщика</option><option value="make" ${mode==='make'?'selected':''}>Можно изготовить под заказ</option><option value="stock" ${mode==='stock'?'selected':''}>Только наличие по прайсу</option><option value="discontinued" ${mode==='discontinued'?'selected':''}>Снято с продажи у поставщика</option></select></label><label class="f small">Подтверждённый срок изготовления, дней<input type="number" min="1" max="90" step="1" data-production-days="${esc(o.sid)}" data-vi="${i}" value="${esc(o.productionDays||'')}" placeholder="Например: 3"></label>`;}
function workflowReadProduction(p){const edits=[];for(const select of $$('[data-production]',$('#drawer'))){const sid=select.dataset.production,vi=+select.dataset.vi,o=p.variants[vi]?.offers?.[sid];if(!o)continue;const mode=select.value,field=$(`[data-production-days="${CSS.escape(sid)}"][data-vi="${vi}"]`,$('#drawer')),days=Number(field?.value||0);if(mode==='make'&&(!Number.isInteger(days)||days<1||days>90))throw Error('Подтвердите срок изготовления: целое число от 1 до 90 дней.');edits.push({o,sid,mode,days});}
 for(const {o,sid,mode,days} of edits){o.discontinued=mode==='discontinued';if(mode==='inherit'){delete o.preorderManual;delete o.productionDays;o.preorder=supplierPreorderDefault(sid)||o.availability==='order';}else{o.preorderManual=true;o.preorder=mode==='make';if(mode==='make')o.productionDays=days;else delete o.productionDays;}}
}
function workflowYield(){return new Promise(resolve=>setTimeout(resolve,0));}
async function workflowContentAfterImport(results,apply=false){if(typeof classificationReviewMode==='function'&&classificationReviewMode())apply=false;const timestamps=new Map(results.map(x=>[x.sup,x.at]));let prepared=0,applied=0,review=0,index=null;
 for(const p of S.products.values()){
  if(p.archived||p.fieldMeta?.desc?.source==='manual'||!p.variants?.some(v=>Object.entries(v.offers||{}).some(([sid,o])=>timestamps.get(sid)===o.at)))continue;
  if(!S.cfg.contentEngineAutoDraft&&!apply)continue;touchP(p.id);
  if(refreshGeneratedDescription(p))prepared++;
  if(apply&&(!ceAccepted(p)||p.contentEngine?.inputFingerprint!==ceFingerprint(p))){if(!index)index=ceBuildIndex();if(ceAutoApply(p,index).ok){applied++;index.add(p,p.desc);}else review++;}
  if((prepared+applied+review)%20===0&&prepared+applied+review)await workflowYield();
 }
 return {prepared,applied,review};
}
function workflowSourceURL(raw){const u=new URL(String(raw||'').trim());if(u.protocol!=='https:'||u.username||u.password)throw Error('Нужна прямая HTTPS-ссылка на прайс без логина и пароля в адресе.');return u.href;}
function workflowSourcePanel(s){const source=s.source||{};return `<details class="panel workflow-source" data-source-panel="${esc(s.id)}"><summary><b>Автоматическое обновление прайса</b></summary><p class="small muted">Проверка по расписанию работает, пока PIM открыта. Для работы при закрытом браузере нужна задача на хостинге и подключение к серверной базе.</p><label class="f">Прямая ссылка на XLSX, CSV или XML<input type="url" data-source-url="${esc(s.id)}" value="${esc(source.url||'')}" placeholder="https://supplier.example/prices.xlsx"></label><div class="row"><label class="f">Интервал, часов<input type="number" min="1" max="168" step="1" data-source-hours="${esc(s.id)}" value="${+source.hours||24}"></label><label class="chk"><input type="checkbox" data-source-enabled="${esc(s.id)}" ${source.enabled?'checked':''}> Проверять автоматически</label><label class="chk"><input type="checkbox" data-source-apply="${esc(s.id)}" ${source.autoApply?'checked':''}> Применять после проверки профиля</label><label class="chk"><input type="checkbox" data-source-ignore-header="${esc(s.id)}" ${s.source_time_ignore_header===true?'checked':''}> Ігнорувати дату всередині файлу (рішення власника): час даних — дата скачування файлу</label></div><p class="small">${source.profile?'Профиль колонок подтверждён.':'Первое скачивание нужно проверить и применить в разделе импорта.'} Отсутствующие в файле позиции автоматически не обнуляются; устаревшее наличие учитывается отдельно.</p><div class="row"><button class="btn" data-act="wfSaveSource" data-sid="${esc(s.id)}">Сохранить источник</button><button class="btn primary" data-act="wfFetchSource" data-sid="${esc(s.id)}" ${source.url?'':'disabled'}>Скачать и проверить</button></div>${source.lastChecked?`<p class="small muted">Проверяли: ${esc(fmtDate(source.lastChecked))}</p>`:''}${source.lastApplied?`<p class="small">Обновление применено: ${esc(fmtDate(source.lastApplied))}</p>`:''}${source.lastError?`<p class="finance-bad">${esc(source.lastError)}</p>`:''}</details>`;}
const workflowSupplierView=vSupplier;vSupplier=function(id){const s=S.cfg.suppliers.find(x=>x.id===id);return workflowSupplierView(id)+(s?workflowSourcePanel(s):'');};
const workflowSettingsView=vSettings;vSettings=function(){return workflowSettingsView()+`<div class="panel"><h2>Автоматизация описаний</h2><p>После импорта PIM подготавливает описания из полного текста поставщика. Проверенные черновики можно применять автоматически; ручные описания защищены.</p><label class="chk"><input id="workflow-auto-draft" type="checkbox" ${S.cfg.contentEngineAutoDraft?'checked':''}> Обновлять черновики после изменения данных</label><label class="chk"><input id="workflow-auto-content" type="checkbox" aria-describedby="workflow-auto-content-help" ${S.cfg.contentAutoApply?'checked':''}> Автоматично застосовувати чисті описи</label><div class="small muted" id="workflow-auto-content-help">Опис застосовується після імпорту, лише якщо: 1) немає зауважень після чистки (суперечностей, неперекладених речень, комерційного тексту в технічних реченнях); 2) повнота не менше 60; 3) схожість на інший товар менше 85 %; 4) опис не ручний; 5) у готовому тексті немає ціни, наявності, умов, чужого магазину, контактів чи назви постачальника замість бренду (ціни, наявність, умови — перевіряються повторно). Решта — у «Потребують рішення». Застосування не публікує зміни на сайт.</div><button class="btn" data-act="wfSaveAutomation">Сохранить автоматизацию</button></div>`;};
vToday=function(){const problems=workflowProblems(),groups=groupsOfQueue().length,count=problems.length+groups,active=[...S.products.values()].filter(p=>!p.archived),variants=active.reduce((n,p)=>n+p.variants.length,0),sources=S.cfg.suppliers.filter(s=>!s.disabled&&s.source?.url);
 return `<h1>Главная</h1><p class="lead">Обновляйте прайсы, разбирайте реальные проблемы и публикуйте готовые товары.</p><div class="row workflow-home-actions"><button class="btn primary" ${sources.length?'data-act="wfRefreshSources"':'data-view="import"'}>${sources.length?'Обновить прайсы по ссылкам':'Загрузить прайс'}</button><button class="btn" data-view="queue">Проблемы · ${count}</button><button class="btn" data-view="export">Публикация на сайт</button></div>${workflowRefreshPanel()}<div class="stats"><div class="stat"><b>${active.length}</b><span>активных товаров</span></div><div class="stat"><b>${variants}</b><span>вариантов</span></div><div class="stat"><b>${problems.filter(x=>x.severity==='error').length}</b><span>ошибок</span></div><div class="stat"><b>${sources.length}</b><span>источников прайсов</span></div></div>${problems.slice(0,5).map(workflowProblemCard).join('')||`<div class="panel">Текущие проверки не нашли проблем.${groups?' Есть новые товары, которые требуют решения по импорту.':''}</div>`}${problems.length>5?`<button class="btn" data-view="queue">Все ${problems.length} проблем</button>`:''}<div class="panel"><h2>Поставщики</h2>${S.cfg.suppliers.map(s=>`<div class="row workflow-supplier-row"><div><button class="link" data-view="sup:${esc(s.id)}">${esc(s.name)}</button><div class="small muted">${s.lastImport?'Прайс: '+esc(ago(s.lastImport)):'Прайс ещё не применяли'} · ${s.disabled?'отключён':s.source?.enabled?'автопроверка при открытой PIM':'ручное обновление'}${s.source?.lastError?` · <span class="finance-bad">помилка: ${esc(s.source.lastError)}</span>`:''}</div></div><span class="spacer"></span><button class="btn small" data-act="supImport" data-sid="${esc(s.id)}">Загрузить файл</button></div>`).join('')||'<p>Добавьте поставщика и загрузите его прайс.</p>'}</div>`;
};
// Body of a supplier answer with the 64 MB limit; an empty file or an HTML page is never a price file.
async function workflowSourceBody(response,limit,type,modified){if(+response.headers.get('content-length')>limit)throw Error('Прайс больше 64 МБ.');
 const chunks=[];let total=0;if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw Error('Прайс больше 64 МБ.');}chunks.push(value);}}
 else{const bytes=await response.arrayBuffer();if(bytes.byteLength>limit)throw Error('Прайс больше 64 МБ.');chunks.push(bytes);}
 const blob=new Blob(chunks,{type:type||''});if(!blob.size)throw Error('Получен пустой файл прайса.');const text=await blob.slice(0,250).text();if(/text\/html/i.test(blob.type)||/^\s*<!doctype\s+html|^\s*<html\b/i.test(text))throw Error('Ссылка ведёт на страницу, а не на файл прайса.');const at=Date.parse(modified||'');return {blob,lastModified:Number.isFinite(at)?at:null,lastModifiedSource:'HTTP',fetchedAt:Date.now()};
}
// Stage 5.6-1 (D-82): exports without CORS (Армолайн, Киборг) — the site downloads the file by the PIM key
// (POST {site}/pim/supplier-fetch, only listed supplier domains) and passes it through unchanged.
async function workflowDownloadViaSite(url,limit){
 if(typeof siteReady!=='function'||!siteReady())throw Error('Не вдалося скачати прайс напряму (CORS або мережа). Для таких постачальників PIM завантажує прайс через сайт: вкажіть адресу API сайту і ключ у «Публікації на сайт».');
 const c=siteCfg(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);let response;
 try{
  try{response=await fetch(c.url.replace(/\/+$/,'')+'/pim/supplier-fetch',{method:'POST',signal:controller.signal,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.key},body:JSON.stringify({url})});}
  catch(error){if(error.name==='AbortError')throw Error('Сайт не віддав прайс за 180 секунд.');throw Error('Прайс не скачано напряму (CORS), і немає зв’язку з сайтом ('+c.url+') для завантаження через сервер.');}
  if(!response.ok){let j=null;try{j=await response.json();}catch{}throw Error('Сайт не завантажив прайс: '+((j&&j.error)||('HTTP '+response.status))+(j&&j.error_code?' ['+j.error_code+']':''));}
  return {...await workflowSourceBody(response,limit,response.headers.get('x-supplier-content-type'),response.headers.get('x-supplier-last-modified')),url,via:'site'};
 }catch(error){if(error.name==='AbortError')throw Error('Сайт не віддав прайс за 180 секунд.');throw error;}finally{clearTimeout(timer);}
}
async function workflowDownloadSource(raw){const url=workflowSourceURL(raw),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),limit=64*1024*1024;let response;
 try{
  try{response=await fetch(url,{signal:controller.signal,credentials:'omit',cache:'no-store'});}
  catch(error){if(error.name==='AbortError')throw Error('Скачивание прайса заняло больше 45 секунд.');if(error.name==='TypeError'){clearTimeout(timer);return await workflowDownloadViaSite(url,limit);}throw error;}
  if(!response.ok)throw Error('Поставщик вернул HTTP '+response.status);
  return {...await workflowSourceBody(response,limit,response.headers.get('content-type'),response.headers.get('last-modified')),url,via:'direct'};
 }catch(error){if(error.name==='AbortError')throw Error('Скачивание прайса заняло больше 45 секунд.');throw error;}finally{clearTimeout(timer);}
}
function workflowReadWorkbook(buffer,name){
 if(/\.(?:csv|tsv|txt)$/i.test(name)){let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('windows-1251').decode(buffer);}return XLSX.read(text.replace(/^\uFEFF/,''),{type:'string',raw:true});}
 return XLSX.read(buffer,{type:'array'});
}
async function workflowParseSource(download,supplier){const {blob,url}=download;let header=null;const name=new URL(url).pathname.split('/').pop()||'price.xlsx',profile=supplier.source?.profile,matchingURL=profile?.urlHash===fnvHash(url),isXml=/\.(xml|yml)$/i.test(name)||/^\s*<\?xml|^\s*<yml_catalog/i.test(await blob.slice(0,200).text());let rows,wb=null,sheets,sheet,hdr;
 if(isXml){const yml=parseYml(await blob.text());rows=yml.rows;header=yml.generatedAt;sheets=['XML'];sheet='XML';hdr=0;}
 else{if(typeof XLSX==='undefined')throw Error('Модуль чтения прайса не загрузился.');wb=workflowReadWorkbook(await blob.arrayBuffer(),name);header=wb.Props?.ModifiedDate||wb.Props?.CreatedDate||null;sheet=matchingURL&&wb.SheetNames.includes(profile.sheet)?profile.sheet:wb.SheetNames[0];if(!sheet)throw Error('В файле нет листов.');sheets=wb.SheetNames;rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true,blankrows:false});hdr=matchingURL&&Number.isInteger(profile.hdr)&&profile.hdr>=0&&profile.hdr<rows.length?profile.hdr:detectHeader(rows);}
 if(!Array.isArray(rows)||rows.length<=hdr+1)throw Error('В прайсе нет товарных строк.');const headers=(rows[hdr]||[]).map(String),signature=fnvHash(JSON.stringify(headers)),profileValid=matchingURL&&profile.headers===signature&&(!profile.sheet||profile.sheet===sheet);
 const map=profileValid?structuredClone(profile.map):autoMap(headers,supplier.mapping);
 const missing=FIELDS.filter(f=>f.req&&(map[f.k]==null||map[f.k]===''));if(missing.length&&supplier.source?.autoApply)throw Error('Изменилась структура прайса. Проверьте обязательные колонки вручную.');
 // Stage 5.2: the data time of the file (inside it, else its modification time) — never the import time.
 const source_time=sourceTimeForSupplier(sourceFileTime({header,mtime:download.lastModified??null,mtimeSource:download.lastModifiedSource||'FILE',fetchedAt:download.fetchedAt??null,payHours:freshnessPolicy().pay_fresh_hours}),supplier);
 return {sup:supplier.id,file:name,wb,sheets,sheet,rows,hdr,map,zero:false,xml:isXml,source_time,sourceId:supplier.id,sourceURLHash:fnvHash(url),sourceHeaders:signature,sourceProfileValid:profileValid};
}
function workflowCanFetch(){return !S.snap&&!S.edit&&!S.priceDraft&&!CE_UI.busy&&!S.saving&&!S.imp?.rows&&!WORKFLOW.unsaved;}
async function workflowFetchSource(sid,{scheduled=false}={}){
 const supplier=S.cfg.suppliers.find(s=>s.id===sid);if(!supplier||supplier.disabled)throw Error('Поставщик не найден или отключён.');if(!workflowCanFetch()){if(scheduled)return {status:'busy'};throw Error('Сначала сохраните карточку, завершите текущий импорт или сохраните настройки цен.');}
 const source=supplier.source;if(!source?.url)throw Error('Сохраните ссылку на прайс в карточке поставщика.');const previousView=S.view;
 try{source.lastAttempt=Date.now();const download=await workflowDownloadSource(source.url),I=await workflowParseSource(download,supplier);source.lastChecked=Date.now();source.lastVia=download.via||'direct';delete source.lastError;source.lastTimeNote=I.source_time&&(I.source_time.warning||I.source_time.provenance==='NONE')?sourceFileTimeNote(I.source_time):null;S.cfgDirty=true;bumpData();if(!await persist())throw Error('Статус скачивания не сохранился.');S.imp=I;
  if(source.autoApply&&I.sourceProfileValid){await doImport();if(!S.snap||!S.imp?.preview)throw Error('Не удалось подготовить обновление прайса.');const audit=previewAudit(S.imp);if(!audit.ok||S.imp.preview.some(r=>r.suspicious)){cancelImport(true);S.imp=null;throw Error('Прайс требует ручной проверки: неполный файл или ошибка самопроверки.');}
   const ok=await applyImport({automatic:true});if(!ok)throw Error('Автоматическое обновление не применено. Проверьте результат в разделе проблем.');S.view=previousView;render();return {status:'applied'};
  }
  S.view='import';render();toast(I.sourceProfileValid?'Прайс скачан. Проверьте и примените импорт.':'Прайс скачан. Один раз проверьте колонки и примените импорт для подтверждения профиля.');return {status:'review'};
 }catch(error){if(S.snap){cancelImport(true);S.imp=null;}const current=S.cfg.suppliers.find(s=>s.id===sid);if(current?.source){current.source.lastAttempt=Date.now();current.source.lastError=error.message||String(error);S.cfgDirty=true;bumpData();await persist();}throw error;}
}
function workflowRecordSourceProfile(I,automatic){if(!I.sourceId||I.sup!==I.sourceId)return;const s=S.cfg.suppliers.find(s=>s.id===I.sourceId);if(!s?.source)return;if(!automatic)s.source.profile={urlHash:I.sourceURLHash,headers:fnvHash(JSON.stringify((I.rows[I.hdr]||[]).map(String))),sheet:I.sheet,hdr:I.hdr,map:structuredClone(I.map),reviewedAt:Date.now()};s.source.lastApplied=Date.now();delete s.source.lastError;S.cfgDirty=true;}
// Stage 5.6-1: the owner sees the result of the last refresh per supplier, with the reason of every failure.
const WORKFLOW_REFRESH_LABELS={applied:'оновлено',review:'потрібна перевірка',error:'помилка',busy:'зайнято — повторіть пізніше',skipped:'не перевірено — спершу перевірте імпорт попереднього прайсу'};
function workflowRefreshLabel(status){return WORKFLOW_REFRESH_LABELS[status]||status;}
async function workflowRefreshSources(scheduled=false){let applied=0,review=0,failed=0,stop=false;const rows=[];for(const s of [...S.cfg.suppliers]){const source=s.source;if(s.disabled||!source?.url||scheduled&&(!source.enabled||Date.now()-(+source.lastAttempt||0)<Math.max(1,+source.hours||24)*3600000))continue;
 if(stop||!workflowCanFetch()){rows.push({sid:s.id,name:s.name,status:stop?'skipped':'busy'});stop=true;continue;}
 try{const result=await workflowFetchSource(s.id,{scheduled});rows.push({sid:s.id,name:s.name,status:result.status,via:s.source?.lastVia||null});if(result.status==='applied')applied++;else if(result.status==='review'){review++;stop=true;}}catch(error){failed++;rows.push({sid:s.id,name:s.name,status:'error',reason:error.message||String(error)});if(!scheduled)workflowToast(s.name+': '+(error.message||error));}
 }WORKFLOW.lastRefresh={at:Date.now(),rows};if(!scheduled)toast(`Обновлено: ${applied}. Нужна проверка: ${review}. Ошибок: ${failed}.`);if(failed&&WORKFLOW.active)WORKFLOW.active.error='Не удалось обновить '+failed+' источников. Причины указаны в разделе «Проблемы».';return {applied,review,failed};}
function workflowRefreshPanel(){const last=WORKFLOW.lastRefresh;if(!last?.rows?.length)return '';return `<div class="panel" data-refresh-result><h2>Оновлення прайсів за посиланнями · ${esc(fmtDate(last.at))}</h2>${last.rows.map(r=>`<div class="row workflow-supplier-row"><b>${esc(r.name)}</b><span class="spacer"></span><span class="${r.status==='error'?'finance-bad':r.status==='applied'?'':'small'}">${esc(workflowRefreshLabel(r.status))}${r.status==='applied'&&r.via==='site'?' (через сайт)':''}${r.reason?': '+esc(r.reason):''}</span></div>`).join('')}</div>`;}
function workflowSchedulerStart(){if(WORKFLOW.timer)return;WORKFLOW.timer=setInterval(async()=>{if(WORKFLOW.active||!workflowCanFetch())return;const due=S.cfg.suppliers.some(s=>!s.disabled&&s.source?.enabled&&s.source?.url&&Date.now()-(+s.source.lastAttempt||0)>=Math.max(1,+s.source.hours||24)*3600000);if(!due)return;const ctx=workflowActionStart('wfRefreshSources',{textContent:'Автоматическое обновление прайсов'});try{await workflowRefreshSources(true);}catch(error){workflowActionError(ctx,error);}finally{workflowActionFinish(ctx);}},60000);}
const workflowStartup=v10Startup;v10Startup=async function(){await workflowStartup();workflowSchedulerStart();};
async function workflowAction(action,t){
 if(action==='wfDismiss'){WORKFLOW.last=null;workflowRenderStatus();return;}
 if(action==='wfRetrySave'){const ok=S.edit?await saveProduct():await persist();if(!ok)throw Error('Повторное сохранение не удалось. Проверьте место в браузере или конфликт версии.');toast('Правки сохранены');return;}
 if(action==='wfFilter'){S.ui.workflowKind=$('#workflow-kind')?.value||'';S.ui.workflowQuery=$('#workflow-query')?.value||'';S.ui.workflowPage=0;render();return;}
 if(action==='wfProblemPage'){S.ui.workflowPage=Math.max(0,(+S.ui.workflowPage||0)+(+t.dataset.d||0));render();return;}
 if(action==='wfSaveAutomation'){S.cfg.contentEngineAutoDraft=!!$('#workflow-auto-draft').checked;S.cfg.contentAutoApply=!!$('#workflow-auto-content').checked;S.cfgDirty=true;bumpData();await persist();toast('Автоматизация описаний сохранена');return;}
 if(action==='wfSaveSource'){const sid=t.dataset.sid,s=S.cfg.suppliers.find(s=>s.id===sid);if(!s)throw Error('Поставщик не найден.');const panel=$(`[data-source-panel="${CSS.escape(sid)}"]`),url=panel.querySelector('[data-source-url]').value.trim(),hours=Number(panel.querySelector('[data-source-hours]').value),enabled=panel.querySelector('[data-source-enabled]').checked,autoApply=panel.querySelector('[data-source-apply]').checked;
  if(url)workflowSourceURL(url);if(enabled&&!url)throw Error('Для автопроверки нужна ссылка на прайс.');if(!Number.isInteger(hours)||hours<1||hours>168)throw Error('Интервал должен быть от 1 до 168 часов.');const ignoreHeader=panel.querySelector('[data-source-ignore-header]')?.checked===true;const old=s.source||{},changed=old.url!==url;if(autoApply&&(!old.profile||changed))throw Error('Сначала скачайте и примените первый прайс для подтверждения колонок.');s.source={...old,url,hours,enabled,autoApply};if(ignoreHeader)s.source_time_ignore_header=true;else delete s.source_time_ignore_header;delete s.sizes_from_description;if(changed){delete s.source.profile;delete s.source.lastAttempt;delete s.source.lastError;delete s.source.lastChecked;delete s.source.lastApplied;}S.cfgDirty=true;bumpData();if(await persist()){toast('Источник прайса сохранён');render();}return;
 }
 if(action==='wfFetchSource'){await workflowFetchSource(t.dataset.sid);return;}
 if(action==='wfRefreshSources'){await workflowRefreshSources(false);return;}
 throw Error('Действие не найдено. Обновите страницу и повторите.');
}
// Stage 5.2 (owner 2026-10-17): the data time of a supplier file. Without a per-offer supplier time the data is as old
// as the file itself — the generation date inside it (YML yml_catalog@date, XLSX document properties), else the file's
// modification time (File.lastModified / HTTP Last-Modified) — never the moment of the PIM import. A date without a
// time zone is Kyiv wall time (the suppliers are in Ukraine), whatever zone this computer is in. A date in the future
// (beyond 5 min) or before 2020 is not evidence and is skipped; nothing is clamped (clamping would manufacture freshness).
const SOURCE_TIME_MIN=Date.UTC(2020,0,1);
function sourceKyivTime(raw){
 if(raw==null||raw==='')return null;
 // A Date may come from another realm (a workbook parsed elsewhere): check the tag, not instanceof.
 if(Object.prototype.toString.call(raw)==='[object Date]')return Number.isFinite(raw.getTime())?raw.getTime():null;
 if(typeof raw==='number')return Number.isFinite(raw)?raw:null;
 const text=String(raw).trim();if(text.length>64)return null;const m=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?)?$/.exec(text);
 if(!m){const t=Date.parse(text);return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)&&Number.isFinite(t)?t:null;}
 const [y,mo,d,h=0,mi=0,se=0]=m.slice(1).map(x=>x==null?0:Number(x)),wall=[y,mo,d,h,mi,se].join(',');
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const seen=t=>{const p=Object.fromEntries(parts.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return [+p.year,+p.month,+p.day,+p.hour,+p.minute,+p.second].join(',');};
 // Kyiv is UTC+3 in summer, UTC+2 in winter; the repeated autumn hour takes the earlier (older) instant.
 const ok=[3,2].map(off=>Date.UTC(y,mo-1,d,h,mi,se)-off*3600000).filter(t=>seen(t)===wall);
 return ok.length?Math.min(...ok):null;
}
// Security review: a header that cannot be checked against any file time, and a server time equal to the moment of the
// download (a CDN or a feed generated on request), are kept but shown to the owner as unverified.
function sourceFileTime({header=null,mtime=null,mtimeSource='FILE',fetchedAt=null,now=Date.now(),payHours=72}={}){
 const valid=t=>t!=null&&t>=SOURCE_TIME_MIN&&t<=now+300000?t:null;
 const h=valid(sourceKyivTime(header)),f=valid(sourceKyivTime(mtime));
 const out={at:null,provenance:'NONE',header:h,mtime:f,warning:null};if(valid(sourceKyivTime(fetchedAt))!=null)out.fetched=valid(sourceKyivTime(fetchedAt));
 if(h!=null&&(f==null||h<=f+300000)){out.at=h;out.provenance='FILE_HEADER';if(f!=null&&f-h>payHours*3600000)out.warning='HEADER_OLDER_THAN_FILE';}
 else if(f!=null){out.at=f;out.provenance='FILE_MTIME';if(h!=null)out.warning='HEADER_AFTER_FILE';}
 if(header!=null&&header!==''&&h==null)out.warning=out.warning||'HEADER_DATE_INVALID';
 if(out.provenance==='FILE_HEADER'&&f==null)out.warning=out.warning||'FILE_TIME_UNVERIFIED';
 if(out.provenance==='FILE_MTIME'&&mtimeSource==='HTTP'&&fetchedAt!=null&&Math.abs(fetchedAt-f)<=300000)out.warning=out.warning||'SERVER_TIME_IS_DOWNLOAD_TIME';
 return out;
}
// Stage 5.4 (owner decision on M-WIN, 2026-10-17): a supplier whose generator never updates the date inside the file is
// set to ignore it (supplier.source_time_ignore_header, owner setting, off by default). Its data time is the moment the
// file was downloaded: the fetch moment for a fetched feed, the saved file's time for a file chosen on this computer.
// Nothing else changes: without a download time there is no data time (manager only), never the import moment.
// Review: a supplier generator that serves the same old file again must not make it look fresh — byte-identical rows
// (content hash) keep the data time of the last applied import of that file (warning FILE_UNCHANGED).
function sourceTimeForSupplier(t,supplier,contentHash=null){
 if(!t||supplier?.source_time_ignore_header!==true)return t;
 const last=supplier.source_time_last,same=contentHash!=null&&last?.hash===contentHash&&last.at!=null,at=same?last.at:t.fetched??t.mtime??null;
 return {at,provenance:at==null?'NONE':'FILE_MTIME',header:t.header,mtime:t.mtime,...(t.fetched!=null?{fetched:t.fetched}:{}),warning:same?'FILE_UNCHANGED':null,header_ignored:true,...(contentHash!=null?{content_hash:contentHash}:{})};
}
function sourceTimeContentHash(I){try{return I?.rows?fnvHash(JSON.stringify(I.rows)):null;}catch{return null;}}
// The supplier of a file chosen on the ИМПОРТ screen is known only when the import runs (and may be several in one
// file): each supplier's rows get that supplier's data time from the file's own times, kept unchanged in source_time_file.
const sourceTimeRunImport=runImport;
runImport=function(sup){const I=S.imp;if(I?.source_time){I.source_time_file=I.source_time_file||I.source_time;if(sup?.source_time_ignore_header===true&&I.source_time_hash==null)I.source_time_hash=sourceTimeContentHash(I);I.source_time=sourceTimeForSupplier(I.source_time_file,sup,I.source_time_hash);(I.source_time_suppliers||(I.source_time_suppliers={}))[sup.id]=I.source_time;}return sourceTimeRunImport.apply(this,arguments);};
// The applied import remembers the file (hash) and its data time per supplier that ignores the header.
const sourceTimeApplyImport=applyImport;
applyImport=async function(){const I=S.imp,times=I?.source_time_suppliers?{...I.source_time_suppliers}:null,ok=await sourceTimeApplyImport.apply(this,arguments);
 let remembered=false;if(ok&&times)for(const [id,t] of Object.entries(times)){const s=S.cfg.suppliers.find(x=>x.id===id);if(s?.source_time_ignore_header===true&&t?.content_hash!=null&&t.at!=null){s.source_time_last={hash:t.content_hash,at:t.at};S.cfgDirty=true;remembered=true;}}
 if(remembered)await persist();return ok;};
const sourceTimeRemap=remap;
remap=function(){const out=sourceTimeRemap.apply(this,arguments),I=S.imp;if(I?.source_time){I.source_time_file=I.source_time_file||I.source_time;const sup=S.cfg.suppliers.find(s=>s.id===I.sup);if(sup?.source_time_ignore_header===true&&I.source_time_hash==null)I.source_time_hash=sourceTimeContentHash(I);I.source_time=sourceTimeForSupplier(I.source_time_file,sup,I.source_time_hash);}return out;};
function sourceFileTimeNote(t){
 if(!t)return '';const day=x=>x==null?'—':new Date(x).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'});
 if(t.header_ignored&&t.warning==='FILE_UNCHANGED')return 'Файл не змінився з минулого скачування: час даних залишається '+day(t.at)+' (дата всередині файлу ігнорується за рішенням власника).';
 if(t.header_ignored)return t.at==null?'Дата всередині файлу ігнорується за рішенням власника; дати скачування файлу немає — на сайті оплата лише після підтвердження менеджера.':'Дані файлу станом на '+day(t.at)+' (дата скачування файлу): дата всередині файлу ігнорується за рішенням власника.';
 if(t.provenance==='NONE')return 'Дата даних файлу невідома — на сайті оплата лише після підтвердження менеджера.';
 const base='Дані файлу станом на '+day(t.at)+(t.provenance==='FILE_HEADER'?' (дата у файлі)':' (дата збереження файлу — це може бути і дата, коли файл завантажили)')+'.';
 if(t.warning==='HEADER_OLDER_THAN_FILE')return base+' Увага: дата у файлі '+day(t.header)+', а файл збережено '+day(t.mtime)+' — постачальник міг не оновити дату або дані застарілі.';
 if(t.warning==='HEADER_AFTER_FILE')return base+' Дата у файлі пізніша за дату збереження — взято дату збереження.';
 if(t.warning==='FILE_TIME_UNVERIFIED')return base+' Дата у файлі не перевірена: дати збереження файлу немає.';
 if(t.warning==='SERVER_TIME_IS_DOWNLOAD_TIME')return base+' Сервер постачальника віддав час завантаження — дату даних не перевірено.';
 return base;
}
