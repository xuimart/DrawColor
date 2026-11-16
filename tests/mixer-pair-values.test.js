'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('./setup.js');
let S, P;
beforeEach(() => {
  for (const file of ['color', 'state', 'panels']) {
    const modulePath = require.resolve(path.join(__dirname, '..', 'demo', 'js', file + '.js'));
    delete require.cache[modulePath];
    require(modulePath);
  }
  S = window.AppState;
  P = window.Panels;
  S.setRgb(255, 0, 0);
  S.setBackground({ r: 0, g: 0, b: 255 }, 'host-background');
});
describe('Mixer: primary / secondary and values', () => {
  it('group editing starts off and toggling it preserves subdivisions, colors and level counts', () => {
    assert.equal(P.isGroupEditing(),false);
    P.setSliderLevels('RGB','r',5);
    P.setLevelGroup(P.sliderGroupKey('RGB','r'),2,4,5,255);
    const before=JSON.stringify({rgb:S.getRgb(),bg:S.state.background,history:S.state.history});
    P.setGroupEditing(true);assert.equal(P.isGroupEditing(),true);
    P.setGroupEditing(false);assert.equal(P.isGroupEditing(),false);
    assert.equal(P.getSliderLevels('RGB','r'),5);
    assert.equal(P.getLevelGroup(P.sliderGroupKey('RGB','r'),2),4);
    assert.equal(JSON.stringify({rgb:S.getRgb(),bg:S.state.background,history:S.state.history}),before);
  });
  it('subdivides only the chosen parent cell and keeps every other parent color unchanged', () => {
    const groups={2:4};
    const stops=P.levelStops(5,groups);
    assert.equal(stops.length,8);
    assert.deepEqual(stops.filter(s=>s.index!==2).map(s=>s.t),[0,.25,.75,1]);
    assert.deepEqual(stops.filter(s=>s.index===2).map(s=>s.t),[.40625,.46875,.53125,.59375]);
    for(const stop of stops) {
      const picked=P.groupedLevelSelection(stop.position,5,groups);
      assert.equal(picked.t,stop.t);
      assert.equal(picked.index,stop.index);
    }
  });
  it('gives every sub-cell exactly one distinct channel value, including negative LAB ranges', () => {
    for(const mode of Object.values(P.MODES))for(const ch of mode.channels)for(let n=2;n<=10;n++)for(let index=0;index<n;index++) {
      const k=P.levelGroupMax(n,index,(ch.max-ch.min)/ch.step);
      const groups={[index]:k};
      const values=P.levelStops(n,groups).filter(s=>s.index===index).map(s=>P.valueFromRatio(ch,s.t));
      assert.equal(new Set(values).size,k,`${ch.key} repeated a sub-value`);
      for(let i=1;i<values.length;i++)assert.ok(values[i]>values[i-1]);
    }
  });
  it('groups are independent by channel / mixer mode and clear when their parent count changes', () => {
    const slider=P.sliderGroupKey('RGB','r'), pair=P.mixerGroupKey('pair'), brightness=P.mixerGroupKey('blender','brightness');
    P.setSliderLevels('RGB','r',5);P.setMixerSteps('pair',5);P.setMixerSteps('blender',5,'brightness');
    P.setLevelGroup(slider,2,4,5,255);P.setLevelGroup(pair,2,3,5);P.setLevelGroup(brightness,1,2,5);
    assert.equal(P.getLevelGroup(slider,2),4);assert.equal(P.getLevelGroup(pair,2),3);
    assert.equal(P.getLevelGroup(P.mixerGroupKey('blender','saturation'),1),1);
    P.setSliderLevels('RGB','r',6);
    assert.deepEqual(P.getLevelGroups(slider),{});assert.equal(P.getLevelGroup(pair,2),3);
    P.setMixerSteps('pair',11);
    assert.deepEqual(P.getLevelGroups(pair),{});assert.equal(P.getLevelGroup(brightness,1),2);
    P.resetLevels();assert.deepEqual(P.getLevelGroups(brightness),{});
  });
  it('clamps subdivision counts and supports shrinking a group back to a single color', () => {
    const id=P.sliderGroupKey('LAB','L');P.setSliderLevels('LAB','L',10);
    P.setLevelGroup(id,0,99,10,100);
    assert.equal(P.getLevelGroup(id,0),5);
    P.setLevelGroup(id,2,3,10,100);
    P.setLevelGroup(id,0,1,10,100);
    assert.equal(P.getLevelGroup(id,0),1);assert.equal(P.getLevelGroup(id,2),3);
    P.setLevelGroup(id,-1,4,10,100);P.setLevelGroup(id,2,NaN,10,100);
    assert.equal(P.getLevelGroup(id,2),3);assert.equal(P.getLevelGroup(id,-1),1);
    assert.equal(P.groupedLevelSelection(.371,11,{2:4}).t,.371);
  });
  it('mixes the source colors within a group instead of making grayscale subdivisions', () => {
    const pair={primary:{r:255,g:0,b:0},secondary:{r:0,g:0,b:255}};
    const colors=P.levelStops(5,{2:4}).filter(s=>s.index===2).map(s=>P.mixerColorAt('pair',s.t,pair));
    assert.deepEqual(colors,[{r:151,g:0,b:104},{r:135,g:0,b:120},{r:120,g:0,b:135},{r:104,g:0,b:151}]);
  });
  it('resets every slider and mixer mode to continuous without changing the selected colors or history', () => {
    const previousPlatform=window.Platform;
    const stored={'palettes':'keep'};
    window.Platform={storage:{setItem:(key,value)=>{stored[key]=value},removeItem:key=>{delete stored[key]}}};
    try {
      P.setSliderLevels('RGB','r',4);
      P.setLevelGroup(P.sliderGroupKey('RGB','r'),1,3,4,255);
      P.setSliderLevels('LAB','a',6);
      P.setMixerSteps('pair',5);
      P.setMixerSteps('blender',3,'brightness');
      P.setMixerSteps('shades',8,'tints');
      assert.equal(P.hasCustomLevels(),true);
      const before=JSON.stringify({rgb:S.getRgb(),bg:S.state.background,history:S.state.history,limit:S.state.limit});
      P.resetLevels();
      assert.equal(P.hasCustomLevels(),false);
      assert.equal(P.getSliderLevels('RGB','r'),11);
      assert.equal(P.getSliderLevels('LAB','a'),11);
      assert.equal(P.getMixerSteps('pair'),11);
      assert.equal(P.getMixerSteps('blender','brightness'),11);
      assert.equal(P.getMixerSteps('shades','tints'),11);
      assert.deepEqual(stored,{palettes:'keep'});
      assert.equal(JSON.stringify({rgb:S.getRgb(),bg:S.state.background,history:S.state.history,limit:S.state.limit}),before);
    } finally {window.Platform=previousPlatform;}
  });
  it('only considers discrete levels customized when all saved settings already use gradients', () => {
    P.setSliderLevels('HSV','h',11);
    P.setMixerSteps('pair',11);
    assert.equal(P.hasCustomLevels(),false);
    P.resetLevels();P.resetLevels();
    assert.equal(P.hasCustomLevels(),false);
  });
  it('shows exactly N independent color bins through 10 and continuous interpolation above 10', () => {
    for (let n = 2; n <= 10; n++) {
      const sampled = new Set();
      for (let pixel = 0; pixel <= 1000; pixel++) {
        const selection = P.mixerSelection(pixel / 1000, n);
        sampled.add(selection.t);
        assert.equal(selection.position, (selection.index + 0.5) / n);
      }
      assert.equal(sampled.size, n);
      assert.equal(P.mixerSelection(0, n).t, 0);
      assert.equal(P.mixerSelection(1, n).t, 1);
    }
    assert.equal(P.mixerSelection(0.371, 11).t, 0.371);
    assert.equal(P.mixerSelection(0.371, 11).index, null);
  });
  it('keeps color counts independent by strip and slider mode', () => {
    P.setMixerSteps('pair', 5);
    P.setMixerSteps('blender', 3, 'brightness');
    P.setMixerSteps('blender', 8, 'saturation');
    P.setMixerSteps('shades', 4, 'tones');
    assert.equal(P.getMixerSteps('pair'),5);
    assert.equal(P.getMixerSteps('blender','brightness'),3);
    assert.equal(P.getMixerSteps('blender','saturation'),8);
    assert.equal(P.getMixerSteps('shades','tones'),4);
    assert.equal(P.getMixerSteps('shades','tints'),11);
    P.setMixerSteps('pair', 100);
    assert.equal(P.getMixerSteps('pair'),11);
    P.setMixerSteps('pair', -1);
    assert.equal(P.getMixerSteps('pair'),2);
  });
  it('preserves endpoint hues when creating discrete mixtures rather than replacing them with gray', () => {
    const base = {primary:{r:255,g:0,b:0},secondary:{r:0,g:0,b:255}};
    const colors = [];
    for(let i=0;i<5;i++) colors.push(P.mixerColorAt('pair',P.mixerSelection((i+.5)/5,5).t,base));
    assert.deepEqual(colors,[{r:255,g:0,b:0},{r:191,g:0,b:64},{r:128,g:0,b:128},{r:64,g:0,b:191},{r:0,g:0,b:255}]);
  });
  it('uses the same color mapping for drawing and applying every Blender / Shades mode', () => {
    const base = S.getHsv();
    for(const [key,modes,sample] of [['blender',['saturation','brightness','temperature'],P.sampleBlender],['shades',['shades','tints','tones'],P.sampleShades]]) {
      for(const mode of modes) for(const t of [0,.25,.5,.75,1]) {
        sample(t,mode,base);
        assert.deepEqual(S.getRgb(),P.mixerColorAt(key,t,base,mode));
      }
    }
  });
  it('mixes the exact source endpoints and midpoint', () => {
    const pair = P.syncMixerPair('init');
    for (const [t, expected] of [[0, {r:255,g:0,b:0}], [0.5, {r:128,g:0,b:128}], [1, {r:0,g:0,b:255}]]) {
      P.samplePair(t, pair);
      assert.deepEqual(S.getRgb(), expected);
    }
  });
  it('preserves the source colors across repeated gestures and history commits', () => {
    P.syncMixerPair('init');
    P.samplePair(0.5);
    S.pushHistory();
    P.syncMixerPair('history');
    P.samplePair(0.5);
    assert.deepEqual(S.getRgb(), { r:128, g:0, b:128 });
    assert.deepEqual(S.state.background, {r:0,g:0,b:255});
  });
  it('records one color per gesture instead of one per pointer movement', () => {
    const pair = P.syncMixerPair('init');
    const count = S.state.history.length;
    for (let i = 0; i <= 30; i++) P.samplePair(i / 30, pair);
    assert.equal(S.state.history.length, count);
    S.pushHistory();
    assert.equal(S.state.history.length, count + 1);
  });
  it('adopts external primary and secondary changes', () => {
    P.syncMixerPair('init');
    S.setRgb(0, 255, 0, {reason:'host'});
    P.syncMixerPair('host');
    S.setBackground({r:255,g:255,b:255}, 'host-background');
    P.syncMixerPair('host-background');
    P.samplePair(0.5);
    assert.deepEqual(S.getRgb(), {r:128,g:255,b:128});
  });
  it('samples grayscale independently from the active slider mode and luminosity lock', () => {
    S.setSliderMode('LAB');
    S.setLuminosityLock(true);
    for (const [t, level] of [[0,0], [0.28,71], [1,255]]) {
      P.sampleValue(t);
      assert.deepEqual(S.getRgb(), {r:level,g:level,b:level});
    }
    assert.equal(S.state.sliderMode, 'LAB');
  });
  it('rejects invalid secondary colors and deduplicates unchanged host reads', () => {
    const reasons = [];
    S.subscribe((_st, reason) => reasons.push(reason));
    assert.equal(S.setBackground({r:NaN,g:0,b:0}), false);
    assert.equal(S.setBackground({r:0,g:0,b:255}, 'host-background'), false);
    assert.deepEqual(reasons, []);
    S.setBackground({r:20,g:40,b:60}, 'host-background');
    assert.deepEqual(reasons, ['host-background']);
  });
});
