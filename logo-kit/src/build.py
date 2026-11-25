# Gera todos os masters do logo CaraDBela. Edita aqui, não nos SVG.
#   python logo-kit/src/build.py
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
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
mir=lambda p:(256-p[0],p[1])
AZUL,VERM,NOITE='#2672D6','#D62C26','#123A82'
CX,CY=128,146

def aro(R,r,graus):
    g=math.radians(graus)
    q=lambda rad,a:(CX+rad*math.sin(a),CY-rad*math.cos(a))
    return f'M{P(q(R,g))}A{f(R)} {f(R)} 0 1 1 {P(q(R,-g))}L{P(q(r,-g))}A{f(r)} {f(r)} 0 1 0 {P(q(r,g))}Z'
def cabelo(t):
    d=''
    for a,b,n in [((97,87),(57,127),3),((121,95),(65,151),4)]:
        for m,l in [((a,b),1),((mir(a),mir(b)),-1)]: d+=onda(m[0],m[1],n,45,t,l)
    return d
def simbolo(fino=0):
    """Devolve (partes azuis, partes vermelhas). fino: quanto tirar a cada lado do traço."""
    e=fino
    azul=aro(104-e,88+e,30)+cabelo(5-e/2)
    verm=cruz(128,46,38-e/2,11-e/2,25,20-e/2,4)+circ(104,163,12-e/2)+rect(140,159+e/2,28,8-e)+D(128,184,48,38,9-e/2)
    return azul,verm
def simbolo_pequeno():
    """Abaixo de 48 px: a mesma cara, com ondas mais grossas e menos curvas, e feições maiores."""
    azul=aro(106,90,30)
    for a,b,n in [((94,89),(55,128),2),((120,97),(62,155),3)]:
        for m,l in [((a,b),1),((mir(a),mir(b)),-1)]: azul+=onda(m[0],m[1],n,45,6,l)
    return azul, cruz(128,46,40,12,26,21,5)+circ(101,170,14)+rect(138,165,34,10)+D(128,190,52,38,10)

def letra(c):
    """(largura, contorno) com altura 72, hastes 14, barras 13."""
    if c=='C':
        R,r,a=37,23,math.radians(45); p=lambda k,s:(37+k*math.cos(a),36+s*k*math.sin(a))
        return 64,f'M{P(p(R,-1))}A{R} {R} 0 1 0 {P(p(R,1))}L{P(p(r,1))}A{r} {r} 0 1 1 {P(p(r,-1))}Z'
    if c=='A':
        x=lambda y:26*(1-y/72)+15
        return 68,poly([(0,72),(26,0),(42,0),(68,72),(53,72),(68-x(55),55),(x(55),55),(15,72)])+poly([(34,(41-34)*72/26),(x(43),43),(68-x(43),43)])
    if c=='R':
        y=21+math.sqrt(441-25); t60=math.tan(math.radians(60)); xr=33+(72-y)/t60
        return xr,f'M0 0H28A21 21 0 0 1 33 {f(y)}L{f(xr)} 72H{f(17+30/t60)}L17 42H14V72H0ZM14 13V29H28A8 8 0 0 0 28 13Z'
    if c=='D': return 60,'M0 0H24A36 36 0 0 1 24 72H0ZM14 13V59H24A23 23 0 0 0 24 13Z'
    if c=='B':
        # cruzamento exato das duas barrigas
        x0,y0,r0,x1,y1,r1=27,19,19,28,52,20
        dd=math.hypot(x1-x0,y1-y0); a=(r0*r0-r1*r1+dd*dd)/(2*dd); hh=math.sqrt(r0*r0-a*a)
        k=(x0+a*(x1-x0)/dd+hh*(y1-y0)/dd, y0+a*(y1-y0)/dd-hh*(x1-x0)/dd)
        return 48,f'M0 0H27A19 19 0 0 1 {P(k)}A20 20 0 0 1 28 72H0ZM14 13V29H27A8 8 0 0 0 27 13ZM14 41V59H28A9 9 0 0 0 28 41Z'
    if c=='E': return 44,'M0 0H44V13H14V29H40V42H14V59H44V72H0Z'
    if c=='L': return 42,'M0 0H14V59H42V72H0Z'
FOLGA={'CA':4,'AR':6,'RA':2,'AD':6,'DB':11,'BE':11,'EL':11,'LA':0}
def nome():
    """Lista de (x, contorno, é DB?) e largura total."""
    s='CARADBELA'; x=0; o=[]
    for i,c in enumerate(s):
        w,d=letra(c); o.append((x,d,c in 'DB')); x+=w+(FOLGA[s[i:i+2]] if i<len(s)-1 else 0)
    return o,x
LET,NW=nome()

def pt(d,c): return f'<path fill="{c}" fill-rule="evenodd" d="{d}"/>'
def grp(corpo,x,y,k=1): return f'<g transform="translate({f(x)} {f(y)})'+(f' scale({f(k)})' if k!=1 else '')+f'">{corpo}</g>'
def gnome(c1,c2): return ''.join(grp(pt(d,c2 if db else c1),x,0) for x,d,db in LET)
def svg(vb,corpo): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(f(v) for v in vb)}" width="{f(vb[2])}" height="{f(vb[3])}"><title>CaraDBela</title>{corpo}</svg>\n'
def guardar(n,s): open(n,'w',encoding='utf8',newline='\n').write(s)

def construir(tag,c1,c2,fino=0):
    a,v=simbolo(fino); sim=pt(a,c1)+pt(v,c2) if c1!=c2 else pt(a+v,c1)
    pa,pv=simbolo_pequeno(); peq=pt(pa,c1)+pt(pv,c2) if c1!=c2 else pt(pa+pv,c1)
    n=gnome(c1,c2)
    guardar(f'caradbela-symbol-{tag}.svg',svg((0,0,256,256),sim))
    guardar(f'caradbela-symbol-small-{tag}.svg',svg((0,0,256,256),peq))
    guardar(f'caradbela-wordmark-{tag}.svg',svg((-12,-12,NW+24,96),n))
    # horizontal: o nome alinha pelo centro do aro (y=146)
    k=1.25
    guardar(f'caradbela-horizontal-{tag}.svg',svg((8,0,256+NW*k+20,256),sim+grp(n,264,146-36*k,k)))
    # empilhado: símbolo a 1,4 com folga de 28
    ks=1.4
    guardar(f'caradbela-stacked-{tag}.svg',svg((-24,-10,NW+48,256*ks+28+72+30),grp(sim,(NW-256*ks)/2,0,ks)+grp(n,0,250*ks+28)))

construir('color',AZUL,VERM)
construir('black','#000000','#000000')
construir('azul',AZUL,AZUL)
construir('white','#FFFFFF','#FFFFFF',1)
# Selo: cores sobre disco branco, para fundos escuros ou com imagem
a,v=simbolo(); pa,pv=simbolo_pequeno()
disco=f'<circle cx="128" cy="128" r="128" fill="#FFFFFF"/>'
guardar('caradbela-selo.svg',svg((0,0,256,256),disco+grp(pt(a,AZUL)+pt(v,VERM),128-128*.82,128-129*.82,.82)))
guardar('caradbela-selo-small.svg',svg((0,0,256,256),disco+grp(pt(pa,AZUL)+pt(pv,VERM),128-128*.9,128-129*.9,.9)))
guardar('caradbela-horizontal-reversed.svg',svg((0,0,256+NW*1.25+40,256),f'<circle cx="128" cy="128" r="128" fill="#FFFFFF"/>'+grp(pt(a,AZUL)+pt(v,VERM),128-128*.82,128-129*.82,.82)+grp(gnome('#FFFFFF','#FFFFFF'),284,128-45,1.25)))
# Ícone de aplicação: o símbolo completo, a cores, em azulejo branco
def icone(n,rx): guardar(n,svg((0,0,256,256),f'<rect width="256" height="256" rx="{rx}" fill="#FFFFFF"/>'+grp(pt(a,AZUL)+pt(v,VERM),128-128*.9,128-129*.9,.9)))
icone('caradbela-app-icon.svg',56)
