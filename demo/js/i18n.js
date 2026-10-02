/**
 * i18n.js — Idioma da interface (PT / EN).
 *
 * Fonte única de tradução do painel. Mantém o idioma ativo, aplica os textos
 * nos elementos marcados no HTML e expõe `t()` para as strings montadas em JS.
 *
 * Marcação no HTML (aplicada por applyStatic):
 *   data-i18n="chave"        → textContent
 *   data-i18n-title="chave"  → atributo title
 *   data-i18n-aria="chave"   → atributo aria-label
 *   data-i18n-ph="chave"     → atributo placeholder
 *
 * Para texto dinâmico no JS, use I18N.t('chave', { n: 3 }) com {placeholders}.
 *
 * O idioma fica em localStorage. Na primeira visita cai no idioma do
 * navegador: 'pt*' → português, qualquer outro → inglês.
 */
window.I18N = (function () {
  'use strict';

  var STORAGE_KEY = 'drawcolor-lang';
  var current = 'pt';
  var listeners = [];

  var DICT = {
    /* ---- menu: Sobre / atualização ---- */
    'menu.about': { pt: 'Sobre', en: 'About' },
    'menu.version': { pt: 'Versão', en: 'Version' },
    'menu.checkUpdate': { pt: 'Verificar atualização', en: 'Check for updates' },

    /* ---- menu: Roda ---- */
    'menu.wheel': { pt: 'Roda', en: 'Wheel' },
    'menu.circle': { pt: 'Círculo', en: 'Circle' },
    'wheel.space.title': { pt: 'Espaço do círculo cromático', en: 'Color circle space' },
    'wheel.rgb.title': { pt: 'Roda da luz (RGB): o complementar do vermelho é o ciano', en: 'Light wheel (RGB): red\u2019s complement is cyan' },
    'wheel.ryb.title': { pt: 'Roda do pintor (RYB): o complementar do vermelho é o verde', en: 'Painter\u2019s wheel (RYB): red\u2019s complement is green' },
    'wheel.spaceHint.ryb': { pt: 'Roda do pintor: vermelho, amarelo e azul como primárias', en: 'Painter\u2019s wheel: red, yellow and blue as primaries' },
    'wheel.spaceHint.rgb': { pt: 'Roda da luz: vermelho, verde e azul como primárias', en: 'Light wheel: red, green and blue as primaries' },
    'menu.rotation': { pt: 'Rotação', en: 'Rotation' },
    'wheel.rotation.aria': { pt: 'Rotação da roda', en: 'Wheel rotation' },
    'wheel.rotMinus': { pt: 'Girar 15° à esquerda', en: 'Rotate 15° left' },
    'wheel.rotPlus': { pt: 'Girar 15° à direita', en: 'Rotate 15° right' },
    'wheel.rotReset': { pt: 'Zerar', en: 'Reset' },
    'wheel.rotHint': { pt: 'Shift + arraste no anel gira · Ctrl trava em 60°', en: 'Shift + drag on the ring to rotate · Ctrl snaps to 60°' },

    /* ---- limitar cores ---- */
    'limit.enable': { pt: 'Limitar cores', en: 'Limit colors' },
    'limit.hues': { pt: 'Matizes', en: 'Hues' },
    'limit.huesAria': { pt: 'Quantidade de matizes', en: 'Number of hues' },
    'limit.tones': { pt: 'Tons', en: 'Tones' },
    'limit.tonesAria': { pt: 'Quantidade de níveis de saturação e valor', en: 'Number of saturation and value levels' },

    /* ---- opções de exibição ---- */
    'opt.showHex': { pt: 'Mostrar campo Hex', en: 'Show Hex field' },
    'opt.compare': { pt: 'Comparar cor nova/antiga', en: 'Compare new/old color' },
    'opt.lumLock': { pt: 'Travar luminosidade', en: 'Lock luminosity' },
    'opt.valueCheck': { pt: 'Conferir valores (cinza)', en: 'Check values (grayscale)' },

    /* ---- harmonia ---- */
    'menu.harmony': { pt: 'Harmonia', en: 'Harmony' },
    'harmony.reset': { pt: 'Restaurar ângulos', en: 'Reset angles' },
    'harmony.hint': { pt: 'Arraste um marcador secundário para abrir ou fechar o esquema inteiro · Alt move só aquele braço · Shift trava em 15°', en: 'Drag a secondary marker to open or close the whole scheme · Alt moves only that arm · Shift snaps to 15°' },
    'harmony.none': { pt: 'Nenhum esquema ativo', en: 'No scheme active' },
    'harmony.edited': { pt: '(editado)', en: '(edited)' },
    'harmony.scheme.aria': { pt: 'Esquema de harmonia', en: 'Harmony scheme' },

    /* ---- nomes dos esquemas de harmonia (arco) ---- */
    'scheme.none': { pt: 'Mono', en: 'Mono' },
    'scheme.comp': { pt: 'Complementar', en: 'Complementary' },
    'scheme.analog': { pt: 'Análogo', en: 'Analogous' },
    'scheme.accent': { pt: 'Análogo acentuado', en: 'Accented analogous' },
    'scheme.triad': { pt: 'Triádico', en: 'Triadic' },
    'scheme.tetra': { pt: 'Tetrádico', en: 'Tetradic' },

    /* ---- máscara de gamut ---- */
    'menu.gamut': { pt: 'Máscara de gamut', en: 'Gamut mask' },
    'gamut.enable': { pt: 'Ativar máscara', en: 'Enable mask' },
    'gamut.edit': { pt: 'Editar máscara', en: 'Edit mask' },
    'gamut.lock': { pt: 'Gamut lock', en: 'Gamut lock' },
    'menu.shape': { pt: 'Formato', en: 'Shape' },
    'gamut.shape.aria': { pt: 'Formato da máscara', en: 'Mask shape' },
    'gamut.size': { pt: 'Tamanho', en: 'Size' },
    'gamut.sizeAria': { pt: 'Predefinição de tamanho', en: 'Size preset' },
    'gamut.preset.placeholder': { pt: 'Predefinições…', en: 'Presets…' },
    'gamut.preset.wide': { pt: 'Ampla', en: 'Wide' },
    'gamut.preset.narrow': { pt: 'Estreita', en: 'Narrow' },
    'gamut.preset.band': { pt: 'Faixa fina', en: 'Thin band' },
    'gamut.preset.muted': { pt: 'Dessaturada', en: 'Muted' },
    'gamut.preset.full': { pt: 'Disco inteiro', en: 'Full disc' },
    'gamut.reset': { pt: 'Restaurar máscara', en: 'Reset mask' },
    'gamut.resetShape': { pt: 'Restaurar forma', en: 'Reset shape' },
    'gamut.resetShape.title': { pt: 'Volta ao formato do rack, mantendo posição e tamanho', en: 'Back to the rack shape, keeping position and size' },
    'gamut.center': { pt: 'Centralizar', en: 'Center' },
    'gamut.center.title': { pt: 'Traz a máscara para o centro do disco, mantendo formato e tamanho', en: 'Brings the mask to the center of the disc, keeping shape and size' },
    'gamut.hint1': { pt: 'Em edição, arraste os vértices brancos para moldar a máscara · as alças da caixa mudam tamanho · a alça de cima gira', en: 'When editing, drag the white vertices to shape the mask · the box handles resize · the top handle rotates' },
    'gamut.hint2': { pt: 'A máscara age no seletor em disco. Em edição, arraste em qualquer lugar para mover · alças laranja mudam um eixo · Shift mantém a proporção · Alt+arraste move sem entrar em edição.', en: 'The mask works on the disc selector. When editing, drag anywhere to move · orange handles change one axis · Shift keeps the ratio · Alt+drag moves without entering edit mode.' },

    /* ---- máscara: nomes dos formatos ---- */
    'maskkind.triangle': { pt: 'Triângulo', en: 'Triangle' },
    'maskkind.rect': { pt: 'Barra', en: 'Bar' },
    'maskkind.ellipse': { pt: 'Elipse', en: 'Ellipse' },
    'maskkind.diamond': { pt: 'Losango', en: 'Diamond' },
    'maskkind.dual': { pt: 'Elipse + círculo', en: 'Ellipse + circle' },
    'maskkind.hexagon': { pt: 'Hexágono', en: 'Hexagon' },
    'gamut.tools.aria': { pt: 'Ferramentas da máscara', en: 'Mask tools' },

    /* ---- idioma ---- */
    'menu.language': { pt: 'Idioma', en: 'Language' },

    /* ---- cabeçalho / banner ---- */
    'header.menu.aria': { pt: 'Opções do painel', en: 'Panel options' },
    'banner.download.title': { pt: 'Clique para baixar a nova versão', en: 'Click to download the new version' },
    'banner.default': { pt: 'Nova versão disponível — clique para baixar', en: 'New version available — click to download' },
    'banner.close.title': { pt: 'Fechar', en: 'Close' },
    'banner.close.aria': { pt: 'Fechar aviso de atualização', en: 'Close update notice' },

    /* ---- swatches / roda / dials ---- */
    'swatch.fg': { pt: 'Cor de foreground', en: 'Foreground color' },
    'swatch.bg': { pt: 'Cor de background', en: 'Background color' },
    'swatch.swap.title': { pt: 'Trocar foreground/background', en: 'Swap foreground/background' },
    'swatch.swap.aria': { pt: 'Trocar foreground e background', en: 'Swap foreground and background' },
    'swatch.previous': { pt: 'anterior', en: 'previous' },
    'wheel.canvas.aria': { pt: 'Roda de cores HSV', en: 'HSV color wheel' },
    'gamut.mask.title': { pt: 'Máscara de gamut', en: 'Gamut mask' },
    'shape.selector.title': { pt: 'Forma do seletor', en: 'Selector shape' },
    'shape.selector.aria': { pt: 'Forma do seletor', en: 'Selector shape' },
    'shape.triangle': { pt: 'Triângulo', en: 'Triangle' },
    'shape.square': { pt: 'Quadrado', en: 'Square' },
    'shape.disc': { pt: 'Disco', en: 'Disc' },
    'rail.valuecheck.title': { pt: 'Conferir valores', en: 'Check values' },
    'rail.valuecheck.aria': { pt: 'Conferir valores em escala de cinza', en: 'Check values in grayscale' },
    'rail.lumlock.title': { pt: 'Travar luminosidade', en: 'Lock luminosity' },
    'rail.lumlock.aria': { pt: 'Travar luminosidade', en: 'Lock luminosity' },
    'dial.bright.aria': { pt: 'Brilho', en: 'Brightness' },
    'dial.temp.aria': { pt: 'Temperatura', en: 'Temperature' },
    'history.undo.title': { pt: 'Desfazer cor', en: 'Undo color' },
    'history.redo.title': { pt: 'Refazer cor', en: 'Redo color' },
    'hex.aria': { pt: 'Valor hexadecimal da cor', en: 'Hexadecimal color value' },
    'value.aria': { pt: 'Valor', en: 'Value' },

    /* ---- abas ---- */
    'tab.sliders': { pt: 'Sliders', en: 'Sliders' },
    'tab.mixers': { pt: 'Mixers', en: 'Mixers' },
    'tab.palettes': { pt: 'Paletas', en: 'Palettes' },
    'tab.gode': { pt: 'Godê', en: 'Mixing palette' },
    'detach.title': { pt: 'Separar em janela', en: 'Detach to window' },
    'detach.aria': { pt: 'Separar a aba atual em janela', en: 'Detach the current tab to a window' },

    /* ---- rampa B/W ---- */
    'bw.ramp.aria': { pt: 'Rampa de valores', en: 'Value ramp' },
    'bw.minus': { pt: 'Menos valores', en: 'Fewer values' },
    'bw.plus': { pt: 'Mais valores', en: 'More values' },
    'bw.groupPlus': { pt: 'Dividir o quadrado em mais tons', en: 'Split the square into more tones' },
    'bw.groupMinus': { pt: 'Dividir o quadrado em menos tons', en: 'Split the square into fewer tones' },
    'bw.groupReset.title': { pt: 'Desfazer todos os grupos', en: 'Undo all groups' },
    'bw.count': { pt: '{n} valores', en: '{n} values' },
    'bw.countSuffix': { pt: 'valores', en: 'values' },
    'mode.caption': { pt: 'MODE:', en: 'MODE:' },
    'mode.aria': { pt: 'Modo de cor', en: 'Color mode' },

    /* ---- mixers ---- */
    'mix.history': { pt: 'Color history', en: 'Color history' },
    'mix.blender': { pt: 'Blender', en: 'Blender' },
    'mix.blender.aria': { pt: 'Modo do blender', en: 'Blender mode' },
    'mix.blender.saturation': { pt: 'Saturação', en: 'Saturation' },
    'mix.blender.brightness': { pt: 'Brilho', en: 'Brightness' },
    'mix.blender.temperature': { pt: 'Temperatura', en: 'Temperature' },
    'mix.autoSample': { pt: 'Auto Sample', en: 'Auto Sample' },
    'mix.shades': { pt: 'Shades & tones', en: 'Shades & tones' },
    'mix.shades.aria': { pt: 'Modo de tons', en: 'Tones mode' },
    'mix.swatches': { pt: 'Swatches', en: 'Swatches' },
    'mix.scheme': { pt: 'Scheme', en: 'Scheme' },
    'mix.scheme.aria': { pt: 'Esquema de harmonia', en: 'Harmony scheme' },
    'mix.scheme.complementary': { pt: 'Complementar', en: 'Complementary' },
    'mix.scheme.analogous': { pt: 'Análogo', en: 'Analogous' },
    'mix.scheme.triadic': { pt: 'Triádico', en: 'Triadic' },
    'mix.scheme.split': { pt: 'Split-complementar', en: 'Split-complementary' },
    'mix.scheme.tetradic': { pt: 'Tetrádico', en: 'Tetradic' },
    'mix.toggles.aria': { pt: 'Visibilidade das barras', en: 'Bar visibility' },
    'mix.export.title': { pt: 'Exportar barras', en: 'Export bars' },
    'mix.import.title': { pt: 'Importar barras', en: 'Import bars' },

    /* ---- paletas ---- */
    'pal.active.aria': { pt: 'Paleta ativa', en: 'Active palette' },
    'pal.add.title': { pt: 'Guardar a cor atual', en: 'Save the current color' },
    'pal.new': { pt: 'Nova', en: 'New' },
    'pal.new.title': { pt: 'Nova paleta', en: 'New palette' },
    'pal.delete': { pt: 'Excluir', en: 'Delete' },
    'pal.delete.title': { pt: 'Remover a paleta ativa', en: 'Remove the active palette' },
    'pal.name.aria': { pt: 'Nome da paleta', en: 'Palette name' },
    'pal.fromLimit': { pt: 'Importar do limite', en: 'Import from limit' },
    'pal.fromBw': { pt: 'Importar rampa B/W', en: 'Import B/W ramp' },
    'pal.export': { pt: 'Exportar', en: 'Export' },
    'pal.exportAria': { pt: 'Cores da paleta em texto', en: 'Palette colors as text' },
    'pal.default1': { pt: 'Paleta 1', en: 'Palette 1' },
    'pal.named': { pt: 'Paleta {n}', en: 'Palette {n}' },
    'pal.noname': { pt: 'Sem nome', en: 'Untitled' },
    'pal.empty': { pt: 'Paleta vazia — use + para guardar a cor atual.', en: 'Empty palette — use + to save the current color.' },
    'pal.created': { pt: 'Paleta criada', en: 'Palette created' },
    'pal.emptied': { pt: 'Paleta esvaziada', en: 'Palette emptied' },
    'pal.removed': { pt: 'Paleta removida', en: 'Palette removed' },
    'pal.saveFail': { pt: 'Não foi possível salvar (armazenamento indisponível)', en: 'Could not save (storage unavailable)' },
    'pal.already': { pt: '{hex} já está na paleta', en: '{hex} is already in the palette' },
    'pal.full': { pt: 'Paleta cheia ({max})', en: 'Palette full ({max})' },
    'pal.added': { pt: '{hex} adicionada', en: '{hex} added' },
    'pal.colorRemoved': { pt: '{hex} removida', en: '{hex} removed' },
    'pal.enableLimit': { pt: 'Ative o limite de cor primeiro', en: 'Enable the color limit first' },
    'pal.huesImported': { pt: '{n} matizes importados do limite', en: '{n} hues imported from the limit' },
    'pal.bwImported': { pt: '{n} valores importados da rampa B/W', en: '{n} values imported from the B/W ramp' },
    'pal.nothingExport': { pt: 'Nada para exportar', en: 'Nothing to export' },
    'pal.readyCopy': { pt: '{n} cores prontas para copiar', en: '{n} colors ready to copy' },
    'pal.optionLabel': { pt: '{name} ({count})', en: '{name} ({count})' },
    'pal.chip.title': { pt: '{hex} — clique para aplicar', en: '{hex} — click to apply' },
    'pal.chip.aria': { pt: 'Aplicar {hex}', en: 'Apply {hex}' },
    'pal.del.title': { pt: 'Remover {hex}', en: 'Remove {hex}' },
    'pal.del.aria': { pt: 'Remover {hex}', en: 'Remove {hex}' },

    /* ---- godê ---- */
    'gode.tools.aria': { pt: 'Ferramenta do godê', en: 'Mixing palette tool' },
    'gode.brush': { pt: 'Pincel', en: 'Brush' },
    'gode.smudge': { pt: 'Espátula', en: 'Palette knife' },
    'gode.pick': { pt: 'Conta-gotas', en: 'Eyedropper' },
    'gode.clearInline': { pt: 'Limpar godê', en: 'Clear palette' },
    'gode.undo': { pt: 'Desfazer (Ctrl+Z)', en: 'Undo (Ctrl+Z)' },
    'gode.redo': { pt: 'Refazer (Ctrl+Shift+Z)', en: 'Redo (Ctrl+Shift+Z)' },
    'gode.canvas.aria': { pt: 'Godê de mistura de cores', en: 'Color mixing palette' },
    'gode.size': { pt: 'Tamanho', en: 'Size' },
    'gode.flow': { pt: 'Fluxo', en: 'Flow' },
    'gode.load': { pt: 'Dispor paleta', en: 'Lay out palette' },
    'gode.clear': { pt: 'Limpar', en: 'Clear' },
    'gode.hint.empty': { pt: 'Paleta ativa está vazia', en: 'Active palette is empty' },
    'gode.hint.laid': { pt: 'Pastilhas dispostas — espatule para misturar', en: 'Swatches laid out — smear to mix' },
    'gode.hint.cleared': { pt: 'Godê limpo', en: 'Palette cleared' },
    'gode.hint.undo': { pt: 'Desfazer', en: 'Undo' },
    'gode.hint.redo': { pt: 'Refazer', en: 'Redo' },
    'gode.hint.zoom': { pt: 'Zoom {n}%', en: 'Zoom {n}%' },
    'gode.hint.brush': { pt: 'Pincel — pinta com a cor atual, misturando no que já existe', en: 'Brush — paints with the current color, blending into what\u2019s there' },
    'gode.hint.smudge': { pt: 'Espátula — arrasta e mistura a tinta que já está no godê', en: 'Palette knife — drags and blends the paint already on the palette' },
    'gode.hint.pick': { pt: 'Conta-gotas — clique para capturar a cor misturada', en: 'Eyedropper — click to grab the mixed color' },

    /* ---- docking ---- */
    'dock.detachPane': { pt: 'Separar {title} em janela', en: 'Detach {title} to a window' },
    'dock.alreadyDetached': { pt: 'Esta aba já está separada', en: 'This tab is already detached' },
    'dock.inWindow': { pt: '{title} está numa janela separada.', en: '{title} is in a separate window.' },
    'dock.bringBack': { pt: 'Trazer de volta', en: 'Bring it back' },
    'dock.redock.title': { pt: 'Reencaixar no painel', en: 'Dock back into the panel' },

    /* ---- status bar ---- */
    'status.demo': { pt: 'Modo demo — sem Photoshop conectado', en: 'Demo mode — no Photoshop connected' },
    'status.offline': { pt: 'Demo offline', en: 'Demo offline' },
    'status.limit': { pt: ' · limite {n}h', en: ' · limit {n}h' },
    'status.spin': { pt: ' · giro {n}°', en: ' · spin {n}°' },
    'status.lum': { pt: ' · L travado {n}', en: ' · L locked {n}' },
    'status.mask': { pt: ' · máscara', en: ' · mask' },
    'status.maskLocked': { pt: ' travada', en: ' locked' },
    'status.values': { pt: ' · valores', en: ' · values' },
    'status.rybWheel': { pt: ' · roda RYB', en: ' · RYB wheel' },
    'status.history': { pt: ' · histórico {i}/{n}', en: ' · history {i}/{n}' },
    'status.shape.triangle': { pt: 'triângulo', en: 'triangle' },
    'status.shape.square': { pt: 'quadrado', en: 'square' },
    'status.shape.disc': { pt: 'disco', en: 'disc' },

    /* ---- update: mensagens ---- */
    'update.checking': { pt: 'Verificando…', en: 'Checking…' },
    'update.available': { pt: 'Nova versão {v} disponível.', en: 'New version {v} available.' },
    'update.latest': { pt: 'Você está na versão mais recente.', en: 'You are on the latest version.' },
    'update.failRetry': { pt: 'Não foi possível verificar agora. Tente mais tarde.', en: 'Could not check right now. Try again later.' },
    'update.fail': { pt: 'Não foi possível verificar agora.', en: 'Could not check right now.' },
    'update.banner': { pt: 'Nova versão {v} disponível', en: 'New version {v} available' },
    'update.bannerDownload': { pt: '  ·  clique para baixar', en: '  ·  click to download' },

    /* ---- canais dos sliders ---- */
    'slider.channel': { pt: 'Canal {ch}', en: 'Channel {ch}' },
    'slider.channelValue': { pt: 'Valor do canal {ch}', en: 'Value of channel {ch}' },
    'bw.value.title': { pt: 'Valor {n}%', en: 'Value {n}%' },
    'bw.value.aria': { pt: 'Aplicar valor {n}%', en: 'Apply value {n}%' },

    /* ---- overlay de licença ---- */
    'ov.login.title': { pt: 'Ative sua conta', en: 'Activate your account' },
    'ov.login.text': { pt: 'Faça login para usar o DrawColor.', en: 'Sign in to use DrawColor.' },
    'ov.login.btn': { pt: 'Login com Google', en: 'Sign in with Google' },
    'ov.expired.title': { pt: 'Trial expirado', en: 'Trial expired' },
    'ov.expired.text': { pt: 'Trial expirado — Compre sua licença', en: 'Trial expired — buy your license' },
    'ov.expired.btn': { pt: 'Comprar licença', en: 'Buy license' },
    'ov.machine.title': { pt: 'Limite de máquinas', en: 'Machine limit' },
    'ov.machine.text': { pt: 'Você já ativou 2 máquinas. Desative uma para continuar aqui.', en: 'You have already activated 2 machines. Deactivate one to continue here.' },
    'ov.machine.deactivate': { pt: 'Desativar', en: 'Deactivate' },
    'ov.machine.error': { pt: 'Erro', en: 'Error' },
    'ov.offline.title': { pt: 'Conexão necessária', en: 'Connection required' },
    'ov.offline.text': { pt: 'Conecte à internet para revalidar sua licença.', en: 'Connect to the internet to revalidate your license.' },
    'ov.error.title': { pt: 'Erro', en: 'Error' },
    'ov.error.unknown': { pt: 'Erro desconhecido', en: 'Unknown error' },
    'ov.error.retry': { pt: 'Tentar novamente', en: 'Try again' },
    'ov.unknown': { pt: 'Estado desconhecido', en: 'Unknown state' },

    /* ---- badge de trial ---- */
    'trial.day': { pt: '{n} dia restante', en: '{n} day left' },
    'trial.days': { pt: '{n} dias restantes', en: '{n} days left' },
    'trial.buy': { pt: 'Comprar licença', en: 'Buy license' }
  };

  /**
   * Preferência de idioma: sempre no localStorage, de forma síncrona.
   *
   * Não usa o Platform Adapter de propósito. O Platform.storage do UXP é
   * assíncrono e pode não estar pronto quando o idioma precisa ser decidido
   * (antes de qualquer render). O localStorage é síncrono e existe no CEP, no
   * UXP e no navegador, então serve bem para uma única string curta.
   */
  function backing() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function detect() {
    var store = backing();
    try {
      var saved = store && store.getItem(STORAGE_KEY);
      if (saved === 'pt' || saved === 'en') return saved;
    } catch (e) { /* sem storage */ }
    var nav = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'pt').toLowerCase();
    return nav.indexOf('pt') === 0 ? 'pt' : 'en';
  }

  /** Tradução de uma chave, com substituição de {placeholders}. */
  function t(key, params) {
    var entry = DICT[key];
    var str = entry ? (entry[current] != null ? entry[current] : entry.pt) : key;
    if (params) {
      str = str.replace(/\{(\w+)\}/g, function (m, name) {
        return params[name] != null ? params[name] : m;
      });
    }
    return str;
  }

  /** Aplica as traduções estáticas nos elementos marcados no HTML. */
  function applyStatic(root) {
    var scope = root || document;
    var map = [
      ['data-i18n', 'textContent'],
      ['data-i18n-title', 'title'],
      ['data-i18n-aria', 'aria-label'],
      ['data-i18n-ph', 'placeholder']
    ];
    map.forEach(function (pair) {
      var attr = pair[0], target = pair[1];
      var nodes = scope.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].getAttribute(attr);
        var val = t(key);
        if (target === 'textContent') nodes[i].textContent = val;
        else nodes[i].setAttribute(target, val);
      }
    });
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](current); } catch (e) { /* ignora listener quebrado */ }
    }
  }

  function set(lang) {
    if (lang !== 'pt' && lang !== 'en') return;
    current = lang;
    try {
      var store = backing();
      if (store) store.setItem(STORAGE_KEY, lang);
    } catch (e) { /* sem storage */ }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = (lang === 'pt') ? 'pt-BR' : 'en';
    }
    applyStatic();
    notify();
  }

  function get() { return current; }

  /** Registra callback chamado a cada troca de idioma (e logo que inicia). */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /** Chamado no boot: fixa o idioma detectado e aplica os textos estáticos. */
  function init() {
    current = detect();
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = (current === 'pt') ? 'pt-BR' : 'en';
    }
    applyStatic();
  }

  return {
    t: t,
    set: set,
    get: get,
    onChange: onChange,
    applyStatic: applyStatic,
    init: init
  };
})();
