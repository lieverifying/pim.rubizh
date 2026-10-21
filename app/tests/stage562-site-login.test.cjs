'use strict';
// Stage 5.6.2 (owner decision 21.10): one login for CRM and PIM. Production PIM never opens the old cloud login; it signs in
// through the site's Staff API with the CRM e-mail and password (credentials: include) and stores the API address and the
// PIM key it receives from /api/staff/pim/connection — the owner never types the key.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness,appRequire}=require('./isolated-harness.cjs');
const {Event}=appRequire('linkedom').parseHTML('<html></html>');
const KEY='pim-key-from-the-site-0123456789abcdef';

function staffSite(h,{role='OWNER',apiUrl='https://rubizh.shop/api'}={}){
 const calls=[];let signedIn=false;
 h.ctx.location.hostname='pim.rubizh.shop';h.ctx.location.protocol='https:';h.ctx.location.port='';
 h.ctx.fetch=async(url,opt={})=>{
  calls.push({url:String(url),method:opt.method||'GET',credentials:opt.credentials,csrf:opt.headers?.['X-CSRF-Token']||null});
  const json=(status,data)=>new Response(JSON.stringify(status<400?{ok:true,data,meta:{csrf:'csrf-1'}}:{ok:false,error:data,meta:{csrf:'csrf-1'}}),{status,headers:{'Content-Type':'application/json'}});
  const path=String(url).replace('https://rubizh.shop/api/staff','');
  if(path==='/auth/session')return json(200,{authenticated:signedIn,user:signedIn?{role}:null,totp_required:false});
  if(path==='/auth/login'){const b=JSON.parse(opt.body);if(b.email==='owner@example.com'&&b.password==='correct horse battery'){signedIn=true;return json(200,{ok:true});}return json(401,{code:'LOGIN_FAILED',message:'Перевірте email і пароль.'});}
  if(path==='/pim/connection')return !signedIn?json(401,{code:'AUTH_REQUIRED',message:'Увійдіть.'}):role!=='OWNER'?json(403,{code:'PERMISSION_DENIED',message:'Недостатньо прав для цієї дії.'}):json(200,{api_url:apiUrl,pim_key:KEY});
  throw Error('unexpected '+url);
 };
 return calls;
}
const tick=()=>new Promise(r=>setTimeout(r,0));
async function form(h){for(let i=0;i<50&&!h.document.querySelector('#pimLogin');i++)await tick();return h.document.querySelector('#pimLogin');}
async function submit(h,email,password){
 const box=await form(h);assert.ok(box,'PIM shows its own sign-in form');
 box.querySelector('#pimLoginEmail').value=email;box.querySelector('#pimLoginPassword').value=password;
 box.querySelector('form').dispatchEvent(new Event('submit'));for(let i=0;i<20;i++)await tick();
 return box;
}
const signIn=h=>h.ctx.fetch('https://rubizh.shop/api/staff/auth/login',{method:'POST',body:JSON.stringify({email:'owner@example.com',password:'correct horse battery'})});

test('5.6.2 production PIM signs in with the CRM e-mail and password and stores the site address and key by itself',async()=>{
 const h=createHarness({runtime:true,production:true});const calls=staffSite(h);
 h.run('localStorage.setItem("rubizh_sb",JSON.stringify({url:"https://old-cloud.invalid",anonKey:"old"}))');
 const signing=h.run('sbBeforeLoad()');
 const box=await submit(h,'owner@example.com','wrong password');
 assert.match(box.querySelector('#pimLoginError').textContent,/Перевірте email і пароль/);assert.ok(h.document.querySelector('#pimLogin'),'stays open after a wrong password');
 await submit(h,'owner@example.com','correct horse battery');
 assert.equal(await signing,true);assert.equal(h.document.querySelector('#pimLogin'),null,'form closed after sign-in');
 assert.ok(calls.every(c=>c.url.startsWith('https://rubizh.shop/api/staff/')&&c.credentials==='include'),'the same-site Staff API with the session cookie');
 assert.ok(calls.filter(c=>c.url.endsWith('/auth/login')).every(c=>c.csrf==='csrf-1'),'CSRF token from the session');
 assert.ok(!calls.some(c=>c.url.includes('old-cloud')),'the old cloud login is never used');assert.equal(h.run('sbCfg()'),null);
 // After the store is ready the connection replaces the stored one and is saved; nothing to type.
 await h.run('Store.init()');await h.run('load()');
 assert.equal(h.run('PRODUCTION_MIGRATION.state'),'ready');
 assert.deepEqual(JSON.parse(h.run('JSON.stringify({url:siteCfg().url,key:siteCfg().key})')),{url:'https://rubizh.shop/api',key:KEY});
 const stored=(await h.run('productionCapture()')).find(r=>r.key==='meta/config').data.siteApi;assert.equal(stored.key,KEY,'saved in the PIM store');
});

test('5.6.2 an already signed-in owner opens PIM without the form; a non-owner account is asked to sign in as the owner',async()=>{
 const h=createHarness({runtime:true,production:true});staffSite(h);await signIn(h);
 assert.equal(await h.run('sbBeforeLoad()'),true);assert.equal(h.document.querySelector('#pimLogin'),null);assert.equal(h.run('PRODUCTION_SITE.connection.key'),KEY);
 const m=createHarness({runtime:true,production:true});staffSite(m,{role:'MANAGER'});await signIn(m);
 m.run('sbBeforeLoad()');const box=await form(m);
 assert.match(box.textContent,/власник/,'a manager gets no PIM key');assert.equal(m.run('PRODUCTION_SITE.connection'),null);
 // Review 5.6.2: an API address on another origin is refused — the key is never sent elsewhere.
 const x=createHarness({runtime:true,production:true});staffSite(x,{apiUrl:'https://evil.example/api'});await signIn(x);
 await assert.rejects(x.run('sbBeforeLoad()'),/неправильне підключення/);assert.equal(x.run('PRODUCTION_SITE.connection'),null);
});
