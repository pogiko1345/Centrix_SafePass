const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStaffDirectory, parseStaffAssignments } = require('../services/staffDirectoryService');
const { audienceQuery, createPushWorker } = require('../services/pushNotificationService');
const { isPushToken } = require('../routes/pushDeviceRoutes');

test('staff directory excludes inactive accounts and disabled offices, keeps real names and IDs', () => {
  const base = { role: 'staff', isActive: true, status: 'active', department: 'Registrar', firstName: 'Ana', lastName: 'Cruz' };
  const users = [
    { ...base, _id: 'a' }, { ...base, _id: 'b', firstName: 'Bea' },
    { ...base, _id: 'c', isActive: false }, { ...base, _id: 'd', status: 'suspended' },
    { ...base, _id: 'e', role: 'admin' }, { ...base, _id: 'f', department: 'Accounting' },
  ];
  const directory = buildStaffDirectory(users, [{ label: 'Accounting', enabled: false }, { label: 'Library', enabled: true }]);
  assert.deepEqual(directory.staff.map(staff => staff.id), ['a', 'b']);
  assert.equal(directory.staff[0].name, 'Ana Cruz');
  assert.deepEqual(directory.offices, [{ label: 'Registrar', enabled: true }]);
});

test('staff selection accepts exact account IDs and rejects malformed inputs', () => {
  const id = '0123456789abcdef01234567';
  assert.equal(parseStaffAssignments(JSON.stringify({ Registrar: id })).Registrar, id);
  for (const input of ['{', '[]', { Registrar: { $ne: null } }, { Registrar: 'random' }]) {
    assert.throws(() => parseStaffAssignments(input), { status: 400 });
  }
  assert.deepEqual(parseStaffAssignments(undefined), {});
});

test('push audience requires both the target account and role; security aliases are preserved', () => {
  assert.equal(audienceQuery({ targetRole: 'visitor', targetUser: 'visitor-1' })._id, 'visitor-1');
  assert.equal(audienceQuery({ targetRole: 'visitor', targetUser: 'visitor-1' }).role, 'visitor');
  assert.deepEqual(audienceQuery({ targetRole: 'guard' }).role, { $in: ['guard', 'security'] });
  assert.equal(audienceQuery({ targetRole: 'all' }).role, undefined);
  assert.ok(isPushToken('ExponentPushToken[abc-123_]'));
  assert.equal(isPushToken('invalid'), false);
});

function workerFixture({ status = 'pending', response, device = true, outage = false } = {}) {
  const updates = [], removed = [], requests = [];
  const delivery = { _id: 'delivery', notification: 'notice', user: 'visitor-1', token: 'ExpoPushToken[test]', status, attempts: 1, ticketId: 'ticket' };
  let claimed = false;
  const chain = value => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => value });
  const worker = createPushWorker({
    Notification: { find: () => chain([]), findById: () => chain({ _id: 'notice', title: 'Approved', message: 'Your visit is approved', targetRole: 'visitor', targetUser: 'visitor-1' }) },
    User: { findOne: () => chain({ _id: 'visitor-1' }) },
    PushDevice: { findOne: () => chain(device ? { user: 'visitor-1' } : null), deleteOne: async query => removed.push(query) },
    PushDelivery: { findOneAndUpdate: async () => { if (claimed) return null; claimed = true; return delivery; }, updateOne: async (query, update) => updates.push(update.$set) },
    fetchImpl: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); if (outage) throw Error('Network unavailable'); return { ok: true, json: async () => ({ data: response }) }; },
  });
  return { worker, updates, removed, requests };
}

test('approval push carries account and notification IDs and persists the ticket', async () => {
  const f = workerFixture({ response: [{ status: 'ok', id: 'ticket' }] });
  await f.worker.runOnce();
  assert.equal(f.requests[0].body[0].data.recipientUserId, 'visitor-1');
  assert.equal(f.requests[0].body[0].data.notificationId, 'notice');
  assert.equal(f.updates[0].status, 'ticketed');
});
test('queued notification is not sent after its device changes account or logs out', async () => {
  const f = workerFixture({ device: false });
  await f.worker.runOnce();
  assert.equal(f.requests.length, 0);
  assert.equal(f.updates[0].status, 'failed');
});
test('transient send failure is retried, receipt outage does not resend accepted push', async () => {
  const send = workerFixture({ outage: true }); await send.worker.runOnce();
  assert.equal(send.updates[0].status, 'pending');
  const receipt = workerFixture({ status: 'ticketed', outage: true }); await receipt.worker.runOnce();
  assert.ok(receipt.requests[0].url.endsWith('/getReceipts'));
  assert.equal(receipt.updates[0].status, undefined);
});
test('invalid-device receipt removes only that account token and stops retrying', async () => {
  const f = workerFixture({ status: 'ticketed', response: { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } } });
  await f.worker.runOnce();
  assert.deepEqual(f.removed, [{ token: 'ExpoPushToken[test]', user: 'visitor-1' }]);
  assert.equal(f.updates[0].status, 'failed');
});
