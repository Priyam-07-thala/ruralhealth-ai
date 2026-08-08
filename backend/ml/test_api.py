import urllib.request, json

req = urllib.request.Request(
    'http://127.0.0.1:8001/api/ml/predict',
    data=json.dumps({'symptoms': ['fever', 'cough', 'fatigue']}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
    print('HTTP 200 OK')
    for p in data['predictions']:
        rank = p['rank']
        cond = p['condition']
        score = p['score']
        contrib = p['contributingSymptoms']
        print(f'  rank={rank} condition={cond} score={score} contributing={contrib}')
    print('Model:', data['model']['name'])
    print('Disclaimer:', data['disclaimer'][:60] + '...')

# Test empty list -> should fail 400
try:
    req2 = urllib.request.Request(
        'http://127.0.0.1:8001/api/ml/predict',
        data=json.dumps({'symptoms': []}).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    urllib.request.urlopen(req2)
    print('ERROR: should have returned 400')
except urllib.error.HTTPError as e:
    print(f'Test empty list: HTTP {e.code} (expected 400) - PASS')
