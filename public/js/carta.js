// A rede desenhada como uma carta de marear: rumos que partem de 16 ventos,
// e cada dispositivo mais perto ou mais longe do porto conforme a confiança.
import { CONFIANCA, haQuanto, presente, s } from './util.js';

const TAU = Math.PI * 2;
const ponto = (cx, cy, r, a, achatar = 1) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r * achatar];

export function rumos(L, A) {
  const cx = L / 2, cy = A / 2, r = Math.min(L, A) * 0.49;
  const nos = Array.from({ length: 16 }, (_, i) => ponto(cx, cy, r, (i / 16) * TAU));
  const linhas = [];
  const longe = L + A;
  for (let i = 0; i < 16; i++) {
    const [x, y] = ponto(cx, cy, longe, (i / 16) * TAU);
    linhas.push(s('line', { class: 'rumo principal', x1: cx, y1: cy, x2: x, y2: y }));
    for (let j = i + 2; j < 16; j++) {
      const [x1, y1] = nos[i], [x2, y2] = nos[j];
      const k = longe / Math.hypot(x2 - x1, y2 - y1);
      linhas.push(s('line', { class: 'rumo', x1: x1 - (x2 - x1) * k, y1: y1 - (y2 - y1) * k, x2: x2 + (x2 - x1) * k, y2: y2 + (y2 - y1) * k }));
    }
  }
  return linhas;
}

function rosa(cx, cy) {
  const pecas = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - TAU / 4;
    const r = i % 2 ? 24 : 40;
    const p = (raio, ang) => ponto(cx, cy, raio, ang).map((n) => n.toFixed(1)).join(',');
    pecas.push(s('polygon', { class: 'rosa-a', points: `${cx},${cy} ${p(r, a)} ${p(9, a + TAU / 16)}` }));
    pecas.push(s('polygon', { class: 'rosa-b', points: `${cx},${cy} ${p(r, a)} ${p(9, a - TAU / 16)}` }));
  }
  return pecas;
}

/** Empurra o nome para dentro quando o dispositivo está junto à margem. */
function desvio(x, nome, L) {
  const meio = nome.length * 4 + 6;
  return Math.max(0, meio - x) - Math.max(0, x + meio - L);
}

export function carta(dispositivos, alarmes, abrir) {
  const estreito = window.innerWidth < 640;
  const L = estreito ? 440 : 860, A = estreito ? 560 : 640;
  const cx = L / 2, cy = A / 2;
  const base = estreito ? [85, 145, 190] : [150, 250, 350];
  const achatar = estreito ? 1.25 : 0.76;
  const raio = { confiavel: base[0], isolado: base[1], desconhecido: base[2] };
  const svg = s('svg', { viewBox: `0 0 ${L} ${A}`, role: 'group', 'aria-label': 'Carta da rede' });
  svg.append(...rumos(L, A));
  for (const r of base) svg.append(s('ellipse', { class: 'anel', cx, cy, rx: r, ry: r * achatar }));
  svg.append(...rosa(cx, cy));

  const ordem = ['confiavel', 'isolado', 'desconhecido'];
  const comNome = dispositivos.length <= (estreito ? 10 : 22);
  // Cada dispositivo tem um rumo só seu, com os anéis intercalados, para os nomes não se sobreporem.
  const lugares = ordem.flatMap((c, anel) => {
    const meus = dispositivos.filter((d) => (d.trust || 'desconhecido') === c);
    return meus.map((d, i) => ({ d, c, vez: (i + (anel + 1) / 4) / meus.length }));
  }).sort((x, y) => x.vez - y.vez);
  lugares.forEach(({ d, c }, i) => {
    const [x, y] = ponto(cx, cy, raio[c], (i / lugares.length) * TAU + 0.3, achatar);
    const nome = d.name.length > 24 ? `${d.name.slice(0, 23)}…` : d.name;
    const alarme = alarmes.has(d._id);
    const aqui = presente(d);
    const estado = `${CONFIANCA[c]}, ${aqui ? 'presente' : `visto ${haQuanto(d.lastSeenAt)}`}${alarme ? ', com alerta' : ''}`;
    svg.append(s('g', {
      class: `barco ${aqui ? '' : 'ausente'} ${alarme ? 'alarme' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
      tabindex: 0, role: 'button', 'aria-label': `${d.name}. ${estado}`, onclick: () => abrir(d),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(d); } },
    }, s('title', null, `${d.name}\n${d.ip}\n${estado}`), alarme && s('circle', { class: 'onda', r: 22 }), s('circle', { r: 19 }),
    s('text', { y: 6, 'aria-hidden': 'true' }, d.type?.icon || '?'), (comNome || alarme) && s('text', { class: 'nome', y: 39, x: desvio(x, nome, L) }, nome)));
  });
  return svg;
}
