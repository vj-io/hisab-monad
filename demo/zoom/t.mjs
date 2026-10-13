import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
fs.mkdirSync('raw_t',{recursive:true});
let n=0, ts=[];
cdp.on('Page.screencastFrame', async (f)=>{ const i=n++; ts.push(f.metadata.timestamp); fs.writeFile(`raw_t/${i}.jpg`, Buffer.from(f.data,'base64'),()=>{}); await cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{}); });
await p.goto('https://hisab-monad.vercel.app',{waitUntil:'networkidle'});
await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:3840,maxHeight:2160,everyNthFrame:1});
for(let i=0;i<30;i++){ await p.mouse.move(100+i*40,300+i*10); await new Promise(r=>setTimeout(r,100)); }
await p.evaluate(()=>scrollTo({top:600,behavior:'smooth'}));
await new Promise(r=>setTimeout(r,2000));
await cdp.send('Page.stopScreencast');
console.log(n, ts.slice(0,5), (ts.at(-1)-ts[0]).toFixed(2));
const d=ts.map((t,i)=>i?t-ts[i-1]:0); console.log('max gap',Math.max(...d).toFixed(3),'avg',((ts.at(-1)-ts[0])/n).toFixed(3));
await b.close();
