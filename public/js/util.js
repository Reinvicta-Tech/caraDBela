/** Cria elementos. O texto entra sempre como texto, nunca como HTML. */
function criar(el, props, filhos) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false));
  return el;
}
export const h = (tag, props, ...filhos) => criar(document.createElement(tag), props, filhos);
export const s = (tag, props, ...filhos) => criar(document.createElementNS('http://www.w3.org/2000/svg', tag), props, filhos);

export class ErroApi extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function api(metodo, rota, corpo) {
  let r;
  try {
    r = await fetch(`/api${rota}`, {
      method: metodo, headers: { 'X-CaraDBela': '1', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo && JSON.stringify(corpo),
    });
  } catch { throw new ErroApi(0, 'Não há ligação ao servidor. Confirma que está a correr.'); }
  const dados = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !rota.startsWith('/auth/')) window.dispatchEvent(new Event('sessao-terminada'));
    throw new ErroApi(r.status, dados?.message || 'O servidor respondeu com um erro.');
  }
  return dados;
}

export function avisar(texto, mau = false) {
  const el = h('div', { class: mau ? 'mau' : null }, texto);
  document.getElementById('avisos').append(el);
  setTimeout(() => el.remove(), 6000);
}

/** Botão que bloqueia enquanto trabalha e mostra o erro se falhar. */
export function botao(texto, fazer, classe = '', aTrabalhar = null) {
  const b = h('button', { type: 'button', class: `botao ${classe}` }, texto);
  b.addEventListener('click', async () => {
    b.disabled = true;
    if (aTrabalhar) b.textContent = aTrabalhar;
    try { await fazer(); } catch (e) { avisar(e.message, true); } finally { b.disabled = false; b.textContent = texto; }
  });
  return b;
}

export const campo = (texto, controlo) => h('label', { class: 'campo' }, texto, controlo);

export function formulario({ campos, enviar, acao, extra = [] }) {
  const erro = h('p', { class: 'erro', role: 'alert', hidden: true });
  const b = h('button', { class: 'botao cheio' }, acao);
  return h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      b.disabled = true;
      erro.hidden = true;
      try { await enviar(new FormData(e.target)); } catch (x) { erro.textContent = x.message; erro.hidden = false; } finally { b.disabled = false; }
    },
  }, campos, erro, h('div', { class: 'acoes' }, b, extra));
}

export function dialogo(titulo, montar) {
  const d = h('dialog', { 'aria-label': titulo, onclose: () => d.remove() });
  const fechar = () => d.close();
  d.append(h('h2', null, titulo), ...[montar(fechar)].flat());
  document.body.append(d);
  d.showModal();
  return fechar;
}
export function confirmar(titulo, texto, acao) {
  return new Promise((resolve) => {
    dialogo(titulo, (fechar) => h('form', null, h('p', null, texto), h('div', { class: 'acoes' },
      h('button', { type: 'button', class: 'botao perigo', onclick: () => { resolve(true); fechar(); } }, acao),
      h('button', { type: 'button', class: 'botao', onclick: fechar }, 'Cancelar'))));
    document.querySelector('dialog:last-of-type').addEventListener('close', () => resolve(false));
  });
}

export function tabela(colunas, linhas, vazio) {
  if (!linhas.length) return h('div', { class: 'vazio' }, vazio);
  return h('div', { class: 'rolar' }, h('table', null,
    h('thead', null, h('tr', null, colunas.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', null, linhas.map((l) => h('tr', null, l.map((c) => h('td', null, c)))))));
}

const rel = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' });
export function haQuanto(data) {
  if (!data) return 'nunca';
  const min = Math.round((new Date(data) - Date.now()) / 60_000);
  if (min > -1) return 'agora';
  if (min > -60) return rel.format(min, 'minute');
  if (min > -1440) return rel.format(Math.round(min / 60), 'hour');
  return rel.format(Math.round(min / 1440), 'day');
}
export const dataHora = (d) => new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
export const presente = (d) => Boolean(d.lastSeenAt) && Date.now() - new Date(d.lastSeenAt) < 15 * 60_000;

/** 'ativa', 'parada' ou null quando não há nenhuma vigia instalada. */
export const vigia = (d) => (!d.watchedAt ? null : Date.now() - new Date(d.watchedAt) < 3 * 60_000 ? 'ativa' : 'parada');

export const CONFIANCA = { confiavel: 'Confiável', isolado: 'Isolado', desconhecido: 'Por classificar' };
export const SEVERIDADE = { critica: 'Crítico', alta: 'Alto', media: 'Médio', baixa: 'Baixo' };
export const EVENTOS = { acesso: 'Acesso', login_ok: 'Entrada com sucesso', login_falhado: 'Entrada falhada', nao_autorizado: 'Ligação recusada', ligacao: 'Ligação' };
export const sev = (k) => h('span', { class: `sev sev-${k}` }, `${{ critica: '▲▲', alta: '▲', media: '◆', baixa: '●' }[k]} ${SEVERIDADE[k]}`);
