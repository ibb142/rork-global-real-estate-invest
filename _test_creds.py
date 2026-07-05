import json, urllib.request, ssl

ctx = ssl.create_default_context()

with open('expo/.env') as f:
    env = {}
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k,v = line.split('=',1)
            env[k] = v.strip('"').strip("'")

# Test GitHub
token = env.get('GITHUB_TOKEN','')
print(f"GITHUB_TOKEN length: {len(token)}")
if token:
    req = urllib.request.Request('https://api.github.com/user', 
        headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'IVX-Audit'})
    try:
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        data = json.loads(resp.read())
        print(f"GITHUB_USER: {resp.status} — {data.get('login','?')}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"GITHUB_USER: HTTP {e.code} — {body}")
    except Exception as e:
        print(f"GITHUB_USER: ERROR — {e}")

# Test repo access
if token:
    req = urllib.request.Request('https://api.github.com/repos/ibb142/rork-global-real-estate-invest',
        headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'IVX-Audit'})
    try:
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        data = json.loads(resp.read())
        print(f"GITHUB_REPO: {resp.status} — {data.get('full_name','?')} (private={data.get('private')})")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"GITHUB_REPO: HTTP {e.code} — {body}")
    except Exception as e:
        print(f"GITHUB_REPO: ERROR — {e}")

# Test Render
rk = env.get('RENDER_API_KEY','')
sid = env.get('RENDER_SERVICE_ID','')
print(f"\nRENDER_API_KEY length: {len(rk)}, SERVICE_ID length: {len(sid)}")
if rk and sid:
    req = urllib.request.Request(f'https://api.render.com/v1/services/{sid}',
        headers={'Authorization': f'Bearer {rk}', 'Accept': 'application/json'})
    try:
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        data = json.loads(resp.read())
        print(f"RENDER: {resp.status} — {data.get('name','?')}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"RENDER: HTTP {e.code} — {body}")
    except Exception as e:
        print(f"RENDER: ERROR — {e}")

# Test Supabase
su = env.get('SUPABASE_URL','')
sk = env.get('SUPABASE_SERVICE_ROLE_KEY','')
print(f"\nSUPABASE_URL length: {len(su)}, KEY length: {len(sk)}")
if su and sk:
    req = urllib.request.Request(f'https://{su}.supabase.co/rest/v1/',
        headers={'apikey': sk, 'Authorization': f'Bearer {sk}'})
    try:
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        print(f"SUPABASE: {resp.status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"SUPABASE: HTTP {e.code} — {body}")
    except Exception as e:
        print(f"SUPABASE: ERROR — {e}")
