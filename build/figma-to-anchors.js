#!/usr/bin/env node
/**
 * figma-to-anchors.js — Converte posições vindas do Figma em âncoras do layout.
 *
 *   node build/figma-to-anchors.js build/figma-centros.json
 *
 * O Figma trabalha em x e y; o plugin guarda cada controle como ângulo e raio a
 * partir do centro da roda, para a posição acompanhar a escala do painel. Este
 * script faz essa conversão e, antes de imprimir, confere duas coisas que o
 * Figma não confere: se o controle cabe dentro do painel e se ele encosta em
 * algum vizinho.
 *
 * Entrada: { "harmony.1": [cx, cy], ... } no espaço de referência (628 x 907).
 * Saída: a tabela para layout.js e o perfil JSON que o plugin importa.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REF = { width: 628, height: 907, center: { x: 325, y: 352 } };

/** Diâmetro de cada controle em unidades de referência, vindo do CSS. */
const SIZES = {
  'harmony.1': 44, 'harmony.2': 44, 'harmony.3': 44,
  'harmony.4': 44, 'harmony.5': 44, 'harmony.6': 44,
  'sat.gamutmask': 44, 'sat.shape': 44,
  'hex.field': { w: 100, h: 36 },
  'history.redo': 44, 'history.undo': 44,
  'rail.dial.temperature': 44, 'rail.dial.brightness': 44,
  'rail.lumlock': 44, 'rail.valuecheck': 44,
  'swatch.fg': 92, 'swatch.bg': 72, 'swatch.swap': 26
};

/**
 * Pares que se sobrepõem por desenho na referência: os swatches de foreground
 * e background são concêntricos de propósito, um sobre o outro.
 */
const SOBREPOSICAO_ESPERADA = [['swatch.fg', 'swatch.bg']];

function toAnchor(cx, cy) {
  const dx = cx - REF.center.x;
  const dy = cy - REF.center.y;
  let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
  if (angle < 0) angle += 360;
  return { angle, radius: Math.hypot(dx, dy) };
}

function toPoint(anchor) {
  const rad = anchor.angle * Math.PI / 180;
  return {
    x: REF.center.x + anchor.radius * Math.sin(rad),
    y: REF.center.y - anchor.radius * Math.cos(rad)
  };
}

function caixa(id, ponto) {
  const s = SIZES[id];
  const w = typeof s === 'number' ? s : s.w;
  const h = typeof s === 'number' ? s : s.h;
  return {
    left: ponto.x - w / 2, right: ponto.x + w / 2,
    top: ponto.y - h / 2, bottom: ponto.y + h / 2,
    w, h
  };
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ehCirculo(id) {
  return typeof SIZES[id] === 'number';
}

/**
 * Sobreposição pela forma real de cada controle. Comparar caixas
 * envolventes acusa encontro entre dois círculos que só compartilham o canto
 * do retângulo — foi o que aconteceu com swatch.fg e swatch.swap, que estão a
 * 68 unidades quando a soma dos raios é 59.
 */
function sobrepoe(a, pa, b, pb) {
  const circA = ehCirculo(a);
  const circB = ehCirculo(b);

  if (circA && circB) {
    const ra = SIZES[a] / 2;
    const rb = SIZES[b] / 2;
    return distancia(pa, pb) < ra + rb;
  }

  if (circA !== circB) {
    const [idCirc, pCirc, idBox, pBox] = circA ? [a, pa, b, pb] : [b, pb, a, pa];
    const r = SIZES[idCirc] / 2;
    const box = caixa(idBox, pBox);
    // Ponto da caixa mais próximo do centro do círculo.
    const px = Math.min(Math.max(pCirc.x, box.left), box.right);
    const py = Math.min(Math.max(pCirc.y, box.top), box.bottom);
    return Math.hypot(pCirc.x - px, pCirc.y - py) < r;
  }

  const ca = caixa(a, pa);
  const cb = caixa(b, pb);
  return ca.left < cb.right && ca.right > cb.left &&
         ca.top < cb.bottom && ca.bottom > cb.top;
}

function main() {
  const entrada = process.argv[2];
  if (!entrada) {
    console.error('uso: node build/figma-to-anchors.js <centros.json>');
    process.exit(1);
  }

  const centros = JSON.parse(fs.readFileSync(path.resolve(entrada), 'utf8'));
  const ids = Object.keys(centros);

  const anchors = {};
  ids.forEach((id) => {
    if (!SIZES[id]) {
      console.error(`controle desconhecido no arquivo: ${id}`);
      process.exit(1);
    }
    const [cx, cy] = centros[id];
    anchors[id] = toAnchor(cx, cy);
  });

  /* ---------------- conferências ---------------- */

  const avisos = [];

  ids.forEach((id) => {
    const c = caixa(id, toPoint(anchors[id]));
    if (c.left < 0 || c.top < 0 || c.right > REF.width || c.bottom > REF.height) {
      avisos.push(`${id} passa da borda do painel (${c.left.toFixed(0)}..${c.right.toFixed(0)} x ${c.top.toFixed(0)}..${c.bottom.toFixed(0)})`);
    }
  });

  const esperada = new Set(SOBREPOSICAO_ESPERADA.map((p) => p.slice().sort().join('|')));

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (esperada.has([a, b].slice().sort().join('|'))) continue;

      const pa = toPoint(anchors[a]);
      const pb = toPoint(anchors[b]);

      if (sobrepoe(a, pa, b, pb)) {
        avisos.push(`${a} e ${b} se sobrepõem (centros a ${distancia(pa, pb).toFixed(1)} unidades)`);
      }
    }
  }

  /* ---------------- saída ---------------- */

  const largura = Math.max(...ids.map((id) => id.length)) + 2;
  const tabela = ids.map((id) => {
    const a = anchors[id];
    const p = toPoint(a);
    const chave = `'${id}':`.padEnd(largura + 2);
    return `    ${chave} { angle: ${a.angle.toFixed(2)}, radius: ${a.radius.toFixed(1)} },`
      + `  // (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`;
  }).join('\n');

  const controls = {};
  ids.forEach((id) => {
    controls[id] = {
      angle: parseFloat(anchors[id].angle.toFixed(3)),
      radius: parseFloat(anchors[id].radius.toFixed(3))
    };
  });
  const perfil = JSON.stringify({ version: 1, name: 'Figma', controls }, null, 2);

  console.log('/* ---- tabela para demo/js/layout.js ---- */');
  console.log(tabela);
  console.log('\n/* ---- perfil para importar no plugin ---- */');
  console.log(perfil);

  if (avisos.length) {
    console.log('\n/* ---- avisos ---- */');
    avisos.forEach((a) => console.log('  ' + a));
  } else {
    console.log('\n/* nenhum controle fora do painel, nenhuma sobreposição inesperada */');
  }
}

main();
