import { cara, parede, traco } from './azulejo.js';
import { api, avisar, campo, formulario, h } from './util.js';
import * as vistas from './vistas.js';

const PAGINAS = {
  '': ['Casa', vistas.inicio], diario: ['Diário', vistas.diario], alertas: ['Alertas', vistas.alertas], seguranca: ['Segurança', vistas.seguranca],
  administracao: ['Administração', vistas.administracao, true], dispositivo: ['Dispositivo', vistas.dispositivo], conta: ['A tua conta', vistas.conta],
};
const ANTIGAS = { dispositivos: '', eventos: 'diario' };
// Que páginas reagem a cada mudança recebida em direto.
const AO_VIVO = {
  alerta: ['', 'alertas', 'diario'], 'alerta-resolvido': ['', 'alertas', 'diario'], evento: ['', 'diario'], rede: [''], analise: ['seguranca'],
};
const raiz = document.getElementById('app');
let eu = null;
let principal = null;
let direto = null;
let pedido = 0;
let espera = null;
let fecharMenu = () => {};

function rota() {
  const [pedida, consulta] = location.hash.replace(/^#\/?/, '').split('?');
  const caminho = Object.hasOwn(ANTIGAS, pedida) ? ANTIGAS[pedida] : pedida;
  return { caminho: Object.hasOwn(PAGINAS, caminho) ? caminho : '', parametros: new URLSearchParams(consulta) };
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
  document.querySelectorAll('.cabecalho a[data-p]').forEach((a) => (a.dataset.p === caminho ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  contarAlertas().catch(() => {});
  let conteudo;
  try {
    if (PAGINAS[caminho][2] && !eu.isAdmin) throw new Error('Só os administradores podem ver esta página.');
    conteudo = await PAGINAS[caminho][1]({ eu, parametros, recarregar: mostrar, sair });
  } catch (e) {
    conteudo = [h('h1', null, PAGINAS[caminho][0]), h('p', { class: 'erro' }, e.message)];
  }
  // Se entretanto se mudou de página, esta resposta já não interessa.
  if (meu !== pedido || !principal) return;
  const foco = principal.contains(document.activeElement) && document.activeElement.id;
  principal.replaceChildren(...[conteudo].flat(Infinity).filter(Boolean));
  if (foco) document.getElementById(foco)?.focus({ preventScroll: true });
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

const logo = (classe = null) => h('picture', null,
  h('source', { srcset: 'img/caradbela-horizontal-reversed.svg', media: '(prefers-color-scheme: dark)' }),
  h('img', { class: classe, src: 'img/caradbela-horizontal-color.svg', alt: 'CaraDBela' }));

function entrou(user) {
  eu = user;
  const ligacao = (p) => h('a', { href: `#/${p}`, 'data-p': p }, PAGINAS[p][0], p === 'alertas' && h('span', { class: 'conta-n', id: 'n-alertas', hidden: true }));
  const menu = h('button', { type: 'button', class: 'menu', 'aria-label': 'Menu', 'aria-expanded': 'false', onclick: () => menu.setAttribute('aria-expanded', String(cabecalho.classList.toggle('aberto'))) }, traco('M4 8h16M4 16h16'));
  const cabecalho = h('header', { class: 'cabecalho' }, h('a', { class: 'marca', href: '#/' }, logo()), menu,
    h('nav', { 'aria-label': 'Principal' }, ['', 'diario', 'alertas', 'seguranca', ...(eu.isAdmin ? ['administracao'] : [])].map(ligacao),
      h('a', { class: 'eu', href: '#/conta', 'data-p': 'conta' }, eu.username)));
  fecharMenu = () => { cabecalho.classList.remove('aberto'); menu.setAttribute('aria-expanded', 'false'); };
  principal = h('main');
  raiz.replaceChildren(cabecalho, principal);
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
  const cais = h('div', { class: 'cais' });
  const nome = () => campo('Utilizador', h('input', { name: 'username', required: true, autocomplete: 'username', autocapitalize: 'none' }));
  const passe = (nova) => campo(nova ? 'Palavra-passe (10 caracteres ou mais)' : 'Palavra-passe', h('input', { type: 'password', name: 'password', required: true, minlength: nova ? 10 : null, autocomplete: nova ? 'new-password' : 'current-password' }));
  const enviar = (caminho) => async (f) => entrou(await api('POST', `/auth/${caminho}`, Object.fromEntries(f)));
  const trocar = (texto, fn) => h('button', { type: 'button', class: 'botao', onclick: fn }, texto);

  function entrar() {
    cais.replaceChildren(logo('logo'), h('h1', null, 'A tua IoT de forma bela.'),
      formulario({ campos: [nome(), passe()], acao: 'Entrar', enviar: enviar('entrar'), extra: estado.permitirRegisto ? [trocar('Criar conta', registar)] : [] }));
  }
  function registar() {
    cais.replaceChildren(logo('logo'), h('h1', null, 'Criar conta'), formulario({ campos: [nome(), passe(true)], acao: 'Criar conta', enviar: enviar('registar'), extra: [trocar('Já tenho conta', entrar)] }));
  }
  function instalar() {
    cais.replaceChildren(logo('logo'), h('h1', null, 'Primeira viagem'), h('p', null, 'Cria a conta de administrador. O código de instalação está na consola onde arrancaste o servidor.'),
      formulario({ campos: [campo('Código de instalação', h('input', { name: 'codigo', required: true, autocomplete: 'off' })), nome(), passe(true)], acao: 'Criar administrador', enviar: enviar('instalar') }));
  }
  if (estado.instalar) instalar(); else entrar();
  raiz.replaceChildren(h('main', { class: 'porto' }, h('div', { class: 'mar' }, parede(), cara(false)), cais));
}

window.addEventListener('hashchange', () => { fecharMenu(); mostrar(); window.scrollTo(0, 0); });
window.addEventListener('sessao-terminada', () => { if (eu) { avisar('A sessão terminou. Entra outra vez.', true); porto(); } });

try { entrou(await api('GET', '/auth/eu')); } catch { porto(); }
