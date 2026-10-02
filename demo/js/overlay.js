/**
 * overlay.js — Overlay Controller (Licenciamento).
 *
 * Gerencia a camada de bloqueio sobre o plugin quando a licença não é válida.
 * Cria o DOM dinamicamente; inclui anti-tamper via MutationObserver que
 * re-injeta o overlay caso seja removido do DOM enquanto deveria estar visível.
 *
 * Depende de:
 *   - window.License (login, deactivateMachine — opcional, para handlers de botão)
 *
 * API pública:
 *   window.Overlay.show(state)   — exibe overlay para o estado dado
 *   window.Overlay.hide()        — remove overlay, libera interação
 *   window.Overlay.isVisible()   — retorna boolean
 */
window.Overlay = (function () {
  'use strict';

  var I18N = window.I18N;

  /* ============================================================
   * Configuração
   * ============================================================ */

  var OVERLAY_ID = 'dc-license-overlay';
  var OVERLAY_Z = 9999999;
  var STORE_URL = 'https://buy.stripe.com/test_14A5kxfcUd386Nr3Pr3cc00';

  /* ============================================================
   * Estado interno
   * ============================================================ */

  /** @type {HTMLElement|null} */
  var overlayEl = null;

  /** @type {boolean} Se true, overlay deve estar visível (anti-tamper) */
  var shouldBeVisible = false;

  /** @type {{type:string, machines?:Array, message?:string}|null} */
  var currentState = null;

  /** @type {MutationObserver|null} */
  var observer = null;

  /* ============================================================
   * Construção do DOM
   * ============================================================ */

  /**
   * Gera o conteúdo HTML interno do overlay com base no estado.
   * @param {{type:string, machines?:Array, message?:string}} state
   * @returns {string}
   */
  function _buildContent(state) {
    var html = '';

    switch (state.type) {
      case 'login':
        html =
          '<div class="dc-overlay-card">' +
            '<h2 class="dc-overlay-title">' + I18N.t('ov.login.title') + '</h2>' +
            '<p class="dc-overlay-text">' + I18N.t('ov.login.text') + '</p>' +
            '<button class="dc-overlay-btn dc-overlay-btn--primary" id="dc-overlay-login">' + I18N.t('ov.login.btn') + '</button>' +
          '</div>';
        break;

      case 'expired':
        html =
          '<div class="dc-overlay-card">' +
            '<h2 class="dc-overlay-title">' + I18N.t('ov.expired.title') + '</h2>' +
            '<p class="dc-overlay-text">' + I18N.t('ov.expired.text') + '</p>' +
            '<button class="dc-overlay-btn dc-overlay-btn--primary" id="dc-overlay-store">' + I18N.t('ov.expired.btn') + '</button>' +
          '</div>';
        break;

      case 'machine_limit':
        var machineItems = '';
        var machines = state.machines || [];
        var locale = I18N.get() === 'pt' ? 'pt-BR' : 'en-US';
        for (var i = 0; i < machines.length; i++) {
          var m = machines[i];
          var name = m.name || m.id;
          var lastSeen = m.lastSeen ? new Date(m.lastSeen).toLocaleDateString(locale) : '—';
          machineItems +=
            '<li class="dc-overlay-machine">' +
              '<span class="dc-overlay-machine-name">' + _escapeHtml(name) + '</span>' +
              '<span class="dc-overlay-machine-date">' + lastSeen + '</span>' +
              '<button class="dc-overlay-btn dc-overlay-btn--sm" data-machine-id="' + _escapeHtml(m.id) + '">' + I18N.t('ov.machine.deactivate') + '</button>' +
            '</li>';
        }
        html =
          '<div class="dc-overlay-card">' +
            '<h2 class="dc-overlay-title">' + I18N.t('ov.machine.title') + '</h2>' +
            '<p class="dc-overlay-text">' + I18N.t('ov.machine.text') + '</p>' +
            '<ul class="dc-overlay-machine-list">' + machineItems + '</ul>' +
          '</div>';
        break;

      case 'offline_expired':
        html =
          '<div class="dc-overlay-card">' +
            '<h2 class="dc-overlay-title">' + I18N.t('ov.offline.title') + '</h2>' +
            '<p class="dc-overlay-text">' + I18N.t('ov.offline.text') + '</p>' +
          '</div>';
        break;

      case 'error':
        html =
          '<div class="dc-overlay-card">' +
            '<h2 class="dc-overlay-title">' + I18N.t('ov.error.title') + '</h2>' +
            '<p class="dc-overlay-text">' + _escapeHtml(state.message || I18N.t('ov.error.unknown')) + '</p>' +
            '<button class="dc-overlay-btn dc-overlay-btn--primary" id="dc-overlay-retry">' + I18N.t('ov.error.retry') + '</button>' +
          '</div>';
        break;

      default:
        html =
          '<div class="dc-overlay-card">' +
            '<p class="dc-overlay-text">' + I18N.t('ov.unknown') + '</p>' +
          '</div>';
    }

    return html;
  }

  /**
   * Escapa HTML para evitar XSS.
   * @param {string} str
   * @returns {string}
   */
  function _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }

  /**
   * Cria o elemento overlay no DOM.
   * @param {{type:string, machines?:Array, message?:string}} state
   * @returns {HTMLElement}
   */
  function _createOverlay(state) {
    var el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.className = 'dc-license-overlay';
    el.style.zIndex = OVERLAY_Z;
    el.innerHTML = _buildContent(state);
    return el;
  }

  /* ============================================================
   * Event handlers (delegados)
   * ============================================================ */

  /**
   * Handler de clique no overlay — usa delegação de eventos.
   * @param {MouseEvent} e
   */
  function _handleClick(e) {
    var target = e.target;

    // Login com Google
    if (target.id === 'dc-overlay-login') {
      if (window.License && typeof window.License.login === 'function') {
        window.License.login();
      }
      return;
    }

    // Comprar licença (abre loja)
    if (target.id === 'dc-overlay-store') {
      window.open(STORE_URL, '_blank');
      return;
    }

    // Retry (erro)
    if (target.id === 'dc-overlay-retry') {
      if (window.License && typeof window.License.validate === 'function') {
        window.License.validate();
      }
      return;
    }

    // Desativar máquina (botões com data-machine-id)
    var machineId = target.getAttribute('data-machine-id');
    if (machineId) {
      target.disabled = true;
      target.textContent = '…';
      if (window.License && typeof window.License.deactivateMachine === 'function') {
        window.License.deactivateMachine(machineId).then(function (result) {
          if (!result.success) {
            target.disabled = false;
            target.textContent = I18N.t('ov.machine.error');
            setTimeout(function () { target.textContent = I18N.t('ov.machine.deactivate'); }, 2000);
          }
          // Se sucesso, License.validate() será chamado e o overlay será
          // atualizado ou removido automaticamente pelo status change.
        });
      }
      return;
    }
  }

  /* ============================================================
   * Anti-tamper: MutationObserver
   * ============================================================ */

  /**
   * Inicia o MutationObserver que detecta remoção do overlay do DOM.
   * Se o overlay for removido enquanto shouldBeVisible === true, re-injeta.
   */
  function _startObserver() {
    if (observer) return; // já ativo

    observer = new MutationObserver(function (mutations) {
      if (!shouldBeVisible) return;

      // Verifica se o overlay ainda está no DOM
      var existing = document.getElementById(OVERLAY_ID);
      if (!existing && currentState) {
        // Re-injeta
        _inject(currentState);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Para o MutationObserver.
   */
  function _stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /* ============================================================
   * Bloqueio de pointer events no painel
   * ============================================================ */

  /**
   * Bloqueia interação com o plugin subjacente.
   */
  function _blockInteraction() {
    var panel = document.getElementById('panel');
    if (panel) {
      panel.style.pointerEvents = 'none';
    }
  }

  /**
   * Libera interação com o plugin subjacente.
   */
  function _unblockInteraction() {
    var panel = document.getElementById('panel');
    if (panel) {
      panel.style.pointerEvents = '';
    }
  }

  /* ============================================================
   * Injeção / remoção
   * ============================================================ */

  /**
   * Injeta o overlay no DOM (body).
   * @param {{type:string, machines?:Array, message?:string}} state
   */
  function _inject(state) {
    // Remove existente se houver
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.removeEventListener('click', _handleClick);
      existing.parentNode.removeChild(existing);
    }

    overlayEl = _createOverlay(state);
    overlayEl.addEventListener('click', _handleClick);
    document.body.appendChild(overlayEl);
  }

  /**
   * Remove o overlay do DOM.
   */
  function _remove() {
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.removeEventListener('click', _handleClick);
      existing.parentNode.removeChild(existing);
    }
    overlayEl = null;
  }

  /* ============================================================
   * API Pública
   * ============================================================ */

  /**
   * Exibe o overlay para o estado dado.
   * @param {{type:string, machines?:Array, message?:string}} state
   */
  function show(state) {
    if (!state || !state.type) return;

    currentState = state;
    shouldBeVisible = true;

    _inject(state);
    _blockInteraction();
    _startObserver();
  }

  /**
   * Remove o overlay e libera a interface.
   */
  function hide() {
    shouldBeVisible = false;
    currentState = null;

    _stopObserver();
    _remove();
    _unblockInteraction();
  }

  /**
   * Retorna true se o overlay está (ou deveria estar) visível.
   * @returns {boolean}
   */
  function isVisible() {
    return shouldBeVisible;
  }

  /* ============================================================
   * Exportação
   * ============================================================ */

  return {
    show: show,
    hide: hide,
    isVisible: isVisible
  };
})();
