const mongoose = require("mongoose");

const appSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "system",
      trim: true,
    },
    maintenanceMode: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    smsAlerts: { type: Boolean, default: true },
    sessionTimeout: { type: String, default: "30" },
    maxLoginAttempts: { type: String, default: "5" },
    autoApprove: { type: Boolean, default: false },
    darkMode: { type: Boolean, default: false },
    twoFactorAuth: { type: Boolean, default: false },
    appointmentOptions: {
      offices: [
        {
          id: { type: String, trim: true },
          label: { type: String, trim: true },
          enabled: { type: Boolean, default: true },
          deleted: { type: Boolean, default: false },
        },
      ],
      purposes: [
        {
          id: { type: String, trim: true },
          label: { type: String, trim: true },
          enabled: { type: Boolean, default: true },
          deleted: { type: Boolean, default: false },
        },
      ],
      timeSlots: [
        {
          id: { type: String, trim: true },
          label: { type: String, trim: true },
          value: { type: String, trim: true },
          hour: { type: Number },
          minute: { type: Number },
          capacity: { type: Number },
          enabled: { type: Boolean, default: true },
          deleted: { type: Boolean, default: false },
        },
      ],
    },
    mapConfiguration: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("AppSettings", appSettingsSchema);
