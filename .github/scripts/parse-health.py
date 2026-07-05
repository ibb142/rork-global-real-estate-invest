import json
import os

try:
    payload = os.environ.get('HEALTH_BODY', '')
    data = json.loads(payload) if payload else {}
    print(data.get('status', 'unknown'))
except Exception:
    print('unknown')
