import sys
sys.path.insert(0, r'c:\Users\User\Desktop\RuralHealth AI\backend')
from ml.predictor import disease_predictor

print("=== Test 1: fever, cough, fatigue ===")
r = disease_predictor.predict_disease(['fever', 'cough', 'fatigue'])
for p in r['predictions']:
    print(f"  #{p['rank']} {p['condition']} score={p['score']} contributing={p['contributingSymptoms']}")

print("\n=== Test 2: shortness of breath, chest pain, dizziness ===")
r2 = disease_predictor.predict_disease(['shortness of breath', 'chest pain', 'dizziness'])
for p in r2['predictions']:
    print(f"  #{p['rank']} {p['condition']} score={p['score']}")

print("\n=== Test 3: fever + unknown symptom ===")
r3 = disease_predictor.predict_disease(['fever', 'UNKNOWNSYM12345'])
print(f"  Unknown: {r3.get('unknownSymptoms')}")
print(f"  Top-1: {r3['predictions'][0]['condition'] if r3['predictions'] else 'none'}")

print("\n=== Test 4: All unknown symptoms ===")
r4 = disease_predictor.predict_disease(['TOTALLY_BOGUS'])
print(f"  Predictions: {'empty (correct)' if not r4['predictions'] else r4['predictions']}")

print("\n=== Test 5: Empty list ===")
r5 = disease_predictor.predict_disease([])
print(f"  Predictions: {'empty (correct)' if not r5['predictions'] else r5['predictions']}")
