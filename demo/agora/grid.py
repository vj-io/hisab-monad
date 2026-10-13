import sys,subprocess,imageio_ffmpeg
from PIL import Image
f=sys.argv[1]; out=sys.argv[2]; ts=sys.argv[3:]
ff=imageio_ffmpeg.get_ffmpeg_exe(); ims=[]
for t in ts:
    subprocess.run([ff,'-y','-loglevel','error','-ss',t,'-i',f,'-frames:v','1','/private/tmp/claude-501/scratch/g.png'],check=True)
    ims.append(Image.open('/private/tmp/claude-501/scratch/g.png').convert('RGB').resize((960,540)))
W=Image.new('RGB',(1920,540*((len(ims)+1)//2)))
for k,im in enumerate(ims): W.paste(im,((k%2)*960,(k//2)*540))
W.save(out)
