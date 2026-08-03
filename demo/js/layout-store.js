/**
 * layout-store.js — Layout_Store (Requisito 10).
 *
 * Gerencia perfis de layout em localStorage. Cada perfil associa os 18
 * Movable_Controls a uma Anchor (ângulo + raio). O perfil "Padrão" é
 * derivado de window.LAYOUT.ANCHORS e não pode ser modificado pelo usuário.
 *
 * API pública em window.LayoutStore:
 *   init(), getActiveProfile(), setAnchor(controlId, anchor),
 *   createProfile(name), renameProfile(old, new), activateProfile(name),
 *   deleteProfile(name), resetToDefault(), listProfiles(), subscribe(fn)
 */
window.LayoutStore = (function () {
  'use strict';

  var DEFAULT_PROFILE_NAME = 'Padrão';
  var STORAGE_KEY_PROFILES = 'layout_profiles';
  var STORAGE_KEY_ACTIVE = 'layout_active';
  var SAVE_DELAY = 500;

  /**
   * Mapa de perfis sem protótipo.
   *
   * Com `{}`, um perfil chamado '__proto__' viraria atribuição de protótipo em
   * vez de entrada, e nomes como 'constructor' ou 'toString' apareceriam como
   * existentes por herança. Object.create(null) não tem nem o setter de
   * __proto__ nem membros herdados, então qualquer nome de 1 a 40 caracteres
   * é aceito como chave comum — o que o Requisito 10.6 exige.
   */
  var profiles = Object.create(null);
  var activeName = DEFAULT_PROFILE_NAME;
  var subscribers = [];
  var saveTimer = null;
  var storageAvailable = true;

  /* -------- Helpers -------- */

  /**
   * Storage efetivo: o Platform Adapter quando presente (UXP/CEP/navegador),
   * senão o localStorage direto. O fallback mantém os testes de propriedade
   * funcionando com um mock de localStorage, sem carregar o adapter.
   */
  function backing() {
    if (window.Platform && window.Platform.storage) return window.Platform.storage;
    return window.localStorage;
  }

  function getDefaultAnchors() {
    var anchors = {};
    var src = window.LAYOUT && window.LAYOUT.ANCHORS ? window.LAYOUT.ANCHORS : {};
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      anchors[id] = { angle: src[id].angle, radius: src[id].radius };
    }
    return anchors;
  }

  function fillMissing(profileAnchors) {
    var defaults = getDefaultAnchors();
    var keys = Object.keys(defaults);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      if (!profileAnchors[id]) {
        profileAnchors[id] = { angle: defaults[id].angle, radius: defaults[id].radius };
      }
    }
    return profileAnchors;
  }

  function notify() {
    var profile = getActiveProfile();
    for (var i = 0; i < subscribers.length; i++) {
      subscribers[i](profile);
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, SAVE_DELAY);
  }

  function persist() {
    if (!storageAvailable) return;
    try {
      var data = {};
      var keys = Object.keys(profiles);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] !== DEFAULT_PROFILE_NAME) {
          data[keys[i]] = profiles[keys[i]];
        }
      }
      backing().setItem(STORAGE_KEY_PROFILES, JSON.stringify(data));
      backing().setItem(STORAGE_KEY_ACTIVE, activeName);
    } catch (e) {
      storageAvailable = false;
    }
  }

  function load() {
    try {
      var raw = backing().getItem(STORAGE_KEY_PROFILES);
      if (raw) {
        var parsed = JSON.parse(raw);
        var keys = Object.keys(parsed);
        for (var i = 0; i < keys.length; i++) {
          // `profiles` não tem protótipo, então qualquer nome vindo do disco
          // é gravado como propriedade própria, inclusive '__proto__'.
          if (keys[i] !== DEFAULT_PROFILE_NAME) {
            profiles[keys[i]] = parsed[keys[i]];
          }
        }
      }
      var active = backing().getItem(STORAGE_KEY_ACTIVE);
      if (active && hasProfile(active)) {
        activeName = active;
      }
    } catch (e) {
      storageAvailable = false;
    }
  }

  /**
   * Existência de perfil por propriedade própria.
   *
   * `profiles[name]` com name = '__proto__', 'constructor' ou 'toString'
   * devolve membro herdado de Object.prototype — truthy — e faria o store
   * tratar um perfil inexistente como existente.
   */
  function hasProfile(name) {
    return Object.prototype.hasOwnProperty.call(profiles, name);
  }

  function uniqueName(name) {
    if (!hasProfile(name)) return name;
    var i = 2;
    while (hasProfile(name + ' (' + i + ')')) {
      i++;
    }
    return name + ' (' + i + ')';
  }

  /* -------- Public API -------- */

  function init() {
    // Reset state
    profiles = Object.create(null);
    activeName = DEFAULT_PROFILE_NAME;
    saveTimer = null;
    storageAvailable = true;

    // Default profile always comes from LAYOUT.ANCHORS
    profiles[DEFAULT_PROFILE_NAME] = getDefaultAnchors();

    // Load user profiles from localStorage
    load();

    // Ensure default always exists with correct values
    profiles[DEFAULT_PROFILE_NAME] = getDefaultAnchors();

    // Fill missing anchors in active profile
    if (activeName !== DEFAULT_PROFILE_NAME && hasProfile(activeName)) {
      profiles[activeName] = fillMissing(profiles[activeName]);
    }

    notify();
  }

  function getActiveProfile() {
    return {
      name: activeName,
      anchors: profiles[activeName] || getDefaultAnchors()
    };
  }

  function setAnchor(controlId, anchor) {
    if (activeName === DEFAULT_PROFILE_NAME) return; // read-only
    if (!hasProfile(activeName)) {
      profiles[activeName] = fillMissing({});
    }
    profiles[activeName][controlId] = { angle: anchor.angle, radius: anchor.radius };
    scheduleSave();
    notify();
  }

  function createProfile(name) {
    if (!name || typeof name !== 'string') return null;
    if (name.length < 1 || name.length > 40) return null;
    var effective = uniqueName(name);
    profiles[effective] = getDefaultAnchors();
    persist();
    return effective;
  }

  function renameProfile(oldName, newName) {
    if (oldName === DEFAULT_PROFILE_NAME) return false;
    if (!hasProfile(oldName)) return false;
    if (!newName || typeof newName !== 'string') return false;
    if (newName.length < 1 || newName.length > 40) return false;
    var effective = uniqueName(newName);
    profiles[effective] = profiles[oldName];
    delete profiles[oldName];
    if (activeName === oldName) {
      activeName = effective;
    }
    persist();
    notify();
    return true;
  }

  function activateProfile(name) {
    if (!hasProfile(name)) return;
    activeName = name;
    profiles[activeName] = fillMissing(profiles[activeName]);
    persist();
    notify();
  }

  function deleteProfile(name) {
    if (name === DEFAULT_PROFILE_NAME) return;
    if (!hasProfile(name)) return;
    delete profiles[name];
    if (activeName === name) {
      activeName = DEFAULT_PROFILE_NAME;
    }
    persist();
    notify();
  }

  function resetToDefault() {
    if (activeName === DEFAULT_PROFILE_NAME) return;
    profiles[activeName] = getDefaultAnchors();
    persist();
    notify();
  }

  function listProfiles() {
    return Object.keys(profiles);
  }

  function subscribe(fn) {
    if (typeof fn === 'function') {
      subscribers.push(fn);
    }
  }

  return {
    DEFAULT_PROFILE_NAME: DEFAULT_PROFILE_NAME,
    init: init,
    getActiveProfile: getActiveProfile,
    setAnchor: setAnchor,
    createProfile: createProfile,
    renameProfile: renameProfile,
    activateProfile: activateProfile,
    deleteProfile: deleteProfile,
    resetToDefault: resetToDefault,
    listProfiles: listProfiles,
    subscribe: subscribe
  };
})();
