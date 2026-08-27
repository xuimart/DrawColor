/**
 * oauth-server.js — Servidor HTTP local temporário para captura de OAuth callback.
 *
 * Apenas funciona em ambiente CEP (onde Node.js está disponível via cep_node).
 * Inicia um servidor em localhost:{port}, abre a URL OAuth no browser externo,
 * e captura o authorization code quando o Google redireciona de volta.
 *
 * Depende de:
 *   - cep_node.require('http')
 *   - cep_node.require('https')
 *   - cep_node.require('url')
 *   - cep_node.require('child_process')
 *   - cep_node.require('os')
 *   - window.License.CONFIG (para googleClientId e oauthLocalPort)
 */
window.OAuthServer = (function () {
  'use strict';

  var activeServer = null;
  var pendingResolve = null;
  var pendingReject = null;

  /**
   * Inicia o fluxo OAuth completo:
   * 1. Abre servidor local
   * 2. Abre browser com URL do Google OAuth
   * 3. Espera o redirect com o code
   * 4. Troca code por tokens
   * 5. Retorna o ID token
   *
   * @param {object} config - { googleClientId, oauthLocalPort, firebaseApiKey }
   * @returns {Promise<{idToken:string, email:string, uid:string, refreshToken:string}>}
   */
  function startFlow(config) {
    if (!config || !config.googleClientId) {
      return Promise.reject(new Error('Google Client ID not configured'));
    }

    var port = config.oauthLocalPort || 8437;
    var clientId = config.googleClientId;
    var clientSecret = config.googleClientSecret || '';
    var redirectUri = 'http://localhost:' + port + '/callback';

    return new Promise(function (resolve, reject) {
      pendingResolve = resolve;
      pendingReject = reject;

      var http, url;
      try {
        http = cep_node.require('http');
        url = cep_node.require('url');
      } catch (e) {
        reject(new Error('Cannot load http module: ' + e.message));
        return;
      }

      // Create temporary HTTP server
      activeServer = http.createServer(function (req, res) {
        var parsed = url.parse(req.url, true);

        if (parsed.pathname === '/callback') {
          // Implicit flow: token is in the URL fragment (not visible to server)
          // Serve an HTML page that extracts the fragment and posts it to /token
          var error = parsed.query.error;
          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body><h2>Login cancelado</h2><p>Voce pode fechar esta janela.</p></body></html>');
            _cleanup();
            if (pendingReject) pendingReject(new Error('OAuth cancelled: ' + error));
            return;
          }

          // Serve page that reads fragment and redirects to /token endpoint
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<html><body><h2>Processando login...</h2><script>' +
            'var hash = window.location.hash.substring(1);' +
            'var params = new URLSearchParams(hash);' +
            'var idToken = params.get("id_token");' +
            'if (idToken) {' +
            '  window.location.href = "/token?id_token=" + encodeURIComponent(idToken);' +
            '} else {' +
            '  document.body.innerHTML = "<h2>Erro: token nao recebido</h2><p>" + hash + "</p>";' +
            '}' +
            '</script></body></html>'
          );

        } else if (parsed.pathname === '/token') {
          // Receives the id_token from the client-side redirect
          var idToken = parsed.query.id_token;
          if (idToken) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body><h2>Login realizado!</h2><p>Pode fechar esta janela e voltar ao Photoshop.</p></body></html>');

            // Decode the JWT to get email and uid
            var payload = _decodeJwt(idToken);
            _cleanup();
            if (pendingResolve) pendingResolve({
              idToken: idToken,
              accessToken: '',
              refreshToken: idToken,
              email: payload.email || '',
              uid: payload.sub || ''
            });
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing id_token');
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      activeServer.listen(port, '127.0.0.1', function () {
        // Server is ready — open browser
        // Use implicit flow (response_type=token) to get ID token directly
        // No code exchange needed — token comes in the redirect URL fragment
        var oauthUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
          + '?client_id=' + encodeURIComponent(clientId)
          + '&redirect_uri=' + encodeURIComponent(redirectUri)
          + '&response_type=id_token'
          + '&scope=' + encodeURIComponent('openid email profile')
          + '&nonce=' + Date.now()
          + '&prompt=consent';

        _openBrowser(oauthUrl);
      });

      activeServer.on('error', function (err) {
        _cleanup();
        if (pendingReject) pendingReject(new Error('Server error: ' + err.message));
      });

      // Timeout after 2 minutes
      setTimeout(function () {
        if (activeServer) {
          _cleanup();
          if (pendingReject) pendingReject(new Error('OAuth timeout — no response within 2 minutes'));
        }
      }, 120000);
    });
  }

  /**
   * Troca o authorization code por tokens usando o Google Token endpoint.
   */
  function _exchangeCode(code, clientId, clientSecret, redirectUri) {
    return new Promise(function (resolve, reject) {
      var https = cep_node.require('https');
      var querystring = cep_node.require('querystring');

      var postData = querystring.stringify({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

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

      var req = https.request(options, function (res) {
        var body = '';
        res.on('data', function (chunk) { body += chunk; });
        res.on('end', function () {
          try {
            var data = JSON.parse(body);
            if (data.error) {
              reject(new Error('Token exchange failed: ' + data.error_description));
              return;
            }
            // Decode the ID token to get email and uid
            var payload = _decodeJwt(data.id_token);
            resolve({
              idToken: data.id_token,
              accessToken: data.access_token,
              refreshToken: data.refresh_token || '',
              email: payload.email || '',
              uid: payload.sub || ''
            });
          } catch (e) {
            reject(new Error('Failed to parse token response'));
          }
        });
      });

      req.on('error', function (e) {
        reject(new Error('Token request failed: ' + e.message));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Decode JWT payload (without verification — the server verifies it).
   */
  function _decodeJwt(token) {
    try {
      var parts = token.split('.');
      if (parts.length !== 3) return {};
      var payload = parts[1];
      // Base64url decode
      payload = payload.replace(/-/g, '+').replace(/_/g, '/');
      var json = Buffer.from(payload, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (e) {
      return {};
    }
  }

  /**
   * Opens URL in system default browser.
   */
  function _openBrowser(url) {
    var exec = cep_node.require('child_process').exec;
    var os = cep_node.require('os');
    var platform = os.platform();

    if (platform === 'win32') {
      exec('start "" "' + url + '"');
    } else if (platform === 'darwin') {
      exec('open "' + url + '"');
    } else {
      exec('xdg-open "' + url + '"');
    }
  }

  /**
   * Cleanup: close server and reset state.
   */
  function _cleanup() {
    if (activeServer) {
      try { activeServer.close(); } catch (e) { /* ignore */ }
      activeServer = null;
    }
    pendingResolve = null;
    pendingReject = null;
  }

  /**
   * Cancel an in-progress OAuth flow.
   */
  function cancelFlow() {
    _cleanup();
  }

  return {
    startFlow: startFlow,
    cancelFlow: cancelFlow
  };
})();
