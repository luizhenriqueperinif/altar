// Pregações a partir do que o pastor escolheu ou mandou:
// as imagens soltas viram uma pregação só; cada PDF ou PowerPoint (palestra) vira outra, com uma imagem por página.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tituloDoArquivo, marcaDoArquivo } = require('./dados');

const EXT_POWERPOINT = ['pptx', 'ppt', 'ppsx', 'pps', 'pptm', 'odp'];
const ehPdf = caminho => path.extname(String(caminho)).toLowerCase() === '.pdf';
const ehPowerPoint = caminho => EXT_POWERPOINT.includes(path.extname(String(caminho)).slice(1).toLowerCase());
/** PDF ou PowerPoint: arquivo que vira uma pregação sozinho, uma imagem por página. */
const ehPalestra = caminho => ehPdf(caminho) || ehPowerPoint(caminho);

/**
 * pdfParaImagens(caminho, pasta) e pptParaImagens(caminho, pasta): devolvem os caminhos das imagens das páginas, na ordem.
 * Devolve as pregações feitas (as novas e as que já estavam na Biblioteca), quantos arquivos ficaram de fora e
 * se algum PowerPoint ficou de fora porque o notebook não tem programa para abrir (semPowerPoint).
 */
async function criarPregacoes(dados, caminhos, { manterOrdem = false, pdfParaImagens = null, pptParaImagens = null, aoErrar = () => {} } = {}) {
  const palestras = caminhos.filter(ehPalestra), soltas = caminhos.filter(c => !ehPalestra(c));
  const feitas = [];
  let ignorados = 0, semPowerPoint = false;
  for (const arquivo of palestras) {
    const ppt = ehPowerPoint(arquivo);
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), ppt ? 'altar-ppt-' : 'altar-pdf-'));
    try {
      // O mesmo arquivo de novo: usa a pregação que já está na Biblioteca, sem desenhar as páginas outra vez.
      const marca = (ppt ? 'ppt-' : 'pdf-') + marcaDoArquivo(arquivo);
      const jaTem = dados.pregacaoPorMarca(marca);
      if (jaTem) { feitas.push({ pregacao: jaTem, ignorados: 0, repetida: true }); continue; }
      const desenhar = ppt ? pptParaImagens : pdfParaImagens;
      const paginas = desenhar ? await desenhar(arquivo, pasta) : [];
      const feito = paginas.length ? dados.criarPregacao(paginas, { titulo: tituloDoArquivo(arquivo).replace(/\s+/g, ' '), manterOrdem: true, marca }) : null;
      if (feito) feitas.push(feito); else ignorados++;
    } catch (e) {
      ignorados++;
      if (e && e.codigo === 'SEM_POWERPOINT') semPowerPoint = true; else aoErrar(e);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  }
  if (soltas.length) {
    const feito = dados.criarPregacao(soltas, { manterOrdem });
    if (feito) { feitas.push(feito); ignorados += feito.ignorados; } else ignorados += soltas.length;
  }
  return { feitas, ignorados, semPowerPoint };
}

/** O que o Painel e o celular mostram depois: quantas pregações, quantas imagens e se já estavam na Biblioteca. */
function resumoDasPregacoes({ feitas, ignorados, semPowerPoint = false }) {
  return {
    qtd: feitas.length,
    novas: feitas.filter(f => !f.repetida).length,
    imagens: feitas.reduce((n, f) => n + f.pregacao.arquivos.length, 0),
    ignorados,
    ids: feitas.map(f => f.pregacao.id),
    pregacao: true,
    repetida: feitas.length > 0 && feitas.every(f => f.repetida),
    titulo: feitas.length ? feitas[0].pregacao.titulo : '',
    semPowerPoint,
  };
}

module.exports = { criarPregacoes, resumoDasPregacoes, ehPdf, ehPowerPoint, ehPalestra, EXT_POWERPOINT };
