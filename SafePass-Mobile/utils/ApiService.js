import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { emitNotificationLogout } from './notificationEvents';
let AsyncStorage;

if (Platform.OS === 'web') {
  AsyncStorage = require('./webStorage').default;
} else {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}
import * as ImageManipulator from 'expo-image-manipulator';

const DEPLOYED_API_BASE_URL = "https://safepass-052h.onrender.com/api";

const isPrivateNetworkHost = (hostname = "") =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname.startsWith("192.168.") ||
  hostname.startsWith("10.") ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

const getExpoDevServerApiBaseUrl = () => {
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoClient?.hostUri ||
    Constants?.manifest?.debuggerHost ||
    "";
  const hostname = String(hostUri).split(":")[0].trim();

  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return "";
  }

  return `http://${hostname}:5000/api`;
};

const WEB_FALLBACK_API_BASE_URL = (() => {
  if (
    typeof window === "undefined" ||
    !window.location ||
    !window.location.protocol ||
    !window.location.hostname
  ) {
    return DEPLOYED_API_BASE_URL;
  }

  const hostname = window.location.hostname;
  if (isPrivateNetworkHost(hostname)) {
    return `http://${hostname}:5000/api`;
  }

  return DEPLOYED_API_BASE_URL;
})();

const API_MODE = String(
  process.env.EXPO_PUBLIC_API_MODE || process.env.NODE_ENV || "production",
).toLowerCase();
const configuredApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL || Constants.expoConfig?.extra?.apiBaseUrl || "";
const API_BASE_URL = String(
  configuredApiBaseUrl ||
    (Platform.OS === "web"
      ? WEB_FALLBACK_API_BASE_URL
      : getExpoDevServerApiBaseUrl() || DEPLOYED_API_BASE_URL),
).replace(/\/$/, "");

// Playwright sets this explicitly. In that mode, never try the deployed
// fallback URL: a missing local backend must fail the test rather than touch production.
const E2E_LOCAL_ONLY = process.env.EXPO_PUBLIC_E2E_LOCAL_ONLY === "true";
const isE2eSafeLocalApiUrl = (baseUrl) => {
  try {
    const hostname = new URL(String(baseUrl)).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

if (!API_BASE_URL) {
  throw new Error("SafePass API configuration is missing: set EXPO_PUBLIC_API_BASE_URL.");
}
if ((E2E_LOCAL_ONLY || API_MODE === "test" || API_MODE === "development") && !isE2eSafeLocalApiUrl(API_BASE_URL)) {
  throw new Error(
    `SafePass ${E2E_LOCAL_ONLY ? "E2E" : API_MODE} API configuration must use localhost or 127.0.0.1.`,
  );
}

const API_BASE_URL_CANDIDATES = [API_BASE_URL]
  .filter(Boolean)
  .map((baseUrl) => String(baseUrl).replace(/\/$/, ""));

const UNIQUE_API_BASE_URL_CANDIDATES = [...new Set(API_BASE_URL_CANDIDATES)];

// Keep simulation/fallback OFF by default so app uses real backend/database.
const DEV_FALLBACK_ENABLED = process.env.EXPO_PUBLIC_ENABLE_DEV_FALLBACK === "true";
const API_DEBUG_ENABLED = process.env.EXPO_PUBLIC_API_DEBUG === "true";
const logApiDebug = (...args) => {
  if (API_DEBUG_ENABLED) {
    console.log(...args);
  }
};
const API_ERROR_LOG_THROTTLE_MS = 30000;
const API_REQUEST_TIMEOUT_MS = 30000;
const apiErrorLogTimestamps = new Map();
const isAbortError = (error) =>
  error?.name === "AbortError" ||
  String(error?.message || "").toLowerCase().includes("abort");
const isNetworkLikeError = (error) => {
  const message = String(error?.message || "");
  return (
    isAbortError(error) ||
    message.includes("Network request failed") ||
    message.includes("Failed to fetch") ||
    message.includes("Load failed") ||
    message.includes("NetworkError") ||
    message.includes("Cannot connect to the SafePass server")
  );
};
const shouldLogApiError = (key) => {
  if (API_DEBUG_ENABLED) return true;
  const now = Date.now();
  const previous = apiErrorLogTimestamps.get(key) || 0;
  if (now - previous < API_ERROR_LOG_THROTTLE_MS) return false;
  apiErrorLogTimestamps.set(key, now);
  return true;
};
const logApiFetchError = ({ url, baseUrl, error }) => {
  if (url === "/login" && error?.data?.requiresOtpVerification === true) return;
  if (url === "/appointments/id-ocr/validate") {
    console.error(`[ApiService] ID pre-check request failed (${error?.status || "network"}).`);
    return;
  }
  const message = String(error?.message || "");
  const isNetworkError = isNetworkLikeError(error);
  const status = error?.status ? `:${error.status}` : "";
  const logKey = `${baseUrl}|${url}|${isNetworkError ? "connection" : message || status || "error"}`;
  if (!shouldLogApiError(logKey)) return;

  const logMethod = isNetworkError ? console.warn : console.error;
  logMethod(
    `[ApiService] ${isAbortError(error) ? "Request timed out" : "Fetch error"} for ${url} via ${baseUrl}:`,
    error,
  );
};
const logApiHealthError = ({ baseUrl, error }) => {
  const timedOut = isAbortError(error);
  const logKey = `${baseUrl}|health|${timedOut ? "timeout" : String(error?.message || "error")}`;
  if (!shouldLogApiError(logKey)) return;

  const logMethod = timedOut ? console.warn : console.error;
  logMethod(
    `[ApiService] Health check ${timedOut ? "timed out" : "failed"} via ${baseUrl}:`,
    error,
  );
};
const logApiOperationError = (operation, error) => {
  const message = String(error?.message || "");
  const isFetchError =
    error?.status ||
    error?.data ||
    isNetworkLikeError(error) ||
    message.includes("Cannot connect to the SafePass server");
  if (!API_DEBUG_ENABLED && isFetchError) return;

  const status = error?.status ? `:${error.status}` : "";
  const logKey = `operation|${operation}|${message || status || "error"}`;
  if (!shouldLogApiError(logKey)) return;

  const isNetworkError = isNetworkLikeError(error);
  const logMethod = isNetworkError ? console.warn : console.error;
  logMethod(`${operation}:`, error);
};
const createSafePassConnectionError = () => {
  const error = new Error(
    "Cannot connect to the SafePass server. Please check your internet connection and try again."
  );
  error.isSafePassConnectionError = true;
  error.code = "SAFEPASS_CONNECTION_ERROR";
  return error;
};
const TRUST_DEVICE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const WEB_REMEMBERED_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBERED_SESSION_DURATION_MS =
  Platform.OS === "web"
    ? WEB_REMEMBERED_SESSION_DURATION_MS
    : TRUST_DEVICE_DURATION_MS;
const HEALTH_CHECK_TIMEOUT_MS = 45000;
const REMEMBERED_SESSION_EXPIRES_AT_KEY = "rememberedSessionExpiresAt";
const SENSITIVE_STORAGE_KEYS = [
  "userToken",
  "authToken",
  "trustedDevice",
  "trustedUntil",
  "trustedDeviceToken",
  "trustedDeviceUserId",
  REMEMBERED_SESSION_EXPIRES_AT_KEY,
];
const TRUSTED_DEVICE_STORAGE_KEYS = [
  "trustedDevice",
  "trustedUntil",
  "trustedDeviceToken",
  "trustedDeviceUserId",
];

const setSensitiveItem = async (key, value) => {
  const normalizedValue = value == null ? null : String(value);

  if (Platform.OS === "web") {
    if (normalizedValue == null) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, normalizedValue);
    return;
  }

  try {
    if (normalizedValue == null) {
      await SecureStore.deleteItemAsync(key);
      await AsyncStorage.removeItem(key);
      return;
    }

    await SecureStore.setItemAsync(key, normalizedValue);
  } catch (error) {
    logApiDebug(`[ApiService] SecureStore write failed for ${key}; using AsyncStorage fallback.`, error);
    if (normalizedValue == null) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, normalizedValue);
    }
  }
};

const getSensitiveItem = async (key) => {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }

  try {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue != null) return secureValue;
  } catch (error) {
    logApiDebug(`[ApiService] SecureStore read failed for ${key}; using AsyncStorage fallback.`, error);
  }

  return AsyncStorage.getItem(key);
};

const removeSensitiveItems = async (keys) => {
  if (Platform.OS === "web") {
    await AsyncStorage.multiRemove(keys);
    return;
  }

  await Promise.all(
    keys.map(async (key) => {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        logApiDebug(`[ApiService] SecureStore delete failed for ${key}; clearing AsyncStorage fallback.`, error);
      }
      await AsyncStorage.removeItem(key);
    }),
  );
};

class ApiService {
  constructor() {
    this.token = null;
    this._lastOtp = null;
    this._lastReset = null;
  }

  async clearTrustedDevice() {
    await removeSensitiveItems(TRUSTED_DEVICE_STORAGE_KEYS);
  }

  async rememberCurrentSession(durationMs = REMEMBERED_SESSION_DURATION_MS) {
    await setSensitiveItem(
      REMEMBERED_SESSION_EXPIRES_AT_KEY,
      String(Date.now() + durationMs),
    );
  }

  async clearRememberedSession() {
    await removeSensitiveItems([REMEMBERED_SESSION_EXPIRES_AT_KEY]);
  }

  async isRememberedSessionActive() {
    const expiresAtRaw = await getSensitiveItem(REMEMBERED_SESSION_EXPIRES_AT_KEY);
    if (!expiresAtRaw) {
      return true;
    }

    const expiresAt = Number(expiresAtRaw);

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await this.clearAuth();
      return false;
    }

    return true;
  }

  async isTrustedDeviceActive(user, loginToken) {
    const userId = String(user?._id || user?.id || user?.userId || "").trim();
    const [trustedDevice, trustedUntilRaw, trustedDeviceToken, trustedDeviceUserId] = await Promise.all([
      getSensitiveItem("trustedDevice"),
      getSensitiveItem("trustedUntil"),
      getSensitiveItem("trustedDeviceToken"),
      getSensitiveItem("trustedDeviceUserId"),
    ]);

    const trustedUntil = Number(trustedUntilRaw);
    if (
      trustedDevice !== "true" ||
      !userId ||
      !loginToken ||
      !trustedDeviceToken ||
      trustedDeviceUserId !== userId ||
      !Number.isFinite(trustedUntil) ||
      trustedUntil <= Date.now()
    ) {
      await this.clearTrustedDevice();
      return false;
    }

    try {
      const response = await this.fetch("/auth/verify-trusted-device", {
        method: "POST",
        headers: { Authorization: `Bearer ${loginToken}` },
        body: { trustedDeviceToken },
      });
      if (response?.success) {
        return true;
      }
    } catch (error) {
      logApiDebug("Trusted-device verification failed.", error);
    }

    await this.clearTrustedDevice();
    return false;
  }

  // ================= TOKEN HANDLING =================

  async setToken(token) {
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    const validToken =
      normalizedToken &&
      normalizedToken !== "undefined" &&
      normalizedToken !== "null"
        ? normalizedToken
        : null;

    this.token = validToken;
    if (validToken) {
      await setSensitiveItem("userToken", validToken);
      // Backward compatibility for older screens still reading authToken.
      await setSensitiveItem("authToken", validToken);
    } else {
      await removeSensitiveItems(["userToken", "authToken"]);
    }
  }

  async getToken() {
    if (!this.token) {
      const userTokenRaw = await getSensitiveItem("userToken");
      const userToken =
        typeof userTokenRaw === "string"
          ? userTokenRaw.trim()
          : "";

      if (userToken) {
        if (userToken === "undefined" || userToken === "null") {
          await removeSensitiveItems(["userToken", "authToken"]);
          this.token = null;
        } else {
          this.token = userToken;
        }
      } else {
        // Backward compatibility: migrate legacy authToken to userToken.
        const legacyTokenRaw = await AsyncStorage.getItem("authToken");
        const legacyToken =
          typeof legacyTokenRaw === "string"
            ? legacyTokenRaw.trim()
            : "";

        if (legacyToken) {
          if (legacyToken === "undefined" || legacyToken === "null") {
            await AsyncStorage.removeItem("authToken");
            this.token = null;
          } else {
            this.token = legacyToken;
            await setSensitiveItem("userToken", legacyToken);
            await setSensitiveItem("authToken", legacyToken);
            await AsyncStorage.removeItem("authToken");
          }
        }
      }
    }
    return this.token;
  }

  async clearAuth({ preserveTrustedDevice = true } = {}) {
    emitNotificationLogout();
    const oldToken = this.token;
    this.token = null;
    try {
      const token = await AsyncStorage.getItem('pushDeviceToken');
      if (token && oldToken) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          await fetch(`${API_BASE_URL}/notifications/device`, {
            method: 'DELETE', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oldToken}` },
            body: JSON.stringify({ token }),
          });
        } finally { clearTimeout(timeout); }
      }
      await AsyncStorage.removeItem('pushDeviceToken');
    } catch { /* Logout must also work offline. */ }
    await removeSensitiveItems(
      preserveTrustedDevice
        ? SENSITIVE_STORAGE_KEYS.filter((key) => !TRUSTED_DEVICE_STORAGE_KEYS.includes(key))
        : SENSITIVE_STORAGE_KEYS,
    );
    await AsyncStorage.multiRemove([
      "currentUser",
      "isNewRegistration",
      "lastActivityAt",
      "rememberedEmail"
    ]);
  }

  isDevFallbackEnabled() {
    return DEV_FALLBACK_ENABLED;
  }

  // ================= NFC METHODS =================
  async processNfcTap(tapData) {
    try {
      const visitorId = tapData?.visitorId;
      if (!visitorId) {
        return { success: false, message: "Missing visitor ID" };
      }

      const visitorRes = await this.getVisitorById(visitorId);
      const visitor = visitorRes?.visitor;
      if (!visitor) {
        return { success: false, message: "Visitor record not found" };
      }

      if (visitor.status === "checked_in") {
        const response = await this.fetch(`/visitors/${visitorId}/self-checkout`, {
          method: "PUT",
          body: { source: tapData?.source || "virtual_nfc_card" },
        });
        return { ...response, action: "check_out" };
      }

      if (visitor.status === "checked_out") {
        return { success: false, message: "Visit already completed" };
      }

      if (visitor.status !== "approved" && visitor.approvalStatus !== "approved") {
        return { success: false, message: "Visit request is not approved yet" };
      }

      const response = await this.fetch(`/visitors/${visitorId}/self-checkin`, {
        method: "PUT",
        body: { source: tapData?.source || "virtual_nfc_card" },
      });
      return { ...response, action: "check_in" };
    } catch (error) {
      console.error("Process NFC tap error:", error);
      throw error;
    }
  }

  async sendGateCommand(gateId, command, visitorId) {
    // Gate controller endpoint is not available yet; keep API shape stable.
    return {
      success: true,
      simulated: true,
      gateId,
      command,
      visitorId,
      timestamp: new Date().toISOString(),
    };
  }

  async getGateStatus(gateId) {
    return {
      success: true,
      simulated: true,
      gateId,
      status: "online",
    };
  }

  // ================= GENERIC FETCH =================
async fetch(url, options = {}) {
  const token = await this.getToken();
  logApiDebug(`[ApiService] FETCH ${url}, Method: ${options.method || 'GET'}, Has Token: ${!!token}`);

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body !== "string") {
    config.body = JSON.stringify(config.body);
  }

  for (const baseUrl of UNIQUE_API_BASE_URL_CANDIDATES) {
    try {
      logApiDebug(`[ApiService] Sending request to: ${baseUrl}${url}`);
      const response = await fetch(`${baseUrl}${url}`, config);
      logApiDebug(`[ApiService] Response status: ${response.status}`);

      const contentType = response.headers.get("content-type");
      let data;

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
        if (url !== "/appointments/id-ocr/validate") {
          logApiDebug("[ApiService] Response data:", data);
        }
      } else {
        const text = await response.text();
        data = text ? { message: text } : {};
        if (url !== "/appointments/id-ocr/validate") {
          logApiDebug("[ApiService] Response text:", text);
        }
      }

      if (!response.ok) {
        if (url !== "/appointments/id-ocr/validate") {
          logApiDebug(`[ApiService] HTTP ${response.status}:`, data);
        }
        const apiError = new Error(data.error || data.message || `HTTP ${response.status}`);
        apiError.status = response.status;
        apiError.data = data;
        throw apiError;
      }

      return data;
    } catch (error) {
      logApiFetchError({ url, baseUrl, error });
      if (!isNetworkLikeError(error)) {
        throw error;
      }
    }
  }

  throw createSafePassConnectionError();
}

  // ================= AUTH =================

async register(userData) {
  try {
    logApiDebug("[ApiService] Registering user:", userData);
    const response = await this.fetch("/register", {
      method: "POST",
      body: userData,
    });
    logApiDebug("[ApiService] Register response:", response);
    return response;
  } catch (error) {
    console.error('âŒ Register error:', error);
    throw error;
  }
}

  async createStaffUser(staffData) {
    try {
      const payload = {
        ...staffData,
        role: "staff",
        status: staffData?.status || "inactive",
        isActive: staffData?.isActive ?? false,
      };
      return await this.fetch("/admin/staff/create", {
        method: "POST",
        body: payload,
      });
    } catch (error) {
      const errorMessage = String(error?.message || "").toLowerCase();
      const message = errorMessage.includes("username already")
        ? "Username already registered. Please use another username."
        : errorMessage.includes("staff id already") || errorMessage.includes("staff/security number") || errorMessage.includes("employeeid")
          ? "Staff ID already registered. Please use another staff ID."
          : errorMessage.includes("email already")
            ? "Email already registered. Please use another email address."
            : error?.message || "Failed to create staff account";
      throw new Error(message);
    }
  }

  async createAcademicAccessUser(studentData) {
    try {
      const role = String(studentData?.role || "student").toLowerCase() === "teacher" ? "teacher" : "student";
      const payload = {
        ...studentData,
        role,
        status: studentData?.status || "active",
        isActive: studentData?.isActive ?? true,
      };
      return await this.fetch("/admin/students/create", {
        method: "POST",
        body: payload,
      });
    } catch (error) {
      const errorMessage = String(error?.message || "").toLowerCase();
      const message = errorMessage.includes("username already")
        ? "Username already registered. Please use another username."
        : errorMessage.includes("student id already") || errorMessage.includes("teacher id already") || errorMessage.includes("academic id") || errorMessage.includes("studentid") || errorMessage.includes("teacherid")
          ? "Academic ID already registered. Please use another ID."
          : errorMessage.includes("email already")
            ? "Email already registered. Please use another email address."
            : error?.message || "Failed to create academic access account";
      throw new Error(message);
    }
  }

  async createStudentUser(studentData) {
    return this.createAcademicAccessUser({ ...studentData, role: "student" });
  }

  async login(email, password) {
    try {
      const response = await this.fetch("/login", {
        method: "POST",
        body: { email, password },
      });

      if (response.token) {
        await this.setToken(response.token);
        await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
      }
      return response;
    } catch (error) {
      console.error("Login API error:", error);
      
      if (error?.data?.requiresOtpVerification || error?.status === 403) {
        throw new Error(
          error?.data?.message ||
            "Please verify your email to continue."
        );
      }

      if (error.message.includes("401")) {
        throw new Error("Invalid email or password. Please check your credentials.");
      }
      throw error;
    }
  }

  async logout() {
    try {
      await this.fetch("/logout", { method: "POST" });
    } catch (e) {
      // Ignore logout errors
    }
    await this.clearAuth();
  }

  async checkEmailExists(email) {
    try {
      await this.fetch("/check-email", {
        method: "POST",
        body: { email },
      });
      return false;
    } catch {
      return false;
    }
  }

  // ================= USER =================

  async getProfile() {
    try {
      const response = await this.fetch("/profile");

      if (response && response.user) {
        await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
        await AsyncStorage.setItem("visitorProfileCache", JSON.stringify(response.user));
        return response;
      }
      return response;
    } catch (error) {
      logApiDebug("Profile fetch failed:", error.message);

      if (error.message.includes("401") || error.message.includes("authenticate")) {
        const cachedUser = await this.getCurrentUser();
        if (cachedUser) {
          logApiDebug("Using cached user data as fallback");
          return {
            user: cachedUser,
            fromCache: true,
            message: "Using cached profile data"
          };
        }
      }
      throw error;
    }
  }

  async getVisitorProfileCached() {
    const user = await this.getCurrentUser();
    if (!user?._id) throw new Error("Please sign in to view your visits.");
    const cacheKey = `visitorDashboardCache:${user._id}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      // The dashboard needs appointments and visitor status, not just /profile's user.
      const response = await this.fetch("/visitor/profile", { signal: controller.signal });
      await AsyncStorage.setItem(cacheKey, JSON.stringify(response)).catch(() => {});
      return response;
    } catch (error) {
      if (!isNetworkLikeError(error)) throw error;
      logApiDebug("Network profile fetch failed, trying cache:", error.message);
      const cachedProfileJson = await AsyncStorage.getItem(cacheKey);

      if (cachedProfileJson) {
        const cachedProfile = JSON.parse(cachedProfileJson);
        return {
          ...cachedProfile,
          fromCache: true,
          message: "Showing cached profile data (offline)"
        };
      }

      // If no cache available, throw original error
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async updateProfile(data) {
    const response = await this.fetch("/profile", {
      method: "PUT",
      body: data,
    });

    if (response.user) {
      await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
    }
    return response;
  }

  async getCurrentUser() {
    const json = await AsyncStorage.getItem("currentUser");
    if (!json) return null;

    try {
      return JSON.parse(json);
    } catch (error) {
      logApiDebug("Invalid cached user data. Removing currentUser cache.", error);
      await AsyncStorage.removeItem("currentUser");
      return null;
    }
  }

  async restoreCurrentUserFromToken() {
    const token = await this.getToken();
    if (!token) return null;

    const cachedUser = await this.getCurrentUser();
    if (cachedUser) return cachedUser;

    const profile = await this.getProfile();
    return profile?.user || null;
  }

  // ================= 2FA / OTP METHODS =================
async verifyCredentials(email, password) {
  try {
    const loginResponse = await this.fetch("/login", {
      method: "POST",
      body: { email, password },
    });
    
    const trustedDevice = await this.isTrustedDeviceActive(
      loginResponse.user,
      loginResponse.token,
    );
    // Check if user is pending
    if (loginResponse.user?.status === 'pending') {
      return {
        success: true,
        requires2FA: false,
        user: loginResponse.user,
        tempToken: loginResponse.token,
        status: 'pending'
      };
    }
    
      return {
        success: true,
        requires2FA: !trustedDevice,
        user: loginResponse.user,
        tempToken: loginResponse.token,
      };
    
  } catch (error) {
    if (error?.data?.requiresOtpVerification !== true) {
      console.error("Verify credentials error:", error);
    }

    if (!this.isDevFallbackEnabled()) {
      const credentialError = new Error(
        error?.data?.message ||
          error.message ||
          "Invalid email or password"
      );
      credentialError.status = error?.status;
      credentialError.data = error?.data;
      throw credentialError;
    }

    // Demo accounts (development fallback if backend not running)
    const demoAccounts = {
      'admin@test.com': { password: 'admin123', role: 'admin', status: 'active' },
      'security@test.com': { password: 'security123', role: 'security', status: 'active' },
      'visitor@test.com': { password: 'visitor123', role: 'visitor', status: 'active' },
      'student@test.com': { password: 'student123', role: 'student', status: 'active' },
      'student1@sapphire.edu': { password: 'Student123!', role: 'student', status: 'active' },
      'student2@sapphire.edu': { password: 'Student123!', role: 'student', status: 'active' },
      'student3@sapphire.edu': { password: 'Student123!', role: 'student', status: 'active' },
      'student4@sapphire.edu': { password: 'Student123!', role: 'student', status: 'active' },
      'student5@sapphire.edu': { password: 'Student123!', role: 'student', status: 'active' },
      'pending@test.com': { password: 'pending123', role: 'visitor', status: 'pending' }
    };
    
    const demoMatch = demoAccounts[email];
    if (demoMatch && password === demoMatch.password) {
      return {
        success: true,
        requires2FA: false,
        user: { 
          email, 
          role: demoMatch.role, 
          status: demoMatch.status,
          firstName: demoMatch.role.charAt(0).toUpperCase() + demoMatch.role.slice(1),
          lastName: 'Demo'
        },
        tempToken: "demo_token_" + Math.random().toString(36).substring(2),
      };
    }
    
    throw new Error(error.message || "Invalid email or password");
  }
}

  async requestOtp(phoneNumber, method = 'sms') {
    try {
      const response = await this.fetch("/auth/request-otp", {
        method: "POST",
        body: { phoneNumber, method },
      });
      return response;
    } catch (error) {
      logApiDebug("OTP request API not ready - using simulation");
      
      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
      
      this._lastOtp = {
        code: mockOtp,
        phoneNumber,
        timestamp: Date.now(),
        method,
        expiresAt: Date.now() + 60000
      };
      
      logApiDebug(`[SIMULATION] OTP for ${phoneNumber}: ${mockOtp}`);
      
      if (__DEV__) {
        setTimeout(() => {
          alert(`ðŸ” Your OTP code is: ${mockOtp}`);
        }, 500);
      }
      
      return {
        success: true,
        tempToken: "otp_" + Math.random().toString(36).substring(2),
        expiresIn: 60,
        method
      };
    }
  }

  async verifyOtp(phoneNumber, otpCode, tempToken) {
    try {
      const response = await this.fetch("/auth/verify-otp", {
        method: "POST",
        body: { phoneNumber, otpCode, tempToken },
      });
      return response;
    } catch (error) {
      logApiDebug("OTP verify API not ready - using simulation");
      
      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      const isValid = this._lastOtp && 
                     this._lastOtp.phoneNumber === phoneNumber &&
                     this._lastOtp.expiresAt > Date.now() &&
                     (otpCode === this._lastOtp.code || 
                      otpCode === "123456" || 
                      otpCode === "000000");   
      
      if (isValid) {
        this._lastOtp = null;
        return {
          success: true,
          verified: true,
          message: "OTP verified successfully",
        };
      } else {
        return {
          success: false,
          verified: false,
          message: this._lastOtp?.expiresAt < Date.now() 
            ? "OTP code has expired" 
            : "Invalid OTP code",
        };
      }
    }
  }

  // ================= SOCIAL LOGIN =================

  async facebookLogin(accessToken) {
    try {
      logApiDebug("[ApiService] Facebook login with token:", accessToken.substring(0, 10) + "...");
      const response = await this.fetch("/auth/facebook", {
        method: "POST",
        body: { accessToken },
      });

      if (response.token) {
        await this.setToken(response.token);
        await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
      }
      return response;
    } catch (error) {
      console.error("Facebook login API error:", error);

      if (!this.isDevFallbackEnabled() || error?.status === 403 || error?.data?.code === "SOCIAL_ACCOUNT_NOT_LINKED") {
        throw error;
      }

      // Development fallback for Facebook login
      const mockUser = {
        id: "fb_dev_" + Math.random().toString(36).substr(2, 9),
        email: `facebook_dev_${Date.now()}@example.com`,
        firstName: "Facebook",
        lastName: "Dev",
        role: "visitor",
        status: "active",
        isActive: true,
        isVerified: true
      };

      const mockToken = "fb_dev_token_" + Math.random().toString(36).substr(2, 9);
      await this.setToken(mockToken);
      await AsyncStorage.setItem("currentUser", JSON.stringify(mockUser));

      return {
        success: true,
        token: mockToken,
        user: mockUser,
        message: "Facebook login successful (development mode)"
      };
    }
  }

  async googleLogin(idToken) {
    try {
      logApiDebug("[ApiService] Google login with token:", idToken.substring(0, 10) + "...");
      const response = await this.fetch("/auth/google", {
        method: "POST",
        body: { idToken },
      });

      if (response.token) {
        await this.setToken(response.token);
        await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
      }
      return response;
    } catch (error) {
      console.error("Google login API error:", error);

      if (!this.isDevFallbackEnabled() || error?.status === 403 || error?.data?.code === "SOCIAL_ACCOUNT_NOT_LINKED") {
        throw error;
      }

      // Development fallback for Google login
      const mockUser = {
        id: "google_dev_" + Math.random().toString(36).substr(2, 9),
        email: `google_dev_${Date.now()}@example.com`,
        firstName: "Google",
        lastName: "Dev",
        role: "visitor",
        status: "active",
        isActive: true,
        isVerified: true
      };

      const mockToken = "google_dev_token_" + Math.random().toString(36).substr(2, 9);
      await this.setToken(mockToken);
      await AsyncStorage.setItem("currentUser", JSON.stringify(mockUser));

      return {
        success: true,
        token: mockToken,
        user: mockUser,
        message: "Google login successful (development mode)"
      };
    }
  }

  async getSocialSignupProfile(provider, token, purpose = "visitor_signup") {
    const body = provider === "google"
      ? { provider, idToken: token, purpose }
      : { provider, accessToken: token, purpose };
    return this.fetch("/auth/social-signup-profile", { method: "POST", body });
  }

  async linkSocialAccount(signupToken) {
    const response = await this.fetch("/auth/link-social-account", {
      method: "POST",
      body: { signupToken },
    });
    if (response?.user) await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
    return response;
  }

  async appleLogin(identityToken, userData = {}) {
    try {
      logApiDebug("[ApiService] Apple login with token:", identityToken.substring(0, 10) + "...");
      const response = await this.fetch("/auth/apple", {
        method: "POST",
        body: { identityToken, userData },
      });

      if (response.token) {
        await this.setToken(response.token);
        await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
      }
      return response;
    } catch (error) {
      console.error("Apple login API error:", error);

      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      // Development fallback for Apple login
      const mockUser = {
        id: "apple_dev_" + Math.random().toString(36).substr(2, 9),
        email: `apple_dev_${Date.now()}@example.com`,
        firstName: userData.firstName || "Apple",
        lastName: userData.lastName || "User",
        role: "visitor",
        status: "active",
        isActive: true,
        isVerified: true
      };

      const mockToken = "apple_dev_token_" + Math.random().toString(36).substr(2, 9);
      await this.setToken(mockToken);
      await AsyncStorage.setItem("currentUser", JSON.stringify(mockUser));

      return {
        success: true,
        token: mockToken,
        user: mockUser,
        message: "Apple login successful (development mode)"
      };
    }
  }

  async webauthnLogin(credential) {
    try {
      logApiDebug("[ApiService] WebAuthn login with credential:", credential.id.substring(0, 10) + "...");
      const response = await this.fetch("/webauthn/authenticate/verify", {
        method: "POST",
        body: credential,
      });

      if (response.token) {
        await this.setToken(response.token);
        await AsyncStorage.setItem("currentUser", JSON.stringify(response.user));
      }
      return response;
    } catch (error) {
      console.error("WebAuthn login API error:", error);

      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      // Development fallback for WebAuthn login
      const mockUser = {
        id: "webauthn_dev_" + Math.random().toString(36).substr(2, 9),
        email: `webauthn_dev_${Date.now()}@example.com`,
        firstName: "WebAuthn",
        lastName: "User",
        role: "visitor",
        status: "active",
        isActive: true,
        isVerified: true
      };

      const mockToken = "webauthn_dev_token_" + Math.random().toString(36).substr(2, 9);
      await this.setToken(mockToken);
      await AsyncStorage.setItem("currentUser", JSON.stringify(mockUser));

      return {
        success: true,
        token: mockToken,
        user: mockUser,
        message: "WebAuthn login successful (development mode)"
      };
    }
  }

  async enable2FA(phoneNumber) {
    try {
      const response = await this.fetch("/auth/enable-2fa", {
        method: "POST",
        body: { phoneNumber },
      });
      return response;
    } catch (error) {
      logApiDebug("Enable 2FA API not ready - using simulation");
      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      return {
        success: true,
        message: "2FA enabled successfully",
      };
    }
  }

  async disable2FA() {
    try {
      const response = await this.fetch("/auth/disable-2fa", {
        method: "POST",
      });
      return response;
    } catch (error) {
      logApiDebug("Disable 2FA API not ready - using simulation");
      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      return {
        success: true,
        message: "2FA disabled successfully",
      };
    }
  }

  async trustDevice(user) {
    try {
      const userId = String(user?._id || user?.id || user?.userId || "").trim();
      const token = await this.getToken();
      if (!userId || !token) {
        throw new Error("A signed-in user is required to trust this device.");
      }

      const response = await this.fetch("/auth/trust-device", { method: "POST" });
      if (!response?.trustedDeviceToken) {
        throw new Error("The server did not create a trusted-device token.");
      }

      await Promise.all([
        setSensitiveItem("trustedDevice", "true"),
        setSensitiveItem("trustedUntil", String(Date.now() + TRUST_DEVICE_DURATION_MS)),
        setSensitiveItem("trustedDeviceToken", response.trustedDeviceToken),
        setSensitiveItem("trustedDeviceUserId", userId),
      ]);
      return { success: true };
    } catch (error) {
      await this.clearTrustedDevice();
      logApiDebug("Trust device error:", error);
      return { success: false };
    }
  }

  // ================= ACCESS LOG =================

  async getAccessLogs(page = 1, limit = 50, filters = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });
    return await this.fetch(`/access-logs?${params.toString()}`);
  }

  async createAccessLog(data) {
    return await this.fetch("/access-log", {
      method: "POST",
      body: data,
    });
  }

  async simulateNfcScan(location, accessType = "entry") {
    throw new Error("Legacy NFC scan simulation is disabled. Use submitCheckpointTap for live checkpoint taps.");
  }

  async getStats() {
    return await this.fetch("/stats");
  }

  // ================= PASSWORD RESET METHODS =================

  async requestPasswordReset(email) {
    try {
      const response = await this.fetch("/auth/request-password-reset", {
        method: "POST",
        body: { email },
      });
      return response;
    } catch (error) {
      logApiDebug("Password reset API not ready - using simulation");
      
      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      this._lastReset = {
        email,
        otp: "123456",
        expiresAt: Date.now() + 600000
      };
      
      logApiDebug(`[SIMULATION] Password reset OTP for ${email}: 123456`);
      
      if (__DEV__) {
        setTimeout(() => {
          alert(`ðŸ” Password reset OTP: 123456`);
        }, 500);
      }
      
      return {
        success: true,
        expiresIn: 600
      };
    }
  }

  async verifyPasswordResetOtp(email, otpCode) {
    try {
      const response = await this.fetch("/auth/verify-password-reset", {
        method: "POST",
        body: { email, otpCode },
      });
      return response;
    } catch (error) {
      logApiDebug("Password reset verify API not ready - using simulation");
      
      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      const isValid = this._lastReset?.email === email &&
                      this._lastReset?.expiresAt > Date.now() &&
                      (otpCode === this._lastReset?.otp || otpCode === "123456");
      
      if (isValid) {
        return {
          success: true,
          verified: true,
          message: "OTP verified successfully"
        };
      } else {
        return {
          success: false,
          verified: false,
          message: this._lastReset?.expiresAt < Date.now() 
            ? "Reset code has expired" 
            : "Invalid verification code"
        };
      }
    }
  }

  async resetPassword(email, newPassword, resetToken = "") {
    try {
      const response = await this.fetch("/auth/reset-password", {
        method: "POST",
        body: { email, newPassword, resetToken },
      });
      return response;
    } catch (error) {
      logApiDebug("Password reset API not ready - using simulation");
      if (!this.isDevFallbackEnabled()) {
        throw error;
      }

      return {
        success: true,
        message: "Password reset successfully"
      };
    }
  }
  
  // ================= VISITOR METHODS =================

  async registerVisitor(visitorData) {
    try {
      const response = await this.fetch("/visitors/register", {
        method: "POST",
        body: visitorData,
      });
      
      if (response.success && response.visitor) {
        // Store visitor info for later use
        await AsyncStorage.setItem("lastVisitor", JSON.stringify(response.visitor));
        if (response.credentials) {
          await AsyncStorage.setItem("visitorCredentials", JSON.stringify(response.credentials));
        }
      }
      
      return response;
    } catch (error) {
      const isExistingAccount =
        error?.data?.field === "email" ||
        String(error?.data?.code || "").toUpperCase() === "ACCOUNT_EXISTS" ||
        String(error?.message || "").toLowerCase().includes("already exists");
      if (isExistingAccount) {
        logApiDebug("Visitor registration needs existing-account login:", error?.message);
      } else {
        console.error("Visitor registration error:", error);
      }
      throw error;
    }
  }

  async verifyEmailToken(token) {
    try {
      return await this.fetch("/auth/verify-email", {
        method: "POST",
        body: { token },
      });
    } catch (error) {
      console.error("Email verification error:", error);
      throw error;
    }
  }

  async verifyRegistrationOtp(email, otpCode) {
    try {
      return await this.fetch("/auth/verify-registration-otp", {
        method: "POST",
        body: { email, otpCode },
      });
    } catch (error) {
      console.error("Registration OTP verification error:", error);
      throw error;
    }
  }

  async resendRegistrationOtp(email) {
    try {
      return await this.fetch("/auth/resend-registration-otp", {
        method: "POST",
        body: { email },
      });
    } catch (error) {
      console.error("Registration OTP resend error:", error);
      throw error;
    }
  }

  async getVisitorProfile() {
    try {
      const response = await this.fetch("/visitor/profile");
      return response;
    } catch (error) {
      if (error?.status === 404) {
        return {
          success: false,
          visitor: null,
          notFound: true,
          message: "Visitor profile not found",
        };
      }

      console.error("Get visitor profile error:", error);
      throw error;
    }
  }

  async ensureVisitorVirtualNfcToken() {
    try {
      return await this.fetch("/visitor/virtual-nfc-token", {
        method: "POST",
      });
    } catch (error) {
      console.error("Ensure visitor virtual NFC token error:", error);
      throw error;
    }
  }

  async getVisitorAccessLogs(visitorId) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/logs`);
      return response;
    } catch (error) {
      if (error?.status === 404) {
        return {
          success: true,
          logs: [],
          notFound: true,
          message: "Visitor access logs not found",
        };
      }

      console.error("Get visitor logs error:", error);
      throw error;
    }
  }

  async visitorCheckIn(visitorId, payload = {}) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/self-checkin`, {
        method: "PUT",
        body: payload,
      });
      return response;
    } catch (error) {
      console.error("Visitor check-in error:", error);
      throw error;
    }
  }

  async visitorCheckOut(visitorId, payload = {}) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/self-checkout`, {
        method: "PUT",
        body: payload,
      });
      return response;
    } catch (error) {
      console.error("Visitor check-out error:", error);
      throw error;
    }
  }

  async updateVisitorPhoneLocation(visitorId, locationData) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/phone-location`, {
        method: "PUT",
        body: locationData,
      });
      return response;
    } catch (error) {
      console.error("Update visitor phone location error:", error);
      throw error;
    }
  }

  async securityCheckIn(visitorId) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/checkin`, {
        method: "PUT",
      });
      return response;
    } catch (error) {
      console.error("Security check-in error:", error);
      throw error;
    }
  }

  async securityCheckOut(visitorId) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/checkout`, {
        method: "PUT",
      });
      return response;
    } catch (error) {
      console.error("Security check-out error:", error);
      throw error;
    }
  }

  async getVisitors(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(`/visitors${queryString ? `?${queryString}` : ''}`);
      return response;
    } catch (error) {
      logApiOperationError("Get visitors error", error);
      throw error;
    }
  }

  async getSecurityLiveVisitorLocations(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      return await this.fetch(
        `/security/live-visitor-locations${queryString ? `?${queryString}` : ""}`,
      );
    } catch (error) {
      logApiOperationError("Get security live visitor locations error", error);
      throw error;
    }
  }

  async getSecurityLivePresence(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      return await this.fetch(
        `/security/live-presence${queryString ? `?${queryString}` : ""}`,
      );
    } catch (error) {
      logApiOperationError("Get security live presence error", error);
      throw error;
    }
  }

  async getVisitorById(visitorId) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}`);
      return response;
    } catch (error) {
      console.error("Get visitor error:", error);
      throw error;
    }
  }

  async getAttendance(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      return await this.fetch(`/attendance${queryString ? `?${queryString}` : ""}`);
    } catch (error) {
      logApiOperationError("Get attendance error", error);
      throw error;
    }
  }

  async getAttendanceSummary(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      return await this.fetch(`/attendance/summary${queryString ? `?${queryString}` : ""}`);
    } catch (error) {
      console.error("Get attendance summary error:", error);
      throw error;
    }
  }

  async getMyAttendance(filters = {}) {
    try {
      const queryString = new URLSearchParams({
        ...filters,
        ts: Date.now(),
      }).toString();
      return await this.fetch(`/my-attendance${queryString ? `?${queryString}` : ""}`);
    } catch (error) {
      console.error("Get my attendance error:", error);
      throw error;
    }
  }

  async submitMyAttendanceTap(tapData = {}) {
    try {
      return await this.fetch("/my-attendance/tap", {
        method: "POST",
        body: tapData,
      });
    } catch (error) {
      console.error("Submit my attendance tap error:", error);
      throw error;
    }
  }

  async submitCheckpointTap(tapData) {
    try {
      return await this.fetch("/nfc/station/tap", {
        method: "POST",
        body: tapData,
      });
    } catch (error) {
      console.error("Submit checkpoint tap error:", error);
      throw error;
    }
  }

  async submitOfficeTap(tapData) {
    try {
      return await this.fetch("/nfc/office-tap", {
        method: "POST",
        body: tapData,
      });
    } catch (error) {
      console.error("Submit office tap error:", error);
      throw error;
    }
  }

  async getCurrentVisitorDestination() {
    try {
      return await this.fetch("/visitor/current-destination");
    } catch (error) {
      console.error("Get current visitor destination error:", error);
      throw error;
    }
  }

  async updateVisitorDestination(visitorId, destinationData = {}) {
    try {
      return await this.fetch(`/staff/visitors/${visitorId}/destination`, {
        method: "PATCH",
        body: destinationData,
      });
    } catch (error) {
      console.error("Update visitor destination error:", error);
      throw error;
    }
  }

  async getVisitorMovementHistory(visitorId, filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      return await this.fetch(
        `/visitor/${visitorId}/movement-history${queryString ? `?${queryString}` : ""}`,
      );
    } catch (error) {
      console.error("Get visitor movement history error:", error);
      throw error;
    }
  }

  async requestVisitorAppointment(userId, appointmentData) {
    try {
      const response = await this.fetch(`/visitors/${userId}/visit`, {
        method: "PUT",
        body: appointmentData,
      });
      return response;
    } catch (error) {
      console.error("Request visitor appointment error:", error);
      throw error;
    }
  }

  async rescheduleVisitorAppointment(visitorId, appointmentData) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/appointment/reschedule`, {
        method: "PUT",
        body: appointmentData,
      });
      return response;
    } catch (error) {
      console.error("Reschedule visitor appointment error:", error);
      throw error;
    }
  }

  async notifyVisitorRunningLate(visitorId, lateNoticeData = {}) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/appointment/running-late`, {
        method: "PUT",
        body: lateNoticeData,
      });
      return response;
    } catch (error) {
      console.error("Notify visitor running late error:", error);
      throw error;
    }
  }

  async acceptVisitorAppointmentAdjustment(visitorId) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/appointment/accept-adjustment`, {
        method: "PUT",
      });
      return response;
    } catch (error) {
      console.error("Accept visitor appointment adjustment error:", error);
      throw error;
    }
  }

  async cancelVisitorAppointment(visitorId, cancellationData) {
    try {
      const response = await this.fetch(`/visitors/${visitorId}/appointment/cancel`, {
        method: "PUT",
        body: cancellationData,
      });
      return response;
    } catch (error) {
      console.error("Cancel visitor appointment error:", error);
      throw error;
    }
  }

  async getAppointmentAvailability({ date, department, departments, staffAssignments = {} } = {}) {
    try {
      const queryString = new URLSearchParams({
        date: date || "",
        department: department || "",
        departments: Array.isArray(departments) ? departments.join(",") : departments || "",
        staffAssignments: JSON.stringify(staffAssignments),
      }).toString();
      return await this.fetch(`/appointments/availability?${queryString}`);
    } catch (error) {
      console.error("Get appointment availability error:", error);
      throw error;
    }
  }

  async validateAppointmentIdImage({ idType, imageUri, backImageUri, selectionProof } = {}) {
    try {
      return await this.fetch("/appointments/id-ocr/validate", {
        method: "POST",
        body: {
            idType,
            imageUri,
            ...(backImageUri ? { backImageUri } : {}),
            ...(selectionProof ? { selectionProof } : {}),
        },
      });
    } catch (error) {
      console.error("Validate appointment ID image error.");
      throw error;
    }
  }

  async getAppointmentOptions() {
    try {
      return await this.fetch("/appointments/options");
    } catch (error) {
      console.error("Get appointment options error:", error);
      throw error;
    }
  }

  async getAdminAppointmentOptions() {
    try {
      return await this.fetch("/admin/appointments/options");
    } catch (error) {
      console.error("Get admin appointment options error:", error);
      throw error;
    }
  }

  async updateAdminAppointmentOptions(options) {
    try {
      return await this.fetch("/admin/appointments/options", {
        method: "PUT",
        body: { options },
      });
    } catch (error) {
      console.error("Update admin appointment options error:", error);
      throw error;
    }
  }

  async getStaffAppointments(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(
        `/staff/appointments${queryString ? `?${queryString}` : ""}`,
      );
      return response;
    } catch (error) {
      console.error("Get staff appointments error:", error);
      throw error;
    }
  }

  async approveStaffAppointment(visitorId, note = "") {
    try {
      return await this.fetch(`/staff/appointments/${visitorId}/approve`, {
        method: "PUT",
        body: { note },
      });
    } catch (error) {
      console.error("Approve staff appointment error:", error);
      throw error;
    }
  }

  async adjustStaffAppointment(visitorId, adjustmentData) {
    try {
      return await this.fetch(`/staff/appointments/${visitorId}/adjust`, {
        method: "PUT",
        body: adjustmentData,
      });
    } catch (error) {
      console.error("Adjust staff appointment error:", error);
      throw error;
    }
  }

  async redirectStaffAppointment(visitorId, redirectData = {}) {
    try {
      return await this.fetch(`/staff/appointments/${visitorId}/redirect`, {
        method: "PUT",
        body: redirectData,
      });
    } catch (error) {
      console.error("Redirect staff appointment error:", error);
      throw error;
    }
  }

  async rejectStaffAppointment(visitorId, reason) {
    try {
      return await this.fetch(`/staff/appointments/${visitorId}/reject`, {
        method: "PUT",
        body: { reason },
      });
    } catch (error) {
      console.error("Reject staff appointment error:", error);
      throw error;
    }
  }

  async completeStaffAppointment(visitorId, note = "") {
    try {
      return await this.fetch(`/staff/appointments/${visitorId}/complete`, {
        method: "PUT",
        body: { note },
      });
    } catch (error) {
      console.error("Complete staff appointment error:", error);
      throw error;
    }
  }

  // ================= ADMIN VISITOR APPROVAL METHODS =================

  async getPendingVisitors() {
    try {
      const response = await this.fetch("/admin/visitors/pending");
      return response;
    } catch (error) {
      console.error("Get pending visitors error:", error);
      throw error;
    }
  }

  async getAllVisitors(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(`/admin/visitors${queryString ? `?${queryString}` : ''}`);
      return response;
    } catch (error) {
      console.error("Get all visitors error:", error);
      throw error;
    }
  }

async approveVisitor(visitorId, adminNotes = '') {
  try {
    logApiDebug(`Approving visitor with ID: ${visitorId}`);
    const response = await this.fetch(`/admin/visitors/${visitorId}/approve`, {
      method: "PUT",
      body: { adminNotes }
    });
    logApiDebug("Approve response:", response);
    return response;
  } catch (error) {
    console.error('âŒ Approve error:', error);
    throw error;
  }
}

async rejectVisitor(visitorId, reason) {
  try {
    logApiDebug(`Rejecting visitor with ID: ${visitorId}`);
    const response = await this.fetch(`/admin/visitors/${visitorId}/reject`, {
      method: "PUT",
      body: { reason }
    });
    logApiDebug("Reject response:", response);
    return response;
  } catch (error) {
    console.error('âŒ Reject error:', error);
    throw error;
  }
}

  async sendAdminNotification(notificationData) {
    try {
      const response = await this.fetch("/admin/notifications", {
        method: "POST",
        body: notificationData
      });
      return response;
    } catch (error) {
      console.error("Send admin notification error:", error);
      throw error;
    }
  }

  async sendVisitorApprovalEmail(visitor) {
    try {
      const response = await this.fetch("/emails/send-approval", {
        method: "POST",
        body: {
          to: visitor.email,
          visitorName: visitor.fullName,
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          purpose: visitor.purposeOfVisit
        }
      });
      return response;
    } catch (error) {
      console.error("Send approval email error:", error);
      throw error;
    }
  }

  async sendVisitorRejectionEmail(visitorId, reason) {
    try {
      const response = await this.fetch("/emails/send-rejection", {
        method: "POST",
        body: { visitorId, reason }
      });
      return response;
    } catch (error) {
      console.error("Send rejection email error:", error);
      throw error;
    }
  }

  async registerVisitorWithNotification(visitorData) {
    try {
      const registrationResponse = await this.registerVisitor(visitorData);
      
      if (registrationResponse.success && registrationResponse.visitor) {
        await this.sendAdminNotification({
          type: 'VISITOR_REGISTRATION',
          visitorId: registrationResponse.visitor._id,
          visitorName: visitorData.fullName,
          visitorEmail: visitorData.email,
          purpose: visitorData.purposeOfVisit,
          visitDate: visitorData.visitDate,
          visitTime: visitorData.visitTime,
          phoneNumber: visitorData.phoneNumber,
          timestamp: new Date().toISOString()
        });
        
        return registrationResponse;
      }
      
      return registrationResponse;
    } catch (error) {
      console.error("Visitor registration with notification error:", error);
      throw error;
    }
  }

  async getVisitorStats() {
    try {
      const response = await this.fetch("/visitors/stats");
      return response;
    } catch (error) {
      console.error("Get visitor stats error:", error);
      throw error;
    }
  }

  // ================= ADMIN METHODS =================

  async getAdminStats() {
    try {
      const response = await this.fetch("/admin/stats");
      return response;
    } catch (error) {
      console.error("Get admin stats error:", error);
      throw error;
    }
  }

  async getRecentActivities(limit = 10) {
    try {
      const response = await this.fetch(`/admin/activities?limit=${limit}`);
      return response;
    } catch (error) {
      console.error("Get recent activities error:", error);
      throw error;
    }
  }

  async getAllUsers(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(`/admin/users${queryString ? `?${queryString}` : ''}`);
      return response;
    } catch (error) {
      console.error("Get all users error:", error);
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const response = await this.fetch(`/admin/users/${userId}`);
      return response;
    } catch (error) {
      console.error("Get user by ID error:", error);
      throw error;
    }
  }

  async updateUser(userId, userData) {
    try {
      const response = await this.fetch(`/admin/users/${userId}`, {
        method: "PUT",
        body: userData,
      });
      return response;
    } catch (error) {
      console.error("Update user error:", error);
      throw error;
    }
  }

  async updateUserRole(userId, role) {
    try {
      const response = await this.fetch(`/admin/users/${userId}/role`, {
        method: "PUT",
        body: { role },
      });
      return response;
    } catch (error) {
      console.error("Update user role error:", error);
      throw error;
    }
  }

  async deactivateUser(userId) {
    try {
      const response = await this.fetch(`/admin/users/${userId}/deactivate`, {
        method: "PUT",
      });
      return response;
    } catch (error) {
      console.error("Deactivate user error:", error);
      throw error;
    }
  }

  async activateUser(userId) {
    try {
      const response = await this.fetch(`/admin/users/${userId}/activate`, {
        method: "PUT",
      });
      return response;
    } catch (error) {
      console.error("Activate user error:", error);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      const response = await this.fetch(`/admin/users/${userId}`, {
        method: "DELETE",
      });
      return response;
    } catch (error) {
      console.error("Delete user error:", error);
      throw error;
    }
  }

  async updateUserAccess(userId, accessData) {
    try {
      const response = await this.fetch(`/admin/users/${userId}/access`, {
        method: "PUT",
        body: accessData,
      });
      return response;
    } catch (error) {
      console.error("Update user access error:", error);
      throw error;
    }
  }

  async getAllNfcCards(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(`/admin/nfc-cards${queryString ? `?${queryString}` : ''}`);
      return response;
    } catch (error) {
      console.error("Get all NFC cards error:", error);
      throw error;
    }
  }

  async issueNfcCard(userId) {
    try {
      const response = await this.fetch("/admin/nfc-cards/issue", {
        method: "POST",
        body: { userId },
      });
      return response;
    } catch (error) {
      console.error("Issue NFC card error:", error);
      throw error;
    }
  }

  async assignNfcCard({ userId, email, cardId, nfcCardId, uid, force = false } = {}) {
    try {
      const response = await this.fetch("/nfc-cards/assign", {
        method: "POST",
        body: { userId, email, cardId, nfcCardId, uid, force },
      });
      return response;
    } catch (error) {
      logApiOperationError("Assign NFC card error", error);
      throw error;
    }
  }

  async revokeNfcCard(userIdOrTarget) {
    try {
      const target =
        typeof userIdOrTarget === "object" && userIdOrTarget !== null
          ? userIdOrTarget
          : { userId: userIdOrTarget };
      const identifier = target.userId || target.email || target.cardId || target.nfcCardId || target.uid;
      if (!identifier) {
        throw new Error("User ID, email, or card UID is required to revoke an NFC card.");
      }
      const response = await this.fetch(`/nfc-cards/${encodeURIComponent(identifier)}/revoke`, {
        method: "PUT",
        body: {
          email: target.email,
          cardId: target.cardId,
          nfcCardId: target.nfcCardId,
          uid: target.uid,
        },
      });
      return response;
    } catch (error) {
      logApiOperationError("Revoke NFC card error", error);
      throw error;
    }
  }

  async getAccessReports(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(`/admin/reports/access${queryString ? `?${queryString}` : ''}`);
      return response;
    } catch (error) {
      console.error("Get access reports error:", error);
      throw error;
    }
  }

  // ================= SECURITY GUARD MANAGEMENT =================

// Create a new security guard
async createSecurityGuard(guardData) {
  try {
    logApiDebug("Creating security guard:", guardData);
    
    const response = await this.fetch("/admin/security/create", {
      method: "POST",
      body: {
        ...guardData,
        role: 'guard',
        status: 'inactive'
      }
    });
    
    logApiDebug("Create guard response:", response);
    return response;
  } catch (error) {
    console.error("âŒ Create security guard error:", error);
    const errorMessage = String(error?.message || "").toLowerCase();
    const isDuplicateEmail =
      error?.status === 409 ||
      errorMessage.includes("email already");
    const message = errorMessage.includes("staff/security number") || errorMessage.includes("employeeid")
      ? "Staff/Security number already registered. Please use another ID."
      : errorMessage.includes("username already")
      ? "Username already registered. Please use another username."
      : errorMessage.includes("email already")
      ? "Email already registered. Please use another email address."
      : (error?.message || "Failed to create security account");
    throw new Error(message);
  }
}

// Get all security guards
async getAllSecurityGuards(filters = {}) {
  try {
    const queryString = new URLSearchParams(filters).toString();
    const response = await this.fetch(`/admin/security${queryString ? `?${queryString}` : ''}`);
    return response;
  } catch (error) {
    console.error("Get security guards error:", error);
    throw error;
  }
}

// Get security guard by ID
async getSecurityGuardById(guardId) {
  try {
    const response = await this.fetch(`/admin/security/${guardId}`);
    return response;
  } catch (error) {
    console.error("Get security guard error:", error);
    throw error;
  }
}

// Update security guard
async updateSecurityGuard(guardId, guardData) {
  try {
    const response = await this.fetch(`/admin/security/${guardId}`, {
      method: "PUT",
      body: guardData,
    });
    return response;
  } catch (error) {
    console.error("Update security guard error:", error);
    throw error;
  }
}

// Delete security guard
async deleteSecurityGuard(guardId) {
  try {
    const response = await this.fetch(`/admin/security/${guardId}`, {
      method: "DELETE",
    });
    return response;
  } catch (error) {
    console.error("Delete security guard error:", error);
    throw error;
  }
}

// Assign shift to security guard
async assignShift(guardId, shiftData) {
  try {
    const response = await this.fetch(`/admin/security/${guardId}/shift`, {
      method: "PUT",
      body: shiftData,
    });
    return response;
  } catch (error) {
    console.error("Assign shift error:", error);
    throw error;
  }
}

// Get guard attendance logs
async getGuardAttendance(guardId, dateRange = {}) {
  try {
    const queryString = new URLSearchParams(dateRange).toString();
    const response = await this.fetch(`/admin/security/${guardId}/attendance${queryString ? `?${queryString}` : ''}`);
    return response;
  } catch (error) {
    console.error("Get guard attendance error:", error);
    throw error;
  }
}

// Generate random password helper
generateRandomPassword(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

  async getSecurityLogs(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(`/admin/security-logs${queryString ? `?${queryString}` : ''}`);
      return response;
    } catch (error) {
      console.error("Get security logs error:", error);
      throw error;
    }
  }

  async getSystemHealth() {
    try {
      const response = await this.fetch("/admin/health");
      return response;
    } catch (error) {
      console.error("Get system health error:", error);
      throw error;
    }
  }

  async updateSystemSettings(settings) {
    try {
      const response = await this.fetch("/admin/settings", {
        method: "PUT",
        body: settings,
      });
      return response;
    } catch (error) {
      console.error("Update system settings error:", error);
      throw error;
    }
  }

  async getSystemSettings() {
    try {
      const response = await this.fetch("/admin/settings");
      return response;
    } catch (error) {
      console.error("Get system settings error:", error);
      throw error;
    }
  }

  async getMapSettings() {
    try {
      const response = await this.fetch(`/map-settings?ts=${Date.now()}`);
      return response;
    } catch (error) {
      console.error("Get map settings error:", error);
      throw error;
    }
  }

  async updateAdminMapSettings(mapSettings) {
    try {
      const response = await this.fetch("/admin/map-settings", {
        method: "PUT",
        body: mapSettings,
      });
      return response;
    } catch (error) {
      console.error("Update map settings error:", error);
      throw error;
    }
  }

  async getNotifications(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const response = await this.fetch(`/notifications${queryString ? `?${queryString}` : ''}`);
      return response;
    } catch (error) {
      logApiOperationError("Get notifications error", error);
      throw error;
    }
  }

  async markNotificationAsRead(notificationId) {
    try {
      const response = await this.fetch(`/notifications/${notificationId}/read`, {
        method: "PUT",
      });
      return response;
    } catch (error) {
      console.error("Mark notification error:", error);
      throw error;
    }
  }

  async markAllNotificationsAsRead() {
    try {
      const response = await this.fetch("/notifications/read-all", {
        method: "PUT",
      });
      return response;
    } catch (error) {
      console.error("Mark all notifications error:", error);
      throw error;
    }
  }

  // ================= COMPATIBILITY METHODS =================
  async changePassword(payload) {
    try {
      return await this.fetch("/auth/change-password", {
        method: "PUT",
        body: payload,
      });
    } catch (error) {
      console.error("Change password error:", error);
      throw error;
    }
  }

  async getActiveUserCount() {
    try {
      const response = await this.getAllUsers({ status: "active", limit: 1 });
      return response?.total ?? response?.users?.length ?? 0;
    } catch (error) {
      console.error("Get active user count error:", error);
      return 0;
    }
  }

  async getSecurityReports() {
    return await this.fetch("/security/reports?limit=500");
  }

  async resolveAlert(alertId) {
    try {
      const result = await this.markNotificationAsRead(alertId);
      return { success: !!result?.success };
    } catch (error) {
      console.error("Resolve alert error:", error);
      return { success: false };
    }
  }

  async reportVisitor(visitorId, reportData) {
    try {
      return await this.fetch(`/visitors/${visitorId}/report`, {
        method: "POST",
        body: reportData,
      });
    } catch (error) {
      console.error("Report visitor error:", error);
      throw error;
    }
  }

  async updateVisitor(visitorId, data) {
    try {
      return await this.fetch(`/visitors/${visitorId}`, {
        method: "PUT",
        body: data,
      });
    } catch (error) {
      // Let VisitorManagementScreen fall back to local demo-mode update path.
      console.error("Update visitor error:", error);
      return { success: false, message: error.message };
    }
  }

  async updateVisitorAppointmentOffice(visitorId, appointmentUpdate) {
    try {
      const payload =
        typeof appointmentUpdate === "string"
          ? {
              office: appointmentUpdate,
              appointmentDepartment: appointmentUpdate,
              assignedOffice: appointmentUpdate,
            }
          : {
              ...appointmentUpdate,
              office:
                appointmentUpdate?.office ||
                appointmentUpdate?.appointmentDepartment ||
                appointmentUpdate?.assignedOffice,
            };

      return await this.fetch(`/admin/visitors/${visitorId}/appointment-office`, {
        method: "PUT",
        body: payload,
      });
    } catch (error) {
      console.error("Update visitor appointment office error:", error);
      throw error;
    }
  }

  async deleteVisitor(visitorId) {
    try {
      return await this.fetch(`/visitors/${visitorId}`, {
        method: "DELETE",
      });
    } catch (error) {
      // Let VisitorManagementScreen fall back to local demo-mode delete path.
      console.error("Delete visitor error:", error);
      return { success: false, message: error.message };
    }
  }

  async testConnection() {
    try {
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
        : null;

      const response = await fetch(`${API_BASE_URL}/health`, {
        signal: controller?.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const data = await response.json();
      return data.status === "OK";
    } catch (error) {
      logApiHealthError({ baseUrl: API_BASE_URL, error });
      return false;
    }
  }
}

ApiService.prototype.fetch = async function fetchWithAndroidFallback(url, options = {}) {
  const token = await this.getToken();
  if (API_DEBUG_ENABLED) {
    console.log(
      `[ApiService] FETCH ${url}, Method: ${options.method || "GET"}, Has Token: ${!!token}`
    );
  }

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body !== "string") {
    config.body = JSON.stringify(config.body);
  }

  let lastError = null;

  for (const baseUrl of Array.from(new Set(API_BASE_URL_CANDIDATES))) {
    const requestController =
      !config.signal && typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = requestController
      ? setTimeout(() => requestController.abort(), API_REQUEST_TIMEOUT_MS)
      : null;

    try {
      if (API_DEBUG_ENABLED) {
        console.log(`[ApiService] Sending request to: ${baseUrl}${url}`);
      }
      const response = await fetch(`${baseUrl}${url}`, {
        ...config,
        ...(requestController ? { signal: requestController.signal } : {}),
      });
      const contentType = response.headers.get("content-type");
      let data;

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text ? { message: text } : {};
      }

      if (!response.ok) {
        const apiError = new Error(
          data.error || data.message || `HTTP ${response.status}`
        );
        apiError.status = response.status;
        apiError.data = data;
        throw apiError;
      }

      return data;
    } catch (error) {
      lastError = error;
      logApiFetchError({ url, baseUrl, error });

      if (!isNetworkLikeError(error)) {
        throw error;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  if (isNetworkLikeError(lastError)) {
    throw createSafePassConnectionError();
  }

  throw lastError || new Error("Cannot connect to backend.");
};

ApiService.prototype.testConnection = async function testConnectionWithAndroidFallback() {
  for (const baseUrl of Array.from(new Set(API_BASE_URL_CANDIDATES))) {
    try {
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
        : null;

      const response = await fetch(`${baseUrl}/health`, {
        signal: controller?.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const data = await response.json();
      if (data.status === "OK") {
        return true;
      }
    } catch (error) {
      logApiHealthError({ baseUrl, error });
    }
  }

  return false;
};


const fetchReport = async (apiService, path, filters) => {
  const queryString = new URLSearchParams(filters).toString();
  return apiService.fetch(queryString ? `${path}?${queryString}` : path);
};

ApiService.prototype.getVisitorReports = function getVisitorReports(filters = {}) {
  return fetchReport(this, "/api/reports/visitors", filters);
};

ApiService.prototype.getAttendanceReports = function getAttendanceReports(filters = {}) {
  return fetchReport(this, "/api/reports/attendance", filters);
};

ApiService.prototype.getAccessLogsReports = function getAccessLogsReports(filters = {}) {
  return fetchReport(this, "/api/reports/access-logs", filters);
};

ApiService.prototype.getMonthlySummaryReports = function getMonthlySummaryReports(filters = {}) {
  return fetchReport(this, "/api/reports/monthly-summary", filters);
};

export default new ApiService();

