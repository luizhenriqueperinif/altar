// Desenho do versículo: usado no Telão, na miniatura do celular e no "Testar" do notebook.
(function () {
  // Fundos que já vêm no programa. O id é guardado na reunião (ver FUNDOS_PRONTOS em src/main/dados.js).
  const FUNDOS = [
    // Fotos da pasta src/web/comum/fundos. A primeira é o padrão.
    { id: 'biblia-aberta', nome: 'Bíblia aberta', foto: '/comum/fundos/biblia-aberta.jpg', escuro: false },
    { id: 'amanhecer-dourado', nome: 'Amanhecer dourado', foto: '/comum/fundos/amanhecer-dourado.jpg', escuro: false },
    { id: 'biblia-luz', nome: 'Bíblia com luz', foto: '/comum/fundos/biblia-luz.jpg', escuro: false },
    { id: 'deserto-judeia', nome: 'Deserto da Judeia', foto: '/comum/fundos/deserto-judeia.jpg', escuro: false },
    { id: 'cruz-paisagem', nome: 'Cruz na paisagem', foto: '/comum/fundos/cruz-paisagem.jpg', escuro: false },
    { id: 'paisagem', nome: 'Paisagem', foto: '/comum/fundos/paisagem.jpg', escuro: false },
    { id: 'getsemani', nome: 'Jardim do Getsêmani', foto: '/comum/fundos/getsemani.jpg', escuro: false },
    { id: 'mar-galileia', nome: 'Mar da Galileia', foto: '/comum/fundos/mar-galileia.jpg', escuro: false },
    { id: 'monte-oliveiras', nome: 'Monte das Oliveiras', foto: '/comum/fundos/monte-oliveiras.jpg', escuro: false },
    { id: 'monte-sinai', nome: 'Monte Sinai', foto: '/comum/fundos/monte-sinai.jpg', escuro: false },
    { id: 'rio-jordao', nome: 'Rio Jordão', foto: '/comum/fundos/rio-jordao.jpg', escuro: false },
    { id: 'vale-jezreel', nome: 'Vale de Jezreel', foto: '/comum/fundos/vale-jezreel.jpg', escuro: false },
  ];
  // Foto de fundo com um véu escuro para o texto aparecer (mais escuro no meio, onde fica a letra).
  const comVeu = url => `radial-gradient(120% 95% at 50% 50%, rgba(0,0,0,.62) 0%, rgba(0,0,0,.5) 60%, rgba(0,0,0,.4) 100%), url("${url}") center / cover no-repeat`;
  // Fundo desenhado (céu, amanhecer...): um véu leve, para a letra branca não sumir nas partes claras.
  const comVeuLeve = css => `linear-gradient(rgba(0,0,0,.26), rgba(0,0,0,.26)), ${css}`;

  /** Estilo do fundo: { pronto: 'biblia-aberta' } ou { arquivo } (imagem da Biblioteca, com um véu escuro para o texto aparecer). */
  function estiloFundo(fundo, midia) {
    if (fundo && fundo.arquivo) {
      return { bg: comVeu(midia(fundo.arquivo)), escuro: false };
    }
    const f = FUNDOS.find(x => x.id === (fundo && fundo.pronto)) || FUNDOS[0];
    return { bg: f.foto ? comVeu(f.foto) : f.escuro ? f.css : comVeuLeve(f.css), escuro: f.escuro };
  }

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** HTML do versículo. Depois de colocar na página, chame Versiculo.ajustar(elemento). */
  // Na TV aparece só a referência ("João 3:16"), sem a sigla da versão (ACF, NVI...).
  // letraMax: a maior letra que pode usar, em fração da altura da tela (vem de Configurações).
  function html({ texto, rotulo, fundo, parte, partes, letraMax }, midia) {
    const f = estiloFundo(fundo, midia);
    // Versículo comprido em mais de uma tela: "1/2" ao lado da referência.
    const tela = partes > 1 ? ` · ${(parte || 0) + 1}/${partes}` : '';
    return `<div class="vs ${f.escuro ? 'vs-escuro' : ''}" style='background:${f.bg}' data-vs data-max="${Number(letraMax) || 0.13}">
      <div class="vs-caixa"><p class="vs-texto">${esc(texto)}</p><div class="vs-ref">${esc(rotulo)}${tela}</div></div></div>`;
  }

  /** Diminui a letra até o versículo inteiro caber, sem cortar. */
  function ajustar(raiz) {
    const lista = raiz.matches && raiz.matches('[data-vs]') ? [raiz] : raiz.querySelectorAll('[data-vs]');
    for (const vs of lista) {
      const caixa = vs.querySelector('.vs-caixa');
      const texto = vs.querySelector('.vs-texto');
      const ref = vs.querySelector('.vs-ref');
      const altura = vs.clientHeight, largura = vs.clientWidth;
      if (!altura || !largura) continue;
      ref.style.fontSize = Math.max(10, Math.round(altura * 0.045)) + 'px';
      caixa.style.padding = `${Math.round(altura * 0.07)}px ${Math.round(largura * 0.07)}px`;
      let min = 8, max = Math.round(altura * (Number(vs.dataset.max) || 0.13));
      while (max - min > 1) {
        const meio = Math.floor((min + max) / 2);
        texto.style.fontSize = meio + 'px';
        if (caixa.scrollHeight <= altura && texto.scrollWidth <= texto.clientWidth + 1) min = meio; else max = meio;
      }
      texto.style.fontSize = min + 'px';
    }
  }

  window.Versiculo = { FUNDOS, html, ajustar, estiloFundo };
})();
