/**
 * docking.js — Separa uma aba em janela flutuante e a devolve ao painel.
 *
 * A abordagem é mover o próprio nó do DOM, sem recriá-lo. Assim todos os
 * listeners e o código de refresh continuam válidos: eles buscam os
 * elementos por id, e o id não muda de lugar.
 */
window.Docking = (function () {
  'use strict';

  const STORAGE_KEY = 'colorWheelPlugin.docking.v1';

  // Abas que podem ser separadas, com o título da janela
  const PANES = {
    paneSliders:  { tab: 'tabSliders',  title: 'Sliders' },
    paneMixers:   { tab: 'tabMixers',   title: 'Mixers' },
    panePalettes: { tab: 'tabPalettes', title: 'Paletas' },
    paneGode:     { tab: 'tabGode',     title: 'Godê' }
  };

  const floating = new Map();     // paneId -> { win, placeholder, anchor }
  let positions = {};

  /* ---------------- persistência ---------------- */

  /** Storage efetivo: Platform Adapter quando presente, senão localStorage. */
  function backing() {
    if (window.Platform && window.Platform.storage) return window.Platform.storage;
    return window.localStorage;
  }

  function load() {
    try {
      const raw = backing().getItem(STORAGE_KEY);
      if (raw) positions = JSON.parse(raw) || {};
    } catch (err) {
      positions = {};
    }
  }

  function save() {
    const data = {};
    Object.keys(positions).forEach((id) => { data[id] = positions[id]; });
    floating.forEach((entry, id) => {
      data[id] = { ...(data[id] || {}), detached: true };
    });
    Object.keys(PANES).forEach((id) => {
      if (!floating.has(id) && data[id]) data[id].detached = false;
    });
    try {
      backing().setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      /* armazenamento indisponível: posições valem só nesta sessão */
    }
  }

  /* ---------------- separar ---------------- */

  function detach(paneId) {
    if (floating.has(paneId) || !PANES[paneId]) return;

    const pane = document.getElementById(paneId);
    if (!pane) return;

    /**
     * Marcador do lugar de origem, para devolver a aba na mesma posição.
     * O UXP não garante nós de comentário, então cai para um span vazio e
     * oculto, que serve igualmente bem como âncora de posição no DOM.
     */
    let anchor;
    try {
      anchor = document.createComment('pane:' + paneId);
    } catch (err) {
      anchor = document.createElement('span');
      anchor.hidden = true;
      anchor.setAttribute('data-pane-anchor', paneId);
    }
    pane.parentNode.insertBefore(anchor, pane);

    // Aviso no lugar da aba, para quem clicar nela entender o que houve
    const placeholder = document.createElement('p');
    placeholder.className = 'pane detached-note';
    placeholder.dataset.for = paneId;
    placeholder.textContent = `${PANES[paneId].title} está numa janela separada.`;

    const dockBack = document.createElement('button');
    dockBack.type = 'button';
    dockBack.className = 'pal-btn';
    dockBack.textContent = 'Trazer de volta';
    dockBack.addEventListener('click', () => dock(paneId));
    placeholder.appendChild(document.createElement('br'));
    placeholder.appendChild(dockBack);

    anchor.parentNode.insertBefore(placeholder, anchor);

    const win = buildWindow(paneId, pane);
    document.body.appendChild(win);

    floating.set(paneId, { win, placeholder, anchor });
    syncPlaceholders();
    syncDetachButton();
    save();

    // Sliders: a altura da janela depende do modo ativo (número de canais).
    // Ajusta assim que a janela é criada, não só quando o modo muda depois.
    if (paneId === 'paneSliders' && window.Panels && window.Panels.adjustFloatingHeight) {
      window.Panels.adjustFloatingHeight();
    }
  }

  function buildWindow(paneId, pane) {
    const win = document.createElement('section');
    win.className = 'float-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', PANES[paneId].title);

    const bar = document.createElement('header');
    bar.className = 'float-bar';

    const title = document.createElement('span');
    title.className = 'float-title';
    title.textContent = PANES[paneId].title;

    const dockBtn = document.createElement('button');
    dockBtn.type = 'button';
    dockBtn.className = 'float-dock';
    dockBtn.title = 'Reencaixar no painel';
    dockBtn.setAttribute('aria-label', 'Reencaixar no painel');
    dockBtn.textContent = '⤡';
    dockBtn.addEventListener('click', () => dock(paneId));

    bar.append(title, dockBtn);

    const body = document.createElement('div');
    body.className = 'float-body';
    body.appendChild(pane);

    win.append(bar, body);

    // Alças de redimensionamento nos 4 cantos e 4 bordas
    makeResizable(win, paneId);

    /**
     * A janela vive dentro da área visível do plugin: num painel do Photoshop
     * o conteúdo é uma página confinada ao retângulo do painel, então uma
     * largura maior que a viewport não "transborda para a tela", só é cortada.
     * Por isso todo tamanho e posição padrão são derivados da viewport.
     */
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;

    const saved = positions[paneId];

    const wantWidth = saved && typeof saved.width === 'number' ? saved.width : 460;
    const width = Math.max(240, Math.min(wantWidth, vw - MARGIN * 2));

    // A altura da janela de Sliders é fixada pelo modo ativo (número de
    // canais), não por preferência salva — evita margem vazia ao restaurar.
    const wantHeight = (paneId === 'paneSliders')
      ? 220
      : (saved && typeof saved.height === 'number' ? saved.height : 280);
    const height = Math.max(140, Math.min(wantHeight, vh - MARGIN * 2));

    win.style.width = width + 'px';
    win.style.height = height + 'px';

    // Sem posição salva, abre logo abaixo da linha de abas: cobre a faixa de
    // conteúdo, que é justamente a que acabou de ficar vazia, e deixa a roda
    // visível acima.
    const tabs = document.querySelector('.panel .tabs');
    const tabsRect = tabs ? tabs.getBoundingClientRect() : null;
    const defaultLeft = MARGIN;
    const defaultTop = tabsRect
      ? Math.min(tabsRect.bottom + MARGIN, Math.max(MARGIN, vh - height - MARGIN))
      : MARGIN;

    const left = saved && typeof saved.left === 'number' ? saved.left : defaultLeft;
    const top = saved && typeof saved.top === 'number' ? saved.top : defaultTop;
    place(win, left, top);

    makeDraggable(win, bar, paneId);
    return win;
  }

  /* ---------------- arrastar ---------------- */

  /**
   * Mantém a janela inteira dentro da viewport quando ela cabe. Se for maior
   * que a viewport (painel muito estreito), encosta na borda de origem em vez
   * de deixar a parte útil para fora — cortar o lado dos campos numéricos é
   * pior do que cortar a borda direita vazia.
   */
  function place(win, left, top) {
    const w = win.offsetWidth || parseFloat(win.style.width) || 0;
    const h = win.offsetHeight || parseFloat(win.style.height) || 0;

    const maxLeft = Math.max(0, window.innerWidth - w);
    const maxTop = Math.max(0, window.innerHeight - h);

    win.style.left = Math.min(Math.max(left, 0), maxLeft) + 'px';
    win.style.top = Math.min(Math.max(top, 0), maxTop) + 'px';
  }

  /** Reenquadra as janelas abertas quando o painel muda de tamanho. */
  function reflow() {
    floating.forEach((entry) => {
      const win = entry.win;
      const MARGIN = 8;
      const maxW = Math.max(240, window.innerWidth - MARGIN * 2);
      const maxH = Math.max(140, window.innerHeight - MARGIN * 2);
      if (win.offsetWidth > maxW) win.style.width = maxW + 'px';
      if (win.offsetHeight > maxH) win.style.height = maxH + 'px';
      place(win, parseFloat(win.style.left) || 0, parseFloat(win.style.top) || 0);
    });
  }

  function makeDraggable(win, handle, paneId) {
    let dragging = false;
    let offsetX = 0, offsetY = 0;

    handle.addEventListener('pointerdown', (evt) => {
      if (evt.target.closest('.float-dock')) return;
      dragging = true;
      const rect = win.getBoundingClientRect();
      offsetX = evt.clientX - rect.left;
      offsetY = evt.clientY - rect.top;
      handle.setPointerCapture(evt.pointerId);
      win.classList.add('is-dragging');
    });

    handle.addEventListener('pointermove', (evt) => {
      if (!dragging) return;
      place(win, evt.clientX - offsetX, evt.clientY - offsetY);
    });

    const end = (evt) => {
      if (!dragging) return;
      dragging = false;
      if (handle.hasPointerCapture(evt.pointerId)) handle.releasePointerCapture(evt.pointerId);
      win.classList.remove('is-dragging');
      positions[paneId] = {
        left: parseFloat(win.style.left) || 0,
        top: parseFloat(win.style.top) || 0,
        width: parseFloat(win.style.width) || 340,
        height: parseFloat(win.style.height) || 280,
        detached: true
      };
      save();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /* ---------------- redimensionar janelas flutuantes ---------------- */

  const MIN_WIN_W = 420;
  const MIN_WIN_H = 140;

  /**
   * Adiciona alças de redimensionamento em todas as bordas e cantos.
   * Cada alça é um div posicionado nas bordas que captura o arraste.
   */
  function makeResizable(win, paneId) {
    const edges = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    edges.forEach((dir) => {
      const handle = document.createElement('div');
      handle.className = 'float-resize float-resize--' + dir;
      handle.dataset.dir = dir;
      win.appendChild(handle);

      let startX, startY, startRect;

      handle.addEventListener('pointerdown', (evt) => {
        evt.stopPropagation();
        startX = evt.clientX;
        startY = evt.clientY;
        startRect = win.getBoundingClientRect();
        handle.setPointerCapture(evt.pointerId);
        win.classList.add('is-resizing');
      });

      handle.addEventListener('pointermove', (evt) => {
        if (!startRect) return;
        const dx = evt.clientX - startX;
        const dy = evt.clientY - startY;

        let newLeft = startRect.left;
        let newTop = startRect.top;
        let newW = startRect.width;
        let newH = startRect.height;

        if (dir.includes('e')) newW = Math.max(MIN_WIN_W, startRect.width + dx);
        if (dir.includes('w')) { newW = Math.max(MIN_WIN_W, startRect.width - dx); newLeft = startRect.right - newW; }
        if (dir.includes('s')) newH = Math.max(MIN_WIN_H, startRect.height + dy);
        if (dir.includes('n')) { newH = Math.max(MIN_WIN_H, startRect.height - dy); newTop = startRect.bottom - newH; }

        win.style.left = newLeft + 'px';
        win.style.top = newTop + 'px';
        win.style.width = newW + 'px';
        win.style.height = newH + 'px';
      });

      const endResize = (evt) => {
        if (!startRect) return;
        startRect = null;
        if (handle.hasPointerCapture(evt.pointerId)) handle.releasePointerCapture(evt.pointerId);
        win.classList.remove('is-resizing');
        positions[paneId] = {
          left: parseFloat(win.style.left) || 0,
          top: parseFloat(win.style.top) || 0,
          width: parseFloat(win.style.width) || 340,
          height: parseFloat(win.style.height) || 280,
          detached: true
        };
        save();
      };
      handle.addEventListener('pointerup', endResize);
      handle.addEventListener('pointercancel', endResize);
    });
  }

  /* ---------------- reencaixar ---------------- */

  function dock(paneId) {
    const entry = floating.get(paneId);
    if (!entry) return;

    const pane = document.getElementById(paneId);
    entry.anchor.parentNode.insertBefore(pane, entry.anchor);

    entry.anchor.remove();
    entry.placeholder.remove();
    entry.win.remove();
    floating.delete(paneId);

    // Reencaixar volta o foco para a aba correspondente
    document.getElementById(PANES[paneId].tab).click();

    syncDetachButton();
    save();
  }

  /* ---------------- sincronização com as abas ---------------- */

  // O aviso só aparece quando a aba separada é a selecionada
  function syncPlaceholders() {
    floating.forEach((entry, paneId) => {
      const tab = document.getElementById(PANES[paneId].tab);
      const selected = tab.getAttribute('aria-selected') === 'true';
      entry.placeholder.classList.toggle('is-active', selected);
    });
  }

  function activePaneId() {
    const tab = document.querySelector('.tab[aria-selected="true"]');
    if (!tab) return null;
    const found = Object.keys(PANES).find((id) => PANES[id].tab === tab.id);
    return found || null;
  }

  /**
   * Dentro de um painel do Photoshop, uma janela em HTML não pode sair do
   * retângulo do painel — é o mesmo limite de um iframe. Quando o CEP está
   * disponível, o botão passa a pedir ao host a janela Modeless declarada no
   * manifest, que é uma janela de verdade e vai para onde o usuário quiser.
   */
  const TOOLS_EXTENSION_ID = 'com.drawcolor.colorwheel.tools';

  function canOpenToolsWindow() {
    const P = window.Platform;
    if (!P || !P.isCep) return false;
    // A própria janela de ferramentas não abre outra igual.
    if (document.body && document.body.classList.contains('shell-tools')) return false;
    if (typeof window.CSInterface !== 'function') return false;
    const b = window.__adobe_cep__;
    return !!(b && typeof b.requestOpenExtension === 'function');
  }

  function openToolsWindow() {
    if (!canOpenToolsWindow()) return false;
    try {
      return new window.CSInterface().requestOpenExtension(TOOLS_EXTENSION_ID, '');
    } catch (err) {
      return false;
    }
  }

  function syncDetachButton() {
    const btn = document.getElementById('detachBtn');
    if (!btn) return;

    if (canOpenToolsWindow()) {
      btn.disabled = false;
      btn.title = 'Abrir a janela de ferramentas (posicionável na tela)';
      return;
    }

    const paneId = activePaneId();
    const canDetach = paneId && !floating.has(paneId);
    btn.disabled = !canDetach;
    btn.title = canDetach
      ? `Separar ${PANES[paneId].title} em janela`
      : 'Esta aba já está separada';
  }

  /**
   * Uma aba conta como visível quando está selecionada no painel ou quando
   * está flutuando. Componentes que só atualizam quando visíveis usam isto.
   */
  function isVisible(paneId) {
    if (floating.has(paneId)) return true;
    const pane = document.getElementById(paneId);
    return !!pane && pane.classList.contains('is-active');
  }

  function init() {
    load();

    document.getElementById('detachBtn').addEventListener('click', () => {
      // No CEP: janela nativa, livre na tela. Fora dele: janela interna.
      if (openToolsWindow()) return;
      const paneId = activePaneId();
      if (paneId) detach(paneId);
    });

    // As abas são controladas em main.js; aqui só reagimos à troca
    document.querySelector('.tabs').addEventListener('click', () => {
      requestAnimationFrame(() => {
        syncPlaceholders();
        syncDetachButton();
      });
    });

    window.addEventListener('resize', reflow);

    // Restaura o que estava separado na sessão anterior
    Object.keys(PANES).forEach((paneId) => {
      if (positions[paneId] && positions[paneId].detached) detach(paneId);
    });

    syncDetachButton();
  }

  return { init, detach, dock, isVisible, reflow, openToolsWindow, canOpenToolsWindow };
})();
