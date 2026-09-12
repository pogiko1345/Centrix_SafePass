const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_SYSTEM_SETTINGS,
  sanitizeAppointmentOptions,
  sanitizeSystemSettings,
} = require("../utils/settingsUtils");

test("sanitizeSystemSettings keeps defaults when input is empty", () => {
  assert.deepEqual(sanitizeSystemSettings(), DEFAULT_SYSTEM_SETTINGS);
});

test("sanitizeSystemSettings normalizes booleans and strings", () => {
  const sanitized = sanitizeSystemSettings({
    maintenanceMode: 1,
    emailNotifications: 0,
    sessionTimeout: 45,
    backupFrequency: " weekly ",
  });

  assert.equal(sanitized.maintenanceMode, true);
  assert.equal(sanitized.emailNotifications, false);
  assert.equal(sanitized.sessionTimeout, "45");
  assert.equal("backupFrequency" in sanitized, false);
  assert.equal(sanitized.maxLoginAttempts, DEFAULT_SYSTEM_SETTINGS.maxLoginAttempts);
});

test("sanitizeAppointmentOptions preserves deleted default tombstones", () => {
  const sanitized = sanitizeAppointmentOptions({
    purposes: [{ id: "purpose-enrollment", label: "Enrollment", enabled: false, deleted: true }],
  });

  const enrollment = sanitized.purposes.find((option) => option.label === "Enrollment");
  assert.equal(enrollment.deleted, true);
  assert.equal(enrollment.enabled, false);
  assert.equal(sanitized.purposes.filter((option) => option.label === "Enrollment").length, 1);
});

test("sanitizeAppointmentOptions preserves time slot capacity", () => {
  const sanitized = sanitizeAppointmentOptions({
    timeSlots: [{ label: "9:00 AM", value: "09:00", capacity: 7 }],
  });

  assert.equal(sanitized.timeSlots[0].capacity, 7);
});
