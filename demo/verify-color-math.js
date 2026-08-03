// Verificação das propriedades de round-trip (Requisito 11.2 e 11.3)
global.window = {};
require('./js/color.js');
const C = global.window.Color;

let fails = 0;
const fail = (msg) => { if (fails < 12) console.log('FAIL ' + msg); fails++; };

// --- 11.2: HSV -> RGB -> HSV em precisão contínua, tolerância ±1
for (let i = 0; i < 5000; i++) {
  const h = Math.random() * 360;
  const s = Math.random() * 100;
  const v = Math.random() * 100;
  const rgb = C.hsvToRgbFloat(h, s, v);
  const back = C.rgbToHsv(rgb.r, rgb.g, rgb.b);

  if (Math.abs(back.v - v) > 1) fail(`V ${v.toFixed(2)} -> ${back.v.toFixed(2)}`);
  if (v > 0.01 && Math.abs(back.s - s) > 1) fail(`S ${s.toFixed(2)} -> ${back.s.toFixed(2)}`);
  if (v > 0.01 && s > 0.01) {
    const dh = Math.abs(((back.h - h + 540) % 360) - 180);
    if (dh > 1) fail(`H ${h.toFixed(2)} -> ${back.h.toFixed(2)}`);
  }
}

// --- 11.3: RGB -> LAB -> RGB, tolerância ±1
for (let i = 0; i < 5000; i++) {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  const lab = C.rgbToLab(r, g, b);
  const back = C.labToRgb(lab.L, lab.a, lab.b);
  if (Math.abs(back.r - r) > 1 || Math.abs(back.g - g) > 1 || Math.abs(back.b - b) > 1) {
    fail(`LAB ${r},${g},${b} -> ${back.r},${back.g},${back.b}`);
  }
}

// --- RGB -> CMYK -> RGB
for (let i = 0; i < 3000; i++) {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  const k = C.rgbToCmyk(r, g, b);
  const back = C.cmykToRgb(k.c, k.m, k.y, k.k);
  if (Math.abs(back.r - r) > 1 || Math.abs(back.g - g) > 1 || Math.abs(back.b - b) > 1) {
    fail(`CMYK ${r},${g},${b} -> ${back.r},${back.g},${back.b}`);
  }
}

// --- Requisito 6.4 / 6.5: parsing hex
[['#6A0700', true], ['6a0700', true], ['#GGG000', false], ['#12345', false],
 ['', false], ['#1234567', false], ['  #ffffff  ', true]].forEach(([input, expected]) => {
  const got = C.hexToRgb(input) !== null;
  if (got !== expected) fail(`hex "${input}" esperado ${expected}, obtido ${got}`);
});
if (C.rgbToHex(106, 7, 0) !== '#6A0700') fail('rgbToHex deve sair em maiúsculas com #');

// --- Requisito 8: gamut
if (!C.isOutOfGamut(255, 0, 0)) fail('vermelho puro deveria estar fora do gamut');
if (C.isOutOfGamut(128, 128, 128)) fail('cinza deveria estar dentro do gamut');

let clipChecked = 0;
for (let i = 0; i < 400; i++) {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  if (!C.isOutOfGamut(r, g, b)) continue;
  clipChecked++;
  const fixed = C.clipToGamut(r, g, b);
  if (C.isOutOfGamut(fixed.r, fixed.g, fixed.b)) {
    fail(`clipToGamut deixou ${r},${g},${b} fora do gamut`);
  }
}
if (clipChecked === 0) fail('nenhuma cor fora do gamut foi amostrada');

// --- Requisito 5.4: mistura linear
const mid = C.mixRgb({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 0.5);
if (mid.r !== 50 || mid.g !== 100 || mid.b !== 25) fail('mixRgb no ponto médio');
const endA = C.mixRgb({ r: 10, g: 20, b: 30 }, { r: 200, g: 100, b: 0 }, 0);
if (endA.r !== 10 || endA.g !== 20 || endA.b !== 30) fail('mixRgb em t=0');

console.log(fails === 0
  ? `TODAS AS VERIFICAÇÕES PASSARAM (${clipChecked} correções de gamut testadas)`
  : `${fails} falha(s)`);

/* ================= Geometria do triângulo (Requisito 2) ================= */

global.window.AppState = {
  state: { wheelRotation: 0, shape: 'triangle', limit: { enabled: false, svSteps: 0 } },
  getHsv: () => ({ h: 0, s: 100, v: 100 }),
  getHarmonyHues: () => [],
  quantizeLevel: (v) => v,
  subscribe: () => {},
  pushHistory: () => {},
  setHsv: () => {},
  setWheelRotation: () => {}
};
require('./js/wheel.js');
const G = global.window.Wheel.geometry;

let gfails = 0;
const gfail = (msg) => { if (gfails < 10) console.log('FAIL geo ' + msg); gfails++; };

// 2.2: cada vértice entrega matiz puro, preto e branco
const V = G.triVertices();
const svHue = G.baryToSv(G.barycentric(V.hue.x, V.hue.y));
if (Math.abs(svHue.s - 100) > 0.5 || Math.abs(svHue.v - 100) > 0.5) {
  gfail(`vértice do matiz deveria ser S100/V100, obtido S${svHue.s.toFixed(1)}/V${svHue.v.toFixed(1)}`);
}
const svBlack = G.baryToSv(G.barycentric(V.black.x, V.black.y));
if (Math.abs(svBlack.v) > 0.5) gfail(`vértice do preto deveria ser V0, obtido V${svBlack.v.toFixed(1)}`);
const svWhite = G.baryToSv(G.barycentric(V.white.x, V.white.y));
if (Math.abs(svWhite.s) > 0.5 || Math.abs(svWhite.v - 100) > 0.5) {
  gfail(`vértice do branco deveria ser S0/V100, obtido S${svWhite.s.toFixed(1)}/V${svWhite.v.toFixed(1)}`);
}

// Orientação pedida: aresta preto→branco vertical, encostada à esquerda,
// com o vértice do matiz puro apontando para a direita
if (Math.abs(V.black.x - V.white.x) > 0.5) {
  gfail(`aresta preto→branco deveria ser vertical (x ${V.black.x.toFixed(1)} vs ${V.white.x.toFixed(1)})`);
}
if (V.white.y >= V.black.y) gfail('branco deveria estar acima do preto');
if (V.hue.x <= V.black.x) gfail('vértice do matiz deveria estar à direita da aresta preto→branco');
if (Math.abs(V.hue.y - G.CY) > 0.5) gfail('vértice do matiz deveria estar na altura do centro');

// O triângulo continua equilátero depois da rotação
const side = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const s1 = side(V.hue, V.black), s2 = side(V.black, V.white), s3 = side(V.white, V.hue);
if (Math.abs(s1 - s2) > 0.01 || Math.abs(s2 - s3) > 0.01) {
  gfail(`triângulo não é equilátero: ${s1.toFixed(2)}, ${s2.toFixed(2)}, ${s3.toFixed(2)}`);
}

// Todos os vértices cabem dentro do anel
[V.hue, V.black, V.white].forEach((p, i) => {
  const dist = Math.hypot(p.x - G.CX, p.y - G.CY);
  if (dist > G.INNER_R) gfail(`vértice ${i} escapou do anel interno (${dist.toFixed(1)} > ${G.INNER_R})`);
});

// 2.4/2.6: S,V -> ponto -> S,V é estável (marcador cai onde deve)
for (let i = 0; i < 4000; i++) {
  const s = Math.random() * 100;
  const v = Math.random() * 100;
  const p = G.svToPoint(s, v);
  const back = G.baryToSv(G.barycentric(p.x, p.y));
  if (Math.abs(back.v - v) > 0.4) gfail(`V ${v.toFixed(2)} -> ${back.v.toFixed(2)}`);
  if (v > 0.5 && Math.abs(back.s - s) > 0.4) gfail(`S ${s.toFixed(2)} -> ${back.s.toFixed(2)}`);
}

// 2.5: clamp traz qualquer ponto externo para dentro do triângulo
for (let i = 0; i < 3000; i++) {
  const px = Math.random() * 420 - 50;
  const py = Math.random() * 420 - 50;
  const q = G.clampToTriangle(px, py);
  const w = G.barycentric(q.x, q.y);
  if (w.hue < -1e-6 || w.black < -1e-6 || w.white < -1e-6) {
    gfail(`clamp deixou (${px.toFixed(1)},${py.toFixed(1)}) fora do triângulo`);
  }
  // pontos já internos não devem ser movidos
  const w0 = G.barycentric(px, py);
  const inside = w0.hue >= 0 && w0.black >= 0 && w0.white >= 0;
  if (inside && Math.hypot(q.x - px, q.y - py) > 1e-9) {
    gfail('clamp moveu um ponto que já estava dentro');
  }
}

// 1.1: proporção do anel entre 0.6 e 0.85
const ratio = G.INNER_R / G.OUTER_R;
if (ratio < 0.6 || ratio > 0.85) gfail(`proporção do anel ${ratio.toFixed(3)} fora de 0.6–0.85`);

// 1.2: posição angular do marcador de matiz (0° no topo, sentido horário)
const top = G.hueMarkerPos(0, G.OUTER_R);
if (Math.abs(top.x - G.CX) > 0.001 || top.y >= G.CY) gfail('matiz 0° deveria ficar no topo da roda');
const right = G.hueMarkerPos(90, G.OUTER_R);
if (right.x <= G.CX || Math.abs(right.y - G.CY) > 0.001) gfail('matiz 90° deveria ficar à direita');

console.log(gfails === 0 ? 'GEOMETRIA OK' : `${gfails} falha(s) de geometria`);

/* ================= Limitação de cor e rampa B/W ================= */

// Recarrega o AppState real (o stub anterior era só para a geometria)
delete global.window.AppState;
delete require.cache[require.resolve('./js/state.js')];
require('./js/state.js');
const St = global.window.AppState;

let lfails = 0;
const lfail = (msg) => { if (lfails < 10) console.log('FAIL limite ' + msg); lfails++; };

// quantizeHue: todo matiz cai num setor válido e o setor é o mais próximo
[6, 8, 12, 16, 24, 36].forEach((steps) => {
  const size = 360 / steps;
  for (let i = 0; i < 800; i++) {
    const h = Math.random() * 360;
    const q = St.quantizeHue(h, steps);

    // é múltiplo exato do tamanho do setor
    const k = q / size;
    if (Math.abs(k - Math.round(k)) > 1e-9) lfail(`${steps} passos: ${q} não é setor válido`);

    // não existe setor mais próximo que o escolhido
    const dist = Math.abs(((q - h + 540) % 360) - 180);
    if (dist > size / 2 + 1e-9) lfail(`${steps} passos: ${h.toFixed(2)} -> ${q} distante ${dist.toFixed(2)}`);
  }
});

// quantizeLevel: níveis igualmente espaçados, extremos preservados
[3, 4, 5, 6, 8, 10].forEach((steps) => {
  if (St.quantizeLevel(0, steps) !== 0) lfail(`${steps} níveis: 0 deveria continuar 0`);
  if (Math.abs(St.quantizeLevel(100, steps) - 100) > 1e-9) lfail(`${steps} níveis: 100 deveria continuar 100`);

  for (let i = 0; i < 500; i++) {
    const v = Math.random() * 100;
    const q = St.quantizeLevel(v, steps);
    const idx = (q / 100) * (steps - 1);
    if (Math.abs(idx - Math.round(idx)) > 1e-9) lfail(`${steps} níveis: ${q} fora da grade`);
    if (Math.abs(q - v) > (100 / (steps - 1)) / 2 + 1e-9) lfail(`${steps} níveis: salto grande de ${v.toFixed(2)}`);
  }
});

// Com o limite ativo, qualquer cor definida já sai quantizada
St.setLimit({ enabled: true, hueSteps: 12, svSteps: 5 });
for (let i = 0; i < 500; i++) {
  St.setHsv({ h: Math.random() * 360, s: Math.random() * 100, v: Math.random() * 100 });
  const hsv = St.getHsv();
  if (Math.abs(hsv.h / 30 - Math.round(hsv.h / 30)) > 1e-9) lfail(`setHsv deixou matiz ${hsv.h} fora da grade`);
  const si = (hsv.s / 100) * 4, vi = (hsv.v / 100) * 4;
  if (Math.abs(si - Math.round(si)) > 1e-9) lfail(`setHsv deixou S ${hsv.s} fora da grade`);
  if (Math.abs(vi - Math.round(vi)) > 1e-9) lfail(`setHsv deixou V ${hsv.v} fora da grade`);
}

// getLimitedPalette lista exatamente os matizes disponíveis, sem repetir
const pal = St.getLimitedPalette();
if (!pal || pal.length !== 12) lfail('paleta limitada deveria ter 12 matizes');
if (new Set(pal).size !== pal.length) lfail('paleta limitada tem matiz repetido');
pal.forEach((h) => {
  if (St.quantizeHue(h, 12) !== h) lfail(`matiz ${h} da paleta não é um setor`);
});

St.setLimit({ enabled: false, svSteps: 0 });
if (St.getLimitedPalette() !== null) lfail('sem limite, getLimitedPalette deveria retornar null');

// Rampa B/W: N é a QUANTIDADE DE AMOSTRAS, então a régua tem N tons, do
// branco puro (nível 100) até o nível 100/N, sem repetição. O preto puro não
// faz parte da régua — quem quer preto digita 0 no campo K. N é sempre
// divisor de 100, logo o passo é inteiro e todo nível é múltiplo exato dele.
St.BW_STEP_OPTIONS.forEach((n) => {
  St.setBwSteps(n);
  if (St.state.bwSteps !== n) lfail(`setBwSteps(${n}) deveria aceitar o divisor`);

  const ramp = St.getBwRamp();
  const passo = 100 / n;

  if (ramp.length !== n) lfail(`rampa de ${n} amostras deveria ter ${n} tons, tem ${ramp.length}`);
  if (ramp[0].r !== 255) lfail(`rampa de ${n} deveria começar no branco`);

  // A última amostra é o menor degrau da régua, o nível 100/N
  const ultimoTom = Math.round(passo / 100 * 255);
  if (ramp[n - 1].r !== ultimoTom) {
    lfail(`rampa de ${n} deveria terminar em ${ultimoTom} (nível ${passo}), veio ${ramp[n - 1].r}`);
  }

  for (let i = 1; i < n; i++) {
    if (ramp[i].r >= ramp[i - 1].r) lfail(`rampa de ${n} não é monotônica em ${i}`);
  }
  ramp.forEach((t, i) => {
    if (t.r !== t.g || t.g !== t.b) lfail('tom da rampa não é neutro');
    if (t.level !== 100 - i * passo) lfail(`nível ${t.level} deveria ser ${100 - i * passo}`);
  });
});

// Contagem da régua: encaixe nos divisores de 100
St.setBwSteps(1);
if (St.state.bwSteps !== St.BW_MIN) lfail('bwSteps deveria encaixar no mínimo');
St.setBwSteps(999);
if (St.state.bwSteps !== St.BW_MAX) lfail('bwSteps deveria encaixar no máximo');
St.setBwSteps(9);
if (St.state.bwSteps !== 10) lfail('9 deveria encaixar em 10, o divisor mais próximo');
St.setBwSteps(10);

// Histórico não deve guardar duplicata consecutiva
St.setHsv({ h: 10, s: 50, v: 50 }, { commit: true });
const before = St.state.history.length;
St.setHsv({ h: 10, s: 50, v: 50 }, { commit: true });
if (St.state.history.length !== before) lfail('histórico aceitou duplicata consecutiva');

console.log(lfails === 0 ? 'LIMITE E RAMPA OK' : `${lfails} falha(s) de limite/rampa`);

/* ================= Rotação da roda e seletor quadrado ================= */

// wheel.js foi carregado com o stub; recarrega contra o AppState real
delete global.window.Wheel;
delete require.cache[require.resolve('./js/wheel.js')];
require('./js/wheel.js');
const G2 = global.window.Wheel.geometry;

let rfails = 0;
const rfail = (msg) => { if (rfails < 10) console.log('FAIL forma/giro ' + msg); rfails++; };

/* --- Rotação --- */

// Normalização para 0-360 e snap correto
[[0, 0, 0], [15, 0, 15], [-15, 0, 345], [370, 0, 10], [7, 15, 0], [8, 15, 15],
 [100, 60, 120], [359, 15, 0], [-400, 0, 320]].forEach(([input, snap, expected]) => {
  St.setWheelRotation(input, snap);
  if (Math.abs(St.state.wheelRotation - expected) > 1e-9) {
    rfail(`rotação ${input} snap ${snap} deveria dar ${expected}, deu ${St.state.wheelRotation}`);
  }
});

// Com snap de 15 e de 60 todo resultado é múltiplo exato
for (let i = 0; i < 600; i++) {
  const deg = Math.random() * 1440 - 720;
  St.setWheelRotation(deg, 15);
  if (St.state.wheelRotation % 15 !== 0) rfail(`snap 15 falhou em ${deg.toFixed(2)}`);
  St.setWheelRotation(deg, 60);
  if (St.state.wheelRotation % 60 !== 0) rfail(`snap 60 falhou em ${deg.toFixed(2)}`);
}

// A rotação é só apresentação: girar a roda não muda a cor
St.setWheelRotation(0);
St.setHsv({ h: 137, s: 62, v: 48 }, { commit: true });
const beforeRot = St.getHex();
St.setWheelRotation(215);
if (St.getHex() !== beforeRot) rfail('girar a roda alterou a cor');

// O marcador acompanha a rotação: matiz H com giro R cai onde
// o matiz H+R cairia sem giro
St.setWheelRotation(0);
for (let i = 0; i < 300; i++) {
  const hue = Math.random() * 360;
  const rot = Math.random() * 360;
  St.setWheelRotation(0);
  const ref = G2.hueMarkerPos((hue + rot) % 360, G2.OUTER_R);
  St.setWheelRotation(rot);
  const got = G2.hueMarkerPos(hue, G2.OUTER_R);
  if (Math.hypot(ref.x - got.x, ref.y - got.y) > 0.01) {
    rfail(`marcador com giro ${rot.toFixed(1)}° não coincidiu`);
  }
}

// Ida e volta tela → matiz: descontar a rotação recupera o matiz original
for (let i = 0; i < 300; i++) {
  const hue = Math.random() * 360;
  const rot = Math.floor(Math.random() * 24) * 15;
  St.setWheelRotation(rot);
  const p = G2.hueMarkerPos(hue, G2.OUTER_R);
  const recovered = ((G2.screenAngle(p) - rot) % 360 + 360) % 360;
  const diff = Math.abs(((recovered - hue + 540) % 360) - 180);
  if (diff > 0.01) rfail(`matiz ${hue.toFixed(2)} não recuperado com giro ${rot} (deu ${recovered.toFixed(2)})`);
}
St.setWheelRotation(0);

/* --- Seletor quadrado --- */

const sq = G2.squareRect();

// Cantos entregam os extremos esperados
const corners = [
  ['inferior esquerdo', sq.x0 + 0.5, sq.y0 + sq.size - 0.5, 0, 0],
  ['superior esquerdo', sq.x0 + 0.5, sq.y0 + 0.5, 0, 100],
  ['superior direito', sq.x0 + sq.size - 0.5, sq.y0 + 0.5, 100, 100],
  ['inferior direito', sq.x0 + sq.size - 0.5, sq.y0 + sq.size - 0.5, 100, 0]
];
corners.forEach(([name, x, y, es, ev]) => {
  const got = G2.squarePointToSv(x, y);
  if (Math.abs(got.s - es) > 1 || Math.abs(got.v - ev) > 1) {
    rfail(`canto ${name} deveria ser S${es}/V${ev}, deu S${got.s.toFixed(1)}/V${got.v.toFixed(1)}`);
  }
});

// S,V -> ponto -> S,V é exato no quadrado
for (let i = 0; i < 3000; i++) {
  const s = Math.random() * 100, v = Math.random() * 100;
  const p = G2.squareSvToPoint(s, v);
  const back = G2.squarePointToSv(p.x, p.y);
  if (Math.abs(back.s - s) > 0.01 || Math.abs(back.v - v) > 0.01) {
    rfail(`quadrado S${s.toFixed(2)}/V${v.toFixed(2)} -> S${back.s.toFixed(2)}/V${back.v.toFixed(2)}`);
  }
}

// Clamp traz qualquer ponto externo para dentro e não move os internos
for (let i = 0; i < 3000; i++) {
  const px = Math.random() * 420 - 50, py = Math.random() * 420 - 50;
  const q = G2.clampToSquare(px, py);
  if (!G2.insideSquare(q.x, q.y)) rfail(`clamp do quadrado deixou (${px.toFixed(1)},${py.toFixed(1)}) fora`);
  if (G2.insideSquare(px, py) && Math.hypot(q.x - px, q.y - py) > 1e-9) {
    rfail('clamp do quadrado moveu ponto que já estava dentro');
  }
}

// O quadrado cabe dentro do anel interno
[[sq.x0, sq.y0], [sq.x0 + sq.size, sq.y0], [sq.x0, sq.y0 + sq.size],
 [sq.x0 + sq.size, sq.y0 + sq.size]].forEach(([x, y], i) => {
  const dist = Math.hypot(x - G2.CX, y - G2.CY);
  if (dist > G2.INNER_R) rfail(`canto ${i} do quadrado escapou do anel (${dist.toFixed(1)})`);
});

// As duas formas expõem a mesma interface e cobrem toda a faixa de S/V
['triangle', 'square'].forEach((name) => {
  const sh = G2.SHAPES[name];
  ['pointToSv', 'svToPoint', 'inside', 'clamp', 'trace', 'bounds'].forEach((fn) => {
    if (typeof sh[fn] !== 'function') rfail(`forma ${name} sem ${fn}`);
  });
  [[0, 0], [0, 100], [100, 100], [100, 0], [50, 50]].forEach(([s, v]) => {
    const p = sh.svToPoint(s, v);
    const back = sh.pointToSv(p.x, p.y);
    if (Math.abs(back.v - v) > 0.5) rfail(`forma ${name}: V ${v} -> ${back.v.toFixed(2)}`);
    if (v > 0.5 && Math.abs(back.s - s) > 0.5) rfail(`forma ${name}: S ${s} -> ${back.s.toFixed(2)}`);
  });
});

// setShape aceita só valores conhecidos
St.setShape('square');
if (St.state.shape !== 'square') rfail('setShape não aplicou square');
St.setShape('hexagono');
if (St.state.shape !== 'square') rfail('setShape aceitou forma inválida');
St.setShape('triangle');

console.log(rfails === 0 ? 'ROTAÇÃO E FORMAS OK' : `${rfails} falha(s) de rotação/forma`);

/* ================= Travamento de luminosidade ================= */

let vfails = 0;
const vfail = (msg) => { if (vfails < 10) console.log('FAIL lumlock ' + msg); vfails++; };

St.setLimit({ enabled: false, svSteps: 0 });
St.setWheelRotation(0);
St.setLuminosityLock(false);

// Desligado, o valor pedido é respeitado sem ajuste
St.setHsv({ h: 200, s: 70, v: 55 });
if (Math.abs(St.getHsv().v - 55) > 1e-9) vfail('sem travamento o V deveria ser respeitado');

// Ligado, mudar matiz e saturação preserva a luminosidade
St.setHsv({ h: 30, s: 80, v: 60 });
St.setLuminosityLock(true);
const lockedL = St.state.lockedL;
if (lockedL === null) vfail('lockedL deveria ser capturado ao ligar');

for (let i = 0; i < 400; i++) {
  const h = Math.random() * 360;
  const s = Math.random() * 100;
  St.setHsv({ h, s, v: Math.random() * 100 });
  const got = St.luminosityOf(St.getHsv());

  // Alguns pares H/S não alcançam a luminosidade alvo nem com V=100;
  // nesses casos o valor fica no extremo, que é o comportamento correto
  const maxL = St.luminosityOf({ h, s, v: 100 });
  const minL = St.luminosityOf({ h, s, v: 0 });
  const reachable = lockedL <= maxL && lockedL >= minL;

  if (reachable && Math.abs(got - lockedL) > 0.5) {
    vfail(`H${h.toFixed(0)} S${s.toFixed(0)}: L ${got.toFixed(2)} deveria ser ${lockedL.toFixed(2)}`);
  }
  if (!reachable) {
    const v = St.getHsv().v;
    if (v !== 0 && v !== 100) vfail(`alvo inalcançável deveria parar num extremo, V=${v.toFixed(2)}`);
  }
}

// relock redefine a referência em vez de lutar contra ela
St.setHsv({ h: 120, s: 60, v: 25 }, { relock: true });
const after = St.getHsv();
if (Math.abs(after.v - 25) > 0.5) vfail(`relock deveria honrar V=25, deu ${after.v.toFixed(2)}`);
if (Math.abs(St.state.lockedL - St.luminosityOf({ h: 120, s: 60, v: 25 })) > 0.01) {
  vfail('relock deveria atualizar lockedL');
}

// Desligar limpa a referência
St.setLuminosityLock(false);
if (St.state.lockedL !== null) vfail('desligar deveria limpar lockedL');

// Travamento e limite de cor convivem: o resultado continua na grade
St.setHsv({ h: 40, s: 70, v: 50 });
St.setLuminosityLock(true);
St.setLimit({ enabled: true, hueSteps: 12, svSteps: 5 });
for (let i = 0; i < 200; i++) {
  St.setHsv({ h: Math.random() * 360, s: Math.random() * 100, v: Math.random() * 100 });
  const hsv = St.getHsv();
  const vi = (hsv.v / 100) * 4;
  if (Math.abs(vi - Math.round(vi)) > 1e-9) vfail(`com travamento + limite, V ${hsv.v} saiu da grade`);
}
St.setLimit({ enabled: false, svSteps: 0 });
St.setLuminosityLock(false);

console.log(vfails === 0 ? 'TRAVAMENTO DE LUMINOSIDADE OK' : `${vfails} falha(s) de travamento`);

/* ================= Disco e máscara de gamut ================= */

let mfails = 0;
const mfail = (msg) => { if (mfails < 12) console.log('FAIL gamut ' + msg); mfails++; };

St.setLimit({ enabled: false, svSteps: 0 });
St.setLuminosityLock(false);
St.setWheelRotation(0);

/* --- Disco: matiz angular, saturação radial --- */

// Centro do disco é saturação 0; borda é saturação 100
const centerHs = G2.discPointToHs(G2.CX, G2.CY);
if (Math.abs(centerHs.s) > 0.5) mfail(`centro do disco deveria ser S0, deu S${centerHs.s.toFixed(1)}`);
const edgeHs = G2.discPointToHs(G2.CX, G2.CY - G2.DISC_R);
if (Math.abs(edgeHs.s - 100) > 0.5) mfail(`borda deveria ser S100, deu S${edgeHs.s.toFixed(1)}`);
if (Math.abs(edgeHs.h) > 0.5 && Math.abs(edgeHs.h - 360) > 0.5) {
  mfail(`topo do disco deveria ser matiz 0, deu ${edgeHs.h.toFixed(1)}`);
}

// O disco alinha com o anel: matiz H no disco cai no mesmo ângulo do anel
for (let i = 0; i < 200; i++) {
  const hue = Math.random() * 360;
  const onDisc = G2.discHsToPoint(hue, 100);
  const onRing = G2.hueMarkerPos(hue, G2.DISC_R);
  if (Math.hypot(onDisc.x - onRing.x, onDisc.y - onRing.y) > 0.5) {
    mfail(`matiz ${hue.toFixed(1)} desalinhado entre disco e anel`);
  }
}

// Ida e volta H,S -> ponto -> H,S
for (let i = 0; i < 3000; i++) {
  const h = Math.random() * 360, s = 2 + Math.random() * 98;
  const p = G2.discHsToPoint(h, s);
  const back = G2.discPointToHs(p.x, p.y);
  if (Math.abs(back.s - s) > 0.5) mfail(`disco S ${s.toFixed(2)} -> ${back.s.toFixed(2)}`);
  const dh = Math.abs(((back.h - h + 540) % 360) - 180);
  if (dh > 0.5) mfail(`disco H ${h.toFixed(2)} -> ${back.h.toFixed(2)}`);
}

// O alinhamento sobrevive à rotação da roda
[0, 45, 137, 270].forEach((rot) => {
  St.setWheelRotation(rot);
  for (let i = 0; i < 100; i++) {
    const h = Math.random() * 360, s = 20 + Math.random() * 80;
    const p = G2.discHsToPoint(h, s);
    const back = G2.discPointToHs(p.x, p.y);
    const dh = Math.abs(((back.h - h + 540) % 360) - 180);
    if (dh > 0.5) mfail(`com giro ${rot}°, matiz ${h.toFixed(1)} -> ${back.h.toFixed(1)}`);
  }
});
St.setWheelRotation(0);

// Clamp do disco
for (let i = 0; i < 2000; i++) {
  const px = Math.random() * 420 - 50, py = Math.random() * 420 - 50;
  const q = G2.clampToDisc(px, py);
  if (!G2.insideDisc(q.x, q.y)) mfail('clamp do disco deixou ponto fora');
  if (G2.insideDisc(px, py) && Math.hypot(q.x - px, q.y - py) > 1e-9) {
    mfail('clamp do disco moveu ponto interno');
  }
}

/* --- Máscara: contenção e projeção --- */

St.setGamut({ enabled: true, cx: 0.15, cy: -0.1, rx: 0.55, ry: 0.3, angle: -25 });

// O centro da máscara está sempre dentro dela
const centerOfMask = St.discToHs(St.state.gamut.cx, St.state.gamut.cy);
if (!St.insideMask(centerOfMask.h, centerOfMask.s)) mfail('centro da máscara caiu fora dela');

// clampToMask sempre entrega um ponto dentro, e não move os que já estão
for (let i = 0; i < 4000; i++) {
  const h = Math.random() * 360, s = Math.random() * 100;
  const q = St.clampToMask(h, s);
  if (!St.insideMask(q.h, q.s)) {
    mfail(`clampToMask deixou H${h.toFixed(1)} S${s.toFixed(1)} fora da máscara`);
  }
  if (St.insideMask(h, s)) {
    const dh = Math.abs(((q.h - h + 540) % 360) - 180);
    if (dh > 1e-6 || Math.abs(q.s - s) > 1e-6) mfail('clampToMask moveu ponto que já estava dentro');
  }
}

// Com a máscara ativa, qualquer cor definida cai dentro dela
for (let i = 0; i < 500; i++) {
  St.setHsv({ h: Math.random() * 360, s: Math.random() * 100, v: 50 });
  const hsv = St.getHsv();
  if (!St.insideMask(hsv.h, hsv.s)) {
    mfail(`setHsv deixou H${hsv.h.toFixed(1)} S${hsv.s.toFixed(1)} fora da máscara`);
  }
}

// A máscara não interfere no valor
St.setHsv({ h: 200, s: 90, v: 33 });
if (Math.abs(St.getHsv().v - 33) > 1e-9) mfail('máscara alterou o valor');

// Disco inteiro não restringe nada
St.setGamut({ cx: 0, cy: 0, rx: 1, ry: 1, angle: 0 });
for (let i = 0; i < 300; i++) {
  const h = Math.random() * 360, s = Math.random() * 100;
  if (!St.insideMask(h, s)) mfail(`máscara cheia rejeitou H${h.toFixed(1)} S${s.toFixed(1)}`);
}

/* --- Gamut lock --- */

St.setGamut({ cx: 0.2, cy: 0.1, rx: 0.5, ry: 0.3, angle: 10 });
const snapshot = { ...St.state.gamut };
St.setGamut({ locked: true });

// Travada, a geometria não muda
St.setGamut({ cx: -0.9, cy: 0.9, rx: 1.2, ry: 1.2, angle: 90 });
['cx', 'cy', 'rx', 'ry', 'angle'].forEach((k) => {
  if (St.state.gamut[k] !== snapshot[k]) {
    mfail(`gamut lock permitiu alterar ${k} (${snapshot[k]} -> ${St.state.gamut[k]})`);
  }
});

// Travar sai do modo de edição
St.setGamut({ editing: true });
if (St.state.gamut.editing) mfail('máscara travada não deveria entrar em edição');

// Destravar volta a permitir edição
St.setGamut({ locked: false });
St.setGamut({ rx: 0.7 });
if (Math.abs(St.state.gamut.rx - 0.7) > 1e-9) mfail('destravar deveria permitir alterar rx');

// Raios e centro ficam dentro de faixas seguras
St.setGamut({ rx: 99, ry: -5, cx: 50, cy: -50 });
const g = St.state.gamut;
if (g.rx > 1.4 || g.ry < 0.05 || Math.abs(g.cx) > 1.2 || Math.abs(g.cy) > 1.2) {
  mfail(`geometria da máscara não foi limitada: ${JSON.stringify(g)}`);
}

St.setGamut({ enabled: false });
St.resetGamut();

/* --- As três formas compartilham a interface --- */

['triangle', 'square', 'disc'].forEach((name) => {
  const sh = G2.SHAPES[name];
  ['pointToHsv', 'hsvToPoint', 'inside', 'clamp', 'trace', 'bounds', 'drivenBy'].forEach((fn) => {
    if (sh[fn] === undefined) mfail(`forma ${name} sem ${fn}`);
  });

  // Round-trip pelo canal que a forma controla
  const base = { h: 210, s: 65, v: 45 };
  const p = sh.hsvToPoint(base);
  const back = sh.pointToHsv(p.x, p.y, base);
  if (sh.drivenBy === 'h') {
    if (Math.abs(back.s - base.s) > 0.6 || Math.abs(back.v - base.v) > 0.6) {
      mfail(`forma ${name} não recuperou S/V`);
    }
    if (back.h !== base.h) mfail(`forma ${name} não deveria mexer no matiz`);
  } else {
    const dh = Math.abs(((back.h - base.h + 540) % 360) - 180);
    if (dh > 0.6 || Math.abs(back.s - base.s) > 0.6) mfail(`forma ${name} não recuperou H/S`);
    if (back.v !== base.v) mfail(`forma ${name} não deveria mexer no valor`);
  }
});

console.log(mfails === 0 ? 'DISCO E MÁSCARA OK' : `${mfails} falha(s) de disco/máscara`);

/* ================= Conferência de valores (escala de cinza) ================= */

let cfails = 0;
const cfail = (msg) => { if (cfails < 12) console.log('FAIL cinza ' + msg); cfails++; };

// O resultado é sempre neutro
for (let i = 0; i < 3000; i++) {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  const gray = C.toGray(r, g, b);
  if (gray.r !== gray.g || gray.g !== gray.b) {
    cfail(`${r},${g},${b} -> ${gray.r},${gray.g},${gray.b} não é neutro`);
  }

  // A luminosidade percebida é preservada
  const L0 = C.rgbToLab(r, g, b).L;
  const L1 = C.rgbToLab(gray.r, gray.g, gray.b).L;
  if (Math.abs(L0 - L1) > 1) cfail(`L ${L0.toFixed(2)} -> ${L1.toFixed(2)}`);
}

// Idempotente: converter um cinza não muda nada
for (let i = 0; i < 500; i++) {
  const once = C.toGray(Math.random() * 255, Math.random() * 255, Math.random() * 255);
  const twice = C.toGray(once.r, once.g, once.b);
  if (Math.abs(twice.r - once.r) > 1) cfail(`não idempotente: ${once.r} -> ${twice.r}`);
}

// Monotônico em relação à luminosidade
const samples = [];
for (let i = 0; i < 400; i++) {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  samples.push({ L: C.rgbToLab(r, g, b).L, gray: C.toGray(r, g, b).r });
}
samples.sort((a, b) => a.L - b.L);
for (let i = 1; i < samples.length; i++) {
  if (samples[i].gray < samples[i - 1].gray - 1) {
    cfail(`não monotônico: L ${samples[i].L.toFixed(1)} deu cinza menor`);
  }
}

// Extremos
if (C.toGray(0, 0, 0).r !== 0) cfail('preto deveria virar 0');
if (C.toGray(255, 255, 255).r !== 255) cfail('branco deveria virar 255');

// Cores de mesma luminosidade e matizes opostos dão o mesmo cinza;
// amarelo e azul saturados dão cinzas bem diferentes (o ponto do value check)
const yellowGray = C.toGray(255, 255, 0).r;
const blueGray = C.toGray(0, 0, 255).r;
if (yellowGray - blueGray < 100) {
  cfail(`amarelo (${yellowGray}) e azul (${blueGray}) deveriam diferir muito em valor`);
}

// A conferência é só exibição: não altera a cor selecionada nem o histórico
St.setValueCheck(false);
St.setHsv({ h: 275, s: 84, v: 61 }, { commit: true });
const hexBefore = St.getHex();
const histBefore = St.state.history.length;

St.setValueCheck(true);
if (St.getHex() !== hexBefore) cfail('ligar a conferência alterou a cor selecionada');
if (St.state.history.length !== histBefore) cfail('ligar a conferência mexeu no histórico');

// display() devolve cinza enquanto ativa, e a cor original quando desligada
const real = St.getRgb();
const shown = St.display(real);
if (shown.r !== shown.g || shown.g !== shown.b) cfail('display deveria devolver cinza quando ativa');

St.setValueCheck(false);
const shownOff = St.display(real);
if (shownOff.r !== real.r || shownOff.g !== real.g || shownOff.b !== real.b) {
  cfail('display deveria devolver a cor original quando desligada');
}
if (St.getHex() !== hexBefore) cfail('desligar a conferência alterou a cor selecionada');

console.log(cfails === 0 ? 'CONFERÊNCIA DE VALORES OK' : `${cfails} falha(s) de cinza`);

/* ================= Formatos de máscara ================= */

let kfails = 0;
const kfail = (msg) => { if (kfails < 12) console.log('FAIL formato ' + msg); kfails++; };

if (St.MASK_KINDS.length !== 6) kfail(`esperados 6 formatos, há ${St.MASK_KINDS.length}`);

// Cada formato: contenção, clamp e não mover pontos internos
St.MASK_KINDS.forEach((kind) => {
  // O centro do espaço unitário pertence a todo formato menos a gravata,
  // cujo istmo é estreito mas ainda contém a origem
  if (!St.unitInside(kind, 0, 0)) kfail(`${kind}: origem deveria estar dentro`);

  // Pontos muito distantes estão fora
  if (St.unitInside(kind, 5, 5)) kfail(`${kind}: (5,5) deveria estar fora`);

  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 6 - 3;
    const y = Math.random() * 6 - 3;
    const q = St.unitClamp(kind, x, y);

    if (!St.unitInside(kind, q.x, q.y)) {
      kfail(`${kind}: clamp de (${x.toFixed(2)},${y.toFixed(2)}) ficou fora`);
    }
    if (St.unitInside(kind, x, y) && Math.hypot(q.x - x, q.y - y) > 1e-9) {
      kfail(`${kind}: clamp moveu ponto interno`);
    }

    // O clamp não é pior que a alternativa trivial de ir para a origem,
    // que é sempre válida. Distância à origem não serve como métrica aqui:
    // em formas não convexas o ponto mais próximo pode estar mais longe do centro.
    if (!St.unitInside(kind, x, y)) {
      const dClamp = Math.hypot(q.x - x, q.y - y);
      const dOrigin = Math.hypot(x, y);
      if (dClamp > dOrigin + 1e-6) {
        kfail(`${kind}: clamp de (${x.toFixed(2)},${y.toFixed(2)}) foi mais longe que a origem`);
      }
    }
  }
});

// Com cada formato ativo, toda cor definida cai dentro da máscara
St.setLimit({ enabled: false, svSteps: 0 });
St.setLuminosityLock(false);

St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ enabled: true, locked: false, kind, cx: 0.1, cy: -0.05, rx: 0.6, ry: 0.4, angle: 20 });
  if (St.state.gamut.kind !== kind) { kfail(`não aplicou o formato ${kind}`); return; }

  for (let i = 0; i < 400; i++) {
    St.setHsv({ h: Math.random() * 360, s: Math.random() * 100, v: 50 });
    const hsv = St.getHsv();
    if (!St.insideMask(hsv.h, hsv.s)) {
      kfail(`${kind}: setHsv deixou H${hsv.h.toFixed(1)} S${hsv.s.toFixed(1)} fora`);
    }
  }
});

// Formato inválido é ignorado, mantendo o anterior
St.setGamut({ kind: 'hexagon' });
St.setGamut({ kind: 'octogono' });
if (St.state.gamut.kind !== 'hexagon') kfail('formato inválido não deveria ser aceito');

// O contorno acompanha o formato
St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ kind });
  const outline = St.maskOutline();
  const expected = kind === 'ellipse' ? 'ellipse' : kind === 'dual' ? 'circles' : 'polygon';
  if (outline.type !== expected) kfail(`${kind}: contorno deveria ser ${expected}, veio ${outline.type}`);
  if (outline.type === 'polygon' && outline.points.length < 3) kfail(`${kind}: polígono com pontos insuficientes`);
  if (outline.type === 'circles' && outline.circles.length !== 2) kfail('dual deveria ter 2 lobos');
});

/* --- mover a máscara --- */

St.setGamut({ enabled: true, locked: false, kind: 'ellipse', cx: 0, cy: 0, rx: 0.5, ry: 0.35, angle: 0 });

// nudge desloca exatamente o pedido, dentro dos limites
St.nudgeGamut(0.2, -0.1);
if (Math.abs(St.state.gamut.cx - 0.2) > 1e-9 || Math.abs(St.state.gamut.cy + 0.1) > 1e-9) {
  kfail(`nudge não deslocou corretamente: ${St.state.gamut.cx}, ${St.state.gamut.cy}`);
}

// O centro nunca sai do disco, por mais que se empurre
for (let i = 0; i < 60; i++) St.nudgeGamut(0.1, 0.1);
if (Math.hypot(St.state.gamut.cx, St.state.gamut.cy) > 1 + 1e-9) {
  kfail(`nudge repetido tirou o centro do disco: ${Math.hypot(St.state.gamut.cx, St.state.gamut.cy).toFixed(3)}`);
}

// Mover a máscara mantém a cor atual dentro dela, em todos os formatos
St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ enabled: true, kind, cx: 0, cy: 0, rx: 0.5, ry: 0.35, angle: 0 });
  St.setHsv({ h: 10, s: 40, v: 50 });

  for (let i = 0; i < 40; i++) {
    St.nudgeGamut(0.05, 0.02);
    const hsv = St.getHsv();
    if (!St.insideMask(hsv.h, hsv.s)) {
      kfail(`${kind}: mover a máscara deixou a cor atual fora dela`);
    }
    if (hsv.s > 100 + 1e-9) kfail(`${kind}: saturação passou de 100`);
  }
});

// Travada, nem o nudge nem a troca de formato passam
St.setGamut({ locked: true });
const lockedSnapshot = { ...St.state.gamut };
St.nudgeGamut(0.5, 0.5);
St.setGamut({ kind: 'triangle' });
['cx', 'cy', 'kind'].forEach((k) => {
  if (St.state.gamut[k] !== lockedSnapshot[k]) kfail(`gamut lock permitiu alterar ${k}`);
});

St.setGamut({ locked: false, enabled: false });
St.resetGamut();

console.log(kfails === 0 ? 'FORMATOS DE MÁSCARA OK' : `${kfails} falha(s) de formato`);

/* ================= Alinhamento entre máscara desenhada e efetiva ================= */

let afails = 0;
const afail = (msg) => { if (afails < 10) console.log('FAIL alinhamento ' + msg); afails++; };

St.setWheelRotation(0);
St.setLimit({ enabled: false, svSteps: 0 });
St.setLuminosityLock(false);

// Matiz 0 fica no topo do disco, igual ao anel
const maskTop = St.hsToDisc(0, 100);
if (Math.abs(maskTop.u) > 1e-9 || maskTop.v >= 0) {
  afail(`matiz 0 deveria ficar no topo, deu (${maskTop.u.toFixed(3)},${maskTop.v.toFixed(3)})`);
}
const maskRight = St.hsToDisc(90, 100);
if (maskRight.u <= 0 || Math.abs(maskRight.v) > 1e-9) {
  afail(`matiz 90 deveria ficar à direita, deu (${maskRight.u.toFixed(3)},${maskRight.v.toFixed(3)})`);
}

// Ida e volta entre matiz/saturação e coordenadas do disco
for (let i = 0; i < 2000; i++) {
  const h = Math.random() * 360, s = 1 + Math.random() * 99;
  const d = St.hsToDisc(h, s);
  const back = St.discToHs(d.u, d.v);
  const dh = Math.abs(((back.h - h + 540) % 360) - 180);
  if (dh > 1e-6 || Math.abs(back.s - s) > 1e-6) {
    afail(`hsToDisc/discToHs não fecham: H${h.toFixed(2)} S${s.toFixed(2)} -> H${back.h.toFixed(2)} S${back.s.toFixed(2)}`);
  }
}

/**
 * O ponto crítico: o contorno desenhado tem de coincidir com a região que
 * de fato restringe. Para cada formato, todo ponto do contorno precisa
 * estar na borda da máscara — dentro, mas não muito adentro.
 */
St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ enabled: true, locked: false, kind, cx: 0.12, cy: -0.08, rx: 0.5, ry: 0.34, angle: 35 });
  const outline = St.maskOutline();

  if (outline.type === 'polygon') {
    outline.points.forEach((p, i) => {
      const hs = St.discToHs(p.u, p.v);
      // O vértice pertence à máscara (com folga numérica)
      const n = St.discToUnit(p.u, p.v);
      if (!St.unitInside(kind, n.x, n.y)) {
        afail(`${kind}: vértice ${i} do contorno não pertence à máscara`);
      }
      // Um passo para fora do centro já sai da máscara: confirma que é borda
      const out = St.discToUnit(
        p.u + (p.u - St.state.gamut.cx) * 0.15,
        p.v + (p.v - St.state.gamut.cy) * 0.15
      );
      if (St.unitInside(kind, out.x, out.y)) {
        afail(`${kind}: contorno ${i} não está na borda da máscara`);
      }
      if (hs.s > 100 + 1e-9) afail(`${kind}: contorno com saturação acima de 100`);
    });
  }

  if (outline.type === 'circles') {
    outline.circles.forEach((circle, i) => {
      const n = St.discToUnit(circle.center.u, circle.center.v);
      if (!St.unitInside(kind, n.x, n.y)) {
        afail(`${kind}: centro do lobo ${i} não pertence à máscara`);
      }
    });
  }
});

// Cada âncora pertence de fato à máscara, em todos os formatos
St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ kind });
  St.maskAnchorsUnit(kind).forEach((a, i) => {
    if (!St.unitInside(kind, a.x, a.y)) afail(`${kind}: âncora ${i} está fora da máscara`);
  });
});

// A máscara nunca fica sem região alcançável, por mais que se empurre
St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ enabled: true, kind, cx: 0, cy: 0, rx: 0.4, ry: 0.3, angle: 0 });
  for (let i = 0; i < 40; i++) {
    St.nudgeGamut(0.12, 0.09);
    if (!St.hasReachableAnchor()) afail(`${kind}: máscara ficou sem região alcançável`);
    const hsv = St.getHsv();
    if (!St.insideMask(hsv.h, hsv.s)) afail(`${kind}: cor atual saiu da máscara ao mover`);
  }
});

St.setGamut({ enabled: false });
St.resetGamut();

console.log(afails === 0 ? 'ALINHAMENTO DA MÁSCARA OK' : `${afails} falha(s) de alinhamento`);

/* ================= Edição dos esquemas de harmonia ================= */

let hfails = 0;
const hfail = (msg) => { if (hfails < 12) console.log('FAIL harmonia ' + msg); hfails++; };

St.setGamut({ enabled: false });
St.setLimit({ enabled: false, svSteps: 0 });
St.setLuminosityLock(false);
St.setWheelRotation(0);

// Sem edição, os offsets são os canônicos do esquema
St.setScheme('split');
const canonical = St.getScheme().offsets.slice();
if (JSON.stringify(St.getHarmonyOffsets()) !== JSON.stringify(canonical)) {
  hfail('offsets iniciais deveriam ser os canônicos');
}
if (St.isHarmonyEdited()) hfail('esquema recém-selecionado não deveria contar como editado');

// Normalização para (-180, 180]
[[190, -170], [360, 2], [-190, 170], [540, 180], [0, 2], [1, 2], [-1, -2], [45, 45]]
  .forEach(([input, expected]) => {
    const got = St.normalizeOffset(input);
    if (Math.abs(got - expected) > 1e-9) {
      hfail(`normalizeOffset(${input}) deveria dar ${expected}, deu ${got}`);
    }
  });

// Nenhum offset fica sobreposto ao marcador principal
for (let i = 0; i < 2000; i++) {
  const got = St.normalizeOffset(Math.random() * 1440 - 720);
  if (Math.abs(got) < St.MIN_HARMONY_GAP - 1e-9) hfail(`offset ${got} colou no principal`);
  if (got <= -180 - 1e-9 || got > 180 + 1e-9) hfail(`offset ${got} fora de (-180,180]`);
}

// Editar um braço afeta só aquele braço
St.setHarmonyOffset(0, 100);
const edited = St.getHarmonyOffsets();
if (Math.abs(edited[0] - 100) > 1e-9) hfail(`braço 0 deveria virar 100, virou ${edited[0]}`);
if (Math.abs(edited[1] - canonical[1]) > 1e-9) hfail('braço 1 não deveria ter mudado');
if (!St.isHarmonyEdited()) hfail('esquema deveria contar como editado');

// Índice inválido é ignorado
const offsetsBefore = JSON.stringify(St.getHarmonyOffsets());
St.setHarmonyOffset(99, 10);
St.setHarmonyOffset(-1, 10);
if (JSON.stringify(St.getHarmonyOffsets()) !== offsetsBefore) {
  hfail('índice inválido alterou os offsets');
}

// Os matizes secundários seguem o offset editado e o matiz principal
St.setHsv({ h: 30, s: 60, v: 60 });
let hues = St.getHarmonyHues();
if (Math.abs(hues[0] - 130) > 1e-6) hfail(`matiz secundário deveria ser 130, deu ${hues[0].toFixed(2)}`);

St.setHsv({ h: 300, s: 60, v: 60 });
hues = St.getHarmonyHues();
if (Math.abs(hues[0] - 40) > 1e-6) hfail(`matiz deveria dar a volta para 40, deu ${hues[0].toFixed(2)}`);

// A edição é por esquema: trocar e voltar preserva o ajuste
St.setScheme('triad');
if (St.isHarmonyEdited()) hfail('triádico não deveria estar editado');
if (JSON.stringify(St.getHarmonyOffsets()) !== JSON.stringify(St.getScheme().offsets)) {
  hfail('triádico deveria usar os offsets canônicos');
}
St.setScheme('split');
if (!St.isHarmonyEdited()) hfail('a edição do split deveria ter sido preservada');
if (Math.abs(St.getHarmonyOffsets()[0] - 100) > 1e-9) hfail('offset editado do split se perdeu');

// Restaurar volta aos canônicos e só do esquema ativo
St.setScheme('triad');
St.setHarmonyOffset(0, 45);
St.setScheme('split');
St.resetHarmony();
if (St.isHarmonyEdited()) hfail('split deveria estar restaurado');
St.setScheme('triad');
if (!St.isHarmonyEdited()) hfail('restaurar o split não deveria afetar o triádico');
St.resetHarmony();

// Quantidade de braços bate com o esquema, em todos eles
St.HARMONY_SCHEMES.forEach((scheme) => {
  St.setScheme(scheme.id);
  if (St.getHarmonyOffsets().length !== scheme.offsets.length) {
    hfail(`${scheme.id}: quantidade de braços mudou`);
  }
  if (St.getHarmonyHues().length !== scheme.offsets.length) {
    hfail(`${scheme.id}: quantidade de matizes secundários mudou`);
  }
});

St.setScheme('none');
if (St.getHarmonyHues().length !== 0) hfail('sem esquema não deveria haver secundários');

console.log(hfails === 0 ? 'HARMONIA EDITÁVEL OK' : `${hfails} falha(s) de harmonia`);

/* ================= Proporção inicial dos formatos de máscara ================= */

let pfails = 0;
const pfail = (msg) => { if (pfails < 10) console.log('FAIL proporção ' + msg); pfails++; };

St.setGamut({ enabled: true, locked: false });

// Trocar de formato adota a proporção natural dele
St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ kind: 'ellipse' });
  St.setGamut({ kind });

  const expected = St.MASK_DEFAULT_SIZE[kind];
  if (!expected) { pfail(`${kind} sem proporção padrão definida`); return; }
  if (Math.abs(St.state.gamut.rx - expected.rx) > 1e-9
      || Math.abs(St.state.gamut.ry - expected.ry) > 1e-9) {
    pfail(`${kind}: esperado ${expected.rx}x${expected.ry}, veio ${St.state.gamut.rx}x${St.state.gamut.ry}`);
  }

  // Nenhum formato nasce achatado ao ponto de virar uma faixa
  const ratio = St.state.gamut.rx / St.state.gamut.ry;
  if (kind !== 'rect' && (ratio > 2.6 || ratio < 1 / 2.6)) {
    pfail(`${kind}: proporção inicial ${ratio.toFixed(2)} está achatada`);
  }
});

// Tamanho explícito no mesmo patch tem prioridade sobre o padrão
St.setGamut({ kind: 'ellipse' });
St.setGamut({ kind: 'hexagon', rx: 0.3, ry: 0.9 });
if (Math.abs(St.state.gamut.rx - 0.3) > 1e-9 || Math.abs(St.state.gamut.ry - 0.9) > 1e-9) {
  pfail('tamanho explícito deveria vencer o padrão do formato');
}

// Repetir o mesmo formato não descarta o ajuste manual
St.setGamut({ kind: 'hexagon' });
if (Math.abs(St.state.gamut.rx - 0.3) > 1e-9) {
  pfail('reaplicar o mesmo formato não deveria resetar o tamanho');
}

// Restaurar volta à proporção do formato ativo, não à da elipse
St.resetGamut();
const hexSize = St.MASK_DEFAULT_SIZE.hexagon;
if (Math.abs(St.state.gamut.rx - hexSize.rx) > 1e-9
    || Math.abs(St.state.gamut.ry - hexSize.ry) > 1e-9) {
  pfail('restaurar deveria usar a proporção do formato ativo');
}

// A máscara continua utilizável em todos os formatos após a troca
St.MASK_KINDS.forEach((kind) => {
  St.setGamut({ kind });
  if (!St.hasReachableAnchor()) pfail(`${kind}: sem região alcançável após trocar de formato`);
  St.setHsv({ h: 200, s: 80, v: 50 });
  const hsv = St.getHsv();
  if (!St.insideMask(hsv.h, hsv.s)) pfail(`${kind}: cor fora da máscara após trocar de formato`);
});

St.setGamut({ enabled: false, kind: 'ellipse' });
St.resetGamut();

console.log(pfails === 0 ? 'PROPORÇÃO DOS FORMATOS OK' : `${pfails} falha(s) de proporção`);
