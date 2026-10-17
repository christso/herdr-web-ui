import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const repo='/home/christso/projects/christso/herdr-web-ui__worktrees/codex-short-reply-footer';
await import(repo+'/scripts/test-herdr.ts');
const {createServer}=await import(repo+'/server/index.ts');
const {checkSplitView}=await import(repo+'/scripts/split-view-regression.ts');
const {chromium}=await import(repo+'/node_modules/playwright-core/index.mjs');
const root=mkdtempSync(join(tmpdir(),'codex-split-review-'));
const app=createServer({port:0,hostname:'127.0.0.1',token:'',stateDir:root});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--accept-lang=en-US']});
try {
 await app.statusReady;
 await checkSplitView(browser,'http://127.0.0.1:'+app.port);
 console.log('PASS unchanged split-view regression on PR1248 head c5accd5');
} finally {await browser.close();app.stop();rmSync(root,{recursive:true,force:true});}

