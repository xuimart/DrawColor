/**
 * CSInterface.js — Shim mínimo, não a biblioteca completa da Adobe.
 *
 * A CSInterface oficial tem cerca de mil linhas e expõe dezenas de recursos
 * (tema, cache de extensões, informação de sistema). Este projeto usa quatro
 * coisas: avaliar ExtendScript, identificar a versão do host, abrir outra
 * extensão do bundle e trocar eventos com ela. Em vez de embutir a biblioteca
 * inteira, este shim fala direto com `__adobe_cep__`, que é a ponte nativa que
 * o runtime CEP injeta na janela.
 *
 * Se algum recurso adicional do CEP for necessário depois, o caminho é trocar
 * este arquivo pela CSInterface oficial — a superfície usada aqui é a mesma.
 */
(function () {
  'use strict';

  function bridge() {
    return window.__adobe_cep__;
  }

  function CSInterface() {}

  /**
   * Executa ExtendScript no host e devolve o resultado como string.
   * O CEP entrega sempre string; conversão fica com quem chama.
   */
  CSInterface.prototype.evalScript = function (script, callback) {
    var cb = callback || function () {};
    var b = bridge();
    if (!b || typeof b.evalScript !== 'function') {
      // Fora do CEP: falha explícita em vez de silenciosa.
      cb('EvalScript error.');
      return;
    }
    b.evalScript(script, cb);
  };

  /** Versão e locale do aplicativo hospedeiro, ou null fora do CEP. */
  CSInterface.prototype.getHostEnvironment = function () {
    var b = bridge();
    if (!b || typeof b.getHostEnvironment !== 'function') return null;
    try {
      return JSON.parse(b.getHostEnvironment());
    } catch (e) {
      return null;
    }
  };

  /** Identificador da extensão em execução, útil para depuração. */
  CSInterface.prototype.getExtensionID = function () {
    var b = bridge();
    if (!b || typeof b.getExtensionId !== 'function') return null;
    return b.getExtensionId();
  };

  /**
   * Abre outra extensão do mesmo bundle. É assim que o painel principal faz
   * aparecer a janela Modeless: o host cria a janela, não nós.
   */
  CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    var b = bridge();
    if (!b || typeof b.requestOpenExtension !== 'function') return false;
    b.requestOpenExtension(extensionId, params || '');
    return true;
  };

  /**
   * Evento do barramento do CSXS (PlugPlug). Serve para as duas janelas da
   * extensão conversarem: elas são instâncias separadas, sem JS em comum.
   * `data` é sempre string na travessia.
   */
  function CSEvent(type, scope, appId, extensionId) {
    this.type = type;
    this.scope = scope || 'APPLICATION';
    this.appId = appId;
    this.extensionId = extensionId;
    this.data = '';
  }

  CSInterface.prototype.dispatchEvent = function (event) {
    var b = bridge();
    if (!b || typeof b.dispatchEvent !== 'function') return false;
    if (event && typeof event.data === 'object' && event.data !== null) {
      event.data = JSON.stringify(event.data);
    }
    b.dispatchEvent(event);
    return true;
  };

  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    var b = bridge();
    if (!b || typeof b.addEventListener !== 'function') return false;
    b.addEventListener(type, listener, obj);
    return true;
  };

  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    var b = bridge();
    if (!b || typeof b.removeEventListener !== 'function') return false;
    b.removeEventListener(type, listener, obj);
    return true;
  };

  window.CSEvent = CSEvent;
  window.CSInterface = CSInterface;
})();
