// Real resolved rounds only. Short shared cache; no artificial 15-second display hold.
const SOURCE = 'https://api-cs.casino.org/svc-evolution-game-events/api/crazytime';
const TABLE = 'CrazyTime0000001';
const SEGMENTS = {'1':21,'2':13,'5':7,'10':4,CoinFlip:4,Pachinko:2,CashHunt:2,CrazyBonus:1};
const POLL_SECONDS=3, CACHE_MS=1000;
let cache = { rows: [], checkedAt:null, successAt:null, error:null, rejected:0, requestMs:null };
let pending=null,backoffUntil=0;
function normalize(row,now){
 const d=row?.data,o=d?.result?.outcome,outcome=String(o?.wheelResult?.wheelSector),ts=Date.parse(d?.settledAt);
 if(d?.table?.id!==TABLE||d?.status!=='Resolved'||!Object.hasOwn(SEGMENTS,outcome)||typeof row?.id!=='string'||!row.id||!Number.isFinite(ts)||ts>now+120000)return null;
 const number=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
 return {id:row.id,startedAt:d.startedAt??null,settledAt:d.settledAt,timestamp:ts/1000,outcome,
  multiplier:number(o.maxMultiplier),topSlot:o.topSlot?.wheelSector??null,topMultiplier:number(o.topSlot?.multiplier),matched:o.isTopSlotMatchedToWheelResult===true,
  payout:number(row.totalAmount),currency:d.currency??null,winners:number(row.totalWinners),tableId:TABLE};
}
async function refresh(){
 const began=Date.now();cache.checkedAt=new Date(began).toISOString();
 try{
  const url=new URL(SOURCE);
  // A cold instance loads real history. Warm refreshes request only recent rounds.
  const shortRefresh=cache.rows.length&&began-Date.parse(cache.successAt)<45000;
  url.search=new URLSearchParams({page:'0',size:shortRefresh?'10':'500',sort:'data.settledAt,desc',duration:'24',tableId:TABLE});
  const response=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(9000)});
  if(!response.ok){
   if(response.status===429||response.status===503){
    const header=response.headers.get('retry-after');
    const delay=header&&/^\d+$/.test(header.trim())?Number(header)*1000:header?Date.parse(header)-Date.now():30000;
    backoffUntil=Date.now()+Math.max(30000,Number.isFinite(delay)?delay:30000);
   }
   throw new Error(`Source HTTP ${response.status}`);
  }
  const raw=await response.json();if(!Array.isArray(raw)||!raw.length)throw new Error('Source returned no results');
  const now=Date.now(),normalized=raw.map(row=>normalize(row,now)),valid=normalized.filter(Boolean);
  if(!valid.length)throw new Error('No supported settled source rounds');
  const unique=new Map((shortRefresh?cache.rows:[]).map(row=>[row.id,row]));for(const row of valid)unique.set(row.id,row);
  const rows=[...unique.values()].filter(r=>r.timestamp>=now/1000-86400).sort((a,b)=>b.timestamp-a.timestamp).slice(0,500);
  if(!rows.length)throw new Error('Source returned no recent history');
  cache={rows,checkedAt:cache.checkedAt,successAt:new Date().toISOString(),error:null,rejected:normalized.length-valid.length,requestMs:Date.now()-began};backoffUntil=0;
 }catch(error){cache.error=error?.name==='TimeoutError'?'Source request timed out':String(error?.message||'Source request failed').slice(0,200);cache.requestMs=Date.now()-began;}
}
function snapshot(){
 const now=Date.now(),rows=cache.rows.filter(r=>r.timestamp>=now/1000-86400),age=rows.length?now/1000-rows[0].timestamp:null;
 const status=cache.error?'unavailable':cache.successAt&&age!==null&&age<=180&&age>=-120&&now-Date.parse(cache.successAt)<=45000?'connected':'delayed';
 const sample=rows.slice(0,100);
 const probabilities=Object.entries(SEGMENTS).map(([outcome,segments])=>{const count=sample.filter(r=>r.outcome===outcome).length;return {outcome,segments,count,base:segments/54,estimate:sample.length?(count+segments)/(sample.length+54):null};}).sort((a,b)=>(b.estimate??b.base)-(a.estimate??a.base));
 return {results:rows,serverTime:new Date(now).toISOString(),source:{name:'CasinoScores',url:SOURCE,tableId:TABLE,page:'https://www.casino.org/casinoscores/crazy-time/',
  pollSeconds:POLL_SECONDS,clientPollSeconds:Math.max(POLL_SECONDS,Math.ceil((backoffUntil-now)/1000)),cacheSeconds:CACHE_MS/1000,mode:'netlify',status,
  checkedAt:cache.checkedAt,successAt:cache.successAt,latestAgeSeconds:age,error:cache.error,rejected:cache.rejected,requestMilliseconds:cache.requestMs,
  retryAt:backoffUntil>now?new Date(backoffUntil).toISOString():null,
  historyDescription:'Netlify loads up to 500 source rounds on a cold start, then checks the latest 10 rounds on warm refreshes, retaining at most 500 in memory. Checks target 3-second cadence; a 1-second shared cache and provider/network delays still apply. No persistent server-side history or zero-latency guarantee.'},
  forecast:{sampleSize:sample.length,probabilities,available:sample.length>0&&status==='connected',validated:false,method:'(count in latest 100 source rounds + wheel segments) / (sample size + 54)'}};
}
export default async function handler(request){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 if(pending)await pending;
 else if(Date.now()>=backoffUntil&&(!cache.checkedAt||Date.now()-Date.parse(cache.checkedAt)>=CACHE_MS)){
  pending=refresh();try{await pending;}finally{pending=null;}
 }
 return Response.json(snapshot(),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
