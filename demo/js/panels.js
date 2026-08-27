/**
 * panels.js — Sliders multi-modo, mixer, dials de brilho/temperatura, hex e gamut.
 * Requisitos 4, 5, 6, 7, 8.
 */
window.Panels = (function () {
  'use strict';

  const C = window.Color;
  const S = window.AppState;

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

  let sliderRows = [];      // { channel, track, thumb, input, gradCtx }
  let sliderDragging = null;

  function buildSliders() {
    const host = document.getElementById('sliderList');
    host.innerHTML = '';
    sliderRows = [];

    const mode = MODES[S.state.sliderMode];

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
      track.setAttribute('aria-label', `Canal ${ch.label}`);
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
      input.setAttribute('aria-label', `Valor do canal ${ch.label}`);

      row.append(label, track, input);
      host.appendChild(row);

      const entry = { channel: ch, track, thumb, input, gradCtx: grad.getContext('2d') };
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
    return valueFromRatio(entry.channel, (clientX - rect.left) / rect.width);
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

  function commitChannel(entry, value) {
    applyChannel(S.state.sliderMode, entry.channel.key, value);
  }

  function wireSliderTrack(entry) {
    entry.track.addEventListener('pointerdown', (evt) => {
      sliderDragging = entry;
      entry.track.setPointerCapture(evt.pointerId);
      commitChannel(entry, valueFromPointer(entry, evt.clientX));
    });

    entry.track.addEventListener('pointermove', (evt) => {
      if (sliderDragging !== entry) return;
      commitChannel(entry, valueFromPointer(entry, evt.clientX));
    });

    const end = (evt) => {
      if (sliderDragging !== entry) return;
      sliderDragging = null;
      if (entry.track.hasPointerCapture(evt.pointerId)) entry.track.releasePointerCapture(evt.pointerId);
      S.pushHistory();
    };
    entry.track.addEventListener('pointerup', end);
    entry.track.addEventListener('pointercancel', end);

    entry.track.addEventListener('keydown', (evt) => {
      const ch = entry.channel;
      const cur = readVals()[ch.key];
      const big = (ch.max - ch.min) / 10;
      let next = null;
      if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') next = cur + ch.step;
      else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') next = cur - ch.step;
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

      // gradiente do canal: varia só esse canal, mantendo os outros
      const g = entry.gradCtx;
      for (let x = 0; x < 256; x++) {
        const t = x / 255;
        const sample = ch.min + t * (ch.max - ch.min);
        g.fillStyle = S.displayCss(mode.toRgb({ ...vals, [ch.key]: sample }));
        g.fillRect(x, 0, 1, 1);
      }

      const pct = ((value - ch.min) / (ch.max - ch.min)) * 100;
      entry.thumb.style.left = C.clamp(pct, 0, 100) + '%';

      const shown = value.toFixed(ch.decimals);
      if (document.activeElement !== entry.input) entry.input.value = shown;
      entry.lastValid = shown;

      entry.track.setAttribute('aria-valuenow', shown);
    });
  }

  /* ================= Rampa de valores B/W ================= */

  function initBwRamp() {
    document.getElementById('bwMinus').addEventListener('click', () => {
      S.setBwSteps(S.state.bwSteps - 1);
    });
    document.getElementById('bwPlus').addEventListener('click', () => {
      S.setBwSteps(S.state.bwSteps + 1);
    });
  }

  function refreshBwRamp() {
    const block = document.getElementById('bwBlock');
    const isBw = S.state.sliderMode === 'B/W';
    block.hidden = !isBw;
    if (!isBw) return;

    const ramp = S.getBwRamp();
    const host = document.getElementById('bwRamp');
    const cur = S.getRgb();
    const currentLevel = (cur.r === cur.g && cur.g === cur.b)
      ? Math.round(cur.r / 255 * 100)
      : Math.round(C.labToRgb(C.rgbToLab(cur.r, cur.g, cur.b).L, 0, 0).r / 255 * 100);

    host.innerHTML = '';
    // O degrau mais próximo da luminosidade atual recebe destaque
    let closest = 0, closestDist = Infinity;
    ramp.forEach((tone, i) => {
      const d = Math.abs(tone.level - currentLevel);
      if (d < closestDist) { closestDist = d; closest = i; }
    });

    ramp.forEach((tone, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.background = `rgb(${tone.r},${tone.g},${tone.b})`;
      btn.title = `Valor ${Math.round(tone.level)}%`;
      btn.setAttribute('aria-label', `Aplicar valor ${Math.round(tone.level)}%`);
      // Meio-passo: com N amostras o passo é 100/N, então a tolerância é 50/N.
      if (i === closest && closestDist < 50 / ramp.length) btn.classList.add('is-current');
      btn.addEventListener('click', () => {
        S.setRgb(tone.r, tone.g, tone.b, { commit: true, relock: true });
      });
      host.appendChild(btn);
    });

    document.getElementById('bwCount').textContent = ramp.length;
    document.getElementById('bwMinus').disabled = S.state.bwSteps <= S.BW_MIN;
    document.getElementById('bwPlus').disabled = S.state.bwSteps >= S.BW_MAX;
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

  function initMixer() {
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
    });

    initTrack('shadesTrack', 'shadesThumb', function (t, base) {
      sampleShades(t, document.getElementById('shadesMode').value, base);
    });

    initTrack('schemeTrack', 'schemeThumb', function (t, base) {
      sampleScheme(t, base);
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
    S.setHsv({ h: h, s: s, v: v }, { relock: true });
  }

  function sampleShades(t, mode, base) {
    var hsv = base || S.getHsv();
    if (mode === 'tints') S.setHsv({ h: hsv.h, s: (1 - t) * 100, v: 100 }, { relock: true });
    else if (mode === 'tones') S.setHsv({ h: hsv.h, s: t * 100, v: 100 - t * 50 }, { relock: true });
    else S.setHsv({ h: hsv.h, s: hsv.s, v: t * 100 }, { relock: true });
  }

  function sampleScheme(t, base) {
    var hsv = base || S.getHsv();
    S.setHsv({ h: (hsv.h + t * 360) % 360, s: hsv.s, v: hsv.v }, { relock: true });
  }

  function initTrack(trackId, thumbId, onSample) {
    var track = document.getElementById(trackId);
    var thumb = document.getElementById(thumbId);
    var dragging = false;

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
      dragging = true;
      base = S.getHsv();
      track.setPointerCapture(evt.pointerId);
      var t = getT(evt);
      thumb.style.left = (t * 100) + '%';
      onSample(t, base);
    });
    track.addEventListener('pointermove', function (evt) {
      if (!dragging) return;
      var t = getT(evt);
      thumb.style.left = (t * 100) + '%';
      onSample(t, base);
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
      base = null;
      if (track.hasPointerCapture(evt.pointerId)) track.releasePointerCapture(evt.pointerId);
      S.pushHistory();
    }

    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  }

  function refreshMixer() {
    refreshHistoryBar();
    refreshBlenderCanvas();
    refreshShadesCanvas();
    refreshSwatchesBar();
    refreshSchemeCanvas();
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

  function refreshBlenderCanvas() {
    var canvas = document.getElementById('blenderCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.offsetWidth || 300;
    var hsv = S.getHsv();
    var mode = document.getElementById('blenderMode').value;

    for (var x = 0; x < w; x++) {
      var t = x / (w - 1);
      var h = hsv.h, s = hsv.s, v = hsv.v;
      if (mode === 'saturation') s = t * 100;
      else if (mode === 'brightness') v = t * 100;
      else h = hsv.h + (t - 0.5) * 120;
      var rgb = C.hsvToRgb(h, s, v);
      ctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
      ctx.fillRect(x, 0, 1, 28);
    }
  }

  function refreshShadesCanvas() {
    var canvas = document.getElementById('shadesCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.offsetWidth || 300;
    var hsv = S.getHsv();
    var mode = document.getElementById('shadesMode').value;

    for (var x = 0; x < w; x++) {
      var t = x / (w - 1);
      var h = hsv.h, s = hsv.s, v;
      if (mode === 'shades') { v = t * 100; }
      else if (mode === 'tints') { s = (1 - t) * 100; v = 100; }
      else { s = t * 100; v = 100 - t * 50; }
      var rgb = C.hsvToRgb(h, s, v);
      ctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
      ctx.fillRect(x, 0, 1, 28);
    }
  }

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

  function refreshSchemeCanvas() {
    var canvas = document.getElementById('schemeCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.offsetWidth || 300;
    var hsv = S.getHsv();

    for (var x = 0; x < w; x++) {
      var t = x / (w - 1);
      var hue = (hsv.h + t * 360) % 360;
      var rgb = C.hsvToRgb(hue, hsv.s, hsv.v);
      ctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
      ctx.fillRect(x, 0, 1, 28);
    }
  }

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

    const activePane = tabBody.querySelector('.pane.is-active');
    if (!activePane) return;

    // Para Sliders: mede a soma dos filhos diretos (slider-list + bw-block + mode-row)
    // em vez do scrollHeight do pane inteiro, que pode inflar por height: 100%.
    let h = 0;
    if (activePane.id === 'paneSliders') {
      for (const child of activePane.children) {
        h += child.offsetHeight || 0;
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

  function init() {
    buildModeButtons();
    buildSliders();
    initHex();
    initDials();
    initGamut();
    initMixer();
    initBwRamp();
    initLimit();

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
    init, MODES, MODE_ORDER, adjustFloatingHeight, measureBodyHeight,
    // expostos para teste: o gesto de editar um canal, a decisão de descartar
    // o triplo guardado, o mapeamento de posição do trilho para valor e a
    // amostragem das barras do mixer
    applyChannel, readVals, dropLatchIfExternal, ORIGENS_EXTERNAS,
    resolveVals, sameRgb, quantize, valueFromRatio,
    sampleBlender, sampleShades, sampleScheme
  };
})();
