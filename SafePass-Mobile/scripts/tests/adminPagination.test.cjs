const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const filename = path.resolve(__dirname, '../../utils/adminPagination.js');
const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false,
  plugins: [require('@babel/plugin-transform-modules-commonjs')],
});
const context = { exports: {} };
vm.runInNewContext(code, context, { filename });
const { fetchAllAdminPages } = context.exports;

test('Admin loads every page without duplicating records', async () => {
  const requested = [];
  const response = await fetchAllAdminPages(async (page) => {
    requested.push(page);
    if (page === 1) return { users: [{ _id: 'a' }, { _id: 'b' }], totalPages: 3 };
    if (page === 2) return { users: [{ _id: 'b' }, { _id: 'c' }] };
    return { users: [{ _id: 'd' }] };
  }, 'users');
  assert.deepEqual(requested, [1, 2, 3]);
  assert.deepEqual(Array.from(response.users, (user) => user._id), ['a', 'b', 'c', 'd']);
});

test('Admin rejects incomplete paginated responses', async () => {
  await assert.rejects(fetchAllAdminPages(async (page) => page === 1
    ? { visitors: [{ _id: 'a' }], totalPages: 2 }
    : {}, 'visitors'), /page 2/);
});
