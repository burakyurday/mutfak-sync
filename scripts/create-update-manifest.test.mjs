import test from 'node:test';
import assert from 'node:assert/strict';
import {createUpdateManifest} from './create-update-manifest.mjs';

test('kararlı sürüm için iki platformun imzalı manifestini üretir',()=>{
  const manifest=createUpdateManifest({
    version:'1.2.3',
    tag:'v1.2.3',
    repository:'mutfakajans/mutfak-sync',
    publishedAt:'2026-11-13T12:00:00.000Z',
    signatures:{'darwin-aarch64':'mac-signature\n','windows-x86_64':'windows-signature\n'},
  });
  assert.equal(manifest.version,'1.2.3');
  assert.equal(manifest.platforms['darwin-aarch64'].signature,'mac-signature');
  assert.equal(manifest.platforms['windows-x86_64'].url,'https://github.com/mutfakajans/mutfak-sync/releases/download/v1.2.3/mutfak-sync-1.2.3-windows-x86_64-setup.exe');
});

test('boş imzayı reddeder',()=>{
  assert.throws(()=>createUpdateManifest({
    version:'1.2.3',tag:'v1.2.3',repository:'mutfakajans/mutfak-sync',publishedAt:'2026-11-13T12:00:00.000Z',
    signatures:{'darwin-aarch64':'','windows-x86_64':'signature'},
  }),/imzası boş/);
});
