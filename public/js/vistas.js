import { carta } from './carta.js';
import { api, avisar, botao, campo, confirmar, CONFIANCA, dataHora, dialogo, EVENTOS, formulario, h, haQuanto, presente, s, sev, tabela } from './util.js';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const opcoes = (pares, atual) => pares.map(([v, t]) => h('option', { value: v, selected: v === atual }, t));
const topo = (titulo, ...acoes) => h('div', { class: 'topo' }, h('h1', null, titulo), h('div', { class: 'acoes' }, acoes));

/* ---------- Dispositivo: criar e editar ---------- */

async function editarDispositivo(d, recarregar) {
  const tipos = await api('GET', '/tipos');
  const horario = d.schedule || {};
  dialogo(d._id ? d.name : 'Adicionar dispositivo', (fechar) => {
    const campos = [
      campo('Nome', h('input', { name: 'name', required: true, maxlength: 80, value: d.name || '' })),
      h('div', { class: 'par' },
        campo('Endereço IP', h('input', { name: 'ip', required: true, value: d.ip || '', placeholder: '192.168.1.20' })),
        campo('Endereço MAC', h('input', { name: 'mac', value: d.mac || '', placeholder: 'Opcional' }))),
      h('div', { class: 'par' },
        campo('Tipo', h('select', { name: 'type' }, opcoes([['', 'Sem tipo'], ...tipos.map((t) => [t._id, `${t.icon || ''} ${t.name}`])], d.type?._id || ''))),
        campo('Confiança', h('select', { name: 'trust' }, opcoes(Object.entries(CONFIANCA), d.trust || 'desconhecido')))),
      h('fieldset', null, h('legend', null, 'Horário habitual'),
        h('label', { class: 'visto' }, h('input', { type: 'checkbox', name: 'enabled', checked: horario.enabled }), 'Alertar acessos fora deste horário'),
        h('div', { class: 'par' }, campo('Das', h('input', { type: 'time', name: 'start', required: true, value: horario.start || '08:00' })), campo('Até às', h('input', { type: 'time', name: 'end', required: true, value: horario.end || '23:00' }))),
        h('div', { class: 'dias' }, DIAS.map((n, i) => h('label', { class: 'visto' }, h('input', { type: 'checkbox', name: 'dia', value: i, checked: (horario.days || [0, 1, 2, 3, 4, 5, 6]).includes(i) }), n)))),
    ];
    const enviar = async (f) => {
      const corpo = {
        name: f.get('name'), ip: f.get('ip'), mac: f.get('mac') || null, type: f.get('type') || null, trust: f.get('trust'),
        schedule: { enabled: f.has('enabled'), start: f.get('start'), end: f.get('end'), days: f.getAll('dia').map(Number) },
        ...(d.ssid && !d._id ? { ssid: d.ssid } : {}),
      };
      await api(d._id ? 'PATCH' : 'POST', `/dispositivos${d._id ? `/${d._id}` : ''}`, corpo);
      fechar();
      avisar(d._id ? 'Alterações guardadas.' : 'Dispositivo adicionado.');
      recarregar();
    };
    const extra = [h('button', { type: 'button', class: 'botao', onclick: fechar }, 'Cancelar')];
    if (d._id) {
      extra.push(botao('Chave de eventos', async () => {
        if (d.hasKey && !(await confirmar('Substituir a chave?', 'A chave atual deixa de funcionar e o dispositivo precisa da nova.', 'Substituir'))) return;
        const { chave } = await api('POST', `/dispositivos/${d._id}/chave`);
        d.hasKey = true;
        mostrarChave(chave);
      }), botao('Apagar', async () => {
        if (!(await confirmar(`Apagar ${d.name}?`, 'Os eventos, alertas e análises deste dispositivo também são apagados.', 'Apagar'))) return;
        await api('DELETE', `/dispositivos/${d._id}`);
        fechar();
        avisar('Dispositivo apagado.');
        recarregar();
      }, 'perigo'));
    }
    return formulario({ campos, enviar, acao: d._id ? 'Guardar alterações' : 'Adicionar', extra });
  });
}

function mostrarChave(chave) {
  const exemplo = `curl -X POST ${location.origin}/api/receber -H "Authorization: Bearer ${chave}" -H "Content-Type: application/json" -d '{"tipo":"login_falhado","origemIp":"192.168.1.50"}'`;
  dialogo('Chave de eventos', (fechar) => h('form', null,
    h('p', null, 'Copia a chave agora: não volta a ser mostrada. O dispositivo usa-a para enviar eventos.'),
    h('code', { class: 'chave' }, chave), h('p', null, 'Exemplo:'), h('code', { class: 'chave' }, exemplo),
    h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'botao cheio', onclick: fechar }, 'Já copiei'))));
}

function procurarNaRede(recarregar) {
  return botao('Procurar na rede', async () => {
    const r = await api('POST', '/rede/analisar');
    const novos = r.dispositivos.filter((d) => !d.deviceId);
    recarregar();
    dialogo(novos.length ? `${novos.length} por guardar em ${r.rede}` : 'Nada de novo na rede', (fechar) => [
      novos.length ? tabela(['Equipamento', 'MAC', ''], novos.map((d) => [
        h('span', null, d.hostname || d.ip, d.hostname ? h('span', { class: 'suave' }, ` ${d.ip}`) : '', d.estaMaquina ? ' (este computador)' : ''), d.mac || 'Desconhecido',
        botao('Adicionar', () => { fechar(); return editarDispositivo({ ip: d.ip, mac: d.mac, name: d.hostname || '', ssid: d.ssid }, recarregar); }),
      ])) : h('p', null, `Os ${r.dispositivos.length} equipamentos ativos em ${r.rede} já estão guardados.`),
      h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'botao', onclick: fechar }, 'Fechar')),
    ]);
  }, 'cheio', 'A procurar…');
}

/* ---------- Peças partilhadas ---------- */

function listaAlertas(alertas, recarregar, resolvidos = false) {
  return h('ul', { class: 'alertas' }, alertas.map((a) => h('li', null,
    h('div', null, sev(a.severity), h('span', { class: 'suave' }, ` ${haQuanto(a.lastAt)}${a.count > 1 ? `, ${a.count} vezes` : ''}`)),
    h('h3', null, a.title), h('p', null, a.detail || ''),
    !resolvidos && botao('Resolver', async () => { await api('POST', `/alertas/${a._id}/resolver`); avisar('Alerta resolvido.'); recarregar(); }))));
}

function graficoHoras(horas) {
  const L = 960, A = 170, base = A - 26, max = Math.max(1, ...horas.map((x) => x.total));
  const passo = L / horas.length;
  const rotulo = (d) => `${String(new Date(d).getHours()).padStart(2, '0')}h`;
  const dica = h('div', { class: 'dica', hidden: true });
  const svg = s('svg', { viewBox: `0 0 ${L} ${A}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Eventos por hora nas últimas 24 horas' });
  horas.forEach((x, i) => {
    const alt = (x.total / max) * (base - 12);
    const x0 = i * passo + passo / 2 - 8;
    const mostrar = () => { dica.textContent = `${rotulo(x.hora)}: ${x.total} ${x.total === 1 ? 'evento' : 'eventos'}`; dica.style.left = `${Math.min(92, Math.max(8, ((i + 0.5) / horas.length) * 100))}%`; dica.hidden = false; };
    svg.append(s('rect', { class: 'alvo', x: i * passo, y: 0, width: passo, height: base, onmouseenter: mostrar, onmouseleave: () => { dica.hidden = true; } }));
    const r = Math.min(4, alt);
    if (alt) svg.append(s('path', { class: 'barra', 'pointer-events': 'none', d: `M${x0},${base}V${base - alt + r}q0,${-r} ${r},${-r}h${16 - 2 * r}q${r},0 ${r},${r}V${base}z` }));
  });
  svg.append(s('line', { class: 'base', x1: 0, x2: L, y1: base, y2: base }));
  const eixo = h('div', { class: 'eixo suave' }, horas.filter((_, i) => i % 6 === 0).map((x) => h('span', null, rotulo(x.hora))), h('span', null, 'agora'));
  return h('div', { class: 'grafico' }, dica, svg, eixo, h('details', null, h('summary', null, 'Ver em tabela'),
    tabela(['Hora', 'Eventos'], horas.map((x) => [rotulo(x.hora), String(x.total)]))));
}

/* ---------- Páginas ---------- */

export async function inicio(ctx) {
  const [dispositivos, alertas, resumo] = await Promise.all([api('GET', '/dispositivos'), api('GET', '/alertas'), api('GET', '/resumo')]);
  const alarmes = new Set(alertas.filter((a) => a.deviceId).map((a) => a.deviceId._id));
  const total = resumo.horas.reduce((n, x) => n + x.total, 0);
  const presentes = dispositivos.filter(presente).length;
  return [
    topo('A tua rede', procurarNaRede(ctx.recarregar)),
    h('div', { class: 'mesa' },
      h('section', { class: 'carta' },
        dispositivos.length ? carta(dispositivos, alarmes, (d) => editarDispositivo(d, ctx.recarregar).catch((e) => avisar(e.message, true)))
          : h('div', { class: 'vazio' }, h('h2', null, 'A carta ainda está em branco'), h('p', null, 'Procura os equipamentos ligados à rede e guarda os que queres vigiar.')),
        h('div', { class: 'legenda' }, h('span', null, `${presentes} de ${dispositivos.length} presentes`), h('span', null, 'Anel interior: confiáveis'), h('span', null, 'Anel do meio: isolados'), h('span', null, 'Anel exterior: por classificar'), h('span', null, 'Tracejado: ausente'))),
      h('section', { class: 'diario' }, h('h2', null, alertas.length ? `${alertas.length} ${alertas.length === 1 ? 'alerta' : 'alertas'} por resolver` : 'Mar calmo'),
        alertas.length ? listaAlertas(alertas.slice(0, 4), ctx.recarregar) : h('div', { class: 'vazio' }, h('p', null, 'Nenhum alerta por resolver.')),
        alertas.length > 4 && h('div', { class: 'vazio' }, h('a', { href: '#/alertas' }, 'Ver todos os alertas')))),
    h('section', { class: 'painel' }, h('h2', null, `${total} ${total === 1 ? 'evento' : 'eventos'} em 24 horas`),
      total ? graficoHoras(resumo.horas) : h('p', { class: 'suave' }, 'Os eventos aparecem aqui quando um dispositivo os enviar com a sua chave. Cria a chave ao abrir um dispositivo.')),
  ];
}

export async function dispositivos(ctx) {
  const lista = await api('GET', '/dispositivos');
  return [
    topo('Dispositivos', procurarNaRede(ctx.recarregar), botao('Adicionar à mão', () => editarDispositivo({}, ctx.recarregar))),
    h('section', { class: 'painel rente' }, tabela(['Nome', 'IP', 'MAC', 'Confiança', 'Visto', ''], lista.map((d) => [
      h('span', { class: 'nowrap' }, `${d.type?.icon || ''} ${d.name}`), d.ip || '', h('span', { class: 'nowrap' }, d.mac || 'Desconhecido'), CONFIANCA[d.trust || 'desconhecido'], haQuanto(d.lastSeenAt),
      botao('Abrir', () => editarDispositivo(d, ctx.recarregar)),
    ]), [h('p', null, 'Ainda não há dispositivos guardados. Procura na rede para começar.')])),
  ];
}

export async function alertas(ctx) {
  const estado = ctx.parametros.get('estado') === 'resolvidos' ? 'resolvidos' : 'ativos';
  const lista = await api('GET', `/alertas?estado=${estado}`);
  const filtro = h('select', { 'aria-label': 'Estado', onchange: (e) => { location.hash = `#/alertas?estado=${e.target.value}`; } }, opcoes([['ativos', 'Por resolver'], ['resolvidos', 'Resolvidos']], estado));
  return [topo('Alertas', h('div', { class: 'filtros' }, filtro)), h('section', { class: 'painel rente' },
    lista.length ? listaAlertas(lista, ctx.recarregar, estado === 'resolvidos') : h('div', { class: 'vazio' }, h('p', null, estado === 'ativos' ? 'Nenhum alerta por resolver.' : 'Ainda não resolveste nenhum alerta.')))];
}

export async function eventos(ctx) {
  const dispositivo = ctx.parametros.get('dispositivo') || '';
  const tipo = ctx.parametros.get('tipo') || '';
  const [lista, meus] = await Promise.all([api('GET', `/eventos?${new URLSearchParams({ dispositivo, tipo })}`), api('GET', '/dispositivos')]);
  const mudar = (k) => (e) => { const p = new URLSearchParams({ dispositivo, tipo, [k]: e.target.value }); location.hash = `#/eventos?${p}`; };
  return [
    topo('Eventos', h('div', { class: 'filtros' },
      h('select', { 'aria-label': 'Dispositivo', onchange: mudar('dispositivo') }, opcoes([['', 'Todos os dispositivos'], ...meus.map((d) => [d._id, d.name])], dispositivo)),
      h('select', { 'aria-label': 'Tipo de evento', onchange: mudar('tipo') }, opcoes([['', 'Todos os eventos'], ...Object.entries(EVENTOS)], tipo)))),
    h('section', { class: 'painel rente' }, tabela(['Quando', 'Dispositivo', 'Evento', 'Origem', 'Detalhe'], lista.map((e) => [
      h('span', { class: 'nowrap' }, dataHora(e.at)), e.deviceId?.name || 'Apagado', EVENTOS[e.kind] || e.kind, e.sourceIp || e.sourceMac || '', e.detail || '',
    ]), [h('p', null, 'Nenhum evento com estes filtros.')])),
  ];
}

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
  return [
    topo('Segurança'),
    meus.length ? h('section', { class: 'painel' }, h('h2', null, 'Analisar um dispositivo'), formulario({
      campos: campo('Dispositivo', h('select', { name: 'deviceId' }, opcoes(meus.map((d) => [d._id, `${d.name} (${d.ip})`])))),
      acao: 'Analisar', enviar: async (f) => { await api('POST', '/analises', { deviceId: f.get('deviceId') }); ctx.recarregar(); },
    })) : h('section', { class: 'painel' }, h('p', null, 'Guarda primeiro um dispositivo para o poderes analisar.')),
    analises.map((a) => h('section', { class: 'painel' }, h('h2', null, a.deviceId?.name || a.ipScanned), h('p', { class: 'suave' }, `${a.ipScanned}, ${dataHora(a.timestamp)}`), resultado(a))),
  ];
}

export async function conta(ctx) {
  return [topo('A tua conta'), h('section', { class: 'painel' }, h('h2', null, 'Mudar a palavra-passe'), formulario({
    campos: [
      campo('Palavra-passe atual', h('input', { type: 'password', name: 'atual', required: true, autocomplete: 'current-password' })),
      campo('Nova palavra-passe', h('input', { type: 'password', name: 'nova', required: true, minlength: 10, autocomplete: 'new-password' })),
    ],
    acao: 'Mudar palavra-passe',
    enviar: async (f) => { await api('PUT', '/auth/palavra-passe', { atual: f.get('atual'), nova: f.get('nova') }); avisar('Palavra-passe mudada. As outras sessões terminaram.'); ctx.recarregar(); },
  }))];
}

export async function administracao(ctx) {
  const [users, todos, abusos, tipos] = await Promise.all([api('GET', '/admin/utilizadores'), api('GET', '/admin/dispositivos'), api('GET', '/admin/abusos'), api('GET', '/tipos')]);
  const alterar = async (u, corpo) => { await api('PATCH', `/admin/utilizadores/${u._id}`, corpo); ctx.recarregar(); };
  return [
    topo('Administração'),
    h('section', { class: 'painel' }, h('h2', null, 'Utilizadores'), tabela(['Nome', 'Papel', 'Dispositivos', ''], users.map((u) => [
      u.username + (u.disabled ? ' (bloqueado)' : ''), u.isAdmin ? 'Administrador' : 'Utilizador', String(u.dispositivos),
      u._id === ctx.eu.id ? 'És tu' : h('div', { class: 'acoes' },
        botao(u.isAdmin ? 'Tirar administração' : 'Tornar administrador', () => alterar(u, { isAdmin: !u.isAdmin })),
        botao(u.disabled ? 'Desbloquear' : 'Bloquear', () => alterar(u, { disabled: !u.disabled })),
        botao('Apagar', async () => {
          if (!(await confirmar(`Apagar ${u.username}?`, 'Os dispositivos e todo o histórico desta conta são apagados.', 'Apagar'))) return;
          await api('DELETE', `/admin/utilizadores/${u._id}`);
          ctx.recarregar();
        }, 'perigo')),
    ]))),
    h('section', { class: 'painel' }, h('h2', null, 'Criar utilizador'), formulario({
      campos: h('div', { class: 'par' }, campo('Nome', h('input', { name: 'username', required: true, autocomplete: 'off' })), campo('Palavra-passe', h('input', { type: 'password', name: 'password', required: true, minlength: 10, autocomplete: 'new-password' }))),
      acao: 'Criar utilizador', enviar: async (f) => { await api('POST', '/admin/utilizadores', { username: f.get('username'), password: f.get('password') }); avisar('Utilizador criado.'); ctx.recarregar(); },
    })),
    h('section', { class: 'painel' }, h('h2', null, 'Tipos de dispositivo'), tabela(['Tipo', ''], tipos.map((t) => [`${t.icon || ''} ${t.name}`, botao('Apagar', async () => {
      if (!(await confirmar(`Apagar o tipo ${t.name}?`, 'Os dispositivos deste tipo ficam sem tipo.', 'Apagar'))) return;
      await api('DELETE', `/tipos/${t._id}`);
      ctx.recarregar();
    }, 'perigo')]), [h('p', null, 'Ainda não há tipos.')]), formulario({
      campos: h('div', { class: 'par' }, campo('Novo tipo', h('input', { name: 'name', required: true, maxlength: 40 })), campo('Emoji', h('input', { name: 'icon', maxlength: 8 }))),
      acao: 'Criar tipo', enviar: async (f) => { await api('POST', '/tipos', { name: f.get('name'), icon: f.get('icon') }); ctx.recarregar(); },
    })),
    h('section', { class: 'painel' }, h('h2', null, 'Tentativas de entrada bloqueadas'), tabela(['Quando', 'Utilizador', 'IP', 'Motivo'], abusos.map((a) => [dataHora(a.date), a.username || '', a.ip || '', a.reason || '']), [h('p', { class: 'suave' }, 'Nenhuma até agora.')])),
    h('section', { class: 'painel' }, h('h2', null, 'Dispositivos de todos'), tabela(['Dono', 'Nome', 'IP', 'MAC', 'Adicionado'], todos.map((d) => [d.username, d.name, d.ip || '', d.mac || 'Desconhecido', dataHora(d.addedAt)]), [h('p', { class: 'suave' }, 'Nenhum dispositivo guardado.')])),
  ];
}
