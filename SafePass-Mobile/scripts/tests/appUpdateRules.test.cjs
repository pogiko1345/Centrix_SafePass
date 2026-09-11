const test = require("node:test");
const assert = require("node:assert/strict");
const { isNewerBuild, toBuildNumber } = require("../../utils/appUpdateRules");

test("numeric Android builds determine update availability", () => {
  assert.equal(isNewerBuild(101, 101), false);
  assert.equal(isNewerBuild(101, 102), true);
  assert.equal(isNewerBuild(102, 101), false);
  assert.equal(isNewerBuild("101", 102), true);
});

test("invalid build values cannot trigger upgrades or downgrades", () => {
  assert.equal(toBuildNumber("1.02"), 0);
  assert.equal(isNewerBuild(101, "latest"), false);
  assert.equal(isNewerBuild(0, 102), false);
  assert.equal(isNewerBuild(102, 0), false);
});
