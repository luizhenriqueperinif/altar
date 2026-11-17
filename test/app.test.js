const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { versaoDoApk } = require('../src/main/servidor');

// O notebook diz ao aplicativo do celular qual versão do aplicativo ele carrega; o celular compara e oferece atualizar.
function pasta() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'altar-apk-'));
}
const ficha = codigo => JSON.stringify({ version: 3, elements: [{ type: 'SINGLE', versionCode: codigo, versionName: '1.1.4', outputFile: 'app-release.apk' }] });

test('versão do aplicativo: no programa instalado, a ficha vai ao lado do APK (Altar.apk.json)', () => {
  const p = pasta();
  fs.writeFileSync(path.join(p, 'Altar.apk'), 'apk');
  fs.writeFileSync(path.join(p, 'Altar.apk.json'), ficha(7));
  assert.strictEqual(versaoDoApk(path.join(p, 'Altar.apk')), 7);
});

test('versão do aplicativo: em desenvolvimento, vale a ficha que o Gradle deixa na pasta do APK', () => {
  const p = pasta();
  fs.writeFileSync(path.join(p, 'app-release.apk'), 'apk');
  fs.writeFileSync(path.join(p, 'output-metadata.json'), ficha(3));
  assert.strictEqual(versaoDoApk(path.join(p, 'app-release.apk')), 3);
});

test('versão do aplicativo: sem ficha, ou com ficha estranha, não oferece atualização', () => {
  const p = pasta();
  fs.writeFileSync(path.join(p, 'Altar.apk'), 'apk');
  assert.strictEqual(versaoDoApk(path.join(p, 'Altar.apk')), null);
  fs.writeFileSync(path.join(p, 'Altar.apk.json'), '{ "elements": [] }');
  assert.strictEqual(versaoDoApk(path.join(p, 'Altar.apk')), null);
  fs.writeFileSync(path.join(p, 'Altar.apk.json'), ficha('3'));
  assert.strictEqual(versaoDoApk(path.join(p, 'Altar.apk')), null);
  assert.strictEqual(versaoDoApk(null), null);
});
