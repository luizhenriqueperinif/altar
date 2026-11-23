// Controle: o celular do Pastor. Mostra a reunião em cartões; tocar num cartão leva para o Telão.
(function () {
  const app = document.getElementById('app');
  const local = new URLSearchParams(location.search).get('local') === '1';
  const I = window.Icone;
  const ICONE = { imagem: I('imagem'), video: I('video'), palavra: I('palavra'), musica: I('musica'), pregacao: I('pregacao') };
  const TIPO = { imagem: 'Imagem', video: 'Vídeo', musica: 'Música · toca por baixo' };
  const ULTIMO_DO_AT = 38; // Malaquias

  let dados = null;            // último pacote recebido do Notebook
  let con = { conectado: false };
  let confirmarEncerrar = false;
  let confirmarDesconectar = false;   // no aplicativo: esquecer este notebook e ler outro QR code
  let verOutras = false;
  let verApp = false;   // passos para instalar o aplicativo do Android (tela inicial)
  let escolhendo = null;       // { etapa: 'livro'|'cap'|'vers', test: 'AT'|'NT', l, c } escolhendo versículo
  let palavraAberta = false;   // painel da Palavra aberto (setas + passagens preparadas)
  let pregacaoAberta = false;  // painel da Pregação aberto (◀ ▶ + miniaturas)
  let escolhendoMusica = false; // lista de músicas para tocar avulsa
  let arrumandoMusicas = false; // na aba "Música": escolhendo uma música para dar outro nome
  let renomeandoMusica = null;  // a música que está ganhando outro nome: { id, titulo }
  let envio = null;            // mandar arquivos do celular para a Biblioteca: { status, atual, total, pct, resultado, modo }
  let colocando = false;       // "Colocar na reunião": a pergunta "onde está?" (no notebook ou neste celular)
  let arrumando = false;       // reunião: mudando a ordem dos itens ou tirando algum
  let tirandoItem = null;      // o item que espera o "Sim, tirar"
  let arrasto = null;          // item da reunião sendo arrastado para outro lugar da lista
  let dono = null;             // de quem é este celular: { id, nome } | { nao: true } (não quis dizer) | null (ainda não perguntou)
  let perguntandoDono = null;  // janela "De quem é este celular?": { nome }
  let perguntouDono = false;   // a pergunta abre sozinha uma vez só
  let recentes = null;         // últimas fotos e vídeos do celular, embaixo dessa pergunta (só no aplicativo): { status, itens, sel }
  let escolhendoBib = null;    // colocar da Biblioteca na reunião: { aba, sel: [ids na ordem marcada] }
  let novaReuniao = null;      // criando reunião pelo celular: { nome }
  let escolhendoJanela = null; // lista das janelas abertas no notebook: { lista: null (carregando) | [...] }
  let naInicio = false;        // voltou para a lista de reuniões (botão de voltar) com a reunião ainda aberta
  let reuniaoVista = null;
  let telegram = null;         // vídeos baixados no Telegram do notebook: { lista: null (carregando) | [...], existe, aviso }
  let relogioTelegram = null;
  let avisoTecla = '';          // quando o botão da janela não funcionou
  let arrastando = null;       // 'a' ou 'v' enquanto o dedo arrasta a barrinha
  let chaveTela = '';          // para não redesenhar tudo só porque o tempo do vídeo andou
  const indices = {};          // livros e capítulos de cada versão (vem do notebook uma vez)

  const conexao = window.Altar.conectar({
    papel: 'controle',
    local,
    aoReceber: m => {
      if (m.tipo === 'estado') { dados = m; desenhar(); }
      else if (m.tipo === 'pastorGuardado') { if (dono && dono.nome && mesmoNome(dono.nome, m.nome)) guardarDono({ id: m.id, nome: m.nome }); desenhar(true); }
      else if (m.tipo === 'janelas' && escolhendoJanela) { escolhendoJanela.lista = m.lista || []; desenhar(true); }
      else if (m.tipo === 'telegram' && telegram && telegram.modo === 'pasta') { telegram.lista = m.lista || []; telegram.existe = m.existe; desenhar(true); }
      else if (m.tipo === 'tgConversas' && telegram) {
        if (!m.ligada) { telegram.ligada = false; abrirPasta(); }
        else { telegram.ligada = true; telegram.conversas = m.lista || []; }
        desenhar(true);
      }
      else if (m.tipo === 'tgVideos' && telegram && telegram.conversa && telegram.conversa.id === m.conversa) { telegram.videos = m.lista || []; desenhar(true); }
      else if (m.tipo === 'tgProgresso' && telegram && telegram.baixando && telegram.baixando.msg === m.msg) { telegram.baixando.pct = m.pct; desenhar(true); }
      else if (m.tipo === 'tgPronto' && telegram && telegram.modo === 'baixando') {
        // Foi para a TV, ou o pastor escolheu "só na reunião": volta para a reunião.
        // Sem escolha: pergunta o que fazer agora.
        if (m.mostrou || telegram.baixando.naTv === false || !m.itemId) {
          fecharTelegram(); escolhendo = null; escolhendoMusica = false; palavraAberta = false; pregacaoAberta = false;
        } else telegram = { ...telegram, modo: 'pronto', pronto: { itemId: m.itemId, titulo: telegram.baixando.titulo } };
        desenhar(true);
      }
      else if (m.tipo === 'tgErro' && telegram) {
        telegram.aviso = m.mensagem || 'Não deu certo. Tente de novo.';
        if (telegram.modo === 'baixando') telegram.modo = 'videos';
        if (telegram.modo === 'inicio' && !telegram.conversas) telegram.conversas = [];
        if (telegram.modo === 'videos' && !telegram.videos) telegram.videos = [];
        desenhar(true);
      }
      else if (m.tipo === 'telegramMudou' && telegram && telegram.modo === 'pasta') enviar({ cmd: 'pedirTelegram' });
      else if (m.tipo === 'telegramSumiu' && telegram) { telegram.aviso = 'Esse vídeo não está mais no notebook. Baixe de novo no Telegram.'; enviar({ cmd: 'pedirTelegram' }); desenhar(true); }
      else if (m.tipo === 'tecla') {
        avisoTecla = m.resultado === 'ok' ? ''
          : m.resultado === 'fechada' ? 'Essa janela foi fechada no notebook.'
          : m.resultado === 'semfoco' ? 'O notebook não deixou mexer na janela. Clique uma vez nela no notebook e tente de novo.'
          : m.resultado === 'semsom' ? 'Ainda não achei o som dessa janela. Dê play no vídeo e toque no volume de novo.'
          : m.acao === 'volume' ? 'Não deu para mexer no volume. Tente de novo.'
          : 'Não deu para mexer na janela. Tente de novo.';
        desenhar(true);
      }
    },
    aoMudar: c => { con = c; desenhar(true); },
  });

  const mmss = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const enviar = cmd => conexao.enviar(cmd);
  // A versão da Bíblia: a que o pastor escolheu no celular nesta reunião; senão a da reunião.
  const versao = () => (dados && dados.estado && dados.estado.versao) || (dados && dados.reuniao && dados.reuniao.versao) || 'ACF';

  function carregarIndice(v) {
    if (indices[v]) return;
    indices[v] = 'carregando';
    fetch(`/api/biblia?t=${encodeURIComponent(conexao.token)}&v=${v}`)
      .then(r => r.json())
      .then(j => { indices[v] = j; desenhar(true); })
      .catch(() => { delete indices[v]; });
  }

  // ---------- o que está na TV ----------
  function itemNaTv() {
    const e = dados.estado;
    return e.tv.tipo === 'item' && dados.reuniao ? dados.reuniao.itens.find(i => i.id === e.tv.itemId) : null;
  }

  function rotuloTv() {
    const e = dados.estado;
    if (e.tv.tipo === 'espera') return e.audio && e.audio.video ? 'Tela de espera · com som' : 'Tela de espera';
    if (e.tv.tipo === 'preto') return 'TV apagada';
    if (e.tv.tipo === 'janela') return e.tv.nome;
    if (dados.versiculo) return `${dados.versiculo.rotulo} · ${dados.versiculo.versao}${dados.versiculo.avulso ? ' (fora do planejado)' : ''}`;
    const it = itemNaTv();
    if (!it) return '';
    if (it.tipo === 'pregacao') return `${it.titulo} · imagem ${e.tv.slide + 1} de ${it.arquivos.length}`;
    if (it.tipo === 'video') {
      const v = e.video || {};
      return it.titulo + (v.terminou ? ' (terminou, parado no último quadro)' : v.tocando ? ' (passando)' : ' (pausado)');
    }
    return it.titulo;
  }

  // Para o topo da reunião: sem ícone e sem a versão da Bíblia (o espaço é pouco).
  function rotuloCurto() {
    const vs = dados.versiculo;
    if (vs && dados.estado.tv.tipo !== 'janela') return vs.rotulo + (vs.avulso ? ' (fora do planejado)' : '');
    return rotuloTv();
  }

  function miniTv() {
    const e = dados.estado;
    if (e.tv.tipo === 'espera') return `<div class="tv espera"><div class="rot">Tela de espera</div></div>`;
    if (e.tv.tipo === 'preto') return `<div class="tv"><div class="rot">TV apagada<small>tela preta</small></div></div>`;
    if (e.tv.tipo === 'janela') return `<div class="tv video"><div class="rot">${I('janela')} Janela do notebook<small>${esc(e.tv.nome)}</small></div></div>`;
    if (dados.versiculo) return `<div class="tv">${window.Versiculo.html(dados.versiculo, conexao.midia)}</div>`;
    const it = itemNaTv();
    if (it && it.tipo === 'imagem') return `<div class="tv"><img src="${conexao.midia(it.arquivo)}" alt=""></div>`;
    if (it && it.tipo === 'pregacao') return `<div class="tv"><img src="${conexao.midia(it.arquivos[e.tv.slide] || it.arquivos[0])}" alt=""></div>`;
    if (it && it.tipo === 'video') return `<div class="tv video"><div class="rot">${I('video')} ${esc(it.titulo)}</div></div>`;
    return `<div class="tv"></div>`;
  }



  // Som, fixo embaixo enquanto algo toca: tocar/pausar, a barrinha para adiantar ou voltar e o volume da TV.
  function hud() {
    const e = dados.estado, a = e.audio, v = e.video, it = itemNaTv();
    let midia = '', x = null, k = '';
    if (a && dados.musica) {
      x = a; k = 'a';
      midia = `${a.tocando
        ? `<button class="btn" data-cmd="audioPausar" aria-label="${a.video ? 'Pausar o som da tela de espera' : 'Pausar a música'}">${I('pause')}</button>`
        : `<button class="btn primary" data-cmd="audioContinuar" aria-label="${a.terminou ? 'Tocar de novo' : 'Tocar a música'}">${I(a.terminou ? 'denovo' : 'play')}</button>`}
        <div class="hud-nome">${a.video ? '<small>Som da tela de espera</small>' : ''}${esc(dados.musica.titulo)}</div>`;
    } else if (v && it && it.tipo === 'video') {
      x = v; k = 'v';
      midia = `${v.tocando
        ? `<button class="btn" data-cmd="videoPausar" aria-label="Pausar o vídeo">${I('pause')}</button>`
        : `<button class="btn primary" data-cmd="videoContinuar" aria-label="${v.terminou ? 'Passar de novo' : 'Continuar o vídeo'}">${I(v.terminou ? 'denovo' : 'play')}</button>`}
        <div class="hud-nome">${esc(it.titulo)}</div>`;
    } else return '';   // nada tocando: a faixa do som some e a lista ganha o espaço
    let barra = '';
    if (x.dur) {
      const pct = Math.min(100, (x.t / x.dur) * 100);
      barra = `<div class="hud-seek">
        <div class="bar seek" data-seek="${k}" data-dur="${x.dur}" role="slider" aria-label="Adiantar ou voltar" aria-valuemin="0" aria-valuemax="${Math.round(x.dur)}" aria-valuenow="${Math.round(x.t || 0)}"><i data-prog="${k}" style="width:${pct}%"></i><b class="pino" style="left:${pct}%"></b></div>
        <span class="hud-t"><span data-tempo="${k}">${mmss(x.t)}</span> / ${mmss(x.dur)}</span></div>`;
    }
    return `<div class="hud">${midia}
      <div class="hud-vol">
        <button class="btn" data-cmd="volume" data-delta="-1" aria-label="Diminuir volume">${I('menos')}</button>
        <div class="hud-n" aria-label="Volume ${e.volume} de 10">${e.volume}</div>
        <button class="btn" data-cmd="volume" data-delta="1" aria-label="Aumentar volume">${I('mais')}</button>
      </div>${barra}</div>`;
  }


  function cartao(it) {
    const e = dados.estado;
    const tocando = it.tipo === 'musica' && e.audio && e.audio.itemId === it.id;
    const naTv = (e.tv.tipo === 'item' && e.tv.itemId === it.id) || tocando;
    const foto = it.tipo === 'video' ? it.capa : (it.tipo === 'imagem' || it.tipo === 'pregacao') ? it.arquivo : null;
    const icone = foto ? `<img src="${conexao.midia(foto)}" alt="" loading="lazy">${it.tipo === 'video' ? `<i class="play">${I('play')}</i>` : ''}` : ICONE[it.tipo] || '';
    const sub = it.tipo === 'palavra' ? it.passagens.map(p => esc(p.titulo)).join(' · ')
      : it.tipo === 'pregacao' ? `Pregação · ${it.arquivos.length} ${it.arquivos.length === 1 ? 'imagem' : 'imagens'}`
      : TIPO[it.tipo] || '';
    const titulo = esc(it.titulo);
    const chip = tocando ? `${I('tocando')}${e.audio.tocando ? 'Tocando' : e.audio.terminou ? 'Terminou' : 'Pausada'}` : `${I('tv')}Na TV`;
    return `<button class="card ${it.tipo} ${naTv ? 'on' : ''}" data-acao="cartao" data-item="${it.id}">
      <span class="ic" aria-hidden="true">${icone}</span>
      <span><span class="t">${titulo}</span><br><span class="d">${sub}</span></span>
      ${naTv ? `<span class="estado${tocando ? ' som' : ''}">${chip}</span>` : ''}</button>`;
  }

  // O mesmo cartão na hora de arrumar a reunião: não vai para a TV; o pastor arrasta pelas três barrinhas ou tira da reunião.
  function cartaoArrumar(it, i) {
    const e = dados.estado;
    const naTv = (e.tv.tipo === 'item' && e.tv.itemId === it.id) || (it.tipo === 'musica' && e.audio && e.audio.itemId === it.id);
    const foto = it.tipo === 'video' ? it.capa : (it.tipo === 'imagem' || it.tipo === 'pregacao') ? it.arquivo : null;
    const icone = foto ? `<img src="${conexao.midia(foto)}" alt="" loading="lazy" draggable="false">` : ICONE[it.tipo] || '';
    const confirma = tirandoItem !== it.id ? ''
      : naTv ? `<div class="arr-confirma"><b>${it.tipo === 'musica' ? 'Está tocando agora. Pare a música antes de tirar.' : 'Está na TV agora. Mostre outra coisa antes de tirar.'}</b>
          <button class="btn" data-acao="arrTirarNao">Entendi</button></div>`
      : `<div class="arr-confirma"><b>Tirar da reunião?</b>
          <button class="btn danger" data-acao="arrTirarSim" data-item="${it.id}">Sim, tirar</button>
          <button class="btn" data-acao="arrTirarNao">Não</button></div>`;
    return `<div class="card arrumar ${it.tipo} ${naTv ? 'on' : ''}" data-item="${it.id}">
      <span class="arr-pega" role="img" aria-label="Arraste para mudar de lugar">${I('pega')}</span>
      <span class="ic" aria-hidden="true">${icone}</span>
      <span><span class="t">${esc(it.titulo)}</span>${naTv ? `<span class="d">${it.tipo === 'musica' ? 'tocando agora' : 'na TV agora'}</span>` : ''}</span>
      <button class="btn arr-tirar" data-acao="arrTirar" data-item="${it.id}" aria-label="Tirar ${esc(it.titulo)} da reunião">${I('lixo')}</button>${confirma}</div>`;
  }

  // ---------- telas ----------
  const diaSemana = d => { const [a, m, dd] = d.split('-').map(Number); return new Date(a, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'long' }); };
  const tituloReuniao = r => r.nome || `Reunião de ${diaSemana(r.data)}`;

  function botaoReuniao(r, mostrarDia) {
    const dia = mostrarDia ? `${diaSemana(r.data)} ${r.data.split('-').reverse().slice(0, 2).join('/')} · ` : '';
    return `<button class="reuniao-btn" data-cmd="escolherReuniao" data-id="${r.id}">
      <span class="hora">${esc(r.hora)}</span><span class="p">${esc(tituloReuniao(r))}</span>
      <span class="v">${esc(dia)}${r.qtd} ${r.qtd === 1 ? 'item' : 'itens'}</span></button>`;
  }

  // Topo com a logo da igreja (ou a cruz do Altar), o nome do programa e, do outro lado, de quem é este celular.
  function marca() {
    const logo = dados && dados.info && dados.info.logo, quem = nomeDoDono();
    return `<div class="marca-cel"><img class="marca-logo" src="${logo ? '/logo.png?v=' + encodeURIComponent(logo) : '/comum/icone.svg'}" alt="">Altar${quem ? `<span class="marca-quem">${I('pessoa')}${esc(quem)}</span>` : ''}</div>`;
  }

  // O ícone do app no celular acompanha a logo (muda o endereço para o celular não usar a antiga).
  let iconeAtual;
  function atualizarIcone() {
    const logo = (dados && dados.info && dados.info.logo) || 'padrao';
    if (logo === iconeAtual) return;
    iconeAtual = logo;
    const v = encodeURIComponent(logo);
    document.querySelector('link[rel="apple-touch-icon"]').href = '/icone-app.png?v=' + v;
    document.querySelector('link[rel="manifest"]').href = '/manifest.webmanifest?v=' + v;
  }

  function telaEscolher() {
    const deHoje = dados.reunioes.filter(r => r.data === dados.hoje);
    const outras = dados.reunioes.filter(r => r.data !== dados.hoje);
    // Voltou para cá com o botão de voltar do celular: a reunião continua aberta (e a TV como está).
    const aberta = dados.estado.reuniaoId && dados.reuniao;
    return `<div class="pad escolher">
      ${marca()}
      ${avisoConexao()}
      ${aberta ? `<div class="reuniao-aberta">
        <span class="note">Reunião aberta agora: ${esc(tituloReuniao(dados.reuniao))}</span>
        <button class="btn primary huge" data-acao="voltarReuniao">${I('lista')} Voltar para a reunião</button></div>` : ''}
      ${cartaoAtualizarApp()}
      <div class="eyebrow">Hoje · ${esc(diaSemana(dados.hoje))}</div>
      ${controleJanela()}
      <h1>Qual reunião vai começar?</h1>
      ${deHoje.length ? deHoje.map(r => botaoReuniao(r)).join('')
        : '<p class="note">Nenhuma reunião marcada para hoje. Prepare a reunião no notebook.</p>'}
      ${outras.length ? (verOutras
        ? `<div class="eyebrow">Outros dias</div>${outras.map(r => botaoReuniao(r, true)).join('')}
           <button class="btn" data-acao="outras">Esconder outros dias</button>`
        : `<button class="btn" data-acao="outras">Ver reuniões de outros dias</button>`) : ''}
      <button class="btn primary" data-acao="novaReuniao">${I('mais')} Criar reunião agora</button>
      ${dados.estado.tv.tipo === 'janela' ? '' : `<button class="btn" data-acao="abrirJanelas">${I('janela')} Mostrar uma janela do notebook</button>`}
      <button class="btn" data-acao="abrirEnvio">${I('enviar')} Mandar fotos, vídeos ou músicas para a Biblioteca</button>
      <section class="este-celular" aria-label="Este celular">
        <div class="eyebrow">Este celular</div>
        <button class="btn" data-acao="donoAbrir">${I('pessoa')} ${nomeDoDono() ? `É de ${esc(nomeDoDono())} (trocar)` : 'Dizer de quem é este celular'}</button>
        ${cartaoApp()}
        ${noApp() ? `<button class="btn sair" data-acao="desconectarApp">${I('trocar')} Desconectar deste notebook</button>` : ''}
      </section>
    </div>`;
  }

  // Celular Android aberto pelo navegador: oferece o aplicativo, que vem dentro do programa do notebook.
  function cartaoApp() {
    if (noApp() || !dados.info || !dados.info.app || !/Android/i.test(navigator.userAgent)) return '';
    if (!verApp) return `<button class="btn" data-acao="app">Instalar o aplicativo do Altar neste celular</button>`;
    // O segundo botão abre o aplicativo já conectado a este notebook (sem ler o QR code de novo).
    // Se o aplicativo ainda não foi instalado, o navegador só volta para esta página (em vez de abrir a loja).
    const abrir = `intent://${location.host}/controle/?t=${encodeURIComponent(conexao.token)}#Intent;scheme=http;package=br.igreja.altar;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
    return `<div class="app-cel">
      <h2>Aplicativo do Altar</h2>
      <ol>
        <li>Toque em <strong>Baixar o aplicativo</strong>. Se o celular avisar que o arquivo pode ser perigoso, toque em <strong>Baixar mesmo assim</strong>.</li>
        <li>Abra o arquivo baixado e toque em <strong>Instalar</strong>. Se o celular pedir, permita instalar por este navegador.</li>
        <li>Volte aqui e toque em <strong>Abrir no aplicativo</strong>.</li>
      </ol>
      <a class="btn primary" href="/app/Altar.apk" download="Altar.apk">${I('descer')} Baixar o aplicativo</a>
      <a class="btn" href="${esc(abrir)}">Abrir no aplicativo</a>
      <button class="btn" data-acao="app">${I('fechar')} Fechar</button>
    </div>`;
  }

  // Dentro do aplicativo: quando o notebook carrega uma versão mais nova do aplicativo, oferece a atualização.
  // O aplicativo baixa do notebook e o Android pergunta à pessoa se pode instalar (ver android/, "atualizar").
  let atualizacaoApp = null;   // null | { status: 'baixando' | 'confirmar' | 'erro', pct }
  function versaoDoApp() {
    // O primeiro aplicativo (versão 1) ainda não sabia dizer a versão.
    try { return window.AltarApp.versao ? Number(window.AltarApp.versao()) || 1 : 1; } catch { return 1; }
  }
  function cartaoAtualizarApp() {
    if (!noApp() || !dados.info || !(dados.info.appVersao > versaoDoApp())) return '';
    if (!window.AltarApp.atualizar) {
      return `<div class="app-cel"><h2>Tem uma versão nova do aplicativo</h2>
        <p>Só desta vez, a instalação é pelo navegador: abra a câmera do celular, leia o QR code do notebook e toque em <strong>Instalar o aplicativo do Altar neste celular</strong>. Das próximas vezes, o botão de atualizar aparece aqui.</p></div>`;
    }
    const a = atualizacaoApp;
    if (a && a.status === 'baixando') {
      return `<div class="app-cel" role="status"><h2>Baixando o aplicativo novo…</h2>
        <div class="bar"><i data-app-pct style="width:${a.pct}%"></i></div>
        <p>Vem do notebook, pelo Wi-Fi da igreja. Deixe esta tela aberta.</p></div>`;
    }
    if (a && a.status === 'confirmar') {
      return `<div class="app-cel" role="status"><h2>Falta só confirmar</h2>
        <p>O celular está perguntando se pode atualizar o Altar: toque em <strong>Atualizar</strong>. Se ele pedir, permita que o Altar instale aplicativos e volte.</p>
        <button class="btn" data-acao="atualizarApp">Não apareceu a pergunta? Tentar de novo</button></div>`;
    }
    return `<div class="app-cel"><h2>Tem uma versão nova do aplicativo</h2>
      ${a && a.status === 'erro'
        ? '<p>Não deu para atualizar agora. Confira se o celular está no Wi-Fi da igreja e toque de novo.</p>'
        : '<p>Leva menos de um minuto. O celular vai perguntar se pode atualizar: toque em <strong>Atualizar</strong>.</p>'}
      <button class="btn primary" data-acao="atualizarApp">${I('descer')} Atualizar o aplicativo</button></div>`;
  }
  window.aoAtualizarApp = a => {
    if (a.erro) atualizacaoApp = { status: 'erro' };
    else if (a.desistiu) atualizacaoApp = null;
    else if (a.confirmar) atualizacaoApp = { status: 'confirmar' };
    else if (atualizacaoApp && atualizacaoApp.status === 'baixando') {
      atualizacaoApp.pct = a.pct;
      const barra = app.querySelector('[data-app-pct]');
      if (barra) { barra.style.width = a.pct + '%'; return; }
    }
    desenhar(true);
  };

  // Os nomes para escolher em "Criar reunião agora": as reuniões do dia, pelo horário.
  const NOMES_DAS_REUNIOES = ['Reunião das 08:00', 'Reunião das 12:00', 'Reunião das 15:00', 'Reunião das 18:00', 'Reunião das 19:30'];
  // ---------- de quem é este celular ----------
  // O celular guarda o nome do pastor: no aplicativo fica guardado no próprio aplicativo (vale mesmo se o
  // endereço do notebook mudar); no navegador, fica no navegador.
  function lembrado(chave) {
    try { if (window.AltarApp && window.AltarApp.lembrado) return window.AltarApp.lembrado(chave) || ''; } catch { /* aplicativo antigo */ }
    try { return localStorage.getItem('altar.' + chave) || ''; } catch { return ''; }
  }
  function lembrar(chave, valor) {
    try { if (window.AltarApp && window.AltarApp.lembrar) { window.AltarApp.lembrar(chave, valor); return; } } catch { /* aplicativo antigo */ }
    try { localStorage.setItem('altar.' + chave, valor); } catch { /* sem lugar para guardar: vale só enquanto a página estiver aberta */ }
  }
  try { dono = JSON.parse(lembrado('dono') || 'null'); } catch { dono = null; }
  if (dono && typeof dono !== 'object') dono = null;
  function guardarDono(d) { dono = d; lembrar('dono', JSON.stringify(d)); }
  const mesmoNome = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  // O pastor deste celular na lista do notebook: pelo cadastro e, se o cadastro for de outro notebook, pelo nome.
  function meuPastor() {
    if (!dono || !dono.nome || !dados) return null;
    const lista = dados.pastores || [];
    return lista.find(p => p.id === dono.id) || lista.find(p => mesmoNome(p.nome, dono.nome)) || null;
  }
  const nomeDoDono = () => { const p = meuPastor(); return p ? p.nome : (dono && dono.nome) || ''; };
  function telaDono() {
    const pastores = dados.pastores || [], meu = meuPastor();
    return `<div class="painel" role="dialog" aria-label="De quem é este celular">
      <div class="painel-topo"><h2>De quem é este celular?</h2><button class="btn" data-acao="donoFechar">${I('fechar')} Fechar</button></div>
      <div class="painel-corpo nova-reuniao" data-scroll="dono">
      <p class="note">O Altar guarda o seu nome neste celular e mostra no alto da tela. É só para você ver que este celular é o seu: não muda nada na reunião.</p>
      ${pastores.length ? `<div class="eyebrow">Toque no seu nome</div>
        <div class="escolha-cel">${pastores.map(p => `<button class="btn ${meu && meu.id === p.id ? 'sel' : ''}" data-acao="donoEscolher" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div>` : ''}
      <div class="eyebrow">${pastores.length ? 'Não está na lista? Escreva o seu nome' : 'Escreva o seu nome'}</div>
      <input type="text" id="dono-nome" class="campo-cel" value="${esc(perguntandoDono.nome)}" placeholder="Ex.: Pr. João" maxlength="40" autocomplete="off">
      <button class="btn primary huge" data-acao="donoGuardar">${I('ok')} Guardar o nome</button>
      <button class="btn" data-acao="donoNao">${dono && dono.nome ? 'Tirar o nome deste celular' : 'Agora não'}</button>
    </div></div>`;
  }

  function telaNovaReuniao() {
    const n = novaReuniao;
    const nomes = NOMES_DAS_REUNIOES;
    return `<div class="painel" role="dialog" aria-label="Criar reunião">
      <div class="painel-topo"><h2>Criar reunião agora</h2><button class="btn" data-acao="fecharNovaReuniao">${I('fechar')} Fechar</button></div>
      <div class="painel-corpo nova-reuniao" data-scroll="nova">
      <p class="note">A reunião fica marcada para hoje, agora, e já começa. Depois é só colocar as coisas nela.</p>
      <div class="eyebrow">Nome da reunião</div>
      <div class="escolha-cel">${nomes.map(x => `<button class="btn ${n.nome === x ? 'sel' : ''}" data-acao="nrNome" data-nome="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <input type="text" id="nr-nome" class="campo-cel" value="${esc(n.nome)}" placeholder="Ou escreva outro nome" maxlength="60" autocomplete="off">
      <button class="btn primary huge" data-acao="nrCriar">${I('ok')} Criar e começar</button>
    </div></div>`;
  }

  // A reunião no celular: em cima o que está na TV, embaixo o som e os 3 botões.
  // Só o meio muda (lista da reunião, versículo, música, pregação); nada abre por cima.
  function abaAtual() {
    if (escolhendo || (palavraAberta && dados.versiculo)) return 'versiculo';
    if (escolhendoMusica) return 'musica';
    return 'reuniao';
  }

  // Janela do notebook na TV (YouTube, Telegram...): os botões apertam as teclas lá no notebook.
  function controleJanela() {
    const e = dados.estado;
    if (e.tv.tipo !== 'janela') return '';
    const yt = /youtube/i.test(e.tv.nome || '');
    // No Telegram as setas trocam de vídeo: lá só tocar e pausar.
    const tg = !yt && /telegram|media viewer|visualizador de m[ií]dia/i.test(e.tv.nome || '');
    const nome = /^media viewer$/i.test(e.tv.nome || '') ? 'Vídeo do Telegram' : e.tv.nome;
    // O som da janela sai pelo notebook: este volume é o do programa dela (0 a 10), não o das mídias do Altar.
    const vol = dados.info ? dados.info.volumeJanela : null;
    return `<section class="jan-ctrl" aria-label="Mexer na janela do notebook">
      <div class="jan-tit">${I('janela')}<span><small>Na TV: janela do notebook</small><b>${esc(nome)}</b></span></div>
      ${tg ? `<div class="jan-botoes so-um">
        <button class="btn primary" data-acao="tecla" data-v="playPausa"><span class="pp">${I('play')}${I('pause')}</span><small>Tocar / Pausar</small></button>
      </div>
      <p class="note">Para adiantar e voltar, baixe o vídeo no Telegram e use "Fotos e vídeos do Telegram" aqui no celular.</p>`
      : `<div class="jan-botoes">
        <button class="btn" data-acao="tecla" data-v="voltar">${I('voltar10')}<small>Voltar${yt ? ' 10s' : ''}</small></button>
        <button class="btn primary" data-acao="tecla" data-v="playPausa"><span class="pp">${I('play')}${I('pause')}</span><small>Tocar / Pausar</small></button>
        <button class="btn" data-acao="tecla" data-v="avancar">${I('avancar10')}<small>Adiantar${yt ? ' 10s' : ''}</small></button>
      </div>`}
      <div class="jan-vol">
        <span>${I('som')} Volume</span>
        <button class="btn" data-acao="volumeJanela" data-v="-1" aria-label="Diminuir o volume da janela">${I('menos')}</button>
        <div class="hud-n" aria-label="${vol == null ? 'Volume ainda não medido' : `Volume ${vol} de 10`}">${vol == null ? '–' : vol}</div>
        <button class="btn" data-acao="volumeJanela" data-v="1" aria-label="Aumentar o volume da janela">${I('mais')}</button>
      </div>
      ${avisoTecla ? `<div class="aviso">${esc(avisoTecla)}</div>` : ''}
      <div class="jan-mais">
        ${yt ? `<button class="btn" data-acao="tecla" data-v="telaCheia">${I('tv')} Tela cheia</button>` : ''}
        <button class="btn" data-acao="abrirJanelas">${I('trocar')} Outra janela</button>
      </div>
      <button class="btn" data-cmd="sairJanela">${I('voltar')} Tirar da TV</button>
    </section>`;
  }

  // Escolher qual janela do notebook vai para a TV.
  function telaJanelas() {
    const l = escolhendoJanela.lista;
    const corpo = !l ? '<p class="note">Procurando as janelas abertas no notebook…</p>'
      : !l.length ? '<p class="note">Nenhuma janela aberta no notebook. Abra o vídeo (no navegador ou no Telegram) no notebook e toque em Procurar de novo.</p>'
      : `<div class="janelas-cel">${l.map((j, i) => `<button class="janela-cel" data-acao="escolherJanela" data-n="${i}">
          <img src="${j.miniatura}" alt=""><span>${esc(/^media viewer$/i.test(j.nome) ? "Vídeo do Telegram" : j.nome)}</span></button>`).join('')}</div>`;
    return `<div class="painel" role="dialog" aria-label="Mostrar janela do notebook">
      <div class="painel-topo"><h2>Qual janela vai para a TV?</h2><button class="btn" data-acao="fecharJanelas">${I('fechar')} Fechar</button></div>
      <div class="painel-corpo" data-scroll="janelas">
        <p class="note">Abra o vídeo no notebook (YouTube, Telegram…) e escolha a janela aqui. Depois dá para tocar, pausar, adiantar e voltar pelo celular.</p>
        ${corpo}
        <button class="btn" data-acao="abrirJanelas">${I('procurar')} Procurar de novo</button>
      </div></div>`;
  }

  // Vídeos que o pastor baixou no Telegram do notebook: toca um e ele vai para a reunião e para a TV.
  const quando = ms => {
    const d = new Date(ms), hoje = new Date();
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    if (d.toDateString() === hoje.toDateString()) return 'Hoje, ' + hora;
    if (d.toDateString() === ontem.toDateString()) return 'Ontem, ' + hora;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + hora;
  };
  const tamanho = b => b >= 1024 * 1024 * 1024 ? (b / 1024 / 1024 / 1024).toFixed(1).replace('.', ',') + ' GB' : Math.max(1, Math.round(b / 1024 / 1024)) + ' MB';
  // Aviso grande de "carregando" (rodinha + texto), para o pastor saber que está buscando.
  const carregando = (txt, sub = '') => `<div class="carregando" role="status"><span class="roda" aria-hidden="true"></span><b>${txt}</b>${sub ? `<span class="note">${sub}</span>` : ''}</div>`;
  const duracao = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  const INICIAIS = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const COR_CONV = ['#2b3858', '#1c6b46', '#8a4b14', '#6b2a5a', '#305a73', '#7a2a2f'];

  // Com a conta do Telegram ligada: conversas (como os chats do Telegram) → fotos e vídeos da conversa → baixa no notebook → TV.
  const TIPO_CONV = { grupo: 'Grupo', canal: 'Canal' };
  function telaTelegram() {
    const tg = telegram, t = encodeURIComponent(conexao.token);
    if (tg.modo === 'pasta') return telaTelegramPasta();
    const aviso = tg.aviso ? `<div class="aviso">${esc(tg.aviso)}</div>` : '';
    const topo = (titulo, volta) => `<div class="painel-topo">
        ${volta ? `<button class="btn" data-acao="${volta}" aria-label="Voltar">${I('esq')}</button>` : ''}
        <h2>${esc(titulo)}</h2><button class="btn" data-acao="fecharTelegram">${I('fechar')} Fechar</button></div>`;
    if (tg.modo === 'baixando') {
      const b = tg.baixando;
      const op = (naTv, icone, txt) => `<button class="btn tg-op ${b.naTv === naTv ? 'sel' : ''}" data-acao="escolhaTg" data-v="${naTv ? 'tv' : 'reuniao'}" aria-pressed="${b.naTv === naTv}">${I(icone)} ${txt}</button>`;
      return `<div class="painel" role="dialog" aria-label="Baixando do Telegram">${topo('Telegram')}
        <div class="painel-corpo"><div class="tg-baixando">
          ${I(b.tipo === 'foto' ? 'imagem' : 'video')}<b>${esc(b.titulo)}</b>
          <p class="note">${b.pct >= 100 ? 'Terminando…' : 'Baixando no notebook…'}</p>
          <div class="tg-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${b.pct}"><i style="width:${b.pct}%"></i></div>
          <p class="tg-pct">${b.pct}%</p>
        </div>
        <div class="tg-escolha"><p class="tg-escolha-tit">Quando terminar:</p>
          ${op(true, 'tv', 'Passar direto na TV')}
          ${op(false, 'lista', 'Só colocar na reunião')}
          ${b.naTv == null ? '<p class="note">Se não escolher, o celular pergunta quando terminar.</p>' : ''}
        </div></div></div>`;
    }
    if (tg.modo === 'pronto') {
      return `<div class="painel" role="dialog" aria-label="Pronto">${topo('Telegram')}
        <div class="painel-corpo"><div class="tg-baixando">
          ${I('ok')}<b>Pronto!</b>
          <p class="note">"${esc(tg.pronto.titulo)}" já está na reunião.</p>
        </div>
        <div class="tg-escolha">
          <button class="btn primary tg-op" data-acao="tgPassarNaTv">${I('tv')} Passar na TV agora</button>
          <button class="btn tg-op" data-acao="fecharTelegram">${I('lista')} Voltar para a reunião</button>
        </div></div></div>`;
    }
    if (tg.modo === 'videos') {
      const l = tg.videos, c = tg.conversa;
      const corpo = !l ? carregando('Buscando as fotos e os vídeos da conversa…')
        : !l.length ? '<p class="note">Essa conversa não tem fotos nem vídeos.</p>'
        : `<div class="janelas-cel">${l.map((v, i) => `<button class="janela-cel tg-video" data-acao="baixarTg" data-n="${i}">
            <span class="tg-capa">${I(v.tipo === 'foto' ? 'imagem' : 'video')}<img src="/tg-mini/${encodeURIComponent(c.id)}/${v.id}?t=${t}" alt="" loading="lazy" onerror="this.remove()">${v.tipo === 'foto' ? '' : `<span class="tg-dur">${duracao(v.duracao)}</span>`}</span>
            <span class="tg-info"><span class="tg-nome">${esc(v.titulo)}</span>
              <small>${v.tipo === 'foto' ? 'Foto' : 'Vídeo'} · ${quando(v.quando)}${v.tipo === 'foto' ? '' : ' · ' + tamanho(v.tamanho)}</small>
              ${v.naReuniao ? '<small class="tg-ja">Já está na reunião</small>' : v.jaBaixado ? '<small class="tg-ja">Já está no notebook</small>' : ''}</span></button>`).join('')}</div>`;
      return `<div class="painel" role="dialog" aria-label="Fotos e vídeos da conversa">${topo(c.nome, 'tgInicio')}
        <div class="painel-corpo" data-scroll="tg-videos">${aviso}
          ${l && l.length ? '<p class="note">Toque na foto ou no vídeo para colocar na reunião e passar na TV.</p>' : ''}${corpo}</div></div>`;
    }
    // início: as conversas, na ordem dos chats do Telegram (pessoas, grupos e canais juntos)
    const l = tg.conversas;
    const corpo = tg.ligada === null || (tg.ligada && !l) ? carregando('Buscando as conversas do Telegram…', 'Pode levar alguns segundos.')
      : !l.length ? '<p class="note">Nenhuma conversa recente tem foto ou vídeo.</p>'
      : `<div class="tg-conversas">${l.map((c, i) => `<button class="tg-conversa" data-acao="tgConversa" data-n="${i}">
          <span class="tg-av" style="background:${COR_CONV[i % COR_CONV.length]}">${esc(INICIAIS(c.nome))}</span>
          <span class="tg-info"><span class="tg-nome">${esc(c.nome)}</span><small>${TIPO_CONV[c.tipo] ? TIPO_CONV[c.tipo] + ' · ' : ''}${quando(c.quando)}</small></span>
          <span class="tg-qt">${c.qt >= 100 ? '99+' : c.qt} ${c.qt === 1 ? 'mídia' : 'mídias'}</span></button>`).join('')}</div>`;
    return `<div class="painel" role="dialog" aria-label="Fotos e vídeos do Telegram">${topo('Telegram')}
      <div class="painel-corpo" data-scroll="tg-conversas">${aviso}
        ${l && l.length ? '<p class="note">Escolha a conversa.</p>' : ''}${corpo}
        <button class="btn" data-acao="tgPasta">${I('video')} Baixados no notebook</button>
      </div></div>`;
  }

  // Vídeos que o pastor baixou no Telegram do notebook (sem conta ligada, ou "Baixados no notebook").
  function telaTelegramPasta() {
    const l = telegram.lista, t = encodeURIComponent(conexao.token);
    const comoBaixar = '<p class="note">No Telegram do notebook, abra a conversa, toque na setinha do vídeo para baixar e espere terminar. Ele aparece aqui sozinho.</p>';
    const corpo = !l ? carregando('Procurando os vídeos no notebook…')
      : !l.length ? `<div class="tg-vazio">${I('video')}<p><strong>Nenhum vídeo baixado ainda.</strong></p>${comoBaixar}</div>`
      : `<div class="janelas-cel">${l.map((v, i) => `<button class="janela-cel tg-video" data-acao="colocarTelegram" data-n="${i}">
          ${v.capa ? `<img src="/telegram-capa/${encodeURIComponent(v.capa)}?t=${t}" alt="">` : `<div class="tg-sem-capa">${I('video')}</div>`}
          <span class="tg-info"><span class="tg-nome">${esc(v.nome)}</span>
            <small>${quando(v.quando)} · ${tamanho(v.tamanho)}</small>
            ${v.naReuniao ? '<small class="tg-ja">Já está na reunião</small>' : ''}</span></button>`).join('')}</div>`;
    return `<div class="painel" role="dialog" aria-label="Vídeos baixados no notebook">
      <div class="painel-topo">${telegram.ligada ? `<button class="btn" data-acao="tgInicio" aria-label="Voltar">${I('esq')}</button>` : ''}
        <h2>${telegram.ligada ? 'Baixados no notebook' : 'Vídeos do Telegram'}</h2><button class="btn" data-acao="fecharTelegram">${I('fechar')} Fechar</button></div>
      <div class="painel-corpo" data-scroll="telegram">
        ${telegram.aviso ? `<div class="aviso">${esc(telegram.aviso)}</div>` : ''}
        ${l && l.length ? '<p class="note">Toque no vídeo para colocar na reunião e passar na TV.</p>' : ''}
        ${corpo}
        ${l && l.length ? comoBaixar : ''}
      </div></div>`;
  }
  function fecharTelegram() { telegram = null; clearInterval(relogioTelegram); relogioTelegram = null; }
  function abrirPasta() {
    telegram = { ...(telegram || {}), modo: 'pasta', lista: null, aviso: '' };
    enviar({ cmd: 'pedirTelegram' });
    clearInterval(relogioTelegram);
    relogioTelegram = setInterval(() => { if (telegram && telegram.modo === 'pasta') enviar({ cmd: 'pedirTelegram' }); }, 4000);
  }

  function listaReuniao() {
    const r = dados.reuniao, e = dados.estado;
    if (!r.itens.length) { arrumando = false; tirandoItem = null; }
    if (arrumando) return `<div class="m-reuniao"><b>${esc(tituloReuniao(r))}</b><span>${esc([quemAqui(r), r.hora].filter(Boolean).join(' · '))}</span></div>
      <div class="arr-topo"><p class="note">Para mudar a ordem, segure nas três barrinhas ${I('pega')} e arraste. A lixeira tira só da reunião: o arquivo continua na Biblioteca.</p>
        <button class="btn primary" data-acao="arrPronto">${I('ok')} Pronto</button></div>
      <div class="cards">${r.itens.map(cartaoArrumar).join('')}</div>
      <button class="btn primary huge" data-acao="arrPronto">${I('ok')} Pronto</button>`;
    return `${controleJanela()}
      <div class="m-reuniao"><b>${esc(tituloReuniao(r))}</b><span>${esc([quemAqui(r), r.hora].filter(Boolean).join(' · '))}</span></div>
      ${dados.estado.audio && dados.estado.audio.video && dados.estado.audio.tocando && dados.estado.tv.tipo === 'espera'
        ? '<p class="note aviso-espera">O fundo de espera está tocando na TV. Ele sai sozinho quando o primeiro item for para a TV.</p>' : ''}
      <div class="eyebrow">Toque para mostrar na TV</div>
      <div class="cards">${r.itens.length ? r.itens.map(cartao).join('') : '<p class="note">Esta reunião ainda não tem itens.</p>'}</div>
      <section class="mais-opcoes" aria-label="Colocar ou mostrar outras coisas">
        <button class="btn primary" data-acao="abrirColocar">${I('mais')} Colocar na reunião</button>
        ${r.itens.length ? `<button class="btn" data-acao="arrumar">${I('trocar')} Mudar a ordem ou tirar um item</button>` : ''}
        <button class="btn" data-acao="abrirTelegram">${I('video')} Fotos e vídeos do Telegram</button>
        ${e.tv.tipo === 'janela' ? '' : `<button class="btn" data-acao="abrirJanelas">${I('janela')} Mostrar uma janela do notebook na TV</button>`}
      </section>
      <button class="btn danger encerrar-sozinho" data-acao="encerrar">${I('ok')} Encerrar reunião</button>`;
  }

  // O nome que aparece na reunião: o do pastor deste celular; se o celular não sabe de quem é, o pastor da reunião.
  const quemAqui = r => nomeDoDono() || pastorDe(r);
  const pastorDe = r => { const p = (dados.pastores || []).find(x => x.id === r.pastorId); return p ? p.nome : r.pastor || ''; };
  function telaReuniao() {
    const r = dados.reuniao, e = dados.estado, aba = abaAtual();
    const preg = itemNaTv();
    let meio, chave;
    if (escolhendo) { meio = telaEscolha(); chave = `escolha-${escolhendo.etapa}-${escolhendo.test}-${escolhendo.l ?? ''}-${escolhendo.c ?? ''}`; }
    else if (palavraAberta && dados.versiculo) { meio = painelVersiculo(); chave = 'verso-' + dados.versiculo.capitulo; }
    else if (escolhendoMusica) { meio = telaMusicas(); chave = 'musicas'; }
    else if (pregacaoAberta && preg && preg.tipo === 'pregacao') { meio = painelPregacao(); chave = 'preg-' + preg.id; }
    else { meio = listaReuniao(); chave = 'reuniao'; }
    const apagada = e.tv.tipo === 'preto';
    const nav = (v, acao, ic, nome) => `<button class="m-nav-btn ${aba === v ? 'sel' : ''}" data-acao="${acao}"${aba === v ? ' aria-current="page"' : ''}>${I(ic)}${nome}</button>`;
    return `<div class="moldura">
      <header class="m-topo">
        <div class="m-cab"><b class="m-nome">${esc(tituloReuniao(r))}</b><span class="m-quem">${esc([quemAqui(r), r.hora].filter(Boolean).join(' · '))}</span></div>
        <div class="m-agora">
        <div class="m-tv" aria-hidden="true">${miniTv()}</div>
        <div class="m-info"><span class="m-eb">Na TV agora</span><b class="m-rot">${esc(rotuloCurto())}</b></div>
        <button class="m-apagar ${apagada ? 'live' : ''}" data-cmd="apagar">${I(apagada ? 'luz' : 'tvApagar')}<small>${apagada ? 'Ligar TV' : 'Apagar TV'}</small></button>
        </div>
      </header>
      <main class="m-meio" data-scroll="${esc(chave)}">${avisoConexao()}${meio}</main>
      <footer class="m-base">${hud()}
        <nav class="m-nav" aria-label="Partes da reunião">${nav('reuniao', 'navReuniao', 'lista', 'Reunião')}${nav('versiculo', 'navVersiculo', 'palavra', 'Versículo')}${nav('musica', 'navMusica', 'musica', 'Música')}</nav>
      </footer></div>`;
  }

  // ---------- versículo na TV: setas livres ----------
  // Números do capítulo que está na TV: o atual marcado, os preparados destacados.
  function gradeCapitulo(vs, palavra) {
    if (!vs.qtdCap) return '';
    const p = vs.planejado && palavra && palavra.passagens.find(x => x.id === vs.planejado.id);
    const preparado = n => p && p.ref.l === vs.ref.l && p.ref.c === vs.ref.c && n >= p.ref.v && n <= p.ate;
    return `<div class="eyebrow">Versículos de ${esc(vs.capitulo)}</div>
      <div class="numeros">${Array.from({ length: vs.qtdCap }, (_, i) => i + 1).map(n => n === vs.ref.v
        ? `<button class="btn sel" aria-current="true">${n}</button>`
        : `<button class="btn ${preparado(n) ? 'plan' : ''}" data-acao="irVersiculo" data-v="${n}">${n}</button>`).join('')}</div>`;
  }

  // ---------- a Palavra: setas livres + passagens preparadas ----------
  function painelVersiculo() {
    const vs = dados.versiculo;
    // Os preparados são os da Palavra que está na TV (a reunião pode ter várias).
    const tv = dados.estado.tv;
    const palavra = tv.tipo === 'item' ? dados.reuniao.itens.find(i => i.id === tv.itemId && i.tipo === 'palavra') : null;
    let aviso = '';
    if (vs.planejado && !vs.planejado.dentro) aviso = `Passou de ${esc(vs.planejado.titulo)}. Pode continuar lendo à vontade.`;
    if (vs.avulso) aviso = 'Escolhido na hora (fora do que foi preparado).';
    const preparados = palavra ? `<div class="eyebrow">Preparados para hoje</div>
        <div class="passagens">${palavra.passagens.map(p => {
          const atual = vs.planejado && vs.planejado.id === p.id;
          return `<button class="btn ${atual ? 'sel' : ''}" data-acao="passagem" data-item="${palavra.id}" data-p="${p.id}">${atual ? I('tv') + ' ' : ''}${esc(p.titulo)}</button>`;
        }).join('')}</div>` : '';
    const rodape = vs.avulso
      ? `<button class="btn huge" data-cmd="voltarReuniao">${I('voltar')} Voltar para a reunião</button>`
      : '';
    // O texto para o pastor ler, em destaque; no alto dele, a versão da Bíblia (um toque troca).
    const versoes = (vs.versoes || []).length > 1 ? `<span class="leitura-versoes" role="group" aria-label="Versão da Bíblia">${vs.versoes.map(v =>
      `<button class="btn ${v === vs.versao ? 'sel' : ''}" data-acao="trocarVersao" data-v="${esc(v)}" aria-pressed="${v === vs.versao}">${esc(v)}</button>`).join('')}</span>`
      : `<span class="leitura-versao">${esc(vs.versao)}</span>`;
    return `<div class="capbar">
          <button class="btn" data-cmd="passoVersiculo" data-delta="-1" ${vs.anterior ? '' : 'disabled'}>${I('esq')}<small>${esc(vs.anterior || 'início')}</small></button>
          <button class="btn atual" data-acao="abrirCapitulos">${esc(vs.capitulo)}<small>trocar capítulo ou livro</small></button>
          <button class="btn primary" data-cmd="passoVersiculo" data-delta="1" ${vs.proximo ? '' : 'disabled'}>${I('dir')}<small>${esc(vs.proximo || 'fim')}</small></button>
        </div>
        <div class="leitura" aria-label="Texto que está na TV">
          <div class="leitura-topo"><h2 class="leitura-ref">${esc(vs.rotulo)}${vs.partes > 1 ? `<small>${vs.parte + 1}/${vs.partes}</small>` : ''}</h2>${versoes}</div>
          <p>${vs.parte ? '' : `<b class="leitura-n">${vs.ref.v}</b>`}${esc(vs.texto)}</p></div>
        ${aviso ? `<p class="note">${aviso}</p>` : ''}
        ${gradeCapitulo(vs, palavra)}
        ${preparados}
        ${rodape}`;
  }

  // ---------- Pregação: ◀ ▶ grandes e todas as imagens para tocar ----------
  function painelPregacao() {
    const it = itemNaTv();
    const s = dados.estado.tv.slide, n = it.arquivos.length;
    return `<h2 class="m-titulo">${esc(it.titulo)}</h2>
        <div class="capbar">
          <button class="btn" data-cmd="passoSlide" data-delta="-1" ${s === 0 ? 'disabled' : ''}>${I('esq')}<small>anterior</small></button>
          <div class="contador"><b>${s + 1}</b><small>de ${n}</small></div>
          <button class="btn primary" data-cmd="passoSlide" data-delta="1" ${s === n - 1 ? 'disabled' : ''}>${I('dir')}<small>${s === n - 1 ? 'última' : 'próxima'}</small></button>
        </div>
        <div class="eyebrow">Todas as imagens · toque para ir direto</div>
        <div class="slides">${it.arquivos.map((a, i) => `<button class="slide ${i === s ? 'on' : ''}" data-acao="irSlide" data-n="${i}" aria-label="Imagem ${i + 1}">
          <img src="${conexao.midia(a)}" alt="" loading="lazy"><span>${i + 1}</span></button>`).join('')}</div>
        <button class="btn" data-acao="navReuniao">${I('lista')} Voltar para a lista da reunião</button>`;
  }

  // ---------- Música avulsa: qualquer música da Biblioteca ----------
  let catMusica = 'todas';      // categoria escolhida na lista de músicas do celular
  function telaMusicas() {
    const ordem = (x, y) => x.titulo.localeCompare(y.titulo, 'pt-BR', { numeric: true });
    const todas = (dados.musicas || []).slice().sort(ordem);
    const cats = (dados.categorias || []).filter(c => todas.some(m => m.categoria === c.id));
    const daCat = m => cats.some(c => c.id === m.categoria);
    const semCat = todas.some(m => !daCat(m));
    if (catMusica !== 'todas' && catMusica !== 'sem' && !cats.some(c => c.id === catMusica)) catMusica = 'todas';
    const lista = todas.filter(m => catMusica === 'todas' || (catMusica === 'sem' ? !daCat(m) : m.categoria === catMusica));
    const aba = (v, nome) => `<button class="btn ${catMusica === v ? 'sel' : ''}" data-acao="catMusica" data-v="${v}">${esc(nome)}</button>`;
    const abas = cats.length ? `<div class="cats-musica">${aba('todas', 'Todas')}${cats.map(c => aba(c.id, c.nome)).join('')}${semCat ? aba('sem', 'Outras') : ''}</div>` : '';
    const a = dados.estado.audio;
    const atual = id => a && !a.video && a.bibliotecaId === id;
    const situacao = () => (a.tocando ? 'Tocando' : a.terminou ? 'Terminou' : 'Pausada');
    // Cada música: toque para tocar; a estrela marca como favorita; o "+" coloca na reunião aberta.
    const jaNaReuniao = new Set(((dados.reuniao && dados.reuniao.itens) || []).map(i => i.bibliotecaId).filter(Boolean));
    const por = m => (jaNaReuniao.has(m.id)
      ? `<button class="btn musica-por ja" data-acao="musicaJaEsta" aria-label="${esc(m.titulo)} já está na reunião">${I('ok')}</button>`
      : `<button class="btn musica-por" data-acao="porMusicaNaReuniao" data-id="${m.id}" aria-label="Colocar na reunião: ${esc(m.titulo)}">${I('mais')}</button>`);
    const tocar = m => `<div class="musica-item">
        <button class="btn musica-linha ${atual(m.id) ? 'sel' : ''}" data-acao="tocarMusica" data-id="${m.id}"${atual(m.id) ? ' aria-current="true"' : ''}>
          ${I(atual(m.id) ? 'tocando' : 'musica')}<span class="musica-nome">${esc(m.titulo)}</span>${atual(m.id) ? `<span class="musica-tag">${situacao()}</span>` : ''}</button>
        <button class="btn musica-fav ${m.favorita ? 'sim' : ''}" data-acao="favMusica" data-id="${m.id}" aria-pressed="${!!m.favorita}" aria-label="${m.favorita ? 'Tirar das favoritas' : 'Marcar como favorita'}: ${esc(m.titulo)}">${I('estrela')}</button>
        ${por(m)}</div>`;
    // "Renomear músicas": toque na música e escreva o nome novo.
    const renomear = m => renomeandoMusica && renomeandoMusica.id === m.id
      ? `<div class="musica-renomear">
          <input type="text" id="musica-nome" class="campo-cel" value="${esc(renomeandoMusica.titulo)}" maxlength="80" autocomplete="off" aria-label="Nome da música">
          <div class="ta-botoes"><button class="btn" data-acao="renomearNao">Cancelar</button><button class="btn primary" data-acao="renomearSim">${I('ok')} Salvar</button></div></div>`
      : `<button class="btn musica-linha" data-acao="renomearMusica" data-id="${m.id}">${I('editar')}<span class="musica-nome">${esc(m.titulo)}</span></button>`;
    const linha = arrumandoMusicas ? renomear : tocar;
    // Em cima, o que está tocando, com pausar e parar ali mesmo.
    const agora = a && dados.musica
      ? `<div class="tocando-agora">
          <div class="ta-texto"><small>${a.video ? 'Som da tela de espera' : situacao() + (a.tocando ? ' agora' : '')}</small><b>${esc(dados.musica.titulo)}</b></div>
          <div class="ta-botoes">${a.tocando
            ? `<button class="btn" data-cmd="audioPausar">${I('pause')} Pausar</button>`
            : `<button class="btn" data-cmd="audioContinuar">${I(a.terminou ? 'denovo' : 'play')} ${a.terminou ? 'Tocar de novo' : 'Continuar'}</button>`}
            <button class="btn danger" data-cmd="audioParar">${I('parar')} Parar</button></div></div>`
      : '<p class="note">Toque numa música para tocar. A TV continua mostrando o que está nela.</p>';
    // Embaixo, as músicas em ordem alfabética. Em "Todas": as favoritas primeiro, depois o resto (por categoria, se houver).
    const bloco = (nome, l) => `<div class="eyebrow musica-grupo">${esc(nome)} · ${l.length}</div><div class="passagens">${l.map(linha).join('')}</div>`;
    let corpo;
    if (!todas.length) corpo = '<p class="note">Nenhuma música na Biblioteca ainda. Coloque as músicas pelo notebook.</p>';
    else if (!lista.length) corpo = '<p class="note">Nenhuma música nesta categoria.</p>';
    else if (catMusica === 'todas') {
      const favoritas = lista.filter(m => m.favorita), resto = lista.filter(m => !m.favorita);
      const grupos = [];
      if (favoritas.length) grupos.push(['Favoritas', favoritas]);
      if (cats.length) grupos.push(...cats.map(k => [k.nome, resto.filter(m => m.categoria === k.id)]), ['Outras', resto.filter(m => !daCat(m))]);
      else if (favoritas.length) grupos.push(['Outras músicas', resto]);
      const com = grupos.filter(g => g[1].length);
      corpo = com.length ? com.map(([nome, l]) => bloco(nome, l)).join('') : `<div class="passagens">${lista.map(linha).join('')}</div>`;
    } else {
      // Dentro de uma categoria: as favoritas vêm na frente.
      corpo = `<div class="passagens">${[...lista.filter(m => m.favorita), ...lista.filter(m => !m.favorita)].map(linha).join('')}</div>`;
    }
    if (arrumandoMusicas) {
      return `<h2 class="m-titulo">Renomear músicas</h2>
        <p class="note">Toque na música que quer renomear e escreva o nome novo.</p>
        ${abas}
        ${corpo}
        <button class="btn primary huge" data-acao="arrumarMusicasPronto">${I('ok')} Pronto</button>`;
    }
    return `<h2 class="m-titulo">Músicas${todas.length ? ` <span class="musica-qt">${todas.length}</span>` : ''}</h2>
        ${agora}
        ${abas}
        ${corpo}
        ${todas.length ? `<div class="musica-legenda">
          <p class="note musica-dica">${I('estrela')} Favorita: a música passa a aparecer primeiro.</p>
          <p class="note musica-dica">${I('mais')} Coloca na reunião: vira um cartão e fica salva nela.</p>
          <p class="note musica-dica">${I('ok')} Já está na reunião.</p></div>
        <button class="btn" data-acao="arrumarMusicas">${I('editar')} Renomear músicas</button>` : ''}`;
  }

  // ---------- Mandar arquivos do celular para o notebook ----------
  function telaEnvio() {
    const e = envio;
    let corpo;
    if (e.status === 'enviando') {
      corpo = `<div class="envio-andamento">
          <div class="grande">${I('enviar')}</div>
          <h3>Enviando ${e.total > 1 ? `${e.atual} de ${e.total}` : ''}…</h3>
          <div class="bar"><i data-envio-pct style="width:${e.pct}%"></i></div>
          <p class="note">Deixe esta tela aberta e o celular ligado até terminar.</p></div>`;
    } else if (e.status === 'pronto') {
      const r = e.resultado || {};
      const onde = e.naReuniao ? 'Já estão no fim da reunião.' : 'Estão na Biblioteca do notebook.';
      const msg = e.modo === 'pregacao'
        ? (r.repetida ? `Essa pregação já estava na Biblioteca ("${r.titulo}"). Não foi copiada de novo.${e.naReuniao ? ' Ela está na reunião.' : ''}`
          : r.qtd > 1 ? `${r.qtd} pregações chegaram no notebook, com ${r.imagens} imagens ao todo. ${onde}`
          : r.qtd ? `A pregação com ${r.imagens} imagens chegou no notebook. ${onde}`
          : r.semPowerPoint ? 'O notebook não tem o PowerPoint para abrir essa apresentação. Salve a apresentação como PDF e mande o PDF.'
          : 'Não deu certo. A pregação precisa de fotos, de um PDF ou de um PowerPoint.')
        : (r.qtd ? `${r.qtd} ${r.qtd === 1 ? 'arquivo chegou' : 'arquivos chegaram'} no notebook. ${onde}`
          : r.repetidos ? (e.naReuniao ? 'Esses arquivos já estavam no notebook. Estão na reunião.' : 'Esses arquivos já estavam na Biblioteca.') : 'Nenhum arquivo chegou.');
      corpo = `<div class="envio-andamento"><div class="grande">${I(r.qtd || r.repetidos || r.repetida ? 'ok' : 'alerta')}</div><h3>${esc(msg)}</h3>
          ${r.qtd && r.repetidos ? `<p class="note">${r.repetidos} ${r.repetidos === 1 ? 'já estava' : 'já estavam'} na Biblioteca e não ${r.repetidos === 1 ? 'foi copiado' : 'foram copiados'} de novo.</p>` : ''}
          ${r.semPowerPoint && e.modo !== 'pregacao' ? '<p class="note">O notebook não tem o PowerPoint para abrir a apresentação. Salve a apresentação como PDF e mande o PDF.</p>'
            : r.ignorados ? `<p class="note">${r.ignorados} ${r.ignorados === 1 ? 'arquivo não era' : 'arquivos não eram'} foto, vídeo, música, PDF ou PowerPoint e ${r.ignorados === 1 ? 'ficou' : 'ficaram'} de fora.</p>` : ''}
          ${!e.naReuniao && dados.reuniao && r.ids && r.ids.length
            ? `<button class="btn primary huge" data-acao="colocarRecebidos">${I('biblioteca')} Colocar na reunião agora</button>
               <button class="btn huge" data-acao="fecharEnvio">Agora não</button>`
            : '<button class="btn primary huge" data-acao="fecharEnvio">OK</button>'}</div>`;
    } else if (e.status === 'perguntar') {
      // Várias fotos de uma vez: o pastor decide na hora se cada uma é um cartão ou se viram uma pregação só.
      corpo = `<div class="envio-andamento"><div class="grande">${I('imagem')}</div><h3>Você escolheu ${e.arquivos.length} fotos. Como elas entram?</h3>
          <button class="btn primary huge envio-btn" data-acao="envioSeparadas"><span>${I('imagem')} Separadas</span><small>cada foto vira um cartão</small></button>
          <button class="btn huge envio-btn" data-acao="envioJuntas"><span>${I('pregacao')} Juntas numa pregação</span><small>um cartão só, que passa com as setas</small></button></div>`;
    } else if (e.status === 'erro') {
      corpo = `<div class="envio-andamento"><div class="grande">${I('alerta')}</div><h3>Não deu certo.</h3>
          <p class="note">Confira se o celular está no Wi-Fi da igreja e tente de novo.</p>
          <button class="btn primary huge" data-acao="envioDeNovo">Tentar de novo</button></div>`;
    } else {
      corpo = `<p class="note">${e.naReuniao ? 'Os arquivos vão para o notebook e já entram no fim da reunião.' : 'Os arquivos vão para a Biblioteca do notebook. Depois é só colocar na reunião.'}</p>
        <div class="eyebrow">O que vai mandar?</div>
        <label class="btn primary huge envio-btn">${I('imagem')} Fotos, vídeos e músicas
          <input type="file" data-envio="arquivos" accept="image/*,video/*,audio/*,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.slideshow,application/vnd.ms-powerpoint" multiple hidden></label>
        <label class="btn huge envio-btn">${I('pregacao')} Pregação ou palestra<small>o PDF ou o PowerPoint da palestra, ou todas as imagens na ordem; vira uma pregação só</small>
          <input type="file" data-envio="pregacao" accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.slideshow,application/vnd.ms-powerpoint" multiple hidden></label>`;
    }
    const ocupado = e.status === 'enviando';
    return `<div class="painel" role="dialog" aria-label="Mandar para o notebook">
      <div class="painel-topo"><h2>${e.naReuniao ? 'Mandar deste celular' : 'Mandar para a Biblioteca'}</h2>${ocupado ? '' : `<button class="btn" data-acao="fecharEnvio">${I('fechar')} Fechar</button>`}</div>
      <div class="painel-corpo" data-scroll="envio">${corpo}</div></div>`;
  }

  // ---------- Colocar da Biblioteca na reunião ----------
  // Separado pelo dia em que cada arquivo entrou na Biblioteca (o mais novo em cima).
  function porDia(lista) {
    const dias = [];
    for (const b of lista.slice().sort((x, y) => (y.criadoEm || '').localeCompare(x.criadoEm || ''))) {
      const u = dias[dias.length - 1];
      if (u && u.d === b.criadoEm) u.itens.push(b); else dias.push({ d: b.criadoEm, itens: [b] });
    }
    return dias;
  }
  function nomeDoDia(d) {
    if (!d) return 'Sem data';
    const [a, m, dd] = d.split('-').map(Number);
    const ddmm = String(dd).padStart(2, '0') + '/' + String(m).padStart(2, '0');
    const hoje = dados.hoje || new Date().toLocaleDateString('sv-SE');
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    if (d === hoje) return 'Hoje · ' + ddmm;
    if (d === ontem.toLocaleDateString('sv-SE')) return 'Ontem · ' + ddmm;
    return new Date(a, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'long' }) + ' · ' + ddmm;
  }
  const ABAS_BIB = [['imagem', 'Imagens'], ['video', 'Vídeos'], ['pregacao', 'Pregações'], ['musica', 'Músicas']];
  // "Colocar na reunião": uma porta só, e a pergunta é onde a coisa está.
  function telaColocar() {
    const origem = (acao, icone, titulo, texto) => `<button class="btn origem" data-acao="${acao}">${I(icone)}<span><b>${titulo}</b><small>${texto}</small></span></button>`;
    return `<div class="painel" role="dialog" aria-label="Colocar na reunião">
      <div class="painel-topo"><h2>Colocar na reunião</h2><button class="btn" data-acao="fecharColocar">${I('fechar')} Fechar</button></div>
      <div class="painel-corpo" data-scroll="colocar">
        <div class="eyebrow">Onde está o que você quer colocar?</div>
        ${origem('abrirBib', 'biblioteca', 'No notebook', 'Fotos, vídeos, músicas e pregações que já estão na Biblioteca')}
        ${origem('abrirEnvioReuniao', 'enviar', 'Neste celular', 'Manda agora e já entra na reunião')}
        ${secaoRecentes()}
      </div>
      ${recentes && recentes.sel.length ? `<div class="toolbar">
        <button class="btn primary" data-acao="colocarRecentes">Colocar ${recentes.sel.length} na reunião${recentesSaoFotos() ? ' (separadas)' : ''}</button>
        ${recentesSaoFotos() ? `<button class="btn" data-acao="juntarRecentes">${I('pregacao')} Juntar numa pregação</button>` : ''}</div>` : ''}
    </div>`;
  }

  // ---------- Últimas fotos e vídeos do celular (só no aplicativo Android) ----------
  // Uma página não consegue ver a galeria do celular; o aplicativo consegue. A página pede a lista e as miniaturas
  // em /__celular/ (quem responde é o aplicativo, não o notebook) e, na hora de mandar, é o aplicativo que envia
  // os arquivos para o notebook, avisando aqui quanto já foi.
  const QTD_RECENTES = 18;
  const appTemRecentes = () => !!(window.AltarApp && window.AltarApp.recentes && window.AltarApp.mandarRecentes);

  async function carregarRecentes() {
    if (!appTemRecentes()) { recentes = null; return; }
    const antes = recentes || {};
    let pode = false;
    try { pode = window.AltarApp.recentes() === 'sim'; } catch { /* aplicativo antigo */ }
    if (!pode) { recentes = { status: 'pedir', itens: [], sel: [], negou: !!(antes.negou || antes.pediu) }; desenhar(true); return; }
    if (antes.status !== 'lista') { recentes = { status: 'carregando', itens: [], sel: [] }; desenhar(true); }
    try {
      const r = await fetch(`/__celular/recentes.json?n=${QTD_RECENTES}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('status ' + r.status);
      const itens = await r.json();
      const marcados = (recentes && recentes.sel) || [];
      recentes = { status: 'lista', itens, sel: marcados.filter(id => itens.some(m => String(m.id) === id)) };
    } catch { recentes = { status: 'erro', itens: [], sel: [] }; }
    desenhar(true);
  }
  // O aplicativo chama quando a pessoa respondeu à pergunta de permissão (ou voltou dos ajustes do celular).
  window.aoMudarRecentes = () => { if (colocando) carregarRecentes(); };

  function secaoRecentes() {
    const r = recentes;
    if (!r) return '';
    let corpo;
    if (r.status === 'pedir') {
      corpo = `<button class="btn" data-acao="pedirRecentes">${I('imagem')} Mostrar aqui as últimas fotos e vídeos</button>
        ${r.negou ? '<p class="note">O celular não deixou o Altar ver as fotos. Toque de novo e escolha "Permitir".</p>' : ''}`;
    } else if (r.status === 'carregando') corpo = '<p class="note">Procurando as fotos…</p>';
    else if (r.status === 'erro') corpo = '<p class="note">Não deu para ver as fotos deste celular. Use o botão "Neste celular", aqui em cima.</p>';
    else if (!r.itens.length) corpo = '<p class="note">Nenhuma foto ou vídeo neste celular.</p>';
    else {
      corpo = `<p class="note">Toque para marcar. Entram no fim da reunião, na ordem em que você marcou.</p>
        <div class="recentes">${r.itens.map(m => {
          const n = r.sel.indexOf(String(m.id)) + 1, video = m.tipo === 'video';
          return `<button class="rec bib-img ${n ? 'on' : ''}" data-acao="marcarRecente" data-id="${m.id}" aria-pressed="${n ? 'true' : 'false'}" aria-label="${video ? 'Vídeo' : 'Foto'}${n ? ', marcado' : ''}">
            <img src="/__celular/mini/${video ? 'video' : 'imagem'}/${m.id}" alt="" loading="lazy">
            ${video ? `<i class="play">${I('play')}</i>${m.dur ? `<i class="qtd">${mmss(m.dur)}</i>` : ''}` : ''}
            ${n ? `<b class="ordem">${I('ok')} ${n}</b>` : ''}</button>`;
        }).join('')}</div>`;
    }
    return `<div class="eyebrow recentes-tit">Últimas fotos e vídeos deste celular</div>${corpo}`;
  }

  /** Duas ou mais marcadas, todas fotos: dá para juntar numa pregação. */
  const recentesSaoFotos = () => recentes.sel.length > 1 && recentes.sel.every(id => { const m = recentes.itens.find(x => String(x.id) === id); return m && m.tipo !== 'video'; });

  // O aplicativo manda os arquivos marcados; aqui fica só a tela de "Enviando…" (a mesma de "Neste celular").
  function mandarRecentes(modo = 'arquivos') {
    const itens = recentes.sel.map(id => recentes.itens.find(m => String(m.id) === id)).filter(Boolean).map(m => ({ id: m.id, tipo: m.tipo }));
    if (!itens.length) return;
    const lote = novoLote();
    colocando = false; recentes = null;
    envio = { status: 'enviando', naReuniao: true, total: itens.length, atual: 1, pct: 0, modo };
    window.aoMandarRecentes = async a => {
      if (!envio || envio.status !== 'enviando') return;
      if (!a.fim) {
        const mudou = a.atual !== envio.atual;
        envio.atual = a.atual; envio.pct = a.pct;
        if (mudou) desenhar(true);
        else { const barra = app.querySelector('[data-envio-pct]'); if (barra) barra.style.width = a.pct + '%'; }
        return;
      }
      window.aoMandarRecentes = null;
      if (a.ok) await terminarEnvio(lote, modo); else envio.status = 'erro';
      desenhar(true);
    };
    try { window.AltarApp.mandarRecentes(JSON.stringify({ lote, itens })); } catch { envio.status = 'erro'; }
  }

  function telaBiblioteca() {
    const b = escolhendoBib;
    const naReuniao = new Set(dados.reuniao.itens.map(i => i.bibliotecaId).filter(Boolean));
    const lista = (dados.biblioteca || []).filter(x => x.tipo === b.aba).slice().reverse();
    const qtd = t => (dados.biblioteca || []).filter(x => x.tipo === t).length;
    // Duas ou mais marcadas, todas imagens: dá para juntar numa pregação (um cartão só, com as setas).
    const juntar = b.sel.length > 1 && b.sel.every(id => (dados.biblioteca || []).some(x => x.id === id && x.tipo === 'imagem'));
    const miniatura = x => (x.tipo === 'imagem' || x.tipo === 'pregacao' || (x.tipo === 'video' && x.capa))
      ? `<img src="${conexao.midia(x.tipo === 'video' ? x.capa : x.arquivo)}" alt="" loading="lazy">${x.tipo === 'video' ? `<i class="play">${I('play')}</i>` : ''}`
      : `<span class="ic-grande">${ICONE[x.tipo]}</span>`;
    // Músicas: em ordem alfabética, com as favoritas na frente (como na aba "Música").
    const emOrdem = l => { const o = l.slice().sort((x, y) => x.titulo.localeCompare(y.titulo, 'pt-BR', { numeric: true })); return [...o.filter(x => x.favorita), ...o.filter(x => !x.favorita)]; };
    const cartaoBib = x => {
      const n = b.sel.indexOf(x.id) + 1;
      // Música não tem imagem: uma linha com o nome.
      if (x.tipo === 'musica') return `<button class="btn musica-linha bib-musica ${n ? 'on' : ''} ${x.favorita ? 'fav' : ''}" data-acao="marcarBib" data-id="${x.id}" aria-pressed="${!!n}">
        ${I(x.favorita ? 'estrela' : 'musica')}<span class="bib-musica-texto"><span class="musica-nome">${esc(x.titulo)}</span>${naReuniao.has(x.id) ? '<small>já está na reunião</small>' : ''}</span>
        ${n ? `<b class="ordem">${I('ok')} ${n}</b>` : ''}</button>`;
      return `<button class="bib ${n ? 'on' : ''}" data-acao="marcarBib" data-id="${x.id}">
        <span class="bib-img">${miniatura(x)}${n ? `<b class="ordem">${I('ok')} ${n}</b>` : ''}${x.qtd ? `<i class="qtd">${x.qtd}</i>` : ''}</span>
        <span class="bib-t">${esc(x.titulo)}</span>
        ${naReuniao.has(x.id) ? '<span class="bib-ja">já está na reunião</span>' : ''}</button>`;
    };
    return `<div class="painel" role="dialog" aria-label="Colocar da Biblioteca">
      <div class="painel-topo"><h2>Colocar na reunião</h2><button class="btn" data-acao="fecharBib">${I('fechar')} Fechar</button></div>
      <div class="painel-corpo" data-scroll="bib-${b.aba}">
        <div class="abas2 abas4">${ABAS_BIB.map(([t, nome]) => `<button class="btn ${b.aba === t ? 'sel' : ''}" data-acao="abaBib" data-v="${t}">${nome} (${qtd(t)})</button>`).join('')}</div>
        <p class="note">Toque para marcar. Entram no fim da reunião, na ordem em que você marcou.</p>
        ${!lista.length ? '<p class="note">Nada aqui ainda.</p>'
          : b.aba === 'musica' ? `<div class="passagens">${emOrdem(lista).map(cartaoBib).join('')}</div>`
          : porDia(lista).map(g => `<div class="eyebrow">${esc(nomeDoDia(g.d))}</div><div class="bibs">${g.itens.map(cartaoBib).join('')}</div>`).join('')}
      </div>
      <div class="toolbar"><button class="btn primary" data-acao="colocarBib" ${b.sel.length ? '' : 'disabled'}>${b.sel.length ? `Colocar ${b.sel.length} na reunião${juntar ? ' (separadas)' : ''}` : 'Marque o que vai entrar'}</button>
        ${juntar ? `<button class="btn" data-acao="juntarBib">${I('pregacao')} Juntar numa pregação</button>` : ''}</div>
    </div>`;
  }

  // Manda um arquivo por vez, mostrando quanto já foi.
  function subir(url, arquivo, aoAndar) {
    return new Promise((ok, falha) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.upload.onprogress = ev => { if (ev.lengthComputable) aoAndar(Math.round((ev.loaded / ev.total) * 100)); };
      x.onload = () => (x.status === 200 ? ok() : falha(new Error('status ' + x.status)));
      x.onerror = () => falha(new Error('rede'));
      x.send(arquivo);
    });
  }

  const novoLote = () => (Math.random().toString(36).slice(2, 12) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '');

  // Os arquivos do lote já chegaram no notebook: ele guarda na Biblioteca (e na reunião, se veio de "Colocar na reunião").
  async function terminarEnvio(lote, modo) {
    try {
      const naReuniao = envio.naReuniao && dados.estado.reuniaoId ? `&reuniao=${encodeURIComponent(dados.estado.reuniaoId)}` : '';
      const r = await fetch(`/api/enviar-fim?t=${encodeURIComponent(conexao.token)}&lote=${lote}&modo=${modo}${naReuniao}`, { method: 'POST' });
      if (!r.ok) throw new Error('fim ' + r.status);
      envio.resultado = await r.json();
      envio.status = 'pronto';
    } catch (e) {
      envio.status = 'erro';
    }
  }

  async function enviarArquivos(arquivos, modo) {
    const lista = Array.from(arquivos);
    if (!lista.length) return;
    const lote = novoLote();
    const t = encodeURIComponent(conexao.token);
    Object.assign(envio, { status: 'enviando', total: lista.length, atual: 0, pct: 0, modo });
    try {
      for (let i = 0; i < lista.length; i++) {
        envio.atual = i + 1; envio.pct = 0; desenhar(true);
        await subir(`/api/enviar?t=${t}&lote=${lote}&i=${i}&nome=${encodeURIComponent(lista[i].name || 'arquivo')}`, lista[i], p => {
          envio.pct = p;
          const barra = app.querySelector('[data-envio-pct]');
          if (barra) barra.style.width = p + '%';
        });
      }
      await terminarEnvio(lote, modo);
    } catch (e) {
      envio.status = 'erro';
    }
    desenhar(true);
  }

  // ---------- escolher um versículo: livro → capítulo → versículo ----------
  function telaEscolha() {
    const v = versao();
    const ind = indices[v];
    carregarIndice(v);
    const p = escolhendo;
    let titulo = 'Mostrar versículo', voltar = '', corpo;
    if (!ind || ind === 'carregando') {
      corpo = '<p class="note">Abrindo a Bíblia…</p>';
    } else if (p.etapa === 'livro') {
      const livros = p.test === 'AT' ? ind.slice(0, ULTIMO_DO_AT + 1) : ind.slice(ULTIMO_DO_AT + 1);
      corpo = `
        <div class="abas2 abas-test" role="group" aria-label="Testamento">
          <button class="btn ${p.test === 'AT' ? 'sel' : ''}" data-acao="testamento" data-v="AT" aria-pressed="${p.test === 'AT'}">Antigo Testamento</button>
          <button class="btn ${p.test === 'NT' ? 'sel' : ''}" data-acao="testamento" data-v="NT" aria-pressed="${p.test === 'NT'}">Novo Testamento</button>
        </div>
        <div class="eyebrow">Livros do ${p.test === 'AT' ? 'Antigo' : 'Novo'} Testamento</div>
        <div class="grade2">${livros.map(x => `<button class="btn" data-acao="livro" data-l="${x.l}">${esc(x.nome)}</button>`).join('')}</div>`;
    } else if (p.etapa === 'cap') {
      const livro = ind[p.l];
      titulo = `${livro.nome}: capítulo`;
      const atual = dados.versiculo && dados.versiculo.ref.l === p.l ? dados.versiculo.ref.c : null;
      corpo = `<button class="btn" data-acao="trocarLivro">${I('trocar')} Trocar o livro (agora: ${esc(livro.nome)})</button>
        <div class="eyebrow">Capítulos de ${esc(livro.nome)}</div>
        <div class="numeros">${livro.caps.map((_, i) => `<button class="btn ${i + 1 === atual ? 'sel' : ''}" data-acao="capitulo" data-c="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    } else {
      const livro = ind[p.l];
      titulo = `${livro.nome} ${p.c}: versículo`;
      voltar = `<button class="btn" data-acao="voltarEscolha">${I('esq')} Voltar</button>`;
      corpo = `<div class="numeros">${Array.from({ length: livro.caps[p.c - 1] }, (_, i) =>
        `<button class="btn" data-acao="versiculo" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    }
    return `<div class="m-titulo-linha">${voltar}<h2 class="m-titulo">${esc(titulo)}</h2></div>${corpo}`;
  }

  function avisoConexao() {
    if (con.conectado) return '';
    if (con.naoAchou) return `<div class="aviso perdido">
      <b>Esta página não está mais ligada ao notebook.</b>
      <span>Escaneie o QR code de novo:</span>
      <ol><li>No notebook, clique em <b>Conectar celular</b>.</li>
        <li>Abra a câmera do celular e aponte para o QR code.</li>
        <li>Toque no link que aparecer.</li></ol>
      <span class="note">Confira também se o Altar está aberto no notebook e se o celular está no Wi-Fi da igreja.</span>
      <button class="btn primary" data-acao="procurarDeNovo">${I('procurar')} Tentar achar o notebook de novo</button></div>`;
    if (con.procurando) return '<div class="aviso">Procurando o notebook na rede… só um instante.</div>';
    return '<div class="aviso">Procurando o notebook… Confira se o celular está no Wi-Fi da igreja.</div>';
  }

  // Dentro do aplicativo do Android (android/), a página pode pedir ao app para ler o QR code.
  const noApp = () => !!(window.AltarApp && window.AltarApp.lerQr);

  function telaSemToken() {
    return `<div class="pad escolher"><div class="marca-cel"><img class="marca-logo" src="/comum/icone.svg" alt="">Altar</div>
      <h1>Leia o QR code que aparece no notebook</h1>
      ${noApp()
        ? `<p class="note">O código deste celular não vale mais. Leia de novo o QR code na tela do notebook.</p>
           <button class="btn primary huge" data-acao="lerQrNoApp">Ler o QR code</button>`
        : '<p class="note">Abra a câmera do celular, aponte para o QR code na tela do notebook e toque no link que aparecer.</p>'}</div>`;
  }

  function telaConfirmar() {
    return `<div class="overlay"><h2>Encerrar a reunião?</h2><p>A TV volta para a tela de espera.</p>
      <button class="btn danger huge" data-cmd="encerrar">Sim, encerrar</button>
      <button class="btn huge" data-acao="cancelar">Não, continuar</button></div>`;
  }

  function telaDesconectar() {
    return `<div class="overlay"><h2>Desconectar este celular?</h2>
      <p>O aplicativo esquece este notebook. Para conectar de novo (neste ou em outro notebook), é só ler o QR code que aparece na tela dele.</p>
      <button class="btn danger huge" data-acao="desconectarSim">Sim, desconectar</button>
      <button class="btn huge" data-acao="desconectarNao">Não, continuar</button></div>`;
  }

  function sobreposicao() {
    if (confirmarEncerrar) return telaConfirmar();
    if (envio) return telaEnvio();
    if (escolhendoBib) return telaBiblioteca();
    if (escolhendoJanela) return telaJanelas();
    if (telegram) return telaTelegram();
    if (colocando) return telaColocar();
    return '';
  }

  function desenhar(forcar) {
    if (arrasto) return;   // arrastando um item: a tela é redesenhada quando o dedo soltar
    let html;
    if (dados) atualizarIcone();
    if (con.semToken) html = telaSemToken();
    else if (!dados) html = `<div class="pad">${avisoConexao() || '<p class="note">Carregando…</p>'}</div>`;
    if (dados && dados.estado.reuniaoId !== reuniaoVista) {
      reuniaoVista = dados.estado.reuniaoId; naInicio = false;
      // Entrou numa reunião que já está andando (o aplicativo foi aberto de novo): continua no que está na TV.
      if (reuniaoVista && dados.reuniao && !escolhendo && !escolhendoMusica) {
        const naTv = itemNaTv();
        if (dados.versiculo) palavraAberta = true;
        else if (naTv && naTv.tipo === 'pregacao') pregacaoAberta = true;
      }
    }
    if (con.semToken || !dados) { /* sem conexão: já decidido acima */ }
    else if (dados.estado.reuniaoId && dados.reuniao && !naInicio) { confirmarDesconectar = false; perguntandoDono = null; html = telaReuniao() + sobreposicao(); }
    else { if (telegram) fecharTelegram(); arrumando = false; tirandoItem = null; escolhendo = null; palavraAberta = false; pregacaoAberta = false; escolhendoMusica = false; escolhendoBib = null; colocando = false;
      if (dono === null && !perguntouDono && !dados.estado.reuniaoId && !confirmarDesconectar && !envio && !novaReuniao && !escolhendoJanela) { perguntouDono = true; perguntandoDono = { nome: '' }; }
      html = telaEscolher() + (confirmarDesconectar ? telaDesconectar() : perguntandoDono ? telaDono() : envio ? telaEnvio() : novaReuniao ? telaNovaReuniao() : confirmarEncerrar ? telaConfirmar() : escolhendoJanela ? telaJanelas() : '');}
    if (dados && dados.estado.reuniaoId && !naInicio) novaReuniao = null;
    if (dados && dados.estado.tv.tipo !== 'janela') avisoTecla = '';
    guardarPasso();

    // Se só o tempo do vídeo mudou, atualiza a barra sem redesenhar (o toque do pastor não se perde).
    const chave = html.replace(/data-prog="\w" style="width:[^"]*"/g, '').replace(/class="pino" style="left:[^"]*"/g, '').replace(/aria-valuenow="\d*"/g, '').replace(/<span data-tempo="\w">[^<]*<\/span>/g, '');
    if (!forcar && chave === chaveTela) {
      for (const [k, x] of [['v', dados.estado.video], ['a', dados.estado.audio]]) {
        if (!x) continue;
        if (arrastando === k) continue;
        const p = (x.dur ? Math.min(100, (x.t / x.dur) * 100) : 0) + '%';
        app.querySelectorAll(`[data-prog="${k}"]`).forEach(el => { el.style.width = p; });
        app.querySelectorAll(`[data-seek="${k}"] .pino`).forEach(el => { el.style.left = p; });
        app.querySelectorAll(`[data-tempo="${k}"]`).forEach(el => { el.textContent = mmss(x.t); });
      }
      return;
    }
    chaveTela = chave;
    const rolagem = {};
    app.querySelectorAll('[data-scroll]').forEach(el => { rolagem[el.dataset.scroll] = el.scrollTop; });
    const campo = document.activeElement && ['nr-nome', 'dono-nome', 'musica-nome'].includes(document.activeElement.id) ? document.activeElement.id : null;
    const digitando = campo ? document.activeElement.selectionStart : null;
    app.innerHTML = html;
    if (campo && document.getElementById(campo)) { const i = document.getElementById(campo); i.focus(); i.setSelectionRange(digitando, digitando); }
    app.querySelectorAll('[data-scroll]').forEach(el => { if (rolagem[el.dataset.scroll]) el.scrollTop = rolagem[el.dataset.scroll]; });
    window.Versiculo.ajustar(app);
  }

  // ---------- botão de voltar do celular ----------
  // Volta um passo: fecha o que está aberto por cima; na reunião, vai para a lista de reuniões
  // (a reunião continua aberta e a TV não muda). Só na lista o voltar sai do programa.
  function voltarUmPasso() {
    if (!dados || con.semToken) return false;
    const naReuniao = dados.estado.reuniaoId && dados.reuniao && !naInicio;
    if (arrasto) { soltarArrasto(false); return true; }
    if (confirmarEncerrar) { confirmarEncerrar = false; return true; }
    if (confirmarDesconectar) { confirmarDesconectar = false; return true; }
    if (perguntandoDono) { ACOES.donoFechar(); return true; }
    if (telegram) {
      if (telegram.modo === 'videos' || (telegram.modo === 'pasta' && telegram.ligada)) ACOES.tgInicio();
      else if (telegram.modo !== 'baixando') fecharTelegram();
      else return true; // baixando: fica na tela (o download continua)
      return true;
    }
    // O que foi aberto pela pergunta "Colocar na reunião" volta para ela.
    if (envio) {
      const paraColocar = naReuniao && envio.naReuniao && (envio.status === 'escolher' || envio.status === 'perguntar');
      if (envio.status !== 'enviando') { envio = null; if (paraColocar) ACOES.abrirColocar(); }
      return true;
    }
    if (escolhendoBib) { const paraColocar = naReuniao && escolhendoBib.deColocar; escolhendoBib = null; if (paraColocar) ACOES.abrirColocar(); return true; }
    if (colocando) { colocando = false; recentes = null; return true; }
    if (arrumando && naReuniao) {
      if (tirandoItem) tirandoItem = null; else arrumando = false;
      return true;
    }
    if (escolhendoJanela) { escolhendoJanela = null; return true; }
    if (novaReuniao) { novaReuniao = null; return true; }
    if (naReuniao && escolhendo) {
      if (escolhendo.etapa === 'vers') escolhendo = { ...escolhendo, etapa: 'cap', c: null };
      else if (escolhendo.etapa === 'cap') escolhendo = { etapa: 'livro', test: escolhendo.test };
      else escolhendo = null;
      return true;
    }
    if (renomeandoMusica) { renomeandoMusica = null; return true; }
    if (arrumandoMusicas) { arrumandoMusicas = false; return true; }
    if (naReuniao && (palavraAberta || pregacaoAberta || escolhendoMusica)) { palavraAberta = false; pregacaoAberta = false; escolhendoMusica = false; return true; }
    if (naReuniao) { naInicio = true; arrumando = false; tirandoItem = null; return true; }
    if (verApp) { verApp = false; return true; }
    if (verOutras) { verOutras = false; return true; }
    return false;
  }
  // Tem para onde voltar? (Tem de dizer "sim" exatamente quando o voltarUmPasso faria alguma coisa.)
  function temParaOndeVoltar() {
    if (!dados || con.semToken) return false;
    return !!(arrasto || confirmarEncerrar || confirmarDesconectar || perguntandoDono || telegram || envio || escolhendoBib || colocando || escolhendoJanela || novaReuniao || verOutras || verApp
      || (dados.estado.reuniaoId && dados.reuniao && !naInicio));
  }

  // No aplicativo (versão 5 em diante), o botão de voltar pergunta direto à página o que fazer:
  // "sim" = voltei um passo; "nao" = já está no começo, pode sair do aplicativo.
  window.altarVoltar = () => {
    if (!voltarUmPasso()) return 'nao';
    desenhar(true);
    return 'sim';
  };
  const appPerguntaVoltar = () => noApp() && versaoDoApp() >= 5;

  // No navegador (e no aplicativo antigo) o voltar anda no histórico do navegador. A página deixa um passo
  // guardado a cada toque (até 6), para vários "voltar" seguidos caírem aqui; chegando no começo, devolve os
  // passos que sobraram, e o próximo voltar sai da página. (Passo guardado sem toque o navegador pode pular.)
  let passos = 0, rebobinando = false, tocou = false;
  try { passos = (history.state && history.state.altar) || 0; } catch { /* sem histórico */ }
  function guardarPasso() {
    const comToque = tocou; tocou = false;
    if (appPerguntaVoltar() || rebobinando) return;
    try {
      if (!temParaOndeVoltar()) {
        if (passos > 0) { rebobinando = true; setTimeout(() => { rebobinando = false; }, 600); history.go(-passos); passos = 0; }
      } else if (passos === 0 || (comToque && passos < 6)) history.pushState({ altar: ++passos }, '');
    } catch { /* sem histórico */ }
  }
  window.addEventListener('popstate', ev => {
    passos = (ev.state && ev.state.altar) || 0;
    if (rebobinando) { rebobinando = false; return; }
    if (voltarUmPasso()) desenhar(true);
  });

  // ---------- arrastar um item da reunião para outro lugar ----------
  // O dedo pega pelas três barrinhas; os outros cartões abrem espaço; ao soltar, a ordem nova vai para o notebook.
  function comecarArrasto(ev, pega) {
    const el = pega.closest('.card.arrumar'), cards = [...el.parentNode.querySelectorAll('.card.arrumar')];
    if (cards.length < 2) return;
    ev.preventDefault();
    const rolo = el.closest('[data-scroll]') || document.scrollingElement;
    const caixas = cards.map(c => c.getBoundingClientRect());
    const de = cards.indexOf(el);
    arrasto = {
      id: el.dataset.item, el, cards, de, para: de, rolo, y: ev.clientY, y0: ev.clientY, rolo0: rolo.scrollTop, ponteiro: ev.pointerId,
      topo: caixas.map(c => c.top + rolo.scrollTop), alto: caixas.map(c => c.height),
      vao: caixas[1].top - caixas[0].bottom,
    };
    try { pega.setPointerCapture(ev.pointerId); } catch { /* toque de mentira (teste) */ }
    el.classList.add('arrastando');
    try { navigator.vibrate && navigator.vibrate(12); } catch { /* sem vibração */ }
    window.addEventListener('pointermove', moverArrasto);
    window.addEventListener('pointerup', aoSoltarArrasto);
    window.addEventListener('pointercancel', aoCancelarArrasto);
    arrasto.quadro = requestAnimationFrame(rolarArrasto);
  }
  function posicionarArrasto() {
    const a = arrasto, n = a.cards.length;
    let dy = (a.y - a.y0) + (a.rolo.scrollTop - a.rolo0);
    dy = Math.max(a.topo[0] - a.topo[a.de], Math.min(a.topo[n - 1] + a.alto[n - 1] - a.topo[a.de] - a.alto[a.de], dy));
    // Um vizinho abre espaço quando a borda do cartão arrastado passa do meio dele.
    const cima = a.topo[a.de] + dy, baixo = cima + a.alto[a.de], passo = a.alto[a.de] + a.vao;
    let para = a.de;
    a.cards.forEach((c, j) => {
      if (j === a.de) return;
      const meio = a.topo[j] + a.alto[j] / 2;
      const abre = j < a.de ? cima < meio : baixo > meio;
      if (abre) para += j < a.de ? -1 : 1;
      c.style.transform = abre ? `translateY(${j < a.de ? passo : -passo}px)` : '';
    });
    a.para = para;
    a.el.style.transform = `translateY(${dy}px)`;
  }
  function moverArrasto(ev) {
    if (!arrasto || ev.pointerId !== arrasto.ponteiro) return;
    arrasto.y = ev.clientY;
    posicionarArrasto();
  }
  // Com o dedo perto da borda de cima ou de baixo, a lista rola sozinha.
  function rolarArrasto() {
    if (!arrasto) return;
    const a = arrasto, c = a.rolo.getBoundingClientRect(), topo = Math.max(c.top, 0), fundo = Math.min(c.bottom, window.innerHeight);
    const v = a.y < topo + 70 ? -Math.ceil((topo + 70 - a.y) / 6) : a.y > fundo - 70 ? Math.ceil((a.y - (fundo - 70)) / 6) : 0;
    if (v) { const antes = a.rolo.scrollTop; a.rolo.scrollTop += Math.max(-14, Math.min(14, v)); if (a.rolo.scrollTop !== antes) posicionarArrasto(); }
    a.quadro = requestAnimationFrame(rolarArrasto);
  }
  function soltarArrasto(valeu) {
    const a = arrasto;
    if (!a) return;
    arrasto = null;
    cancelAnimationFrame(a.quadro);
    window.removeEventListener('pointermove', moverArrasto);
    window.removeEventListener('pointerup', aoSoltarArrasto);
    window.removeEventListener('pointercancel', aoCancelarArrasto);
    const itens = dados && dados.reuniao && dados.reuniao.itens, i = itens ? itens.findIndex(x => x.id === a.id) : -1;
    if (valeu && a.para !== a.de && i === a.de) {
      // Já mostra na ordem nova (o notebook confirma em seguida).
      itens.splice(a.para, 0, itens.splice(i, 1)[0]);
      tirandoItem = null;
      enviar({ cmd: 'moverItemDaReuniao', itemId: a.id, delta: a.para - a.de });
    }
    desenhar(true);
  }
  function aoSoltarArrasto(ev) { if (arrasto && ev.pointerId === arrasto.ponteiro) soltarArrasto(true); }
  function aoCancelarArrasto(ev) { if (arrasto && ev.pointerId === arrasto.ponteiro) soltarArrasto(false); }
  app.addEventListener('pointerdown', ev => {
    const pega = ev.target.closest && ev.target.closest('.arr-pega');
    if (pega && !arrasto && (ev.button || 0) === 0) comecarArrasto(ev, pega);
  });
  // Segurar o dedo nas barrinhas não abre o menu do navegador.
  app.addEventListener('contextmenu', ev => { if (ev.target.closest && ev.target.closest('.card.arrumar')) ev.preventDefault(); });

  // ---------- toques ----------
  const ACOES = {
    procurarDeNovo: () => conexao.procurarDeNovo(),
    abrirJanelas: () => { escolhendoJanela = { lista: null }; enviar({ cmd: 'pedirJanelas' }); },
    fecharJanelas: () => { escolhendoJanela = null; },
    abrirTelegram: () => {
      telegram = { modo: 'inicio', ligada: null, conversas: null };
      enviar({ cmd: 'pedirTgConversas' });
    },
    tgInicio: () => {
      clearInterval(relogioTelegram); relogioTelegram = null;
      telegram = { ...telegram, modo: 'inicio', aviso: '' };
      if (!telegram.conversas) enviar({ cmd: 'pedirTgConversas' });
    },
    tgPasta: () => abrirPasta(),
    tgConversa: el => {
      const c = telegram && telegram.conversas && telegram.conversas[Number(el.dataset.n)];
      if (!c) return;
      telegram = { ...telegram, modo: 'videos', conversa: c, videos: null, aviso: '' };
      enviar({ cmd: 'pedirTgVideos', conversa: c.id });
    },
    baixarTg: el => {
      const v = telegram && telegram.videos && telegram.videos[Number(el.dataset.n)];
      if (!v) return;
      telegram = { ...telegram, modo: 'baixando', baixando: { msg: v.id, titulo: v.titulo, tipo: v.tipo, pct: 0, naTv: null }, aviso: '' };
      enviar({ cmd: 'baixarTg', conversa: telegram.conversa.id, msg: v.id });
    },
    escolhaTg: el => {
      if (!telegram || telegram.modo !== 'baixando') return;
      const naTv = el.dataset.v === 'tv';
      telegram.baixando.naTv = naTv;
      enviar({ cmd: 'escolhaTg', naTv });
    },
    tgPassarNaTv: () => {
      if (!telegram || !telegram.pronto) return;
      enviar({ cmd: 'mostrar', itemId: telegram.pronto.itemId });
      fecharTelegram(); escolhendo = null; escolhendoMusica = false; palavraAberta = false; pregacaoAberta = false;
    },
    fecharTelegram: () => fecharTelegram(),
    voltarReuniao: () => { naInicio = false; },
    colocarTelegram: el => {
      const v = telegram && telegram.lista && telegram.lista[Number(el.dataset.n)];
      if (!v) return;
      enviar({ cmd: 'colocarTelegram', nome: v.nome });
      fecharTelegram();
      escolhendo = null; escolhendoMusica = false; palavraAberta = false; pregacaoAberta = false;
    },
    escolherJanela: el => {
      const j = escolhendoJanela && escolhendoJanela.lista && escolhendoJanela.lista[Number(el.dataset.n)];
      if (j) enviar({ cmd: 'mostrarJanela', fonteId: j.id, nome: j.nome });
      escolhendoJanela = null; avisoTecla = '';
      escolhendo = null; escolhendoMusica = false; palavraAberta = false; pregacaoAberta = false;
    },
    tecla: el => { avisoTecla = ''; enviar({ cmd: 'teclaJanela', acao: el.dataset.v }); },
    volumeJanela: el => { avisoTecla = ''; enviar({ cmd: 'volumeJanela', delta: Number(el.dataset.v) }); },
    navReuniao: () => { escolhendo = null; escolhendoMusica = false; palavraAberta = false; pregacaoAberta = false; },
    navVersiculo: () => {
      escolhendoMusica = false; pregacaoAberta = false;
      if (escolhendo) return;
      // Já tem versículo na TV: abre as setas dele. Se não, abre a Bíblia para escolher.
      if (dados.versiculo) palavraAberta = true;
      else escolhendo = { etapa: 'livro', test: 'AT' };
    },
    navMusica: () => { escolhendoMusica = true; escolhendo = null; palavraAberta = false; pregacaoAberta = false; arrumandoMusicas = false; renomeandoMusica = null; },
    encerrar: () => { confirmarEncerrar = true; },
    // Arrumar a reunião pelo celular: ordem dos itens e tirar um item
    arrumar: () => { arrumando = true; tirandoItem = null; },
    arrPronto: () => { arrumando = false; tirandoItem = null; },
    trocarVersao: el => { if (el.dataset.v !== (dados.versiculo && dados.versiculo.versao)) enviar({ cmd: 'trocarVersao', versao: el.dataset.v }); },
    arrTirar: el => { tirandoItem = tirandoItem === el.dataset.item ? null : el.dataset.item; },
    arrTirarNao: () => { tirandoItem = null; },
    arrTirarSim: el => { tirandoItem = null; enviar({ cmd: 'tirarItemDaReuniao', itemId: el.dataset.item }); },
    desconectarApp: () => { confirmarDesconectar = true; },
    desconectarNao: () => { confirmarDesconectar = false; },
    desconectarSim: () => {
      confirmarDesconectar = false;
      // O aplicativo antigo ainda não sabe desconectar: abre direto a câmera para ler o outro QR code.
      try { if (window.AltarApp.desconectar) window.AltarApp.desconectar(); else window.AltarApp.lerQr(); } catch { /* fora do aplicativo */ }
    },
    cancelar: () => { confirmarEncerrar = false; },
    lerQrNoApp: () => { if (noApp()) window.AltarApp.lerQr(); },
    outras: () => { verOutras = !verOutras; },
    app: () => { verApp = !verApp; },
    atualizarApp: () => {
      atualizacaoApp = { status: 'baixando', pct: 0 };
      try { window.AltarApp.atualizar(); } catch { atualizacaoApp = { status: 'erro' }; }
    },
    novaReuniao: () => {
      novaReuniao = { nome: '' };
    },
    // De quem é este celular
    donoAbrir: () => { perguntandoDono = { nome: '' }; },
    // Fechar sem responder vale como "agora não": a pergunta não abre sozinha de novo.
    donoFechar: () => { perguntandoDono = null; if (dono === null) guardarDono({ nao: true }); },
    donoNao: () => { perguntandoDono = null; guardarDono({ nao: true }); },
    donoEscolher: el => {
      const p = (dados.pastores || []).find(x => x.id === el.dataset.id);
      if (p) guardarDono({ id: p.id, nome: p.nome });
      perguntandoDono = null;
    },
    donoGuardar: () => {
      const nome = perguntandoDono.nome.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!nome) return;
      const p = (dados.pastores || []).find(x => mesmoNome(x.nome, nome));
      guardarDono({ id: p ? p.id : null, nome: p ? p.nome : nome });
      if (!p) enviar({ cmd: 'souPastor', nome });   // entra na lista de pastores do notebook
      perguntandoDono = null;
    },
    fecharNovaReuniao: () => { novaReuniao = null; },
    nrNome: el => { novaReuniao.nome = novaReuniao.nome === el.dataset.nome ? '' : el.dataset.nome; },
    nrCriar: () => {
      // Ninguém escolhe "quem vai conduzir": a reunião fica com o pastor deste celular, se ele disse quem é.
      const meu = meuPastor();
      enviar({ cmd: 'criarReuniaoAgora', pastorId: meu ? meu.id : null, nome: novaReuniao.nome });
      novaReuniao = null;
    },
    cartao: el => {
      const it = dados.reuniao.itens.find(i => i.id === el.dataset.item);
      if (!it) return;
      enviar({ cmd: 'mostrar', itemId: it.id });
      palavraAberta = it.tipo === 'palavra';
      pregacaoAberta = it.tipo === 'pregacao';
    },
    fecharPregacao: () => { pregacaoAberta = false; },
    irSlide: el => enviar({ cmd: 'irSlide', n: Number(el.dataset.n) }),
    abrirMusicas: () => { escolhendoMusica = true; },
    catMusica: el => { catMusica = el.dataset.v; },
    abrirEnvio: () => { envio = { status: 'escolher' }; },
    abrirColocar: () => { colocando = true; recentes = null; carregarRecentes(); },
    fecharColocar: () => { colocando = false; recentes = null; },
    pedirRecentes: () => { if (recentes) recentes.pediu = true; try { window.AltarApp.pedirRecentes(); } catch { /* aplicativo antigo */ } },
    marcarRecente: el => {
      const s = recentes.sel, i = s.indexOf(el.dataset.id);
      if (i >= 0) s.splice(i, 1); else s.push(el.dataset.id);
    },
    colocarRecentes: () => mandarRecentes(),
    juntarRecentes: () => mandarRecentes('pregacao'),
    abrirEnvioReuniao: () => { colocando = false; envio = { status: 'escolher', naReuniao: true }; },
    colocarRecebidos: () => {
      // Abre "Colocar na reunião" já com o que acabou de chegar marcado.
      const ids = envio.resultado.ids;
      const primeiro = (dados.biblioteca || []).find(x => x.id === ids[0]);
      escolhendoBib = { aba: primeiro ? primeiro.tipo : 'imagem', sel: [...ids] };
      envio = null;
    },
    abrirBib: () => { colocando = false; escolhendoBib = { aba: 'imagem', sel: [], deColocar: true }; },
    fecharBib: () => { escolhendoBib = null; },
    abaBib: el => { escolhendoBib.aba = el.dataset.v; },
    marcarBib: el => {
      const s = escolhendoBib.sel, i = s.indexOf(el.dataset.id);
      if (i >= 0) s.splice(i, 1); else s.push(el.dataset.id);
    },
    colocarBib: () => {
      enviar({ cmd: 'colocarDaBiblioteca', bibliotecaIds: escolhendoBib.sel });
      escolhendoBib = null;
    },
    juntarBib: () => {
      enviar({ cmd: 'juntarDaBiblioteca', bibliotecaIds: escolhendoBib.sel });
      escolhendoBib = null;
    },
    envioDeNovo: () => { envio.status = 'escolher'; },
    envioSeparadas: () => { const a = envio.arquivos; envio.arquivos = null; enviarArquivos(a, 'arquivos'); },
    envioJuntas: () => { const a = envio.arquivos; envio.arquivos = null; enviarArquivos(a, 'pregacao'); },
    fecharEnvio: () => { envio = null; },
    fecharMusicas: () => { escolhendoMusica = false; },
    // Favorita e nome novo: já mostram na tela enquanto o notebook grava.
    favMusica: el => {
      const m = (dados.musicas || []).find(x => x.id === el.dataset.id);
      if (!m) return;
      m.favorita = !m.favorita;
      enviar({ cmd: 'favoritarMusica', id: m.id, sim: m.favorita });
    },
    // Coloca a música no fim da reunião aberta; o "+" vira "já está" assim que o notebook grava.
    porMusicaNaReuniao: el => { enviar({ cmd: 'colocarDaBiblioteca', bibliotecaIds: [el.dataset.id] }); },
    musicaJaEsta: () => {},
    arrumarMusicas: () => { arrumandoMusicas = true; renomeandoMusica = null; },
    arrumarMusicasPronto: () => { arrumandoMusicas = false; renomeandoMusica = null; },
    renomearMusica: el => {
      const m = (dados.musicas || []).find(x => x.id === el.dataset.id);
      if (!m) return;
      renomeandoMusica = { id: m.id, titulo: m.titulo };
      setTimeout(() => { const i = document.getElementById('musica-nome'); if (i) { i.focus(); i.select(); } }, 60);
    },
    renomearNao: () => { renomeandoMusica = null; },
    renomearSim: () => {
      if (!renomeandoMusica) return;
      const titulo = String(renomeandoMusica.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const m = (dados.musicas || []).find(x => x.id === renomeandoMusica.id);
      if (titulo && m && titulo !== m.titulo) { m.titulo = titulo; enviar({ cmd: 'renomearMusica', id: m.id, titulo }); }
      renomeandoMusica = null;
    },
    tocarMusica: el => { enviar({ cmd: 'tocarMusica', bibliotecaId: el.dataset.id }); },   // continua na aba "Música"
    passagem: el => { enviar({ cmd: 'mostrarPassagem', itemId: el.dataset.item, passagemId: el.dataset.p }); palavraAberta = true; },
    fecharVerso: () => { palavraAberta = false; },
    irVersiculo: el => enviar({ cmd: 'irVersiculo', v: Number(el.dataset.v) }),
    trocarLivro: () => { escolhendo = { etapa: 'livro', test: escolhendo.test }; },
    abrirCapitulos: () => {
      const l = dados.versiculo.ref.l;
      escolhendo = { etapa: 'cap', l, c: null, test: l > ULTIMO_DO_AT ? 'NT' : 'AT' };
    },
    abrirEscolha: () => { escolhendo = { etapa: 'livro', test: 'AT' }; },
    fecharEscolha: () => { escolhendo = null; },
    testamento: el => { escolhendo.test = el.dataset.v; },
    livro: el => {
      const l = Number(el.dataset.l);
      const livro = indices[versao()][l];
      // Livro de um capítulo só (Obadias, Judas...): vai direto para os versículos.
      escolhendo = { ...escolhendo, l, etapa: livro.caps.length === 1 ? 'vers' : 'cap', c: livro.caps.length === 1 ? 1 : null };
    },
    capitulo: el => { escolhendo = { ...escolhendo, c: Number(el.dataset.c), etapa: 'vers' }; },
    voltarEscolha: () => {
      const livro = indices[versao()][escolhendo.l];
      if (escolhendo.etapa === 'vers' && livro.caps.length > 1) escolhendo = { ...escolhendo, etapa: 'cap', c: null };
      else escolhendo = { etapa: 'livro', test: escolhendo.test };
    },
    versiculo: el => abrirVersiculo({ l: escolhendo.l, c: escolhendo.c, v: Number(el.dataset.v) }),
  };

  // Se já tem versículo na TV (na Palavra ou avulso), só pula para o novo e continua ali.
  // Se não, abre como versículo avulso por cima da reunião.
  function abrirVersiculo(ref) {
    if (dados.versiculo) enviar({ cmd: 'irVersiculo', ...ref });
    else enviar({ cmd: 'mostrarVersiculo', ref });
    escolhendo = null;
    palavraAberta = true;
  }

  // Barrinha da música/vídeo: tocar ou arrastar leva para aquele ponto.

  function pontoDaBarra(barra, ev) {
    const r = barra.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const p = (f * 100) + '%';
    barra.querySelector('i').style.width = p;
    barra.querySelector('.pino').style.left = p;
    return f;
  }
  app.addEventListener('pointerdown', ev => {
    const barra = ev.target.closest('[data-seek]');
    if (!barra || !Number(barra.dataset.dur)) return;
    ev.preventDefault();
    arrastando = barra.dataset.seek;
    barra.setPointerCapture(ev.pointerId);
    barra.classList.add('arrastando');
    pontoDaBarra(barra, ev);
    const mover = e => pontoDaBarra(barra, e);
    const soltar = e => {
      barra.removeEventListener('pointermove', mover);
      barra.removeEventListener('pointerup', soltar);
      barra.removeEventListener('pointercancel', soltar);
      barra.classList.remove('arrastando');
      const t = pontoDaBarra(barra, e) * Number(barra.dataset.dur);
      enviar({ cmd: arrastando === 'a' ? 'audioIr' : 'videoIr', t });
      arrastando = null;
    };
    barra.addEventListener('pointermove', mover);
    barra.addEventListener('pointerup', soltar);
    barra.addEventListener('pointercancel', soltar);
  });

  app.addEventListener('click', ev => {
    const el = ev.target.closest('[data-cmd], [data-acao]');
    if (!el || el.disabled) return;
    tocou = true;
    const acao = el.dataset.acao;
    if (acao && ACOES[acao]) { ACOES[acao](el); desenhar(true); return; }
    const cmd = el.dataset.cmd;
    if (!cmd) return;
    if (cmd === 'encerrar') confirmarEncerrar = false;
    if (cmd === 'escolherReuniao') {
      // A reunião que já está aberta: só volta para ela (abrir de novo recomeçaria a TV).
      if (!(dados && dados.estado.reuniaoId === el.dataset.id)) enviar({ cmd, id: el.dataset.id });
      naInicio = false; desenhar(true);
    }
    else if (cmd === 'volume' || cmd === 'passoVersiculo' || cmd === 'passoSlide') enviar({ cmd, delta: Number(el.dataset.delta) });
    else enviar({ cmd });
    if (cmd === 'encerrar') desenhar(true);
  });

  // Escolheu os arquivos no celular: já começa a mandar.
  app.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target.id === 'musica-nome') { ev.preventDefault(); ACOES.renomearSim(); desenhar(true); }
  });
  app.addEventListener('input', ev => {
    if (ev.target.id === 'nr-nome' && novaReuniao) novaReuniao.nome = ev.target.value;
    if (ev.target.id === 'dono-nome' && perguntandoDono) perguntandoDono.nome = ev.target.value;
    if (ev.target.id === 'musica-nome' && renomeandoMusica) renomeandoMusica.titulo = ev.target.value;
  });
  app.addEventListener('change', ev => {
    const input = ev.target.closest('input[data-envio]');
    if (!input || !envio || !input.files.length) return;
    const arquivos = Array.from(input.files);
    // Só fotos, e mais de uma: pergunta se entram separadas ou juntas numa pregação.
    if (input.dataset.envio === 'arquivos' && arquivos.length > 1 && arquivos.every(a => /^image\//.test(a.type))) {
      Object.assign(envio, { status: 'perguntar', arquivos });
      desenhar(true);
    } else enviarArquivos(arquivos, input.dataset.envio);
  });

  window.addEventListener('resize', () => window.Versiculo.ajustar(app));

  // Tela do celular acesa (só funciona onde o navegador permite).
  async function manterAceso() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  document.addEventListener('visibilitychange', manterAceso);
  manterAceso();

  desenhar(true);
})();
