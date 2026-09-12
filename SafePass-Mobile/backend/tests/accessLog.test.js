const test = require("node:test");
const assert = require("node:assert/strict");
const AccessLog = require("../models/AccessLog");

test("system activity statuses used by appointment lifecycle validate", () => {
  for (const status of ["no_show", "expired", "warning", "flagged", "cancelled"]) {
    const log = new AccessLog({ accessType: "system", activityType: "appointment_lifecycle", status });
    assert.equal(log.validateSync(), undefined, `${status} should be accepted`);
  }
});

test("unknown access log statuses remain invalid", () => {
  const log = new AccessLog({ accessType: "system", status: "arbitrary" });
  assert.equal(log.validateSync()?.errors?.status?.kind, "enum");
});
