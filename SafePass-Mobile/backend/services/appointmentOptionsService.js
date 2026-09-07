const AppSettings = require("../models/AppSettings");
const { getStaffDirectory } = require("./staffDirectoryService");
const {
  DEFAULT_SYSTEM_SETTINGS,
  sanitizeAppointmentOptions,
} = require("../utils/settingsUtils");

const getSystemSettingsRecord = async () =>
  AppSettings.findOneAndUpdate(
    { key: "system" },
    { $setOnInsert: { key: "system", ...DEFAULT_SYSTEM_SETTINGS } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

const getAppointmentOptions = async ({ activeOnly = false } = {}) => {
  const settingsRecord = await getSystemSettingsRecord();
  const options = sanitizeAppointmentOptions(settingsRecord?.appointmentOptions || {});
  if (!activeOnly) return options;

  const directory = await getStaffDirectory(options.offices);
  return {
    offices: directory.offices,
    staff: directory.staff,
    purposes: options.purposes.filter((option) => !option.deleted && option.enabled !== false),
    timeSlots: options.timeSlots.filter((slot) => !slot.deleted && slot.enabled !== false),
  };
};

const updateAppointmentOptions = async (input = {}) => {
  const options = sanitizeAppointmentOptions(input?.options || input || {});
  await AppSettings.findOneAndUpdate(
    { key: "system" },
    {
      $set: {
        appointmentOptions: options,
        updatedAt: new Date(),
      },
      $setOnInsert: { key: "system", ...DEFAULT_SYSTEM_SETTINGS },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return options;
};

module.exports = {
  getAppointmentOptions,
  updateAppointmentOptions,
};
