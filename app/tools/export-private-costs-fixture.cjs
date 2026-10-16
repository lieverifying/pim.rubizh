// Runs the PIM private payout exporter (pimSitePrivateCosts) on the same synthetic catalog as the exact wire fixture.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {build}=require('./export-wire-fixture.cjs');
const out=process.argv[2]||path.join(__dirname,'../contracts/fixtures/pim-site-private-costs-v1.exact.json');
const h=build(),costs=JSON.parse(JSON.stringify(h.run('pimSitePrivateCosts()')));
fs.writeFileSync(out,JSON.stringify(costs,null,2)+'\n');console.log(out);
