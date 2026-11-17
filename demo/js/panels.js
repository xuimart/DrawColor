/**
 * panels.js — Sliders multi-modo, mixer, dials de brilho/temperatura, hex e gamut.
 * Requisitos 4, 5, 6, 7, 8.
 */
window.Panels = (function () {
  'use strict';

  const C = window.Color;
  const S = window.AppState;
  const I18N = window.I18N;

  /* ================= Definição dos modos de slider (Requisito 4.1) ================= */

  /**
   * Cada modo declara três coisas:
   *   fromRgb(rgb) → valores dos canais derivados da cor atual
   *   toRgb(vals)  → a cor que esses valores representam
   *   latch        → se o modo precisa guardar os valores editados
   *
   * O `latch` existe porque em LAB e CMYK a conversão de ida e volta não é
   * reversível. LAB descreve cores que o sRGB não alcança, e `labToRgb`
   * recorta por componente; CMYK com K alto colapsa C, M e Y. Derivar os
   * canais da cor a cada leitura, nesses dois modos, faz mover um slider
   * mudar o número dos outros e torna os extremos inalcançáveis. Guardando o
   * triplo editado, cada canal se move sozinho — como no Coolorus.
   */
  const MODES = {
    RGB: {
      channels: [
        { key: 'r', label: 'R', min: 0, max: 255, step: 1, decimals: 0 },
        { key: 'g', label: 'G', min: 0, max: 255, step: 1, decimals: 0 },
        { key: 'b', label: 'B', min: 0, max: 255, step: 1, decimals: 0 }
      ],
      fromRgb: (rgb) => ({ r: rgb.r, g: rgb.g, b: rgb.b }),
      toRgb: (v) => ({
        r: Math.round(C.clamp(v.r, 0, 255)),
        g: Math.round(C.clamp(v.g, 0, 255)),
        b: Math.round(C.clamp(v.b, 0, 255))
      }),
      write: (vals) => S.setRgb(vals.r, vals.g, vals.b, { reason: 'color' })
    },
    HSV: {
      channels: [
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, decimals: 0 },
        { key: 's', label: 'S', min: 0, max: 100, step: 1, decimals: 0 },
        { key: 'v', label: 'V', min: 0, max: 100, step: 1, decimals: 0 }
      ],
      /**
       * HSV vem do estado, não da cor RGB: em cinzas o matiz não existe no RGB
       * e derivar dali zeraria o H que o usuário escolheu.
       */
      fromRgb: () => S.getHsv(),
      toRgb: (v) => C.hsvToRgb(v.h, v.s, v.v),
      write: (vals) => S.setHsv({ h: vals.h, s: vals.s, v: vals.v }, { reason: 'color' })
    },
    LAB: {
      channels: [
        // Inteiros, como o Coolorus e o próprio Photoshop: a casa decimal
        // agitava o campo sem dar controle real.
        { key: 'L', label: 'L', min: 0, max: 100, step: 1, decimals: 0 },
        { key: 'a', label: 'A', min: -128, max: 127, step: 1, decimals: 0 },
        { key: 'b', label: 'B', min: -128, max: 127, step: 1, decimals: 0 }
      ],
      latch: true,
      fromRgb: (rgb) => C.rgbToLab(rgb.r, rgb.g, rgb.b),
      toRgb: (v) => C.labToRgb(v.L, v.a, v.b),
      write: (vals) => {
        const rgb = C.labToRgb(vals.L, vals.a, vals.b);
        /**
         * `force` é necessário justamente nos modos com latch. Fora do sRGB,
         * triplos LAB diferentes recortam para o mesmo RGB: sem force o
         * AppState considera que nada mudou e não avisa ninguém, então o
         * slider e o número ficam no valor anterior enquanto o latch já
         * guardou o novo. O thumb trava e depois salta.
         *
         * `relock`: editar LAB é editar a luminosidade, então redefine a
         * referência do travamento em vez de lutar contra ele.
         *
         * `channels`: declara a posse do triplo editado no AppState.
         */
        S.setRgb(rgb.r, rgb.g, rgb.b, {
          reason: 'slider', relock: true, force: true,
          channels: { mode: 'LAB', vals: { ...vals } }
        });
      }
    },
    CMYK: {
      channels: [
        { key: 'c', label: 'C', min: 0, max: 100, step: 1, decimals: 0 },
        { key: 'm', label: 'M', min: 0, max: 100, step: 1, decimals: 0 },
        { key: 'y', label: 'Y', min: 0, max: 100, step: 1, decimals: 0 },
        { key: 'k', label: 'K', min: 0, max: 100, step: 1, decimals: 0 }
      ],
      latch: true,
      fromRgb: (rgb) => C.rgbToCmyk(rgb.r, rgb.g, rgb.b),
      toRgb: (v) => C.cmykToRgb(v.c, v.m, v.y, v.k),
      write: (vals) => {
        const rgb = C.cmykToRgb(vals.c, vals.m, vals.y, vals.k);
        // Mesmo motivo do LAB: com K alto vários C/M/Y dão o mesmo RGB.
        // `channels`: declara a posse do triplo editado no AppState.
        S.setRgb(rgb.r, rgb.g, rgb.b, {
          reason: 'slider', force: true,
          channels: { mode: 'CMYK', vals: { ...vals } }
        });
      }
    },
    'B/W': {
      channels: [
        { key: 'w', label: 'K', min: 0, max: 100, step: 1, decimals: 0 }
      ],
      fromRgb: (rgb) => {
        if (rgb.r === rgb.g && rgb.g === rgb.b) {
          return { w: Math.round(rgb.r / 255 * 100) };
        }
        const L = C.rgbToLab(rgb.r, rgb.g, rgb.b).L;
        const gray = C.labToRgb(L, 0, 0).r;
        return { w: Math.round(gray / 255 * 100) };
      },
      toRgb: (v) => {
        const g = Math.round((C.clamp(v.w, 0, 100) / 100) * 255);
        return { r: g, g: g, b: g };
      },
      write: (vals) => {
        const g = Math.round((vals.w / 100) * 255);
        S.setRgb(g, g, g, { reason: 'color', relock: true });
      }
    }
  };

  const MODE_ORDER = ['RGB', 'HSV', 'LAB', 'CMYK', 'B/W'];

  /* ================= Valores dos canais e o latch ================= */

  /**
   * O triplo editado agora vive no AppState (state.channels). A invalidação
   * acontece dentro de setHsv: quem é dono do triplo declara na escrita via
   * opts.channels, todo o resto invalida por omissão.
   */

  /**
   * Origens externas — mantida como stub exportado para não quebrar testes
   * existentes que referenciam o símbolo.
   */
  const ORIGENS_EXTERNAS = ['color', 'host', 'peer'];

  /**
   * Tolerância de 1 nível por componente: a cor passa por HSV dentro do
   * AppState e volta arredondada para 8 bits, o que pode deslocar 1 unidade.
   * Sem a folga o latch seria descartado logo depois de ser criado.
   */
  function sameRgb(a, b) {
    return !!a && !!b &&
      Math.abs(a.r - b.r) <= 1 &&
      Math.abs(a.g - b.g) <= 1 &&
      Math.abs(a.b - b.b) <= 1;
  }

  /**
   * Enquanto existe triplo guardado para o modo, ele é a verdade exibida.
   * O triplo é invalidado no AppState quando qualquer escrita de cor não
   * declara ownership via opts.channels.
   */
  function resolveVals(modeName, rgb, current) {
    const mode = MODES[modeName];
    if (mode.latch && current && current.mode === modeName) {
      return { ...current.vals };
    }
    return mode.fromRgb(rgb);
  }

  function readVals() {
    return resolveVals(S.state.sliderMode, S.getRgb(), S.getChannels());
  }

  /** No-op stub — kept exported so existing test code doesn't crash. */
  function dropLatchIfExternal() {}

  /* ================= Sliders ================= */

  var groupEditing = false;
  function isGroupEditing() { return groupEditing; }
  function setGroupEditing(enabled) {
    groupEditing = !!enabled;
    var panel = document.getElementById('panel');
    if (panel) panel.classList.toggle('groups-editing', groupEditing);
    var button = document.getElementById('groupsToggleBtn');
    if (button) button.setAttribute('aria-pressed', String(groupEditing));
    sliderRows.forEach(function (entry) { if (entry.groupUI) entry.groupUI.refresh(); });
    Object.keys(mixerGroupUIs).forEach(function (key) { mixerGroupUIs[key].refresh(); });
    ['bw', 'mixBw'].forEach(function (prefix) {
      if (document.getElementById(prefix + 'GroupTrack')) refreshBwGroupControls(S.state.bwSteps, prefix);
    });
    requestAnimationFrame(measureBodyHeight);
  }

  var levelGroups = {};
  var selectedLevelCells = {};
  var mixerGroupUIs = {};

  function sliderGroupKey(mode, channel) { return 'slider:' + mode + ':' + channel; }
  function mixerGroupKey(key, mode) { return 'mixer:' + stepsKey(key, mode); }
  function getLevelGroups(id) { return levelGroups[id] || {}; }
  function getLevelGroup(id, index) { return getLevelGroups(id)[index] || 1; }

  function levelGroupMax(count, index, precision) {
    if (count < 2 || count > 10 || !Number.isInteger(index) || index < 0 || index >= count) return 1;
    var lo = index === 0 ? 0 : (index - 0.5) / (count - 1);
    var hi = index === count - 1 ? 1 : (index + 0.5) / (count - 1);
    return Math.max(1, Math.min(8, precision ? Math.floor((hi - lo) * precision + 1e-8) : 8));
  }

  function saveLevelGroups() {
    if (window.Platform && window.Platform.storage) window.Platform.storage.setItem('drawcolor-level-groups', JSON.stringify(levelGroups));
  }

  function clearLevelGroups(id) {
    delete levelGroups[id];
    delete selectedLevelCells[id];
    saveLevelGroups();
  }

  function setLevelGroup(id, index, subdivisions, count, precision) {
    if (!Number.isFinite(subdivisions) || levelGroupMax(count, index, precision) <= 1) return;
    var n = C.clamp(Math.round(subdivisions), 1, levelGroupMax(count, index, precision));
    if (n > 1) {
      if (!levelGroups[id]) levelGroups[id] = {};
      levelGroups[id][index] = n;
    } else if (levelGroups[id]) {
      delete levelGroups[id][index];
      if (!Object.keys(levelGroups[id]).length) delete levelGroups[id];
    }
    saveLevelGroups();
  }

  function loadLevelGroups() {
    try {
      var stored = JSON.parse(window.Platform.storage.getItem('drawcolor-level-groups') || '{}');
      Object.keys(stored).forEach(function (id) {
        var parts = id.split(':');
        var valid = parts.length === 3 && ((parts[0] === 'slider' && MODES[parts[1]] && MODES[parts[1]].channels.some(function (ch) {return ch.key === parts[2];})) || (parts[0] === 'mixer' && MIXER_KEYS.indexOf(parts[1]) >= 0));
        if (!valid || !stored[id] || typeof stored[id] !== 'object') return;
        Object.keys(stored[id]).forEach(function (index) {
          var k = stored[id][index];
          if (/^[0-9]$/.test(index) && Number.isInteger(k) && k >= 2 && k <= 8) {
            if (!levelGroups[id]) levelGroups[id] = {};
            levelGroups[id][index] = k;
          }
        });
      });
    } catch (e) { /* no saved groups */ }
  }

  // Parent cells keep equal screen widths. Their sub-colors sample only the
  // interval halfway to each neighboring parent's value, like the B/W ramp.
  function groupedLevelSelection(ratio, count, groups) {
    var selection = mixerSelection(ratio, count);
    if (selection.index === null) return selection;
    var i = selection.index, k = groups && groups[i] || 1;
    if (k <= 1) return selection;
    var local = C.clamp(ratio, 0, 1) * count - i;
    var sub = Math.min(k - 1, Math.floor(local * k));
    var lo = i === 0 ? 0 : (i - 0.5) / (count - 1);
    var hi = i === count - 1 ? 1 : (i + 0.5) / (count - 1);
    return {t:lo + (sub + 0.5) * (hi - lo) / k, position:(i + (sub + 0.5) / k) / count, index:i, subIndex:sub};
  }

  function levelStops(count, groups) {
    if (count > 10) return [];
    var stops = [];
    for (var i = 0; i < count; i++) {
      var k = groups && groups[i] || 1;
      for (var j = 0; j < k; j++) stops.push(groupedLevelSelection((i + (j + 0.5) / k) / count, count, groups));
    }
    return stops;
  }

  function nearestLevelStop(stops, ratio) {
    var nearest = 0;
    for (var i = 1; i < stops.length; i++) if (Math.abs(stops[i].t - ratio) < Math.abs(stops[nearest].t - ratio)) nearest = i;
    return nearest;
  }

  function selectionForValue(ratio, count, groups) {
    var stops = levelStops(count, groups);
    return stops.length ? stops[nearestLevelStop(stops, ratio)] : {t:ratio, position:C.clamp(ratio, 0, 1), index:null};
  }

  function paintTrackSelection(track, thumb, selection, count, groups) {
    if (!track || !thumb) return;
    var discrete = count <= 10 && selection.index !== null;
    track.classList.toggle('is-discrete', discrete);
    var k = discrete && groups && groups[selection.index] || 1;
    thumb.classList.toggle('is-subcell', discrete && k > 1);
    if (discrete) {
      var sub = selection.subIndex || 0;
      thumb.style.left = ((selection.index + sub / k) / count * 100) + '%';
      thumb.style.width = (100 / (count * k)) + '%';
    } else {
      thumb.style.left = (selection.position * 100) + '%';
      thumb.style.width = '';
    }
  }

  function drawLevelDividers(ctx, width, height, count, groups) {
    if (count > 10) return;
    for (var i = 0; i < count; i++) {
      var k = groups && groups[i] || 1;
      for (var j = 0; j < k; j++) {
        if (i === 0 && j === 0) continue;
        ctx.fillStyle = j === 0 ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.16)';
        ctx.fillRect(Math.round((i + j / k) * width / count), 0, 1, height);
      }
    }
  }

  function createLevelGroupUI(track, container, getConfig, onChange, before) {
    var row = document.createElement('div');
    row.className = 'level-group-row'; row.hidden = true;
    var controls = document.createElement('div'); controls.className = 'level-group-controls';
    var number = document.createElement('b'); number.setAttribute('aria-live', 'polite');
    var plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+';
    var minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−';
    plus.dataset.groupDelta = '1'; minus.dataset.groupDelta = '-1';
    controls.append(number, plus, minus); row.appendChild(controls);
    if (before) container.insertBefore(row, before); else container.appendChild(row);
    var outline = document.createElement('span'); outline.className = 'level-cell-outline'; outline.hidden = true;
    outline.setAttribute('aria-hidden', 'true'); track.appendChild(outline);
    function refresh() {
      var config = getConfig(), index = selectedLevelCells[config.id];
      var show = groupEditing && config.count <= 10 && Number.isInteger(index) && index < config.count;
      if (row.hidden === show) requestAnimationFrame(measureBodyHeight);
      row.hidden = !show; outline.hidden = !show;
      if (!show) return;
      var k = getLevelGroup(config.id, index);
      number.textContent = k;
      plus.setAttribute('aria-label', I18N.t('bw.groupPlus'));
      minus.setAttribute('aria-label', I18N.t('bw.groupMinus'));
      plus.disabled = k >= levelGroupMax(config.count, index, config.precision);
      minus.disabled = k <= 1;
      var rect = track.getBoundingClientRect(), parent = container.getBoundingClientRect();
      row.style.marginLeft = Math.max(0, rect.left - parent.left) + 'px';
      row.style.width = rect.width + 'px';
      var center = rect.width * (index + 0.5) / config.count;
      controls.style.left = Math.max(0, Math.min(rect.width - controls.offsetWidth, center - controls.offsetWidth / 2)) + 'px';
      outline.style.left = (index * 100 / config.count) + '%';
      outline.style.width = (100 / config.count) + '%';
    }
    [plus, minus].forEach(function (button) {
      button.addEventListener('click', function () {
        var config = getConfig(), index = selectedLevelCells[config.id];
        setLevelGroup(config.id, index, getLevelGroup(config.id, index) + Number(button.dataset.groupDelta), config.count, config.precision);
        onChange(); refresh();
      });
    });
    var disconnect = window.Platform && window.Platform.observeResize ? window.Platform.observeResize(track, refresh) : function () {};
    return {element:row, refresh:refresh, dispose:disconnect};
  }

  function hasCustomLevels() {
    return [sliderLevels, mixerSteps].some(function (settings) {
      return Object.keys(settings || {}).some(function (key) { return settings[key] <= 10; });
    });
  }

  function resetLevels() {
    sliderLevels = {};
    mixerSteps = {};
    levelGroups = {};
    selectedLevelCells = {};
    if (window.Platform && window.Platform.storage) {
      window.Platform.storage.removeItem('drawcolor-slider-levels');
      window.Platform.storage.removeItem('drawcolor-mixer-steps');
      window.Platform.storage.removeItem('drawcolor-level-groups');
    }
  }

  function refreshResetLevels() {
    var button = document.getElementById('resetLevelsBtn');
    if (button) button.disabled = !hasCustomLevels();
  }

  var sliderLevels = {};
  function getSliderLevels(mode, channel) { return sliderLevels[mode + ':' + channel] || 11; }
  function setSliderLevels(mode, channel, count) {
    if (!MODES[mode] || !MODES[mode].channels.some(function (ch) { return ch.key === channel; }) || !Number.isFinite(count)) return;
    const next = C.clamp(Math.round(count), 2, 11);
    if (next !== getSliderLevels(mode, channel)) clearLevelGroups(sliderGroupKey(mode, channel));
    sliderLevels[mode + ':' + channel] = next;
    if (window.Platform && window.Platform.storage) window.Platform.storage.setItem('drawcolor-slider-levels', JSON.stringify(sliderLevels));
  }
  function loadSliderLevels() {
    try {
      var stored = JSON.parse(window.Platform.storage.getItem('drawcolor-slider-levels') || '{}');
      Object.keys(stored).forEach(function (key) {
        var parts = key.split(':');
        var count = stored[key];
        if (parts.length === 2 && MODES[parts[0]] && MODES[parts[0]].channels.some(function (ch) {return ch.key === parts[1];}) && Number.isInteger(count) && count >= 2 && count <= 11) sliderLevels[key] = count;
      });
    } catch (e) { /* start with continuous channels */ }
  }
  function sliderLevelSample(channel, ratio, levels, groups) {
    if (!Number.isFinite(ratio)) return null;
    var selection = groupedLevelSelection(ratio, levels, groups);
    return {value:valueFromRatio(channel, selection.t), position:selection.position, index:selection.index};
  }

  let sliderRows = [];      // { channel, track, thumb, input, gradCtx }
  let sliderDragging = null;

  function buildSliders() {
    const host = document.getElementById('sliderList');
    sliderRows.forEach(function (entry) { if (entry.groupUI) entry.groupUI.dispose(); });
    host.innerHTML = '';
    sliderRows = [];

    const mode = MODES[S.state.sliderMode];

    // Marca o painel quando o modo tem 4 canais (CMYK). Substitui o seletor
    // CSS `:has()`, que o CEF antigo do Photoshop (ex.: 22.5.6) não entende.
    const panelEl = document.querySelector('.panel');
    if (panelEl) panelEl.classList.toggle('has-4ch', mode.channels.length >= 4);

    mode.channels.forEach((ch) => {
      const row = document.createElement('div');
      row.className = 'slider-row';

      const label = document.createElement('span');
      label.className = 'ch-label';
      label.textContent = ch.label;

      const track = document.createElement('div');
      track.className = 'track';
      track.tabIndex = 0;
      track.setAttribute('role', 'slider');
      track.setAttribute('aria-label', I18N.t('slider.channel', { ch: ch.label }));
      track.setAttribute('aria-valuemin', String(ch.min));
      track.setAttribute('aria-valuemax', String(ch.max));

      const grad = document.createElement('canvas');
      grad.width = 256; grad.height = 1;
      track.appendChild(grad);

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      track.appendChild(thumb);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'num-field';
      input.setAttribute('aria-label', I18N.t('slider.channelValue', { ch: ch.label }));

      const levels = document.createElement('div');
      levels.className = 'slider-levels';
      const count = document.createElement('span');
      count.className = 'slider-level-count';
      count.setAttribute('aria-live', 'polite');
      const stepper = document.createElement('div');
      stepper.className = 'bw-stepper slider-level-stepper';
      const minus = document.createElement('button');
      const plus = document.createElement('button');
      minus.type = plus.type = 'button';
      minus.textContent = '−'; plus.textContent = '+';
      const context = S.state.sliderMode + ' · ' + ch.label;
      minus.setAttribute('aria-label', I18N.t('slider.fewerLevels', {ch:context}));
      plus.setAttribute('aria-label', I18N.t('slider.moreLevels', {ch:context}));
      minus.dataset.delta = '-1'; plus.dataset.delta = '1';
      stepper.append(minus, plus);
      levels.append(count, stepper);
      row.append(label, track, input, levels);
      const block = document.createElement('div');
      block.className = 'slider-block'; block.appendChild(row);
      host.appendChild(block);

      const entry = { channel: ch, mode: S.state.sliderMode, track, thumb, input, count, minus, plus, gradCtx: grad.getContext('2d') };
      [minus, plus].forEach(function (button) {
        button.addEventListener('click', function () {
          setSliderLevels(entry.mode, ch.key, getSliderLevels(entry.mode, ch.key) + Number(button.dataset.delta));
          refreshSliders();
        });
      });
      entry.groupId = sliderGroupKey(entry.mode, ch.key);
      entry.groupUI = createLevelGroupUI(track, block, function () {
        return {id:entry.groupId, count:getSliderLevels(entry.mode, ch.key), precision:(ch.max - ch.min) / ch.step};
      }, refreshSliders);
      sliderRows.push(entry);

      wireSliderTrack(entry);
      wireSliderInput(entry);
    });

    refreshSliders();
  }

  /**
   * Fração 0..1 do trilho para valor do canal. Puro, para poder ser testado.
   *
   * Devolve null quando a fração não é um número utilizável. Isso acontece de
   * verdade: um trilho com largura zero — pane recém-trocado, ainda sem layout
   * — faz a conta do ponteiro virar NaN ou Infinity. Não dá para escolher um
   * valor nesse caso; qualquer palpite jogaria a cor para um extremo. Quem
   * chama trata null como "não houve interação".
   */
  function valueFromRatio(ch, t) {
    if (!isFinite(t)) return null;
    return quantize(ch.min + C.clamp(t, 0, 1) * (ch.max - ch.min), ch);
  }

  function valueFromPointer(entry, clientX) {
    const rect = entry.track.getBoundingClientRect();
    if (!rect.width) return null;
    const count = getSliderLevels(entry.mode, entry.channel.key);
    const selection = groupedLevelSelection((clientX - rect.left) / rect.width, count, getLevelGroups(entry.groupId));
    if (selection.index !== null) selectedLevelCells[entry.groupId] = selection.index;
    const value = valueFromRatio(entry.channel, selection.t);
    entry.groupUI.refresh();
    return value;
  }

  function quantize(raw, ch) {
    if (!isFinite(raw)) return null;
    const snapped = Math.round(raw / ch.step) * ch.step;
    return C.clamp(Number(snapped.toFixed(ch.decimals)), ch.min, ch.max);
  }

  /**
   * Aplica um valor a um canal do modo dado. Exposto para teste: é o miolo do
   * gesto, sem depender do DOM.
   */
  function applyChannel(modeName, key, value) {
    // Barreira única: nenhum caminho (ponteiro, teclado, campo) escreve um
    // valor não numérico no estado. Um NaN aqui contaminaria a cor inteira.
    if (value === null || !isFinite(value)) return false;

    const mode = MODES[modeName];
    if (!mode) return false;

    const vals = resolveVals(modeName, S.getRgb(), S.getChannels());
    vals[key] = value;

    mode.write(vals);
    return true;
  }

  function commitChannel(entry, value, exact) {
    if (value === null || !isFinite(value)) return;
    const ch = entry.channel, count = getSliderLevels(entry.mode, ch.key);
    if (!exact && count <= 10) {
      const stops = levelStops(count, getLevelGroups(entry.groupId));
      const stop = stops[nearestLevelStop(stops, (value - ch.min) / (ch.max - ch.min))];
      value = valueFromRatio(ch, stop.t);
    }
    applyChannel(entry.mode, ch.key, value);
    if (entry.groupUI) entry.groupUI.refresh();
  }

  function wireSliderTrack(entry) {
    entry.track.addEventListener('pointerdown', (evt) => {
      if (evt.button !== undefined && evt.button !== 0) return;
      sliderDragging = entry;
      entry.track.setPointerCapture(evt.pointerId);
      commitChannel(entry, valueFromPointer(entry, evt.clientX), true);
    });

    entry.track.addEventListener('pointermove', (evt) => {
      if (sliderDragging !== entry) return;
      commitChannel(entry, valueFromPointer(entry, evt.clientX), true);
    });

    const end = (evt) => {
      if (sliderDragging !== entry) return;
      sliderDragging = null;
      if (entry.track.hasPointerCapture(evt.pointerId)) entry.track.releasePointerCapture(evt.pointerId);
      S.pushHistory();
    };
    entry.track.addEventListener('pointerup', end);
    entry.track.addEventListener('pointercancel', end);
    entry.track.addEventListener('lostpointercapture', end);

    entry.track.addEventListener('keydown', (evt) => {
      const ch = entry.channel;
      const cur = readVals()[ch.key];
      const levels = getSliderLevels(entry.mode, ch.key);
      if (levels <= 10) {
        const stops = levelStops(levels, getLevelGroups(entry.groupId));
        let index = nearestLevelStop(stops, (cur - ch.min) / (ch.max - ch.min));
        if (['ArrowRight', 'ArrowUp', 'PageUp'].indexOf(evt.key) >= 0) index++;
        else if (['ArrowLeft', 'ArrowDown', 'PageDown'].indexOf(evt.key) >= 0) index--;
        else if (evt.key === 'Home') index = 0;
        else if (evt.key === 'End') index = stops.length - 1;
        else return;
        evt.preventDefault();
        const stop = stops[C.clamp(index, 0, stops.length - 1)];
        selectedLevelCells[entry.groupId] = stop.index;
        commitChannel(entry, valueFromRatio(ch, stop.t), true);
        S.pushHistory();
        return;
      }
      const step = levels <= 10 ? (ch.max - ch.min) / (levels - 1) : ch.step;
      const big = levels <= 10 ? step : (ch.max - ch.min) / 10;
      let next = null;
      if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') next = cur + step;
      else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') next = cur - step;
      else if (evt.key === 'PageUp') next = cur + big;
      else if (evt.key === 'PageDown') next = cur - big;
      else if (evt.key === 'Home') next = ch.min;
      else if (evt.key === 'End') next = ch.max;
      if (next === null) return;
      evt.preventDefault();
      commitChannel(entry, quantize(next, ch));
      S.pushHistory();
    });
  }

  // Requisito 4.6 / 4.7: clamp no commit, rejeição de caracteres inválidos
  function wireSliderInput(entry) {
    const ch = entry.channel;
    const allowNegative = ch.min < 0;
    const allowDecimal = ch.decimals > 0;

    const pattern = new RegExp(
      '^' + (allowNegative ? '-?' : '') + '\\d*' + (allowDecimal ? '([.,]\\d*)?' : '') + '$'
    );

    entry.input.addEventListener('input', () => {
      if (!pattern.test(entry.input.value) && entry.input.value !== '') {
        entry.input.value = entry.lastValid || '';
      }
    });

    const commit = () => {
      const raw = entry.input.value.replace(',', '.');
      const num = parseFloat(raw);
      if (!isFinite(num)) { refreshSliders(); return; }
      commitChannel(entry, quantize(num, ch));
      refreshSliders();
      entry.input.value = entry.lastValid;
      S.pushHistory();
    };

    entry.input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') { evt.preventDefault(); commit(); entry.input.blur(); }
    });
    entry.input.addEventListener('blur', commit);
  }

  function refreshSliders() {
    const mode = MODES[S.state.sliderMode];
    const vals = readVals();

    sliderRows.forEach((entry) => {
      const ch = entry.channel;
      const value = vals[ch.key];

      const levels = getSliderLevels(entry.mode, ch.key);
      const countText = levels > 10 ? '∞' : String(levels);
      if (entry.count.textContent !== countText) entry.count.textContent = countText;
      const description = levels > 10 ? I18N.t('mix.continuous') : I18N.t('slider.levelCount', {n:levels});
      entry.count.title = description;
      entry.count.setAttribute('aria-label', description);
      entry.minus.disabled = levels <= 2;
      entry.plus.disabled = levels >= 11;
      entry.track.classList.toggle('is-discrete', levels <= 10);

      // gradiente do canal: varia só esse canal, mantendo os outros
      const g = entry.gradCtx;
      for (let x = 0; x < 256; x++) {
        const t = x / 255;
        const sample = sliderLevelSample(ch, t, levels, getLevelGroups(entry.groupId)).value;
        g.fillStyle = S.displayCss(mode.toRgb({ ...vals, [ch.key]: sample }));
        g.fillRect(x, 0, 1, 1);
      }

      drawLevelDividers(g, 256, 1, levels, getLevelGroups(entry.groupId));
      const ratio = (value - ch.min) / (ch.max - ch.min);
      const groups = getLevelGroups(entry.groupId);
      paintTrackSelection(entry.track, entry.thumb, selectionForValue(ratio, levels, groups), levels, groups);

      const shown = value.toFixed(ch.decimals);
      if (document.activeElement !== entry.input) entry.input.value = shown;
      entry.lastValid = shown;

      entry.track.setAttribute('aria-valuenow', shown);
      entry.groupUI.refresh();
    });
    refreshResetLevels();
  }

  /* ================= Rampa de valores B/W ================= */

  /**
   * Quadrado da régua escolhido para agrupar. É estado de interface, não de
   * cor: fica aqui e não no AppState. Guarda também a contagem da régua em que
   * foi escolhido, porque com outra contagem o mesmo índice é outro tom.
   */
  let bwSelected = null;
  let bwSelectedSteps = null;

  function selectBwCell(index) {
    bwSelected = index;
    bwSelectedSteps = S.state.bwSteps;
  }

  function initBwRamp() {
    ['bw', 'mixBw'].forEach(initBwRampInstance);
  }

  function initBwRampInstance(prefix) {
    document.getElementById(prefix + 'Minus').addEventListener('click', () => {
      S.setBwSteps(S.state.bwSteps - 1);
    });
    document.getElementById(prefix + 'Plus').addEventListener('click', () => {
      S.setBwSteps(S.state.bwSteps + 1);
    });
    document.getElementById(prefix + 'GroupPlus').addEventListener('click', () => {
      if (bwSelected === null) return;
      S.setBwGroup(bwSelected, S.getBwGroup(bwSelected) + 1);
    });
    document.getElementById(prefix + 'GroupMinus').addEventListener('click', () => {
      if (bwSelected === null) return;
      S.setBwGroup(bwSelected, S.getBwGroup(bwSelected) - 1);
    });
    document.getElementById(prefix + 'GroupReset').addEventListener('click', () => {
      S.resetBwGroups();
    });
    if (window.Platform && window.Platform.observeResize) {
      window.Platform.observeResize(document.getElementById(prefix + 'GroupTrack'), function () {
        refreshBwGroupControls(S.state.bwSteps, prefix);
      });
    }
  }

  function refreshBwRamp() {
    refreshBwRampInstance('bw');
    refreshBwRampInstance('mixBw');
  }

  function refreshBwRampInstance(prefix) {
    const block = document.getElementById(prefix + 'Block');
    const isBw = prefix === 'mixBw' || S.state.sliderMode === 'B/W';
    block.hidden = !isBw;
    if (!isBw) return;

    // A seleção não sobrevive a uma troca de contagem: o índice mudou de tom.
    if (bwSelectedSteps !== S.state.bwSteps) bwSelected = null;

    const ramp = S.getBwRamp();
    const host = document.getElementById(prefix + 'Ramp');
    const cur = S.getRgb();
    const currentLevel = (cur.r === cur.g && cur.g === cur.b)
      ? Math.round(cur.r / 255 * 100)
      : Math.round(C.labToRgb(C.rgbToLab(cur.r, cur.g, cur.b).L, 0, 0).r / 255 * 100);

    /**
     * Todos os tons clicáveis em sequência — os quadrados simples e os tons de
     * cada grupo — para achar qual deles corresponde à cor atual.
     */
    const flat = [];
    ramp.forEach((tone, i) => {
      (tone.subs || [tone]).forEach((t) => flat.push({ tone: t, cell: i }));
    });

    let closest = -1, closestDist = Infinity;
    flat.forEach((entry, j) => {
      const d = Math.abs(entry.tone.level - currentLevel);
      if (d < closestDist) { closestDist = d; closest = j; }
    });
    // Tolerância de meio intervalo até o tom vizinho, para uma cor que não
    // está na régua não acender um quadrado qualquer.
    if (closest >= 0) {
      const lv = flat[closest].tone.level;
      const gaps = [flat[closest - 1], flat[closest + 1]]
        .filter(Boolean)
        .map((e) => Math.abs(e.tone.level - lv));
      const half = gaps.length ? Math.min(...gaps) / 2 : 50;
      if (closestDist >= Math.max(half, 0.5)) closest = -1;
    }

    host.innerHTML = '';
    let j = 0;
    ramp.forEach((tone, i) => {
      const cell = document.createElement('div');
      cell.className = 'bw-cell' + (i === bwSelected ? ' is-selected' : '');
      if (tone.subs) cell.classList.add('is-grouped');

      (tone.subs || [tone]).forEach((t) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.background = `rgb(${t.r},${t.g},${t.b})`;
        btn.title = I18N.t('bw.value.title', { n: t.level });
        btn.setAttribute('aria-label', I18N.t('bw.value.aria', { n: t.level }));
        if (j === closest) btn.classList.add('is-current');
        btn.addEventListener('click', () => {
          selectBwCell(i);
          S.setRgb(t.r, t.g, t.b, { commit: true, relock: true });
          // Se a cor já era esta, setRgb não avisa ninguém; a seleção mudou mesmo assim.
          refreshBwRamp();
        });
        cell.appendChild(btn);
        j++;
      });

      host.appendChild(cell);
    });

    document.getElementById(prefix + 'Count').textContent = ramp.length;
    document.getElementById(prefix + 'Minus').disabled = S.state.bwSteps <= S.BW_MIN;
    document.getElementById(prefix + 'Plus').disabled = S.state.bwSteps >= S.BW_MAX;

    refreshBwGroupControls(ramp.length, prefix);
  }

  /**
   * Controles de grupo embaixo do quadrado selecionado.
   *
   * A posição é calculada em px, e não com `transform: translateX(-50%)`: o
   * UXP não aplica transform de forma confiável (ver styles-uxp.css), e aqui
   * a conta é simples — centro do quadrado menos metade da largura do
   * controle, preso às bordas da trilha para não sair da régua nos extremos.
   */
  function refreshBwGroupControls(count, prefix) {
    const ctl = document.getElementById(prefix + 'GroupCtl');
    const track = document.getElementById(prefix + 'GroupTrack');
    document.getElementById(prefix + 'GroupReset').disabled = !S.hasBwGroups();
    track.parentElement.hidden = !groupEditing;

    if (!groupEditing || bwSelected === null || bwSelected >= count) {
      ctl.hidden = true;
      return;
    }

    const k = S.getBwGroup(bwSelected);
    document.getElementById(prefix + 'GroupCount').textContent = k;
    document.getElementById(prefix + 'GroupPlus').disabled = k >= S.bwGroupMax(bwSelected);
    document.getElementById(prefix + 'GroupMinus').disabled = k <= 1;

    ctl.hidden = false;
    const trackW = track.clientWidth;
    const ctlW = ctl.offsetWidth;
    const center = trackW * (bwSelected + 0.5) / count;
    const left = Math.max(0, Math.min(trackW - ctlW, center - ctlW / 2));
    ctl.style.left = left + 'px';
  }

  /* ================= Limitação de cor ================= */

  // O controle de limite de cor aparece em dois lugares: no menu ☰ e num bloco
  // fixo do painel, embaixo da roda. Ambos usam as mesmas classes js-limit-*, e
  // estas funções percorrem todas as instâncias para mantê-las sincronizadas.
  function initLimit() {
    const enableds = document.querySelectorAll('.js-limit-enabled');
    const hueSels = document.querySelectorAll('.js-limit-hue');
    const svSels = document.querySelectorAll('.js-limit-sv');

    hueSels.forEach((hueSel) => {
      S.HUE_STEP_OPTIONS.forEach((n) => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = n;
        if (n === S.state.limit.hueSteps) opt.selected = true;
        hueSel.appendChild(opt);
      });
      hueSel.addEventListener('change', () => {
        S.setLimit({ hueSteps: Number(hueSel.value) });
        window.Wheel.invalidateCaches();
        window.Wheel.requestRender();
      });
    });

    svSels.forEach((svSel) => {
      [['0', 'livre'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['8', '8'], ['10', '10']]
        .forEach(([value, label]) => {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = label;
          if (Number(value) === S.state.limit.svSteps) opt.selected = true;
          svSel.appendChild(opt);
        });
      svSel.addEventListener('change', () => {
        S.setLimit({ svSteps: Number(svSel.value) });
        window.Wheel.invalidateCaches();
        window.Wheel.requestRender();
      });
    });

    enableds.forEach((enabled) => {
      enabled.checked = S.state.limit.enabled;
      enabled.addEventListener('change', () => {
        S.setLimit({ enabled: enabled.checked });
        window.Wheel.invalidateCaches();
        window.Wheel.requestRender();
        S.pushHistory();
      });
    });
  }

  function refreshLimit() {
    const limit = S.state.limit;

    document.querySelectorAll('.js-limit-enabled').forEach((el) => {
      el.checked = limit.enabled;
    });
    document.querySelectorAll('.js-limit-hue').forEach((el) => {
      el.value = String(limit.hueSteps);
    });
    document.querySelectorAll('.js-limit-sv').forEach((el) => {
      el.value = String(limit.svSteps);
    });
    document.querySelectorAll('.js-limit-controls').forEach((el) => {
      el.setAttribute('aria-disabled', String(!limit.enabled));
    });

    const total = limit.svSteps >= 2
      ? limit.hueSteps * limit.svSteps * limit.svSteps
      : null;
    const text = !limit.enabled
      ? 'cor contínua'
      : (total
        ? `${limit.hueSteps} matizes × ${limit.svSteps} tons ≈ ${total} cores`
        : `${limit.hueSteps} matizes`);
    document.querySelectorAll('.js-limit-count').forEach((el) => {
      el.textContent = text;
    });
  }

  function buildModeButtons() {
    const host = document.getElementById('modeBtns');
    host.innerHTML = '';
    MODE_ORDER.forEach((name) => {
      const btn = document.createElement('button');
      btn.className = 'mode-btn' + (S.state.sliderMode === name ? ' is-active' : '');
      btn.textContent = name;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(S.state.sliderMode === name));
      btn.addEventListener('click', () => {
        S.setSliderMode(name);
        buildModeButtons();
        buildSliders();
        // Ajusta a altura do modal flutuante para caber exatamente os canais
        adjustFloatingHeight();
        // Remede a altura do corpo para caber o novo número de canais
        requestAnimationFrame(measureBodyHeight);
      });
      host.appendChild(btn);
    });
  }

  /* ================= Hex (Requisito 6) ================= */

  let hexInput, hexErrorTimer = null, lastValidHex = '#6A0700';

  function initHex() {
    hexInput = document.getElementById('hexInput');

    hexInput.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') { evt.preventDefault(); commitHex(); hexInput.blur(); }
    });
    hexInput.addEventListener('blur', commitHex);
  }

  function commitHex() {
    // Se o campo já corresponde à cor corrente, não reescrever
    const normalized = hexInput.value.replace(/^#/, '').trim();
    if (normalized.toLowerCase() === S.getHex().replace('#', '').toLowerCase()) {
      hexInput.classList.remove('has-error');
      return;
    }
    // Um hex digitado é uma cor exata: honra o valor e redefine a referência
    const ok = S.setHex(hexInput.value, { commit: true, relock: true });
    if (ok) {
      lastValidHex = S.getHex();
      hexInput.classList.remove('has-error');
      return;
    }
    // 6.5: reverte e sinaliza erro por 2 segundos
    hexInput.value = lastValidHex.replace('#', '');
    hexInput.classList.add('has-error');
    clearTimeout(hexErrorTimer);
    hexErrorTimer = setTimeout(() => hexInput.classList.remove('has-error'), 2000);
  }

  function refreshHex() {
    lastValidHex = S.getHex();
    if (document.activeElement !== hexInput) {
      hexInput.value = lastValidHex.replace('#', '');
    }
  }

  /* ================= Dials de brilho e temperatura (Requisito 7) ================= */

  const DIAL_SWEEP = 135;   // graus de curso em cada lado

  function drawDial(cv, ratio, tint) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2, cy = w / 2, r = w / 2 - 4;

    c.clearRect(0, 0, w, w);

    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = '#3d3d3d';
    c.strokeStyle = '#252525';
    c.lineWidth = 1;
    c.fill();
    c.stroke();

    const start = (90 + DIAL_SWEEP) * Math.PI / 180;
    const end = (90 - DIAL_SWEEP) * Math.PI / 180;

    c.beginPath();
    c.arc(cx, cy, r - 3, start, end, true);
    c.lineWidth = 2.5;
    c.strokeStyle = '#5a5a5a';
    c.stroke();

    const angle = start + (end - start) * ratio;

    c.beginPath();
    c.arc(cx, cy, r - 3, start, angle, angle < start);
    c.lineWidth = 2.5;
    c.strokeStyle = tint;
    c.stroke();

    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + (r - 6) * Math.cos(angle), cy + (r - 6) * Math.sin(angle));
    c.lineWidth = 2;
    c.strokeStyle = '#e8e8e8';
    c.stroke();

    c.beginPath();
    c.arc(cx, cy, 2.5, 0, Math.PI * 2);
    c.fillStyle = '#e8e8e8';
    c.fill();
  }

  function ratioFromPointer(cv, evt) {
    const rect = cv.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let deg = Math.atan2(evt.clientY - cy, evt.clientX - cx) * 180 / Math.PI;
    // normaliza para o eixo "para baixo" = 90°
    let rel = deg - 90;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;
    // rel varia de +135 (início) a -135 (fim)
    return C.clamp((DIAL_SWEEP - rel) / (DIAL_SWEEP * 2), 0, 1);
  }

  function initDials() {
    const bright = document.getElementById('dialBright');
    const temp = document.getElementById('dialTemp');

    let baseHue = null;

    function dragDial(cv, onRatio) {
      let active = false;
      cv.addEventListener('pointerdown', (evt) => {
        active = true;
        cv.setPointerCapture(evt.pointerId);
        onRatio(ratioFromPointer(cv, evt));
      });
      cv.addEventListener('pointermove', (evt) => {
        if (!active) return;
        onRatio(ratioFromPointer(cv, evt));
      });
      const end = (evt) => {
        if (!active) return;
        active = false;
        baseHue = null;
        if (cv.hasPointerCapture(evt.pointerId)) cv.releasePointerCapture(evt.pointerId);
        S.pushHistory();
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
    }

    // Brilho: ajusta V mantendo H e S (Requisito 7.2, clamp em 7.6).
    // relock porque o propósito do controle é justamente mudar o brilho.
    dragDial(bright, (ratio) => {
      const hsv = S.getHsv();
      S.setHsv({ h: hsv.h, s: hsv.s, v: ratio * 100 }, { relock: true });
    });

    // Temperatura: desloca o matiz até ±60° (Requisito 7.3)
    dragDial(temp, (ratio) => {
      if (baseHue === null) baseHue = S.getHsv().h - S.state.tempOffset;
      const offset = (ratio * 2 - 1) * 60;
      S.setTempOffset(offset);
      const hsv = S.getHsv();
      S.setHsv({ h: baseHue + S.state.tempOffset, s: hsv.s, v: hsv.v }, { resetTemp: false });
      refreshDials();
    });

    bright.addEventListener('keydown', (evt) => {
      const hsv = S.getHsv();
      if (evt.key === 'ArrowUp' || evt.key === 'ArrowRight') {
        S.setHsv({ ...hsv, v: hsv.v + 1 }, { commit: true }); evt.preventDefault();
      } else if (evt.key === 'ArrowDown' || evt.key === 'ArrowLeft') {
        S.setHsv({ ...hsv, v: hsv.v - 1 }, { commit: true }); evt.preventDefault();
      }
    });

    refreshDials();
  }

  function refreshDials() {
    const hsv = S.getHsv();

    const brightRatio = hsv.v / 100;
    drawDial(document.getElementById('dialBright'), brightRatio, '#d8d8d8');
    document.getElementById('dialBrightVal').textContent = Math.round(hsv.v);
    const bd = document.getElementById('dialBright');
    bd.setAttribute('aria-valuenow', String(Math.round(hsv.v)));

    const offset = S.state.tempOffset;
    const tempRatio = (offset + 60) / 120;
    drawDial(document.getElementById('dialTemp'), tempRatio, offset >= 0 ? '#e8a33d' : '#5aa9f0');
    document.getElementById('dialTempVal').textContent = (offset > 0 ? '+' : '') + Math.round(offset) + '°';
    document.getElementById('dialTemp').setAttribute('aria-valuenow', String(Math.round(offset)));
  }

  /* ================= Gamut (Requisito 8) ================= */

  /**
   * O aviso de fora-de-gamut vive na borda do campo hex, sem ocupar um
   * botão próprio no layout. Duplo clique no campo traz a cor para dentro.
   */
  function refreshGamut() {
    const rgb = S.getRgb();
    const out = C.isOutOfGamut(rgb.r, rgb.g, rgb.b);

    const field = document.getElementById('hexInput');
    if (!field) return;

    field.classList.toggle('out-of-gamut', out);
    field.title = out
      ? 'Fora do gamut CMYK — duplo clique para corrigir'
      : '';
  }

  function initGamut() {
    const field = document.getElementById('hexInput');
    if (!field) return;

    field.addEventListener('dblclick', () => {
      const rgb = S.getRgb();
      if (!C.isOutOfGamut(rgb.r, rgb.g, rgb.b)) return;
      const fixed = C.clipToGamut(rgb.r, rgb.g, rgb.b);
      S.setRgb(fixed.r, fixed.g, fixed.b, { commit: true, relock: true });
    });
  }

  /* ================= Mixer — barras estilo Coolorus ================= */

  var mixerPair = null;
  var mixerPairPosition = 0;
  var pairTransition = 'rgb';
  var activeMixer = null;
  var mixerSteps = {};
  var MIXER_KEYS = ['pair', 'blender', 'shades', 'scheme'];

  function getPairTransition() { return pairTransition; }
  function setPairTransition(mode) {
    if (['rgb', 'hue-cw', 'hue-ccw'].indexOf(mode) < 0) return false;
    pairTransition = mode;
    var select = document.getElementById('mixPairTransition');
    if (select) select.value = mode;
    if (window.Platform && window.Platform.storage) {
      window.Platform.storage.setItem('drawcolor-pair-transition', mode);
    }
    return true;
  }

  function mixerMode(key) {
    var select = document.getElementById(key + 'Mode');
    return select ? select.value : '';
  }

  function stepsKey(key, mode) { return key + ':' + (mode === undefined ? mixerMode(key) : mode); }
  function getMixerSteps(key, mode) { return mixerSteps[stepsKey(key, mode)] || 11; }

  function setMixerSteps(key, count, mode) {
    if (MIXER_KEYS.indexOf(key) < 0 || !Number.isFinite(count)) return;
    const next = C.clamp(Math.round(count), 2, 11);
    if (next !== getMixerSteps(key, mode)) clearLevelGroups(mixerGroupKey(key, mode));
    mixerSteps[stepsKey(key, mode)] = next;
    if (window.Platform && window.Platform.storage) {
      window.Platform.storage.setItem('drawcolor-mixer-steps', JSON.stringify(mixerSteps));
    }
  }

  function loadMixerSteps() {
    try {
      var stored = JSON.parse(window.Platform.storage.getItem('drawcolor-mixer-steps') || '{}');
      Object.keys(stored).forEach(function (key) {
        var count = stored[key];
        if (MIXER_KEYS.indexOf(key.split(':')[0]) >= 0 && Number.isInteger(count) && count >= 2 && count <= 11) mixerSteps[key] = count;
      });
    } catch (e) { /* defaults remain continuous */ }
  }

  function mixerSelection(t, count) {
    t = C.clamp(t, 0, 1);
    if (count > 10) return {t:t, position:t, index:null};
    var index = Math.min(count - 1, Math.floor(t * count));
    return {t:index / (count - 1), position:(index + 0.5) / count, index:index};
  }

  function refreshMixerSteps() {
    MIXER_KEYS.forEach(function (key) {
      var count = getMixerSteps(key);
      var label = document.getElementById(key + 'ColorCount');
      if (label) label.textContent = count > 10 ? I18N.t('mix.continuous') : I18N.t('mix.colorCount', {n:count});
      document.querySelectorAll('.mix-color-stepper button[data-mixer="' + key + '"]').forEach(function (button) {
        button.disabled = Number(button.dataset.delta) < 0 ? count <= 2 : count >= 11;
      });
      var track = document.getElementById(key === 'pair' ? 'mixPairTrack' : key + 'Track');
      if (track) {
        var groups = getLevelGroups(mixerGroupKey(key));
        var ratio = Number(track.getAttribute('aria-valuenow')) / 100;
        paintTrackSelection(track, track.querySelector('.mix-strip-thumb'), selectionForValue(ratio, count, groups), count, groups);
      }
      if (mixerGroupUIs[key]) mixerGroupUIs[key].refresh();
    });
    refreshResetLevels();
  }

  function syncMixerPair(reason) {
    if (activeMixer && activeMixer.key === 'pair') return activeMixer.base;
    // A mistura aplica uma nova cor de pintura, mas não troca suas fontes.
    // Só outra ferramenta ou uma mudança externa inicia um novo par.
    if (!mixerPair || ['color', 'slider', 'host', 'peer', 'swap', 'init', 'host-background', 'background'].indexOf(reason) >= 0 || (reason && reason.indexOf('mixer-') === 0)) {
      mixerPair = {primary:S.getRgb(), secondary:{...S.state.background}};
      mixerPairPosition = 0;
    }
    return mixerPair;
  }

  // Pure color mapping shared by rendering and tests. The base is frozen per gesture.
  function mixerColorAt(key, t, base, mode) {
    if (key === 'pair') {
      t = C.clamp(t, 0, 1);
      if ((mode !== 'hue-cw' && mode !== 'hue-ccw') || t === 0 || t === 1) return C.mixRgb(base.primary, base.secondary, t);
      var a = C.rgbToHsv(base.primary.r, base.primary.g, base.primary.b);
      var b = C.rgbToHsv(base.secondary.r, base.secondary.g, base.secondary.b);
      // Neutros não têm matiz: adotam o da outra fonte, sem arco artificial.
      if (a.s === 0 && b.s === 0) return C.mixRgb(base.primary, base.secondary, t);
      if (a.s === 0) a.h = b.h;
      if (b.s === 0) b.h = a.h;
      var delta = (b.h - a.h + 360) % 360;
      if (delta < 1e-9 || delta > 360 - 1e-9) delta = 0;
      if (mode === 'hue-ccw' && delta > 0) delta -= 360;
      return C.hsvToRgb(a.h + delta * t, a.s + (b.s - a.s) * t, a.v + (b.v - a.v) * t);
    }
    var h = base.h, s = base.s, v = base.v;
    if (key === 'blender') {
      if (mode === 'saturation') s = t * 100;
      else if (mode === 'brightness') v = t * 100;
      else h += (t - 0.5) * 120;
    } else if (key === 'shades') {
      if (mode === 'tints') { s = (1 - t) * 100; v = 100; }
      else if (mode === 'tones') { s = t * 100; v = 100 - t * 50; }
      else v = t * 100;
    } else h = (h + t * 360) % 360;
    return C.hsvToRgb(h, s, v);
  }

  function drawMixerCanvas(key, canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var base = activeMixer && activeMixer.key === key ? activeMixer.base : key === 'pair' ? syncMixerPair() : S.getHsv();
    var mode = key === 'pair' ? getPairTransition() : mixerMode(key), count = getMixerSteps(key);
    var ctx = canvas.getContext('2d');
    var w = canvas.width = Math.max(2, canvas.offsetWidth || 300);
    for (var x = 0; x < w; x++) {
      var sample = groupedLevelSelection(x / (w - 1), count, getLevelGroups(mixerGroupKey(key)));
      ctx.fillStyle = S.displayCss(mixerColorAt(key, sample.t, base, mode));
      ctx.fillRect(x, 0, 1, canvas.height);
    }
    // The fill changes abruptly at the same boundaries used by hit-testing.
    drawLevelDividers(ctx, w, canvas.height, count, getLevelGroups(mixerGroupKey(key)));
  }

  function samplePair(t, pair) {
    pair = pair || syncMixerPair();
    t = C.clamp(t, 0, 1);
    mixerPairPosition = t;
    var rgb = mixerColorAt('pair', t, pair, getPairTransition());
    var thumb = document.getElementById('mixPairThumb');
    var track = document.getElementById('mixPairTrack');
    var groups = getLevelGroups(mixerGroupKey('pair'));
    paintTrackSelection(track, thumb, selectionForValue(t, getMixerSteps('pair'), groups), getMixerSteps('pair'), groups);
    if (track) track.setAttribute('aria-valuenow', String(Math.round(t * 100)));
    S.setRgb(rgb.r, rgb.g, rgb.b, {reason:'mix-pair', relock:true});
  }

  function sampleValue(t) { MODES['B/W'].write({w:C.clamp(t, 0, 1) * 100}); }

  function initMixer() {
    try {
      var savedTransition = window.Platform.storage.getItem('drawcolor-pair-transition');
      if (savedTransition) setPairTransition(savedTransition);
    } catch (e) { /* a mistura direta continua como padrão */ }
    document.getElementById('mixPairTransition').addEventListener('change', function (evt) {
      if (!setPairTransition(evt.target.value)) return;
      samplePair(mixerPairPosition);
      S.pushHistory();
      refreshMixer();
    });
    // Toggle de visibilidade das barras
    document.querySelectorAll('.mix-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        var target = dot.dataset.target;
        var strip = document.querySelector('[data-strip="' + target + '"]');
        if (!strip) return;
        var active = !dot.classList.contains('is-active');
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-pressed', String(active));
        strip.hidden = !active;
      });
    });

    // Tracks com thumb arrastável. O modo vem do select no momento da
    // amostragem; a amostragem em si é uma função pura de (t, modo).
    initTrack('blenderTrack', 'blenderThumb', function (t, base) {
      sampleBlender(t, document.getElementById('blenderMode').value, base);
    }, null, 'blender');

    initTrack('shadesTrack', 'shadesThumb', function (t, base) {
      sampleShades(t, document.getElementById('shadesMode').value, base);
    }, null, 'shades');

    initTrack('schemeTrack', 'schemeThumb', function (t, base) {
      sampleScheme(t, base);
    }, null, 'scheme');

    initTrack('mixValueTrack', 'mixValueThumb', sampleValue);
    initTrack('mixPairTrack', 'mixPairThumb', samplePair, function () {
      var pair = syncMixerPair();
      return { primary: { ...pair.primary }, secondary: { ...pair.secondary } };
    }, 'pair');
    document.getElementById('mixPairPrimary').addEventListener('click', function () {
      samplePair(0); S.pushHistory(); syncMixerPair('gesture-end'); refreshMixer();
    });
    document.getElementById('mixPairSecondary').addEventListener('click', function () {
      samplePair(1); S.pushHistory(); syncMixerPair('gesture-end'); refreshMixer();
    });

    loadMixerSteps();
    document.querySelectorAll('.mix-color-stepper button').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.dataset.mixer;
        setMixerSteps(key, getMixerSteps(key) + Number(button.dataset.delta));
        refreshMixer();
      });
    });

    // Auto sample: ao mudar a cor, amostra automaticamente a posição do thumb
    document.getElementById('blenderMode').addEventListener('change', refreshMixer);
    document.getElementById('shadesMode').addEventListener('change', refreshMixer);
    document.getElementById('schemeMode').addEventListener('change', refreshMixer);

    refreshMixer();
  }

  /**
   * Amostragens das barras do mixer.
   *
   * Nenhuma delas passa `commit`: durante o arraste a cor muda, mas não entra
   * no histórico. Quem grava é o `pointerup` do trilho, uma única vez. Antes
   * cada `pointermove` commitava, e atravessar a barra deixava dezenas de
   * cores quase idênticas no histórico, empurrando fora as que interessavam.
   */
  /**
   * `base` é a cor de quando o arraste começou, não a cor atual.
   *
   * Ler a cor atual a cada amostra transforma a barra numa catraca: os modos
   * que aplicam deslocamento relativo — temperatura e esquema — somam a cada
   * movimento, então o matiz gira sem parar e a posição do thumb deixa de
   * descrever cor alguma. Uma varredura completa da barra de esquema chegava a
   * somar 360° e cair de volta na cor inicial. Com a base fixa, cada posição
   * corresponde sempre à mesma cor, e arrastar de ida e volta desfaz.
   */
  function sampleBlender(t, mode, base) {
    var hsv = base || S.getHsv();
    var h = hsv.h, s, v;
    if (mode === 'saturation') { s = t * 100; v = hsv.v; }
    else if (mode === 'brightness') { s = hsv.s; v = t * 100; }
    else { h = hsv.h + (t - 0.5) * 120; s = hsv.s; v = hsv.v; }
    S.setHsv({ h: h, s: s, v: v }, { relock: true, reason: 'mixer-blender' });
  }

  function sampleShades(t, mode, base) {
    var hsv = base || S.getHsv();
    if (mode === 'tints') S.setHsv({ h: hsv.h, s: (1 - t) * 100, v: 100 }, { relock: true, reason: 'mixer-shades' });
    else if (mode === 'tones') S.setHsv({ h: hsv.h, s: t * 100, v: 100 - t * 50 }, { relock: true, reason: 'mixer-shades' });
    else S.setHsv({ h: hsv.h, s: hsv.s, v: t * 100 }, { relock: true, reason: 'mixer-shades' });
  }

  function sampleScheme(t, base) {
    var hsv = base || S.getHsv();
    S.setHsv({ h: (hsv.h + t * 360) % 360, s: hsv.s, v: hsv.v }, { relock: true, reason: 'mixer-scheme' });
  }

  function initTrack(trackId, thumbId, onSample, getBase, mixerKey) {
    var track = document.getElementById(trackId);
    var thumb = document.getElementById(thumbId);
    var dragging = false;
    if (mixerKey) {
      var bar = track.parentElement;
      mixerGroupUIs[mixerKey] = createLevelGroupUI(track, bar.parentElement, function () {
        return {id:mixerGroupKey(mixerKey), count:getMixerSteps(mixerKey)};
      }, refreshMixer, bar.nextSibling);
    }
    track.setAttribute('role', 'slider');
    track.setAttribute('tabindex', '0');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '50');

    function sample(t) {
      var selection = mixerKey ? groupedLevelSelection(t, getMixerSteps(mixerKey), getLevelGroups(mixerGroupKey(mixerKey))) : {t:t, position:t};
      if (mixerKey && selection.index !== null) selectedLevelCells[mixerGroupKey(mixerKey)] = selection.index;
      t = selection.t;
      if (mixerKey) paintTrackSelection(track, thumb, selection, getMixerSteps(mixerKey), getLevelGroups(mixerGroupKey(mixerKey)));
      else thumb.style.left = (selection.position * 100) + '%';
      track.setAttribute('aria-valuenow', String(Math.round(t * 100)));
      onSample(t, base);
      if (mixerKey) { paintTrackSelection(track, thumb, selection, getMixerSteps(mixerKey), getLevelGroups(mixerGroupKey(mixerKey))); mixerGroupUIs[mixerKey].refresh(); }
    }

    function getT(evt) {
      var rect = track.getBoundingClientRect();
      return Math.min(1, Math.max(0, (evt.clientX - rect.left) / rect.width));
    }

    /**
     * A cor de partida do arraste. É ela que as amostragens usam como base,
     * para cada posição do trilho corresponder sempre à mesma cor.
     */
    var base = null;

    track.addEventListener('pointerdown', function (evt) {
      if (evt.button !== undefined && evt.button !== 0) return;
      dragging = true;
      base = getBase ? getBase() : S.getHsv();
      if (mixerKey) activeMixer = {key:mixerKey, base:base};
      track.setPointerCapture(evt.pointerId);
      var t = getT(evt);
      sample(t);
    });
    track.addEventListener('pointermove', function (evt) {
      if (!dragging) return;
      var t = getT(evt);
      sample(t);
    });
    /**
     * O histórico é gravado uma vez, ao soltar: o arraste inteiro vale uma
     * cor. `pointercancel` fecha do mesmo jeito — sem ele, um arraste
     * interrompido pelo sistema deixava `dragging` ligado e o trilho passava
     * a responder ao mouse sem botão pressionado.
     */
    function end(evt) {
      if (!dragging) return;
      dragging = false;
      if (mixerKey) activeMixer = null;
      base = null;
      if (track.hasPointerCapture(evt.pointerId)) track.releasePointerCapture(evt.pointerId);
      S.pushHistory();
      if (mixerKey) { syncMixerPair('gesture-end'); refreshMixer(); }
    }

    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);
    track.addEventListener('keydown', function (evt) {
      var t = Number(track.getAttribute('aria-valuenow')) / 100;
      var steps = mixerKey ? getMixerSteps(mixerKey) : 11;
      var keyboardStops = steps <= 10 ? levelStops(steps, getLevelGroups(mixerGroupKey(mixerKey))) : [];
      if (keyboardStops.length) {
        var index = nearestLevelStop(keyboardStops, t);
        if (evt.key === 'Home') index = 0;
        else if (evt.key === 'End') index = keyboardStops.length - 1;
        else if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') index++;
        else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') index--;
        else return;
        evt.preventDefault();
        base = getBase ? getBase() : S.getHsv();
        activeMixer = {key:mixerKey, base:base};
        sample(keyboardStops[C.clamp(index, 0, keyboardStops.length - 1)].position);
        activeMixer = null; base = null; S.pushHistory();
        syncMixerPair('gesture-end'); refreshMixer();
        return;
      }
      var increment = steps <= 10 ? 1 / (steps - 1) : 0.01;
      if (evt.key === 'Home') t = 0;
      else if (evt.key === 'End') t = 1;
      else if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') t += increment;
      else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') t -= increment;
      else return;
      evt.preventDefault();
      base = getBase ? getBase() : S.getHsv();
      if (mixerKey) activeMixer = {key:mixerKey, base:base};
      sample(C.clamp(t, 0, 1));
      if (mixerKey) activeMixer = null;
      base = null;
      S.pushHistory();
      if (mixerKey) { syncMixerPair('gesture-end'); refreshMixer(); }
    });
  }

  function refreshMixer() {
    refreshMixerSteps();
    refreshHistoryBar();
    refreshValueCanvas();
    refreshPairCanvas();
    refreshBlenderCanvas();
    refreshShadesCanvas();
    refreshSwatchesBar();
    refreshSchemeCanvas();
  }

  function refreshValueCanvas() {
    var canvas = document.getElementById('mixValueCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = Math.max(2, canvas.offsetWidth || 300);
    for (var x = 0; x < w; x++) {
      var g = Math.round(x / (w - 1) * 255);
      ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
      ctx.fillRect(x, 0, 1, 28);
    }
    var level = MODES['B/W'].fromRgb(S.getRgb()).w;
    document.getElementById('mixValueThumb').style.left = level + '%';
    document.getElementById('mixValueTrack').setAttribute('aria-valuenow', String(level));
    document.getElementById('mixValueNumber').textContent = level;
  }

  function refreshPairCanvas() {
    drawMixerCanvas('pair', 'mixPairCanvas');
    if (!activeMixer || activeMixer.key !== 'pair') {
      var groups = getLevelGroups(mixerGroupKey('pair'));
      paintTrackSelection(document.getElementById('mixPairTrack'), document.getElementById('mixPairThumb'), selectionForValue(mixerPairPosition, getMixerSteps('pair'), groups), getMixerSteps('pair'), groups);
      document.getElementById('mixPairTrack').setAttribute('aria-valuenow', String(Math.round(mixerPairPosition * 100)));
    }
    // As amostras são as fontes da faixa; a cor aplicada aparece no pick principal.
    var pair = syncMixerPair();
    var primary = document.getElementById('mixPairPrimary');
    var secondary = document.getElementById('mixPairSecondary');
    primary.style.background = S.displayCss(pair.primary);
    secondary.style.background = S.displayCss(pair.secondary);
    primary.title = '#' + C.rgbToHex(pair.primary.r, pair.primary.g, pair.primary.b).replace(/^#/, '');
    secondary.title = '#' + C.rgbToHex(pair.secondary.r, pair.secondary.g, pair.secondary.b).replace(/^#/, '');
  }

  function refreshHistoryBar() {
    var host = document.getElementById('historyBar');
    var hist = S.state.history;
    var idx = S.state.historyIndex;
    // Mostra as últimas 20 cores
    var start = Math.max(0, hist.length - 20);
    var needed = hist.length - start;

    while (host.children.length < needed) {
      var btn = document.createElement('button');
      btn.type = 'button';
      host.appendChild(btn);
    }
    while (host.children.length > needed) host.removeChild(host.lastChild);

    for (var i = 0; i < needed; i++) {
      var entry = hist[start + i];
      var rgb = C.hsvToRgb(entry.h, entry.s, entry.v);
      host.children[i].style.background = S.displayCss(rgb);
      host.children[i].className = (start + i === idx) ? 'is-current' : '';
      (function (r) {
        host.children[i].onclick = function () {
          S.setRgb(r.r, r.g, r.b, { commit: true, relock: true });
        };
      })(rgb);
    }
  }

  function refreshBlenderCanvas() { drawMixerCanvas('blender', 'blenderCanvas'); }
  function refreshShadesCanvas() { drawMixerCanvas('shades', 'shadesCanvas'); }

  function refreshSwatchesBar() {
    var host = document.getElementById('swatchesBar');
    if (!host) return;
    var colors = window.Palettes ? window.Palettes.getActiveColors() : [];
    while (host.children.length < colors.length) {
      var btn = document.createElement('button');
      btn.type = 'button';
      host.appendChild(btn);
    }
    while (host.children.length > colors.length) host.removeChild(host.lastChild);
    for (var i = 0; i < colors.length; i++) {
      host.children[i].style.background = colors[i];
      (function (hex) {
        host.children[i].onclick = function () {
          var rgb = C.hexToRgb(hex);
          if (rgb) S.setRgb(rgb.r, rgb.g, rgb.b, { commit: true, relock: true });
        };
      })(colors[i]);
    }
  }

  function refreshSchemeCanvas() { drawMixerCanvas('scheme', 'schemeCanvas'); }

  function feedMixerFromWheel() {
    var visible = window.Docking
      ? window.Docking.isVisible('paneMixers')
      : document.getElementById('paneMixers').classList.contains('is-active');
    if (!visible) return;
    refreshMixer();
  }

  /* ================= Ajuste de altura do modal para cada modo ================= */

  // Alturas fixas para o modal flutuante dos Sliders, por número de canais
  const FLOAT_HEIGHTS = { 1: 140, 3: 220, 4: 260 };

  function adjustFloatingHeight() {
    // Só age se os sliders estiverem numa janela flutuante
    if (!window.Docking || !window.Docking.isVisible) return;
    if (!window.Docking.isVisible('paneSliders')) return;

    const pane = document.getElementById('paneSliders');
    const win = pane && pane.closest('.float-window');
    if (!win) return;

    const mode = MODES[S.state.sliderMode];
    const channels = mode.channels.length;
    const targetH = FLOAT_HEIGHTS[channels] || 280;
    win.style.height = targetH + 'px';
  }

  /* ================= Refresh geral ================= */

  function refreshAll(reason) {
    syncMixerPair(reason);
    if (reason === 'mode') { refreshBwRamp(); return; }
    refreshSliders();
    refreshHex();
    refreshDials();
    refreshGamut();
    refreshBwRamp();
    refreshLimit();
    feedMixerFromWheel();
  }

  /**
   * Mede a altura real do pane ATIVO e aplica em --body-h.
   *
   * Antes media apenas o #paneSliders. Agora mede o pane ativo (Godê, Paletas,
   * Mixer ou Sliders). Quando o conteúdo do Godê ou das Paletas é maior que o
   * --body-h dos Sliders, a variável cresce, --strip-h sobe, e a roda encolhe
   * via computeScale() em layout.js (que usa offsetHeight real do .tab-body).
   *
   * Usar medição do DOM em vez de valores hardcoded garante que a altura
   * acompanha a escala e o número de canais automaticamente, sem precisar de
   * :has() no CSS (que o CEF do CEP não suporta).
   */
  function measureBodyHeight() {
    const panel = document.querySelector('.panel');
    const tabBody = panel && panel.querySelector('.tab-body');
    if (!panel || !tabBody) return;

    // Lado a lado: o corpo vai do topo da coluna até o rodapé e rola por
    // dentro, então --body-h não define nada ali. Medir nessa disposição daria
    // a altura da coluna estreita (linha MODE quebrada) e realimentaria a
    // escolha da disposição. layout.js remede ao voltar para empilhada.
    if (panel.classList.contains('layout-side')) return;

    const activePane = tabBody.querySelector('.pane.is-active');
    if (!activePane) return;

    // Para Sliders: mede a soma dos filhos diretos (slider-list + bw-block + mode-row)
    // em vez do scrollHeight do pane inteiro, que pode inflar por height: 100%.
    let h = 0;
    if (activePane.id === 'paneSliders') {
      for (const child of activePane.children) {
        if (child.offsetHeight > 0) {
          const childStyle = getComputedStyle(child);
          h += child.offsetHeight + (parseFloat(childStyle.marginTop) || 0) + (parseFloat(childStyle.marginBottom) || 0);
        }
      }
      // Soma os gaps e padding
      const style = getComputedStyle(activePane);
      const padTop = parseFloat(style.paddingTop) || 0;
      const padBot = parseFloat(style.paddingBottom) || 0;
      const gap = parseFloat(style.gap) || parseFloat(style.rowGap) || 0;
      const gaps = Math.max(0, activePane.children.length - 1) * gap;
      h += padTop + padBot + gaps;
    } else {
      // Para Godê, Paletas, Mixer: usa scrollHeight mas limita ao espaço
      // disponível, para não empurrar a roda para fora da tela.
      h = activePane.scrollHeight;
      const panelH = panel.offsetHeight || panel.clientHeight || 0;
      if (panelH > 0) {
        // A faixa inferior não deve ultrapassar 45% do painel
        const maxBody = panelH * 0.45;
        h = Math.min(h, maxBody);
      }
    }

    // Piso mínimo: não encolher além do conteúdo dos Sliders de 3 canais (~128px)
    h = Math.max(h, 128);

    if (h > 0) {
      panel.style.setProperty('--body-h', h + 'px');
      if (window.LAYOUT && window.LAYOUT.schedule) window.LAYOUT.schedule();
    }
  }

  /**
   * Reaplica os textos que o JS monta nos sliders e na rampa B/W quando o
   * idioma muda. Os textos estáticos ficam com o I18N.applyStatic; aqui só o
   * que é gerado em runtime (aria-labels de canal, títulos da rampa).
   */
  function relabel() {
    buildSliders();
    refreshBwRamp();
    refreshLimit();
    refreshMixerSteps();
  }

  function init() {
    loadSliderLevels();
    loadLevelGroups();
    buildModeButtons();
    buildSliders();
    initHex();
    initDials();
    initGamut();
    initMixer();
    initBwRamp();
    initLimit();
    document.getElementById('groupsToggleBtn').addEventListener('click', function () { setGroupEditing(!groupEditing); });
    setGroupEditing(false);
    document.getElementById('resetLevelsBtn').addEventListener('click', function () {
      resetLevels();
      refreshSliders();
      refreshMixer();
    });

    let measureTimer = null;
    S.subscribe((st, reason) => {
      refreshAll(reason);
      // Debounce: evita recalcular a cada frame durante arraste contínuo
      if (measureTimer) clearTimeout(measureTimer);
      measureTimer = setTimeout(measureBodyHeight, 100);
    });
    refreshAll('init');

    // Medição inicial: espera o layout estabilizar (o CEP demora para dar
    // dimensões reais ao iframe). Sem delay, scrollHeight pode inflar.
    setTimeout(measureBodyHeight, 200);
  }

  return {
    init, relabel, MODES, MODE_ORDER, adjustFloatingHeight, measureBodyHeight,
    // expostos para teste: o gesto de editar um canal, a decisão de descartar
    // o triplo guardado, o mapeamento de posição do trilho para valor e a
    // amostragem das barras do mixer
    applyChannel, readVals, dropLatchIfExternal, ORIGENS_EXTERNAS,
    resolveVals, sameRgb, quantize, valueFromRatio, getSliderLevels, setSliderLevels, sliderLevelSample, resetLevels, hasCustomLevels, setGroupEditing, isGroupEditing, getLevelGroups, getLevelGroup, setLevelGroup, groupedLevelSelection, levelGroupMax, levelStops, sliderGroupKey, mixerGroupKey,
    sampleBlender, sampleShades, sampleScheme, samplePair, sampleValue, syncMixerPair, mixerSelection, getMixerSteps, setMixerSteps, mixerColorAt, getPairTransition, setPairTransition
  };
})();
