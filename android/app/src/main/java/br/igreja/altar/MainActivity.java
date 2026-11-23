package br.igreja.altar;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.LruCache;
import android.util.Size;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Altar no celular: uma "casca" em tela cheia para o controle da reunião.
 * As telas são as mesmas do navegador e vêm do notebook da igreja (src/web/controle),
 * por isso o app não precisa ser atualizado quando o programa do notebook muda.
 *
 * O que o app faz a mais que o navegador:
 *  - guarda o endereço do notebook (lido uma vez pelo QR code do Painel);
 *  - se o notebook mudou de endereço na rede, procura sozinho;
 *  - não deixa a tela do celular apagar durante a reunião;
 *  - mostra as últimas fotos e vídeos do celular em "Colocar na reunião" e manda os escolhidos para o notebook.
 */
public class MainActivity extends Activity {
    private static final String GUARDADO = "altar";
    private static final String HOST = "host", PORTA = "porta", TOKEN = "token";
    private static final String MIDIA_NEGADA = "midiaNegada";
    private static final int PEDIDO_ARQUIVOS = 4201, PEDIDO_MIDIAS = 4202;
    private static final String RESPOSTA_DA_INSTALACAO = "br.igreja.altar.RESPOSTA_DA_INSTALACAO";
    private static final int E_O_MEU = 2, E_OUTRO = 1, NAO_RESPONDEU = 0;

    private static final int MARINHO = Color.rgb(0x1f, 0x2a, 0x44);
    private static final int PAPEL = Color.rgb(0xf7, 0xf6, 0xf2);
    private static final int VERMELHO = Color.rgb(0xb3, 0x12, 0x1f);
    private static final int CINZA = Color.rgb(0x5b, 0x64, 0x78);

    private final Handler naTela = new Handler(Looper.getMainLooper());
    private final ExecutorService porFora = Executors.newCachedThreadPool();

    private SharedPreferences guardado;
    private WebView pagina;
    private LinearLayout aviso;
    private TextView avisoTitulo, avisoTexto;
    private ProgressBar avisoRoda;
    private Button botaoPrincipal, botaoSecundario;

    private ValueCallback<Uri[]> esperandoArquivos;
    private int tentativa;            // cada tentativa de conexão tem um número; resposta de tentativa velha é ignorada
    private boolean paginaFalhou;
    private boolean precisaTentar;    // a tela "não achei" está aberta: ao voltar para o app, tenta de novo
    private volatile boolean fechado;
    private volatile boolean atualizando;   // já está baixando ou instalando a versão nova do app

    // Fotos e vídeos que a página pode pedir (só os que apareceram na lista de recentes) e as miniaturas já feitas.
    private final Set<Long> midiasListadas = Collections.newSetFromMap(new ConcurrentHashMap<Long, Boolean>());
    private final LruCache<String, byte[]> miniaturas = new LruCache<String, byte[]>(6 * 1024 * 1024) {
        @Override protected int sizeOf(String chave, byte[] valor) { return valor.length; }
    };

    @Override
    protected void onCreate(Bundle estadoSalvo) {
        super.onCreate(estadoSalvo);
        guardado = getSharedPreferences(GUARDADO, MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        montarTela();
        IntentFilter instalacao = new IntentFilter(RESPOSTA_DA_INSTALACAO);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(respostaDaInstalacao, instalacao, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(respostaDaInstalacao, instalacao);
        boolean veioEndereco = guardarEnderecoDoLink(getIntent());
        if (estadoSalvo != null && !veioEndereco && temEndereco()) abrirPagina(); else conectar();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (guardarEnderecoDoLink(intent)) conectar();
    }

    @Override
    protected void onResume() {
        super.onResume();
        pagina.onResume();
        if (precisaTentar) conectar();
        // Voltou dos ajustes do celular (ou da pergunta de permissão): a página confere de novo se pode ver as fotos.
        else avisarPagina("aoMudarRecentes", null);
    }

    @Override
    protected void onPause() {
        pagina.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        fechado = true;
        try { unregisterReceiver(respostaDaInstalacao); } catch (IllegalArgumentException e) { /* não chegou a registrar */ }
        porFora.shutdownNow();
        pagina.destroy();
        super.onDestroy();
    }

    // ---------- telas ----------

    private int dp(int valor) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, valor, getResources().getDisplayMetrics()));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void montarTela() {
        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(PAPEL);

        pagina = new WebView(this);
        pagina.setBackgroundColor(PAPEL);
        pagina.setOverScrollMode(View.OVER_SCROLL_NEVER);
        pagina.setVisibility(View.INVISIBLE);
        WebSettings ajustes = pagina.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setMediaPlaybackRequiresUserGesture(false);
        ajustes.setSupportZoom(false);
        // As telas já têm letra grande; o tamanho de letra do celular não pode desmontar o desenho.
        ajustes.setTextZoom(100);
        pagina.addJavascriptInterface(new PonteComAPagina(), "AltarApp");
        pagina.setWebViewClient(new Navegacao());
        pagina.setWebChromeClient(new EscolherArquivos());
        raiz.addView(pagina, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        aviso = new LinearLayout(this);
        aviso.setOrientation(LinearLayout.VERTICAL);
        aviso.setGravity(Gravity.CENTER_VERTICAL);
        aviso.setBackgroundColor(PAPEL);
        aviso.setPadding(dp(28), dp(28), dp(28), dp(28));
        aviso.setClickable(true);

        avisoRoda = new ProgressBar(this);
        LinearLayout.LayoutParams rodaLp = new LinearLayout.LayoutParams(dp(56), dp(56));
        rodaLp.gravity = Gravity.CENTER_HORIZONTAL;
        rodaLp.bottomMargin = dp(20);
        aviso.addView(avisoRoda, rodaLp);

        avisoTitulo = new TextView(this);
        avisoTitulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 27);
        avisoTitulo.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD));
        avisoTitulo.setTextColor(MARINHO);
        avisoTitulo.setGravity(Gravity.CENTER_HORIZONTAL);
        aviso.addView(avisoTitulo, linha(0));

        avisoTexto = new TextView(this);
        avisoTexto.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        avisoTexto.setTextColor(CINZA);
        avisoTexto.setGravity(Gravity.CENTER_HORIZONTAL);
        avisoTexto.setLineSpacing(0, 1.25f);
        aviso.addView(avisoTexto, linha(14));

        botaoPrincipal = botao(true);
        aviso.addView(botaoPrincipal, linha(28));
        botaoSecundario = botao(false);
        aviso.addView(botaoSecundario, linha(12));

        raiz.addView(aviso, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(raiz);
    }

    private LinearLayout.LayoutParams linha(int margemDeCima) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(margemDeCima);
        return lp;
    }

    private Button botao(boolean principal) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setMinHeight(dp(68));
        b.setStateListAnimator(null);
        GradientDrawable fundo = new GradientDrawable();
        fundo.setCornerRadius(dp(14));
        if (principal) {
            fundo.setColor(VERMELHO);
            b.setTextColor(Color.WHITE);
        } else {
            fundo.setColor(Color.WHITE);
            fundo.setStroke(dp(2), Color.rgb(0xd2, 0xd6, 0xdf));
            b.setTextColor(MARINHO);
        }
        b.setBackground(fundo);
        return b;
    }

    /** Mostra a tela de aviso por cima da página. Botão sem texto (null) fica escondido. */
    private void avisar(String titulo, String texto, boolean rodando, String principal, Runnable aoPrincipal, String secundario, Runnable aoSecundario) {
        avisoTitulo.setText(titulo);
        avisoTexto.setText(texto);
        avisoTexto.setVisibility(texto == null ? View.GONE : View.VISIBLE);
        avisoRoda.setVisibility(rodando ? View.VISIBLE : View.GONE);
        prepararBotao(botaoPrincipal, principal, aoPrincipal);
        prepararBotao(botaoSecundario, secundario, aoSecundario);
        aviso.setVisibility(View.VISIBLE);
        pagina.setVisibility(View.INVISIBLE);
    }

    private void prepararBotao(Button botao, String texto, Runnable acao) {
        botao.setVisibility(texto == null ? View.GONE : View.VISIBLE);
        botao.setText(texto);
        botao.setOnClickListener(acao == null ? null : v -> acao.run());
    }

    private void telaLerQr(String motivo) {
        precisaTentar = false;
        avisar("Altar",
                motivo != null ? motivo : "Abra o Altar no notebook da igreja e leia o QR code que aparece na tela dele.",
                false, "Ler o QR code", this::lerQr, null, null);
    }

    private void telaNaoAchou() {
        precisaTentar = true;
        avisar("Não achei o notebook",
                "Confira se o Altar está aberto no notebook e se o celular está no Wi-Fi da igreja.",
                false, "Tentar de novo", this::conectar, "Ler o QR code de novo", this::lerQr);
    }

    /** A pessoa pediu para desconectar (trocar de notebook, ou o código mudou): esquece o endereço e o código. */
    private void desconectar() {
        tentativa++;   // uma procura em andamento não reconecta por conta própria
        guardado.edit().remove(HOST).remove(PORTA).remove(TOKEN).apply();
        midiasListadas.clear();
        paginaFalhou = true;   // a página em branco que entra no lugar não esconde a tela do QR code
        pagina.stopLoading();
        pagina.loadUrl("about:blank");
        telaLerQr("Este celular foi desconectado. Para conectar, abra o Altar no notebook e leia o QR code que aparece na tela dele.");
    }

    // ---------- endereço do notebook ----------

    private boolean temEndereco() {
        return guardado.getString(HOST, null) != null && guardado.getString(TOKEN, null) != null;
    }

    private String enderecoDaPagina() {
        return "http://" + guardado.getString(HOST, "") + ":" + guardado.getInt(PORTA, 7420) + "/controle/?t=" + guardado.getString(TOKEN, "");
    }

    /** O QR code do Painel é um link assim: http://192.168.0.10:7420/controle/?t=codigo */
    private boolean guardarEndereco(String link) {
        try {
            Uri u = Uri.parse(String.valueOf(link).trim());
            String codigo = u.getQueryParameter("t");
            String caminho = u.getPath();
            if (!"http".equals(u.getScheme()) || u.getHost() == null || caminho == null || !caminho.startsWith("/controle")) return false;
            if (codigo == null || !codigo.matches("[A-Za-z0-9]{8,64}")) return false;
            guardado.edit()
                    .putString(HOST, u.getHost())
                    .putInt(PORTA, u.getPort() == -1 ? 80 : u.getPort())
                    .putString(TOKEN, codigo)
                    .apply();
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private boolean guardarEnderecoDoLink(Intent intent) {
        return intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null
                && guardarEndereco(intent.getData().toString());
    }

    // ---------- conectar: pergunta ao endereço guardado; se não responder, procura na rede ----------

    private void conectar() {
        if (!temEndereco()) { telaLerQr(null); return; }
        precisaTentar = false;
        avisar("Procurando o notebook…", null, true, null, null, null, null);
        final int vez = ++tentativa;
        final String host = guardado.getString(HOST, "");
        final int porta = guardado.getInt(PORTA, 7420);
        final String codigo = guardado.getString(TOKEN, "");
        porFora.execute(() -> {
            int resposta = perguntar(host, porta, codigo, 2500);
            String achado = resposta == E_O_MEU ? host : null;
            if (resposta == NAO_RESPONDEU) achado = procurarNaRede(host, porta, codigo);
            final String onde = achado;
            final boolean codigoMudou = resposta == E_OUTRO;
            naTela.post(() -> {
                if (vez != tentativa || isFinishing()) return;
                if (onde != null) {
                    guardado.edit().putString(HOST, onde).apply();
                    abrirPagina();
                } else if (codigoMudou) {
                    telaLerQr("O código do notebook mudou. Leia de novo o QR code que aparece na tela dele.");
                } else {
                    telaNaoAchou();
                }
            });
        });
    }

    /** "Você é o Altar?" (o mesmo /ola que a página usa). */
    private int perguntar(String host, int porta, String codigo, int espera) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + host + ":" + porta + "/ola?t=" + codigo).openConnection();
            c.setConnectTimeout(espera);
            c.setReadTimeout(espera);
            c.setUseCaches(false);
            if (c.getResponseCode() != 200) return NAO_RESPONDEU;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream lido = new ByteArrayOutputStream();
                byte[] pedaco = new byte[512];
                for (int n; (n = in.read(pedaco)) > 0 && lido.size() < 4096; ) lido.write(pedaco, 0, n);
                JSONObject j = new JSONObject(lido.toString("UTF-8"));
                if (!j.optBoolean("altar") && !j.optBoolean("pulpito")) return NAO_RESPONDEU;
                return j.optBoolean("meu") ? E_O_MEU : E_OUTRO;
            }
        } catch (Exception e) {
            return NAO_RESPONDEU;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** O roteador às vezes troca o endereço do notebook: pergunta a todos os endereços da mesma rede. */
    private String procurarNaRede(String hostAntigo, int porta, String codigo) {
        Set<String> redes = new LinkedHashSet<>();
        try {
            for (NetworkInterface placa : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!placa.isUp() || placa.isLoopback()) continue;
                for (InetAddress a : Collections.list(placa.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) redes.add(comecoDaRede(a.getHostAddress()));
                }
            }
        } catch (Exception e) { /* sem rede: fica só com a do endereço antigo */ }
        redes.add(comecoDaRede(hostAntigo));
        redes.remove(null);
        if (redes.isEmpty()) return null;

        List<String> candidatos = new ArrayList<>();
        for (String rede : redes) for (int i = 1; i < 255; i++) candidatos.add(rede + i);
        final AtomicReference<String> achado = new AtomicReference<>();
        final CountDownLatch faltam = new CountDownLatch(candidatos.size());
        ExecutorService varios = Executors.newFixedThreadPool(48);
        try {
            for (final String candidato : candidatos) {
                varios.execute(() -> {
                    try {
                        if (achado.get() == null && perguntar(candidato, porta, codigo, 1500) == E_O_MEU) achado.compareAndSet(null, candidato);
                    } finally {
                        faltam.countDown();
                    }
                });
            }
            long limite = System.currentTimeMillis() + 20000;
            while (achado.get() == null && System.currentTimeMillis() < limite) {
                if (faltam.await(200, TimeUnit.MILLISECONDS)) break;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            varios.shutdownNow();
        }
        return achado.get();
    }

    /** "192.168.0.10" vira "192.168.0." (null quando não é um endereço com números). */
    private static String comecoDaRede(String endereco) {
        if (endereco == null || !endereco.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) return null;
        return endereco.substring(0, endereco.lastIndexOf('.') + 1);
    }

    // ---------- a página do controle ----------

    private void abrirPagina() {
        precisaTentar = false;
        paginaFalhou = false;
        avisar("Abrindo…", null, true, null, null, null, null);
        pagina.loadUrl(enderecoDaPagina());
    }

    private boolean ehDoNotebook(Uri u) {
        return u != null && "http".equals(u.getScheme()) && (u.getPort() == -1 ? 80 : u.getPort()) == guardado.getInt(PORTA, 7420);
    }

    private class Navegacao extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
            Uri u = pedido.getUrl();
            if (ehDoNotebook(u)) return false;
            // Qualquer outro link abre no navegador do celular.
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* sem navegador */ }
            return true;
        }

        /** A lista e as miniaturas das fotos do celular: a página pede em /__celular/ e quem responde é o app, não o notebook. */
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest pedido) {
            Uri u = pedido.getUrl();
            String caminho = u.getPath();
            if (caminho == null || !caminho.startsWith("/__celular/")) return null;
            try {
                if (!ehDoNotebook(u) || !guardado.getString(HOST, "").equals(u.getHost()) || !podeVerMidias()) return semResposta(403, "Forbidden");
                List<String> partes = u.getPathSegments();   // __celular/recentes.json  ou  __celular/mini/<tipo>/<id>
                if (partes.size() == 2 && "recentes.json".equals(partes.get(1))) {
                    int quantos = 18;
                    try { quantos = Integer.parseInt(String.valueOf(u.getQueryParameter("n"))); } catch (NumberFormatException e) { /* fica com 18 */ }
                    return resposta("application/json", listarRecentes(Math.max(1, Math.min(60, quantos))).toString().getBytes("UTF-8"));
                }
                if (partes.size() == 4 && "mini".equals(partes.get(1))) {
                    return resposta("image/jpeg", miniatura("video".equals(partes.get(2)), Long.parseLong(partes.get(3))));
                }
                return semResposta(404, "Not Found");
            } catch (Exception e) {
                return semResposta(500, "Error");
            }
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap icone) {
            // A própria página muda de endereço quando acha o notebook em outro lugar da rede: guarda o novo.
            Uri u = Uri.parse(url);
            if (ehDoNotebook(u) && u.getHost() != null && u.getPath() != null && u.getPath().startsWith("/controle")
                    && !u.getHost().equals(guardado.getString(HOST, ""))) {
                guardado.edit().putString(HOST, u.getHost()).apply();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (paginaFalhou) return;
            aviso.setVisibility(View.GONE);
            pagina.setVisibility(View.VISIBLE);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest pedido, WebResourceError erro) {
            if (pedido.isForMainFrame()) falhou();
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest pedido, WebResourceResponse resposta) {
            if (pedido.isForMainFrame()) falhou();
        }

        private void falhou() {
            if (paginaFalhou) return;
            paginaFalhou = true;
            pagina.stopLoading();
            pagina.loadUrl("about:blank");
            // Não abriu: pergunta de novo ao notebook (e procura na rede, se ele mudou de endereço).
            naTela.post(MainActivity.this::conectar);
        }
    }

    /** "Mandar arquivos" (fotos, vídeos, músicas, PDF da palestra): abre o seletor de arquivos do celular. */
    private class EscolherArquivos extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> resposta, FileChooserParams pedido) {
            if (esperandoArquivos != null) esperandoArquivos.onReceiveValue(null);
            esperandoArquivos = resposta;
            Intent escolher = new Intent(Intent.ACTION_GET_CONTENT);
            escolher.addCategory(Intent.CATEGORY_OPENABLE);
            escolher.setType("*/*");
            List<String> tipos = new ArrayList<>();
            if (pedido.getAcceptTypes() != null) {
                for (String aceito : pedido.getAcceptTypes()) {
                    if (aceito == null) continue;
                    for (String t : aceito.split(",")) if (t.trim().contains("/")) tipos.add(t.trim());
                }
            }
            if (tipos.size() == 1) escolher.setType(tipos.get(0));
            else if (tipos.size() > 1) escolher.putExtra(Intent.EXTRA_MIME_TYPES, tipos.toArray(new String[0]));
            if (pedido.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) escolher.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(Intent.createChooser(escolher, "Escolha os arquivos"), PEDIDO_ARQUIVOS);
            } catch (ActivityNotFoundException e) {
                esperandoArquivos = null;
                resposta.onReceiveValue(null);
                Toast.makeText(MainActivity.this, "Este celular não tem um aplicativo para escolher arquivos.", Toast.LENGTH_LONG).show();
            }
            return true;
        }
    }

    /** O que a página pode pedir ao app (window.AltarApp). */
    private class PonteComAPagina {
        @JavascriptInterface
        public void lerQr() {
            naTela.post(MainActivity.this::lerQr);
        }

        /** Esquece o notebook deste celular e volta para a tela de ler o QR code. */
        @JavascriptInterface
        public void desconectar() {
            naTela.post(MainActivity.this::desconectar);
        }

        /** "sim": o app já pode ver as fotos e vídeos do celular; "pedir": ainda falta a pessoa permitir. */
        @JavascriptInterface
        public String recentes() {
            return podeVerMidias() ? "sim" : "pedir";
        }

        @JavascriptInterface
        public void pedirRecentes() {
            naTela.post(MainActivity.this::pedirMidias);
        }

        /** {"lote": "...", "itens": [{"id": 12, "tipo": "imagem"}]}: manda os arquivos para o notebook, um por vez. */
        @JavascriptInterface
        public void mandarRecentes(String pedido) {
            porFora.execute(() -> mandarMidias(pedido));
        }

        /**
         * A página guarda pequenas coisas no celular (ex.: de quem é este celular). Ficam no aplicativo,
         * então valem mesmo se o endereço do notebook mudar, e continuam depois de desconectar.
         */
        @JavascriptInterface
        public void lembrar(String chave, String valor) {
            if (chave == null || !chave.matches("[a-z]{1,20}") || valor == null || valor.length() > 500) return;
            guardado.edit().putString("pagina." + chave, valor).apply();
        }

        @JavascriptInterface
        public String lembrado(String chave) {
            if (chave == null || !chave.matches("[a-z]{1,20}")) return "";
            return guardado.getString("pagina." + chave, "");
        }

        /** O número da versão deste app (o notebook diz o da versão que ele carrega; a página compara). */
        @JavascriptInterface
        public int versao() {
            return versaoDoApp();
        }

        /** Baixa do notebook a versão nova do app e pede ao Android para instalar por cima desta. */
        @JavascriptInterface
        public void atualizar() {
            if (atualizando) return;
            atualizando = true;
            porFora.execute(MainActivity.this::atualizarApp);
        }
    }

    // ---------- atualização do próprio app ----------
    // O app não vem da loja, então não se atualiza sozinho. A versão nova chega com o programa do notebook
    // (/app/Altar.apk); a página mostra o botão, o app baixa e o Android pergunta à pessoa se pode instalar.
    // O Android só aceita se o arquivo tiver a mesma assinatura do app instalado.

    @SuppressWarnings("deprecation")
    private int versaoDoApp() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private void avisarAtualizacao(String chave, Object valor) {
        try {
            avisarPagina("aoAtualizarApp", new JSONObject().put(chave, valor));
        } catch (Exception e) { /* não acontece: as chaves são fixas */ }
    }

    private void atualizacaoFalhou() {
        atualizando = false;
        avisarAtualizacao("erro", true);
    }

    @SuppressWarnings("deprecation")
    private void atualizarApp() {
        File arquivo = new File(getCacheDir(), "atualizacao.apk");
        PackageInstaller.Session sessao = null;
        try {
            // 1. Baixa do notebook deste celular (o mesmo endereço da página).
            URL de = new URL("http", guardado.getString(HOST, ""), guardado.getInt(PORTA, 7420), "/app/Altar.apk");
            HttpURLConnection conexao = (HttpURLConnection) de.openConnection();
            conexao.setConnectTimeout(8000);
            conexao.setReadTimeout(20000);
            try {
                if (conexao.getResponseCode() != 200) throw new IOException("o notebook respondeu " + conexao.getResponseCode());
                long total = conexao.getContentLength();
                try (InputStream entrada = conexao.getInputStream(); OutputStream saida = new FileOutputStream(arquivo)) {
                    byte[] pedaco = new byte[64 * 1024];
                    long feito = 0;
                    int lido, ultimo = -1;
                    while ((lido = entrada.read(pedaco)) > 0) {
                        saida.write(pedaco, 0, lido);
                        feito += lido;
                        if (feito > 200L * 1024 * 1024) throw new IOException("arquivo grande demais para ser o app");
                        int pct = total > 0 ? (int) (feito * 100 / total) : 0;
                        if (pct != ultimo) { ultimo = pct; avisarAtualizacao("pct", pct); }
                    }
                }
            } finally {
                conexao.disconnect();
            }

            // 2. Confere que é mesmo o Altar e que é mais novo que este.
            PackageInfo novo = getPackageManager().getPackageArchiveInfo(arquivo.getPath(), 0);
            if (novo == null || !getPackageName().equals(novo.packageName) || novo.versionCode <= versaoDoApp()) {
                throw new IOException("o arquivo não é uma versão nova do Altar");
            }

            // 3. Entrega ao Android, que mostra a pergunta "Atualizar este app?".
            PackageInstaller instalador = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams como = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            como.setAppPackageName(getPackageName());
            como.setSize(arquivo.length());
            int numero = instalador.createSession(como);
            sessao = instalador.openSession(numero);
            try (InputStream entrada = new FileInputStream(arquivo); OutputStream saida = sessao.openWrite("Altar.apk", 0, arquivo.length())) {
                byte[] pedaco = new byte[64 * 1024];
                int lido;
                while ((lido = entrada.read(pedaco)) > 0) saida.write(pedaco, 0, lido);
                sessao.fsync(saida);
            }
            Intent resposta = new Intent(RESPOSTA_DA_INSTALACAO).setPackage(getPackageName());
            int modo = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            sessao.commit(PendingIntent.getBroadcast(this, numero, resposta, modo).getIntentSender());
            sessao.close();
        } catch (Exception e) {
            if (sessao != null) sessao.abandon();
            atualizacaoFalhou();
        } finally {
            arquivo.delete();
        }
    }

    /** O Android responde aqui: primeiro pedindo a confirmação da pessoa, depois dizendo se instalou. */
    private final BroadcastReceiver respostaDaInstalacao = new BroadcastReceiver() {
        @Override
        @SuppressWarnings("deprecation")
        public void onReceive(Context contexto, Intent intent) {
            int estado = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (estado == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent pergunta = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                try {
                    startActivity(pergunta);
                    // Daqui em diante é com a pessoa; se a pergunta não aparecer, a página deixa tentar de novo.
                    atualizando = false;
                    avisarAtualizacao("confirmar", true);
                } catch (Exception e) {
                    atualizacaoFalhou();
                }
            } else if (estado == PackageInstaller.STATUS_FAILURE_ABORTED) {
                // A pessoa tocou em "Cancelar": volta o botão, sem mensagem de erro.
                atualizando = false;
                avisarAtualizacao("desistiu", true);
            } else if (estado != PackageInstaller.STATUS_SUCCESS) {
                atualizacaoFalhou();
            }
            // Quando dá certo, o Android fecha este app para trocar pelo novo.
        }
    };

    // ---------- últimas fotos e vídeos do celular ("Colocar na reunião") ----------
    // A página mostra as miniaturas para o pastor marcar; quem lê a galeria e manda os arquivos é o app.
    // A página só recebe a lista e as miniaturas: os arquivos vão direto daqui para o notebook.

    private String[] permissoesDeMidia() {
        if (Build.VERSION.SDK_INT >= 34) return new String[]{"android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO", "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"};
        if (Build.VERSION.SDK_INT >= 33) return new String[]{"android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO"};
        return new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
    }

    /** No Android 14 em diante, "permitir só algumas fotos" também serve: aparecem só as escolhidas. */
    private boolean podeVerMidias() {
        for (String p : permissoesDeMidia()) if (checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED) return true;
        return false;
    }

    private void pedirMidias() {
        String[] quais = permissoesDeMidia();
        // Já respondeu "não" e o Android não pergunta mais: abre os ajustes do app, onde dá para permitir.
        if (!podeVerMidias() && guardado.getBoolean(MIDIA_NEGADA, false) && !shouldShowRequestPermissionRationale(quais[0])) {
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null)));
                Toast.makeText(this, "Toque em Permissões e permita Fotos e vídeos.", Toast.LENGTH_LONG).show();
            } catch (ActivityNotFoundException e) { /* sem a tela de ajustes */ }
            return;
        }
        requestPermissions(quais, PEDIDO_MIDIAS);
    }

    @Override
    public void onRequestPermissionsResult(int pedido, String[] quais, int[] respostas) {
        super.onRequestPermissionsResult(pedido, quais, respostas);
        if (pedido != PEDIDO_MIDIAS) return;
        guardado.edit().putBoolean(MIDIA_NEGADA, !podeVerMidias()).apply();
        avisarPagina("aoMudarRecentes", null);
    }

    /** Chama uma função da página, se ela existir: window.funcao(dados). */
    private void avisarPagina(String funcao, JSONObject dados) {
        final String js = "window." + funcao + "&&window." + funcao + "(" + (dados == null ? "" : dados.toString()) + ")";
        naTela.post(() -> { if (!fechado && pagina.getVisibility() == View.VISIBLE) pagina.evaluateJavascript(js, null); });
    }

    private static Uri uriDaMidia(boolean video, long id) {
        return ContentUris.withAppendedId(video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
    }

    /** As fotos e vídeos mais novos do celular, do mais novo para o mais antigo. */
    private JSONArray listarRecentes(int quantos) throws Exception {
        JSONArray lista = new JSONArray();
        List<String> colunas = new ArrayList<>();
        colunas.add(MediaStore.Files.FileColumns._ID);
        colunas.add(MediaStore.Files.FileColumns.MEDIA_TYPE);
        colunas.add(MediaStore.MediaColumns.DISPLAY_NAME);
        colunas.add(MediaStore.MediaColumns.DATE_ADDED);
        if (Build.VERSION.SDK_INT >= 29) colunas.add("duration");
        String quais = MediaStore.Files.FileColumns.MEDIA_TYPE + " IN (" + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE + "," + MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO + ")"
                // Arquivo que acabou de chegar pode ainda estar sem tamanho na galeria: entra do mesmo jeito.
                + " AND (" + MediaStore.MediaColumns.SIZE + " IS NULL OR " + MediaStore.MediaColumns.SIZE + " > 0)";
        try (Cursor c = getContentResolver().query(MediaStore.Files.getContentUri("external"), colunas.toArray(new String[0]), quais, null,
                MediaStore.MediaColumns.DATE_ADDED + " DESC, " + MediaStore.Files.FileColumns._ID + " DESC")) {
            while (c != null && lista.length() < quantos && c.moveToNext()) {
                long id = c.getLong(0);
                boolean video = c.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
                JSONObject m = new JSONObject();
                m.put("id", id);
                m.put("tipo", video ? "video" : "imagem");
                m.put("nome", c.getString(2));
                m.put("quando", c.getLong(3));
                if (video && c.getColumnCount() > 4) m.put("dur", c.getLong(4) / 1000);
                lista.put(m);
                midiasListadas.add(id);
            }
        }
        return lista;
    }

    @SuppressWarnings("deprecation")
    private byte[] miniatura(boolean video, long id) throws Exception {
        if (!midiasListadas.contains(id)) throw new SecurityException("fora da lista");
        String chave = (video ? "v" : "i") + id;
        byte[] pronta = miniaturas.get(chave);
        if (pronta != null) return pronta;
        Bitmap imagem;
        if (Build.VERSION.SDK_INT >= 29) imagem = getContentResolver().loadThumbnail(uriDaMidia(video, id), new Size(320, 320), null);
        else if (video) imagem = MediaStore.Video.Thumbnails.getThumbnail(getContentResolver(), id, MediaStore.Video.Thumbnails.MINI_KIND, null);
        else imagem = MediaStore.Images.Thumbnails.getThumbnail(getContentResolver(), id, MediaStore.Images.Thumbnails.MINI_KIND, null);
        if (imagem == null) throw new FileNotFoundException();
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        imagem.compress(Bitmap.CompressFormat.JPEG, 82, saida);
        imagem.recycle();
        pronta = saida.toByteArray();
        miniaturas.put(chave, pronta);
        return pronta;
    }

    private static WebResourceResponse resposta(String tipo, byte[] corpo) {
        Map<String, String> cabecalhos = new HashMap<>();
        cabecalhos.put("Cache-Control", "no-store");
        return new WebResourceResponse(tipo, tipo.startsWith("image/") ? null : "UTF-8", 200, "OK", cabecalhos, new ByteArrayInputStream(corpo));
    }

    private static WebResourceResponse semResposta(int codigo, String motivo) {
        return new WebResourceResponse("text/plain", "UTF-8", codigo, motivo, new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    /** Manda os arquivos marcados para o notebook (o mesmo /api/enviar que a página usa) e vai avisando a página. */
    private void mandarMidias(String pedido) {
        boolean deuCerto = false;
        try {
            JSONObject j = new JSONObject(pedido);
            String lote = j.getString("lote");
            JSONArray itens = j.getJSONArray("itens");
            if (!lote.matches("[a-z0-9]{8,40}") || itens.length() == 0 || itens.length() > 60 || !podeVerMidias()) throw new IllegalArgumentException();
            String base = "http://" + guardado.getString(HOST, "") + ":" + guardado.getInt(PORTA, 7420)
                    + "/api/enviar?t=" + guardado.getString(TOKEN, "") + "&lote=" + lote;
            for (int i = 0; i < itens.length(); i++) {
                JSONObject m = itens.getJSONObject(i);
                long id = m.getLong("id");
                if (!midiasListadas.contains(id)) throw new SecurityException("fora da lista");
                mandarUma(base + "&i=" + i, "video".equals(m.optString("tipo")), id, i + 1, itens.length());
            }
            deuCerto = true;
        } catch (Exception e) {
            deuCerto = false;
        }
        try {
            avisarPagina("aoMandarRecentes", new JSONObject().put("fim", true).put("ok", deuCerto));
        } catch (Exception e) { /* não acontece: as chaves são fixas */ }
    }

    private void mandarUma(String endereco, boolean video, long id, int atual, int total) throws Exception {
        Uri uri = uriDaMidia(video, id);
        String nome = video ? "video.mp4" : "foto.jpg";
        long tamanho = 0;
        try (Cursor c = getContentResolver().query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                if (c.getString(0) != null) nome = c.getString(0);
                tamanho = c.getLong(1);
            }
        }
        // A galeria ainda não mediu o arquivo: pergunta o tamanho ao próprio arquivo (só serve para a barra de andamento).
        if (tamanho <= 0) {
            try (android.content.res.AssetFileDescriptor a = getContentResolver().openAssetFileDescriptor(uri, "r")) {
                if (a != null) tamanho = a.getLength();
            } catch (Exception e) { /* fica sem o tamanho */ }
        }
        HttpURLConnection c = (HttpURLConnection) new URL(endereco + "&nome=" + URLEncoder.encode(nome, "UTF-8")).openConnection();
        try {
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setUseCaches(false);
            c.setConnectTimeout(8000);
            c.setReadTimeout(120000);
            // Em pedaços: um vídeo grande não cabe na memória do celular (e o tamanho que a galeria informa nem sempre é exato).
            c.setChunkedStreamingMode(64 * 1024);
            c.setRequestProperty("Content-Type", "application/octet-stream");
            try (InputStream entrada = getContentResolver().openInputStream(uri); OutputStream saida = c.getOutputStream()) {
                if (entrada == null) throw new FileNotFoundException();
                byte[] pedaco = new byte[64 * 1024];
                long foi = 0;
                int ultimo = -1;
                for (int n; (n = entrada.read(pedaco)) > 0; ) {
                    saida.write(pedaco, 0, n);
                    foi += n;
                    int pct = tamanho > 0 ? (int) Math.min(100, foi * 100 / tamanho) : 0;
                    if (pct != ultimo) {
                        ultimo = pct;
                        avisarPagina("aoMandarRecentes", new JSONObject().put("atual", atual).put("total", total).put("pct", pct));
                    }
                }
            }
            if (c.getResponseCode() != 200) throw new IOException("status " + c.getResponseCode());
        } finally {
            c.disconnect();
        }
    }

    // ---------- QR code ----------

    private void lerQr() {
        IntentIntegrator leitor = new IntentIntegrator(this);
        leitor.setDesiredBarcodeFormats(IntentIntegrator.QR_CODE);
        leitor.setPrompt("Aponte para o QR code que aparece na tela do notebook");
        leitor.setBeepEnabled(false);
        leitor.setOrientationLocked(true);
        leitor.initiateScan();
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido == PEDIDO_ARQUIVOS) {
            ValueCallback<Uri[]> resposta = esperandoArquivos;
            esperandoArquivos = null;
            if (resposta != null) resposta.onReceiveValue(resultado == RESULT_OK ? arquivosEscolhidos(dados) : null);
            return;
        }
        IntentResult lido = IntentIntegrator.parseActivityResult(pedido, resultado, dados);
        if (lido == null) { super.onActivityResult(pedido, resultado, dados); return; }
        if (lido.getContents() == null) return;   // desistiu de ler
        if (guardarEndereco(lido.getContents())) conectar();
        else Toast.makeText(this, "Esse QR code não é do Altar. Leia o que aparece na tela do notebook.", Toast.LENGTH_LONG).show();
    }

    private static Uri[] arquivosEscolhidos(Intent dados) {
        if (dados == null) return null;
        ClipData varios = dados.getClipData();
        if (varios != null && varios.getItemCount() > 0) {
            Uri[] lista = new Uri[varios.getItemCount()];
            for (int i = 0; i < lista.length; i++) lista[i] = varios.getItemAt(i).getUri();
            return lista;
        }
        return dados.getData() != null ? new Uri[]{dados.getData()} : null;
    }

    // ---------- botão de voltar do celular ----------

    @Override
    public void onBackPressed() {
        // Com a página fora da tela (procurando o notebook, tela do QR code), o voltar manda o app para o fundo.
        if (fechado || pagina.getVisibility() != View.VISIBLE) { moveTaskToBack(true); return; }
        // A página decide: "sim" = voltou um passo (fechou o que estava aberto, voltou para a lista...);
        // "nao" = já está no começo, então o app vai para o fundo.
        pagina.evaluateJavascript(
                "(function(){try{return window.altarVoltar?window.altarVoltar():'antiga'}catch(e){return 'antiga'}})()",
                resposta -> {
                    if (fechado) return;
                    if (resposta != null && resposta.contains("sim")) return;
                    // Página de um Altar mais antigo no notebook: ela mesma trata o voltar pelo histórico.
                    if (resposta != null && resposta.contains("antiga") && pagina.canGoBack()) { pagina.goBack(); return; }
                    moveTaskToBack(true);
                });
    }
}
