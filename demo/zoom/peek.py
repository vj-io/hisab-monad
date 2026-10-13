import json,sys,bisect
from PIL import Image
d=json.load(open('raw/events.json')); t0=d['ev'][0]['t']; fr=json.load(open('raw/frames.json'))
out=sys.argv[1]; ts=[float(x) for x in sys.argv[2:]]
ims=[]
for t in ts:
    i=max(0,bisect.bisect_right(fr,t0+t)-1)
    im=Image.open(f'raw/{i:06d}.jpg').convert('RGB'); im=im.resize((960,540)); ims.append(im)
W=Image.new('RGB',(960*2,540*((len(ims)+1)//2)))
for k,im in enumerate(ims): W.paste(im,((k%2)*960,(k//2)*540))
W.save(out)
