const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const root = path.resolve(__dirname, '../..');

function load(file, mocks = {}, globals = {}) {
  const filename = path.join(root, file);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
  });
  const context = { exports: {}, console, ...globals, require(name) {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.jpg')) return 'logo';
    throw Error('Unexpected dependency: ' + name);
  }};
  vm.runInNewContext(code, context, { filename });
  return context.exports;
}

test('Attendance screen renders its Modal after loading', () => {
  const types = [];
  const react = {
    useState: value => [value === true ? false : value, () => {}],
    useCallback: fn => fn, useMemo: fn => fn(), useEffect() {},
    createElement(type, props, ...children) { assert.ok(type); types.push(type); return { type, props, children }; },
  };
  const rn = Object.fromEntries(['ActivityIndicator','Alert','Modal','Image','RefreshControl','ScrollView','Text','TextInput','TouchableOpacity','View'].map(n => [n, n]));
  rn.StyleSheet = { create: x => x };
  const screen = load('screens/AttendanceRecordsScreen.jsx', {
    react, 'react-native': rn, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, '../utils/ApiService': {},
    '../utils/Alert': { alert() {} },
    '../utils/saveCsv': {}, '../utils/printUtils': {}, '../utils/attendanceExport': {},
  });
  screen.default({ navigation: {} });
  assert.ok(types.includes('Modal'));
});

for (const role of ['student', 'teacher']) {
  test(`Admin handles a server duplicate ${role} ID without throwing`, async () => {
    const source = fs.readFileSync(path.join(root, 'screens/AdminDashboardScreen.jsx'), 'utf8');
    let handler;
    traverse(parser.parse(source, { sourceType: 'module', plugins: ['jsx'] }), {
      VariableDeclarator(p) {
        if (p.node.id.name === 'handleCreateUser') handler = source.slice(p.node.init.start, p.node.init.end);
      },
    });
    let errors = {}, processing, calls = 0;
    const context = {
      console: { error() {} }, ensureAdminAccess: () => true,
      validateCreateUserForm: () => ({ isValid: true, normalizedStudentId: '123', normalizedTeacherId: '456' }),
      setProcessingId: value => { processing = value; },
      newUserData: { role, firstName: 'Test', lastName: 'User' }, isSecurityRole: () => false,
      ApiService: { async createAcademicAccessUser(payload) { calls++; assert.equal(payload.role, role); throw Error('Academic ID already registered'); } },
      setCreateUserErrors: update => { errors = update(errors); },
      publishAdminNotice() {}, Alert: { alert() {} },
    };
    await vm.runInNewContext(`(${handler})()`, context);
    assert.equal(calls, 1);
    assert.equal(errors[role === 'teacher' ? 'teacherId' : 'studentId'], 'This academic ID is already registered.');
    assert.equal(processing, null);
  });
}

test('CSV escapes quotes, preserves multiline names, and tolerates invalid dates', () => {
  const { attendanceCsv, attendanceExportRows, ATTENDANCE_COLUMNS } = load('utils/attendanceExport.js');
  const records = [{ name: 'Doe, "Jane"\nJr', location: '=1+1', checkInTime: 'invalid' }];
  const csv = attendanceCsv(records);
  assert.ok(csv.includes('"Doe, ""Jane""\nJr"'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.equal(attendanceExportRows(records)[0][4], '');
  const { getPrintTableHTML } = load('styles/PrintStyles.js');
  const html = getPrintTableHTML({ columns: ATTENDANCE_COLUMNS.map((label, key) => ({ label, key })), rows: attendanceExportRows(records) });
  assert.ok(html.includes('<th>Name</th>'));
  assert.ok(html.includes('Doe, &quot;Jane&quot;'));
});

test('Native CSV writes a file and opens sharing, and reports unavailable sharing', async () => {
  let available = true, written, shared;
  class File { constructor(base, name) { this.uri = base + name; } create() {} write(content) { written = content; } }
  const save = load('utils/saveCsv.native.js', {
    'expo-file-system': { File, Paths: { cache: 'file:///cache/' } },
    'expo-sharing': { isAvailableAsync: async () => available, shareAsync: async (uri, options) => { shared = { uri, options }; } },
  }).default;
  await save('Name\nJane', 'attendance.csv');
  assert.equal(written, 'Name\nJane');
  assert.equal(shared.uri, 'file:///cache/attendance.csv');
  assert.equal(shared.options.mimeType, 'text/csv');
  available = false;
  await assert.rejects(save('x', 'x.csv'), /unavailable/);
});

test('Connection badge rejects stale results, recovers, and cleans up on blur', async () => {
  let onNetwork, onAppState, cleanup, interval, current, unsubscribed = false;
  const requests = [];
  const hook = load('utils/useServerConnection.js', {
    react: { useCallback: fn => fn, useState: initial => { current = initial; return [initial, v => { current = v; }]; } },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, cb) => { onAppState = cb; return { remove() {} }; } } },
    '@react-native-community/netinfo': { addEventListener: cb => { onNetwork = cb; return () => { unsubscribed = true; }; } },
    '@react-navigation/native': { useFocusEffect: fn => { cleanup = fn(); } },
    './ApiService': { testConnection: () => new Promise(resolve => requests.push(resolve)) },
  }, { setInterval: fn => { interval = fn; return 1; }, clearInterval() {} }).default;
  hook();
  assert.equal(current, null);
  onNetwork({ isConnected: false });
  assert.equal(current, false);
  requests[0](true); await new Promise(setImmediate);
  assert.equal(current, false);
  onNetwork({ isConnected: true, isInternetReachable: true });
  requests[1](true); await new Promise(setImmediate);
  assert.equal(current, true);
  interval(); requests[2](false); await new Promise(setImmediate);
  assert.equal(current, false);
  onAppState('active'); requests[3](true); await new Promise(setImmediate);
  assert.equal(current, true);
  interval(); cleanup(); requests[4](false); await new Promise(setImmediate);
  assert.equal(current, true);
  assert.equal(unsubscribed, true);
});

test('Native Google returns the ID token and handles cancellation/configuration errors', async () => {
  let response = { type: 'success', data: { idToken: 'test-token' } }, failure, configured;
  const api = load('utils/useGoogleSignIn.native.js', {
    'expo-constants': { expoConfig: { extra: { googleClientId: 'web-client' } } },
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-google-signin/google-signin': {
      GoogleSignin: { configure: v => { configured = v; }, hasPlayServices: async () => true, signOut: async () => {}, signIn: async () => { if (failure) throw failure; return response; } },
      statusCodes: { SIGN_IN_CANCELLED: 'cancelled', IN_PROGRESS: 'progress', PLAY_SERVICES_NOT_AVAILABLE: 'services' },
    },
  }).default();
  assert.equal((await api.promptGoogleSignIn()).params.id_token, 'test-token');
  assert.equal(configured.webClientId, 'web-client');
  response = { type: 'cancelled' };
  assert.equal((await api.promptGoogleSignIn()).type, 'cancel');
  failure = Object.assign(Error('developer error'), { code: '10' });
  await assert.rejects(api.promptGoogleSignIn(), /not available for this app version/);
  failure = Error('Network failed');
  await assert.rejects(api.promptGoogleSignIn(), /Network failed/);
});
