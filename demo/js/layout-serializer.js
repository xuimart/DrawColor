/**
 * layout-serializer.js — Exportação e importação de perfis de layout em JSON.
 *
 * Converte entre LayoutProfile (objeto em memória) e texto JSON portável.
 * Valida versão, intervalos de ângulo/raio e IDs de controle conhecidos.
 *
 * Requisitos: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
 */
window.LayoutSerializer = (function () {
  'use strict';

  var FORMAT_VERSION = 1;

  var KNOWN_IDS = [
    'harmony.1', 'harmony.2', 'harmony.3', 'harmony.4', 'harmony.5', 'harmony.6',
    'sat.gamutmask', 'sat.shape', 'hex.field',
    'history.redo', 'history.undo',
    'rail.dial.temperature', 'rail.dial.brightness', 'rail.lumlock', 'rail.valuecheck',
    'swatch.fg', 'swatch.bg', 'swatch.swap'
  ];

  /**
   * Lookup de IDs conhecidos via Set, não via objeto literal.
   *
   * Com `{}` como mapa, `knownSet['__proto__']` devolve Object.prototype —
   * truthy — e chaves herdadas como `constructor`, `toString` e `valueOf`
   * passariam como IDs válidos, chegando a ser gravadas em `anchors` e
   * poluindo o protótipo. Um Set só reconhece o que foi inserido.
   */
  var KNOWN_LOOKUP = typeof Set === 'function' ? new Set(KNOWN_IDS) : null;

  function isKnownId(id) {
    if (KNOWN_LOOKUP) return KNOWN_LOOKUP.has(id);
    return KNOWN_IDS.indexOf(id) !== -1;
  }

  /**
   * Exporta um perfil para texto JSON.
   * @param {LayoutProfile} profile - { name: string, anchors: Record<string, Anchor> }
   * @returns {string} JSON formatado (version 1)
   */
  function exportProfile(profile) {
    var controls = {};
    var anchors = profile.anchors || {};
    Object.keys(anchors).forEach(function (id) {
      controls[id] = {
        angle: parseFloat(anchors[id].angle.toFixed(3)),
        radius: parseFloat(anchors[id].radius.toFixed(3))
      };
    });
    return JSON.stringify({
      version: FORMAT_VERSION,
      name: profile.name,
      controls: controls
    }, null, 2);
  }

  /**
   * Importa um perfil a partir de texto JSON.
   * @param {string} jsonText - Texto JSON a ser parseado e validado
   * @returns {{ ok: boolean, profile?: LayoutProfile, error?: string, discarded?: number }}
   */
  function importProfile(jsonText) {
    // 1. Parse JSON
    var data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      return { ok: false, error: 'Texto inválido — verifique a formatação JSON' };
    }

    // 2. Check version
    if (data.version !== FORMAT_VERSION) {
      return { ok: false, error: 'Versão não suportada — exporte de uma versão atual' };
    }

    // 3. Validate controls object exists
    var controls = data.controls;
    if (!controls || typeof controls !== 'object') {
      return { ok: false, error: 'Texto inválido — verifique a formatação JSON' };
    }

    // 4. Validate each control entry
    var anchors = {};
    var discarded = 0;
    var ids = Object.keys(controls);

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var entry = controls[id];

      // Unknown control ID: discard silently
      if (!isKnownId(id)) {
        discarded++;
        continue;
      }

      // A entrada precisa ser um objeto: `null` quebraria o acesso a .angle
      if (!entry || typeof entry !== 'object') {
        return { ok: false, error: 'Valor fora do intervalo permitido (ângulo 0-360, raio 0-700)' };
      }

      // Validate angle and radius are numbers
      if (typeof entry.angle !== 'number' || typeof entry.radius !== 'number') {
        return { ok: false, error: 'Valor fora do intervalo permitido (ângulo 0-360, raio 0-700)' };
      }

      // Validate ranges: angle ∈ [0, 360], radius ∈ [0, 700]
      if (entry.angle < 0 || entry.angle > 360 || entry.radius < 0 || entry.radius > 700) {
        return { ok: false, error: 'Valor fora do intervalo permitido (ângulo 0-360, raio 0-700)' };
      }

      anchors[id] = { angle: entry.angle, radius: entry.radius };
    }

    var result = {
      ok: true,
      profile: { name: data.name || 'Imported', anchors: anchors }
    };
    if (discarded > 0) { result.discarded = discarded; }
    return result;
  }

  return {
    FORMAT_VERSION: FORMAT_VERSION,
    KNOWN_IDS: KNOWN_IDS,
    exportProfile: exportProfile,
    importProfile: importProfile
  };
})();
