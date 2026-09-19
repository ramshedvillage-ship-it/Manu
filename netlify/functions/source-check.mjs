// On-demand comparison of two public completed-result feeds. No hidden/future feed.
const FEEDS=[
 {name:'CasinoScores',url:'https://api-cs.casino.org/svc-evolution-game-events/api/crazytime?page=0&size=10&sort=data.settledAt,desc&duration=24&tableId=CrazyTime0000001'},
 {name:'SLOTyi',url:'https://slotyi.com/api/crazytime'}
];
let cached=null,inflight=null,lastAttempt=0;
async function checkFeed(feed){
 const start=Date.now();
 try{
  const response=await fetch(feed.url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const raw=await response.json();if(!Array.isArray(raw))throw new Error('Unsupported response');
  const rows=raw.filter(r=>r?.data?.status==='Resolved'&&r?.data?.table?.id==='CrazyTime0000001'&&typeof r.id==='string'&&Number.isFinite(Date.parse(r.data.settledAt))&&Date.parse(r.data.settledAt)<=Date.now()+2000).sort((a,b)=>Date.parse(b.data.settledAt)-Date.parse(a.data.settledAt));
  if(!rows.length)throw new Error('No supported completed rounds');
  const r=rows[0];return {...feed,ok:true,checkedAt:new Date().toISOString(),requestMilliseconds:Date.now()-start,
   latest:{id:r.id,startedAt:r.data.startedAt??null,settledAt:r.data.settledAt,outcome:r.data.result?.outcome?.wheelResult?.wheelSector??null}};
 }catch(error){return {...feed,ok:false,checkedAt:new Date().toISOString(),error:String(error.message).slice(0,180)}}
}
export default async function handler(request){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 if(inflight)await inflight;
 else if(!cached||Date.now()-lastAttempt>=60000){
  lastAttempt=Date.now();inflight=Promise.all(FEEDS.map(checkFeed)).then(feeds=>{cached={checkedAt:new Date().toISOString(),feeds,
   note:'Both endpoints are completed-result trackers. Matching IDs may indicate a shared upstream source; not independent verification. Timing differences do not identify the next outcome. No alternate data is inserted into forecasts.'};});
  try{await inflight}finally{inflight=null}
 }
 return Response.json({...cached,servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}
