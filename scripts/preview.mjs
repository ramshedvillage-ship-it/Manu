// Local check of the built static site and serverless handler; not a Netlify deploy.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import handler from '../netlify/functions/results.mjs';
import checkSources from '../netlify/functions/source-check.mjs';
const root=path.resolve(fileURLToPath(new URL('../site/',import.meta.url))); 
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.mjs':'text/javascript'};
const port=Number(process.env.PORT||3001);
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://preview.invalid');
    if(url.pathname==='/api/results'||url.pathname==='/.netlify/functions/results'||url.pathname==='/api/source-check'||url.pathname==='/.netlify/functions/source-check') {
      const response=await (url.pathname.endsWith('source-check')?checkSources:handler)(new Request(url,{method:req.method}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const filename=path.resolve(root,'.'+pathname);
    if(!filename.startsWith(root+path.sep) && filename!==path.join(root,'index.html')){res.writeHead(403);res.end('Forbidden');return;}
    const data=await readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log(`Netlify-compatible local preview listening on 0.0.0.0:${port}`));
