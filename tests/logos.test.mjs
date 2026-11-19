import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageType, validClubId } from '../netlify/lib/logos.mjs';

const bytes = (...b) => new Uint8Array([...b, ...new Array(12).fill(0)]).buffer;

test('sigla: tipul imaginii se ia din primii octeti, nu din ce declara serverul', () => {
  assert.equal(imageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
  assert.equal(imageType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(imageType(bytes(...Buffer.from('GIF89a'))), 'image/gif');
  assert.equal(imageType(new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]).buffer), 'image/webp');
  assert.equal(imageType(bytes(...Buffer.from('<svg xmlns='))), null);
  assert.equal(imageType(bytes(...Buffer.from('<!DOCTYPE html>'))), null);
  assert.equal(imageType(new ArrayBuffer(0)), null);
});

test('sigla: se cere doar pentru un id numeric de club', () => {
  for (const ok of [20494, '25912', '1']) assert.equal(validClubId(ok), true, String(ok));
  for (const bad of ['', null, undefined, 'abc', '12a', '../x', '12345678', '-1', '1.5']) assert.equal(validClubId(bad), false, String(bad));
});
