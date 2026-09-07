const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const root = path.resolve(__dirname, '../..');

function service() {
  const filename = path.join(root, 'utils/Alert.web.js');
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-modules-commonjs')],
  });
  const context = { exports: {} };
  vm.runInNewContext(code, context);
  return context.exports;
}
function handler(file, name, globals) {
  const source = fs.readFileSync(path.join(root, 'screens', file), 'utf8');
  let expression;
  traverse(parser.parse(source, { sourceType: 'module', plugins: ['jsx'] }), { VariableDeclarator(p) {
    if (p.node.id.name === name) expression = source.slice(p.node.init.start, p.node.init.end);
  } });
  assert.ok(expression);
  return vm.runInNewContext(`(${expression})`, globals);
}
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const role of ['admin', 'staff', 'student']) test(`${role} confirmation cancels safely and runs the real action once on approval`, async () => {
  const alerts = service(); let calls = 0;
  const noop = () => {};
  const globals = { Alert: alerts.default, console, setProcessingId: noop };
  let run;
  if (role === 'admin') {
    Object.assign(globals, {
      rejectionReason: 'Test reason', ensureAdminAccess: () => true,
      selectedRequest: { _id: 'fixture', fullName: 'Test Visitor' }, visitRequests: [{ _id: 'fixture', status: 'pending' }],
      ApiService: { rejectVisitor: async (id, reason) => { assert.equal(id, 'fixture'); assert.equal(reason, 'Test reason'); calls++; return { success: true }; } },
      setVisitRequests: noop, setPendingRequests: noop, setRejectedRequests: noop, setStats: noop,
      getRequestStatus: row => row.status, publishAdminNotice: noop, setShowRejectModal: noop, setRejectionReason: noop, loadAllVisitRequests: noop,
    });
    run = handler('AdminDashboardScreen.jsx', 'handleRejectRequest', globals);
  } else if (role === 'staff') {
    Object.assign(globals, { appointmentRequests: [{ _id: 'fixture' }], selectedRequestIds: ['fixture'],
      ApiService: { approveStaffAppointment: async id => { assert.equal(id, 'fixture'); calls++; return { success: true }; } },
      setSelectedRequestIds: noop, loadData: noop, showStaffToast: noop,
    });
    run = handler('StaffDashboardScreen.jsx', 'handleBulkApproveRequests', globals);
  } else {
    globals.performLogout = () => calls++;
    run = handler('StudentDashboardScreen.jsx', 'handleLogout', globals);
  }
  await run();
  let notice = alerts.getCurrentAlert();
  assert.ok(notice);
  alerts.dismissAlert(notice.id, 0);
  await flush(); assert.equal(calls, 0);
  await run(); notice = alerts.getCurrentAlert();
  alerts.dismissAlert(notice.id, 1);
  alerts.dismissAlert(notice.id, 1);
  await flush(); assert.equal(calls, 1);
});

test('queued notices preserve order; dismissal does not approve an action', () => {
  const alerts = service(); let approved = false, dismissed = false;
  alerts.default.alert('First', 'Confirm?', [{ text: 'Approve', onPress: () => { approved = true; } }], { onDismiss: () => { dismissed = true; } });
  alerts.default.alert('Second', 'Information');
  assert.equal(alerts.getCurrentAlert().title, 'First');
  alerts.dismissAlert(alerts.getCurrentAlert().id);
  assert.equal(approved, false); assert.equal(dismissed, true);
  assert.equal(alerts.getCurrentAlert().title, 'Second');
  alerts.dismissAlert(alerts.getCurrentAlert().id, 0);
  assert.equal(alerts.getCurrentAlert(), null);
});
