// O celular diz de quem ele é: um nome novo entra na lista de pastores do notebook (uma vez só).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require('ws');
const { Dados } = require('../src/main/dados');
const { criarServidor } = require('../src/main/servidor');

test('servidor: o celular diz o nome do pastor; nome novo entra na lista, nome que já existe é o mesmo pastor', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-dono-'));
  const d = new Dados(base); d.config.porta = 8600 + Math.floor(Math.random() * 300);
  const marcos = d.salvarPastor({ nome: 'Pr. Marcos' });
  const s = criarServidor({ dados: d });
  await s.iniciar();
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  const ligar = async papel => {
    const ws = new WebSocket(`ws://127.0.0.1:${d.config.porta}/ws?t=${s.token}&papel=${papel}`);
    const recebidos = [];
    ws.on('message', m => recebidos.push(JSON.parse(m)));
    await new Promise(ok => ws.on('open', ok));
    return { ws, manda: x => ws.send(JSON.stringify(x)), ultimo: tipo => recebidos.filter(m => m.tipo === tipo).pop() };
  };
  const cel = await ligar('controle'), telao = await ligar('telao');

  // Nome que já está na lista (com outra caixa e espaços): devolve o cadastro que existe, não cria outro.
  cel.manda({ cmd: 'souPastor', nome: '  pr.  marcos ' }); await espera(80);
  assert.deepEqual({ id: cel.ultimo('pastorGuardado').id, nome: cel.ultimo('pastorGuardado').nome }, { id: marcos.id, nome: 'Pr. Marcos' });
  assert.equal(d.pastores.length, 1);

  // Nome novo: entra na lista e o celular recebe o cadastro; o estado seguinte já traz o pastor.
  cel.manda({ cmd: 'souPastor', nome: 'Pr. João' }); await espera(80);
  const novo = cel.ultimo('pastorGuardado');
  assert.equal(novo.nome, 'Pr. João');
  assert.deepEqual(d.pastores.map(p => p.nome), ['Pr. Marcos', 'Pr. João']);
  assert.ok(cel.ultimo('estado').pastores.some(p => p.id === novo.id));

  // Nome vazio não faz nada; a TV não cadastra ninguém.
  cel.manda({ cmd: 'souPastor', nome: '   ' }); await espera(50);
  telao.manda({ cmd: 'souPastor', nome: 'Outro' }); await espera(50);
  assert.equal(d.pastores.length, 2);

  // A reunião criada pelo celular fica com o pastor escolhido.
  cel.manda({ cmd: 'criarReuniaoAgora', pastorId: novo.id, nome: 'Reunião de teste' }); await espera(100);
  assert.equal(d.reuniao(cel.ultimo('estado').estado.reuniaoId).pastorId, novo.id);

  cel.ws.close(); telao.ws.close(); s.fechar();
  fs.rmSync(base, { recursive: true, force: true });
});
