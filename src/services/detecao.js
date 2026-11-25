import { ipPrivado } from './rede.js';

export const JANELA_MS = 10 * 60_000;
export const LIMITE_FALHAS = 5;
export const LIMITE_RAJADA = 60;

function relogio(data, fuso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(data).map((x) => [x.type, x.value]));
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), agora: Number(p.hour) * 60 + Number(p.minute) };
}
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function dentroDoHorario(horario, data, fuso) {
  if (!horario?.enabled) return true;
  const { dia, agora } = relogio(data, fuso);
  const ini = minutos(horario.start);
  const fim = minutos(horario.end);
  if (ini === fim) return horario.days.includes(dia);
  if (ini < fim) return horario.days.includes(dia) && agora >= ini && agora < fim;
  // Atravessa a meia-noite: a madrugada pertence ao dia em que o período começou.
  if (agora >= ini) return horario.days.includes(dia);
  return agora < fim && horario.days.includes((dia + 6) % 7);
}

const origemDe = (e) => e.sourceIp || e.sourceMac || 'origem desconhecida';

/**
 * Avalia um evento. `recentes` são os eventos anteriores do mesmo dispositivo na janela.
 * Função pura: não toca na base de dados.
 */
export function avaliar({ evento, dispositivo, recentes, fuso }) {
  const alertas = [];
  const origem = origemDe(evento);
  const juntar = (rule, severity, title, detail, chave = origem) =>
    alertas.push({ rule, severity, title, detail, dedupeKey: `${rule}:${dispositivo._id}:${chave}` });
  const falhas = recentes.filter((e) => e.kind === 'login_falhado' && origemDe(e) === origem).length;
  const acesso = ['acesso', 'login_ok', 'login_falhado'].includes(evento.kind);
  const nome = dispositivo.name;

  if (evento.kind === 'login_falhado' && falhas + 1 >= LIMITE_FALHAS) {
    juntar('forca_bruta', 'alta', `${nome}: tentativas repetidas`, `${falhas + 1} falhas em 10 minutos a partir de ${origem}.`);
  }
  if (evento.kind === 'login_ok' && falhas >= LIMITE_FALHAS) {
    juntar('intrusao', 'critica', `${nome}: possível intrusão`, `Entrada bem-sucedida de ${origem} depois de ${falhas} falhas.`);
  }
  if (acesso && evento.sourceIp && !ipPrivado(evento.sourceIp)) {
    juntar('origem_externa', evento.kind === 'login_ok' ? 'alta' : 'media', `${nome}: acesso vindo de fora`, `O endereço ${origem} não pertence à tua rede.`);
  }
  if (acesso && !dentroDoHorario(dispositivo.schedule, evento.at, fuso)) {
    juntar('fora_de_horas', 'media', `${nome}: acesso fora de horas`, `Acesso de ${origem} fora do horário ${dispositivo.schedule.start}–${dispositivo.schedule.end}.`);
  }
  if (evento.kind === 'nao_autorizado') {
    juntar('nao_autorizado', 'alta', `${nome}: ligação recusada`, `${origem} tentou ligar-se sem autorização.`);
  }
  const ultimoMinuto = recentes.filter((e) => evento.at - e.at < 60_000).length + 1;
  if (ultimoMinuto >= LIMITE_RAJADA) {
    juntar('rajada', 'media', `${nome}: atividade anormal`, `${ultimoMinuto} eventos no último minuto.`, 'rajada');
  }
  return alertas;
}
