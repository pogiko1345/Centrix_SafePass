const DEFAULT_SYSTEM_SETTINGS = {
  maintenanceMode: false,
  emailNotifications: true,
  smsAlerts: true,
  sessionTimeout: "30",
  maxLoginAttempts: "5",
  autoApprove: false,
  darkMode: false,
  twoFactorAuth: false,
};

const DEFAULT_APPOINTMENT_PURPOSE_OPTIONS = [
  "Enrollment",
  "Payment",
  "Inquiry",
  "Document Request",
  "Other",
];

const DEFAULT_APPOINTMENT_DEPARTMENT_OPTIONS = [
  "Academy Director",
  "Accounting Office",
  "Registrar",
  "Registrar's Office",
  "Accounting",
  "Administration",
  "Admissions",
  "Cashier",
  "Chairman",
  "Clinic",
  "Conference Room",
  "Faculty Room",
  "File Room",
  "Flight Operations",
  "Guidance",
  "Head Of Training Room",
  "Information Desk",
  "I.T Room",
  "Laboratory",
  "Library",
  "Lobby",
  "Mock Up",
  "STO",
  "Storage",
  "Student Services",
  "Students Lounge",
  "TESDA",
  "Tools Room",
  "Training",
  "Workshop",
  "Classroom 1",
  "Classroom 2",
  "Classroom 3",
  "Classroom 4",
  "Classroom 5",
  "Classroom 6",
  "Classroom 7",
  "Classroom 8",
];

const DEFAULT_APPOINTMENT_TIME_SLOTS = [];
const DEFAULT_APPOINTMENT_SLOT_LIMIT = 3;
for (let hour = 7; hour <= 18; hour += 1) {
  for (const minute of [0, 30]) {
    const hour12 = hour % 12 || 12;
    const suffix = hour >= 12 ? "PM" : "AM";
    DEFAULT_APPOINTMENT_TIME_SLOTS.push({
      id: `slot-${String(hour).padStart(2, "0")}-${String(minute).padStart(2, "0")}`,
      label: `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`,
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      hour,
      minute,
      capacity: DEFAULT_APPOINTMENT_SLOT_LIMIT,
      enabled: true,
    });
  }
}

const toAppointmentOption = (value, prefix) => {
  if (typeof value === "string") {
    const label = value.trim().replace(/\s+/g, " ");
    return label
      ? {
          id: `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
          label,
          enabled: true,
          deleted: false,
        }
      : null;
  }

  const label = String(value?.label || value?.name || value?.value || "").trim().replace(/\s+/g, " ");
  if (!label) return null;

  return {
    id:
      String(value?.id || "").trim() ||
      `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
    label,
    enabled: value?.enabled !== false,
    deleted: value?.deleted === true,
  };
};

const parseTimeSlotValue = (slot = {}) => {
  const value = String(slot?.value || slot?.label || "").trim();
  const match = value.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) {
    const hour = Number(slot?.hour);
    const minute = Number(slot?.minute);
    if (Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = String(match[3] || "").toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
};

const formatTimeSlotLabel = ({ hour, minute }) => {
  const hour12 = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
};

const toAppointmentTimeSlot = (slot) => {
  const parsed = parseTimeSlotValue(slot);
  if (!parsed) return null;
  const value = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
  const capacity = Number(slot?.capacity ?? slot?.limit ?? DEFAULT_APPOINTMENT_SLOT_LIMIT);
  return {
    id: String(slot?.id || "").trim() || `slot-${value.replace(":", "-")}`,
    label: String(slot?.label || "").trim() || formatTimeSlotLabel(parsed),
    value,
    hour: parsed.hour,
    minute: parsed.minute,
    capacity:
      Number.isInteger(capacity) && capacity >= 1 && capacity <= 50
        ? capacity
        : DEFAULT_APPOINTMENT_SLOT_LIMIT,
    enabled: slot?.enabled !== false,
    deleted: slot?.deleted === true,
  };
};

const dedupeByLabel = (options) => {
  const seen = new Set();
  return options.filter((option) => {
    const key = String(option.label || option.value || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeTimeSlots = (slots) => {
  const seen = new Set();
  return slots
    .filter((slot) => {
      const key = String(slot.value || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.hour * 60 + left.minute - (right.hour * 60 + right.minute));
};

const mergeOptionsWithDefaults = (sourceOptions = [], defaultOptions = []) => {
  const sourceMap = new Map();
  sourceOptions.forEach((option) => {
    const key = String(option?.label || option?.value || "").trim().toLowerCase();
    if (key) sourceMap.set(key, option);
  });

  return dedupeByLabel([
    ...sourceOptions,
    ...defaultOptions.filter((option) => {
      const key = String(option?.label || option?.value || "").trim().toLowerCase();
      return key && !sourceMap.has(key);
    }),
  ]);
};

const DEFAULT_APPOINTMENT_OPTIONS = {
  offices: DEFAULT_APPOINTMENT_DEPARTMENT_OPTIONS.map((label) => toAppointmentOption(label, "office")),
  purposes: DEFAULT_APPOINTMENT_PURPOSE_OPTIONS.map((label) => toAppointmentOption(label, "purpose")),
  timeSlots: DEFAULT_APPOINTMENT_TIME_SLOTS,
};

const sanitizeAppointmentOptions = (input = {}) => {
  const source = input?.appointmentOptions || input || {};
  const sourceOffices = (Array.isArray(source.offices) ? source.offices : [])
    .map((item) => toAppointmentOption(item, "office"))
    .filter(Boolean);
  const sourcePurposes = (Array.isArray(source.purposes) ? source.purposes : [])
    .map((item) => toAppointmentOption(item, "purpose"))
    .filter(Boolean);
  const offices = mergeOptionsWithDefaults(sourceOffices, DEFAULT_APPOINTMENT_OPTIONS.offices);
  const purposes = mergeOptionsWithDefaults(sourcePurposes, DEFAULT_APPOINTMENT_OPTIONS.purposes);
  const timeSlots = dedupeTimeSlots(
    (Array.isArray(source.timeSlots) ? source.timeSlots : DEFAULT_APPOINTMENT_OPTIONS.timeSlots)
      .map(toAppointmentTimeSlot)
      .filter(Boolean),
  );

  return {
    offices: offices.length ? offices : DEFAULT_APPOINTMENT_OPTIONS.offices,
    purposes: purposes.length ? purposes : DEFAULT_APPOINTMENT_OPTIONS.purposes,
    timeSlots: timeSlots.length ? timeSlots : DEFAULT_APPOINTMENT_OPTIONS.timeSlots,
  };
};

const SETTINGS_BOOLEAN_KEYS = [
  "maintenanceMode",
  "emailNotifications",
  "smsAlerts",
  "autoApprove",
  "darkMode",
  "twoFactorAuth",
];

const SETTINGS_STRING_KEYS = ["sessionTimeout", "maxLoginAttempts"];

const sanitizeSystemSettings = (input = {}) => {
  const sanitized = { ...DEFAULT_SYSTEM_SETTINGS };

  SETTINGS_BOOLEAN_KEYS.forEach((key) => {
    if (input[key] !== undefined) {
      sanitized[key] = Boolean(input[key]);
    }
  });

  SETTINGS_STRING_KEYS.forEach((key) => {
    if (input[key] !== undefined) {
      sanitized[key] = String(input[key] ?? DEFAULT_SYSTEM_SETTINGS[key]).trim() || DEFAULT_SYSTEM_SETTINGS[key];
    }
  });

  return sanitized;
};

const sanitizeMapConfiguration = (input = {}) => {
  const source = input?.mapConfiguration || input?.mapSettings || input?.settings || input || {};
  const rooms = (Array.isArray(source.rooms) ? source.rooms : [])
    .map((room) => ({
      id: String(room?.id || "").trim(),
      name: String(room?.name || "").trim().replace(/\s+/g, " "),
      floor: String(room?.floor || "").trim(),
      icon: String(room?.icon || "business-outline").trim() || "business-outline",
    }))
    .filter((room) => room.id && room.name && room.floor)
    .slice(0, 250);

  const sourcePositions =
    source.roomPositions && typeof source.roomPositions === "object"
      ? source.roomPositions
      : source.positions && typeof source.positions === "object"
        ? source.positions
        : {};

  const roomPositions = Object.entries(sourcePositions).reduce((nextPositions, [roomId, position]) => {
    const id = String(roomId || "").trim();
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (id && Number.isFinite(x) && Number.isFinite(y)) {
      nextPositions[id] = {
        x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)),
        y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)),
      };
    }
    return nextPositions;
  }, {});

  return {
    rooms,
    roomPositions,
  };
};

module.exports = {
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_APPOINTMENT_OPTIONS,
  DEFAULT_APPOINTMENT_SLOT_LIMIT,
  DEFAULT_APPOINTMENT_PURPOSE_OPTIONS,
  DEFAULT_APPOINTMENT_DEPARTMENT_OPTIONS,
  sanitizeSystemSettings,
  sanitizeAppointmentOptions,
  sanitizeMapConfiguration,
};
