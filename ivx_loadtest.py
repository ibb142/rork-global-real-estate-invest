#!/usr/bin/env python3
"""IVX Holdings — Production Load Test Suite (fixed for Python 3.13)"""
import asyncio, aiohttp, json, time, ssl, random
from collections import defaultdict
from datetime import datetime, timezone

API = "https://api.ivxholding.com"
SUPABASE_URL = "https://kvclcdjmjghndxsngfzb.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk"
OWNER_EMAIL = "iperez4242@gmail.com"
OWNER_PASSWORD = "X146corp@1x146corp$$1"
MAX_ERR = 0.05
LOG = "/tmp/ivx_lt.log"
OUT = "/tmp/ivx_lt_results.json"

def ts():
    return datetime.now(timezone.utc).strftime('%H:%M:%SZ')

def log(msg):
    line = f"[{ts()}] {msg}"
    print(line, flush=True)
    with open(LOG, 'a') as f:
        f.write(line + "\n"); f.flush()

def pct(sl, p):
    if not sl: return 0
    return sl[min(int(len(sl) * p / 100), len(sl) - 1)]

class Res:
    def __init__(self, name, users, dur):
        self.name = name; self.users = users; self.dur = dur
        self.lat = []; self.errors = 0; self.codes = defaultdict(int)
        self.total = 0; self.start = None; self.end = None
        self.aborted = False; self.reason = None; self.timeouts = 0

    @property
    def rps(self):
        e = (self.end - self.start) if self.end and self.start else 0
        return self.total / e if e > 0 else 0

    @property
    def err_rate(self):
        return self.errors / self.total if self.total > 0 else 0

    def summary(self):
        ls = sorted(self.lat)
        return {
            'level': self.name, 'users': self.users,
            'duration_s': round((self.end - self.start), 1) if self.end and self.start else 0,
            'total_requests': self.total, 'rps': round(self.rps, 1),
            'errors': self.errors, 'error_rate_pct': round(self.err_rate * 100, 2),
            'p50_ms': round(pct(ls, 50), 1), 'p95_ms': round(pct(ls, 95), 1),
            'p99_ms': round(pct(ls, 99), 1),
            'min_ms': round(ls[0], 1) if ls else 0, 'max_ms': round(ls[-1], 1) if ls else 0,
            'timeouts': self.timeouts, 'status_codes': dict(self.codes),
            'aborted': self.aborted, 'abort_reason': self.reason,
        }

async def check_health(session):
    try:
        s = time.time()
        async with session.get(f"{API}/health", timeout=aiohttp.ClientTimeout(total=10)) as r:
            d = await r.json()
            return d.get('status') == 'healthy', (time.time() - s) * 1000, d.get('status')
    except:
        return False, 0, 'exception'

async def get_token(session):
    async with session.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        timeout=aiohttp.ClientTimeout(total=15)) as r:
        return (await r.json()).get("access_token")

MIX = {
    'health': 10, 'version': 5, 'readiness': 5, 'login': 8, 'feed': 15,
    'rooms': 10, 'supabase_read': 10, 'chat_send': 8, 'protected': 10,
    'supabase_table': 10, 'diagnostics': 5, 'messages': 4,
}

async def worker(session, wid, token, stop, result):
    ah = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    sh = {"apikey": ANON_KEY}
    while not stop.is_set() and not result.aborted:
        action = random.choices(list(MIX.keys()), weights=list(MIX.values()), k=1)[0]
        try:
            s = time.time(); status = 0
            if action == 'health':
                async with session.get(f"{API}/health", timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'version':
                async with session.get(f"{API}/version", timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'readiness':
                async with session.get(f"{API}/readiness", timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'login':
                async with session.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                    json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
                    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=15)) as r: status = r.status; await r.read()
            elif action == 'feed':
                async with session.get(f"{API}/api/public/messages?limit=20", headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'messages':
                async with session.get(f"{API}/messages?limit=20", headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'rooms':
                async with session.get(f"{API}/api/public/rooms", headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'supabase_read':
                async with session.get(f"{SUPABASE_URL}/rest/v1/ivx_conversations?select=*&limit=10",
                    headers={**sh, "Authorization": f"Bearer {token}"}, timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'chat_send':
                async with session.post(f"{API}/api/public/send-message",
                    json={"room": "main-room", "content": f"lt-{wid}-{int(time.time())}"},
                    headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'protected':
                async with session.get(f"{API}/api/ivx/owner-dashboard", timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'supabase_table':
                t = random.choice(["landing_submissions", "team_members", "push_tokens", "referrals"])
                async with session.get(f"{SUPABASE_URL}/rest/v1/{t}?select=*&limit=5",
                    headers={**sh, "Authorization": f"Bearer {token}"}, timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            elif action == 'diagnostics':
                async with session.get(f"{API}/diagnostics", headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as r: status = r.status; await r.read()
            el = (time.time() - s) * 1000
            result.lat.append(el); result.total += 1; result.codes[status] += 1
            if status >= 500: result.errors += 1
            elif status >= 400 and action != 'protected': result.errors += 1
            if result.total > 50 and result.err_rate > MAX_ERR:
                result.aborted = True; result.reason = f"Error rate > {MAX_ERR*100}%"
        except asyncio.TimeoutError:
            result.total += 1; result.errors += 1; result.codes[0] += 1; result.timeouts += 1
        except Exception:
            result.total += 1; result.errors += 1; result.codes[-1] += 1
        await asyncio.sleep(random.uniform(0.1, 0.3))

async def run_level(session, name, users, dur, token):
    r = Res(name, users, dur)
    ok, lat, st = await check_health(session)
    if not ok:
        r.aborted = True; r.reason = f"Pre-flight health failed: {st}"
        log(f"  [{name}] ABORTED pre-flight: {st}")
        return r
    log(f"  [{name}] {users}u for {dur}s...")
    r.start = time.time()
    stop = asyncio.Event()
    ws = [asyncio.create_task(worker(session, i, token, stop, r)) for i in range(users)]
    await asyncio.sleep(dur)
    stop.set()
    try:
        await asyncio.wait_for(asyncio.gather(*ws, return_exceptions=True), timeout=15)
    except asyncio.TimeoutError:
        pass
    r.end = time.time()
    s = r.summary()
    log(f"  [{name}] RPS={s['rps']} p50={s['p50_ms']}ms p95={s['p95_ms']}ms p99={s['p99_ms']}ms err={s['errors']}({s['error_rate_pct']}%) to={s['timeouts']} {'ABORT' if s['aborted'] else 'OK'}")
    return r

async def auth_test(session, token, n, dur):
    r = Res(f"AUTH-{n}u", n, dur)
    r.start = time.time(); stop = asyncio.Event()
    async def aw(wid):
        while not stop.is_set() and not r.aborted:
            try:
                s = time.time()
                if wid % 2 == 0:
                    async with session.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
                        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
                        timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        st = resp.status; await resp.read()
                else:
                    async with session.get(f"{API}/api/ivx/owner-dashboard",
                        timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        st = resp.status; await resp.read()
                r.lat.append((time.time() - s) * 1000); r.total += 1; r.codes[st] += 1
                if st >= 500: r.errors += 1
                if r.total > 50 and r.err_rate > MAX_ERR:
                    r.aborted = True; r.reason = f"Error rate > {MAX_ERR*100}%"
            except asyncio.TimeoutError:
                r.total += 1; r.errors += 1; r.codes[0] += 1; r.timeouts += 1
            except Exception:
                r.total += 1; r.errors += 1; r.codes[-1] += 1
            await asyncio.sleep(0.2)
    ws = [asyncio.create_task(aw(i)) for i in range(n)]
    await asyncio.sleep(dur); stop.set()
    try:
        await asyncio.wait_for(asyncio.gather(*ws, return_exceptions=True), timeout=10)
    except asyncio.TimeoutError:
        pass
    r.end = time.time()
    s = r.summary()
    log(f"  [AUTH-{n}u] RPS={s['rps']} p50={s['p50_ms']}ms p95={s['p95_ms']}ms 500s={s['status_codes'].get(500, 0)} err={s['errors']} to={s['timeouts']}")
    return r

async def chat_test(session, token, n, dur):
    r = Res(f"CHAT-{n}c", n, dur)
    r.start = time.time(); stop = asyncio.Event()
    ah = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async def cw(wid):
        while not stop.is_set() and not r.aborted:
            try:
                s = time.time(); act = wid % 3; st = 0
                if act == 0:
                    async with session.get(f"{API}/api/public/rooms", headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as resp: st = resp.status; await resp.read()
                elif act == 1:
                    async with session.get(f"{API}/api/public/messages?limit=20", headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as resp: st = resp.status; await resp.read()
                else:
                    async with session.post(f"{API}/api/public/send-message",
                        json={"room": "main-room", "content": f"ct-{wid}-{int(time.time())}"},
                        headers=ah, timeout=aiohttp.ClientTimeout(total=10)) as resp: st = resp.status; await resp.read()
                r.lat.append((time.time() - s) * 1000); r.total += 1; r.codes[st] += 1
                if st >= 500: r.errors += 1
                if r.total > 50 and r.err_rate > MAX_ERR:
                    r.aborted = True; r.reason = f"Error rate > {MAX_ERR*100}%"
            except asyncio.TimeoutError:
                r.total += 1; r.errors += 1; r.codes[0] += 1; r.timeouts += 1
            except Exception:
                r.total += 1; r.errors += 1; r.codes[-1] += 1
            await asyncio.sleep(0.3)
    ws = [asyncio.create_task(cw(i)) for i in range(n)]
    await asyncio.sleep(dur); stop.set()
    try:
        await asyncio.wait_for(asyncio.gather(*ws, return_exceptions=True), timeout=10)
    except asyncio.TimeoutError:
        pass
    r.end = time.time()
    s = r.summary()
    log(f"  [CHAT-{n}c] RPS={s['rps']} p50={s['p50_ms']}ms p95={s['p95_ms']}ms err={s['errors']}({s['error_rate_pct']}%) to={s['timeouts']}")
    return r

async def ai_test(session, token, n, dur):
    r = Res(f"AI-{n}c", n, dur)
    r.start = time.time(); stop = asyncio.Event()
    ah = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async def aiw(wid):
        while not stop.is_set() and not r.aborted:
            try:
                s = time.time()
                async with session.post(f"{API}/api/ivx/owner-ai", json={"message": f"ai-lt-{wid}"},
                    headers=ah, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    st = resp.status; await resp.read()
                r.lat.append((time.time() - s) * 1000); r.total += 1; r.codes[st] += 1
                if st >= 500: r.errors += 1
                if r.total > 10 and r.err_rate > 0.80:
                    r.aborted = True; r.reason = "AI error rate > 80%"
            except asyncio.TimeoutError:
                r.total += 1; r.errors += 1; r.codes[0] += 1; r.timeouts += 1
            except Exception:
                r.total += 1; r.errors += 1; r.codes[-1] += 1
            await asyncio.sleep(2.0)
    ws = [asyncio.create_task(aiw(i)) for i in range(n)]
    await asyncio.sleep(dur); stop.set()
    try:
        await asyncio.wait_for(asyncio.gather(*ws, return_exceptions=True), timeout=20)
    except asyncio.TimeoutError:
        pass
    r.end = time.time()
    s = r.summary()
    log(f"  [AI-{n}c] reqs={s['total_requests']} p50={s['p50_ms']}ms p95={s['p95_ms']}ms err={s['errors']} to={s['timeouts']}")
    return r

async def recovery_test(session, token):
    results = []
    ok, lat, st = await check_health(session)
    results.append(('health_check', ok, f"{st} ({lat:.0f}ms)"))
    log(f"  [RECOVERY] Rapid auth (10 logins)...")
    at = []
    for i in range(10):
        s = time.time()
        async with session.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
            headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=15)) as resp:
            await resp.read(); at.append((time.time() - s) * 1000)
    avg_auth = sum(at) / len(at)
    results.append(('rapid_auth_10', True, f"avg {avg_auth:.0f}ms"))
    log(f"  [RECOVERY] API burst (50 concurrent /health)...")
    bs = time.time()
    btasks = [session.get(f"{API}/health", timeout=aiohttp.ClientTimeout(total=10)) for _ in range(50)]
    bres = await asyncio.gather(*btasks, return_exceptions=True)
    for r in bres:
        if hasattr(r, 'read'): await r.read()
    bok = sum(1 for r in bres if not isinstance(r, Exception))
    bt = (time.time() - bs) * 1000
    results.append(('api_burst_50', bok == 50, f"{bok}/50 ok in {bt:.0f}ms"))
    log(f"  [RECOVERY] API burst (200 concurrent /health)...")
    bs2 = time.time()
    btasks2 = [session.get(f"{API}/health", timeout=aiohttp.ClientTimeout(total=15)) for _ in range(200)]
    bres2 = await asyncio.gather(*btasks2, return_exceptions=True)
    for r in bres2:
        if hasattr(r, 'read'): await r.read()
    bok2 = sum(1 for r in bres2 if not isinstance(r, Exception))
    bt2 = (time.time() - bs2) * 1000
    results.append(('api_burst_200', bok2 == 200, f"{bok2}/200 ok in {bt2:.0f}ms"))
    await asyncio.sleep(3)
    ok2, lat2, st2 = await check_health(session)
    results.append(('post_burst_health', ok2, f"{st2} ({lat2:.0f}ms)"))
    log(f"  [RECOVERY] Supabase REST check...")
    ss = time.time()
    async with session.get(f"{SUPABASE_URL}/rest/v1/ivx_conversations?select=*&limit=1",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
        timeout=aiohttp.ClientTimeout(total=10)) as resp:
        sst = resp.status; await resp.read()
    sl = (time.time() - ss) * 1000
    results.append(('supabase_rest', sst in (200, 401, 403), f"HTTP {sst} in {sl:.0f}ms"))
    for name, ok_val, detail in results:
        log(f"  [RECOVERY] {name}: {'PASS' if ok_val else 'FAIL'} - {detail}")
    return results

async def main():
    with open(LOG, 'w') as f:
        f.write(f"[{ts()}] IVX LOAD TEST STARTED\n")

    log(f"Target: {API}")
    sslctx = ssl.create_default_context()
    sslctx.check_hostname = False
    sslctx.verify_mode = ssl.CERT_NONE
    conn = aiohttp.TCPConnector(limit=3000, limit_per_host=3000, ssl=sslctx, force_close=False, enable_cleanup_closed=True)

    async with aiohttp.ClientSession(connector=conn, timeout=aiohttp.ClientTimeout(total=120)) as session:
        log("Authenticating...")
        token = await get_token(session)
        if not token:
            log("ERROR: Auth failed")
            return
        log(f"Token acquired (len={len(token)})")

        all_results = []
        first_fail = None

        # PHASE 2: Progressive load
        log("=== PHASE 2: PROGRESSIVE LOAD ===")
        levels = [("L10", 10, 8), ("L25", 25, 8), ("L50", 50, 8), ("L100", 100, 8),
                  ("L250", 250, 6), ("L500", 500, 6), ("L1000", 1000, 5), ("L2500", 2500, 4),
                  ("L5000", 5000, 3), ("L10000", 10000, 3)]
        for name, users, dur in levels:
            r = await run_level(session, name, users, dur, token)
            all_results.append(r)
            if r.aborted:
                log(f"STOP at {users}u: {r.reason}")
                if not first_fail: first_fail = users
                break
            ok, lat, st = await check_health(session)
            if not ok:
                log(f"HEALTH FAILED after {users}u")
                if not first_fail: first_fail = users
                break
            await asyncio.sleep(2)

        # PHASE 4: Auth load
        log("=== PHASE 4: AUTHENTICATION LOAD ===")
        for n in [10, 25, 50, 100]:
            r = await auth_test(session, token, n, 10)
            all_results.append(r)
            await asyncio.sleep(1)

        # PHASE 6: Chat load
        log("=== PHASE 6: CHAT & REALTIME LOAD ===")
        for n in [50, 100, 250, 500, 1000]:
            r = await chat_test(session, token, n, 10)
            all_results.append(r)
            if r.aborted:
                log(f"Chat stopped at {n}: {r.reason}")
                break
            await asyncio.sleep(1)

        # PHASE 8: AI load (controlled)
        log("=== PHASE 8: AI GATEWAY LOAD ===")
        for n in [1, 5, 10]:
            r = await ai_test(session, token, n, 12)
            all_results.append(r)
            await asyncio.sleep(2)

        # PHASE 11: Recovery
        log("=== PHASE 11: FAILURE & RECOVERY ===")
        rec = await recovery_test(session, token)

        # Save results
        results_json = {
            'test_time': ts(),
            'first_failure_point': first_fail,
            'load_tests': [r.summary() for r in all_results],
            'recovery': [{'name': n, 'pass': ok_val, 'detail': str(d)} for n, ok_val, d in rec],
        }
        with open(OUT, 'w') as f:
            json.dump(results_json, f, indent=2)
        log(f"Results saved to {OUT}")
        log("TEST COMPLETE")

if __name__ == "__main__":
    asyncio.run(main())
