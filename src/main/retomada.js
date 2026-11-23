// Lembrar de onde a reunião parou: o programa guarda no disco o que está na TV e o que está tocando.
// Se ele fechar sem querer (ou o notebook reiniciar) e abrir de novo logo depois, a reunião volta
// como estava, em vez de recomeçar pela tela de espera.

const fs = require('fs');
const path = require('path');
const { estadoInicial, VOLUME_MAX } = require('./conducao');

const ARQUIVO = 'reuniao-aberta.json';
/** Só retoma se o programa estava aberto há pouco: depois disso, é outra reunião, e ele abre no "Seja bem-vindo". */
const PRAZO_MS = 30 * 60 * 1000;

/** Guarda o estado (com a hora). Sem reunião aberta, apaga o que estava guardado. */
function gravar(pasta, estado, agora = Date.now()) {
  const arq = path.join(pasta, ARQUIVO);
  try {
    if (!estado || !estado.reuniaoId) { fs.rmSync(arq, { force: true }); return; }
    fs.writeFileSync(arq + '.tmp', JSON.stringify({ quando: agora, estado }));
    fs.renameSync(arq + '.tmp', arq);
  } catch { /* não deu para gravar: só não retoma */ }
}

function ler(pasta) {
  try { return JSON.parse(fs.readFileSync(path.join(pasta, ARQUIVO), 'utf8')); } catch { return null; }
}

const inteiro = n => Number.isInteger(n);
const refValida = r => r && inteiro(r.l) && inteiro(r.c) && inteiro(r.v);
const tempo = n => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * O estado para retomar, ou null se não é para retomar (guardado há muito tempo, reunião apagada, arquivo estranho).
 * Confere tudo contra o que existe hoje: o que sumiu (item tirado, música apagada) volta para a tela de espera.
 * Vídeo e música voltam no ponto em que estavam.
 * @param {{quando:number, estado:object}|null} salvo
 * @param {number} agora
 * @param {object} ctx  o mesmo da condução (ver conducao.js)
 */
function estadoParaRetomar(salvo, agora, ctx) {
  if (!salvo || typeof salvo !== 'object' || typeof salvo.quando !== 'number' || !salvo.estado || typeof salvo.estado !== 'object') return null;
  const idade = agora - salvo.quando;
  if (idade > PRAZO_MS || idade < -60 * 1000) return null;
  const s = salvo.estado, rid = s.reuniaoId;
  if (typeof rid !== 'string' || !ctx.reuniaoExiste(rid)) return null;

  const volume = inteiro(s.volume) && s.volume >= 0 && s.volume <= VOLUME_MAX ? s.volume : undefined;
  const e = { ...estadoInicial(volume), reuniaoId: rid };
  if (ctx.versoes && ctx.versoes.includes(s.versao)) e.versao = s.versao;

  // O versículo ainda existe na versão que vale para aquela tela?
  const versiculo = tv => {
    if (!refValida(tv.ref)) return null;
    const ref = { l: tv.ref.l, c: tv.ref.c, v: tv.ref.v };
    const versao = ctx.versao({ ...e, tv: { ...tv, ref } });
    if (!ctx.existe(versao, ref)) return null;
    const partes = ctx.partes ? ctx.partes(versao, ref) : 1;
    return inteiro(tv.parte) && tv.parte > 0 && tv.parte < partes ? { ref, parte: tv.parte } : { ref };
  };
  // Uma tela guardada (a que estava na TV, ou a que estava por baixo): devolve limpa, ou null se não dá mais para mostrar.
  const tela = tv => {
    if (!tv || typeof tv !== 'object') return null;
    if (tv.tipo === 'espera') return { tipo: 'espera' };
    if (tv.tipo === 'avulso') { const v = versiculo(tv); return v ? { tipo: 'avulso', ...v } : null; }
    if (tv.tipo !== 'item') return null;   // janela do notebook: não dá para retomar
    const it = ctx.item(rid, tv.itemId);
    if (!it || it.tipo === 'musica') return null;
    if (it.tipo === 'palavra') {
      if (!it.passagens.some(p => p.id === tv.passagemId)) return null;
      const v = versiculo(tv);
      return v ? { tipo: 'item', itemId: it.id, passagemId: tv.passagemId, ...v } : null;
    }
    if (it.tipo === 'pregacao') {
      const ultimo = it.arquivos.length - 1;
      if (ultimo < 0) return null;
      return { tipo: 'item', itemId: it.id, slide: inteiro(tv.slide) ? Math.max(0, Math.min(ultimo, tv.slide)) : 0 };
    }
    return { tipo: 'item', itemId: it.id };
  };

  if (s.tv && s.tv.tipo === 'preto') { e.tv = { tipo: 'preto' }; e.tvAntesPreto = tela(s.tvAntesPreto); }
  else if (s.tv && s.tv.tipo === 'janela') e.tv = tela(s.tvAntesJanela) || { tipo: 'espera' };
  else e.tv = tela(s.tv) || { tipo: 'espera' };
  const porBaixo = tela(s.tvAntesAvulso);
  if (porBaixo && (e.tv.tipo === 'avulso' || (e.tvAntesPreto && e.tvAntesPreto.tipo === 'avulso'))) e.tvAntesAvulso = porBaixo;

  // Vídeo: volta no ponto em que estava (tocando ou parado, como estava).
  const telas = [e.tv, e.tvAntesPreto, e.tvAntesAvulso].filter(Boolean);
  const itemDeVideo = id => { const it = ctx.item(rid, id); return it && it.tipo === 'video' ? it : null; };
  const telaDeVideo = telas.find(t => t.tipo === 'item' && itemDeVideo(t.itemId));
  if (telaDeVideo) {
    const v = s.video && s.video.itemId === telaDeVideo.itemId ? s.video : null;
    e.video = v
      ? { itemId: v.itemId, tocando: !!v.tocando && !v.terminou && e.tv === telaDeVideo, t: tempo(v.t), dur: tempo(v.dur) || null, terminou: !!v.terminou, inicio: inteiro(v.inicio) ? v.inicio : 1 }
      : { itemId: telaDeVideo.itemId, tocando: false, t: 0, dur: null, terminou: false, inicio: 1 };
  }

  // Som: a música (ou o som da tela de espera) volta no ponto em que estava.
  const a = s.audio;
  if (a && typeof a === 'object' && typeof a.bibliotecaId === 'string' && !(e.video && e.tv === telaDeVideo)) {
    const som = { bibliotecaId: a.bibliotecaId, itemId: null, tocando: !!a.tocando && !a.terminou, t: tempo(a.t), dur: tempo(a.dur) || null, terminou: !!a.terminou, inicio: inteiro(a.inicio) ? a.inicio : 1 };
    const naEspera = e.tv.tipo === 'espera';
    if (a.video) {
      if (naEspera && ctx.somDaEspera && ctx.somDaEspera(rid) === a.bibliotecaId) e.audio = { ...som, espera: true, video: true };
    } else if (ctx.musica(a.bibliotecaId)) {
      if (a.espera) { if (naEspera) e.audio = { ...som, espera: true }; }
      else if (a.itemId == null) e.audio = som;
      else if (ctx.item(rid, a.itemId)) e.audio = { ...som, itemId: a.itemId };
    }
  }
  return e;
}

module.exports = { ARQUIVO, PRAZO_MS, gravar, ler, estadoParaRetomar };
