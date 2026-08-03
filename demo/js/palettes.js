/**
 * palettes.js — Paletas salvas pelo artista, persistidas localmente.
 */
window.Palettes = (function () {
  'use strict';

  const C = window.Color;
  const S = window.AppState;

  const STORAGE_KEY = 'colorWheelPlugin.palettes.v1';
  const MAX_COLORS = 64;

  let data = { palettes: [], activeId: null };

  /* ---------------- Persistência ---------------- */

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function seed() {
    data.palettes = [{
      id: newId(),
      name: 'Paleta 1',
      colors: ['#6A0700', '#B5451B', '#E0A458', '#3D5A6C', '#1B2431']
    }];
  }

  /** Storage efetivo: Platform Adapter quando presente, senão localStorage. */
  function backing() {
    if (window.Platform && window.Platform.storage) return window.Platform.storage;
    return window.localStorage;
  }

  function load() {
    try {
      const raw = backing().getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.palettes) && parsed.palettes.length) {
          data = { palettes: parsed.palettes, activeId: parsed.activeId || null };
        }
      }
    } catch (err) {
      // Armazenamento indisponível ou corrompido: segue em memória
      console.warn('Não foi possível ler as paletas salvas:', err.message);
    }

    if (data.palettes.length === 0) seed();
    if (!getActive()) data.activeId = data.palettes[0].id;
  }

  function save() {
    try {
      backing().setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      setStatus('Não foi possível salvar (armazenamento indisponível)');
    }
  }

  /* ---------------- Operações ---------------- */

  function getActive() {
    return data.palettes.find((p) => p.id === data.activeId) || null;
  }

  function createPalette() {
    const p = { id: newId(), name: 'Paleta ' + (data.palettes.length + 1), colors: [] };
    data.palettes.push(p);
    data.activeId = p.id;
    save();
    render();
    setStatus('Paleta criada');
  }

  function deletePalette() {
    const active = getActive();
    if (!active) return;

    if (data.palettes.length === 1) {
      active.colors = [];
      save();
      render();
      setStatus('Paleta esvaziada');
      return;
    }
    data.palettes = data.palettes.filter((p) => p.id !== active.id);
    data.activeId = data.palettes[0].id;
    save();
    render();
    setStatus('Paleta removida');
  }

  function renameActive(name) {
    const active = getActive();
    if (!active) return;
    const trimmed = name.trim();
    active.name = trimmed === '' ? 'Sem nome' : trimmed.slice(0, 40);
    save();
    render();
  }

  function addCurrentColor() {
    const active = getActive();
    if (!active) return;

    const hex = S.getHex();
    if (active.colors.includes(hex)) { setStatus(hex + ' já está na paleta'); return; }
    if (active.colors.length >= MAX_COLORS) { setStatus('Paleta cheia (' + MAX_COLORS + ')'); return; }

    active.colors.push(hex);
    save();
    render();
    setStatus(hex + ' adicionada');
  }

  function removeColor(index) {
    const active = getActive();
    if (!active) return;
    const [removed] = active.colors.splice(index, 1);
    save();
    render();
    setStatus(removed + ' removida');
  }

  // Preenche a paleta com os matizes disponíveis sob o limite de cor ativo
  function fillFromLimit() {
    const hues = S.getLimitedPalette();
    if (!hues) { setStatus('Ative o limite de cor primeiro'); return; }

    const active = getActive();
    if (!active) return;

    const hsv = S.getHsv();
    active.colors = hues.slice(0, MAX_COLORS).map((h) => {
      const rgb = C.hsvToRgb(h, hsv.s, hsv.v);
      return C.rgbToHex(rgb.r, rgb.g, rgb.b);
    });
    save();
    render();
    setStatus(active.colors.length + ' matizes importados do limite');
  }

  function fillFromBwRamp() {
    const active = getActive();
    if (!active) return;
    active.colors = S.getBwRamp().map((t) => C.rgbToHex(t.r, t.g, t.b));
    save();
    render();
    setStatus(active.colors.length + ' valores importados da rampa B/W');
  }

  function exportActive() {
    const active = getActive();
    if (!active || active.colors.length === 0) { setStatus('Nada para exportar'); return; }

    const field = document.getElementById('paletteExport');
    field.value = active.colors.join('\n');
    field.hidden = false;
    field.focus();
    field.select();
    setStatus(active.colors.length + ' cores prontas para copiar');
  }

  function getActiveColors() {
    const active = getActive();
    return active ? active.colors.slice() : [];
  }

  /* ---------------- Interface ---------------- */

  function setStatus(msg) {
    const el = document.getElementById('paletteStatus');
    if (el) el.textContent = msg;
  }

  function render() {
    const active = getActive();

    const select = document.getElementById('paletteSelect');
    select.innerHTML = '';
    data.palettes.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.colors.length})`;
      if (active && p.id === active.id) opt.selected = true;
      select.appendChild(opt);
    });

    const nameField = document.getElementById('paletteName');
    if (active && document.activeElement !== nameField) nameField.value = active.name;

    const grid = document.getElementById('paletteGrid');
    grid.innerHTML = '';

    if (!active || active.colors.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'palette-empty';
      empty.textContent = 'Paleta vazia — use + para guardar a cor atual.';
      grid.appendChild(empty);
      return;
    }

    active.colors.forEach((hex, index) => {
      const cell = document.createElement('div');
      cell.className = 'palette-cell';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-chip';
      const rgbChip = C.hexToRgb(hex);
      btn.style.background = rgbChip ? S.displayCss(rgbChip) : hex;
      btn.title = hex + ' — clique para aplicar';
      btn.setAttribute('aria-label', 'Aplicar ' + hex);
      btn.addEventListener('click', () => {
        const rgb = C.hexToRgb(hex);
        if (rgb) S.setRgb(rgb.r, rgb.g, rgb.b, { commit: true, relock: true });
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'palette-del';
      del.textContent = '×';
      del.title = 'Remover ' + hex;
      del.setAttribute('aria-label', 'Remover ' + hex);
      del.addEventListener('click', (evt) => {
        evt.stopPropagation();
        removeColor(index);
      });

      cell.append(btn, del);
      grid.appendChild(cell);
    });
  }

  function init() {
    load();

    document.getElementById('paletteSelect').addEventListener('change', (evt) => {
      data.activeId = evt.target.value;
      save();
      render();
    });

    document.getElementById('paletteName').addEventListener('change', (evt) => {
      renameActive(evt.target.value);
    });

    document.getElementById('paletteAdd').addEventListener('click', addCurrentColor);
    document.getElementById('paletteNew').addEventListener('click', createPalette);
    document.getElementById('paletteDelete').addEventListener('click', deletePalette);
    document.getElementById('paletteFromLimit').addEventListener('click', fillFromLimit);
    document.getElementById('paletteFromBw').addEventListener('click', fillFromBwRamp);
    document.getElementById('paletteExportBtn').addEventListener('click', exportActive);

    render();
  }

  return { init, render, getActiveColors, addCurrentColor };
})();
