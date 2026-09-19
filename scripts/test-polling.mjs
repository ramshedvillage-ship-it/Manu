// Transport-only regression check. Actual history is fetched once; no synthetic spins.
// A simulated HTTP 429 verifies backoff without deliberately rate-limiting the provider.
import assert from 'node:assert/strict';
import handler from '../netlify/functions/results.mjs';
const realFetch=globalThis.fetch,realNow=Date.now;
let sizes=[];
try{
 globalThis.fetch=(url,options)=>{sizes.push(new URL(url).searchParams.get('size'));return realFetch(url,options);};
 const request=()=>new Request('http://test/api/results');
 const first=await (await handler(request())).json();
 assert(first.results.length>0,'Real source history required; no data fallback');
 assert.equal(first.source.clientPollSeconds,3);assert.equal(first.source.cacheSeconds,1);assert.equal(sizes[0],'500');
 const base=realNow();Date.now=()=>base+2000;
 const warm=await (await handler(request())).json();assert.equal(sizes[1],'10');assert(warm.results.length>10);assert.equal(new Set(warm.results.map(r=>r.id)).size,warm.results.length);
 let deniedCalls=0;globalThis.fetch=async()=>{deniedCalls++;return new Response('',{status:429,headers:{'Retry-After':'90'}});};
 Date.now=()=>base+4000;
 const limited=await (await handler(request())).json();assert.equal(limited.source.status,'unavailable');assert.equal(limited.forecast.available,false);assert.equal(limited.source.clientPollSeconds,90);
 assert.deepEqual(limited.results,warm.results,'Backoff must retain only actual previously retrieved records');
 Date.now=()=>base+7000;
 const waiting=await (await handler(request())).json();assert.equal(deniedCalls,1,'No upstream call before Retry-After');assert.equal(waiting.source.clientPollSeconds,87);
 console.log('PASS: 3s cadence metadata, 1s cache, cold 500/warm 10 requests, deduplication, real-history retention, and Retry-After backoff. The HTTP 429 is a transport-only test, not result data.');
}finally{globalThis.fetch=realFetch;Date.now=realNow;}
