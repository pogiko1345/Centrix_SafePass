const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadHook(file, mocks) {
  const directory = path.dirname(require.resolve('@react-navigation/native/package.json'));
  const filename = path.join(directory, 'lib/commonjs', file);
  const context = { exports: {}, require(name) {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.exports.default;
}

test('web navigation does not import or register the native BackHandler', () => {
  const hook = loadHook('useBackButton.js', {});
  hook({ current: { canGoBack: () => true, goBack: () => assert.fail('Web uses browser history') } });
});

test('native navigation still handles hardware Back and removes its listener', () => {
  let listener, cleanup, canGoBack = true, navigations = 0, removals = 0;
  const hook = loadHook('useBackButton.native.js', {
    react: { useEffect(effect) { cleanup = effect(); } },
    'react-native': { BackHandler: { addEventListener(event, callback) {
      assert.equal(event, 'hardwareBackPress');
      listener = callback;
      return { remove() { removals++; } };
    } } },
  });
  const ref = { current: { canGoBack: () => canGoBack, goBack: () => navigations++ } };
  hook(ref);
  assert.equal(listener(), true);
  assert.equal(navigations, 1);
  canGoBack = false;
  assert.equal(listener(), false);
  ref.current = null;
  assert.equal(listener(), false);
  cleanup();
  assert.equal(removals, 1);
});
