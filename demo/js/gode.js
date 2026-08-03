/**
 * gode.js — Godê de mistura. O artista pinta no canvas e as tintas se
 * misturam por sobreposição, como numa paleta física. Também permite
 * espatular (arrastar tinta) e capturar cor com conta-gotas.
 */
window.Gode = (function () {
  'use strict';

  const C = window.Color;
  const S = window.AppState;

  const W = 340, H = 190;
  const SURFACE = '#d8d2c6';        // cor da paleta física

  let canvas, ctx;
  let tool = 'brush';               // 'brush' | 'smudge' | 'pick'
  let brushSize = 26;
  let flow = 0.35;                  // quanta tinta nova entra por toque
  let drawing = false;
  let lastPoint = null;
  let carried = null;               // tinta carregada pela espátula

  // Zoom e pan do godê — aplicados num wrapper ao redor do canvas
  let zoomLevel = 1;
  let panX = 0, panY = 0;
  let panning = false;
  let panStartX = 0, panStartY = 0;
  let panStartPanX = 0, panStartPanY = 0;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 5;
  let wrapper = null;  // div envolvendo o canvas, criada no init

  /* ---------------- utilidades ---------------- */

  // Converte coordenada do evento para coordenada no canvas de pintura,
  // levando em conta zoom e pan. Usa o rect do próprio canvas (que já está
  // centralizado e escalado dentro do wrapper por fitCanvas), então o
  // deslocamento de centralização é automaticamente descontado.
  function toLocal(evt) {
    const cRect = canvas.getBoundingClientRect();
    const viewX = evt.clientX - cRect.left;
    const viewY = evt.clientY - cRect.top;
    // Desfaz pan e zoom para obter coordenada no canvas real (W x H)
    return {
      x: (viewX - panX) / zoomLevel * (W / canvas.offsetWidth),
      y: (viewY - panY) / zoomLevel * (H / canvas.offsetHeight)
    };
  }

  function applyTransform() {
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoomLevel + ')';
  }

  // Média das cores num disco — evita ler um único pixel ruidoso
  function sampleArea(x, y, radius) {
    const r = Math.max(1, Math.round(radius));
    const x0 = Math.max(0, Math.round(x) - r);
    const y0 = Math.max(0, Math.round(y) - r);
    const w = Math.min(W - x0, r * 2);
    const h = Math.min(H - y0, r * 2);
    if (w <= 0 || h <= 0) return null;

    const img = ctx.getImageData(x0, y0, w, h).data;
    let sr = 0, sg = 0, sb = 0, count = 0;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = x0 + px - x, dy = y0 + py - y;
        if (dx * dx + dy * dy > r * r) continue;
        const i = (py * w + px) * 4;
        sr += img[i]; sg += img[i + 1]; sb += img[i + 2];
        count++;
      }
    }
    if (count === 0) return null;
    return { r: Math.round(sr / count), g: Math.round(sg / count), b: Math.round(sb / count) };
  }

  // Pincelada macia: mistura a cor de entrada com o que já está no godê
  function stamp(x, y, color, strength) {
    const radius = brushSize / 2;
    const beneath = sampleArea(x, y, radius * 0.6) || { r: 255, g: 255, b: 255 };
    const mixed = C.mixRgb(beneath, color, C.clamp(strength, 0, 1));

    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const rgb = `${mixed.r},${mixed.g},${mixed.b}`;
    grad.addColorStop(0, `rgba(${rgb},0.9)`);
    grad.addColorStop(0.6, `rgba(${rgb},0.45)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Interpola entre dois pontos para o traço não sair pontilhado
  function strokeBetween(from, to, color, strength) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (brushSize * 0.18)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      stamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, color, strength);
    }
  }

  /* ---------------- ferramentas ---------------- */

  function applyBrush(point) {
    const color = S.getRgb();
    if (lastPoint) strokeBetween(lastPoint, point, color, flow);
    else stamp(point.x, point.y, color, flow);
  }

  function applySmudge(point) {
    if (!carried) {
      carried = sampleArea(point.x, point.y, brushSize / 3);
      lastPoint = point;
      return;
    }
    if (lastPoint) strokeBetween(lastPoint, point, carried, flow * 0.7);

    // A espátula vai recolhendo a tinta do caminho
    const picked = sampleArea(point.x, point.y, brushSize / 3);
    if (picked) carried = C.mixRgb(carried, picked, 0.35);
  }

  function applyPick(point) {
    const picked = sampleArea(point.x, point.y, Math.max(2, brushSize / 5));
    // Conta-gotas captura a cor exata que está no godê
    if (picked) S.setRgb(picked.r, picked.g, picked.b, { commit: true, relock: true });
  }

  /* ---------------- undo/redo do canvas ---------------- */

  const MAX_UNDO = 30;
  let undoStack = [];    // snapshots anteriores (ImageData)
  let redoStack = [];

  function saveSnapshot() {
    undoStack.push(ctx.getImageData(0, 0, W, H));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];  // nova ação descarta redo
  }

  function undoCanvas() {
    if (undoStack.length === 0) return;
    redoStack.push(ctx.getImageData(0, 0, W, H));
    ctx.putImageData(undoStack.pop(), 0, 0);
  }

  function redoCanvas() {
    if (redoStack.length === 0) return;
    undoStack.push(ctx.getImageData(0, 0, W, H));
    ctx.putImageData(redoStack.pop(), 0, 0);
  }

  /* ---------------- eventos ---------------- */

  function onDown(evt) {
    if (evt.button === 1) return;  // botão do meio é pan, não pintura
    const point = toLocal(evt);
    drawing = true;
    lastPoint = null;
    carried = null;
    canvas.setPointerCapture(evt.pointerId);

    // Salva snapshot antes de começar a pintar (para o undo)
    if (tool !== 'pick') saveSnapshot();

    if (tool === 'pick') { applyPick(point); return; }
    if (tool === 'brush') applyBrush(point);
    else applySmudge(point);
    lastPoint = point;
  }

  function onMove(evt) {
    if (!drawing) return;
    const point = toLocal(evt);

    if (tool === 'pick') applyPick(point);
    else if (tool === 'brush') applyBrush(point);
    else applySmudge(point);

    lastPoint = point;
  }

  function onUp(evt) {
    if (!drawing) return;
    drawing = false;
    lastPoint = null;
    carried = null;
    if (canvas.hasPointerCapture(evt.pointerId)) canvas.releasePointerCapture(evt.pointerId);
  }

  /* ---------------- superfície ---------------- */

  function clear() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = SURFACE;
    ctx.fillRect(0, 0, W, H);

    // textura leve, para dar sensação de superfície
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.restore();
  }

  // Dispõe as cores da paleta ativa como pastilhas de tinta prontas para usar
  function loadPalette() {
    const colors = window.Palettes.getActiveColors();
    if (colors.length === 0) { setHint('Paleta ativa está vazia'); return; }

    const perRow = Math.min(colors.length, 8);
    const pad = 26;
    const gapX = (W - pad * 2) / Math.max(1, perRow - 1);

    colors.slice(0, 16).forEach((hex, i) => {
      const rgb = C.hexToRgb(hex);
      if (!rgb) return;
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = perRow === 1 ? W / 2 : pad + col * gapX;
      const y = 34 + row * 46;

      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.stroke();
    });
    setHint('Pastilhas dispostas — espatule para misturar');
  }

  function setHint(msg) {
    const el = document.getElementById('godeHint');
    if (el) el.textContent = msg;
  }

  function setTool(next) {
    tool = next;
    document.querySelectorAll('.gode-tool').forEach((btn) => {
      const active = btn.dataset.tool === tool;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });
    canvas.style.cursor = tool === 'pick' ? 'copy' : 'crosshair';
    setHint(
      tool === 'brush' ? 'Pincel — pinta com a cor atual, misturando no que já existe'
      : tool === 'smudge' ? 'Espátula — arrasta e mistura a tinta que já está no godê'
      : 'Conta-gotas — clique para capturar a cor misturada'
    );
  }

  /* ---------------- init ---------------- */

  let prevTool = null;  // ferramenta anterior ao atalho temporário

  function init() {
    canvas = document.getElementById('godeCanvas');
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Envolve o canvas num wrapper com overflow:hidden para que o zoom
    // não quebre o layout dos outros elementos da aba
    wrapper = document.createElement('div');
    wrapper.className = 'gode-viewport';
    canvas.parentNode.insertBefore(wrapper, canvas);
    wrapper.appendChild(canvas);

    // Ajusta o tamanho EXIBIDO do canvas (CSS) para caber no wrapper
    // mantendo a proporção nativa W:H — evita achatamento/distorção.
    // A resolução interna do canvas (canvas.width/height) não muda.
    function fitCanvas() {
      const availW = wrapper.clientWidth;
      const availH = wrapper.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      const scale = Math.min(availW / W, availH / H);
      const dispW = W * scale;
      const dispH = H * scale;
      canvas.style.width = dispW + 'px';
      canvas.style.height = dispH + 'px';
      canvas.style.left = ((availW - dispW) / 2) + 'px';
      canvas.style.top = ((availH - dispH) / 2) + 'px';
    }
    fitCanvas();
    if (window.Platform && window.Platform.observeResize) {
      window.Platform.observeResize(wrapper, fitCanvas);
    } else if (typeof ResizeObserver === 'function') {
      new ResizeObserver(fitCanvas).observe(wrapper);
    }

    // Barra de arraste para redimensionar o viewport do godê
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'gode-resize-handle';
    resizeHandle.title = 'Arraste para redimensionar';
    wrapper.parentNode.insertBefore(resizeHandle, wrapper.nextSibling);

    let resizing = false, resizeStartY = 0, resizeStartH = 0;
    resizeHandle.addEventListener('pointerdown', (evt) => {
      resizing = true;
      resizeStartY = evt.clientY;
      resizeStartH = wrapper.offsetHeight;
      resizeHandle.setPointerCapture(evt.pointerId);
      evt.preventDefault();
    });
    resizeHandle.addEventListener('pointermove', (evt) => {
      if (!resizing) return;
      const newH = Math.max(80, Math.min(600, resizeStartH + (evt.clientY - resizeStartY)));
      wrapper.style.height = newH + 'px';
    });
    resizeHandle.addEventListener('pointerup', (evt) => {
      resizing = false;
      if (resizeHandle.hasPointerCapture(evt.pointerId)) resizeHandle.releasePointerCapture(evt.pointerId);
    });
    resizeHandle.addEventListener('pointercancel', (evt) => {
      resizing = false;
      if (resizeHandle.hasPointerCapture(evt.pointerId)) resizeHandle.releasePointerCapture(evt.pointerId);
    });

    clear();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // Zoom com Ctrl + scroll (listener no wrapper)
    wrapper.addEventListener('wheel', (evt) => {
      if (!evt.ctrlKey) return;
      evt.preventDefault();
      const delta = evt.deltaY > 0 ? -0.15 : 0.15;
      const oldZoom = zoomLevel;
      zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel + delta));

      // Zoom centrado no ponto do cursor
      const wRect = wrapper.getBoundingClientRect();
      const mx = evt.clientX - wRect.left;
      const my = evt.clientY - wRect.top;
      panX = mx - (mx - panX) * (zoomLevel / oldZoom);
      panY = my - (my - panY) * (zoomLevel / oldZoom);

      applyTransform();
      setHint('Zoom ' + Math.round(zoomLevel * 100) + '%');
    }, { passive: false });

    // Pan com botão do meio (scroll click) arrastar — no wrapper
    wrapper.addEventListener('pointerdown', (evt) => {
      if (evt.button === 1) {
        evt.preventDefault();
        panning = true;
        panStartX = evt.clientX;
        panStartY = evt.clientY;
        panStartPanX = panX;
        panStartPanY = panY;
        wrapper.setPointerCapture(evt.pointerId);
        wrapper.style.cursor = 'grab';
      }
    });

    wrapper.addEventListener('pointermove', (evt) => {
      if (!panning) return;
      panX = panStartPanX + (evt.clientX - panStartX);
      panY = panStartPanY + (evt.clientY - panStartY);
      applyTransform();
    });

    const endPan = (evt) => {
      if (!panning) return;
      if (evt.button !== 1) return;
      panning = false;
      wrapper.style.cursor = '';
      if (wrapper.hasPointerCapture(evt.pointerId)) wrapper.releasePointerCapture(evt.pointerId);
    };
    wrapper.addEventListener('pointerup', endPan);
    wrapper.addEventListener('pointercancel', endPan);

    /**
     * Só os botões que declaram `data-tool` trocam a ferramenta.
     *
     * O seletor `.gode-tool` também pega Limpar, desfazer e refazer, que são
     * ações e não ferramentas. Sem o filtro, clicar em qualquer um deles
     * chamava `setTool(undefined)` e desligava a ferramenta ativa: o pincel
     * perdia o destaque e o próximo traço não sabia o que fazer.
     */
    document.querySelectorAll('.gode-tool[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        prevTool = null;  // clique explícito cancela qualquer atalho temporário
        setTool(btn.dataset.tool);
      });
    });

    const sizeEl = document.getElementById('godeSize');
    // No UXP o <input type="range"> pode não renderizar; o polyfill troca por
    // um slider de divs mantendo `.value` e o evento 'input'.
    if (window.Platform && window.Platform.polyfillRange) {
      window.Platform.polyfillRange(sizeEl);
    }
    sizeEl.addEventListener('input', () => {
      brushSize = Number(sizeEl.value);
      document.getElementById('godeSizeVal').textContent = brushSize;
    });

    const flowEl = document.getElementById('godeFlow');
    if (window.Platform && window.Platform.polyfillRange) {
      window.Platform.polyfillRange(flowEl);
    }
    flowEl.addEventListener('input', () => {
      flow = Number(flowEl.value) / 100;
      document.getElementById('godeFlowVal').textContent = flowEl.value + '%';
    });

    document.getElementById('godeClear').addEventListener('click', () => {
      saveSnapshot();
      clear();
      setHint('Godê limpo');
    });
    document.getElementById('godeClearInline').addEventListener('click', () => {
      saveSnapshot();
      clear();
      setHint('Godê limpo');
    });
    document.getElementById('godeUndo').addEventListener('click', () => {
      undoCanvas();
      setHint('Desfazer');
    });
    document.getElementById('godeRedo').addEventListener('click', () => {
      redoCanvas();
      setHint('Refazer');
    });
    document.getElementById('godeLoad').addEventListener('click', loadPalette);

    /**
     * Atalhos de teclado: Shift = espátula temporária, Alt = conta-gotas
     * temporário. Soltar a tecla volta à ferramenta anterior.
     * Ctrl+0 reseta o zoom para 100%.
     */
    document.addEventListener('keydown', (evt) => {
      // Só ativa se o godê estiver visível
      if (!isGodeVisible()) return;
      // Não interceptar se estiver num campo de texto
      if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA' || evt.target.tagName === 'SELECT') return;

      // Ctrl+0 reseta zoom e pan
      if (evt.ctrlKey && evt.key === '0') {
        evt.preventDefault();
        zoomLevel = 1;
        panX = 0;
        panY = 0;
        applyTransform();
        setHint('Zoom 100%');
        return;
      }

      // Ctrl+Z = undo, Ctrl+Shift+Z ou Ctrl+Y = redo
      if (evt.ctrlKey && !evt.altKey) {
        if (evt.key === 'z' && !evt.shiftKey) {
          evt.preventDefault();
          undoCanvas();
          setHint('Desfazer');
          return;
        }
        if ((evt.key === 'z' && evt.shiftKey) || evt.key === 'y') {
          evt.preventDefault();
          redoCanvas();
          setHint('Refazer');
          return;
        }
      }

      if (evt.key === 'Shift' && tool !== 'smudge') {
        prevTool = tool;
        setTool('smudge');
      } else if (evt.key === 'Alt' && tool !== 'pick') {
        evt.preventDefault();  // previne o menu do navegador
        prevTool = tool;
        setTool('pick');
      }
    });

    document.addEventListener('keyup', (evt) => {
      if (!prevTool) return;
      if (evt.key === 'Shift' && tool === 'smudge') {
        setTool(prevTool);
        prevTool = null;
      } else if (evt.key === 'Alt' && tool === 'pick') {
        setTool(prevTool);
        prevTool = null;
      }
    });

    /**
     * O godê guarda tinta real: o canvas é a fonte de verdade para mistura e
     * conta-gotas. Por isso a conferência de valores aqui é um filtro de
     * exibição, e não uma conversão dos pixels.
     */
    S.subscribe(() => {
      canvas.classList.toggle('is-value-check', S.state.valueCheck);
    });

    setTool('brush');
  }

  // Verifica se a aba do godê está visível (no painel ou em janela flutuante)
  function isGodeVisible() {
    if (window.Docking && window.Docking.isVisible) {
      return window.Docking.isVisible('paneGode');
    }
    const pane = document.getElementById('paneGode');
    return pane && pane.classList.contains('is-active');
  }

  return { init, clear, loadPalette };
})();
