import { config } from '../config.js';
import { Alert, Device } from '../models/index.js';
import { avisar, registarAlerta } from './alertas.js';
import { analisarRede } from './rede.js';

/** Atualiza IP e última presença dos dispositivos guardados, e devolve-os. */
export async function atualizarPresenca(userId, dispositivos) {
  const guardados = await Device.find({ userId });
  for (const d of guardados) {
    const visto = dispositivos.find((x) => (d.mac ? x.mac === d.mac : x.ip === d.ip));
    if (visto) await Device.updateOne({ _id: d._id }, { ip: visto.ip, lastSeenAt: new Date() });
  }
  return guardados;
}

export async function verificar(resultado) {
  for (const userId of await Device.distinct('userId')) {
    const guardados = await atualizarPresenca(userId, resultado.dispositivos);
    const conhecidos = new Set(guardados.map((d) => d.mac).filter(Boolean));
    for (const d of resultado.dispositivos) {
      if (!d.mac || d.estaMaquina || conhecidos.has(d.mac)) continue;
      const dedupeKey = `novo_na_rede:${d.mac}`;
      // Um alerta já resolvido significa "eu sei quem é": não voltar a incomodar.
      if (await Alert.exists({ userId, dedupeKey })) continue;
      await registarAlerta(userId, null, {
        rule: 'novo_na_rede', severity: 'media', dedupeKey,
        title: 'Equipamento novo na rede', detail: `${d.hostname || d.ip} (${d.mac}) ligou-se à rede.`,
      });
    }
    avisar(userId, 'rede');
  }
}

export function iniciarMonitor() {
  if (!config.monitorMinutos) return () => {};
  let parado = false;
  let relogio;
  const ciclo = async () => {
    try { await verificar(await analisarRede(config.rede)); } catch (e) { console.error('Monitor:', e.message); }
    if (!parado) relogio = setTimeout(ciclo, config.monitorMinutos * 60_000);
  };
  ciclo();
  return () => { parado = true; clearTimeout(relogio); };
}
