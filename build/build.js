#!/usr/bin/env node
/**
 * build.js — Monta os pacotes distribuíveis a partir do núcleo compartilhado.
 *
 *   node build/build.js uxp     → dist/uxp   (Photoshop 22+)
 *   node build/build.js cep     → dist/cep   (Photoshop 21-25)
 *   node build/build.js         → ambos
 *
 * O HTML NÃO é duplicado. `demo/index.html` é a única fonte e cada shell
 * aplica transformações sobre ela (injeta scripts e CSS, remove o invólucro
 * da demo). Assim uma mudança de DOM não precisa ser replicada em três lugares.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');
const DIST = path.join(ROOT, 'dist');

/** Ordem de carga do núcleo. platform.js vem primeiro: os outros consultam
 *  window.Platform durante a própria definição. */
const CORE_SCRIPTS = [
  'platform.js',
  'color.js',
  'state.js',
  'layout.js',
  'snap.js',
  'layout-store.js',
  'layout-serializer.js',
  'layout-editor.js',
  'wheel.js',
  'panels.js',
  'palettes.js',
  'gode.js',
  'docking.js',
  'ps-bridge.js',
  'panel-sync.js',
  'main.js'
];

/* ---------------------------------------------------------------- */
/* utilidades                                                        */
/* ---------------------------------------------------------------- */

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(from, to) {
  mkdirp(path.dirname(to));
  fs.copyFileSync(from, to);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, text) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
}

/* ---------------------------------------------------------------- */
/* transformação do HTML                                             */
/* ---------------------------------------------------------------- */

/**
 * Reescreve o bloco de <script> da demo para a ordem canônica do núcleo,
 * garantindo que platform.js e ps-bridge.js entrem nas posições certas.
 */
function rewriteScripts(html) {
  const tags = CORE_SCRIPTS
    .map((f) => `<script src="js/${f}"></script>`)
    .join('\n');

  // Substitui todo o bloco contíguo de scripts js/*.js por um bloco novo.
  const blockRe = /(?:[ \t]*<script src="js\/[^"]+"><\/script>\s*)+/;
  if (!blockRe.test(html)) {
    throw new Error('Bloco de <script> não encontrado em demo/index.html');
  }
  return html.replace(blockRe, tags + '\n');
}

function injectStylesheet(html, href) {
  const marker = '<link rel="stylesheet" href="styles.css">';
  if (!html.includes(marker)) {
    throw new Error('Link de styles.css não encontrado em demo/index.html');
  }
  return html.replace(marker, marker + `\n<link rel="stylesheet" href="${href}">`);
}

function stripDemoNote(html) {
  return html.replace(/[ \t]*<p class="demo-note">[\s\S]*?<\/p>\s*/, '');
}

/* ---------------------------------------------------------------- */
/* shell UXP                                                         */
/* ---------------------------------------------------------------- */

function buildUxp() {
  const out = path.join(DIST, 'uxp');
  rmrf(out);
  mkdirp(out);

  for (const f of CORE_SCRIPTS) {
    const src = path.join(DEMO, 'js', f);
    if (!fs.existsSync(src)) throw new Error(`Módulo ausente: demo/js/${f}`);
    copy(src, path.join(out, 'js', f));
  }

  copy(path.join(DEMO, 'styles.css'), path.join(out, 'styles.css'));
  copy(path.join(ROOT, 'uxp', 'styles-uxp.css'), path.join(out, 'styles-uxp.css'));
  copy(path.join(ROOT, 'uxp', 'manifest.json'), path.join(out, 'manifest.json'));

  // Copia imagens (logo Xuimart etc.)
  const imgDirUxp = path.join(DEMO, 'img');
  if (fs.existsSync(imgDirUxp)) {
    fs.readdirSync(imgDirUxp).forEach((f) => {
      copy(path.join(imgDirUxp, f), path.join(out, 'img', f));
    });
  }

  // Copia ícones
  const iconsDir = path.join(ROOT, 'uxp', 'icons');
  if (fs.existsSync(iconsDir)) {
    fs.readdirSync(iconsDir).forEach((f) => {
      copy(path.join(iconsDir, f), path.join(out, 'icons', f));
    });
  }

  let html = read(path.join(DEMO, 'index.html'));
  html = stripDemoNote(html);
  html = injectStylesheet(html, 'styles-uxp.css');
  html = rewriteScripts(html);
  write(path.join(out, 'index.html'), html);

  const manifest = JSON.parse(read(path.join(out, 'manifest.json')));
  console.log(`dist/uxp   → ${manifest.name} v${manifest.version} ` +
              `(manifest v${manifest.manifestVersion}, PS ${manifest.host.minVersion}+)`);
}

/* ---------------------------------------------------------------- */
/* shell CEP                                                         */
/* ---------------------------------------------------------------- */

function buildCep() {
  const cepDir = path.join(ROOT, 'cep');
  if (!fs.existsSync(cepDir)) {
    console.log('dist/cep   → ignorado (pasta cep/ ainda não existe)');
    return;
  }

  const out = path.join(DIST, 'cep');
  rmrf(out);
  mkdirp(out);

  for (const f of CORE_SCRIPTS) {
    copy(path.join(DEMO, 'js', f), path.join(out, 'js', f));
  }

  copy(path.join(DEMO, 'styles.css'), path.join(out, 'styles.css'));
  copy(path.join(cepDir, 'styles-cep.css'), path.join(out, 'styles-cep.css'));

  // Copia imagens (logo Xuimart etc.)
  const imgDirCep = path.join(DEMO, 'img');
  if (fs.existsSync(imgDirCep)) {
    fs.readdirSync(imgDirCep).forEach((f) => {
      copy(path.join(imgDirCep, f), path.join(out, 'img', f));
    });
  }
  copy(path.join(cepDir, 'CSXS', 'manifest.xml'), path.join(out, 'CSXS', 'manifest.xml'));
  copy(path.join(cepDir, 'lib', 'CSInterface.js'), path.join(out, 'lib', 'CSInterface.js'));
  copy(path.join(cepDir, 'jsx', 'host.jsx'), path.join(out, 'jsx', 'host.jsx'));

  let html = read(path.join(DEMO, 'index.html'));
  html = stripDemoNote(html);
  html = injectStylesheet(html, 'styles-cep.css');
  html = rewriteScripts(html);
  // O CEP precisa do CSInterface antes do núcleo, para o PSBridge detectá-lo.
  html = html.replace(
    '<script src="js/platform.js"></script>',
    '<script src="lib/CSInterface.js"></script>\n<script src="js/platform.js"></script>'
  );
  write(path.join(out, 'index.html'), html);

  /**
   * A janela Modeless usa a MESMA página, marcada com uma classe no body.
   * Duplicar o HTML numa versão "só sliders" custaria manter dois DOMs em
   * sincronia, e os módulos (panels, palettes, godê) esperam encontrar todos
   * os nós que existem no painel. Aqui a diferença é de apresentação: o CSS
   * esconde a roda e deixa as abas ocuparem a janela.
   */
  const toolsHtml = html.replace('<body>', '<body class="shell-tools">');
  if (toolsHtml === html) {
    throw new Error('Não encontrei <body> em demo/index.html para marcar o shell de ferramentas');
  }
  write(path.join(out, 'tools.html'), toolsHtml);

  const hosts = read(path.join(out, 'CSXS', 'manifest.xml'))
    .match(/Version="\[([^\]]+)\]"/);
  console.log(`dist/cep   → extensão CEP montada (Photoshop ${hosts ? hosts[1] : '?'})`);
  console.log('             index.html (painel) + tools.html (painel de ferramentas)');
}

/* ---------------------------------------------------------------- */

function main() {
  const target = process.argv[2];
  if (target && !['uxp', 'cep'].includes(target)) {
    console.error(`Alvo desconhecido: ${target}. Use "uxp" ou "cep".`);
    process.exit(1);
  }

  if (!target || target === 'uxp') buildUxp();
  if (!target || target === 'cep') buildCep();
}

main();
