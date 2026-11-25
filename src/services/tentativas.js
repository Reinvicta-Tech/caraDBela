/** Trava logins repetidos por origem+utilizador: 5 falhas → 1 min, 10 ou mais → 5 min. */
export class Tentativas {
  #mapa = new Map();

  constructor(agora = Date.now, maximo = 5000) { this.agora = agora; this.maximo = maximo; }

  espera(chave) {
    const e = this.#mapa.get(chave);
    return e && e.ate > this.agora() ? Math.ceil((e.ate - this.agora()) / 1000) : 0;
  }

  falhou(chave) {
    const t = this.agora();
    let e = this.#mapa.get(chave);
    if (!e || t - e.ultima > 30 * 60_000) e = { n: 0, ate: 0, ultima: t };
    e.n += 1;
    e.ultima = t;
    const min = e.n >= 10 ? 5 : e.n === 5 ? 1 : 0;
    if (min) e.ate = t + min * 60_000;
    this.#mapa.delete(chave);
    this.#mapa.set(chave, e);
    if (this.#mapa.size > this.maximo) this.#mapa.delete(this.#mapa.keys().next().value);
    return { falhas: e.n, bloqueioMin: min };
  }

  limpar(chave) { this.#mapa.delete(chave); }
}
