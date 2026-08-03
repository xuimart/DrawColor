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

  var connected = false;
  var ps = null;             // módulo 'photoshop' no UXP
  var cs = null;             // CSInterface no CEP
  var writeTimer = null;
  var pollTimer = null;

  // Última cor que nós mesmos escrevemos, para o polling não reenviar
  // de volta o que acabamos de mandar (evita loop).
  var lastPushed = null;
  var suppressUntil = 0;

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
    try {
      cs.evalScript(jsx, function (res) {
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
      connected = false;
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
    suppressUntil = Date.now() + POLL_INTERVAL + 200;

    if (ps) writeForegroundUxp(rgb);
    else if (cs) writeForegroundCep(rgb);
  }

  function schedulePush() {
    if (!connected) return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(function () {
      writeTimer = null;
      push(S.getRgb());
    }, WRITE_DEBOUNCE);
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

  function adopt(rgb) {
    if (!rgb) return;
    if (Date.now() < suppressUntil && sameRgb(rgb, lastPushed)) return;
    if (closeEnough(rgb, S.getRgb())) return;
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
    /**
     * Enquanto o estado tiver um triplo de canais editado, o painel é dono da
     * cor e o polling não deve interferir. Sem isso, o ida-e-volta
     * RGB → PS → RGB (com gerenciamento de cor, arredondamento, perfil ICC
     * diferente de sRGB) gera diferenças que o polling lê como "cor nova" e
     * adota, matando o triplo — os sliders LAB/CMYK saltam.
     *
     * É o mesmo princípio que o Coolorus usa: durante a interação com o
     * seletor de cor do plugin, a ponte não relê do host.
     */
    if (S.getChannels()) return;

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
      schedulePush();
    });

    pollTimer = setInterval(poll, POLL_INTERVAL);
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
    push: push
  };
})();
