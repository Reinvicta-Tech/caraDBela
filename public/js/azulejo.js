// Cada dispositivo é um azulejo. O padrão e a cor dizem em que estado está.
import { CONFIANCA, h, presente, s } from './util.js';

const ICONES = [
  [/router|ponto de acesso|wi-?fi/i, 'M4 14h16v5H4zM8 14V6M16 14V6M7.5 16.5h1M11 16.5h1'],
  [/c[âa]mara/i, 'M3 8h4l2-3h6l2 3h4v11H3zM12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7'],
  [/fechadura/i, 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3M12 14.5v2.5'],
  [/^tv$|televis/i, 'M3 5h18v12H3zM8 20h8'],
  [/aspirador/i, 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M6 9.5h2M16 9.5h2'],
  [/^pc$|computador|port[áa]til/i, 'M5 5h14v10H5zM2 19h20'],
  [/telem[óo]vel/i, 'M7 3h10v18H7zM11 18h2'],
  [/tablet/i, 'M5 3h14v18H5zM11 18h2'],
  [/tomada/i, 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9 11v2M15 11v2'],
  [/sensor/i, 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0M12 9v8'],
];
const DUVIDA = 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 17.5v.5';
const REGRAS = {
  forca_bruta: 'Tentativas repetidas', intrusao: 'Possível intrusão', nao_autorizado: 'Ligação recusada', origem_externa: 'Acesso de fora',
  fora_de_horas: 'Fora de horas', rajada: 'Atividade anormal', novo_na_rede: 'Novo na rede',
};
const PESO = { critica: 3, alta: 2, media: 1, baixa: 0 };

export const traco = (d) => s('svg', { class: 'traco', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d }));
export const MAIS = 'M12 5v14M5 12h14';

/** Os tipos criados pelo administrador sem desenho próprio mostram o seu emoji. */
export function icone(tipo) {
  const desenho = tipo && ICONES.find(([r]) => r.test(tipo.name))?.[1];
  if (!desenho && tipo?.icon) return h('span', { class: 'emoji', 'aria-hidden': 'true' }, tipo.icon);
  return traco(desenho || DUVIDA);
}

const CANTOS = [[0, 0], [200, 0], [0, 200], [200, 200]];
export const motivo = () => s('svg', { class: 'motivo', viewBox: '0 0 200 200', 'aria-hidden': 'true' },
  CANTOS.map(([cx, cy]) => [s('circle', { class: 'aro', cx, cy, r: 44 }), s('circle', { class: 'miolo', cx, cy, r: 30 })]));

export const MUITOS = 5;
/** calma sem alertas; atenta com poucos e médios; aflita com algum alto ou crítico, ou com muitos. */
export const humor = (alertas) => (!alertas.length ? 'calma' : alertas.length >= MUITOS || alertas.some((a) => ['alta', 'critica'].includes(a.severity)) ? 'aflita' : 'atenta');
export const cara = (como = 'calma') => h('img', { class: 'cara', src: `img/caradbela-selo${como === 'calma' ? '' : `-${como}`}.svg`, alt: '', width: 256, height: 256 });

/** Junta cada dispositivo aos seus alertas e decide que azulejo é. */
export function pecas(dispositivos, alertas) {
  const porPeso = [...alertas].sort((a, b) => PESO[b.severity] - PESO[a.severity]);
  const lista = dispositivos.map((d) => {
    const meus = porPeso.filter((a) => a.deviceId?._id === d._id);
    const pior = meus[0];
    const aqui = presente(d);
    const base = !aqui ? ['fora', 'Ausente'] : [d.trust || 'desconhecido', CONFIANCA[d.trust || 'desconhecido']];
    return {
      id: d._id, d, nome: d.name, icone: d.type, alertas: meus,
      classe: pior ? (PESO[pior.severity] > 1 ? 'mau' : 'medio') : base[0],
      estado: pior ? REGRAS[pior.rule] || pior.title : base[1],
      ordem: pior ? PESO[pior.severity] * -1 - 1 : aqui ? 0 : 2,
    };
  });
  for (const a of porPeso.filter((x) => x.rule === 'novo_na_rede')) {
    const ip = /\d+\.\d+\.\d+\.\d+/.exec(a.detail || '')?.[0];
    const mac = /^novo_na_rede:((?:[0-9A-F]{2}:){5}[0-9A-F]{2})$/i.exec(a.dedupeKey)?.[1];
    lista.push({ id: a._id, novo: { ip, mac }, nome: ip || 'Equipamento novo', alertas: [a], classe: 'desconhecido', estado: REGRAS.novo_na_rede, ordem: 1 });
  }
  return lista.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt'));
}

export const azulejo = (p, props) => h('button', { type: 'button', id: `t-${p.id}`, class: `azulejo z-${p.classe}`, title: p.nome, ...props },
  motivo(), icone(p.icone), h('strong', null, p.nome), h('span', { class: 'estado' }, p.estado));
export const mini = (classe, tipo) => h('span', { class: `mini z-${classe}`, 'aria-hidden': 'true' }, motivo(), tipo !== undefined && icone(tipo));

/** Vinte e quatro quadrados, um por hora. `marcas` são as horas com alerta. */
export function tira(horas, contagens, marcas = new Set()) {
  const total = contagens.reduce((a, b) => a + b, 0);
  return h('span', { class: 'tira', role: 'img', 'aria-label': `${total} ${total === 1 ? 'evento' : 'eventos'} em 24 horas` }, contagens.map((n, i) => h('span', {
    class: marcas.has(i) ? 'hm' : n > 2 ? 'h3' : n ? 'h1' : 'h0',
    title: `${rotuloHora(horas[i].hora)}: ${n} ${n === 1 ? 'evento' : 'eventos'}${marcas.has(i) ? ', com alerta' : ''}`,
  })));
}
export const rotuloHora = (d) => `${String(new Date(d).getHours()).padStart(2, '0')}h`;
export function marcasDe(alertas, horas) {
  const inicio = new Date(horas[0].hora).getTime();
  return new Set(alertas.map((a) => Math.floor((new Date(a.lastAt) - inicio) / 3600_000)).filter((i) => i >= 0 && i < 24));
}

/** Parede de azulejos sem fim, para a entrada. */
export function parede() {
  const arcos = [[4, 4], [146, 4], [4, 146], [146, 146]];
  return s('svg', { class: 'parede-fundo', 'aria-hidden': 'true' },
    s('defs', null,
      s('clipPath', { id: 'corte' }, s('rect', { x: 4, y: 4, width: 142, height: 142, rx: 14 })),
      s('pattern', { id: 'azulejos', width: 150, height: 150, patternUnits: 'userSpaceOnUse' },
        s('rect', { class: 'chao', x: 4, y: 4, width: 142, height: 142, rx: 14 }),
        s('g', { 'clip-path': 'url(#corte)' }, arcos.map(([cx, cy]) => [s('circle', { class: 'aro', cx, cy, r: 33 }), s('circle', { class: 'miolo', cx, cy, r: 22 })])))),
    s('rect', { width: '100%', height: '100%', fill: 'url(#azulejos)' }));
}
