import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuality, qualityFromQuery, LEVELS } from '../src/quality.js';

test('los niveles tienen los valores del diseño', () => {
  assert.deepEqual(LEVELS.movil, { name: 'movil', textureSize: 1024, shadowMapSize: 1024, maxPixelRatio: 1.5 });
  assert.deepEqual(LEVELS.ordenador, { name: 'ordenador', textureSize: 2048, shadowMapSize: 2048, maxPixelRatio: 2 });
});

test('teléfono táctil → movil', () => {
  assert.equal(pickQuality({ coarsePointer: true, screenWidth: 390, screenHeight: 844 }).name, 'movil');
});

test('portátil con ratón → ordenador', () => {
  assert.equal(pickQuality({ coarsePointer: false, screenWidth: 1440, screenHeight: 900 }).name, 'ordenador');
});

test('tableta grande táctil → ordenador', () => {
  assert.equal(pickQuality({ coarsePointer: true, screenWidth: 1366, screenHeight: 1024 }).name, 'ordenador');
});

test('?calidad= fuerza el nivel y no acepta nombres raros', () => {
  assert.equal(qualityFromQuery('?calidad=movil').name, 'movil');
  assert.equal(qualityFromQuery('?calidad=ordenador').name, 'ordenador');
  assert.equal(qualityFromQuery('?calidad=toString'), null);
  assert.equal(qualityFromQuery('?x=1'), null);
});
