const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Dados } = require('../src/main/dados');
const { criarPregacoes, resumoDasPregacoes, ehPowerPoint, ehPalestra } = require('../src/main/pregacoes');
const { criarLeitorPowerPoint } = require('../src/main/powerpoint');

const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'altar-pregedit-'));
const novo = () => new Dados(pastaTemp(), { hoje: () => '2026-11-23' });
function arquivos(...nomes) {
  const p = pastaTemp();
  return nomes.map(n => { const c = path.join(p, n); fs.writeFileSync(c, 'conteúdo de ' + n); return c; });
}
const conteudo = (d, nome) => fs.readFileSync(path.join(d.pastaMidia, nome), 'utf8');

test('imagens marcadas na Biblioteca viram uma pregação, na ordem marcada, e continuam soltas', () => {
  const d = novo();
  const { novos } = d.importarArquivos(arquivos('a.jpg', 'b.jpg', 'c.jpg', 'video.mp4'));
  const [a, b, c, video] = novos;
  const feito = d.juntarEmPregacao([c.id, a.id, video.id, 'nao-existe', c.id, b.id], { titulo: 'Estudo de quarta' });
  assert.equal(feito.pregacao.titulo, 'Estudo de quarta');
  assert.deepEqual(feito.pregacao.arquivos.map(n => conteudo(d, n)), ['conteúdo de c.jpg', 'conteúdo de a.jpg', 'conteúdo de b.jpg']);
  assert.equal(d.biblioteca.filter(x => x.tipo === 'imagem').length, 3);
  // As mesmas imagens na mesma ordem: usa a que já existe.
  assert.equal(d.juntarEmPregacao([c.id, a.id, b.id]).repetida, true);
  // Uma imagem só não vira pregação.
  assert.equal(d.juntarEmPregacao([a.id]), null);
  assert.equal(d.juntarEmPregacao([video.id, a.id]), null);
});

test('dá para subir, descer e tirar as imagens de uma pregação, e colocar mais', () => {
  const d = novo();
  const p = d.criarPregacao(arquivos('1.jpg', '2.jpg', '3.jpg')).pregacao;
  const ordem = () => p.arquivos.map(n => conteudo(d, n).replace('conteúdo de ', ''));
  const marcaAntes = p.marca;

  assert.equal(d.moverImagemDaPregacao(p.id, 2, -1), true);
  assert.deepEqual(ordem(), ['1.jpg', '3.jpg', '2.jpg']);
  assert.equal(d.moverImagemDaPregacao(p.id, 0, 1), true);
  assert.deepEqual(ordem(), ['3.jpg', '1.jpg', '2.jpg']);
  assert.equal(p.arquivo, p.arquivos[0]);            // a capa é a primeira
  assert.notEqual(p.marca, marcaAntes);
  // Fora da lista não faz nada.
  assert.equal(d.moverImagemDaPregacao(p.id, 0, -1), false);
  assert.equal(d.moverImagemDaPregacao(p.id, 2, 1), false);
  assert.equal(d.moverImagemDaPregacao('outra', 0, 1), false);

  const tirada = p.arquivos[1];
  assert.equal(d.tirarImagemDaPregacao(p.id, 1), true);
  assert.deepEqual(ordem(), ['3.jpg', '2.jpg']);
  assert.equal(fs.existsSync(path.join(d.pastaMidia, tirada)), false);

  assert.equal(d.colocarArquivosNaPregacao(p.id, arquivos('4.jpg', 'musica.mp3', '5.png')), 2);
  assert.deepEqual(ordem(), ['3.jpg', '2.jpg', '4.jpg', '5.png']);
  const solta = d.importarArquivos(arquivos('solta.jpg')).novos[0];
  assert.equal(d.colocarImagensNaPregacao(p.id, [solta.id]), 1);
  assert.equal(ordem().pop(), 'solta.jpg');

  // A última imagem não sai.
  while (p.arquivos.length > 1) d.tirarImagemDaPregacao(p.id, 0);
  assert.equal(d.tirarImagemDaPregacao(p.id, 0), false);
  assert.equal(p.arquivos.length, 1);
});

test('PDF de palestra que teve as imagens mexidas não é mais confundido com o PDF original', async () => {
  const d = novo();
  const [pdf] = arquivos('Palestra.pdf');
  const leitor = async (arq, pasta) => [1, 2, 3].map(n => { const c = path.join(pasta, `000${n}.jpg`); fs.writeFileSync(c, `página ${n}`); return c; });
  const primeira = (await criarPregacoes(d, [pdf], { pdfParaImagens: leitor })).feitas[0].pregacao;
  d.tirarImagemDaPregacao(primeira.id, 2);
  const r = resumoDasPregacoes(await criarPregacoes(d, [pdf], { pdfParaImagens: leitor }));
  assert.equal(r.repetida, false);
  assert.equal(d.biblioteca.filter(b => b.tipo === 'pregacao').length, 2);
});

test('PowerPoint vira pregação, uma imagem por slide', async () => {
  assert.ok(ehPowerPoint('Palestra.PPTX') && ehPowerPoint('antigo.ppt') && ehPowerPoint('show.ppsx'));
  assert.ok(!ehPowerPoint('foto.jpg') && ehPalestra('a.pdf') && ehPalestra('a.pptx'));
  const d = novo();
  const [ppt] = arquivos('Palestra do bispo.pptx');
  const slides = async (arq, pasta) => [1, 2].map(n => { const c = path.join(pasta, `slide-000${n}.jpg`); fs.writeFileSync(c, `slide ${n}`); return c; });
  const r = resumoDasPregacoes(await criarPregacoes(d, [ppt], { pptParaImagens: slides }));
  assert.deepEqual({ qtd: r.qtd, imagens: r.imagens, titulo: r.titulo, sem: r.semPowerPoint }, { qtd: 1, imagens: 2, titulo: 'Palestra do bispo', sem: false });
  // O mesmo PowerPoint de novo não é desenhado outra vez.
  const de_novo = resumoDasPregacoes(await criarPregacoes(d, [ppt], { pptParaImagens: async () => { throw new Error('não era para abrir de novo'); } }));
  assert.equal(de_novo.repetida, true);
});

test('sem PowerPoint nem LibreOffice no notebook, a apresentação fica de fora e a tela fica sabendo o motivo', async () => {
  const d = novo();
  const [ppt] = arquivos('Palestra.pptx');
  const leitor = criarLeitorPowerPoint({ executar: async () => 'SEM\r\n', libreOffice: () => null, sistema: 'win32' });
  const erros = [];
  const r = resumoDasPregacoes(await criarPregacoes(d, [ppt], { pptParaImagens: leitor.paraImagens, aoErrar: e => erros.push(e) }));
  assert.deepEqual({ qtd: r.qtd, ignorados: r.ignorados, sem: r.semPowerPoint }, { qtd: 0, ignorados: 1, sem: true });
  assert.equal(erros.length, 0);   // não é erro do programa: não vai para o registro de erros
});

test('sem PowerPoint, o LibreOffice transforma em PDF e o leitor de PDF faz as imagens', async () => {
  const pasta = pastaTemp();
  const [ppt] = arquivos('Aula.pptx');
  const chamadas = [];
  const leitor = criarLeitorPowerPoint({
    sistema: 'win32',
    libreOffice: () => 'C:\\LibreOffice\\soffice.exe',
    executar: async (programa, args) => {
      chamadas.push(path.basename(programa));
      if (/powershell/i.test(programa)) return 'SEM';
      fs.writeFileSync(path.join(args[args.indexOf('--outdir') + 1], 'apresentacao.pdf'), 'pdf');
      return '';
    },
    pdfParaImagens: async (pdf, p) => { assert.equal(path.basename(pdf), 'apresentacao.pdf'); return [path.join(p, '0001.jpg')]; },
  });
  assert.deepEqual(await leitor.paraImagens(ppt, pasta), [path.join(pasta, '0001.jpg')]);
  assert.deepEqual(chamadas, ['powershell.exe', 'soffice.exe']);
});

test('servidor: o celular junta imagens da Biblioteca numa pregação e o Painel baixa do Telegram sem mexer na TV', async () => {
  const WebSocket = require('ws');
  const { criarServidor } = require('../src/main/servidor');
  const base = pastaTemp();
  const d = new Dados(base); d.config.porta = 7900 + Math.floor(Math.random() * 300);
  const r = d.criarReuniao({}), outra = d.criarReuniao({});
  const [a, b] = d.importarArquivos(arquivos('a.jpg', 'b.jpg')).novos;
  const conta = {
    ligada: () => true,
    conversas: async () => [{ id: '55', nome: 'Pr. Marcos', tipo: 'pessoa', qt: 1, quando: 1 }],
    videos: async () => [{ id: 9, tipo: 'foto', titulo: 'Convite', duracao: 0, tamanho: 3, quando: 1 }],
    miniatura: async () => null,
    baixar: async (c, m, prog) => {
      prog(100);
      const p = pastaTemp(), arquivo = path.join(p, 'Convite.jpg');
      fs.writeFileSync(arquivo, 'foto do telegram');
      return { arquivo, pasta: p, titulo: 'Convite' };
    },
  };
  const s = criarServidor({ dados: d, telegram: { pasta: () => base, pastaCapas: () => base, conta } });
  await s.iniciar();
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  const ligar = async papel => {
    const ws = new WebSocket(`ws://127.0.0.1:${d.config.porta}/ws?t=${s.token}&papel=${papel}`);
    const recebidos = [];
    ws.on('message', m => recebidos.push(JSON.parse(m)));
    await new Promise(ok => ws.on('open', ok));
    return { ws, manda: c => ws.send(JSON.stringify(c)), ultimo: tipo => recebidos.filter(m => m.tipo === tipo).pop() };
  };
  const cel = await ligar('controle'), painel = await ligar('painel');

  cel.manda({ cmd: 'escolherReuniao', id: r.id }); await espera(100);
  cel.manda({ cmd: 'juntarDaBiblioteca', bibliotecaIds: [b.id, a.id] }); await espera(150);
  assert.deepEqual([cel.ultimo('juntou').ok, cel.ultimo('juntou').imagens], [true, 2]);
  const itens = d.reuniaoCompleta(r.id).itens;
  assert.deepEqual([itens.length, itens[0].tipo, itens[0].arquivos.length], [1, 'pregacao', 2]);
  cel.manda({ cmd: 'juntarDaBiblioteca', bibliotecaIds: [a.id] }); await espera(100);
  assert.equal(cel.ultimo('juntou').ok, false);

  // A pregação está na TV na 2ª imagem e o Painel tira uma: a TV fica na que sobrou.
  cel.manda({ cmd: 'mostrar', itemId: itens[0].id }); await espera(80);
  cel.manda({ cmd: 'irSlide', n: 1 }); await espera(80);
  assert.equal(cel.ultimo('estado').estado.tv.slide, 1);
  painel.manda({ cmd: 'tirarImagemDaPregacao', id: itens[0].bibliotecaId, n: 0 }); await espera(120);
  assert.equal(cel.ultimo('estado').estado.tv.slide, 0);
  // O celular não pode mexer nas imagens da pregação (isso é preparação, do notebook).
  cel.manda({ cmd: 'moverImagemDaPregacao', id: itens[0].bibliotecaId, n: 0, delta: 1 }); await espera(80);

  // Painel: baixa do Telegram para a reunião que está preparando (não a que está acontecendo).
  painel.manda({ cmd: 'pedirTgVideos', conversa: '55', reuniaoId: outra.id }); await espera(100);
  assert.equal(painel.ultimo('tgVideos').lista[0].naReuniao, false);
  const tvAntes = JSON.stringify(cel.ultimo('estado').estado.tv);
  painel.manda({ cmd: 'baixarTg', conversa: '55', msg: 9, reuniaoId: outra.id }); await espera(300);
  assert.deepEqual([painel.ultimo('tgPronto').naReuniao, painel.ultimo('tgPronto').mostrou], [true, false]);
  assert.equal(d.reuniaoCompleta(outra.id).itens[0].titulo, 'Convite');
  assert.equal(d.reuniao(r.id).itens.length, 1);
  assert.equal(JSON.stringify(cel.ultimo('estado').estado.tv), tvAntes);
  painel.manda({ cmd: 'pedirTgVideos', conversa: '55', reuniaoId: outra.id }); await espera(100);
  assert.deepEqual([painel.ultimo('tgVideos').lista[0].jaBaixado, painel.ultimo('tgVideos').lista[0].naReuniao], [true, true]);
  // Sem reunião aberta no Painel: vai só para a Biblioteca.
  painel.manda({ cmd: 'baixarTg', conversa: '55', msg: 9 }); await espera(150);
  assert.equal(painel.ultimo('tgPronto').naReuniao, false);

  cel.ws.close(); painel.ws.close(); s.fechar();
  fs.rmSync(base, { recursive: true, force: true });
});

test('servidor: pelo celular dá para mudar a ordem dos itens da reunião e tirar um, sem mexer na TV nem na Biblioteca (o que está na TV não sai)', async () => {
  const WebSocket = require('ws');
  const { criarServidor } = require('../src/main/servidor');
  const base = pastaTemp();
  const d = new Dados(base); d.config.porta = 8200 + Math.floor(Math.random() * 300);
  const r = d.criarReuniao({}), outra = d.criarReuniao({});
  const [a, b, c] = d.importarArquivos(arquivos('a.jpg', 'b.jpg', 'c.jpg')).novos;
  d.adicionarItens(r.id, [a.id, b.id, c.id]);
  d.adicionarItens(outra.id, [a.id]);
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
  const ordem = () => d.reuniaoCompleta(r.id).itens.map(i => i.titulo).join('');
  const item = titulo => d.reuniaoCompleta(r.id).itens.find(i => i.titulo === titulo).id;

  // Sem reunião aberta não faz nada.
  cel.manda({ cmd: 'moverItemDaReuniao', itemId: item('a'), delta: 1 }); await espera(80);
  assert.equal(ordem(), 'abc');

  cel.manda({ cmd: 'escolherReuniao', id: r.id }); await espera(100);
  cel.manda({ cmd: 'moverItemDaReuniao', itemId: item('a'), delta: 1 }); await espera(80);
  assert.equal(ordem(), 'bac');
  cel.manda({ cmd: 'moverItemDaReuniao', itemId: item('c'), delta: -1 }); await espera(80);
  assert.equal(ordem(), 'bca');
  assert.equal(cel.ultimo('estado').reuniao.itens.map(i => i.titulo).join(''), 'bca');
  // Arrastando, o item anda mais de uma casa de uma vez.
  cel.manda({ cmd: 'moverItemDaReuniao', itemId: item('b'), delta: 2 }); await espera(80);
  assert.equal(ordem(), 'cab');
  cel.manda({ cmd: 'moverItemDaReuniao', itemId: item('b'), delta: -2 }); await espera(80);
  assert.equal(ordem(), 'bca');
  // Nas pontas não passa do começo nem do fim; a TV não manda nada.
  cel.manda({ cmd: 'moverItemDaReuniao', itemId: item('b'), delta: -1 }); await espera(60);
  cel.manda({ cmd: 'moverItemDaReuniao', itemId: item('a'), delta: 5 }); await espera(60);
  telao.manda({ cmd: 'tirarItemDaReuniao', itemId: item('a') }); await espera(60);
  assert.equal(ordem(), 'bca');

  // O item que está na TV não sai (o pastor ficaria sem os botões dele); depois de mostrar outro, sai.
  cel.manda({ cmd: 'mostrar', itemId: item('c') }); await espera(80);
  assert.equal(cel.ultimo('estado').estado.tv.itemId, item('c'));
  cel.manda({ cmd: 'tirarItemDaReuniao', itemId: item('c') }); await espera(100);
  assert.equal(ordem(), 'bca');
  cel.manda({ cmd: 'mostrar', itemId: item('b') }); await espera(80);
  const tv = JSON.stringify(cel.ultimo('estado').estado.tv);
  cel.manda({ cmd: 'tirarItemDaReuniao', itemId: item('c') }); await espera(100);
  assert.equal(ordem(), 'ba');
  assert.equal(JSON.stringify(cel.ultimo('estado').estado.tv), tv);   // tirar não mexe na TV
  assert.ok(d.biblioteca.find(x => x.id === c.id));                    // e o arquivo continua na Biblioteca
  assert.equal(d.reuniao(outra.id).itens.length, 1);   // a outra reunião não muda

  cel.ws.close(); telao.ws.close(); s.fechar();
  fs.rmSync(base, { recursive: true, force: true });
});
