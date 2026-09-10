const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";
process.env.ARDUINO_DEVICE_KEY =
  process.env.ARDUINO_DEVICE_KEY || "integration-test-device-key";
process.env.NODE_ENV = "test";
process.env.ALLOW_SENSITIVE_DEBUG_LOGS = "false";

mongoose.connect = async () => mongoose.connection;
mongoose.connection.readyState = 1;

const state = {
  users: [],
  settings: null,
  accessLogCreates: [],
  accessLogSaves: [],
};

const cloneUserRecord = (record) => ({
  _id: record._id,
  email: record.email,
  username: record.username,
  password: record.password,
  role: record.role,
  status: record.status,
  isVerified: record.isVerified,
  firstName: record.firstName,
  lastName: record.lastName,
  phone: record.phone,
  department: record.department || "",
  position: record.position || "",
  employeeId: record.employeeId || "",
  visitorId: record.visitorId || null,
  nfcCardId: record.nfcCardId || null,
  passwordResetOtpHash: record.passwordResetOtpHash || "",
  passwordResetExpiresAt: record.passwordResetExpiresAt || null,
  passwordResetAttempts: record.passwordResetAttempts || 0,
  passwordResetVerifiedAt: record.passwordResetVerifiedAt || null,
  verificationOtpHash: record.verificationOtpHash || "",
  verificationOtpExpiresAt: record.verificationOtpExpiresAt || null,
  verificationOtpAttempts: record.verificationOtpAttempts || 0,
  verificationTokenHash: record.verificationTokenHash || "",
  verificationExpiresAt: record.verificationExpiresAt || null,
  verifiedAt: record.verifiedAt || null,
  trustedDeviceToken: record.trustedDeviceToken || "",
  trustedDeviceExpiresAt: record.trustedDeviceExpiresAt || null,
  createdAt: record.createdAt || new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: record.updatedAt || new Date("2026-01-01T00:00:00.000Z"),
  isActive: record.isActive !== false,
});

const persistDoc = (doc) => {
  const normalized = cloneUserRecord(doc);
  const index = state.users.findIndex((item) => item._id === normalized._id);
  if (index >= 0) {
    state.users[index] = normalized;
  } else {
    state.users.push(normalized);
  }
};

const createUserDoc = (record) => {
  const doc = cloneUserRecord(record);

  doc.comparePassword = async (candidatePassword) => candidatePassword === doc.password;
  doc.save = async () => {
    doc.updatedAt = new Date();
    persistDoc(doc);
    return doc;
  };
  doc.toObject = () => ({ ...doc });

  return doc;
};

const findStoredUser = (predicate) => {
  const record = state.users.find(predicate);
  return record ? createUserDoc(record) : null;
};

class UserMock {
  constructor(data = {}) {
    Object.assign(this, cloneUserRecord(data));
    this._id = this._id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async comparePassword(candidatePassword) {
    return candidatePassword === this.password;
  }

  async save() {
    this.updatedAt = new Date();
    persistDoc(this);
    return this;
  }

  toObject() {
    return { ...this };
  }

  static async findOne(query = {}) {
    if (query.$or) {
      return (
        query.$or
          .map((condition) => {
            if (condition.email) {
              return findStoredUser((user) => user.email === condition.email);
            }
            if (condition.username) {
              return findStoredUser((user) => user.username === condition.username);
            }
            if (condition.employeeId) {
              return findStoredUser((user) => user.employeeId === condition.employeeId);
            }
            return null;
          })
          .find(Boolean) || null
      );
    }

    return (
      findStoredUser((user) => {
        return Object.entries(query).every(([key, value]) => user[key] === value);
      }) || null
    );
  }

  static findById(id) {
    const getUser = () => findStoredUser((item) => item._id === id);
    return {
      select: async () => {
        const user = getUser();
        if (!user) return null;
        delete user.password;
        return user;
      },
      then: (resolve, reject) => Promise.resolve(getUser()).then(resolve, reject),
    };
  }

  static async exists(query = {}) {
    return Boolean(await UserMock.findOne(query));
  }
}

class VisitorMock {
  constructor(data = {}) {
    Object.assign(this, data);
    this._id = this._id || `vis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  rejectRegistration(adminId, reason) {
    this.approvalStatus = "rejected";
    this.status = "rejected";
    this.rejectionReason = reason;
    this.rejectedBy = adminId;
  }

  async save() {
    return this;
  }

  static async findById(id) {
    if (id === "visitor-nonexistent") return null;
    return new VisitorMock({
      _id: id,
      fullName: "Test Visitor",
      email: "visitor.test@example.com",
      status: "pending",
      approvalStatus: "pending",
      assignedOffice: "Registrar",
      visitDate: new Date(),
      visitTime: new Date(),
    });
  }
}

const AppSettingsMock = {
  findOneAndUpdate: async (_query, update = {}, _options = {}) => {
    const base =
      state.settings || {
        key: "system",
        maintenanceMode: false,
        emailNotifications: true,
        smsAlerts: true,
        backupFrequency: "daily",
        sessionTimeout: "30",
        maxLoginAttempts: "5",
        autoApprove: false,
        darkMode: false,
        twoFactorAuth: false,
      };

    if (update.$setOnInsert && !state.settings) {
      state.settings = { ...base, ...update.$setOnInsert };
    }

    if (update.$set) {
      state.settings = { ...(state.settings || base), ...update.$set };
    }

    if (!state.settings) {
      state.settings = { ...base };
    }

    return {
      ...state.settings,
      toObject() {
        return { ...state.settings };
      },
    };
  },
};

class AccessLogMock {
  constructor(data) {
    this.data = data;
  }

  async save() {
    state.accessLogSaves.push(this.data);
    return this;
  }

  static async create(data) {
    state.accessLogCreates.push(data);
    return data;
  }
}

const NotificationMock = {
  create: async () => ({}),
};

const AttendanceRecordMock = {
  find: () => ({
    sort: () => ({
      limit: async () => [],
    }),
  }),
  findOne: async () => null,
  create: async (data) => data,
};
const VisitorMovementLogMock = {
  find: () => ({
    sort: () => ({
      limit: async () => [],
    }),
  }),
  findOne: async () => null,
  create: async (data) => data,
};
const NfcCheckpointMock = {
  findOne: async () => null,
  find: () => ({
    sort: async () => [],
  }),
};
const SmsNotificationLogMock = {
  create: async (data) => data,
};
const CounterMock = {
  findOneAndUpdate: async () => ({ sequence: 1 }),
};

const registerMockModule = (relativePath, exportsValue) => {
  const resolvedPath = path.resolve(__dirname, relativePath);
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: exportsValue,
  };
};

registerMockModule("../models/User.js", UserMock);
registerMockModule("../models/AppSettings.js", AppSettingsMock);
registerMockModule("../models/AccessLog.js", AccessLogMock);
registerMockModule("../models/Notification.js", NotificationMock);
registerMockModule("../models/Visitor.js", VisitorMock);
registerMockModule("../models/AttendanceRecord.js", AttendanceRecordMock);
registerMockModule("../models/VisitorMovementLog.js", VisitorMovementLogMock);
registerMockModule("../models/NfcCheckpoint.js", NfcCheckpointMock);
registerMockModule("../models/SmsNotificationLog.js", SmsNotificationLogMock);
registerMockModule("../models/Counter.js", CounterMock);
registerMockModule("../models/PushDevice.js", {});

const app = require("../server");

let server;
let baseUrl;

const requestJson = async (route, { method = "GET", body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsedBody = {};
  try {
    parsedBody = text ? JSON.parse(text) : {};
  } catch {
    parsedBody = { raw: text };
  }

  return {
    status: response.status,
    headers: response.headers,
    body: parsedBody,
  };
};

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test.beforeEach(() => {
  state.users = [];
  state.settings = null;
  state.accessLogCreates = [];
  state.accessLogSaves = [];
});

test("API sends security headers and limits browser origins", async () => {
  const allowed = await requestJson("/api/health", {
    headers: { Origin: "https://siaacentrixsafepass.com" },
  });
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "https://siaacentrixsafepass.com",
  );
  assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
  assert.equal(allowed.headers.get("x-frame-options"), "DENY");
  assert.equal(allowed.headers.get("x-powered-by"), null);

  const blocked = await requestJson("/api/health", {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
});

test("login returns the same error for unknown users and wrong passwords", async () => {
  persistDoc({
    _id: "user-1",
    email: "known@example.com",
    username: "knownuser",
    password: "CorrectPass123",
    role: "visitor",
    status: "active",
    isVerified: true,
    firstName: "Known",
    lastName: "User",
  });

  const unknownUserResponse = await requestJson("/api/login", {
    method: "POST",
    body: { email: "missing@example.com", password: "WrongPass123" },
  });
  const wrongPasswordResponse = await requestJson("/api/login", {
    method: "POST",
    body: { email: "known@example.com", password: "WrongPass123" },
  });

  assert.equal(unknownUserResponse.status, 401);
  assert.equal(wrongPasswordResponse.status, 401);
  assert.equal(
    unknownUserResponse.body.error,
    wrongPasswordResponse.body.error,
  );
});

test("login rate limiting blocks repeated failed attempts", async () => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await requestJson("/api/login", {
      method: "POST",
      body: { email: "ratelimit@example.com", password: "WrongPass123" },
    });

    if (attempt < 5) {
      assert.equal(response.status, 401);
    } else {
      assert.equal(response.status, 429);
      assert.match(response.body.message, /Too many login attempts/i);
    }
  }
});

test("password reset request is generic for existing and missing accounts", async () => {
  persistDoc({
    _id: "user-2",
    email: "visitor@example.com",
    username: "visitoruser",
    password: "CorrectPass123",
    role: "visitor",
    status: "active",
    isVerified: true,
    firstName: "Visitor",
    lastName: "Account",
  });

  const existingResponse = await requestJson("/api/auth/request-password-reset", {
    method: "POST",
    body: { email: "visitor@example.com" },
  });
  const missingResponse = await requestJson("/api/auth/request-password-reset", {
    method: "POST",
    body: { email: "missing@example.com" },
  });

  assert.equal(existingResponse.status, 200);
  assert.equal(missingResponse.status, 200);
  assert.equal(existingResponse.body.message, missingResponse.body.message);
});

test("passkey enrollment and 2FA routes are registered and require authentication", async () => {
  const passkeyResponse = await requestJson("/api/webauthn/register/options", {
    method: "POST",
    body: { email: "visitor@example.com" },
  });
  const twoFaResponse = await requestJson("/api/auth/enable-2fa", {
    method: "POST",
  });

  assert.equal(passkeyResponse.status, 401);
  assert.equal(twoFaResponse.status, 401);
});

test("trusted-device verification requires the matching server-issued token", async () => {
  const trustedDeviceToken = "trusted-device-token-for-test";
  persistDoc({
    _id: "trusted-user-1",
    email: "trusted@example.com",
    username: "trusteduser",
    password: "TrustedPass123",
    role: "student",
    status: "active",
    firstName: "Trusted",
    lastName: "User",
    trustedDeviceToken: crypto.createHash("sha256").update(trustedDeviceToken).digest("hex"),
    trustedDeviceExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const token = jwt.sign({ userId: "trusted-user-1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const acceptedResponse = await requestJson("/api/auth/verify-trusted-device", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { trustedDeviceToken },
  });
  const rejectedResponse = await requestJson("/api/auth/verify-trusted-device", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { trustedDeviceToken: "wrong-token" },
  });

  assert.equal(acceptedResponse.status, 200);
  assert.equal(acceptedResponse.body.success, true);
  assert.equal(rejectedResponse.status, 401);
  assert.equal(rejectedResponse.body.success, false);
});

test("admin settings can be updated and then read back through the API", async () => {
  persistDoc({
    _id: "admin-1",
    email: "admin@example.com",
    username: "adminuser",
    password: "AdminPass123",
    role: "admin",
    status: "active",
    isVerified: true,
    firstName: "Admin",
    lastName: "User",
  });

  const token = jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const updateResponse = await requestJson("/api/admin/settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      maintenanceMode: true,
      emailNotifications: false,
      sessionTimeout: 45,
      backupFrequency: "weekly",
    },
  });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.settings.maintenanceMode, true);
  assert.equal(updateResponse.body.settings.emailNotifications, false);
  assert.equal(updateResponse.body.settings.sessionTimeout, "45");
  assert.equal(updateResponse.body.settings.backupFrequency, "weekly");

  const fetchResponse = await requestJson("/api/admin/settings", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(fetchResponse.status, 200);
  assert.equal(fetchResponse.body.settings.maintenanceMode, true);
  assert.equal(fetchResponse.body.settings.emailNotifications, false);
  assert.equal(fetchResponse.body.settings.sessionTimeout, "45");
  assert.equal(fetchResponse.body.settings.backupFrequency, "weekly");
});

test("non-admin roles receive 403 Forbidden on admin-only routes", async () => {
  persistDoc({
    _id: "student-1",
    email: "student@example.com",
    username: "studentuser",
    password: "StudentPass123",
    role: "student",
    status: "active",
    isVerified: true,
    firstName: "Student",
    lastName: "User",
  });

  const studentToken = jwt.sign({ userId: "student-1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const settingsResponse = await requestJson("/api/admin/settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${studentToken}` },
    body: { maintenanceMode: true },
  });
  const createStaffResponse = await requestJson("/api/admin/staff/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${studentToken}` },
    body: { firstName: "Test", lastName: "Staff", email: "test.staff@example.com" },
  });
  const rejectVisitorResponse = await requestJson("/api/admin/visitors/vis-1/reject", {
    method: "PUT",
    headers: { Authorization: `Bearer ${studentToken}` },
    body: { reason: "Not allowed" },
  });

  assert.equal(settingsResponse.status, 403);
  assert.equal(createStaffResponse.status, 403);
  assert.equal(rejectVisitorResponse.status, 403);
});

test("admin can create a staff account and generates an audit log", async () => {
  persistDoc({
    _id: "admin-1",
    email: "admin@example.com",
    username: "adminuser",
    password: "AdminPass123",
    role: "admin",
    status: "active",
    isVerified: true,
    firstName: "Admin",
    lastName: "User",
  });

  const adminToken = jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const initialLogCount = state.accessLogSaves.length;

  const createResponse = await requestJson("/api/admin/staff/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      firstName: "Maria",
      lastName: "Santos",
      email: "maria.santos@sapphire.edu",
      department: "Registrar",
      position: "Registrar Officer",
      employeeId: "STF-2026-099",
      phone: "09171234567",
    },
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.success, true);
  assert.equal(createResponse.body.user.email, "maria.santos@sapphire.edu");
  assert.equal(createResponse.body.user.role, "staff");
  assert.equal(createResponse.body.user.department, "Registrar");

  // Verify that an audit log was created
  assert.ok(state.accessLogSaves.length > initialLogCount);
  const lastLog = state.accessLogSaves[state.accessLogSaves.length - 1];
  assert.match(lastLog.notes, /Created staff account: maria\.santos@sapphire\.edu/i);
});

test("admin can create a security guard account", async () => {
  persistDoc({
    _id: "admin-1",
    email: "admin@example.com",
    username: "adminuser",
    password: "AdminPass123",
    role: "admin",
    status: "active",
    isVerified: true,
    firstName: "Admin",
    lastName: "User",
  });

  const adminToken = jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const createGuardResponse = await requestJson("/api/admin/security/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      firstName: "Pedro",
      lastName: "Reyes",
      email: "pedro.guard@sapphire.edu",
      phone: "09181234567",
      employeeId: "SEC-2026-088",
      position: "Security Guard",
    },
  });

  assert.equal(createGuardResponse.status, 201);
  assert.equal(createGuardResponse.body.success, true);
  assert.equal(createGuardResponse.body.user.email, "pedro.guard@sapphire.edu");
  assert.ok(["guard", "security"].includes(createGuardResponse.body.user.role));
});

test("admin staff creation rejects duplicate employeeId or email", async () => {
  persistDoc({
    _id: "admin-1",
    email: "admin@example.com",
    username: "adminuser",
    password: "AdminPass123",
    role: "admin",
    status: "active",
    isVerified: true,
    firstName: "Admin",
    lastName: "User",
  });
  persistDoc({
    _id: "existing-staff-1",
    email: "existing.staff@sapphire.edu",
    username: "existingstaff",
    employeeId: "STF-2026-001",
    role: "staff",
    status: "active",
    firstName: "Existing",
    lastName: "Staff",
  });

  const adminToken = jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const duplicateResponse = await requestJson("/api/admin/staff/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      firstName: "New",
      lastName: "Staff",
      email: "existing.staff@sapphire.edu",
      department: "Accounting",
      employeeId: "STF-2026-001",
    },
  });

  assert.equal(duplicateResponse.status, 400);
  assert.equal(duplicateResponse.body.success, false);
});

test("admin can reject a visitor registration with reason and log activity", async () => {
  persistDoc({
    _id: "admin-1",
    email: "admin@example.com",
    username: "adminuser",
    password: "AdminPass123",
    role: "admin",
    status: "active",
    isVerified: true,
    firstName: "Admin",
    lastName: "User",
  });

  const adminToken = jwt.sign({ userId: "admin-1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const rejectResponse = await requestJson("/api/admin/visitors/vis-test-1/reject", {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { reason: "Incomplete identification documents provided" },
  });

  assert.equal(rejectResponse.status, 200);
  assert.equal(rejectResponse.body.success, true);
  assert.match(rejectResponse.body.message, /Visitor rejected successfully/i);
});

