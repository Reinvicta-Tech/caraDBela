# Conceitos do logo CaraDBela, a preto. Toda a geometria nasce aqui.
import math
def f(v): return ('%.2f'%v).rstrip('0').rstrip('.') or '0'
def P(p): return f'{f(p[0])} {f(p[1])}'
def poly(pts): return 'M'+' L'.join(P(p) for p in pts)+'Z'
def rect(x,y,w,h): return poly([(x,y),(x+w,y),(x+w,y+h),(x,y+h)])
def circ(x,y,r): return f'M{f(x-r)} {f(y)}a{f(r)} {f(r)} 0 1 1 {f(2*r)} 0a{f(r)} {f(r)} 0 1 1 {f(-2*r)} 0Z'
def cruz(cx,cy,R,a,fl,W,vazio=0):
    """Cruz de Cristo: braços de meia largura a, que abrem a partir de fl até W."""
    q=[(-a,-a),(-a,-fl),(-W,-R),(W,-R),(a,-fl),(a,-a)]
    pts=[]
    for k in range(4):
        for (x,y) in q[1:]:
            for _ in range(k): x,y=-y,x
            pts.append((cx+x,cy+y))
    d=poly(pts)
    if vazio:
        v,L=vazio,fl
        d+=poly([(cx+x,cy+y) for x,y in [(-v,-L),(v,-L),(v,-v),(L,-v),(L,v),(v,v),(v,L),(-v,L),(-v,v),(-L,v),(-L,-v),(-v,-v)]])
    return d
def onda(p0,p1,n,teta,t,lado=1):
    """Fita ondulada de n arcos exatos (2*teta cada) entre p0 e p1, com espessura 2t."""
    dx,dy=p1[0]-p0[0],p1[1]-p0[1]; L=math.hypot(dx,dy); ang=math.atan2(dy,dx)
    th=math.radians(teta); r=L/n/2/math.sin(th)
    k=[(p0[0]+dx*i/n,p0[1]+dy*i/n) for i in range(n+1)]
    def off(i,s):
        a=ang+lado*(th if i%2 else -th)+math.pi/2
        return (k[i][0]+s*t*math.cos(a),k[i][1]+s*t*math.sin(a))
    d='M'+P(off(0,1))
    def arco(i,s,volta):
        # arco i: curva para lado alternado
        sw=1 if (lado if i%2==0 else -lado)>0 else 0
        rr=r-t*s if sw else r+t*s
        e=off(i if volta else i+1,s)
        return f'A{f(rr)} {f(rr)} 0 0 {(1-sw) if volta else sw} {P(e)}'
    for i in range(n): d+=arco(i,1,False)
    d+='L'+P(off(n,-1))
    for i in reversed(range(n)): d+=arco(i,-1,True)
    return d+'Z'
def D(cx,y,w,h,s,cheio=False):
    """D deitado: haste em cima, barriga para baixo."""
    r=w/2; reto=h-r
    o=f'M{P((cx-r,y))}H{f(cx+r)}V{f(y+reto)}A{f(r)} {f(r)} 0 0 1 {P((cx-r,y+reto))}Z'
    if cheio: return o
    ri=r-s
    return o+f'M{P((cx-ri,y+s))}V{f(y+reto)}A{f(ri)} {f(ri)} 0 0 0 {P((cx+ri,y+reto))}V{f(y+s)}Z'
def svg(body,w=256,h=256):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}"><title>CaraDBela</title>{body}</svg>\n'
def path(d): return f'<path fill="#000" fill-rule="evenodd" d="{d}"/>'
mir=lambda p:(256-p[0],p[1])

# A — refresh fiel
def A():
    cx,cy,R,r=128,146,104,88
    g=math.radians(30)
    q=lambda rad,a:(cx+rad*math.sin(a),cy-rad*math.cos(a))
    d=f'M{P(q(R,g))}A{R} {R} 0 1 1 {P(q(R,-g))}L{P(q(r,-g))}A{r} {r} 0 1 0 {P(q(r,g))}Z'
    d+=cruz(128,46,38,11,25,20,4)
    for a,b,n in [((97,87),(57,127),3),((121,95),(65,151),4)]:
        for m,l in [((a,b),1),((mir(a),mir(b)),-1)]: d+=onda(m[0],m[1],n,45,5,l)
    d+=circ(104,163,12)+rect(140,159,28,8)+D(128,184,48,38,9)
    return d
# B — o B são os olhos, o D é o sorriso, as ondas são o cabelo
def B():
    s=14; y=90; r=40
    xs=[128-r+s/2,128+r-s/2]
    x0,x1=xs[0]-r,xs[1]+r; reto=26
    d=f'M{P((x0,y))}H{f(x1)}V{f(y+reto)}A{r} {r} 0 0 1 {P((128,y+reto+math.sqrt(r*r-(r-s/2)**2)))}A{r} {r} 0 0 1 {P((x0,y+reto))}Z'
    ri=r-s
    for x in xs: d+=f'M{P((x-ri,y+s))}V{f(y+reto)}A{ri} {ri} 0 0 0 {P((x+ri,y+reto))}V{f(y+s)}Z'
    d+=circ(xs[0],y+31,11)+rect(xs[1]-14,y+27,28,8)
    d+=D(128,178,88,56,14)
    d+=cruz(128,42,36,10.5,24,19,4)
    for x,l in [(32,1),(224,-1)]: d+=onda((x,90),(x,234),4,45,7,l)
    return d
# C — caravela: o casco sorri, a vela cheia olha, a verga pisca
def C():
    d=cruz(128,46,34,10,23,18,0)
    d+=rect(121,90,14,112)
    d+=circ(74,122,32)+rect(150,114,64,16)
    d+='M16 150A124 124 0 0 0 240 150A113 113 0 0 1 128 248A113 113 0 0 1 16 150Z'
    return d
marcas={'a':A(),'b':B(),'c':C()}
for k,d in marcas.items(): open(f'{k}-symbol.svg','w',encoding='utf8').write(svg(path(d)))

# Nome desenhado: caixa alta geométrica, altura 72, traço 14 (traços ainda por expandir)
def letras():
    H,s=72,14; h=s/2; o=[]; x=0
    def A_():  return 66,f'M{{0}} {H}L{{33}} {h}L{{66}} {H}',f'M{{14}} 50H{{52}}'
    for L in 'CARADBELA':
        X=lambda v:f(x+v)
        if L=='C':
            R=29+.0; w=58
            a=math.radians(45); cx,cy=36,36
            o.append(f'M{X(cx+R*math.cos(a))} {f(cy-R*math.sin(a))}A{R} {R} 0 1 0 {X(cx+R*math.cos(a))} {f(cy+R*math.sin(a))}'); w=62
        elif L=='A': o.append(f'M{X(7)} {H}L{X(36)} 10L{X(65)} {H}M{X(19)} 50H{X(53)}'); w=72
        elif L=='R': o.append(f'M{X(h)} {H}V{h}H{X(28)}A17 17 0 0 1 {X(28)} 41H{X(h)}M{X(28)} 41L{X(45)} {H}'); w=54
        elif L=='D': o.append(f'M{X(h)} {h}H{X(26)}A29 29 0 0 1 {X(26)} {H-h}H{X(h)}Z'); w=62
        elif L=='B': o.append(f'M{X(h)} {h}H{X(28)}A14 14 0 0 1 {X(28)} 35H{X(h)}M{X(28)} 35H{X(30)}A15 15 0 0 1 {X(30)} {H-h}H{X(h)}V0'); w=52
        elif L=='E': o.append(f'M{X(44)} {h}H{X(h)}V{H-h}H{X(44)}M{X(h)} 36H{X(40)}'); w=44
        elif L=='L': o.append(f'M{X(h)} 0V{H-h}H{X(42)}'); w=42
        x+=w+(8 if L in 'ARL' else 10)
    return ''.join(o),x-8
nome,NW=letras()
for k,d in marcas.items():
    body=path(d)+f'<g transform="translate(284,92)"><path fill="none" stroke="#000" stroke-width="14" stroke-miterlimit="6" d="{nome}"/></g>'
    open(f'{k}-lockup.svg','w',encoding='utf8').write(svg(body,284+NW+16,256))
