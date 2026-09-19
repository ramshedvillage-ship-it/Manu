import { mkdir, cp, copyFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const site = new URL('site/', root);
await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
await cp(new URL('static/', root), new URL('static/', site), { recursive: true });
await copyFile(new URL('static/index.html', root), new URL('index.html', site));
console.log('Netlify publish directory ready:', fileURLToPath(site));
console.log('Real results: /api/results -> Netlify function results');

if(process.env.CRAZY_TIME_HLS_URL){
  const url=new URL(process.env.CRAZY_TIME_HLS_URL);
  if(url.protocol!=='https:')throw new Error('CRAZY_TIME_HLS_URL must use HTTPS');
  const config={url:url.href,label:'Provider-approved configured stream',sourcePage:'https://www.casino.org/casinoscores/crazy-time/'};
  await writeFile(new URL('static/stream-config.js',site),'export const streamConfig = '+JSON.stringify(config)+';\n');
  console.log('Configured the HTTPS provider stream for this build. URL not printed.');
}
