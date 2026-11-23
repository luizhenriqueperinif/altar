const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { estadoInicial } = require('../src/main/conducao');
const { estadoParaRetomar, gravar, ler, PRAZO_MS, ARQUIVO } = require('../src/main/retomada');

const AGORA = 1_800_000_000_000;
const itens = {
  img: { id: 'img', tipo: 'imagem' },
  vid: { id: 'vid', tipo: 'video' },
  mus: { id: 'mus', tipo: 'musica', bibliotecaId: 'm1' },
  pal: { id: 'pal', tipo: 'palavra', passagens: [{ id: 'p1', ref: { l: 18, c: 23, v: 1 } }] },
  pre: { id: 'pre', tipo: 'pregacao', arquivos: ['a', 'b', 'c'] },
};
const ctx = (mais = {}) => ({
  reuniaoExiste: id => id === 'r1',
  item: (rid, iid) => (rid === 'r1' ? itens[iid] : undefined),
  musica: bid => (bid === 'm1' ? { id: 'm1' } : undefined),
  somDaEspera: () => null,
  versao: e => e.versao || 'ACF',
  versoes: ['ACF', 'ARC', 'NVI'],
  existe: (v, r) => r.v <= 6,
  partes: () => 2,
  ...mais,
});
const salvo = (estado, haMinutos = 1) => ({ quando: AGORA - haMinutos * 60000, estado: { ...estadoInicial(), reuniaoId: 'r1', ...estado } });
const retomar = (estado, haMinutos, mais) => estadoParaRetomar(salvo(estado, haMinutos), AGORA, ctx(mais));

test('retoma o versículo que estava na TV, com a versão e o volume', () => {
  const e = retomar({ tv: { tipo: 'avulso', ref: { l: 18, c: 23, v: 4 }, parte: 1 }, tvAntesAvulso: { tipo: 'item', itemId: 'img' }, versao: 'NVI', volume: 4 });
  assert.equal(e.reuniaoId, 'r1');
  assert.deepEqual(e.tv, { tipo: 'avulso', ref: { l: 18, c: 23, v: 4 }, parte: 1 });
  assert.deepEqual(e.tvAntesAvulso, { tipo: 'item', itemId: 'img' });   // "voltar para a reunião" continua funcionando
  assert.equal(e.versao, 'NVI');
  assert.equal(e.volume, 4);
});

test('só retoma se o programa estava aberto há pouco, e se a reunião ainda existe', () => {
  assert.ok(retomar({ tv: { tipo: 'item', itemId: 'img' } }, 29));
  assert.equal(retomar({ tv: { tipo: 'item', itemId: 'img' } }, 31), null);
  assert.equal(PRAZO_MS, 30 * 60000);
  assert.equal(estadoParaRetomar(salvo({ reuniaoId: 'apagada' }), AGORA, ctx()), null);
  assert.equal(estadoParaRetomar(salvo({ reuniaoId: null }), AGORA, ctx()), null);
  assert.equal(estadoParaRetomar({ quando: AGORA + 10 * 60000, estado: salvo({}).estado }, AGORA, ctx()), null);   // relógio mexido
  for (const lixo of [null, undefined, 'x', {}, { quando: AGORA }, { quando: 'ontem', estado: {} }]) assert.equal(estadoParaRetomar(lixo, AGORA, ctx()), null);
});

test('imagem, Palavra e pregação voltam como estavam; o que sumiu volta para a espera', () => {
  assert.deepEqual(retomar({ tv: { tipo: 'item', itemId: 'img' } }).tv, { tipo: 'item', itemId: 'img' });
  assert.deepEqual(retomar({ tv: { tipo: 'item', itemId: 'pal', passagemId: 'p1', ref: { l: 18, c: 23, v: 3 } } }).tv, { tipo: 'item', itemId: 'pal', passagemId: 'p1', ref: { l: 18, c: 23, v: 3 } });
  assert.deepEqual(retomar({ tv: { tipo: 'item', itemId: 'pre', slide: 2 } }).tv, { tipo: 'item', itemId: 'pre', slide: 2 });
  assert.deepEqual(retomar({ tv: { tipo: 'item', itemId: 'pre', slide: 9 } }).tv, { tipo: 'item', itemId: 'pre', slide: 2 });   // tiraram imagens
  assert.deepEqual(retomar({ tv: { tipo: 'item', itemId: 'tirado' } }).tv, { tipo: 'espera' });
  assert.deepEqual(retomar({ tv: { tipo: 'item', itemId: 'pal', passagemId: 'outra', ref: { l: 18, c: 23, v: 3 } } }).tv, { tipo: 'espera' });
  assert.deepEqual(retomar({ tv: { tipo: 'avulso', ref: { l: 18, c: 23, v: 99 } } }).tv, { tipo: 'espera' });   // versículo que não existe
  assert.deepEqual(retomar({ tv: { tipo: 'avulso', ref: { l: 18, c: 23, v: 2 }, parte: 7 } }).tv, { tipo: 'avulso', ref: { l: 18, c: 23, v: 2 } });
  assert.deepEqual(retomar({ tv: { tipo: 'qualquer' } }).tv, { tipo: 'espera' });
});

test('TV apagada continua apagada; janela do notebook volta para o que estava antes dela', () => {
  const e = retomar({ tv: { tipo: 'preto' }, tvAntesPreto: { tipo: 'item', itemId: 'img' } });
  assert.deepEqual(e.tv, { tipo: 'preto' });
  assert.deepEqual(e.tvAntesPreto, { tipo: 'item', itemId: 'img' });
  const j = retomar({ tv: { tipo: 'janela', fonteId: 'window:1', nome: 'YouTube' }, tvAntesJanela: { tipo: 'item', itemId: 'img' } });
  assert.deepEqual(j.tv, { tipo: 'item', itemId: 'img' });
  assert.equal(j.tvAntesJanela, null);
  assert.deepEqual(retomar({ tv: { tipo: 'janela', fonteId: 'window:1' } }).tv, { tipo: 'espera' });
});

test('vídeo e música voltam no ponto em que estavam', () => {
  const v = retomar({ tv: { tipo: 'item', itemId: 'vid' }, video: { itemId: 'vid', tocando: true, t: 83.5, dur: 300, terminou: false, inicio: 4 } });
  assert.deepEqual(v.video, { itemId: 'vid', tocando: true, t: 83.5, dur: 300, terminou: false, inicio: 4 });
  assert.equal(v.audio, null);
  // vídeo na TV sem o registro dele: começa parado, do início (a TV precisa do registro para mostrar)
  assert.deepEqual(retomar({ tv: { tipo: 'item', itemId: 'vid' } }).video, { itemId: 'vid', tocando: false, t: 0, dur: null, terminou: false, inicio: 1 });
  // vídeo por baixo de um versículo: fica parado, guardando o ponto
  const b = retomar({ tv: { tipo: 'avulso', ref: { l: 18, c: 23, v: 1 } }, tvAntesAvulso: { tipo: 'item', itemId: 'vid' }, video: { itemId: 'vid', tocando: false, t: 40, dur: 300, terminou: false, inicio: 2 } });
  assert.equal(b.video.t, 40);
  assert.equal(b.video.tocando, false);
  // música avulsa e música da reunião
  const m = retomar({ tv: { tipo: 'item', itemId: 'img' }, audio: { bibliotecaId: 'm1', itemId: null, tocando: true, t: 61, dur: 200, terminou: false, inicio: 3 } });
  assert.deepEqual(m.audio, { bibliotecaId: 'm1', itemId: null, tocando: true, t: 61, dur: 200, terminou: false, inicio: 3 });
  assert.equal(retomar({ audio: { bibliotecaId: 'm1', itemId: 'mus', tocando: false, t: 5, dur: 200, terminou: false, inicio: 1 } }).audio.itemId, 'mus');
  assert.equal(retomar({ audio: { bibliotecaId: 'apagada', itemId: null, tocando: true, t: 5, inicio: 1 } }).audio, null);
  assert.equal(retomar({ audio: { bibliotecaId: 'm1', itemId: 'tirado', tocando: true, t: 5, inicio: 1 } }).audio, null);
  assert.equal(retomar({ video: { itemId: 'vid', tocando: true, t: 9, inicio: 1 } }).video, null);   // o vídeo não está em tela nenhuma
});

test('som da tela de espera: volta só se a TV está na espera e o vídeo ainda toca com som', () => {
  const som = { bibliotecaId: 'v9', itemId: null, tocando: true, t: 700, dur: 3600, terminou: false, inicio: 1, espera: true, video: true };
  const e = retomar({ audio: som }, 1, { somDaEspera: () => 'v9' });
  assert.deepEqual(e.audio, som);
  assert.equal(retomar({ audio: som }, 1, { somDaEspera: () => 'outro' }).audio, null);
  assert.equal(retomar({ audio: som }).audio, null);
  // música da espera
  const mus = { bibliotecaId: 'm1', itemId: null, tocando: true, t: 12, dur: 200, terminou: false, inicio: 1, espera: true };
  assert.deepEqual(retomar({ audio: mus }).audio, mus);
  assert.equal(retomar({ tv: { tipo: 'item', itemId: 'img' }, audio: mus }).audio, null);
});

test('guarda no disco e esquece quando a reunião é encerrada', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-ret-'));
  assert.equal(ler(pasta), null);
  const e = { ...estadoInicial(), reuniaoId: 'r1', tv: { tipo: 'item', itemId: 'img' } };
  gravar(pasta, e, AGORA);
  assert.deepEqual(ler(pasta), { quando: AGORA, estado: e });
  assert.deepEqual(estadoParaRetomar(ler(pasta), AGORA + 5000, ctx()).tv, { tipo: 'item', itemId: 'img' });
  gravar(pasta, estadoInicial(), AGORA);
  assert.equal(fs.existsSync(path.join(pasta, ARQUIVO)), false);
  fs.writeFileSync(path.join(pasta, ARQUIVO), '{ estragado');
  assert.equal(ler(pasta), null);
});

test('o programa fecha e abre de novo: a reunião volta de onde parou; depois de muito tempo, não', async () => {
  const { Dados } = require('../src/main/dados');
  const { criarServidor } = require('../src/main/servidor');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-ret2-'));
  const d = new Dados(pasta);
  const r = d.criarReuniao({ data: d.hoje(), hora: '19:00' });
  let relogio = AGORA;
  const abrir = () => criarServidor({ dados: new Dados(pasta), agora: () => relogio });
  const s1 = abrir();
  assert.equal(s1.reuniaoAberta(), false);
  s1.fechar();
  // uma reunião aberta, guardada como o programa guarda
  gravar(pasta, { ...estadoInicial(5), reuniaoId: r.id, tv: { tipo: 'avulso', ref: { l: 43, c: 3, v: 16 } }, tvAntesAvulso: { tipo: 'espera' } }, relogio);
  relogio += 2 * 60000;
  const s2 = abrir();
  assert.equal(s2.reuniaoAberta(), true);            // voltou
  s2.fechar();                                        // fechar guarda de novo, com a hora de agora
  assert.equal(ler(pasta).quando, relogio);
  assert.deepEqual(ler(pasta).estado.tv, { tipo: 'avulso', ref: { l: 43, c: 3, v: 16 } });
  relogio += 31 * 60000;
  const s3 = abrir();
  assert.equal(s3.reuniaoAberta(), false);           // passou muito tempo: abre sem reunião
  s3.fechar();
  assert.equal(fs.existsSync(path.join(pasta, ARQUIVO)), true);   // sem reunião aberta e sem nada novo: não mexe no arquivo
});
