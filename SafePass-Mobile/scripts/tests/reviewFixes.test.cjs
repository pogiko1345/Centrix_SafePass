const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const root = path.resolve(__dirname, '../..');

for (const scenario of ['otp', 'pending', 'verified', 'cancelled']) {
  test('biometric login: ' + scenario, async () => {
    const source = fs.readFileSync(path.join(root, 'screens/LoginScreen.jsx'), 'utf8');
    let handler;
    traverse(parser.parse(source, { sourceType: 'module', plugins: ['jsx'] }), {
      VariableDeclarator(p) {
        if (p.node.id.name === 'handleBiometricLogin') handler = source.slice(p.node.init.start, p.node.init.end);
      },
    });
    let persisted = 0, cleared = 0, navigated, reset = 0, error = '', busy;
    const noop = () => {};
    const globals = {
      Platform: { OS: 'android' }, isLoading: false, isBiometricLoading: false,
      setIsBiometricLoading: value => { busy = value; }, setLoginError: value => { error = value; },
      LocalAuthentication: { authenticateAsync: async () => ({ success: scenario !== 'cancelled' }) },
      getBiometricCredential: async key => key, BIOMETRIC_LOGIN_EMAIL_KEY: 'email', BIOMETRIC_LOGIN_PASSWORD_KEY: 'password',
      setEmail: noop, setPassword: noop, setRememberMe: noop,
      ApiService: {
        verifyCredentials: async () => ({ success: true, user: { role: 'visitor', status: scenario === 'pending' ? 'pending' : 'active' }, tempToken: 'token', requires2FA: scenario !== 'verified' }),
        clearAuth: async () => { cleared++; },
      },
      normalizeRole: role => role, isRoleAllowedInCurrentVariant: () => true,
      persistAuthenticatedSession: async () => { persisted++; },
      navigation: { navigate: (name, params) => { navigated = { name, params }; }, reset: () => { reset++; } },
      IS_VISITOR_ONLY_APP: true,
    };
    await vm.runInNewContext('(' + handler + ')()', globals);
    assert.equal(busy, false);
    assert.equal(persisted, scenario === 'verified' ? 1 : 0);
    assert.equal(reset, scenario === 'verified' ? 1 : 0);
    assert.equal(cleared, scenario === 'pending' ? 1 : 0);
    if (scenario === 'otp') {
      assert.equal(navigated.name, 'Verification');
      assert.equal(navigated.params.tempToken, 'token');
      assert.equal(navigated.params.rememberMe, false);
    }
    if (scenario === 'pending' || scenario === 'cancelled') assert.ok(error);
  });
}

for (const mode of ['date', 'time']) {
  test('web ' + mode + ' picker applies local values and cancels without selecting', () => {
    const filename = path.join(root, 'components/DateTimePicker.web.jsx');
    const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
    });
    const elements = [];
    const react = {
      useState: () => [mode === 'date' ? '2026-10-02' : '15:45', () => {}],
      createElement: (type, props, ...children) => { const element = { type, props, children }; elements.push(element); return element; },
    };
    const rn = { Modal: 'Modal', View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: value => value } };
    const context = { exports: {}, require: name => name === 'react' ? react : rn };
    vm.runInNewContext(code, context);
    const calls = [];
    context.exports.default({ value: new Date(2026, 8, 19, 9, 30), mode, onChange: (...args) => calls.push(args) });
    assert.equal(elements.find(element => element.type === 'input').props.type, mode);
    elements.find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(calls[0][0].type, 'set');
    const selected = calls[0][1];
    if (mode === 'date') {
      assert.equal(selected.getFullYear(), 2026); assert.equal(selected.getMonth(), 9); assert.equal(selected.getDate(), 2);
    } else {
      assert.equal(selected.getHours(), 15); assert.equal(selected.getMinutes(), 45); assert.equal(selected.getDate(), 19);
    }
    elements.find(element => element.type === 'Modal').props.onRequestClose();
    assert.equal(calls[1][0].type, 'dismissed');
    assert.equal(calls[1][1], undefined);
  });
}
