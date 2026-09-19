// Netlify serverless adapter. All displayed rounds originate from CasinoScores.
// Warm-instance memory is only a best-effort cache, never persistent storage.
const SOURCE = 'https://api-cs.casino.org/svc-evolution-game-events/api/crazytime';
const TABLE = 'CrazyTime0000001';
const SEGMENTS = {'1':21,'2':13,'5':7,'10':4,CoinFlip:4,Pachinko:2,CashHunt:2,CrazyBonus:1};
let cache = { rows: [], checkedAt: null, successAt: null, error: null, rejected: 0 };
let pending = null;

function normalize(row, now) {
  const d = row?.data, o = d?.result?.outcome;
  const outcome = String(o?.wheelResult?.wheelSector);
  const ts = Date.parse(d?.settledAt);
  if (d?.table?.id !== TABLE || d?.status !== 'Resolved' || !Object.hasOwn(SEGMENTS,outcome)
      || typeof row?.id !== 'string' || !row.id || !Number.isFinite(ts) || ts > now+120000) return null;
  const number = n => typeof n === 'number' && Number.isFinite(n) ? n : null;
  return {
    id:row.id, startedAt:d.startedAt ?? null, settledAt:d.settledAt, timestamp:ts/1000, outcome,
    multiplier:number(o.maxMultiplier), topSlot:o.topSlot?.wheelSector ?? null,
    topMultiplier:number(o.topSlot?.multiplier), matched:o.isTopSlotMatchedToWheelResult === true,
    payout:number(row.totalAmount), currency:d.currency ?? null,
    winners:number(row.totalWinners), tableId:TABLE
  };
}
async function refresh() {
  cache.checkedAt = new Date().toISOString();
  try {
    const url = new URL(SOURCE);
    url.search = new URLSearchParams({page:'0',size:'500',sort:'data.settledAt,desc',duration:'24',tableId:TABLE});
    const response = await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(9000)});
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    const raw = await response.json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('Source returned no results');
    const now = Date.now();
    const normalized = raw.map(row=>normalize(row,now));
    const valid = normalized.filter(Boolean);
    if (!valid.length) throw new Error('No supported settled source rounds');
    const unique = new Map(valid.map(row=>[row.id,row]));
    const rows = [...unique.values()].filter(r=>r.timestamp >= now/1000-86400).sort((a,b)=>b.timestamp-a.timestamp);
    if (!rows.length) throw new Error('Source returned no recent history');
    cache = { rows, checkedAt:cache.checkedAt, successAt:new Date().toISOString(), error:null,
      rejected:normalized.length-valid.length };
  } catch (error) {
    cache.error = error?.name === 'TimeoutError' ? 'Source request timed out' : String(error?.message || 'Source request failed').slice(0,200);
  }
}
function snapshot() {
  const now = Date.now(), rows=cache.rows.filter(r=>r.timestamp >= now/1000-86400);
  const age = rows.length ? now/1000-rows[0].timestamp : null;
  const status = cache.error ? 'unavailable' : cache.successAt && age !== null && age <= 180
    && age >= -120 && now-Date.parse(cache.successAt)<=45000 ? 'connected' : 'delayed';
  const sample = rows.slice(0,100);
  const probabilities = Object.entries(SEGMENTS).map(([outcome,segments])=>{
    const count = sample.filter(r=>r.outcome===outcome).length;
    return {outcome,segments,count,base:segments/54,estimate:sample.length?(count+segments)/(sample.length+54):null};
  }).sort((a,b)=>(b.estimate??b.base)-(a.estimate??a.base));
  return {results:rows,serverTime:new Date(now).toISOString(),
    source:{name:'CasinoScores',url:SOURCE,tableId:TABLE,page:'https://www.casino.org/casinoscores/crazy-time/',
      pollSeconds:15,clientPollSeconds:15,mode:'netlify',status,checkedAt:cache.checkedAt,successAt:cache.successAt,
      latestAgeSeconds:age,error:cache.error,rejected:cache.rejected,
      historyDescription:'Netlify retrieves up to 500 recent source rounds per refresh. There is no persistent server-side history. Time filters apply to this retrieved sample, not necessarily a complete 24 hours.'},
    forecast:{sampleSize:sample.length,probabilities,available:sample.length>0&&status==='connected',validated:false,
      method:'(count in latest 100 source rounds + wheel segments) / (sample size + 54)'}};
}
export default async function handler(request) {
  if(request.method !== 'GET') return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
  if(pending) await pending;
  else if(!cache.checkedAt || Date.now()-Date.parse(cache.checkedAt)>=15000) {
    pending=refresh();
    try {await pending;} finally {pending=null;}
  }
  return Response.json(snapshot(),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
