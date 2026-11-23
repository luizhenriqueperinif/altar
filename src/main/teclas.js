// Aperta teclas numa janela do notebook (YouTube no navegador, Telegram...) a pedido do celular.
// Traz a janela para a frente e aperta a tecla, como se o pastor tivesse apertado no teclado.
// Um PowerShell fica aberto escondido, esperando os pedidos (assim cada toque é rápido).
const { spawn } = require('child_process');
const path = require('path');

// Códigos das teclas no Windows
const VK = { espaco: 0x20, esquerda: 0x25, direita: 0x27, j: 0x4a, k: 0x4b, l: 0x4c, f: 0x46 };

/** Janela do Telegram (o visualizador do Telegram Desktop ou o Telegram Web no navegador):
 * lá as setas trocam para o vídeo seguinte da conversa em vez de adiantar, então só dá para tocar e pausar. */
const ehTelegram = nome => /telegram|media viewer|visualizador de m[ií]dia/i.test(nome || '');

/** Qual tecla apertar para cada botão do celular. No YouTube: K, J e L (10 segundos); no Telegram: só espaço; nos outros: espaço e setas. */
function teclaPara(acao, nomeJanela) {
  const yt = /youtube/i.test(nomeJanela || '');
  const tg = !yt && ehTelegram(nomeJanela);
  switch (acao) {
    case 'playPausa': return yt ? VK.k : VK.espaco;
    case 'voltar': return tg ? null : yt ? VK.j : VK.esquerda;
    case 'avancar': return tg ? null : yt ? VK.l : VK.direita;
    case 'telaCheia': return VK.f;
    default: return null;
  }
}

/** "window:132456:0" (o id que o Electron dá para a janela) → 132456 (o número da janela no Windows). */
function numeroDaJanela(fonteId) {
  const m = /^window:(\d+):/.exec(String(fonteId || ''));
  return m ? m[1] : null;
}

const CODIGO = `
using System; using System.Runtime.InteropServices; using System.Threading; using System.Collections.Generic; using System.Diagnostics;

// O "mixer de volume" do Windows: cada programa que está tocando som tem o volume dele.
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class AltarEnumeradorDeSom { }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints();
  [PreserveSig] int GetDefaultAudioEndpoint(int fluxo, int papel, out IMMDevice saida);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int contexto, IntPtr parametros, [MarshalAs(UnmanagedType.IUnknown)] out object objeto);
}
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  int GetAudioSessionControl();
  int GetSimpleAudioVolume();
  [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator lista);
}
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
  [PreserveSig] int GetCount(out int quantas);
  [PreserveSig] int GetSession(int n, out IAudioSessionControl2 sessao);
}
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(); int GetDisplayName(); int SetDisplayName(); int GetIconPath(); int SetIconPath();
  int GetGroupingParam(); int SetGroupingParam(); int RegisterAudioSessionNotification(); int UnregisterAudioSessionNotification();
  int GetSessionIdentifier(); int GetSessionInstanceIdentifier();
  [PreserveSig] int GetProcessId(out uint processo);
}
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  [PreserveSig] int SetMasterVolume(float nivel, ref Guid quem);
  [PreserveSig] int GetMasterVolume(out float nivel);
  [PreserveSig] int SetMute(bool mudo, ref Guid quem);
  [PreserveSig] int GetMute(out bool mudo);
}
public static class AltarTeclas {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")] static extern uint ProcessoDaJanela(IntPtr h, out uint processo);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);
  public static string Frente(long numero) {
    IntPtr h = new IntPtr(numero);
    if (!IsWindow(h)) return "fechada";
    if (IsIconic(h)) ShowWindow(h, 9);
    if (GetForegroundWindow() != h) {
      uint eu = GetCurrentThreadId(), frente = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
      AttachThreadInput(eu, frente, true);
      BringWindowToTop(h); SetForegroundWindow(h);
      AttachThreadInput(eu, frente, false);
      Thread.Sleep(80);
    }
    return GetForegroundWindow() == h ? "ok" : "semfoco";
  }
  public static string Apertar(long numero, int vk) {
    string r = Frente(numero);
    if (r != "ok") return r;
    uint ext = (vk == 0x25 || vk == 0x27) ? 1u : 0u;
    keybd_event((byte)vk, 0, ext, UIntPtr.Zero);
    keybd_event((byte)vk, 0, ext | 2u, UIntPtr.Zero);
    return "ok";
  }
  static string NomeDoProcesso(uint processo) {
    try { return Process.GetProcessById((int)processo).ProcessName.ToLowerInvariant(); } catch { return ""; }
  }
  // Volume (0 a 10) do programa dono da janela; passo diferente de zero aumenta ou diminui.
  // O navegador toca o som por outro processo com o mesmo nome (chrome, msedge...), por isso vale o nome do programa.
  // Responde "v7" (o volume que ficou), "semsom" (o programa ainda não tocou nada) ou "fechada".
  public static string Volume(long numero, int passo) {
    IntPtr h = new IntPtr(numero);
    if (!IsWindow(h)) return "fechada";
    uint dono; ProcessoDaJanela(h, out dono);
    string nome = NomeDoProcesso(dono);
    if (nome == "") return "fechada";
    var achados = new List<ISimpleAudioVolume>();
    IMMDeviceEnumerator aparelhos = (IMMDeviceEnumerator)(new AltarEnumeradorDeSom());
    IMMDevice saida; object o; IAudioSessionEnumerator lista; int quantas;
    if (aparelhos.GetDefaultAudioEndpoint(0, 1, out saida) != 0) return "semsom";
    Guid iid = typeof(IAudioSessionManager2).GUID;
    if (saida.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return "semsom";
    if (((IAudioSessionManager2)o).GetSessionEnumerator(out lista) != 0 || lista.GetCount(out quantas) != 0) return "semsom";
    for (int i = 0; i < quantas; i++) {
      IAudioSessionControl2 sessao; uint p;
      if (lista.GetSession(i, out sessao) != 0 || sessao == null) continue;
      if (sessao.GetProcessId(out p) == 0 && p != 0 && NomeDoProcesso(p) == nome) achados.Add((ISimpleAudioVolume)sessao);
    }
    if (achados.Count == 0) return "semsom";
    float maior = 0;
    foreach (var v in achados) { float n; if (v.GetMasterVolume(out n) == 0 && n > maior) maior = n; }
    int nivel = (int)Math.Round(maior * 10);
    if (passo != 0) {
      nivel = Math.Max(0, Math.Min(10, nivel + passo));
      Guid quem = Guid.Empty;
      foreach (var v in achados) { v.SetMasterVolume(nivel / 10f, ref quem); if (nivel > 0) v.SetMute(false, ref quem); }
    }
    return "v" + nivel;
  }
}`;

/** "v7" → { nivel: 7 }; o resto é o motivo de não ter dado certo. */
function lerVolume(resposta) {
  const m = /^v(\d{1,2})$/.exec(String(resposta || ''));
  if (m && Number(m[1]) <= 10) return { nivel: Number(m[1]) };
  return { erro: resposta === 'semsom' || resposta === 'fechada' ? resposta : 'erro' };
}

function criarTeclas() {
  let ps = null, buffer = '', fila = [];

  function abrir() {
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    ps = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true });
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', d => {
      buffer += d;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const linha = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
        const m = /^ALTAR (\w+)$/.exec(linha);
        if (m && fila.length) fila.shift()(m[1]);
      }
    });
    ps.stderr.on('data', d => console.error('Teclas:', String(d).trim()));
    ps.on('exit', () => { ps = null; for (const r of fila.splice(0)) r('erro'); });
    ps.on('error', () => { ps = null; });
    // Numa linha só: o PowerShell lendo os pedidos não aceita o código em várias linhas.
    const b64 = Buffer.from(CODIGO, 'utf8').toString('base64');
    ps.stdin.write(`Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))\n`);
  }

  function pedir(chamada) {
    if (!ps) abrir();
    return new Promise(ok => {
      const t = setTimeout(() => { const k = fila.indexOf(fim); if (k >= 0) fila.splice(k, 1); ok('erro'); }, 4000);
      const fim = r => { clearTimeout(t); ok(r); };
      fila.push(fim);
      ps.stdin.write(`Write-Output ("ALTAR " + [AltarTeclas]::${chamada})\n`);
    });
  }

  /** Aperta a tecla do botão `acao` na janela. Responde 'ok', 'semfoco', 'fechada' ou 'erro'. */
  function apertar(fonteId, nomeJanela, acao) {
    const n = numeroDaJanela(fonteId), vk = teclaPara(acao, nomeJanela);
    if (!n || vk == null || process.platform !== 'win32') return Promise.resolve('erro');
    return pedir(`Apertar(${n}, ${vk})`);
  }

  /** Traz a janela para a frente no notebook (e desminimiza), sem apertar nada. */
  function frente(fonteId) {
    const n = numeroDaJanela(fonteId);
    if (!n || process.platform !== 'win32') return Promise.resolve('erro');
    return pedir(`Frente(${n})`);
  }

  /**
   * Volume do programa da janela, de 0 a 10 (o do "mixer de volume" do Windows, só daquele programa).
   * `passo` 0 só lê. Responde { nivel } ou { erro: 'semsom' | 'fechada' | 'erro' }.
   */
  async function volume(fonteId, passo = 0) {
    const n = numeroDaJanela(fonteId);
    if (!n || process.platform !== 'win32') return { erro: 'erro' };
    return lerVolume(await pedir(`Volume(${n}, ${Math.max(-10, Math.min(10, Math.trunc(Number(passo)) || 0))})`));
  }

  return { apertar, frente, volume, fechar() { if (ps) { try { ps.kill(); } catch {} ps = null; } } };
}

module.exports = { criarTeclas, teclaPara, numeroDaJanela, ehTelegram, lerVolume };
