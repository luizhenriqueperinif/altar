const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { teclaPara, numeroDaJanela } = require('../src/main/teclas');
const { Dados } = require('../src/main/dados');
const { criarServidor } = require('../src/main/servidor');

test('teclas da janela: no YouTube K, J e L; nos outros espaço e setas', () => {
  const yt = 'Testemunho - YouTube';
  assert.equal(teclaPara('playPausa', yt), 0x4b);
  assert.equal(teclaPara('voltar', yt), 0x4a);
  assert.equal(teclaPara('avancar', yt), 0x4c);
  // Telegram: as setas trocam de vídeo, então só tocar/pausar.
  assert.equal(teclaPara('playPausa', 'Media viewer'), 0x20);
  assert.equal(teclaPara('voltar', 'Media viewer'), null);
  assert.equal(teclaPara('avancar', 'Telegram Web - Google Chrome'), null);
  assert.equal(teclaPara('voltar', 'Culto - VLC'), 0x25);
  assert.equal(teclaPara('avancar', 'Culto - VLC'), 0x27);
  assert.equal(teclaPara('apagarTudo', yt), null);
  assert.equal(numeroDaJanela('window:460550:0'), '460550');
  assert.equal(numeroDaJanela('screen:0:0'), null);
  assert.equal(numeroDaJanela('window:1;calc:0'), null);
});

test('celular pede as janelas e só mexe na que está na TV', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-teclas-'));
  const d = new Dados(pasta); d.config.porta = 7600 + Math.floor(Math.random() * 300);
  const apertos = [];
  const janelas = {
    listar: async () => [{ id: 'window:42:0', nome: 'Vídeo - YouTube', miniatura: 'data:,' }],
    apertar: async (fonteId, nome, acao) => { apertos.push([fonteId, nome, acao]); return 'ok'; },
  };
  const s = criarServidor({ dados: d, janelas }); await s.iniciar();
  const ws = new WebSocket(`ws://127.0.0.1:${d.config.porta}/ws?t=${s.token}&papel=controle`);
  const recebidos = [];
  ws.on('message', m => recebidos.push(JSON.parse(m)));
  await new Promise(ok => ws.on('open', ok));
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  const manda = c => ws.send(JSON.stringify(c));

  manda({ cmd: 'pedirJanelas' }); await espera(150);
  assert.deepEqual(recebidos.find(m => m.tipo === 'janelas').lista.map(j => j.nome), ['Vídeo - YouTube']);

  // Sem janela na TV, não aperta nada.
  manda({ cmd: 'teclaJanela', acao: 'playPausa' }); await espera(150);
  assert.equal(apertos.length, 0);

  manda({ cmd: 'mostrarJanela', fonteId: 'window:42:0', nome: 'Vídeo - YouTube' }); await espera(150);
  manda({ cmd: 'teclaJanela', acao: 'avancar' });
  manda({ cmd: 'teclaJanela', acao: 'desligarPC' }); // botão que não existe: ignora
  await espera(150);
  assert.deepEqual(apertos, [['window:42:0', 'Vídeo - YouTube', 'avancar']]);
  assert.equal(recebidos.filter(m => m.tipo === 'tecla').length, 1);

  ws.close(); s.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('volume da janela: o que o notebook responde vira nível de 0 a 10 ou o motivo de não ter dado', () => {
  const { lerVolume } = require('../src/main/teclas');
  assert.deepEqual(lerVolume('v7'), { nivel: 7 });
  assert.deepEqual(lerVolume('v0'), { nivel: 0 });
  assert.deepEqual(lerVolume('v10'), { nivel: 10 });
  assert.deepEqual(lerVolume('semsom'), { erro: 'semsom' });
  assert.deepEqual(lerVolume('fechada'), { erro: 'fechada' });
  assert.deepEqual(lerVolume('v11'), { erro: 'erro' });
  assert.deepEqual(lerVolume('qualquer coisa'), { erro: 'erro' });
});

test('celular aumenta e diminui o volume da janela que está na TV', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-volume-'));
  const d = new Dados(pasta); d.config.porta = 7600 + Math.floor(Math.random() * 300);
  let nivel = null;   // null: o programa ainda não tocou nada
  const pedidos = [];
  const janelas = {
    listar: async () => [],
    apertar: async () => 'ok',
    volume: async (fonteId, passo) => {
      pedidos.push([fonteId, passo]);
      if (nivel == null) return { erro: 'semsom' };
      nivel = Math.max(0, Math.min(10, nivel + passo));
      return { nivel };
    },
  };
  const s = criarServidor({ dados: d, janelas }); await s.iniciar();
  const ws = new WebSocket(`ws://127.0.0.1:${d.config.porta}/ws?t=${s.token}&papel=controle`);
  const recebidos = [];
  ws.on('message', m => recebidos.push(JSON.parse(m)));
  await new Promise(ok => ws.on('open', ok));
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  const manda = c => ws.send(JSON.stringify(c));
  const volumeNoCelular = () => recebidos.filter(m => m.tipo === 'estado').pop().info.volumeJanela;

  // Sem janela na TV, não mexe em volume nenhum.
  manda({ cmd: 'volumeJanela', delta: 1 }); await espera(120);
  assert.equal(pedidos.length, 0);

  // A janela vai para a TV: o servidor lê o volume, mas o programa ainda está calado.
  manda({ cmd: 'mostrarJanela', fonteId: 'window:42:0', nome: 'Vídeo - YouTube' }); await espera(150);
  assert.deepEqual(pedidos, [['window:42:0', 0]]);
  assert.equal(volumeNoCelular(), null);
  manda({ cmd: 'volumeJanela', delta: 1 }); await espera(120);
  assert.equal(recebidos.filter(m => m.tipo === 'tecla').pop().resultado, 'semsom');

  // Começou a tocar: agora os botões mudam o volume, um passo por toque (mesmo que o celular mande mais).
  nivel = 7;
  manda({ cmd: 'volumeJanela', delta: -1 }); await espera(120);
  assert.equal(volumeNoCelular(), 6);
  assert.equal(recebidos.filter(m => m.tipo === 'tecla').pop().resultado, 'ok');
  manda({ cmd: 'volumeJanela', delta: 50 }); await espera(120);
  assert.equal(volumeNoCelular(), 7);

  // Saiu da TV: o volume da janela some do celular.
  manda({ cmd: 'sairJanela' }); await espera(120);
  assert.equal(volumeNoCelular(), null);
  const antes = pedidos.length;
  manda({ cmd: 'volumeJanela', delta: 1 }); await espera(120);
  assert.equal(pedidos.length, antes);

  ws.close(); s.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});
