# 복제 목소리에서 어색하게 들릴 만한 곳을 찾는다: 쉼 뒤 갑자기 높아진 첫 말(+3반음↑), 지나치게 늘어진 낱말.
# usage: python3 scripts/voice_awkward.py <CH.mp3> <CH.words.json>   (EP005 1:14·1:45·2:37 피드백에서 만듦)
import sys,subprocess,json,re,numpy as np
mp3,wj=sys.argv[1:3]
raw=subprocess.run(["ffmpeg","-v","error","-i",mp3,"-ac","1","-ar","16000","-f","s16le","-"],capture_output=True).stdout
x=np.frombuffer(raw,np.int16).astype(float)/32768
def seg(a,b):
    ps=[];ls=[]
    for k in range(int(a*16000),int(b*16000)-640,160):
        w=x[k:k+640]*np.hanning(640); e=np.sqrt((w**2).mean())
        if e<0.01: continue
        ls.append(20*np.log10(e))
        ac=np.correlate(w,w,'full')[639:]; p=53+np.argmax(ac[53:228])
        if ac[p]>0.4*ac[0]: ps.append(16000/p)
    return (np.median(ps) if ps else None, max(ls) if ls else -99)
words=[w for w in json.load(open(wj))['words'] if w['type']=='word' and re.sub(r'[^가-힣0-9]','',w['text'])]
allp=seg(0,len(x)/16000)[0]
out=[]
for i,w in enumerate(words):
    syl=len(re.sub(r'[^가-힣]','',w['text'])) or 1
    dur=w['end']-w['start']
    gap=w['start']-words[i-1]['end'] if i else 9
    p,l=seg(w['start'],w['end'])
    st=12*np.log2(p/allp) if p else 0
    if gap>0.25 and st>3.0: out.append((w['start'],f"쉼 뒤 첫 말이 높음 +{st:.1f}반음: {w['text']}"))
    if dur/syl>0.33 and syl>=2 and not w['text'].endswith(('.', '?', ',')): out.append((w['start'],f"늘어짐 {dur/syl:.2f}s/음절: {w['text']}"))
for t,m in out: print(f"{int(t//60)}:{t%60:05.2f} {m}")
print("total",len(out))
