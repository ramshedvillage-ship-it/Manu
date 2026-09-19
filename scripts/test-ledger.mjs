// Regression tests replay actual source records using a test clock.
// These assertions test accounting, NOT prospective accuracy. They never write to the app ledger.
import assert from 'node:assert/strict';
import {ForecastLedger,SEGMENTS,selectOutcomes,summarize} from '../static/ledger.js';
import handler from '../netlify/functions/results.mjs';
const source=await (await handler(new Request('http://test/api/results'))).json();
assert(source.results.length>10,'A real source history is required; no synthetic fallback is used.');
const rows=source.results;
function payload(history) {
 const sample=history.slice(0,100);
 const probabilities=Object.entries(SEGMENTS).map(([outcome,segments])=>({outcome,segments,base:segments/54,count:sample.filter(r=>r.outcome===outcome).length,estimate:(sample.filter(r=>r.outcome===outcome).length+segments)/(sample.length+54)}));
 return {source:{status:'connected'},results:history,forecast:{available:true,sampleSize:sample.length,probabilities}};
}
const opportunities=[];
for(let i=0;i<rows.length-20;i++) {
 const actual=rows[i],history=rows.slice(i+1),lock=Date.parse(history[0].settledAt)+500;
 if(Date.parse(actual.startedAt)>lock+2000 && Date.parse(actual.settledAt)-lock<150000)opportunities.push({actual,history,lock});
}
assert(opportunities.length,'No suitable real source sequence available for this test run.');
function start(c,policy='coverage',lock=c.lock){const l=new ForecastLedger();l.active=true;l.policy=policy;l.advance(payload(c.history),lock);return l;}
function observe(l,c,lock=c.lock,record=c.actual){let t=lock;const end=Date.parse(c.actual.settledAt)+500;while(t+15000<end){t+=15000;l.advance(payload(c.history),t);}l.advance(payload([record,...c.history]),end);}
for(const verdict of ['HIT','MISS']) {
 const c=opportunities.find(c=>selectOutcomes(payload(c.history).forecast.probabilities).includes(c.actual.outcome)===(verdict==='HIT'));
 assert(c,`Need a real record to exercise ${verdict}`);
 const l=start(c),frozen=structuredClone(l.pending);assert.equal(l.entries.length,0,'Initial history must not be scored');
 l.policy='balanced';observe(l,c);assert.equal(l.entries[0].status,verdict);assert.deepEqual(l.entries[0].selected,frozen.selected);assert.equal(l.entries[0].lockedAt,frozen.lockedAt);
 assert(Date.parse(l.entries[0].lockedAt)+2000<Date.parse(l.entries[0].actual.startedAt));
 const n=summarize(l.entries).n;l.advance(payload([c.actual,...c.history]),Date.parse(c.actual.settledAt)+1000);assert.equal(summarize(l.entries).n,n,'Same round cannot be counted twice');
}
const bonusMiss=opportunities.find(c=>!['1','2','5','10'].includes(c.actual.outcome)&&!selectOutcomes(payload(c.history).forecast.probabilities).includes(c.actual.outcome));
assert(bonusMiss,'Need an actual uncovered bonus');const lbonus=start(bonusMiss);observe(lbonus,bonusMiss);assert.equal(lbonus.entries[0].status,'MISS');assert.equal(summarize(lbonus.entries).bonusN,1);
const c=opportunities[0];
const inProgress=Date.parse(c.actual.startedAt)+500,lstart=start(c,'coverage',inProgress);observe(lstart,c,inProgress);assert.equal(summarize(lstart.entries).n,0);assert.equal(lstart.entries[0].status,'UNSCORED');
const lmissing=start(c);observe(lmissing,c,c.lock,{...c.actual,startedAt:null});assert.equal(summarize(lmissing.entries).n,0);
const lgap=start(c);lgap.advance(payload(c.history),c.lock+50000);assert.equal(lgap.entries[0].status,'UNSCORED');assert.equal(summarize(lgap.entries).n,0);
const loff=start(c);loff.advance({...payload(c.history),source:{status:'unavailable'}},c.lock+15000);assert.equal(loff.entries[0].status,'UNSCORED');assert.equal(loff.pending,null);
const lrestored=new ForecastLedger(start(c).export());assert.equal(lrestored.active,false);assert.equal(lrestored.pending,null);assert.equal(lrestored.entries[0].status,'UNSCORED');
const selections=selectOutcomes(payload(c.history).forecast.probabilities,'balanced');assert.equal(selections.filter(o=>!['1','2','5','10'].includes(o)).length,2);
console.log('PASS: real-record accounting tests — HIT, MISS, bonus MISS, frozen picks, no duplicate scoring, no historical backfill, start-time guard, missing evidence, observation gap, outage, reload, bonus allocation.');
console.log('This test-clock replay is NOT a live validation result or an accuracy claim.');
