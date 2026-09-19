"""CrazyScope: source-only Crazy Time results. No simulated data paths."""
import json, math, os, sqlite3, threading, time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import requests
from flask import Flask, jsonify, send_from_directory

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, 'data', 'results.sqlite3')
SOURCE = 'https://api-cs.casino.org/svc-evolution-game-events/api/crazytime'
TABLE = 'CrazyTime0000001'
POLL_SECONDS = 3
SEGMENTS = {'1':21, '2':13, '5':7, '10':4, 'CoinFlip':4, 'Pachinko':2, 'CashHunt':2, 'CrazyBonus':1}
app = Flask(__name__, static_folder='static')
lock = threading.Lock()
state = {'checkedAt':None, 'successAt':None, 'error':None, 'received':0, 'rejected':0, 'retryAt':None}
os.makedirs(os.path.dirname(DB), exist_ok=True)
with sqlite3.connect(DB) as db:
    db.execute('CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, ts REAL NOT NULL, body TEXT NOT NULL)')

def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace('+00:00','Z')

def normalize(row):
    d = row['data']; o = d['result']['outcome']; sector = str(o['wheelResult']['wheelSector'])
    if d['table']['id'] != TABLE or d['status'] != 'Resolved' or sector not in SEGMENTS:
        raise ValueError('Unsupported table, status or outcome')
    ts = datetime.fromisoformat(d['settledAt'].replace('Z','+00:00')).timestamp()
    if not math.isfinite(ts) or ts > time.time()+120: raise ValueError('Invalid source time')
    rid = row['id']
    if not isinstance(rid,str) or not rid: raise ValueError('Missing source ID')
    top = o.get('topSlot') or {}
    return {'id':rid, 'startedAt':d.get('startedAt'), 'settledAt':d['settledAt'], 'timestamp':ts, 'outcome':sector,
            'multiplier':o.get('maxMultiplier'), 'topSlot':top.get('wheelSector'),
            'topMultiplier':top.get('multiplier'), 'matched':o.get('isTopSlotMatchedToWheelResult',False),
            'payout':row.get('totalAmount'), 'currency':d.get('currency'), 'winners':row.get('totalWinners'), 'tableId':TABLE}

def collect():
    first = True
    while True:
        checked = time.time()
        retry_at = None
        try:
            r = requests.get(SOURCE, params={'page':0,'size':500 if first or not state['successAt'] or checked-state['successAt']>45 else 10,
                'sort':'data.settledAt,desc','duration':24,'tableId':TABLE}, timeout=12,
                headers={'Accept':'application/json','Cache-Control':'no-cache'})
            if r.status_code in (429,503):
                header=r.headers.get('Retry-After','30')
                try: delay=float(header) if header.isdigit() else parsedate_to_datetime(header).timestamp()-time.time()
                except (ValueError, TypeError, OverflowError): delay=30
                retry_at=time.time()+max(30,delay)
            r.raise_for_status()
            raw = r.json()
            if not isinstance(raw,list) or not raw: raise ValueError('Source returned no results')
            valid=[]; rejected=0
            for item in raw:
                try: valid.append(normalize(item))
                except (KeyError, ValueError, TypeError): rejected+=1
            if not valid: raise ValueError('No supported settled rounds in response')
            with sqlite3.connect(DB) as db:
                db.executemany('INSERT OR REPLACE INTO results VALUES (?,?,?)', [(x['id'],x['timestamp'],json.dumps(x)) for x in valid])
                db.execute('DELETE FROM results WHERE ts < ?', (time.time()-86400,))
            with lock: state.update(checkedAt=checked,successAt=time.time(),error=None,received=len(valid),rejected=rejected,retryAt=None)
            first=False
        except Exception as exc:
            with lock: state.update(checkedAt=checked,error=f'{type(exc).__name__}: {str(exc)[:200]}',retryAt=retry_at)
        time.sleep(max(0.25, (retry_at or checked+POLL_SECONDS)-time.time()))

@app.get('/')
def index(): return send_from_directory(app.static_folder,'index.html')

@app.get('/api/results')
def results():
    now=time.time()
    with sqlite3.connect(DB) as db:
        rows=[json.loads(x[0]) for x in db.execute('SELECT body FROM results WHERE ts >= ? ORDER BY ts DESC LIMIT 2500',(now-86400,))]
    with lock: meta=dict(state)
    age=now-rows[0]['timestamp'] if rows else None
    status='connecting'
    if meta['error']: status='unavailable'
    elif meta['successAt']:
        status='connected' if age is not None and -120 <= age <= 180 and now-meta['successAt']<=45 else 'delayed'
    sample=rows[:100]
    # Dirichlet-multinomial descriptive estimate: 54 pseudo-observations matching the wheel.
    probabilities=[]
    for name,n in SEGMENTS.items():
        count=sum(r['outcome']==name for r in sample)
        probabilities.append({'outcome':name,'segments':n,'base':n/54,'count':count,
                              'estimate':(count+n)/(len(sample)+54) if sample else None})
    probabilities.sort(key=lambda x:x['estimate'] or x['base'],reverse=True)
    return jsonify(results=rows,source={'name':'CasinoScores','url':SOURCE,'tableId':TABLE,
        'page':'https://www.casino.org/casinoscores/crazy-time/','pollSeconds':POLL_SECONDS,'clientPollSeconds':max(POLL_SECONDS,math.ceil((meta.get('retryAt') or now)-now)),'mode':'python','status':status,'retryAt':iso(meta['retryAt']) if meta.get('retryAt') else None,
        'checkedAt':iso(meta['checkedAt']) if meta['checkedAt'] else None,
        'successAt':iso(meta['successAt']) if meta['successAt'] else None,
        'latestAgeSeconds':age,'error':meta['error'],'rejected':meta['rejected']},
        serverTime=iso(now),forecast={'sampleSize':len(sample),'probabilities':probabilities,
        'available':bool(sample) and status=='connected','validated':False,
        'method':'(count in latest 100 source rounds + wheel segments) / (sample size + 54)'})

@app.get('/api/source-check')
def compare_public_sources():
    from concurrent.futures import ThreadPoolExecutor
    feeds=[('CasinoScores', SOURCE+'?page=0&size=10&sort=data.settledAt,desc&duration=24&tableId='+TABLE),
           ('SLOTyi','https://slotyi.com/api/crazytime')]
    def check(feed):
        name,url=feed; start=time.time()
        try:
            response=requests.get(url, timeout=8, headers={'Accept':'application/json'})
            response.raise_for_status()
            raw=response.json()
            rows=[]
            for row in raw:
                try: rows.append(normalize(row))
                except (KeyError,TypeError,ValueError): pass
            rows.sort(key=lambda r:r['timestamp'],reverse=True)
            if not rows: raise ValueError('No supported completed rounds')
            latest=rows[0]
            return {'name':name,'url':url,'ok':True,'checkedAt':iso(time.time()),
                'requestMilliseconds':round((time.time()-start)*1000),
                'latest':{k:latest[k] for k in ('id','startedAt','settledAt','outcome')}}
        except Exception as exc:
            return {'name':name,'url':url,'ok':False,'checkedAt':iso(time.time()),'error':str(exc)[:180]}
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(check,feeds))
    return jsonify(checkedAt=iso(time.time()),servedAt=iso(time.time()),feeds=results,
        note='Both endpoints show completed rounds. Matching IDs may mean a shared upstream source, not independent verification. Timing differences do not reveal a future result. No alternate data is inserted into forecasts.')

@app.after_request
def headers(response):
    if response.content_type.startswith('application/json'): response.headers['Cache-Control']='no-store'
    response.headers['X-Content-Type-Options']='nosniff'
    return response

if __name__ == '__main__':
    threading.Thread(target=collect,daemon=True).start()
    from waitress import serve
    serve(app, host='0.0.0.0', port=int(os.environ.get('PORT',3000)), threads=8)
