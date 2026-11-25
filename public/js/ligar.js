import { cara, icone } from './azulejo.js';
import { RECEITAS, receitaPara } from './receitas.js';
import { api, avisar, botao, confirmar, EVENTOS, h, haQuanto, vigia } from './util.js';

// A chave só existe aqui até a página ser fechada ou a sessão terminar.
const chaves = new Map();
export const esquecerChaves = () => chaves.clear();

const SEM_CHAVE = 'COLA_AQUI_A_CHAVE';
const SIGNIFICADO = {
  login_falhado: 'alguém errou a palavra-passe', login_ok: 'alguém entrou', acesso: 'alguém usou o dispositivo',
  nao_autorizado: 'o dispositivo recusou um equipamento', ligacao: 'um equipamento ligou-se',
};

async function copiar(texto, el) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(texto);
    else { // sem HTTPS, o navegador não dá acesso à área de transferência
      getSelection().selectAllChildren(el);
      if (!document.execCommand('copy')) throw new Error();
    }
    avisar('Copiado.');
  } catch { avisar('Não consegui copiar. Seleciona o texto e usa Ctrl+C.', true); }
}

function caixa(texto, nome) {
  const el = h('code', null, texto);
  return h('div', { class: 'copia' }, h('pre', { tabindex: 0, role: 'region', 'aria-label': nome }, el), botao('Copiar', () => copiar(texto, el)));
}

const passo = (n, titulo, ...resto) => h('li', { class: 'painel passo' }, h('span', { class: 'num', 'aria-hidden': 'true' }, n), h('div', { class: 'coluna cresce' }, h('h2', null, titulo), resto));

export async function ligar(ctx) {
  const id = ctx.parametros.get('id');
  const [lista, servidor] = await Promise.all([api('GET', '/dispositivos'), api('GET', '/servidor')]);
  const d = lista.find((x) => x._id === id);
  if (!d) throw new Error('Este dispositivo já não existe.');
  const aqui = `#/ligar?id=${id}`;
  const pedida = ctx.parametros.get('como');
  const qual = Object.hasOwn(RECEITAS, pedida) ? pedida : receitaPara(d.type?.name);
  const r = RECEITAS[qual];
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // Para outro equipamento, "localhost" seria ele próprio.
  const url = (local && servidor.endereco) || location.origin;

  const topo = h('div', { class: 'cartao' }, h('div', { class: 'cresce coluna' },
    h('a', { class: 'voltar', href: `#/dispositivo?id=${id}` }, `Voltar a ${d.name}`),
    h('h1', null, `Ligar: ${d.name}`),
    h('p', { class: 'fala' }, 'A CaraDBela não espreita o dispositivo: é ele que lhe conta o que acontece. A chave prova que é mesmo ele.')), cara());

  const escolha = passo(1, 'O que é este dispositivo?', h('nav', { class: 'tipos', 'aria-label': 'Tipo de equipamento' },
    Object.entries(RECEITAS).map(([k, v]) => h('a', { href: `${aqui}&como=${k}`, 'aria-current': k === qual ? 'true' : null }, icone({ name: v.icone }), v.nome, h('small', null, v.selo)))));

  if (!r.codigo) {
    return h('div', { class: 'coluna media' }, topo, h('ol', { class: 'passos' }, escolha, passo(2, 'Este dispositivo não usa chave',
      h('p', null, 'A maioria dos equipamentos de marca não deixa instalar nada, por isso não consegue enviar eventos. Falhas de palavra-passe feitas neles não aparecem aqui.'),
      h('p', null, 'O que podes fazer:'),
      h('ul', { class: 'faz' },
        h('li', null, 'Se o tens no Home Assistant, ', h('a', { href: `${aqui}&como=casa` }, 'liga-o por aí'), '.'),
        h('li', null, h('a', { href: '#/seguranca' }, 'Analisar a segurança'), ' para ver que portas tem abertas.'),
        h('li', null, h('a', { href: '#/' }, 'Procurar na rede'), ' para saber se está presente.')))));
  }

  const chave = chaves.get(id);
  const criar = async () => {
    if (d.hasKey && !(await confirmar('Substituir a chave?', 'A chave atual deixa de funcionar e o dispositivo precisa da nova.', 'Substituir'))) return;
    chaves.set(id, (await api('POST', `/dispositivos/${id}/chave`)).chave);
    await ctx.recarregar();
  };
  const remover = async () => {
    if (!(await confirmar('Remover a chave?', `${d.name} deixa de poder enviar eventos.`, 'Remover'))) return;
    await api('DELETE', `/dispositivos/${id}/chave`);
    chaves.delete(id);
    await ctx.recarregar();
  };
  const passoChave = passo(2, 'Cria a chave', chave
    ? [caixa(chave, 'Chave de eventos'), h('p', null, `${r.pedeChave ? 'Vais colá-la quando o passo 3 a pedir.' : 'Já está posta no código do passo 3.'} Guarda-a agora: depois de saíres não volta a aparecer. Não a partilhes, porque quem a tiver pode enviar eventos em nome deste dispositivo.`)]
    : d.hasKey
      ? [h('p', null, `Este dispositivo já tem chave. Se a guardaste, ${r.pedeChave ? 'cola-a quando o passo 3 a pedir' : `cola-a no lugar de ${SEM_CHAVE}`}. Se a perdeste, cria outra.`),
        h('div', { class: 'acoes' }, botao('Substituir chave', criar), botao('Remover chave', remover, 'perigo'))]
      : [h('p', null, 'É como uma palavra-passe só deste dispositivo.'), h('div', { class: 'acoes' }, botao('Criar chave', criar, 'cheio'))]);

  const passoCodigo = passo(3, `Põe o código: ${r.nome}`,
    local && servidor.soLocal && h('div', { class: 'nota' }, h('strong', null, 'Por agora, só este computador consegue enviar eventos'),
      h('p', null, 'Se o dispositivo é este computador, ignora este aviso. Para receber de outros: na pasta do projeto, põe a linha HOST=0.0.0.0 no ficheiro .env (cria-o se não existir), reinicia a CaraDBela e volta aqui. A firewall também tem de permitir a entrada, o que pode exigir um administrador do computador.')),
    h('div', { class: 'dura' }, h('strong', null, `${r.selo}. `), r.dura, ' A CaraDBela também tem de estar a correr: o que acontecer com ela desligada não fica registado.'),
    h('ol', { class: 'faz' }, r.onde.map((t) => h('li', null, t))),
    chave || d.hasKey ? caixa(r.codigo(url, chave || SEM_CHAVE), 'Código') : h('p', { class: 'suave' }, 'O código aparece aqui depois de criares a chave.'),
    h('p', null, h('strong', null, 'O que deteta: '), r.deteta),
    (chave || d.hasKey) && (r.extra || []).map(([titulo, texto, codigo]) => h('details', null, h('summary', null, titulo), h('div', { class: 'coluna' }, h('p', null, texto), caixa(codigo(url, chave || SEM_CHAVE), titulo)))),
    h('details', null, h('summary', null, 'Que eventos posso enviar?'), h('dl', { class: 'ficha' }, Object.entries(SIGNIFICADO).flatMap(([k, t]) => [h('dt', null, h('code', null, k)), h('dd', null, t)]))));

  const estado = h('div', { class: 'coluna', 'aria-live': 'polite' });
  let base; // o último evento que já existia quando a página abriu
  async function verificar() {
    const [[e], agora] = await Promise.all([api('GET', `/eventos?dispositivo=${id}`), api('GET', '/dispositivos').then((l) => l.find((x) => x._id === id))]);
    if (!agora) return;
    base ??= e?._id || '';
    const novo = e && e._id !== base;
    const ativa = vigia(agora) === 'ativa';
    const que = novo && `${EVENTOS[e.kind] || e.kind}${e.sourceIp ? ` de ${e.sourceIp}` : ''}.`;
    const diario = h('div', { class: 'acoes' }, h('a', { class: 'botao cheio', href: '#/diario' }, 'Ver no diário'));
    estado.replaceChildren(...[ativa
      ? [h('div', { class: 'chegou' }, cara(), h('div', { class: 'coluna' }, h('p', { class: 'fala' }, h('strong', null, 'A vigia está ativa.'), novo ? ` Chegou: ${que}` : ''),
        h('p', null, agora.watchesLogins ? 'Também vê as palavras-passe erradas.' : 'Não vê as palavras-passe erradas: esta conta não pode ler o registo de segurança.'),
        h('p', null, 'Para experimentares, bloqueia o computador (Windows + L) e volta a entrar.'))), diario]
      : novo && e.detail === 'Teste'
        ? [h('div', { class: 'nota' }, h('strong', null, 'A chave funciona, mas isto foi só um teste'), h('p', null, 'Este dispositivo ainda não está a ser vigiado. Segue o passo 3.'))]
        : novo
          ? [h('div', { class: 'chegou' }, cara(), h('div', { class: 'coluna' }, h('p', { class: 'fala' }, h('strong', null, 'Chegou! '), que), h('p', null, 'O evento já está no diário.'), h('p', null, r.dura))), diario]
          : [h('p', { class: 'fala' }, r.vigia ? 'À espera da vigia…' : 'À espera de um evento…'), vigia(agora) === 'parada' && h('p', { class: 'erro' }, `A vigia está parada. Último sinal: ${haQuanto(agora.watchedAt)}.`),
            e && h('p', { class: 'suave' }, `O último evento chegou: ${haQuanto(e.at)}.`), h('p', null, 'Deixa esta página aberta. A confirmação aparece aqui sozinha.')]].flat().filter(Boolean));
  }
  await verificar();
  let mostrado = false;
  const ouvir = () => {
    if (estado.isConnected) mostrado = true;
    if (estado.isConnected || !mostrado) verificar().catch(() => {});
    if (mostrado && !estado.isConnected) window.removeEventListener('evento-recebido', ouvir);
  };
  window.addEventListener('evento-recebido', ouvir);

  return h('div', { class: 'coluna media' }, topo, h('ol', { class: 'passos' }, escolha, passoChave, passoCodigo,
    passo(4, 'Confirma que chega', estado, h('details', null, h('summary', null, 'Não chega nada?'), h('ul', { class: 'faz' },
      h('li', null, '401: a chave está errada ou foi substituída.'),
      h('li', null, '403 ou 404: a CaraDBela está a correr uma versão antiga. Pára-a, arranca-a outra vez e recarrega esta página.'),
      h('li', null, '400: o tipo de evento não existe. Vê a lista no passo 3.'),
      h('li', null, 'Sem resposta: o dispositivo não alcança ', h('code', null, url), '. Confirma que estão na mesma rede, que a CaraDBela está a correr e que a firewall deixa entrar.'))))));
}
