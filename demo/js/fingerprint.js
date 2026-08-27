/**
 * fingerprint.js — Machine Fingerprint Generator.
 *
 * Gera um identificador determinístico por máquina, composto por
 * hostname + '|' + username. Usado pelo License Module para identificar
 * a máquina nas chamadas de validação.
 *
 * Depende de Platform.env para detectar o ambiente (cep, uxp, web).
 * Deve ser carregado após platform.js.
 */
window.Fingerprint = (function () {
  'use strict';

  /**
   * Gera o fingerprint completo: hostname|username.
   * - CEP: usa cep_node.require('os')
   * - UXP: usa require('os')
   * - Web (demo): retorna valor fixo 'web-demo|anonymous'
   *
   * @returns {string} Machine fingerprint no formato "hostname|username"
   */
  function generate() {
    var env = window.Platform && window.Platform.env;

    if (env === 'cep') {
      var os = cep_node.require('os');
      return os.hostname() + '|' + os.userInfo().username;
    }

    if (env === 'uxp') {
      var osUxp = require('os');
      return osUxp.hostname() + '|' + osUxp.userInfo().username;
    }

    // Web (demo mode) — valor fixo
    return 'web-demo|anonymous';
  }

  /**
   * Retorna apenas o hostname (parte legível para humanos).
   * Útil para exibir o nome da máquina na UI (ex: lista de máquinas ativas).
   *
   * @returns {string} Hostname da máquina ou 'web-demo' em modo web
   */
  function getDisplayName() {
    var fingerprint = generate();
    return fingerprint.split('|')[0];
  }

  return {
    generate: generate,
    getDisplayName: getDisplayName
  };
})();
