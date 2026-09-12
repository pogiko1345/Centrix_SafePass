const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const root = path.resolve(__dirname, '../..');

test('native push skips unconfigured Firebase and registers only the signed-in account when configured', async () => {
  const filename = path.join(root, 'utils/pushNotifications.native.js');
  const { code } = require('@babel/core').transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-modules-commonjs')],
  });
  let requests = [], received, removed = 0, permission = 'granted';
  const constants = { expoConfig: { extra: { pushNotificationsConfigured: false, eas: { projectId: 'project' } } } };
  const notifications = {
    setNotificationHandler() {}, AndroidImportance: { HIGH: 4 },
    addNotificationReceivedListener: fn => { received = fn; return { remove: () => removed++ }; },
    addNotificationResponseReceivedListener: () => ({ remove: () => removed++ }),
    addPushTokenListener: () => ({ remove: () => removed++ }),
    setNotificationChannelAsync: async () => {}, getPermissionsAsync: async () => ({ granted: permission === 'granted', status: permission }),
    getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[test]' }),
    getLastNotificationResponseAsync: async () => null, clearLastNotificationResponseAsync: async () => {},
  };
  const mocks = { 'expo-notifications': notifications, 'expo-constants': constants,
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove: () => removed++ }) } },
    '@react-native-async-storage/async-storage': { setItem: async () => {}, getItem: async () => null },
  };
  const context = { exports: {}, require: name => mocks[name], setInterval: () => 1, clearInterval() {}, console };
  vm.runInNewContext(code, context);
  const api = { getCurrentUser: async () => ({ _id: 'visitor' }), fetch: async (...args) => requests.push(args) };
  await context.exports.startPushNotifications(api, 'visitor', () => {});
  assert.equal(received, undefined);
  constants.expoConfig.extra.pushNotificationsConfigured = true;
  let noticed = 0;
  const stop = await context.exports.startPushNotifications(api, 'visitor', () => noticed++);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests[0][0], '/notifications/device');
  assert.equal(requests[0][1].body.token, 'ExpoPushToken[test]');
  received({ request: { content: { data: { recipientUserId: 'other' } } } });
  assert.equal(noticed, 0);
  received({ request: { content: { data: { recipientUserId: 'visitor' } } } });
  assert.equal(noticed, 1);
  stop();
  assert.equal(removed, 4);
});

test('shared inbox shows all unread types without marking them read and discards results after logout', async () => {
  const babel = require('@babel/core');
  const filename = path.join(root, 'components/NotificationInbox.jsx');
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
  });
  const states = [], effects = [];
  let tick, logout, pending, readCalls = 0, refreshCalls = 0;
  let rows = [{ _id: 'approval', type: 'success', title: 'Approved' }, { _id: 'schedule', type: 'info', title: 'Schedule changed' }];
  const react = { useState(value) { const index = states.length; states.push(value); return [value, next => { states[index] = next; }]; },
    useEffect(fn) { effects.push(fn); }, createElement() { return {}; } };
  const api = { getCurrentUser: async () => ({ _id: 'visitor' }), getNotifications: async () => pending || { notifications: rows }, markNotificationAsRead: async () => readCalls++ };
  const mocks = { react, 'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '../utils/ApiService': { default: api, __esModule: true },
    '../utils/notificationEvents': { emitNotificationUpdate: () => refreshCalls++, subscribeNotificationLogout: fn => { logout = fn; return () => {}; } },
    '../utils/pushNotifications': { startPushNotifications: async () => () => {}, clearDeliveredNotifications: async () => {} },
  };
  const context = { exports: {}, require: name => mocks[name], setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, setTimeout, clearTimeout, console };
  vm.runInNewContext(code, context);
  context.exports.default({ currentUser: { _id: 'visitor' } });
  const cleanup = effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states[1].length, 2);
  assert.equal(states[3]._id, 'approval');
  assert.equal(readCalls, 0);
  assert.equal(refreshCalls, 1);
  let resolvePending;
  pending = new Promise(resolve => { resolvePending = resolve; });
  const refreshing = tick();
  await new Promise(resolve => setImmediate(resolve));
  logout();
  resolvePending({ notifications: [{ _id: 'old-account-notice' }] });
  await refreshing;
  assert.equal(states[0], null);
  assert.equal(states[1].length, 0);
  assert.equal(states[3], null);
  cleanup();
});

test('visitor dashboard loads complete appointment payload, isolates offline caches, and rejects auth failures', async () => {
  const source = fs.readFileSync(path.join(root, 'utils/ApiService.js'), 'utf8');
  let method;
  traverse(parser.parse(source, { sourceType: 'module' }), { ClassMethod(p) {
    if (p.node.key.name === 'getVisitorProfileCached') method = source.slice(p.node.start, p.node.end);
  } });
  assert.ok(method);
  const cache = new Map();
  const service = vm.runInNewContext(`({ ${method} })`, {
    AsyncStorage: { getItem: async key => cache.get(key), setItem: async (key,value) => cache.set(key,value) },
    AbortController, setTimeout, clearTimeout,
    isNetworkLikeError: error => error.message === 'Network unavailable', logApiDebug() {},
  });
  let account = 'visitor-a';
  service.getCurrentUser = async () => ({ _id: account });
  const payload = { visitor: { _id: 'visit', appointmentStatus: 'approved' }, account: { _id: account }, appointments: [{ _id: 'visit' }] };
  service.fetch = async endpoint => { assert.equal(endpoint, '/visitor/profile'); return payload; };
  assert.equal(await service.getVisitorProfileCached(), payload);
  service.fetch = async () => { throw Error('Network unavailable'); };
  assert.equal((await service.getVisitorProfileCached()).appointments[0]._id, 'visit');
  account = 'visitor-b';
  await assert.rejects(service.getVisitorProfileCached(), /Network unavailable/);
  account = 'visitor-a';
  service.fetch = async () => { throw Error('Unauthorized'); };
  await assert.rejects(service.getVisitorProfileCached(), /Unauthorized/);
});

test('choosing a different staff member in the same office replaces the recipient and resets time', () => {
  const source = fs.readFileSync(path.join(root, 'screens/VisitorDashboardScreen.jsx'), 'utf8');
  let expression;
  traverse(parser.parse(source, { sourceType: 'module', plugins: ['jsx'] }), { VariableDeclarator(p) {
    if (p.node.id.name === 'toggleAppointmentDepartment') expression = source.slice(p.node.init.start, p.node.init.end);
  } });
  let form = { staffAssignments: { Registrar: 'a', Accounting: 'c' }, preferredTime: new Date() };
  const toggle = vm.runInNewContext(`(${expression})`, { setHasAppointmentDraft() {}, setAppointmentForm: update => { form = update(form); } });
  toggle({ id: 'b', department: 'Registrar' });
  assert.equal(form.staffAssignments.Registrar, 'b');
  assert.equal(form.staffAssignments.Accounting, 'c');
  assert.equal(form.departments.length, 2);
  assert.equal(form.preferredTime, null);
  toggle({ id: 'b', department: 'Registrar' });
  assert.equal(form.staffAssignments.Registrar, undefined);
  assert.equal(form.departments.length, 1);
});

test('visitor profile editing is mounted and uses the backend phone field', () => {
  const source = fs.readFileSync(path.join(root, 'screens/VisitorDashboardScreen.jsx'), 'utf8');
  let saveHandler;
  traverse(parser.parse(source, { sourceType: 'module', plugins: ['jsx'] }), { VariableDeclarator(p) {
    if (p.node.id.name === 'handleProfileEditSave') saveHandler = source.slice(p.node.init.start, p.node.init.end);
  } });
  assert.match(source, /\{renderProfileEditModal\(\)\}/);
  assert.ok(saveHandler);
  assert.match(saveHandler, /phone:\s*profileEditForm\.phoneNumber\.trim\(\)/);
});

test('new appointment requests require a fresh time and format slots as wall-clock values', () => {
  const source = fs.readFileSync(path.join(root, 'screens/VisitorDashboardScreen.jsx'), 'utf8');
  assert.match(source, /const buildAppointmentForm[\s\S]*?preferredTime:\s*null/);
  assert.match(source, /const formatAppointmentSlotTime[\s\S]*?toLocaleTimeString/);
  assert.match(source, /\{formatAppointmentSlotTime\(option\)\}/);
  assert.match(source, /time:\s*formatAppointmentSlotTime\(preferredTime\)/);
});

test('appointment submission has a synchronous duplicate-request guard', () => {
  const source = fs.readFileSync(path.join(root, 'screens/VisitorDashboardScreen.jsx'), 'utf8');
  assert.match(source, /const appointmentSubmitInFlightRef = useRef\(false\)/);
  assert.match(source, /const handleRequestAppointment[\s\S]*?if \(appointmentSubmitInFlightRef\.current\) return/);
  assert.match(source, /appointmentSubmitInFlightRef\.current = true[\s\S]*?finally \{[\s\S]*?appointmentSubmitInFlightRef\.current = false/);
});

test('multi-department approvals do not collide as duplicate appointments', () => {
  const source = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  let expression;
  traverse(parser.parse(source, { sourceType: 'script' }), { VariableDeclarator(p) {
    if (p.node.id.name === 'getApprovedAppointmentDuplicateKey') expression = source.slice(p.node.init.start, p.node.init.end);
  } });
  assert.ok(expression);
  const getKey = vm.runInNewContext(`(${expression})`, {
    normalizeAppointmentDuplicateText: value => String(value || '').trim().toLowerCase(),
    normalizeDepartmentValue: value => String(value || '').trim().toLowerCase().replace("registrar's office", 'registrar'),
    getAppointmentDuplicateDayKey: () => '2026-09-09',
  });
  const base = { email: 'visitor@example.com', purposeOfVisit: 'Enrollment', visitDate: new Date() };
  assert.notEqual(
    getKey({ ...base, appointmentDepartment: 'Registrar' }),
    getKey({ ...base, appointmentDepartment: 'Accounting' }),
  );
  assert.equal(
    getKey({ ...base, appointmentDepartment: 'Registrar' }),
    getKey({ ...base, appointmentDepartment: "Registrar's Office" }),
  );
});

test('backend selected staff lookup enforces exact ID, active status, role and office', async () => {
  const source = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  let expression;
  traverse(parser.parse(source, { sourceType: 'script' }), { VariableDeclarator(p) {
    if (p.node.id.name === 'findActiveStaffForDepartment') expression = source.slice(p.node.init.start, p.node.init.end);
  } });
  let query;
  const find = vm.runInNewContext(`(${expression})`, {
    User: { findOne(value) { query = value; return { sort: async () => null }; } },
    getStaffDepartmentQuery: office => office,
  });
  await find('Registrar', 'selected-account');
  assert.equal(query._id, 'selected-account');
  assert.equal(query.department, 'Registrar');
  assert.equal(query.role, 'staff');
  assert.equal(query.isActive, true);
  assert.equal(query.status, 'active');
});
