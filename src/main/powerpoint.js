// PowerPoint (.pptx, .ppt, .ppsx...) → uma imagem por slide, para virar uma Pregação.
// Quem desenha os slides é o próprio PowerPoint do notebook (fica igualzinho). Sem PowerPoint, tenta o
// LibreOffice (grátis): ele transforma em PDF e o leitor de PDF do Altar faz o resto. Sem nenhum dos dois
// não dá para desenhar os slides: o erro sai com codigo 'SEM_POWERPOINT' e a tela explica o que fazer.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIMITE = 300 * 1024 * 1024;   // 300 MB
const ESPERA = 4 * 60 * 1000;       // o PowerPoint demora para abrir na primeira vez
const LARGURA = 1920;

// Os caminhos vão por variável de ambiente, para nome com aspas ou acento não quebrar o comando.
const ROTEIRO = `
$ErrorActionPreference = 'Stop'
$jaAberto = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
try { $ppt = New-Object -ComObject PowerPoint.Application } catch { Write-Output 'SEM'; exit 0 }
$p = $null
try {
  $p = $ppt.Presentations.Open($env:ALTAR_PPT, -1, 0, 0)
  $altura = [int][math]::Round(${LARGURA} * $p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth)
  $n = 0
  foreach ($s in $p.Slides) {
    if ($s.SlideShowTransition.Hidden -eq -1) { continue }
    $n++
    $s.Export((Join-Path $env:ALTAR_PASTA ('slide-{0:d4}.jpg' -f $n)), 'JPG', ${LARGURA}, $altura)
  }
  Write-Output ('OK ' + $n)
} finally {
  if ($p) { $p.Close() }
  if (-not $jaAberto -and $ppt.Presentations.Count -eq 0) { $ppt.Quit() }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ppt)
}
`;

const rodar = (programa, args, opcoes) => new Promise((ok, falha) => {
  execFile(programa, args, { windowsHide: true, timeout: ESPERA, maxBuffer: 4 * 1024 * 1024, ...opcoes }, (erro, saida, erros) => {
    if (erro) { erro.message += ' ' + String(erros || '').slice(0, 400); falha(erro); } else ok(String(saida || ''));
  });
});

function acharLibreOffice() {
  const pastas = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean);
  for (const p of pastas) {
    const exe = path.join(p, 'LibreOffice', 'program', 'soffice.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

const semPrograma = () => Object.assign(new Error('Este notebook não tem PowerPoint nem LibreOffice para abrir a apresentação.'), { codigo: 'SEM_POWERPOINT' });

/** pdfParaImagens(pdf, pasta): o leitor de PDF do Altar (usado no caminho do LibreOffice). */
function criarLeitorPowerPoint({ pdfParaImagens = null, executar = rodar, libreOffice = acharLibreOffice, sistema = process.platform } = {}) {
  let fila = Promise.resolve();

  async function comPowerPoint(copia, pasta) {
    const saida = await executar('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ROTEIRO],
      { env: { ...process.env, ALTAR_PPT: copia, ALTAR_PASTA: pasta } });
    if (/^SEM\b/m.test(saida)) return null;
    if (!/^OK \d+/m.test(saida)) throw new Error('PowerPoint: resposta estranha: ' + saida.slice(0, 200));
    return fs.readdirSync(pasta).filter(n => /^slide-\d+\.jpg$/i.test(n)).sort().map(n => path.join(pasta, n));
  }

  async function comLibreOffice(copia, pasta) {
    const exe = libreOffice();
    if (!exe || !pdfParaImagens) return null;
    await executar(exe, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', pasta, copia], {});
    const pdf = path.join(pasta, path.basename(copia, path.extname(copia)) + '.pdf');
    if (!fs.existsSync(pdf)) throw new Error('LibreOffice: não gerou o PDF');
    return pdfParaImagens(pdf, pasta);
  }

  async function converter(caminho, pasta) {
    if (sistema !== 'win32') throw semPrograma();
    if (fs.statSync(caminho).size > LIMITE) throw new Error('Apresentação grande demais');
    // Trabalha numa cópia, sem a marca de "veio da internet" (senão o PowerPoint abre em modo protegido e não exporta).
    const copia = path.join(pasta, 'apresentacao' + path.extname(caminho).toLowerCase());
    fs.copyFileSync(caminho, copia);
    try { fs.rmSync(copia + ':Zone.Identifier', { force: true }); } catch { /* sem a marca */ }
    const slides = (await comPowerPoint(copia, pasta)) || (await comLibreOffice(copia, pasta));
    if (!slides) throw semPrograma();
    return slides;
  }

  /** Uma apresentação por vez. */
  function paraImagens(caminho, pasta) {
    const vez = fila.then(() => converter(caminho, pasta));
    fila = vez.catch(() => {});
    return vez;
  }

  return { paraImagens };
}

module.exports = { criarLeitorPowerPoint };
