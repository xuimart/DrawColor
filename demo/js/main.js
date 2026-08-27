/**
 * main.js — Montagem da interface: swatches, harmonia, tabs, histórico.
 * Num plugin real este arquivo também chamaria o PS_Bridge (Requisito 10).
 */
(function () {
  'use strict';

  /** Versão local do plugin — atualizada a cada release. */
  const DRAWCOLOR_VERSION = '1.0.0';

  const C = window.Color;
  const S = window.AppState;
  const W = window.Wheel;
  const L = window.LAYOUT;

  /* ---------------- Swatches de foreground/background ---------------- */

  // Preferências de exibição, controladas pelo menu do painel
  const options = { showHex: true, compare: true };

  function refreshSwatches() {
    const fg = S.getRgb();
    const bg = S.state.background;
    const fgEl = document.getElementById('fgSwatch');
    const bgEl = document.getElementById('bgSwatch');
    const prevEl = document.getElementById('fgPrev');

    fgEl.style.background = S.displayCss(fg);
    bgEl.style.background = S.displayCss(bg);
    fgEl.title = 'Foreground ' + C.rgbToHex(fg.r, fg.g, fg.b);
    bgEl.title = 'Background ' + C.rgbToHex(bg.r, bg.g, bg.b);

    // Metade inferior esquerda mostra a cor anterior do histórico
    fgEl.classList.toggle('is-comparing', options.compare);
    const prev = previousColor();
    if (options.compare && prev) {
      const rgb = C.hsvToRgb(prev.h, prev.s, prev.v);
      prevEl.style.background = S.displayCss(rgb);
      fgEl.title += ' · anterior ' + C.rgbToHex(rgb.r, rgb.g, rgb.b);
    }
  }

  function previousColor() {
    const hist = S.state.history;
    const idx = S.state.historyIndex - 1;
    return idx >= 0 ? hist[idx] : null;
  }

  function initSwatches() {
    document.getElementById('swapBtn').addEventListener('click', () => S.swapForeground());
    document.getElementById('bgSwatch').addEventListener('click', () => {
      const bg = S.state.background;
      S.setRgb(bg.r, bg.g, bg.b, { commit: true });
    });

    // Clique no swatch de foreground volta para a cor anterior quando
    // a comparação está ligada — atalho útil ao alternar entre dois tons
    document.getElementById('fgSwatch').addEventListener('click', () => {
      if (!options.compare) return;
      const prev = previousColor();
      if (prev) S.setHsv(prev, { commit: true });
    });
  }

  /* ---------------- Menu do painel ---------------- */

  function initMenu() {
    const btn = document.getElementById('menuBtn');
    const menu = document.getElementById('panelMenu');

    function open() {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function toggle() {
      if (menu.hidden) open(); else close();
    }

    btn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      toggle();
    });

    // Cliques dentro do menu não devem fechá-lo
    menu.addEventListener('click', (evt) => evt.stopPropagation());

    document.addEventListener('click', () => { if (!menu.hidden) close(); });
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
    });

    /* opções de exibição */
    const hexOpt = document.getElementById('optShowHex');
    hexOpt.addEventListener('change', () => {
      options.showHex = hexOpt.checked;
      document.getElementById('hexRow').hidden = !options.showHex;
    });

    const cmpOpt = document.getElementById('optCompare');
    cmpOpt.checked = options.compare;
    cmpOpt.addEventListener('change', () => {
      options.compare = cmpOpt.checked;
      refreshSwatches();
    });

    const lumOpt = document.getElementById('optLumLock');
    lumOpt.addEventListener('change', () => S.setLuminosityLock(lumOpt.checked));
  }

  /* ---------------- Rack de harmonias (Requisito 3.5) ---------------- */

  /**
   * A distribuição dos satélites vive em layout.js: cada controle móvel tem
   * uma âncora (ângulo + raio) tirada do Layout_De_Referência e é posicionado
   * por LAYOUT.applyLayout(). Aqui só resta avisar quando o conteúdo do arco
   * é reconstruído, porque os botões novos precisam receber posição.
   */

  // O arco mostra harmonias normalmente e formatos de máscara no modo gamut
  function arcMode() {
    return S.state.gamut.enabled && S.state.shape === 'disc' ? 'mask' : 'harmony';
  }

  let renderedArcMode = null;

  function buildArc() {
    const arc = document.getElementById('iconArc');
    const mode = arcMode();
    arc.innerHTML = '';

    if (mode === 'harmony') {
      arc.setAttribute('aria-label', 'Esquema de harmonia');

      S.HARMONY_SCHEMES.forEach((scheme, i) => {
        const btn = document.createElement('button');
        btn.className = 'harmony-btn';
        btn.type = 'button';
        btn.title = scheme.label;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-label', scheme.label);
        btn.dataset.scheme = scheme.id;
        // Âncoras harmony.1..6 do Layout_De_Referência
        btn.dataset.layout = 'harmony.' + (i + 1);

        const icon = document.createElement('canvas');
        // Dobro da medida de referência (26): o CSS reduz, e a redução evita
        // o deslocamento de meio pixel que aparecia em escalas fracionárias.
        icon.width = icon.height = 52;
        btn.appendChild(icon);
        W.drawSchemeIcon(icon, scheme);

        btn.addEventListener('click', () => S.setScheme(scheme.id));
        arc.appendChild(btn);
      });
    } else {
      arc.setAttribute('aria-label', 'Formato da máscara');

      S.MASK_KINDS.forEach((kind, i) => {
        const btn = document.createElement('button');
        btn.className = 'mask-kind';
        btn.type = 'button';
        btn.title = MASK_KIND_LABELS[kind];
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-label', MASK_KIND_LABELS[kind]);
        btn.dataset.kind = kind;
        // Os formatos ocupam as mesmas seis âncoras do arco de harmonias
        btn.dataset.layout = 'harmony.' + (i + 1);

        const icon = document.createElement('canvas');
        icon.width = icon.height = 24;
        btn.appendChild(icon);

        btn.addEventListener('click', () => S.setGamut({ kind }));
        arc.appendChild(btn);
      });
    }

    L.applyLayout();
    renderedArcMode = mode;
  }

  function refreshArc() {
    if (renderedArcMode !== arcMode()) buildArc();

    document.querySelectorAll('#iconArc .harmony-btn').forEach((btn) => {
      const active = btn.dataset.scheme === S.state.scheme;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });

    document.querySelectorAll('#iconArc .mask-kind').forEach((btn) => {
      const active = btn.dataset.kind === S.state.gamut.kind;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
      W.drawMaskKindIcon(btn.querySelector('canvas'), btn.dataset.kind, active);
    });
  }

  /* ---------------- Forma do seletor ---------------- */

  /**
   * O seletor de forma fica colapsado num botão que mostra a forma atual.
   * Clicar abre as três opções; escolher fecha de volta. Mantém a interface
   * limpa sem esconder a informação de qual forma está ativa.
   */
  function initShape() {
    const popBtn = document.getElementById('shapePopBtn');
    const menu = document.getElementById('shapeMenu');

    const close = () => {
      menu.hidden = true;
      popBtn.setAttribute('aria-expanded', 'false');
    };

    popBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      menu.hidden = !menu.hidden;
      popBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });

    document.querySelectorAll('.shape-btn').forEach((btn) => {
      W.drawShapeIcon(btn.querySelector('canvas'), btn.dataset.shape);
      btn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        S.setShape(btn.dataset.shape);
        /**
         * Escolher a forma à mão é decisão explícita do artista, e passa a
         * valer mais que a forma lembrada pela máscara. Deixar a memória viva
         * faria o desligar da máscara sobrescrever essa escolha depois — o
         * salto de forma que o artista vê como "volta sozinho para triângulo".
         */
        shapeBeforeMask = null;
        close();
      });
    });

    document.addEventListener('click', () => { if (!menu.hidden) close(); });
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape' && !menu.hidden) { close(); popBtn.focus(); }
    });
  }

  const SHAPE_LABELS = { triangle: 'Triângulo', square: 'Quadrado', disc: 'Disco' };

  function refreshShape() {
    document.querySelectorAll('.shape-btn').forEach((btn) => {
      const active = btn.dataset.shape === S.state.shape;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });

    // O botão colapsado espelha a forma escolhida
    const popBtn = document.getElementById('shapePopBtn');
    W.drawShapeIcon(popBtn.querySelector('canvas'), S.state.shape);
    popBtn.title = `Forma do seletor: ${SHAPE_LABELS[S.state.shape]}`;
  }

  /* ---------------- Travamento de luminosidade (solzinho) ---------------- */

  /**
   * Os travamentos aparecem em mais de um lugar — na barra da roda e na aba
   * de sliders, que pode estar em janela separada. Por isso os controles são
   * localizados por classe, e todas as instâncias refletem o mesmo estado.
   */
  function initLumLock() {
    document.querySelectorAll('.js-lumlock').forEach((btn) => {
      btn.addEventListener('click', () => S.setLuminosityLock(!S.state.lumLock));
    });
  }

  function refreshLumLock() {
    const on = S.state.lumLock;
    const label = on
      ? `Luminosidade travada em L ${S.state.lockedL.toFixed(0)} — clique para soltar`
      : 'Travar luminosidade';

    document.querySelectorAll('.js-lumlock').forEach((btn) => {
      W.drawSunIcon(btn.querySelector('canvas'), on);
      btn.setAttribute('aria-pressed', String(on));
      btn.title = label;
    });

    const opt = document.getElementById('optLumLock');
    if (opt.checked !== on) opt.checked = on;
  }

  /* ---------------- Conferência de valores ---------------- */

  function initValueCheck() {
    document.querySelectorAll('.js-valuecheck').forEach((btn) => {
      btn.addEventListener('click', () => S.setValueCheck(!S.state.valueCheck));
    });
    document.getElementById('optValueCheck').addEventListener('change', (evt) => {
      S.setValueCheck(evt.target.checked);
    });
  }

  function refreshValueCheck() {
    const on = S.state.valueCheck;
    const label = on
      ? 'Conferindo valores — clique para voltar à cor'
      : 'Conferir valores em escala de cinza';

    document.querySelectorAll('.js-valuecheck').forEach((btn) => {
      W.drawValueIcon(btn.querySelector('canvas'), on);
      btn.setAttribute('aria-pressed', String(on));
      btn.title = label;
    });

    const opt = document.getElementById('optValueCheck');
    if (opt.checked !== on) opt.checked = on;
  }

  /* ---------------- Máscara de gamut ---------------- */

  // Predefinições de tamanho, em coordenadas normalizadas do disco
  const GAMUT_PRESETS = {
    wide:   { cx: 0, cy: 0, rx: 0.85, ry: 0.62, angle: 0 },
    narrow: { cx: 0.18, cy: -0.1, rx: 0.42, ry: 0.24, angle: 335 },
    band:   { cx: 0, cy: 0, rx: 0.95, ry: 0.16, angle: 340 },
    muted:  { cx: 0, cy: 0, rx: 0.45, ry: 0.45, angle: 0 },
    full:   { cx: 0, cy: 0, rx: 1, ry: 1, angle: 0 }
  };

  const MASK_KIND_LABELS = {
    triangle: 'Triângulo',
    rect: 'Barra',
    ellipse: 'Elipse',
    diamond: 'Losango',
    dual: 'Elipse + círculo',
    hexagon: 'Hexágono'
  };

  function initMaskRack() {
    const rack = document.getElementById('maskRack');
    rack.innerHTML = '';

    S.MASK_KINDS.forEach((kind) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mask-kind';
      btn.dataset.kind = kind;
      btn.title = MASK_KIND_LABELS[kind];
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', MASK_KIND_LABELS[kind]);

      const icon = document.createElement('canvas');
      icon.width = icon.height = 24;
      btn.appendChild(icon);

      btn.addEventListener('click', () => {
        enableMask({ kind });
      });
      rack.appendChild(btn);
    });
  }

  // Só o rack do menu: os botões do arco são atualizados por refreshArc
  function refreshMaskRack() {
    document.querySelectorAll('#maskRack .mask-kind').forEach((btn) => {
      const active = btn.dataset.kind === S.state.gamut.kind;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
      W.drawMaskKindIcon(btn.querySelector('canvas'), btn.dataset.kind, active);
    });
  }

  /**
   * Forma que o artista tinha antes de a máscara forçar o disco.
   *
   * A máscara só existe no disco, então ligá-la troca a forma. Guardar a forma
   * anterior é o que permite devolver o seletor ao que o artista usava quando
   * ele desliga a máscara. O valor precisa ser gravado por TODOS os caminhos
   * que ligam a máscara — botão, rack, checkbox e presets — senão sobra um
   * valor velho que volta a ser aplicado fora de hora, e o seletor salta para
   * uma forma que o artista não pediu.
   */
  let shapeBeforeMask = null;

  /**
   * Liga a máscara, levando o seletor para o disco e lembrando a forma atual.
   *
   * O disco é forçado ANTES de `setGamut` porque `setGamut` reenquadra a cor
   * dentro da máscara, e esse cálculo depende da forma ativa. `enabled: true`
   * é aplicado depois do patch para vencer qualquer `enabled` que venha nele.
   */
  function enableMask(patch) {
    if (S.state.shape !== 'disc') {
      shapeBeforeMask = S.state.shape;
      S.setShape('disc');
    }
    S.setGamut({ ...patch, enabled: true });
  }

  /** Desliga a máscara e devolve a forma anterior, se ainda faz sentido. */
  function disableMask() {
    S.setGamut({ enabled: false, editing: false });
    /**
     * Só devolve a forma se o seletor ainda estiver no disco. Se o artista
     * escolheu outra forma enquanto a máscara estava ligada, a escolha dele
     * vale mais que a memória — sobrescrevê-la é justamente o salto de forma
     * que este guarda existe para impedir.
     */
    if (shapeBeforeMask && S.state.shape === 'disc') S.setShape(shapeBeforeMask);
    shapeBeforeMask = null;
  }

  function initGamut() {
    initMaskRack();
    document.getElementById('gamutMaskBtn').addEventListener('click', () => {
      if (S.state.gamut.enabled) disableMask();
      else enableMask({ editing: S.state.gamut.editing });
    });

    document.getElementById('gamutEditBtn').addEventListener('click', () => {
      S.setGamut({ editing: !S.state.gamut.editing });
    });

    // Restaurar a máscara direto na roda: antes só existia no menu sanduíche,
    // longe de onde o usuário está arrastando os pontos.
    document.getElementById('gamutResetBtn').addEventListener('click', () => {
      S.resetGamut();
    });

    document.getElementById('gamutLockBtn').addEventListener('click', () => {
      S.setGamut({ locked: !S.state.gamut.locked });
    });

    document.getElementById('optGamutMask').addEventListener('change', (evt) => {
      if (evt.target.checked) enableMask({});
      else disableMask();
    });
    document.getElementById('optGamutEdit').addEventListener('change', (evt) => {
      S.setGamut({ editing: evt.target.checked });
    });
    document.getElementById('optGamutLock').addEventListener('change', (evt) => {
      S.setGamut({ locked: evt.target.checked });
    });

    const preset = document.getElementById('gamutPreset');
    preset.addEventListener('change', () => {
      const cfg = GAMUT_PRESETS[preset.value];
      if (cfg) enableMask(cfg);
      preset.value = '';
    });

    document.getElementById('gamutReset').addEventListener('click', () => S.resetGamut());

    /**
     * Traz a máscara de volta ao centro do disco sem tocar em formato, tamanho
     * ou rotação. Uma máscara arrastada para a borda fica difícil de recuperar
     * à mão, e restaurar tudo custaria o ajuste de forma que já estava bom.
     */
    document.getElementById('gamutCenter').addEventListener('click', () => {
      if (S.state.gamut.locked) return;
      S.setGamut({ cx: 0, cy: 0 });
      W.invalidateCaches();
      W.requestRender();
    });

    // Desfaz só a figura editada: posição, tamanho e rotação ficam.
    document.getElementById('gamutResetShape').addEventListener('click', () => {
      S.resetMaskVertices();
    });
  }

  function refreshGamutMask() {
    const g = S.state.gamut;

    const maskBtn = document.getElementById('gamutMaskBtn');
    W.drawGamutIcon(maskBtn.querySelector('canvas'), g.enabled);
    maskBtn.setAttribute('aria-pressed', String(g.enabled));

    // Edição e trava só existem quando há máscara para editar
    const inGamut = g.enabled && S.state.shape === 'disc';
    document.querySelectorAll('.gamut-only').forEach((el) => { el.hidden = !inGamut; });

    const editBtn = document.getElementById('gamutEditBtn');
    W.drawEditIcon(editBtn.querySelector('canvas'), g.editing);
    editBtn.setAttribute('aria-pressed', String(g.editing));
    editBtn.disabled = g.locked;
    editBtn.title = g.locked ? 'Máscara travada' : 'Editar máscara';

    const lockBtn = document.getElementById('gamutLockBtn');
    W.drawLockIcon(lockBtn.querySelector('canvas'), g.locked);
    lockBtn.setAttribute('aria-pressed', String(g.locked));
    lockBtn.title = g.locked
      ? 'Gamut lock ativo — máscara não pode ser alterada'
      : 'Gamut lock';

    // Restaurar mexe na máscara, então respeita a trava como a edição.
    const resetBtn = document.getElementById('gamutResetBtn');
    // O ícone acende só quando a ação está disponível: travada, fica apagado.
    W.drawResetIcon(resetBtn.querySelector('canvas'), !g.locked);
    resetBtn.disabled = g.locked;
    resetBtn.title = g.locked ? 'Máscara travada' : 'Restaurar máscara';

    /**
     * Não há nada a reancorar aqui: a âncora de cada controle não depende de
     * ele estar visível (Requisito 3.6), e os botões só do gamut já recebem
     * posição de LAYOUT mesmo escondidos.
     */

    const sync = (id, value) => {
      const el = document.getElementById(id);
      if (el.checked !== value) el.checked = value;
    };
    sync('optGamutMask', g.enabled);
    sync('optGamutEdit', g.editing);
    sync('optGamutLock', g.locked);
    document.getElementById('optGamutEdit').disabled = !g.enabled || g.locked;

    refreshMaskRack();
  }

  /* ---------------- Harmonia editável ---------------- */

  function initHarmonyEdit() {
    document.getElementById('harmonyReset').addEventListener('click', () => S.resetHarmony());
  }

  function refreshHarmonyEdit() {
    const el = document.getElementById('harmonyOffsets');
    const offsets = S.getHarmonyOffsets();
    const resetBtn = document.getElementById('harmonyReset');

    if (offsets.length === 0) {
      el.textContent = 'Nenhum esquema ativo';
      resetBtn.disabled = true;
      return;
    }

    const list = offsets
      .map((off) => (off > 0 ? '+' : '') + Math.round(off) + '°')
      .join('  ·  ');
    el.textContent = list + (S.isHarmonyEdited() ? '  (editado)' : '');
    resetBtn.disabled = !S.isHarmonyEdited();
  }

  /* ---------------- Barra de valor ---------------- */

  function initValueBar() {
    const track = document.getElementById('valueTrack');
    let dragging = false;

    const applyFromPointer = (clientX) => {
      const rect = track.getBoundingClientRect();
      const t = C.clamp((clientX - rect.left) / rect.width, 0, 1);
      // Esquerda é claro, direita é escuro, como na barra de referência
      const hsv = S.getHsv();
      S.setHsv({ h: hsv.h, s: hsv.s, v: (1 - t) * 100 }, { relock: true });
    };

    track.addEventListener('pointerdown', (evt) => {
      dragging = true;
      track.setPointerCapture(evt.pointerId);
      applyFromPointer(evt.clientX);
    });
    track.addEventListener('pointermove', (evt) => {
      if (dragging) applyFromPointer(evt.clientX);
    });
    const end = (evt) => {
      if (!dragging) return;
      dragging = false;
      if (track.hasPointerCapture(evt.pointerId)) track.releasePointerCapture(evt.pointerId);
      S.pushHistory();
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);

    track.addEventListener('keydown', (evt) => {
      const hsv = S.getHsv();
      let v = null;
      if (evt.key === 'ArrowRight' || evt.key === 'ArrowDown') v = hsv.v - 1;
      else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowUp') v = hsv.v + 1;
      else if (evt.key === 'Home') v = 100;
      else if (evt.key === 'End') v = 0;
      if (v === null) return;
      evt.preventDefault();
      S.setHsv({ h: hsv.h, s: hsv.s, v }, { commit: true, relock: true });
    });

    // Gradiente neutro de branco a preto, desenhado uma vez
    const ctx = document.getElementById('valueCanvas').getContext('2d');
    for (let x = 0; x < 256; x++) {
      const level = Math.round(255 - x);
      ctx.fillStyle = `rgb(${level},${level},${level})`;
      ctx.fillRect(x, 0, 1, 1);
    }
  }

  function refreshValueBar() {
    // A barra só aparece no disco, onde o seletor não controla o valor
    const bar = document.getElementById('valueBar');
    bar.hidden = S.state.shape !== 'disc';
    if (bar.hidden) return;

    const v = S.getHsv().v;
    document.getElementById('valueThumb').style.left = `${100 - v}%`;
    document.getElementById('valueTrack').setAttribute('aria-valuenow', String(Math.round(v)));
  }

  /* ---------------- Espaço do círculo cromático (RGB / RYB) ---------------- */

  /**
   * Trocar de roda reordena o anel inteiro e move todos os marcadores, então os
   * caches de desenho precisam ser descartados — sem isso o anel continuaria
   * mostrando a ordem antiga com os marcadores já nas posições novas.
   */
  function initWheelSpace() {
    const aplicar = (id) => {
      S.setWheelSpace(id);
      window.Wheel.invalidateCaches();
      window.Wheel.requestRender();
    };

    document.getElementById('spaceRgb').addEventListener('click', () => aplicar('rgb'));
    document.getElementById('spaceRyb').addEventListener('click', () => aplicar('ryb'));
  }

  function refreshWheelSpace() {
    const ryb = S.state.wheelSpace === 'ryb';
    const rgbBtn = document.getElementById('spaceRgb');
    const rybBtn = document.getElementById('spaceRyb');

    rgbBtn.classList.toggle('is-active', !ryb);
    rybBtn.classList.toggle('is-active', ryb);
    rgbBtn.setAttribute('aria-checked', String(!ryb));
    rybBtn.setAttribute('aria-checked', String(ryb));

    document.getElementById('spaceHint').textContent = ryb
      ? 'Roda do pintor: vermelho, amarelo e azul como primárias'
      : 'Roda da luz: vermelho, verde e azul como primárias';
  }

  /* ---------------- Rotação da roda ---------------- */

  function initRotation() {
    document.getElementById('rotMinus').addEventListener('click', () => {
      S.nudgeWheelRotation(-15, 15);
    });
    document.getElementById('rotPlus').addEventListener('click', () => {
      S.nudgeWheelRotation(15, 15);
    });
    document.getElementById('rotReset').addEventListener('click', () => {
      S.resetWheelRotation();
    });
  }

  function refreshRotation() {
    document.getElementById('rotValue').textContent = Math.round(S.state.wheelRotation) + '°';
  }

  /* ---------------- Tabs ---------------- */

  function initTabs() {
    const map = [
      { tab: 'tabSliders', pane: 'paneSliders' },
      { tab: 'tabMixers', pane: 'paneMixers' },
      { tab: 'tabPalettes', pane: 'panePalettes' },
      { tab: 'tabGode', pane: 'paneGode' }
    ];

    function activateTab(targetTab) {
      map.forEach((m) => {
        const isTarget = m.tab === targetTab;
        document.getElementById(m.tab).classList.toggle('is-active', isTarget);
        document.getElementById(m.tab).setAttribute('aria-selected', String(isTarget));
        document.getElementById(m.pane).classList.toggle('is-active', isTarget);
      });
      // Remede --body-h para caber o conteúdo do pane ativo (Sliders, Godê,
      // Paletas, Mixer). O JS é a fonte de verdade para essa variável.
      if (window.Panels && window.Panels.measureBodyHeight) {
        requestAnimationFrame(window.Panels.measureBodyHeight);
      }
    }

    map.forEach(({ tab }) => {
      document.getElementById(tab).addEventListener('click', () => activateTab(tab));
    });
  }

  /* ---------------- Undo / Redo (Requisito 9) ---------------- */

  function initHistory() {
    document.getElementById('undoBtn').addEventListener('click', () => S.undo());
    document.getElementById('redoBtn').addEventListener('click', () => S.redo());
  }

  function refreshHistoryButtons() {
    document.getElementById('undoBtn').disabled = !S.canUndo();
    document.getElementById('redoBtn').disabled = !S.canRedo();
  }

  /* ---------------- Status ---------------- */

  function refreshStatus() {
    const hsv = S.getHsv();
    const rgb = S.getRgb();
    const limit = S.state.limit.enabled ? ` · limite ${S.state.limit.hueSteps}h` : '';
    const rot = S.state.wheelRotation ? ` · giro ${Math.round(S.state.wheelRotation)}°` : '';
    const lum = S.state.lumLock ? ` · L travado ${S.state.lockedL.toFixed(0)}` : '';
    const mask = S.state.gamut.enabled
      ? ` · máscara${S.state.gamut.locked ? ' travada' : ''}`
      : '';
    const vc = S.state.valueCheck ? ' · valores' : '';
    // Só aparece na roda do pintor: o RGB é o padrão e não precisa de aviso.
    const space = S.state.wheelSpace === 'ryb' ? ' · roda RYB' : '';
    const shapeName = { triangle: 'triângulo', square: 'quadrado', disc: 'disco' }[S.state.shape];

    document.getElementById('statusBar').textContent =
      `Demo offline · H ${Math.round(hsv.h)}° S ${Math.round(hsv.s)}% V ${Math.round(hsv.v)}% · ` +
      `RGB ${rgb.r},${rgb.g},${rgb.b}${limit}${rot}${lum}${mask}${vc}${space} · ` +
      `${shapeName} · histórico ${S.state.historyIndex + 1}/${S.state.history.length}`;
  }

  /* ---------------- Boot ---------------- */

  /** Tracks whether interactive modules (wheel, panels, etc.) have been initialized. */
  var interactiveInitDone = false;

  /**
   * Statuses that allow the plugin to run interactively.
   * All others block the UI via the Overlay.
   */
  var ALLOWED_STATUSES = { trial: true, active: true, offline_grace: true };

  /**
   * Initializes all interactive modules (wheel, panels, tabs, etc.).
   * Should only be called when the license status allows it.
   */
  function initInteractive() {
    if (interactiveInitDone) return;
    interactiveInitDone = true;

    initSwatches();
    initMenu();
    initShape();
    initLumLock();
    initValueCheck();
    initGamut();
    initHarmonyEdit();
    initValueBar();
    initWheelSpace();
    initRotation();
    initTabs();
    initHistory();
    buildArc();

    // Perfil de layout: carrega âncoras antes de aplicar posições
    window.LayoutStore.init();

    // Escala e âncoras: layout.js observa o redimensionamento por conta própria
    L.init();

    W.init();
    window.Panels.init();
    window.Palettes.init();
    window.Gode.init();
    // Depois dos painéis: o docking move nós já montados
    window.Docking.init();

    // Editor de layout: inicializa depois de toda a UI estar pronta
    window.LayoutEditor.init();

    // Layout editor toggle button in header
    var layoutBtn = document.createElement('button');
    layoutBtn.className = 'menu-btn';
    layoutBtn.textContent = '⊞';
    layoutBtn.title = 'Modo de organização';
    layoutBtn.setAttribute('aria-label', 'Alternar modo de organização');
    layoutBtn.addEventListener('click', function() {
      window.LayoutEditor.toggle();
    });
    var header = document.querySelector('.panel-header');
    if (header) {
      header.insertBefore(layoutBtn, header.querySelector('.menu-btn'));
    }

    // Re-aplica layout quando o perfil ativo muda
    window.LayoutStore.subscribe(function() { L.applyLayout(); });

    const refreshChrome = () => {
      refreshSwatches();
      refreshArc();
      refreshHarmonyEdit();
      refreshShape();
      refreshLumLock();
      refreshValueCheck();
      refreshGamutMask();
      refreshValueBar();
      refreshWheelSpace();
      refreshRotation();
      refreshHistoryButtons();
      refreshStatus();
    };

    S.subscribe(refreshChrome);
    refreshChrome();

    // Ponte com o Photoshop: no navegador isso é um no-op.
    if (window.PSBridge) window.PSBridge.init();

    /**
     * Esconde a barra de status no Photoshop — é debug de demo, não serve ao
     * artista.
     *
     * Esconder o elemento não basta: a altura dele é reservada em --status-h,
     * que entra em --strip-h e na altura do painel. Só com `hidden` a faixa
     * saía da tela mas as 47 unidades continuavam ali, como um vão vazio
     * abaixo da linha MODE. Zerar o token é o que devolve o espaço.
     *
     * Feito em JS, e não com `:has()` no CSS, porque o CEF do CEP não suporta
     * `:has()` — e é justamente no CEP que a barra fica escondida.
     */
    if (window.PSBridge && window.PSBridge.isConnected()) {
      document.getElementById('statusBar').hidden = true;

      const panelEl = document.getElementById('panel');
      if (panelEl) panelEl.style.setProperty('--status-h', '0px');
      if (window.LAYOUT) window.LAYOUT.applyLayout();
    }

    // Ponte com a outra janela da extensão (janela Modeless do CEP).
    // Fora do CEP também é no-op.
    if (window.PanelSync) window.PanelSync.init();

    // Verifica se há atualização disponível no GitHub (uma vez por sessão).
    checkForUpdate();
  }

  /* ---------------- License status handling ---------------- */

  /**
   * Updates the status bar to show trial days remaining.
   * @param {number|null} daysLeft
   */
  function showTrialBadge(daysLeft) {
    // Remove existing badge if any
    var existing = document.getElementById('trialBadge');
    if (existing) existing.parentNode.removeChild(existing);

    if (daysLeft === null || daysLeft === undefined) return;

    var badge = document.createElement('div');
    badge.id = 'trialBadge';
    badge.style.cssText = 'background:#de2246;color:#fff;text-align:center;padding:3px 8px;font-size:10px;font-weight:500;cursor:pointer;line-height:1.4;position:fixed;top:0;left:0;right:0;z-index:9999;';
    badge.innerHTML = daysLeft + (daysLeft === 1 ? ' dia restante' : ' dias restantes')
      + ' · <u>Comprar licença</u>';
    badge.addEventListener('click', function () {
      window.open('https://buy.stripe.com/test_14A5kxfcUd386Nr3Pr3cc00', '_blank');
    });

    document.body.appendChild(badge);
  }

  /**
   * Handles license status changes. Called when License.onStatusChange fires.
   * @param {string} status
   */
  function handleLicenseStatus(status) {
    if (ALLOWED_STATUSES[status]) {
      // License is valid — hide overlay and initialize interactive modules
      if (window.Overlay && window.Overlay.isVisible()) {
        window.Overlay.hide();
      }
      initInteractive();

      // Show trial badge if applicable
      if (status === 'trial' && window.License) {
        showTrialBadge(window.License.getDaysLeft());
      } else {
        showTrialBadge(null);
      }
    } else {
      // License blocks usage — overlay is shown by License module itself.
      // Remove trial badge if it was visible.
      showTrialBadge(null);
    }
  }

  /**
   * Main initialization entry point.
   * Calls License.init() first to gate interactive module initialization
   * behind a valid license check.
   */
  function init() {
    // LICENSE DISABLED — skip license check, init directly
    // TODO: Re-enable when OAuth + badge click issues are resolved
    initInteractive();
  }

  /* ---------------- Verificação de atualização ---------------- */

  /**
   * Compara duas strings de versão semver (ex: "1.2.3").
   * Retorna true se `remote` é mais nova que `local`.
   */
  function isNewerVersion(remote, local) {
    var rParts = remote.replace(/^v/, '').split('.').map(Number);
    var lParts = local.replace(/^v/, '').split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      var r = rParts[i] || 0;
      var l = lParts[i] || 0;
      if (r > l) return true;
      if (r < l) return false;
    }
    return false;
  }

  /**
   * Checa a última release no GitHub e mostra badge se há versão nova.
   * Roda uma vez por sessão (sessionStorage) e falha silenciosamente.
   */
  function checkForUpdate() {
    try {
      // Só checa uma vez por sessão
      if (sessionStorage.getItem('drawcolor-update-checked')) return;

      fetch('https://api.github.com/repos/xuimart/DrawColor/releases/latest', {
        cache: 'no-store'
      })
        .then(function (res) {
          if (!res.ok) return;
          return res.json();
        })
        .then(function (data) {
          if (!data || !data.tag_name) return;

          if (isNewerVersion(data.tag_name, DRAWCOLOR_VERSION)) {
            var badge = document.getElementById('updateBadge');
            if (badge) badge.hidden = false;
          }

          sessionStorage.setItem('drawcolor-update-checked', '1');
        })
        .catch(function () {
          // Sem internet ou rate limit — ignora silenciosamente
        });
    } catch (e) {
      // Ambiente sem fetch ou sessionStorage — ignora
    }
  }

  /**
   * No UXP o estado persistido vem de arquivo, que é assíncrono. O boot espera
   * o Platform Adapter preencher o cache antes de inicializar, senão o
   * LayoutStore e as paletas leriam vazio e sobrescreveriam o perfil salvo.
   */
  function boot() {
    if (window.Platform && window.Platform.ready) {
      window.Platform.ready().then(init, init);
    } else {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
