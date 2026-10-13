import json
L=json.load(open('lines.json')); D=[x['dur'] for x in json.load(open('timings0.json'))] if isinstance(json.load(open('timings0.json')),list) else None
if D is None:
    D=[x['dur'] for x in json.load(open('timings0.json'))['lines']]
GAP=0.28; t=0.4; S=[]
for i,(l,d) in enumerate(zip(L,D)):
    S.append({"t":round(t,3),"text":l}); t+=d+GAP
json.dump(S,open('script.json','w'),indent=1)
open('tl.js','w').write("const LINES=%s;\nconst DUR=%s;\n"%(json.dumps(L),json.dumps(D)))
print([s['t'] for s in S], 'end', t)
