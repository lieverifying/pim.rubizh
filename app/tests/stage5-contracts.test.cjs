'use strict';
// Stage 5 (owner order 2026-10-16): PIM ↔ SITE contract attestations and reproducible build.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const app=path.join(__dirname,'..');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('PIMC-C1: the exact wire manifest attests the committed fixture byte for byte',()=>{
 const fixture=path.join(app,'contracts/fixtures/pim-site-wire-v3.exact.json');
 const manifest=JSON.parse(fs.readFileSync(fixture.replace(/\.json$/,'.manifest.json'),'utf8'));
 assert.equal(manifest.sha256,sha(fixture));
});

test('reproducible build: tools/build.cjs on a clean copy gives the committed rubizh_pim.html and lib/categories.js byte for byte',()=>{
 const os=require('node:os'),{spawnSync}=require('node:child_process');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pim-build-'));
 try{
  for(const dir of ['lib','categories','tools'])fs.cpSync(path.join(app,dir),path.join(tmp,dir),{recursive:true});
  fs.copyFileSync(path.join(app,'rubizh_pim.html'),path.join(tmp,'rubizh_pim.html'));
  const r=spawnSync(process.execPath,[path.join(tmp,'tools/build.cjs')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  for(const f of ['rubizh_pim.html','lib/categories.js'])assert.equal(sha(path.join(tmp,f)),sha(path.join(app,f)),f+' differs after a clean build');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
