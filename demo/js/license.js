/**
 * license.js — License Module.
 *
 * Gerencia autenticação Google, validação de licença via Cloud Functions,
 * cache offline e estado do licenciamento. Não usa Firebase Client SDK —
 * apenas chamadas HTTP para as Cloud Functions.
 *
 * Depende de:
 *   - window.Platform  (storage, env)
 *   - window.Fingerprint (machineId)
 *   - window.Overlay (UI de bloqueio — opcional, só para show/hide)
 *
 * Deve ser carregado após platform.js e fingerprint.js.
 */
window.License = (function () {
  'use strict';

  /* ============================================================
   * Configuração
   * ============================================================ */

  var CONFIG = {
    // URLs das Cloud Functions (Cloud Run v2)
    validateUrl: 'https://validate-rxwbgiwuqa-uc.a.run.app',
    deactivateUrl: 'https://deactivate-machine-rxwbgiwuqa-uc.a.run.app',
    webhookUrl: 'https://purchase-webhook-rxwbgiwuqa-uc.a.run.app',
    // Chave de storage para a sessão de autenticação
    authSessionKey: 'drawcolor-auth-session',
    // Chave de storage para o cache de validação
    validationCacheKey: 'drawcolor-license-cache',
    // Grace period em milissegundos (4 horas)
    gracePeriodMs: 4 * 60 * 60 * 1000,
    // Timeout de validação em milissegundos (5 segundos)
    validateTimeoutMs: 5000,
    // Google OAuth Client ID (configurar com o projeto Firebase)
    googleClientId: '85688443338-ju0cpceadrt1hfgtvnpao2555tq4g1ko.apps.googleusercontent.com',
    // Google OAuth Client Secret (necessário para trocar code por token no CEP)
    googleClientSecret: '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',
    // Porta para o servidor OAuth localhost (CEP)
    oauthLocalPort: 8437
  };

  /* ============================================================
   * Estado interno
   * ============================================================ */

  /** @type {'trial'|'active'|'expired'|'machine_limit'|'unauthenticated'|'offline_grace'|'offline_expired'} */
  var currentStatus = 'unauthenticated';

  /** @type {number|null} */
  var daysLeft = null;

  /** @type {Array<{id:string, name:string, lastSeen:string}>} */
  var machinesList = [];

  /** @type {Array<function>} */
  var statusListeners = [];

  /** @type {{uid:string, email:string, refreshToken:string, lastTokenRefresh:number}|null} */
  var authSession = null;

  /* ============================================================
   * Helpers internos
   * ============================================================ */

  function _getStorage() {
    return window.Platform && window.Platform.storage;
  }

  /**
   * Carrega a sessão de auth do storage local.
   * @returns {{uid:string, email:string, refreshToken:string, lastTokenRefresh:number}|null}
   */
  function _loadSession() {
    var storage = _getStorage();
    if (!storage) return null;
    var raw = storage.getItem(CONFIG.authSessionKey);
    if (!raw) return null;
    try {
      var session = JSON.parse(raw);
      if (session && session.uid && session.email && session.refreshToken) {
        return session;
      }
    } catch (e) { /* JSON inválido */ }
    return null;
  }

  /**
   * Persiste a sessão de auth no storage local.
   * @param {{uid:string, email:string, refreshToken:string, lastTokenRefresh:number}} session
   */
  function _saveSession(session) {
    var storage = _getStorage();
    if (!storage) return;
    storage.setItem(CONFIG.authSessionKey, JSON.stringify(session));
  }

  /**
   * Remove a sessão de auth do storage local.
   */
  function _clearSession() {
    var storage = _getStorage();
    if (!storage) return;
    storage.removeItem(CONFIG.authSessionKey);
  }

  /**
   * Notifica todos os listeners registrados sobre mudança de status.
   */
  function _notifyStatusChange() {
    for (var i = 0; i < statusListeners.length; i++) {
      try {
        statusListeners[i](currentStatus);
      } catch (e) { /* listener não deve quebrar o módulo */ }
    }
  }

  /**
   * Atualiza o status interno e notifica listeners.
   * @param {'trial'|'active'|'expired'|'machine_limit'|'unauthenticated'|'offline_grace'|'offline_expired'} newStatus
   */
  function _setStatus(newStatus) {
    if (currentStatus !== newStatus) {
      currentStatus = newStatus;
      _notifyStatusChange();
    }
  }

  /**
   * Valida se a sessão armazenada parece válida (tem campos necessários).
   * Não verifica expiração do token — isso será feito no validate (task 7.2).
   * @param {object} session
   * @returns {boolean}
   */
  function _isSessionValid(session) {
    if (!session) return false;
    if (!session.uid || !session.email || !session.refreshToken) return false;
    if (typeof session.lastTokenRefresh !== 'number') return false;
    return true;
  }

  /* ============================================================
   * Validação online + cache offline (task 7.2)
   * ============================================================ */

  /**
   * Realiza a validação online contra a Cloud Function /validate.
   * Usa XMLHttpRequest para compatibilidade com CEP.
   * Implementa timeout, cache em sucesso, e fallback offline.
   * @returns {Promise<void>}
   */
  function _doValidation() {
    if (!authSession) {
      _setStatus('unauthenticated');
      return Promise.resolve();
    }

    var token = authSession.refreshToken;
    var machineId = getMachineId();

    if (!token || !machineId) {
      _setStatus('unauthenticated');
      return Promise.resolve();
    }

    // Demo/fake token: skip real server validation, assume trial
    if (token.indexOf('fake-refresh-token-') === 0) {
      daysLeft = 14;
      _setStatus('trial');
      if (window.Overlay && typeof window.Overlay.hide === 'function') {
        window.Overlay.hide();
      }
      // Inject badge after a small delay to ensure DOM is ready
      setTimeout(_injectTrialBadge, 300);
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      var url = CONFIG.validateUrl;
      var timedOut = false;
      var settled = false;

      function settle() {
        if (settled) return;
        settled = true;
      }

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = CONFIG.validateTimeoutMs;

      xhr.onload = function () {
        if (settled) return;
        settle();

        if (xhr.status === 200) {
          try {
            var response = JSON.parse(xhr.responseText);
            // Update internal state
            currentStatus = response.status;
            daysLeft = (typeof response.daysLeft === 'number') ? response.daysLeft : null;
            machinesList = Array.isArray(response.machines) ? response.machines : [];

            // Cache the successful validation
            _cacheValidation(response.status, daysLeft, machineId);

            // Notify listeners
            _notifyStatusChange();

            // Show/hide overlay based on status
            _updateOverlayForStatus(response.status);
          } catch (e) {
            // Parse error — treat as network failure, use cache fallback
            _handleOfflineFallback();
          }
        } else if (xhr.status === 401) {
          // Token invalid/expired — clear session
          authSession = null;
          _clearSession();
          _setStatus('unauthenticated');
          if (window.Overlay && typeof window.Overlay.show === 'function') {
            window.Overlay.show({ type: 'login' });
          }
        } else {
          // Other HTTP errors — use offline fallback
          _handleOfflineFallback();
        }

        resolve();
      };

      xhr.ontimeout = function () {
        if (settled) return;
        settle();
        timedOut = true;
        _handleOfflineFallback();
        resolve();
      };

      xhr.onerror = function () {
        if (settled) return;
        settle();
        _handleOfflineFallback();
        resolve();
      };

      var body = JSON.stringify({ token: token, machineId: machineId });
      xhr.send(body);
    });
  }

  /**
   * Armazena o resultado de validação bem-sucedida no cache local.
   * @param {string} status - Status retornado pela Cloud Function
   * @param {number|null} days - Dias restantes de trial
   * @param {string} machineId - Fingerprint da máquina que validou
   */
  function _cacheValidation(status, days, machineId) {
    var storage = _getStorage();
    if (!storage) return;

    var cacheEntry = {
      status: status,
      validatedAt: Date.now(),
      daysLeft: days,
      machineId: machineId
    };

    storage.setItem(CONFIG.validationCacheKey, JSON.stringify(cacheEntry));
  }

  /**
   * Lida com o cenário offline: timeout ou erro de rede.
   * Verifica o cache e aplica a lógica de grace period (4 horas).
   */
  function _handleOfflineFallback() {
    var cached = getCachedStatus();

    if (cached && cached.validatedAt) {
      var age = Date.now() - cached.validatedAt;

      if (age < CONFIG.gracePeriodMs) {
        if (cached.status === 'trial' || cached.status === 'active') {
          daysLeft = (typeof cached.daysLeft === 'number') ? cached.daysLeft : null;
          _setStatus('offline_grace');
        } else {
          daysLeft = (typeof cached.daysLeft === 'number') ? cached.daysLeft : null;
          _setStatus(cached.status);
          _updateOverlayForStatus(cached.status);
        }
      } else {
        // Cache expirado — clear session and show login
        authSession = null;
        _clearSession();
        _setStatus('unauthenticated');
        if (window.Overlay && typeof window.Overlay.show === 'function') {
          window.Overlay.show({ type: 'login' });
        }
      }
    } else {
      // No cache — clear session and show login
      authSession = null;
      _clearSession();
      _setStatus('unauthenticated');
      if (window.Overlay && typeof window.Overlay.show === 'function') {
        window.Overlay.show({ type: 'login' });
      }
    }
  }

  /**
   * Atualiza o overlay com base no status da licença.
   * @param {string} status
   */
  function _updateOverlayForStatus(status) {
    if (!window.Overlay) return;

    if (status === 'trial' || status === 'active') {
      if (typeof window.Overlay.hide === 'function') {
        window.Overlay.hide();
      }
    } else if (status === 'expired') {
      if (typeof window.Overlay.show === 'function') {
        window.Overlay.show({ type: 'expired' });
      }
    } else if (status === 'machine_limit') {
      if (typeof window.Overlay.show === 'function') {
        window.Overlay.show({ type: 'machine_limit', machines: machinesList });
      }
    }
  }

  /* ============================================================
   * API Pública: Autenticação
   * ============================================================ */

  /**
   * Inicializa o License Module.
   * Verifica se existe sessão autenticada armazenada.
   * Se existir e for válida, inicia validação.
   * Se não existir, mostra overlay de login.
   *
   * @returns {Promise<void>}
   */
  function init() {
    authSession = _loadSession();

    if (_isSessionValid(authSession)) {
      // Sessão encontrada — tenta validar
      return _doValidation();
    }

    // Sem sessão válida — status unauthenticated, mostra overlay de login
    authSession = null;
    _setStatus('unauthenticated');

    if (window.Overlay && typeof window.Overlay.show === 'function') {
      window.Overlay.show({ type: 'login' });
    }

    return Promise.resolve();
  }

  // When the panel regains focus (e.g., user returns from browser OAuth),
  // re-check if a session was saved and update the overlay accordingly.
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', function () {
      if (currentStatus === 'unauthenticated') {
        var savedSession = _loadSession();
        if (_isSessionValid(savedSession)) {
          authSession = savedSession;
          daysLeft = 14;
          currentStatus = 'trial';
          _notifyStatusChange();
          if (window.Overlay && typeof window.Overlay.hide === 'function') {
            window.Overlay.hide();
          }
        }
      }
    });
  }

  /**
   * Inicia o fluxo de login.
   *
   * - Web (demo): gera sessão fake para teste.
   * - CEP: abre URL OAuth no navegador externo via child_process.
   * - UXP: abre URL OAuth no navegador externo via shell.openExternal.
   *
   * @returns {Promise<{success:boolean, error?:string, email?:string}>}
   */
  function login() {
    // Force CEP path if cep_node is available (regardless of Platform.env detection)
    if (typeof cep_node !== 'undefined' && cep_node && cep_node.require) {
      return _loginCep();
    }

    // Fallback to web login (demo/testing)
    return _loginWeb();
  }

  /**
   * Login simulado para modo web/demo.
   * Gera uma sessão fake para permitir testes da interface.
   * @returns {Promise<{success:boolean, email:string}>}
   */
  function _loginWeb() {
    var fakeSession = {
      uid: 'web-demo-uid-' + Date.now(),
      email: 'demo@drawcolor.test',
      refreshToken: 'fake-refresh-token-' + Math.random().toString(36).substr(2),
      lastTokenRefresh: Date.now()
    };

    authSession = fakeSession;
    _saveSession(fakeSession);
    daysLeft = 14;
    _setStatus('trial');

    if (window.Overlay && typeof window.Overlay.hide === 'function') {
      window.Overlay.hide();
    }

    // Inject trial badge directly
    _injectTrialBadge();

    return Promise.resolve({ success: true, email: fakeSession.email });
  }

  /**
   * Inserts the trial badge into the DOM.
   */
  function _injectTrialBadge() {
    var existing = document.getElementById('trialBadge');
    if (existing) existing.parentNode.removeChild(existing);
    if (!daysLeft) return;

    var badge = document.createElement('div');
    badge.id = 'trialBadge';
    badge.style.cssText = 'background:#de2246;color:#fff;text-align:center;padding:3px 8px;font-size:10px;font-weight:500;line-height:1.4;position:fixed;top:0;left:0;right:0;z-index:999999;';
    badge.innerHTML = daysLeft + ' dias restantes \u00b7 <a href="https://buy.stripe.com/test_14A5kxfcUd386Nr3Pr3cc00" target="_blank" style="color:#fff;text-decoration:underline;pointer-events:auto;">Comprar licen\u00e7a</a>';
    document.body.appendChild(badge);
  }

  /**
   * Login via OAuth para CEP.
   * Abre o URL de OAuth no navegador externo do sistema.
   * O servidor localhost de callback é um stretch goal — por ora,
   * apenas abre o URL e retorna indicação de fluxo iniciado.
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  function _loginCep() {
    if (!CONFIG.googleClientId) {
      return Promise.resolve({ success: false, error: 'Google Client ID not configured' });
    }

    var port = CONFIG.oauthLocalPort || 8437;
    var clientId = CONFIG.googleClientId;
    var redirectUri = 'http://localhost:' + port + '/callback';
    var fs = cep_node.require('fs');
    var path = cep_node.require('path');
    var os = cep_node.require('os');
    var tokenFile = path.join(os.tmpdir(), 'drawcolor-oauth-token.json');

    // Clean up any previous token file
    try { fs.unlinkSync(tokenFile); } catch (e) { /* ignore */ }

    // Start the OAuth server that writes token to file
    try {
      var http = cep_node.require('http');
      var url = cep_node.require('url');

      var server = http.createServer(function (req, res) {
        var parsed = url.parse(req.url, true);

        if (parsed.pathname === '/callback') {
          if (parsed.query.error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body><h2>Login cancelado</h2></body></html>');
            try { server.close(); } catch (e) {}
            return;
          }

          var code = parsed.query.code;
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body><h2>Login realizado!</h2><p>Volte ao Photoshop.</p></body></html>');

            // Exchange code for tokens using Node https
            var https = cep_node.require('https');
            var postData = 'code=' + encodeURIComponent(code)
              + '&client_id=' + encodeURIComponent(clientId)
              + '&client_secret=' + encodeURIComponent(CONFIG.googleClientSecret || '')
              + '&redirect_uri=' + encodeURIComponent(redirectUri)
              + '&grant_type=authorization_code';

            var options = {
              hostname: 'oauth2.googleapis.com',
              port: 443,
              path: '/token',
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
              }
            };

            var tokenReq = https.request(options, function (tokenRes) {
              var body = '';
              tokenRes.on('data', function (chunk) { body += chunk; });
              tokenRes.on('end', function () {
                try {
                  var tokenData = JSON.parse(body);
                  if (tokenData.id_token) {
                    fs.writeFileSync(tokenFile, JSON.stringify({ idToken: tokenData.id_token }));
                  }
                } catch (e) { /* ignore */ }
                try { server.close(); } catch (e) {}
              });
            });
            tokenReq.on('error', function () {
              try { server.close(); } catch (e) {}
            });
            tokenReq.write(postData);
            tokenReq.end();
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing code');
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      server.listen(port, '127.0.0.1', function () {
        // Open browser with implicit flow
        var oauthUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
          + '?client_id=' + encodeURIComponent(clientId)
          + '&redirect_uri=' + encodeURIComponent(redirectUri)
          + '&response_type=code'
          + '&scope=' + encodeURIComponent('openid email profile')
          + '&access_type=offline'
          + '&prompt=consent';

        var exec = cep_node.require('child_process').exec;
        if (os.platform() === 'win32') {
          exec('start "" "' + oauthUrl + '"');
        } else {
          exec('open "' + oauthUrl + '"');
        }
      });

      server.on('error', function () {
        try { server.close(); } catch (e) {}
      });

      // Timeout: close server after 2 min
      setTimeout(function () { try { server.close(); } catch (e) {} }, 120000);

    } catch (e) {
      return Promise.resolve({ success: false, error: 'OAuth server failed: ' + e.message });
    }

    // Poll for the token file every 500ms
    return new Promise(function (resolve) {
      var attempts = 0;
      var maxAttempts = 240; // 2 minutes

      var poller = setInterval(function () {
        attempts++;
        try {
          if (fs.existsSync(tokenFile)) {
            var data = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
            clearInterval(poller);
            // Clean up
            try { fs.unlinkSync(tokenFile); } catch (e) {}

            // Decode JWT to get email/uid
            var parts = data.idToken.split('.');
            var payload = {};
            if (parts.length === 3) {
              try {
                payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
              } catch (e) {}
            }

            // Save session
            var session = {
              uid: payload.sub || 'oauth-' + Date.now(),
              email: payload.email || '',
              refreshToken: data.idToken,
              lastTokenRefresh: Date.now()
            };
            authSession = session;
            _saveSession(session);

            daysLeft = 14;
            currentStatus = 'trial';
            _notifyStatusChange();
            if (window.Overlay && typeof window.Overlay.hide === 'function') {
              window.Overlay.hide();
            }

            resolve({ success: true, email: session.email });
          }
        } catch (e) { /* file not ready yet */ }

        if (attempts >= maxAttempts) {
          clearInterval(poller);
          resolve({ success: false, error: 'OAuth timeout' });
        }
      }, 500);
    });
  }

  /**
   * Login via OAuth para UXP.
   * Abre o URL de OAuth no navegador externo.
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  function _loginUxp() {
    if (!CONFIG.googleClientId) {
      return Promise.resolve({
        success: false,
        error: 'Google Client ID not configured'
      });
    }

    var redirectUri = 'http://localhost:' + CONFIG.oauthLocalPort + '/callback';
    var oauthUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?client_id=' + encodeURIComponent(CONFIG.googleClientId)
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&response_type=code'
      + '&scope=' + encodeURIComponent('openid email profile')
      + '&access_type=offline'
      + '&prompt=consent';

    try {
      var shell = require('uxp').shell;
      shell.openExternal(oauthUrl);

      return Promise.resolve({
        success: true,
        error: 'OAuth flow started in external browser. Complete login there.'
      });
    } catch (e) {
      return Promise.resolve({
        success: false,
        error: 'Failed to open OAuth URL: ' + (e.message || e)
      });
    }
  }

  /**
   * Efetua logout: limpa a sessão armazenada e notifica mudança de status.
   */
  function logout() {
    authSession = null;
    daysLeft = null;
    machinesList = [];
    _clearSession();
    _setStatus('unauthenticated');

    if (window.Overlay && typeof window.Overlay.show === 'function') {
      window.Overlay.show({ type: 'login' });
    }
  }

  /**
   * Retorna o refresh token armazenado, ou null se não autenticado.
   * @returns {string|null}
   */
  function getToken() {
    if (authSession && authSession.refreshToken) {
      return authSession.refreshToken;
    }
    return null;
  }

  /**
   * Verifica se existe uma sessão autenticada válida.
   * @returns {boolean}
   */
  function isAuthenticated() {
    return _isSessionValid(authSession);
  }

  /* ============================================================
   * API Pública: Estado e Observação
   * ============================================================ */

  /**
   * Registra um listener para mudanças de status da licença.
   * @param {function} callback - Recebe o novo status como argumento.
   */
  function onStatusChange(callback) {
    if (typeof callback === 'function') {
      statusListeners.push(callback);
    }
  }

  /**
   * Retorna o status atual da licença.
   * @returns {'trial'|'active'|'expired'|'machine_limit'|'unauthenticated'|'offline_grace'|'offline_expired'}
   */
  function getStatus() {
    return currentStatus;
  }

  /**
   * Retorna os dias restantes de trial, ou null se não aplicável.
   * @returns {number|null}
   */
  function getDaysLeft() {
    return daysLeft;
  }

  /**
   * Retorna a lista de máquinas (preenchida quando status = machine_limit).
   * @returns {Array<{id:string, name:string, lastSeen:string}>}
   */
  function getMachines() {
    return machinesList;
  }

  /**
   * Retorna o email do usuário autenticado, ou null.
   * @returns {string|null}
   */
  function getEmail() {
    return authSession ? authSession.email : null;
  }

  /* ============================================================
   * API Pública: Validação e Máquinas
   * ============================================================ */

  /**
   * Valida licença contra a Cloud Function /validate.
   * Envia token + machineId, aplica cache e fallback offline.
   * @returns {Promise<void>}
   */
  function validate() {
    return _doValidation();
  }

  /**
   * Retorna o resultado de validação em cache, ou null se inexistente/inválido.
   * @returns {{status:string, validatedAt:number, daysLeft:number|null, machineId:string}|null}
   */
  function getCachedStatus() {
    var storage = _getStorage();
    if (!storage) return null;

    var raw = storage.getItem(CONFIG.validationCacheKey);
    if (!raw) return null;

    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.status === 'string' && typeof parsed.validatedAt === 'number') {
        return parsed;
      }
    } catch (e) { /* JSON inválido */ }

    return null;
  }

  /**
   * Desativa uma máquina. (Stub — implementado em 7.4)
   * @param {string} machineId
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  function deactivateMachine(machineId) {
    var token = authSession ? authSession.refreshToken : null;
    if (!token) {
      return Promise.resolve({ success: false, error: 'Not authenticated' });
    }

    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      var url = CONFIG.deactivateUrl;

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = CONFIG.validateTimeoutMs;

      xhr.onload = function () {
        try {
          var response = JSON.parse(xhr.responseText);
          if (xhr.status === 200 && response.success) {
            // Re-validate to refresh status and machines list
            validate().then(function () {
              resolve({ success: true });
            });
          } else {
            var errorMsg = response.error || response.message || 'Deactivation failed';
            resolve({ success: false, error: errorMsg });
          }
        } catch (e) {
          resolve({ success: false, error: 'Invalid server response' });
        }
      };

      xhr.onerror = function () {
        resolve({ success: false, error: 'Network error' });
      };

      xhr.ontimeout = function () {
        resolve({ success: false, error: 'Network error' });
      };

      xhr.send(JSON.stringify({ token: token, machineId: machineId }));
    });
  }

  /**
   * Retorna o machineId via Fingerprint module.
   * @returns {string}
   */
  function getMachineId() {
    if (window.Fingerprint && typeof window.Fingerprint.generate === 'function') {
      return window.Fingerprint.generate();
    }
    return 'unknown';
  }

  /* ============================================================
   * Exportação pública
   * ============================================================ */

  return {
    // Configuração (permite override antes de init)
    CONFIG: CONFIG,

    // Inicialização
    init: init,

    // Autenticação
    login: login,
    logout: logout,
    getToken: getToken,
    isAuthenticated: isAuthenticated,

    // Validação
    validate: validate,
    getCachedStatus: getCachedStatus,

    // Máquinas (stub — task 7.4)
    deactivateMachine: deactivateMachine,
    getMachineId: getMachineId,

    // Estado
    getStatus: getStatus,
    getDaysLeft: getDaysLeft,
    getMachines: getMachines,
    getEmail: getEmail,
    onStatusChange: onStatusChange
  };
})();
