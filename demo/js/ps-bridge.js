/**
 * ps-bridge.js — Sincronização bidirecional com as cores do Photoshop.
 *
 * Só faz algo quando roda dentro do Photoshop (UXP ou CEP). No navegador o
 * módulo carrega, reporta `isConnected() === false` e não interfere em nada,
 * para a demo continuar funcionando isolada.
 *
 * Duas direções:
 *   - Plugin → Photoshop: `AppState` muda, gravamos o foreground. Debounced,
 *     para arrastar a roda não gerar uma escrita por quadro.
 *   - Photoshop → Plugin: polling do foreground. É mais robusto entre versões
 *     do que depender de listener de notificação de ação.
 */
window.PSBridge = (function () {
  'use strict';

  var S = window.AppState;

  var WRITE_DEBOUNCE = 60;   // agrupa arrastos contínuos
  var POLL_INTERVAL = 400;   // detecta color picker nativo / conta-gotas

  // Marca de origem propagada por AppState.emit para os subscribers.
  var HOST_REASON = 'host';
  // Origem usada pelo PanelSync para cores vindas da outra janela do CEP.
  var PEER_REASON = 'peer';

  var connected = false;
  var ps = null;             // módulo 'photoshop' no UXP
  var cs = null;             // CSInterface no CEP
  var writeTimer = null;
  var pollTimer = null;

  // Última cor que nós mesmos escrevemos, para o polling não reenviar
  // de volta o que acabamos de mandar (evita loop).
  var lastPushed = null;
  var suppressUntil = 0;

  // Leitura CEP em andamento. Sem essa trava, com o Photoshop ocupado (ex.:
  // conta-gotas temporário do Alt ativo) as chamadas de 400ms se acumulavam
  // na fila do ExtendScript e depois disparavam em rajada.
  var readPending = false;
  var readStartedAt = 0;
  var READ_TIMEOUT = 2000;

  /**
   * Tolerância para decidir se o host mudou "de verdade" enquanto o painel é
   * dono de um triplo LAB/CMYK. A ida-e-volta RGB → PS → RGB desloca até ~2
   * níveis; o conta-gotas do Photoshop muda a cor muito mais que isso.
   */
  var EXTERNAL_DELTA = 6;

  /* ---------------- Detecção ---------------- */

  function setup() {
    var env = window.Platform ? window.Platform.env : 'web';

    if (env === 'uxp') {
      try {
        ps = require('photoshop');
        connected = !!(ps && ps.app);
      } catch (e) {
        connected = false;
      }
      return;
    }

    if (env === 'cep') {
      try {
        cs = new window.CSInterface();
        // Só consideramos conectado se o host CEP estiver de fato presente.
        connected = typeof cs.isAvailable !== 'function' || cs.isAvailable();
      } catch (e) {
        connected = false;
      }
    }
  }

  function isConnected() { return connected; }

  /* ---------------- Leitura ---------------- */

  function readForegroundUxp() {
    try {
      var c = ps.app.foregroundColor;
      if (!c || !c.rgb) return null;
      return {
        r: Math.round(c.rgb.red),
        g: Math.round(c.rgb.green),
        b: Math.round(c.rgb.blue)
      };
    } catch (e) {
      connected = false;
      return null;
    }
  }

  function readForegroundCep(callback) {
    // ExtendScript: devolve "r,g,b" do foreground atual.
    var jsx = 'var c = app.foregroundColor.rgb; c.red + "," + c.green + "," + c.blue;';
    // Uma leitura por vez. Se o callback nunca voltar, a trava expira.
    if (readPending && Date.now() - readStartedAt < READ_TIMEOUT) return;
    readPending = true;
    readStartedAt = Date.now();
    try {
      cs.evalScript(jsx, function (res) {
        readPending = false;
        if (!res || res === 'EvalScript error.') { callback(null); return; }
        var parts = String(res).split(',');
        if (parts.length !== 3) { callback(null); return; }
        callback({
          r: Math.round(parseFloat(parts[0])),
          g: Math.round(parseFloat(parts[1])),
          b: Math.round(parseFloat(parts[2]))
        });
      });
    } catch (e) {
      // Uma falha pontual não desliga a ponte para sempre: a próxima leitura
      // tenta de novo.
      readPending = false;
      callback(null);
    }
  }

  /* ---------------- Escrita ---------------- */

  function writeForegroundUxp(rgb) {
    /**
     * Usa batchPlay em vez do setter de `app.foregroundColor`: é a rota
     * estável entre versões do Photoshop. No descritor de ação do Photoshop
     * o canal verde se chama `grain` — não é erro de digitação.
     */
    try {
      return ps.action.batchPlay([{
        _obj: 'set',
        _target: [{ _ref: 'color', _property: 'foregroundColor' }],
        to: {
          _obj: 'RGBColor',
          red: rgb.r,
          grain: rgb.g,
          blue: rgb.b
        },
        _options: { dialogOptions: 'dontDisplay' }
      }], { synchronousExecution: false, modalBehavior: 'execute' });
    } catch (e) {
      connected = false;
      return Promise.resolve();
    }
  }

  function writeForegroundCep(rgb) {
    var jsx =
      'var c = new SolidColor();' +
      'c.rgb.red = ' + rgb.r + ';' +
      'c.rgb.green = ' + rgb.g + ';' +
      'c.rgb.blue = ' + rgb.b + ';' +
      'app.foregroundColor = c;';
    try {
      cs.evalScript(jsx, function () {});
    } catch (e) {
      connected = false;
    }
  }

  function push(rgb) {
    if (!connected) return;
    lastPushed = rgb;
    // Janela em que ignoramos o polling: a escrita ainda está em trânsito.
    suppressUntil = Date.now() + 1200;

    if (ps) writeForegroundUxp(rgb);
    else if (cs) writeForegroundCep(rgb);
  }

  function schedulePush() {
    if (!connected) return;
    if (writeTimer) clearTimeout(writeTimer);
    // Suprimir polling durante o arrasto também
    suppressUntil = Date.now() + 1200;
    writeTimer = setTimeout(function () {
      writeTimer = null;
      push(S.getRgb());
    }, WRITE_DEBOUNCE);
  }

  /**
   * Push imediato sem debounce — usado no pointerup para garantir que
   * a cor final seja gravada no Photoshop sem delay.
   */
  function pushNow() {
    if (!connected) return;
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    push(S.getRgb());
  }

  /* ---------------- Polling de mudanças externas ---------------- */

  function sameRgb(a, b) {
    return a && b && a.r === b.r && a.g === b.g && a.b === b.b;
  }

  /**
   * Tolerância de arredondamento: quando o painel trabalha em LAB ou CMYK,
   * a ida-e-volta RGB → PS → RGB pode deslocar 1–2 níveis por componente
   * (gerenciamento de cor, arredondamento de 16 bits para 8). Sem folga,
   * o polling adota esse ruído como "cor nova do host" e apaga o triplo
   * editado, fazendo os sliders LAB saltarem.
   */
  function closeEnough(a, b) {
    return a && b &&
      Math.abs(a.r - b.r) <= 2 &&
      Math.abs(a.g - b.g) <= 2 &&
      Math.abs(a.b - b.b) <= 2;
  }

  /** O host mudou bem além do ruído da ida-e-volta? */
  function farFrom(a, b) {
    return !!(a && b) && (
      Math.abs(a.r - b.r) > EXTERNAL_DELTA ||
      Math.abs(a.g - b.g) > EXTERNAL_DELTA ||
      Math.abs(a.b - b.b) > EXTERNAL_DELTA);
  }

  function adopt(rgb) {
    if (!rgb) return;
    // Durante a janela de supressão, ignorar TODA leitura do host.
    // Isso evita que o polling adote a cor antiga antes do push chegar.
    if (Date.now() < suppressUntil) return;
    if (closeEnough(rgb, S.getRgb())) return;

    /**
     * Com um triplo LAB/CMYK editado o painel é dono da cor: o ruído da
     * ida-e-volta não pode apagar o triplo. Mas uma cor bem diferente da que
     * nós mesmos gravamos é mudança real no Photoshop — o conta-gotas do Alt,
     * o seletor nativo, a troca X/D — e tem que entrar.
     *
     * Antes o polling simplesmente parava enquanto houvesse triplo, e o triplo
     * só caía quando o próprio painel trocava de cor. Bastava mexer num slider
     * LAB ou CMYK para o painel deixar de acompanhar o conta-gotas do
     * Photoshop, e o próximo clique no painel ainda regravava a cor velha por
     * cima da amostrada.
     */
    if (S.getChannels()) {
      var ref = lastPushed || S.getRgb();
      if (!farFrom(rgb, ref)) return;
    }
    /**
     * `reason: HOST_REASON` marca a origem da mudança. AppState repassa esse
     * valor aos subscribers como segundo argumento, e o nosso subscribe usa
     * isso para não reenviar ao Photoshop a cor que veio dele — o que seria
     * um loop de escrita.
     */
    S.setRgb(rgb.r, rgb.g, rgb.b, { reason: HOST_REASON });
  }

  function poll() {
    if (!connected) return;
    // O triplo LAB/CMYK é protegido em adopt(), que só deixa passar mudança
    // real do host. O polling em si nunca para.
    if (ps) {
      adopt(readForegroundUxp());
    } else if (cs) {
      readForegroundCep(adopt);
    }
  }

  /* ---------------- Init ---------------- */

  function init() {
    setup();
    if (!connected) return;

    // Estado inicial: adota a cor que já está no Photoshop.
    poll();

    // AppState.emit chama os subscribers como fn(state, reason): `reason` é o
    // segundo argumento e é uma string.
    S.subscribe(function (_state, reason) {
      if (reason === HOST_REASON) return;
      /**
       * Cor vinda da outra janela da extensão (PanelSync): quem mexeu já
       * gravou no Photoshop. Regravar aqui era o eco que atrapalhava o
       * conta-gotas: a janela de ferramentas recebia a cor amostrada, gravava
       * de volta com atraso (e já filtrada por máscara/limite) por cima da
       * próxima amostra, e ainda parava de ler o host por 1,2s.
       */
      if (reason === PEER_REASON) return;
      schedulePush();
    });

    pollTimer = setInterval(poll, POLL_INTERVAL);
    // Opcional: uma falha aqui não pode derrubar a ponte já ligada.
    try { initFocusHandback(); } catch (e) { /* sem DOM completo */ }
  }

  /* ---------------- Foco do teclado de volta ao Photoshop ---------------- */

  /**
   * No CEP o painel fica com o foco do teclado depois de qualquer clique. Aí o
   * Alt (conta-gotas temporário do pincel), o B, o X etc. vão para o painel e
   * não para o Photoshop — "o conta-gotas para de funcionar" até o artista
   * clicar no documento. No Windows um Alt solto num painel ainda pode ativar
   * o modo de menu do host, que engole o clique seguinte.
   *
   * Depois de cada gesto com o ponteiro, devolvemos o foco ao Photoshop com o
   * evento oficial do CEP. Campos de texto e selects ficam de fora (precisam
   * do teclado), e o Godê também, porque tem atalhos próprios (Ctrl+Z, Shift).
   */
  var LOSE_FOCUS_EVENT = 'com.adobe.PhotoshopLoseFocus';

  function needsKeyboard(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var tag = n.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (n.isContentEditable) return true;
      if (n.id === 'paneGode' || n.id === 'panelMenu') return true;
    }
    return false;
  }

  function handFocusBack() {
    if (!cs || typeof window.CSEvent !== 'function') return;
    var active = document.activeElement;
    if (active && active !== document.body && needsKeyboard(active)) return;
    try {
      var evt = new window.CSEvent(LOSE_FOCUS_EVENT, 'APPLICATION');
      evt.extensionId = (cs.getExtensionID && cs.getExtensionID()) || '';
      cs.dispatchEvent(evt);
    } catch (e) { /* sem host: nada a fazer */ }
  }

  function initFocusHandback() {
    if (!cs) return;   // só no CEP; o UXP não prende o teclado assim
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('pointerup', function (evt) {
      if (needsKeyboard(evt.target)) return;
      // Depois do clique ser processado (foco, toggles, menus).
      setTimeout(handFocusBack, 0);
    }, true);

    // Alt sozinho no painel não deve abrir o modo de menu do Windows.
    document.addEventListener('keyup', function (evt) {
      if (evt.key === 'Alt') evt.preventDefault();
    });
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    if (writeTimer) clearTimeout(writeTimer);
    pollTimer = null;
    writeTimer = null;
  }

  return {
    init: init,
    stop: stop,
    isConnected: isConnected,
    push: push,
    pushNow: pushNow
  };
})();
