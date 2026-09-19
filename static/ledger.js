// Prospective, browser-local validation. Never backfills predictions from history.
export const MODEL = 'historical-prior54-v1';
export const SEGMENTS = {'1':21,'2':13,'5':7,'10':4,CoinFlip:4,Pachinko:2,CashHunt:2,CrazyBonus:1};
export const BASELINE = ['1','2','5','10'];
export const POLICY_NAMES = {coverage:'Highest estimated coverage',balanced:'2 numbers + 2 bonuses'};
export const isBonus = outcome => !BASELINE.includes(outcome);
const timeOf = value => typeof value==='string' ? Date.parse(value) : NaN;
const newId = () => globalThis.crypto.randomUUID();
export function selectOutcomes(probabilities,policy='coverage') {
  const sorted=[...probabilities].sort((a,b)=>b.estimate-a.estimate || Object.keys(SEGMENTS).indexOf(a.outcome)-Object.keys(SEGMENTS).indexOf(b.outcome));
  return (policy==='balanced' ? [...sorted.filter(p=>!isBonus(p.outcome)).slice(0,2),...sorted.filter(p=>isBonus(p.outcome)).slice(0,2)] : sorted.slice(0,4)).map(p=>p.outcome);
}
export class ForecastLedger {
  constructor(saved=null) {
    this.entries=[];this.pending=null;this.active=false;this.policy='coverage';this.lastTick=null;this.lastSeenId=null;
    if(saved?.version===1 && Array.isArray(saved.entries)) {
      this.entries=saved.entries.filter(e=>e && ['HIT','MISS','UNSCORED'].includes(e.status) && typeof e.id==='string').slice(-1000);
      if(Object.hasOwn(POLICY_NAMES,saved.policy))this.policy=saved.policy;
      if(saved.pending?.id) {this.pending=saved.pending;this.cancel('Page reloaded; continuous observation was not verified.');}
    }
  }
  export() {return {version:1,model:MODEL,scope:'Browser-local, editable, not independently audited. Last 1000 entries only.',policy:this.policy,entries:this.entries,pending:this.pending};}
  add(entry) {
    if(this.entries.some(e=>e.id===entry.id || (entry.actual?.id && e.actual?.id===entry.actual.id)))return;
    this.entries.push(entry);this.entries=this.entries.slice(-1000);
  }
  cancel(reason) {
    if(this.pending) {
      this.add({...this.pending,id:this.pending.id+':unscored',status:'UNSCORED',actual:null,reason});
      this.pending=null;
    }
    this.lastTick=null;this.lastSeenId=null;
  }
  stop(reason='Tracking stopped before a result could be scored.') {this.cancel(reason);this.active=false;}
  lock(payload, now) {
    const probabilities=payload.forecast?.probabilities;
    if(!Array.isArray(probabilities) || probabilities.length!==8 || probabilities.some(p=>!Object.hasOwn(SEGMENTS,p.outcome)||!Number.isFinite(p.estimate)))return;
    const copy=probabilities.map(p=>({...p}));
    this.pending={id:newId(),model:MODEL,policy:this.policy,lockedAt:new Date(now).toISOString(),
      trainingThroughId:payload.results[0].id,cursorId:payload.results[0].id,sampleSize:payload.forecast.sampleSize,
      selected:selectOutcomes(copy,this.policy),probabilities:copy};
  }
  advance(payload, now) {
    if(!this.active)return;
    if(payload.source?.status!=='connected'||!payload.forecast?.available||!payload.results?.length||!Number.isFinite(now)) {
      this.cancel('Feed unavailable or delayed; no win or loss assigned.');return;
    }
    if(this.lastTick!==null && (now-this.lastTick>45000 || now<this.lastTick-2000))this.cancel('Observation gap or clock discontinuity; continuity not verified.');
    this.lastTick=now;
    const rows=[...payload.results].sort((a,b)=>b.timestamp-a.timestamp);
    if(this.pending) {
      const position=rows.findIndex(r=>r.id===this.pending.cursorId);
      if(position<0) {this.cancel('Previously observed round is absent from the retrieved window.');}
      else {
        const incoming=rows.slice(0,position).reverse();
        for(const row of incoming) {
          const actual={id:row.id,outcome:row.outcome,startedAt:row.startedAt??null,settledAt:row.settledAt};
          if(!this.pending) {
            this.add({id:'uncovered:'+row.id,status:'UNSCORED',actual,selected:[],probabilities:[],lockedAt:null,
              reason:'No forecast was locked before this additional retrieved round.'});continue;
          }
          const p=this.pending, start=timeOf(row.startedAt), finish=timeOf(row.settledAt), locked=timeOf(p.lockedAt);
          if(!Number.isFinite(start)||!Number.isFinite(finish)||finish<start||finish>now+2000||!Object.hasOwn(SEGMENTS,row.outcome)) {
            this.add({...p,id:p.id+':'+row.id,status:'UNSCORED',actual,reason:'Missing or invalid source start/settlement evidence.'});this.pending=null;continue;
          }
          if(start<=locked+2000) {
            this.add({...p,id:p.id+':'+row.id,status:'UNSCORED',actual,reason:'Round began before forecast lock plus the 2-second safety margin.'});
            this.pending.cursorId=row.id;continue;
          }
          // Only now can an actual result be compared to the immutable selected set.
          this.add({...p,id:p.id+':'+row.id,status:p.selected.includes(row.outcome)?'HIT':'MISS',actual,
            scoredAt:new Date(now).toISOString(),baselineHit:BASELINE.includes(row.outcome),reason:'Locked before source-reported round start; scored on the next observed eligible round.'});
          this.pending=null;
        }
      }
    }
    if(!this.pending)this.lock(payload,now);
    this.lastSeenId=rows[0].id;
  }
}
export function summarize(entries) {
  const scored=entries.filter(e=>e.status==='HIT'||e.status==='MISS'),hits=scored.filter(e=>e.status==='HIT').length;
  const bonus=scored.filter(e=>isBonus(e.actual.outcome)),numbers=scored.filter(e=>!isBonus(e.actual.outcome));
  return {n:scored.length,hits,misses:scored.length-hits,unscored:entries.filter(e=>e.status==='UNSCORED').length,
    rate:scored.length?hits/scored.length:null,bonusN:bonus.length,bonusHits:bonus.filter(e=>e.status==='HIT').length,
    numberN:numbers.length,numberHits:numbers.filter(e=>e.status==='HIT').length,
    baselineHits:scored.filter(e=>e.baselineHit).length,
    expectedCoverage:scored.length?scored.reduce((s,e)=>s+e.selected.reduce((t,o)=>t+SEGMENTS[o]/54,0),0)/scored.length:null};
}
