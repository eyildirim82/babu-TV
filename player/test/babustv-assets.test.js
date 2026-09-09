import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const assets = [
  new URL('../public/brand/babustv-mark.svg', import.meta.url),
  new URL('../public/brand/babustv-wordmark.svg', import.meta.url),
  new URL('../public/brand/babustv-boot.svg', import.meta.url),
  new URL('../public/favicon.png', import.meta.url),
  new URL('../../tizen/icons/icon_128.png', import.meta.url),
];

const svgAssets = assets.slice(0, 3);
const pngAssets = assets.slice(3);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const inheritedAccent = ['#ED', '421F'].join('');
const legacyProductText = /(?:EN-IPTV|EN IPTV|ENTV)/i;
const legacyVisualTerms = /(?:television(?:-outline)?|play[-\s]?triangle)/i;

test('BabuşTV brand asset set exists and is non-empty', () => {
  for (const asset of assets) {
    const path = fileURLToPath(asset);
    assert.ok(statSync(path).size > 0, `${path} must be non-empty`);
  }
});

test('BabuşTV SVG assets identify the owned brand and exclude inherited product marks', () => {
  for (const asset of svgAssets) {
    const svg = readFileSync(asset, 'utf8');
    const path = fileURLToPath(asset);

    assert.match(svg, /<title>[^<]*BabuşTV[^<]*<\/title>/i, `${path} must title the BabuşTV asset`);
    assert.match(svg, /data-brand=["']BabuşTV["']/i, `${path} must carry BabuşTV ownership metadata`);
    assert.equal(legacyProductText.test(svg), false, `${path} must not contain inherited EN product text`);
    assert.equal(legacyVisualTerms.test(svg), false, `${path} must not describe the inherited TV/play mark`);
    assert.equal(svg.toUpperCase().includes(inheritedAccent), false, `${path} must not carry the inherited red/orange accent`);
  }
});

test('BabuşTV raster assets are valid PNG files', () => {
  for (const asset of pngAssets) {
    const png = readFileSync(asset);
    const path = fileURLToPath(asset);

    assert.deepEqual(png.subarray(0, pngSignature.length), pngSignature, `${path} must start with the PNG signature`);
  }
});
