import { azulejo, cara, humor, icone, MAIS, marcasDe, mini, motivo, pecas, rotuloHora, tira, traco } from './azulejo.js';
import { api, avisar, botao, campo, confirmar, CONFIANCA, dataHora, dialogo, EVENTOS, formulario, h, haQuanto, presente, sev, tabela, vigia } from './util.js';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NUMEROS = ['', 'Uma', 'Duas', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez'];
const opcoes = (pares, atual) => pares.map(([v, t]) => h('option', { value: v, selected: v === atual }, t));
const topo = (titulo, ...acoes) => h('div', { class: 'topo' }, h('h1', null, titulo), h('div', { class: 'acoes' }, acoes));
const paginaNovo = (x = {}) => `#/dispositivo?${new URLSearchParams(Object.entries({ novo: '1', ...x }).filter(([, v]) => v))}`;
const ir = (destino) => { location.hash = destino; };
const resolver = async (a) => { await api('POST', `/alertas/${a._id}/resolver`); avisar('Alerta resolvido.'); };
const ficha = (pares) => h('dl', { class: 'ficha' }, pares.filter(([, v]) => v).map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
const eixo = (horas) => h('div', { class: 'eixo', 'aria-hidden': 'true' }, [0, 6, 12, 18].map((i) => h('span', null, rotuloHora(horas[i].hora))), h('span', null, 'agora'));
const pilulas = (nome, itens, atual) => h('div', { class: 'pilulas', role: 'group', 'aria-label': nome }, itens.map(([href, texto]) => h('a', { href, 'aria-current': texto === atual ? 'true' : null }, texto)));

function procurarNaRede(recarregar) {
  return botao('Procurar na rede', async () => {
    const r = await api('POST', '/rede/analisar');
    const novos = r.dispositivos.filter((d) => !d.deviceId);
    recarregar();
    dialogo(novos.length ? `${novos.length} por guardar em ${r.rede}` : 'Nada de novo na rede', (fechar) => [
      novos.length ? h('ul', { class: 'lista' }, novos.map((d) => h('li', null, mini('desconhecido', null),
        h('div', { class: 'cresce' }, h('strong', null, d.hostname || d.ip), h('p', { class: 'suave' }, [d.hostname && d.ip, d.mac || 'MAC desconhecido', d.estaMaquina && 'este computador'].filter(Boolean).join(', '))),
        botao('Adicionar', () => { fechar(); ir(paginaNovo({ ip: d.ip, mac: d.mac, nome: d.hostname, ssid: d.ssid })); }))))
        : h('p', null, `Os ${r.dispositivos.length} equipamentos ativos em ${r.rede} já estão guardados.`),
      h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'botao', onclick: fechar }, 'Fechar')),
    ]);
  }, 'cheio', 'A procurar…');
}

/* ---------- Casa ---------- */

let escolhido = null; // o azulejo aberto sobrevive às atualizações em direto

// Sem nada a vigiar, a ausência de alertas não quer dizer que está tudo bem.
const porLigar = (d) => !d.watchedAt && !d.eventAt;
function falta(d) {
  const texto = vigia(d) === 'parada' ? `A vigia não dá sinal (último: ${haQuanto(d.watchedAt)}). O dispositivo está desligado ou a vigia foi fechada: entretanto, nada é visto.`
    : !porLigar(d) ? null
      : d.hasKey ? 'Este dispositivo tem chave, mas ainda não está a ser vigiado.'
        : 'Este dispositivo não está ligado à CaraDBela: falhas de palavra-passe e acessos feitos nele não aparecem aqui.';
  return texto && h('div', { class: 'nota' }, h('p', null, texto), h('a', { class: 'botao cheio', href: `#/ligar?id=${d._id}` }, porLigar(d) ? 'Como ligar' : 'Ver a ligação'));
}
const estadoVigia = (d) => (vigia(d) ? `${vigia(d) === 'ativa' ? 'Ativa' : 'Parada'}${d.watchesLogins ? '' : ', sem palavras-passe erradas'}` : null);

function detalhe(p, horas, contagens, ctx, outros) {
  const d = p.d;
  const abrir = p.novo ? h('a', { class: 'botao cheio', href: paginaNovo(p.novo) }, 'Adicionar') : h('a', { class: 'botao', href: `#/dispositivo?id=${d._id}` }, 'Abrir');
  return [
    cara(humor(p.alertas)), h('h2', null, p.nome),
    p.alertas.length ? p.alertas.map((a, i) => h('div', { class: 'aviso' }, h('p', { class: 'fala' }, a.detail || a.title),
      h('p', null, sev(a.severity), h('span', { class: 'suave' }, ` ${haQuanto(a.lastAt)}${a.count > 1 ? `, ${a.count} vezes` : ''}`)),
      h('div', { class: 'acoes' }, botao('Resolver', async () => { await resolver(a); ctx.recarregar(); }, p.novo ? '' : 'cheio'), i === 0 && abrir)))
      : h('p', { class: 'fala' }, !presente(d) ? `Visto pela última vez: ${haQuanto(d.lastSeenAt)}.` : d.trust === 'desconhecido' ? 'Ainda não disseste se confias neste dispositivo.' : porLigar(d) || vigia(d) === 'parada' ? 'Sem alertas.' : 'Sem nada de estranho.'),
    !p.alertas.length && h('div', { class: 'acoes' }, abrir),
    d && falta(d),
    d && h('div', { class: 'bloco' }, h('h3', null, 'Últimas 24 horas'), tira(horas, contagens, marcasDe(p.alertas, horas)), eixo(horas)),
    ficha(d ? [['Endereço', d.ip], ['Confiança', CONFIANCA[d.trust || 'desconhecido']], ['Visto', haQuanto(d.lastSeenAt)], ['Vigia', estadoVigia(d)]] : [['Endereço', p.novo.ip], ['MAC', p.novo.mac]]),
    outros.length > 0 && h('div', { class: 'bloco outros' }, h('h3', null, 'Também por ver'), outros.slice(0, 4).map((a) => h('a', { href: '#/alertas' }, a.title))),
  ];
}

export async function inicio(ctx) {
  const [dispositivos, alertas, resumo] = await Promise.all([api('GET', '/dispositivos'), api('GET', '/alertas'), api('GET', '/resumo')]);
  const lista = pecas(dispositivos, alertas);
  const n = alertas.length;
  if (!lista.length) {
    return h('div', { class: 'estreia' }, cara(), h('h1', null, 'A tua parede está por azulejar'),
      h('p', { class: 'fala' }, 'Procura os equipamentos ligados à rede e guarda os que queres vigiar. Cada um passa a ser um azulejo.'),
      h('div', { class: 'acoes' }, procurarNaRede(ctx.recarregar), h('a', { class: 'botao', href: paginaNovo() }, 'Adicionar à mão')));
  }
  const atual = lista.find((p) => p.id === escolhido) || lista[0];
  const painel = h('aside', { class: 'painel lado', 'aria-live': 'polite' });
  const abrir = (p) => painel.replaceChildren(...[detalhe(p, resumo.horas, resumo.porDispositivo[p.d?._id] || Array(24).fill(0), ctx, alertas.filter((a) => !p.alertas.includes(a)))].flat(Infinity).filter(Boolean));
  const botoes = lista.map((p) => azulejo(p, {
    'aria-pressed': String(p === atual),
    onclick: (e) => {
      escolhido = p.id;
      botoes.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      abrir(p);
      if (window.matchMedia('(max-width: 64rem)').matches) painel.scrollIntoView({ block: 'start' });
    },
  }));
  abrir(atual);
  return h('div', { class: 'duas' },
    h('section', { class: 'cresce coluna', 'aria-label': 'Dispositivos' },
      topo(n ? `${NUMEROS[n] || n} ${n === 1 ? 'coisa' : 'coisas'} para veres` : dispositivos.every(porLigar) ? 'Sem eventos para vigiar' : 'Está tudo calmo', procurarNaRede(ctx.recarregar)),
      h('div', { class: 'parede' }, botoes,
        h('div', { class: 'azulejo z-cara', role: 'img', 'aria-label': { calma: 'A CaraDBela pisca o olho', atenta: 'A CaraDBela está atenta', aflita: 'A CaraDBela está aflita' }[humor(alertas)] }, cara(humor(alertas))),
        h('a', { class: 'azulejo z-mais', href: paginaNovo() }, traco(MAIS), h('strong', null, 'Adicionar à mão'))),
      h('p', { class: 'suave' }, `${dispositivos.filter(presente).length} de ${dispositivos.length} presentes. Com padrão: confiável. Azul vivo: isolado. Sem padrão: por classificar. Desbotado: ausente.`)),
    painel);
}

/* ---------- Dispositivo ---------- */

export async function dispositivo(ctx) {
  const id = ctx.parametros.get('id');
  const [tipos, lista, alertas] = await Promise.all([api('GET', '/tipos'), api('GET', '/dispositivos'), api('GET', '/alertas')]);
  const d = id ? lista.find((x) => x._id === id) : { ip: ctx.parametros.get('ip') || '', mac: ctx.parametros.get('mac') || '', name: ctx.parametros.get('nome') || '', ssid: ctx.parametros.get('ssid') };
  if (!d) throw new Error('Este dispositivo já não existe.');
  const p = id ? pecas([d], alertas.filter((a) => a.deviceId))[0] : { classe: 'desconhecido', estado: 'Novo', alertas: [] };
  const horario = d.schedule || {};
  const campos = [
    h('h2', null, 'Dados'),
    h('div', { class: 'par' },
      campo('Nome', h('input', { name: 'name', required: true, maxlength: 80, value: d.name || '' })),
      campo('Endereço IP', h('input', { name: 'ip', required: true, value: d.ip || '', placeholder: '192.168.1.20' })),
      campo('Endereço MAC', h('input', { name: 'mac', value: d.mac || '', placeholder: 'Opcional' })),
      campo('Tipo', h('select', { name: 'type' }, opcoes([['', 'Sem tipo'], ...tipos.map((t) => [t._id, t.name])], d.type?._id || '')))),
    h('fieldset', null, h('legend', null, 'Confiança'), h('div', { class: 'escolhas' }, Object.entries(CONFIANCA).map(([v, t]) => h('label', { class: 'escolha' }, h('input', { type: 'radio', name: 'trust', value: v, checked: v === (d.trust || 'desconhecido') }), t)))),
    h('fieldset', null, h('legend', null, 'Horário habitual'),
      h('label', { class: 'visto' }, h('input', { type: 'checkbox', name: 'enabled', checked: horario.enabled }), 'Alertar acessos fora deste horário'),
      h('div', { class: 'par horas' }, campo('Das', h('input', { type: 'time', name: 'start', required: true, value: horario.start || '08:00' })), campo('Até às', h('input', { type: 'time', name: 'end', required: true, value: horario.end || '23:00' }))),
      h('div', { class: 'escolhas' }, DIAS.map((nome, i) => h('label', { class: 'escolha' }, h('input', { type: 'checkbox', name: 'dia', value: i, checked: (horario.days || [0, 1, 2, 3, 4, 5, 6]).includes(i) }), nome)))),
  ];
  const enviar = async (f) => {
    const corpo = {
      name: f.get('name'), ip: f.get('ip'), mac: f.get('mac') || null, type: f.get('type') || null, trust: f.get('trust'),
      schedule: { enabled: f.has('enabled'), start: f.get('start'), end: f.get('end'), days: f.getAll('dia').map(Number) },
      ...(!id && d.ssid ? { ssid: d.ssid } : {}),
    };
    const guardado = await api(id ? 'PATCH' : 'POST', `/dispositivos${id ? `/${id}` : ''}`, corpo);
    avisar(id ? 'Alterações guardadas.' : 'Dispositivo adicionado.');
    escolhido = guardado._id;
    ir('#/');
  };
  const apagar = id && botao('Apagar dispositivo', async () => {
    if (!(await confirmar(`Apagar ${d.name}?`, 'Os eventos, alertas e análises deste dispositivo também são apagados.', 'Apagar'))) return;
    await api('DELETE', `/dispositivos/${id}`);
    avisar('Dispositivo apagado.');
    ir('#/');
  }, 'perigo');
  return h('div', { class: 'duas inversa' },
    h('section', { class: 'lado coluna' },
      h('a', { class: 'voltar', href: '#/' }, 'Voltar à casa'),
      h('div', { class: `azulejo grande z-${p.classe}` }, motivo(), icone(d.type), h('h1', null, d.name || 'Novo dispositivo'), h('span', { class: 'estado' }, p.estado)),
      id && botao('Analisar segurança', async () => { await api('POST', '/analises', { deviceId: id }); ir('#/seguranca'); }, d.hasKey ? 'cheio' : ''),
      id && h('a', { class: `botao${d.hasKey ? '' : ' cheio'}`, href: `#/ligar?id=${id}` }, d.hasKey ? 'Chave e ligação' : 'Ligar à CaraDBela')),
    h('section', { class: 'cresce coluna' },
      // Resolver não recarrega a página, para não perder o que está a ser escrito.
      p.alertas.map((a) => cartaoAlerta(a, (el) => el.remove(), d.type)),
      h('div', { class: 'painel' }, formulario({ campos, enviar, acao: id ? 'Guardar alterações' : 'Adicionar', extra: [apagar || h('a', { class: 'botao', href: '#/' }, 'Cancelar')] }))));
}

/* ---------- Alertas ---------- */

function cartaoAlerta(a, feito, tipo = null) {
  const el = h('article', { class: 'painel cartao' }, mini(['critica', 'alta'].includes(a.severity) ? 'mau' : 'medio', tipo),
    h('div', { class: 'cresce' }, h('h2', null, a.title), h('p', null, a.detail || ''),
      h('p', null, sev(a.severity), h('span', { class: 'suave' }, ` ${haQuanto(a.lastAt)}${a.count > 1 ? `, ${a.count} vezes` : ''}`))),
    feito && h('div', { class: 'acoes' }, botao('Resolver', async () => { await resolver(a); feito(el); }, 'cheio')));
  return el;
}

export async function alertas(ctx) {
  const resolvidos = ctx.parametros.get('estado') === 'resolvidos';
  const [lista, meus] = await Promise.all([api('GET', `/alertas?estado=${resolvidos ? 'resolvidos' : 'ativos'}`), api('GET', '/dispositivos')]);
  const tipoDe = (a) => meus.find((d) => d._id === a.deviceId?._id)?.type;
  return h('div', { class: 'coluna media' },
    topo('Alertas', pilulas('Estado', [['#/alertas', 'Por resolver'], ['#/alertas?estado=resolvidos', 'Resolvidos']], resolvidos ? 'Resolvidos' : 'Por resolver')),
    lista.length ? lista.map((a) => cartaoAlerta(a, resolvidos ? null : ctx.recarregar, tipoDe(a) || null))
      : h('div', { class: 'estreia' }, cara(), h('h2', null, resolvidos ? 'Ainda não resolveste nenhum alerta' : 'Está tudo calmo'), !resolvidos && h('p', { class: 'fala' }, 'Não há alertas por resolver.')));
}

/* ---------- Diário ---------- */

export async function diario(ctx) {
  const tipo = Object.hasOwn(EVENTOS, ctx.parametros.get('tipo')) ? ctx.parametros.get('tipo') : '';
  const [dispositivos, ativos, resumo] = await Promise.all([api('GET', '/dispositivos'), api('GET', '/alertas'), api('GET', `/resumo?tipo=${tipo}`)]);
  const { horas, porDispositivo } = resumo;
  const lista = pecas(dispositivos, ativos).filter((p) => p.d);
  const total = horas.reduce((n, x) => n + x.total, 0);
  const filtro = h('select', { 'aria-label': 'Tipo de evento', onchange: (e) => ir(`#/diario?tipo=${e.target.value}`) }, opcoes([['', 'Todos os eventos'], ...Object.entries(EVENTOS)], tipo));
  if (!lista.length) return h('div', { class: 'estreia' }, cara(), h('h1', null, 'O diário está em branco'), h('p', { class: 'fala' }, 'Guarda primeiro um dispositivo.'), h('a', { class: 'botao cheio', href: '#/' }, 'Ir para a casa'));

  const painel = h('aside', { class: 'painel lado', 'aria-live': 'polite' });
  let pedido = 0;
  async function abrir(p) {
    const meu = ++pedido;
    const eventos = await api('GET', `/eventos?${new URLSearchParams({ dispositivo: p.id, tipo })}`);
    if (meu !== pedido) return;
    painel.replaceChildren(...[cara(humor(p.alertas)), h('h2', null, p.nome), h('p', { class: 'fala' }, p.alertas[0]?.detail || 'Sem alertas por resolver.'), falta(p.d),
      h('div', { class: 'acoes' }, h('a', { class: 'botao cheio', href: `#/dispositivo?id=${p.id}` }, 'Abrir dispositivo')),
      h('div', { class: 'bloco' }, h('h3', null, 'Últimos eventos'), eventos.length
        ? h('ol', { class: 'eventos', tabindex: 0, 'aria-label': `Eventos de ${p.nome}` }, eventos.map((e) => h('li', null, h('strong', null, EVENTOS[e.kind] || e.kind), h('span', { class: 'suave' }, dataHora(e.at)), (e.sourceIp || e.sourceMac || e.detail) && h('p', null, [e.sourceIp || e.sourceMac, e.detail].filter(Boolean).join(', ')))))
        : h('p', { class: 'suave' }, 'Nenhum. Só aparecem os eventos que o dispositivo enviar com a sua chave.'))].filter(Boolean));
  }
  const atual = lista.find((p) => p.id === escolhido) || lista[0];
  const linhas = lista.map((p) => h('button', {
    type: 'button', id: `l-${p.id}`, class: 'linha', 'aria-pressed': String(p === atual),
    onclick: (e) => {
      escolhido = p.id;
      linhas.forEach((l) => l.setAttribute('aria-pressed', String(l === e.currentTarget)));
      abrir(p).catch((x) => avisar(x.message, true));
    },
  }, h('span', { class: 'quem' }, mini(p.classe, p.icone), h('span', null, h('strong', null, p.nome), h('span', { class: p.alertas.length ? 'erro' : 'suave' }, p.estado))),
  tira(horas, porDispositivo[p.id] || Array(24).fill(0), marcasDe(p.alertas, horas))));
  await abrir(atual);
  return h('div', { class: 'duas' },
    h('section', { class: 'cresce coluna' }, topo(`${total} ${total === 1 ? 'evento' : 'eventos'} em 24 horas`, filtro),
      h('div', { class: 'painel grelha', tabindex: 0, role: 'region', 'aria-label': 'Atividade por hora' }, h('div', { class: 'linhas' }, h('div', { class: 'linha cabeca' }, h('span', null), eixo(horas)), linhas)),
      h('div', { class: 'legenda suave' }, [['h0', 'Sem eventos'], ['h1', '1 a 2'], ['h3', '3 ou mais'], ['hm', 'Com alerta']].map(([c, t]) => h('span', null, h('i', { class: c }), t)))),
    painel);
}

/* ---------- Segurança ---------- */

function resultado(a) {
  if (a.status === 'a_correr') return h('p', { class: 'suave' }, 'A analisar. Pode demorar alguns minutos.');
  if (a.status === 'falhou') return h('p', { class: 'erro' }, a.error || 'A análise falhou.');
  const { ports = [], vulnerabilities = [], engine, checked, vulnChecked } = a.results || {};
  return [
    h('p', { class: 'suave' }, engine ? `${checked} portas verificadas${engine === 'basico' ? ' sem nmap (instala-o para ver versões)' : ' com nmap'}.` : 'Análise da versão anterior.'),
    ports.length ? tabela(['Porta', 'Serviço', 'Risco', 'Nota'], ports.map((p) => [String(p.number), [p.service, p.version].filter(Boolean).join(' '), p.risk ? sev(p.risk) : '', p.note || ''])) : h('p', null, 'Nenhuma porta aberta encontrada.'),
    vulnerabilities.length ? tabela(['Vulnerabilidade', 'Porta', 'Gravidade', 'CVSS'], vulnerabilities.slice(0, 50).map((v) => [v.exploit ? `${v.id} (há exploit)` : v.id, String(v.port ?? ''), v.severity ? sev(v.severity) : '', String(v.cvss ?? '')]))
      : h('p', { class: 'suave' }, vulnChecked ? 'Nenhuma vulnerabilidade conhecida nas versões detetadas.' : 'Vulnerabilidades conhecidas não foram procuradas.'),
  ];
}

export async function seguranca(ctx) {
  const [meus, analises] = await Promise.all([api('GET', '/dispositivos'), api('GET', '/analises')]);
  return h('div', { class: 'coluna media' }, topo('Segurança'),
    h('section', { class: 'painel cartao' }, cara(),
      h('div', { class: 'cresce coluna' }, h('h2', null, 'Que portas estão abertas?'), h('p', null, 'Escolhe um dispositivo e a CaraDBela vê que serviços ele mostra à rede.'),
        meus.length ? formulario({
          campos: campo('Dispositivo', h('select', { name: 'deviceId' }, opcoes(meus.map((d) => [d._id, `${d.name} (${d.ip})`])))),
          acao: 'Analisar', enviar: async (f) => { await api('POST', '/analises', { deviceId: f.get('deviceId') }); ctx.recarregar(); },
        }) : h('p', { class: 'suave' }, 'Guarda primeiro um dispositivo para o poderes analisar.'))),
    analises.map((a) => {
      const d = meus.find((x) => x._id === a.deviceId?._id);
      return h('section', { class: 'painel coluna' }, h('div', { class: 'quem' }, mini(d?.trust || 'desconhecido', d?.type ?? null), h('span', null, h('h2', null, a.deviceId?.name || a.ipScanned), h('span', { class: 'suave' }, `${a.ipScanned}, ${dataHora(a.timestamp)}`))), resultado(a));
    }));
}

/* ---------- Conta e administração ---------- */

export async function conta(ctx) {
  return h('div', { class: 'coluna estreita' }, topo('A tua conta', botao('Sair', ctx.sair)), h('section', { class: 'painel' }, formulario({
    campos: [
      h('h2', null, 'Mudar a palavra-passe'),
      campo('Palavra-passe atual', h('input', { type: 'password', name: 'atual', required: true, autocomplete: 'current-password' })),
      campo('Nova palavra-passe', h('input', { type: 'password', name: 'nova', required: true, minlength: 10, autocomplete: 'new-password' })),
    ],
    acao: 'Mudar palavra-passe',
    enviar: async (f) => { await api('PUT', '/auth/palavra-passe', { atual: f.get('atual'), nova: f.get('nova') }); avisar('Palavra-passe mudada. As outras sessões terminaram.'); ctx.recarregar(); },
  })));
}

const SECCOES = {
  async Utilizadores(ctx) {
    const users = await api('GET', '/admin/utilizadores');
    const alterar = async (u, corpo) => { await api('PATCH', `/admin/utilizadores/${u._id}`, corpo); ctx.recarregar(); };
    return [
      h('section', { class: 'painel' }, h('ul', { class: 'lista' }, users.map((u) => h('li', null, mini(u.disabled ? 'fora' : u.isAdmin ? 'isolado' : 'confiavel'),
        h('div', { class: 'cresce' }, h('strong', null, u.username), h('p', { class: 'suave' }, [u.isAdmin ? 'Administrador' : 'Utilizador', u.disabled && 'bloqueado', `${u.dispositivos} ${u.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}`].filter(Boolean).join(', '))),
        u._id === ctx.eu.id ? h('span', { class: 'suave' }, 'És tu') : h('div', { class: 'acoes' },
          botao(u.isAdmin ? 'Tirar administração' : 'Tornar administrador', () => alterar(u, { isAdmin: !u.isAdmin })),
          botao(u.disabled ? 'Desbloquear' : 'Bloquear', () => alterar(u, { disabled: !u.disabled })),
          botao('Apagar', async () => {
            if (!(await confirmar(`Apagar ${u.username}?`, 'Os dispositivos e todo o histórico desta conta são apagados.', 'Apagar'))) return;
            await api('DELETE', `/admin/utilizadores/${u._id}`);
            ctx.recarregar();
          }, 'perigo')))))),
      h('section', { class: 'painel' }, formulario({
        campos: [h('h2', null, 'Criar utilizador'), h('div', { class: 'par' }, campo('Nome', h('input', { name: 'username', required: true, autocomplete: 'off' })), campo('Palavra-passe', h('input', { type: 'password', name: 'password', required: true, minlength: 10, autocomplete: 'new-password' })))],
        acao: 'Criar utilizador', enviar: async (f) => { await api('POST', '/admin/utilizadores', { username: f.get('username'), password: f.get('password') }); avisar('Utilizador criado.'); ctx.recarregar(); },
      })),
    ];
  },
  async Tipos(ctx) {
    const tipos = await api('GET', '/tipos');
    return [
      h('section', { class: 'painel' }, tipos.length ? h('ul', { class: 'lista' }, tipos.map((t) => h('li', null, mini('confiavel', t), h('strong', { class: 'cresce' }, t.name), botao('Apagar', async () => {
        if (!(await confirmar(`Apagar o tipo ${t.name}?`, 'Os dispositivos deste tipo ficam sem tipo.', 'Apagar'))) return;
        await api('DELETE', `/tipos/${t._id}`);
        ctx.recarregar();
      }, 'perigo')))) : h('p', null, 'Ainda não há tipos.')),
      h('section', { class: 'painel' }, formulario({
        campos: [h('h2', null, 'Criar tipo'), h('div', { class: 'par' }, campo('Nome', h('input', { name: 'name', required: true, maxlength: 40 })), campo('Emoji, se não houver desenho', h('input', { name: 'icon', maxlength: 8 })))],
        acao: 'Criar tipo', enviar: async (f) => { await api('POST', '/tipos', { name: f.get('name'), icon: f.get('icon') }); ctx.recarregar(); },
      })),
    ];
  },
  async Bloqueios() {
    const abusos = await api('GET', '/admin/abusos');
    return h('section', { class: 'painel' }, tabela(['Quando', 'Utilizador', 'IP', 'Motivo'], abusos.map((a) => [dataHora(a.date), a.username || '', a.ip || '', a.reason || '']), [h('p', { class: 'suave' }, 'Nenhuma tentativa de entrada bloqueada.')]));
  },
  async 'Dispositivos de todos'() {
    const todos = await api('GET', '/admin/dispositivos');
    return h('section', { class: 'painel' }, tabela(['Dono', 'Nome', 'IP', 'MAC', 'Adicionado'], todos.map((d) => [d.username, d.name, d.ip || '', d.mac || 'Desconhecido', dataHora(d.addedAt)]), [h('p', { class: 'suave' }, 'Nenhum dispositivo guardado.')]));
  },
};

export async function administracao(ctx) {
  const nomes = Object.keys(SECCOES);
  const atual = nomes.find((n) => n === ctx.parametros.get('ver')) || nomes[0];
  return h('div', { class: 'coluna media' }, topo('Administração', pilulas('Secções', nomes.map((n) => [`#/administracao?${new URLSearchParams({ ver: n })}`, n]), atual)), await SECCOES[atual](ctx));
}
