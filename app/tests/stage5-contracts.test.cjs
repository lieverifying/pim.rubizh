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
