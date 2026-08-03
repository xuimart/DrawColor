/**
 * panel-sync.js — Ponte de estado entre as janelas da extensão.
 *
 * A janela Modeless do CEP é uma instância separada da extensão: outro
 * documento, outro contexto de JS, outro `AppState`. Não existe objeto
 * compartilhado entre ela e o painel ancorado. O que existe é o barramento de
 * eventos do CSXS, que entrega mensagens a todas as extensões do host.
 *
 * Por que não confiar só na PSBridge: ela já sincroniza cor pelo foreground do
 * Photoshop, e isso de fato faz as duas janelas convergirem. Mas por polling,
 * a cada 400 ms, e passando pelo host. Arrastar a roda numa janela e ver os
 * sliders da outra correndo atrasados fica ruim. Este módulo manda a cor
 * direto, sem intermediário.
 *
 * Fora do CEP (navegador, UXP) o módulo carrega e não faz nada: não há
 * segunda janela para sincronizar.
 */
window.PanelSync = (function () {
  'use strict';

  var EVENT_TYPE = 'com.drawcolor.color';
  var PEER_REASON = 'peer';
  var SEND_DEBOUNCE = 30;

  var S = null;
  var cs = null;
  var active = false;
  var sendTimer = null;

  /**
   * O PlugPlug entrega o evento a todas as extensões que escutam o tipo,
   * inclusive a que despachou. Sem uma marca de origem cada janela reagiria à
   * própria mensagem, e duas janelas ficariam empurrando cor uma na outra.
   */
  var selfId = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function available() {
    var P = window.Platform;
    if (!P || !P.isCep) return false;
    if (typeof window.CSInterface !== 'function') return false;
    var b = window.__adobe_cep__;
    return !!(b && typeof b.dispatchEvent === 'function' && typeof b.addEventListener === 'function');
  }

  /* ---------------- saída ---------------- */

  function send() {
    if (!active) return;
    var hsv = S.getHsv();
    var evt = new window.CSEvent(EVENT_TYPE, 'APPLICATION');
    evt.data = JSON.stringify({ from: selfId, h: hsv.h, s: hsv.s, v: hsv.v });
    try {
      cs.dispatchEvent(evt);
    } catch (e) {
      // Uma janela fechada do outro lado não é erro: só não há quem ouça.
      active = false;
    }
  }

  function scheduleSend() {
    if (!active) return;
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(function () {
      sendTimer = null;
      send();
    }, SEND_DEBOUNCE);
  }

  /* ---------------- entrada ---------------- */

  /**
   * Exportada para teste: o payload atravessa como string e pode chegar
   * malformado se outra extensão usar o mesmo tipo de evento.
   */
  function parse(raw) {
    if (raw === null || raw === undefined) return null;
    var text = typeof raw === 'string' ? raw : (raw.data !== undefined ? raw.data : null);
    if (typeof text !== 'string' || !text) return null;

    var msg;
    try {
      msg = JSON.parse(text);
    } catch (e) {
      return null;
    }
    if (!msg || typeof msg !== 'object') return null;
    if (typeof msg.h !== 'number' || typeof msg.s !== 'number' || typeof msg.v !== 'number') return null;
    if (!isFinite(msg.h) || !isFinite(msg.s) || !isFinite(msg.v)) return null;
    return msg;
  }

  function receive(raw) {
    var msg = parse(raw);
    if (!msg) return false;
    if (msg.from === selfId) return false;

    var cur = S.getHsv();
    if (cur.h === msg.h && cur.s === msg.s && cur.v === msg.v) return false;

    /**
     * `reason: PEER_REASON` impede o eco: o subscribe abaixo ignora mudanças
     * com essa origem, então aplicar a cor do par não gera um novo envio.
     */
    S.setHsv({ h: msg.h, s: msg.s, v: msg.v }, { reason: PEER_REASON, relock: true });
    return true;
  }

  /* ---------------- init ---------------- */

  function init() {
    S = window.AppState;
    if (!S || !available()) return false;

    try {
      cs = new window.CSInterface();
      cs.addEventListener(EVENT_TYPE, receive);
    } catch (e) {
      return false;
    }

    active = true;

    S.subscribe(function (_state, reason) {
      if (reason === PEER_REASON) return;
      scheduleSend();
    });

    return true;
  }

  function stop() {
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = null;
    active = false;
  }

  return {
    init: init,
    stop: stop,
    isActive: function () { return active; },
    // expostos para teste
    parse: parse,
    receive: receive,
    EVENT_TYPE: EVENT_TYPE
  };
})();
