import { rumos } from './carta.js';
import { api, avisar, campo, formulario, h, s } from './util.js';
import * as vistas from './vistas.js';

const PAGINAS = {
  '': ['A tua rede', vistas.inicio], dispositivos: ['Dispositivos', vistas.dispositivos], alertas: ['Alertas', vistas.alertas],
  eventos: ['Eventos', vistas.eventos], seguranca: ['Segurança', vistas.seguranca], administracao: ['Administração', vistas.administracao, true], conta: ['A tua conta', vistas.conta],
};
// Que páginas reagem a cada mudança recebida em direto.
const AO_VIVO = {
  alerta: ['', 'alertas'], 'alerta-resolvido': ['', 'alertas'], evento: ['', 'eventos'], rede: ['', 'dispositivos'], analise: ['seguranca'],
};
const raiz = document.getElementById('app');
let eu = null;
let principal = null;
let direto = null;
let pedido = 0;
let espera = null;

function rota() {
  const [caminho, consulta] = location.hash.replace(/^#\/?/, '').split('?');
  return { caminho: PAGINAS[caminho] ? caminho : '', parametros: new URLSearchParams(consulta) };
}

async function contarAlertas() {
  const { alertas } = await api('GET', '/resumo');
  const n = Object.values(alertas).reduce((a, b) => a + b, 0);
  const el = document.getElementById('n-alertas');
  if (el) { el.textContent = n; el.hidden = !n; }
  document.title = n ? `(${n}) CaraDBela` : 'CaraDBela';
}

async function mostrar() {
  if (!eu || !principal) return;
  const { caminho, parametros } = rota();
  const meu = ++pedido;
  document.querySelectorAll('.lateral a[data-p]').forEach((a) => (a.dataset.p === caminho ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  contarAlertas().catch(() => {});
  let conteudo;
  try {
    if (PAGINAS[caminho][2] && !eu.isAdmin) throw new Error('Só os administradores podem ver esta página.');
    conteudo = await PAGINAS[caminho][1]({ eu, parametros, recarregar: mostrar });
  } catch (e) {
    conteudo = [h('h1', null, PAGINAS[caminho][0]), h('p', { class: 'erro' }, e.message)];
  }
  // Se entretanto se mudou de página, esta resposta já não interessa.
  if (meu === pedido && principal) principal.replaceChildren(...[conteudo].flat(Infinity).filter(Boolean));
}

/** Atualiza sem apagar o que a pessoa está a escrever. */
function atualizarEmBreve() {
  clearTimeout(espera);
  espera = setTimeout(() => {
    const foco = document.activeElement;
    if (document.querySelector('dialog[open]') || (principal?.contains(foco) && foco.matches('input, select'))) return atualizarEmBreve();
    mostrar();
  }, 800);
}

function ligarDireto() {
  direto?.close();
  direto = new EventSource('/api/direto');
  direto.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.tipo === 'alerta' && d.severity !== 'media') avisar(d.title, true);
    if (AO_VIVO[d.tipo]?.includes(rota().caminho)) atualizarEmBreve();
    else contarAlertas().catch(() => {});
  };
  // Se a sessão acabou, o navegador não volta a ligar sozinho.
  direto.onerror = () => { if (direto?.readyState === EventSource.CLOSED) api('GET', '/resumo').catch(() => {}); };
}

function entrou(user) {
  eu = user;
  const ligacao = (p) => h('a', { href: `#/${p}`, 'data-p': p }, PAGINAS[p][0], p === 'alertas' && h('span', { class: 'conta-n', id: 'n-alertas', hidden: true }));
  principal = h('main');
  raiz.replaceChildren(h('div', { class: 'casca' }, h('aside', { class: 'lateral' },
    h('a', { class: 'marca', href: '#/' }, h('span', { class: 'rosto' }), 'CaraDBela'),
    h('nav', { 'aria-label': 'Principal' }, ['', 'dispositivos', 'alertas', 'eventos', 'seguranca', ...(eu.isAdmin ? ['administracao'] : [])].map(ligacao)),
    h('div', { class: 'fundo' }, h('a', { href: '#/conta' }, eu.username), h('button', { type: 'button', onclick: sair }, 'Sair'))), principal));
  ligarDireto();
  mostrar();
}

async function sair() {
  try { await api('POST', '/auth/sair'); } catch (e) { return avisar(e.message, true); }
  location.hash = '#/';
  porto();
}

async function porto() {
  eu = null;
  principal = null;
  pedido++;
  direto?.close();
  direto = null;
  document.querySelectorAll('dialog').forEach((d) => d.close());
  const estado = await api('GET', '/auth/estado').catch((e) => { avisar(e.message, true); return {}; });
  const mar = s('svg', { viewBox: '0 0 800 900', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' }, rumos(800, 900));
  const cais = h('div', { class: 'cais' });
  const nome = () => campo('Utilizador', h('input', { name: 'username', required: true, autocomplete: 'username', autocapitalize: 'none' }));
  const passe = (nova) => campo(nova ? 'Palavra-passe (10 caracteres ou mais)' : 'Palavra-passe', h('input', { type: 'password', name: 'password', required: true, minlength: nova ? 10 : null, autocomplete: nova ? 'new-password' : 'current-password' }));
  const enviar = (caminho) => async (f) => entrou(await api('POST', `/auth/${caminho}`, Object.fromEntries(f)));
  const trocar = (texto, fn) => h('button', { type: 'button', class: 'botao', onclick: fn }, texto);

  function entrar() {
    cais.replaceChildren(h('h1', null, 'CaraDBela'), h('p', null, 'A tua IoT de forma bela, e vigiada.'),
      formulario({ campos: [nome(), passe()], acao: 'Entrar', enviar: enviar('entrar'), extra: estado.permitirRegisto ? [trocar('Criar conta', registar)] : [] }));
  }
  function registar() {
    cais.replaceChildren(h('h1', null, 'Criar conta'), formulario({ campos: [nome(), passe(true)], acao: 'Criar conta', enviar: enviar('registar'), extra: [trocar('Já tenho conta', entrar)] }));
  }
  function instalar() {
    cais.replaceChildren(h('h1', null, 'Primeira viagem'), h('p', null, 'Cria a conta de administrador. O código de instalação está na consola onde arrancaste o servidor.'),
      formulario({ campos: [campo('Código de instalação', h('input', { name: 'codigo', required: true, autocomplete: 'off' })), nome(), passe(true)], acao: 'Criar administrador', enviar: enviar('instalar') }));
  }
  if (estado.instalar) instalar(); else entrar();
  raiz.replaceChildren(h('div', { class: 'porto' }, h('div', { class: 'mar' }, mar, h('span', { class: 'rosto', role: 'img', 'aria-label': 'Logótipo CaraDBela' })), cais));
}

window.addEventListener('hashchange', () => { mostrar(); window.scrollTo(0, 0); });
window.addEventListener('sessao-terminada', () => { if (eu) { avisar('A sessão terminou. Entra outra vez.', true); porto(); } });

try { entrou(await api('GET', '/auth/eu')); } catch { porto(); }
