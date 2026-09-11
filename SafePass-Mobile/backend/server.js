const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Visitor = require("./models/Visitor");
const Notification = require("./models/Notification");
const User = require("./models/User");
const AccessLog = require("./models/AccessLog");
const AttendanceRecord = require("./models/AttendanceRecord");
const VisitorMovementLog = require("./models/VisitorMovementLog");
const NfcCheckpoint = require("./models/NfcCheckpoint");
const SmsNotificationLog = require("./models/SmsNotificationLog");
const AppSettings = require("./models/AppSettings");
const Counter = require("./models/Counter");
const {
  authMiddleware,
  requireRoles,
} = require("./middleware/authMiddleware");
const {
  getAppointmentOptions,
} = require("./services/appointmentOptionsService");
const createAppointmentOptionsRoutes = require("./routes/appointmentOptionsRoutes");
const { parseStaffAssignments } = require("./services/staffDirectoryService");
const createPushDeviceRoutes = require("./routes/pushDeviceRoutes");
const { createPushWorker } = require("./services/pushNotificationService");
const { createRateLimiter, getRateLimitKey } = require("./utils/securityUtils");
const {
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_APPOINTMENT_OPTIONS,
  DEFAULT_APPOINTMENT_SLOT_LIMIT,
  DEFAULT_APPOINTMENT_PURPOSE_OPTIONS,
  DEFAULT_APPOINTMENT_DEPARTMENT_OPTIONS,
  sanitizeSystemSettings,
  sanitizeMapConfiguration,
} = require("./utils/settingsUtils");
const timestamp = Date.now();
const randomString = Math.random().toString(36).substr(2, 10).toUpperCase();
const tempNfcCardId = `PENDING-${timestamp}-${randomString}`;
const otpStore = new Map();
require("dotenv").config();

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  next();
});
const isVercelRuntime = Boolean(process.env.VERCEL);
const isProductionRuntime = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
const sensitiveDebugLoggingEnabled =
  !isProductionRuntime &&
  String(process.env.ALLOW_SENSITIVE_DEBUG_LOGS || "").trim().toLowerCase() === "true";
const phoneOtpSmsProviderConfigured = [
  "SEMAPHORE_API_KEY",
  "SEMAPHORE_API_TOKEN",
  "IPROGTECH_API_TOKEN",
  "IPROGTECH_API_KEY",
  "IPROG_SMS_API_TOKEN",
  "IPROG_SMS_API_KEY",
  "SMS_API_KEY",
].some((name) => String(process.env[name] || "").trim());

const APPOINTMENT_ID_TYPE_OPTIONS = [
  "School ID",
  "National ID",
  "Driver's License",
  "Passport",
  "UMID",
  "PhilHealth ID",
  "Voter's ID",
  "PRC ID",
  "Postal ID",
  "Senior Citizen ID",
  "Company ID",
  "Other Government ID",
];

const OCR_SPACE_API_URL = "https://api.ocr.space/parse/image";
const REQUIRE_OCR_ID_VALIDATION =
  String(process.env.REQUIRE_OCR_ID_VALIDATION || "").trim().toLowerCase() === "true";

const GENERIC_AUTH_ERROR_MESSAGE = "Invalid email or password";
const GENERIC_PASSWORD_RESET_REQUEST_MESSAGE =
  "If an account matches that email, a password reset code and secure reset link will be sent.";
const GENERIC_PASSWORD_RESET_VERIFY_MESSAGE =
  "Invalid or expired verification code. Please request a new code and try again.";

const formatSafePassAccountId = (year, sequence) =>
  `${year}-${String(sequence).padStart(6, "0")}`;

const isSafePassAccountId = (value = "") => /^\d{4}-\d{6}$/.test(String(value || "").trim());

const isLegacySafePassToken = (value = "") => {
  const token = String(value || "").trim();
  return isSafePassAccountId(token) || /^SAFEPASS-/i.test(token) || /^PENDING-/i.test(token);
};

const normalizeNfcCardId = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");

const normalizeSubmittedNfcCardId = (value = "") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  const compactHexValue = rawValue.replace(/[\s:-]/g, "");
  if (/^[0-9A-Fa-f]+$/.test(compactHexValue) && compactHexValue.length >= 4) {
    return compactHexValue.toUpperCase();
  }

  return rawValue.toUpperCase();
};

const getUserSafePassId = (user = {}) => {
  const explicitSafePassId = String(user?.safePassId || "").trim();
  if (explicitSafePassId) return explicitSafePassId;

  const legacyCardId = String(user?.nfcCardId || "").trim();
  return isLegacySafePassToken(legacyCardId) ? legacyCardId : "";
};

const getUserPhysicalNfcUid = (user = {}) => {
  const explicitPhysicalUid = normalizeSubmittedNfcCardId(user?.physicalNfcUid || "");
  if (explicitPhysicalUid) return explicitPhysicalUid;

  const legacyCardId = normalizeSubmittedNfcCardId(user?.nfcCardId || "");
  return legacyCardId && !isLegacySafePassToken(legacyCardId) ? legacyCardId : "";
};

const getUserPhoneNfcUid = (user = {}) => normalizeSubmittedNfcCardId(user?.phoneNfcUid || "");
const getUserVirtualNfcToken = (user = {}) => normalizeSubmittedNfcCardId(user?.virtualNfcToken || "");

const getNfcCredentialTypeForUser = (user = {}, submittedCardId = "") => {
  const normalizedSubmitted = normalizeSubmittedNfcCardId(submittedCardId);
  if (!normalizedSubmitted) return "";
  if (normalizeSubmittedNfcCardId(getUserVirtualNfcToken(user)) === normalizedSubmitted) return "virtual_card";
  if (normalizeSubmittedNfcCardId(getUserPhoneNfcUid(user)) === normalizedSubmitted) return "phone_uid";
  if (normalizeSubmittedNfcCardId(getUserPhysicalNfcUid(user)) === normalizedSubmitted) return "physical_uid";
  if (normalizeSubmittedNfcCardId(user?.nfcCardId || "") === normalizedSubmitted) return "account_card";
  return "unknown";
};

const buildNfcCredentialQuery = (rawCardId = "", normalizedCardId = "") => {
  const candidates = Array.from(
    new Set(
      [rawCardId, normalizedCardId, normalizeSubmittedNfcCardId(rawCardId), normalizeSubmittedNfcCardId(normalizedCardId)]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  return {
    $or: [
      { physicalNfcUid: { $in: candidates } },
      { phoneNfcUid: { $in: candidates } },
      { virtualNfcToken: { $in: candidates } },
      { nfcCardId: { $in: candidates } },
    ],
  };
};

const generateVirtualNfcToken = () => `5AFE${crypto.randomBytes(14).toString("hex").toUpperCase()}`;

const generateSafePassAccountId = async (createdAt = new Date()) => {
  const createdDate = new Date(createdAt);
  const year = Number.isNaN(createdDate.getTime())
    ? new Date().getFullYear()
    : createdDate.getFullYear();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { _id: `safepass-account:${year}` },
      {
        $inc: { sequence: 1 },
        $setOnInsert: { scope: "safepass-account", year },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const candidate = formatSafePassAccountId(year, counter.sequence);
    const existing = await User.exists({
      $or: [{ safePassId: candidate }, { nfcCardId: candidate }],
    });
    if (!existing) return candidate;
  }

  throw new Error("Unable to generate a unique SafePass account ID.");
};

const ensureSafePassAccountId = async (user) => {
  if (!user) return "";

  const existingSafePassId = getUserSafePassId(user);
  if (existingSafePassId) {
    if (!String(user.safePassId || "").trim()) {
      user.safePassId = existingSafePassId;
      await user.save();
    }
    return existingSafePassId;
  }

  if (String(user.role || "").toLowerCase() !== "visitor") {
    return String(user.nfcCardId || "").trim();
  }

  user.safePassId = await generateSafePassAccountId(user.createdAt || new Date());
  if (!String(user.nfcCardId || "").trim()) {
    user.nfcCardId = user.safePassId;
  }
  await user.save();
  return user.safePassId;
};

const reviewAppointmentIdImage = ({ idType, idImage, idVerification }) => {
  const normalizedIdType = String(idType || "").trim();
  const normalizedIdImage = String(idImage || "").trim();
  const normalizedVerificationStatus = String(idVerification?.status || "").trim();
  const verificationConfidence = Number(idVerification?.confidence);

  if (!normalizedIdType) {
    return {
      isAccepted: false,
      status: "missing_id_type",
      message: "Please choose which valid ID you will present.",
    };
  }

  if (!normalizedIdImage) {
    return {
      isAccepted: true,
      status: "physical_id_required",
      message: `${normalizedIdType} will be presented at campus entry for manual verification.`,
    };
  }

  const looksLikeImagePayload =
    normalizedIdImage.startsWith("data:image/") ||
    normalizedIdImage.startsWith("file:") ||
    normalizedIdImage.startsWith("content:") ||
    normalizedIdImage.startsWith("http");

  if (!looksLikeImagePayload || normalizedIdImage.length < 120) {
    return {
      isAccepted: false,
      status: "image_quality_failed",
      message:
        "We could not confirm the uploaded file is a valid ID image. Please upload a clearer photo of the front of the ID.",
    };
  }

  if (
    normalizedVerificationStatus === "ai_precheck_failed" ||
    normalizedVerificationStatus === "ocr_validation_failed" ||
    normalizedVerificationStatus === "ocr_validation_error"
  ) {
    return {
      isAccepted: false,
      status: normalizedVerificationStatus,
      message:
        idVerification?.message ||
        "The uploaded ID image did not pass verification. Please upload a clearer matching ID photo.",
      confidence: Number.isFinite(verificationConfidence) ? verificationConfidence : 0,
    };
  }

  if (
    normalizedVerificationStatus === "ai_precheck_passed" ||
    normalizedVerificationStatus === "ocr_validation_passed" ||
    normalizedVerificationStatus === "ocr_manual_review_required"
  ) {
    return {
      isAccepted: true,
      status: normalizedVerificationStatus,
      message:
        idVerification?.message ||
        `Uploaded ${normalizedIdType} image passed the verification pre-check. Final validation will be completed by staff or security.`,
      confidence: Number.isFinite(verificationConfidence) ? verificationConfidence : 100,
    };
  }

  return {
    isAccepted: true,
    status: "image_uploaded",
    message: `Uploaded ${normalizedIdType} image saved. Final validation will be completed by staff or security.`,
    confidence: null,
  };
};

const getRequiredEnvValue = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getOptionalEnvValue = (name) => String(process.env[name] || "").trim();

const getOcrSpaceApiKey = () => getOptionalEnvValue("OCR_SPACE_API_KEY");

const normalizeOcrText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getExpectedIdKeywords = (idType = "") => {
  const normalizedIdType = normalizeOcrText(idType);
  if (!normalizedIdType) return [];

  if (normalizedIdType.includes("national")) {
    return ["national id", "philippine identification", "philid", "psn", "philsys"];
  }
  if (normalizedIdType.includes("driver")) {
    return ["driver", "license", "licence", "lto", "driver s license"];
  }
  if (normalizedIdType.includes("passport")) {
    return ["passport", "republic of the philippines", "passeport"];
  }
  if (normalizedIdType.includes("umid")) {
    return ["umid", "unified multi purpose", "crn"];
  }
  if (normalizedIdType.includes("philhealth")) {
    return ["philhealth", "health insurance"];
  }
  if (normalizedIdType.includes("voter")) {
    return ["voter", "commission on elections", "comelec"];
  }
  if (normalizedIdType.includes("prc")) {
    return ["professional regulation commission", "prc"];
  }
  if (normalizedIdType.includes("postal")) {
    return ["postal", "phlpost"];
  }
  if (normalizedIdType.includes("senior")) {
    return ["senior citizen", "osca"];
  }
  if (normalizedIdType.includes("school")) {
    return ["school", "student", "college", "university", "academy"];
  }
  if (normalizedIdType.includes("company")) {
    return ["company", "employee", "corporation", "inc"];
  }
  if (normalizedIdType.includes("government")) {
    return ["government", "republic of the philippines", "agency"];
  }

  return normalizedIdType.split(" ").filter((part) => part.length >= 3);
};

const getConflictingIdKeywords = (idType = "") => {
  const normalizedIdType = normalizeOcrText(idType);
  const groups = [
    { key: "national", keywords: ["national id", "philippine identification", "philid", "philsys"] },
    { key: "driver", keywords: ["driver", "license", "licence", "lto"] },
    { key: "passport", keywords: ["passport"] },
    { key: "umid", keywords: ["umid", "unified multi purpose", "crn"] },
    { key: "philhealth", keywords: ["philhealth"] },
    { key: "voter", keywords: ["voter", "comelec"] },
    { key: "prc", keywords: ["professional regulation commission", "prc"] },
    { key: "postal", keywords: ["postal", "phlpost"] },
  ];

  const selectedGroup = groups.find((group) => normalizedIdType.includes(group.key));
  return groups
    .filter((group) => group.key !== selectedGroup?.key)
    .flatMap((group) => group.keywords);
};

const scoreOcrIdMatch = ({ idType, rawText }) => {
  const normalizedText = normalizeOcrText(rawText);
  const expectedKeywords = getExpectedIdKeywords(idType);
  const conflictingKeywords = getConflictingIdKeywords(idType);
  const matchedKeywords = expectedKeywords.filter((keyword) =>
    normalizedText.includes(normalizeOcrText(keyword)),
  );
  const conflictingMatches = conflictingKeywords.filter((keyword) =>
    normalizedText.includes(normalizeOcrText(keyword)),
  );
  const hasMeaningfulText = normalizedText.length >= 20;
  const hasExpectedMatch = matchedKeywords.length > 0;
  const hasConflict = conflictingMatches.length > 0 && !hasExpectedMatch;
  const confidence = Math.max(
    0,
    Math.min(
      100,
      (hasMeaningfulText ? 35 : 0) +
        Math.min(matchedKeywords.length * 35, 55) -
        (hasConflict ? 45 : 0),
    ),
  );

  return {
    hasMeaningfulText,
    hasExpectedMatch,
    hasConflict,
    confidence,
    matchedKeywords,
    conflictingMatches,
  };
};

const parseOcrSpaceResult = (data) => {
  const parsedResults = Array.isArray(data?.ParsedResults) ? data.ParsedResults : [];
  return parsedResults
    .map((result) => String(result?.ParsedText || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
};

const callOcrSpace = async ({ imageUri }) => {
  const apiKey = getOcrSpaceApiKey();
  if (!apiKey) {
    return {
      success: false,
      skipped: true,
      message: "OCR Space API key is not configured on the backend.",
    };
  }

  const payload = new URLSearchParams({
    apikey: apiKey,
    language: "eng",
    isOverlayRequired: "false",
    detectOrientation: "true",
    scale: "true",
    OCREngine: "2",
  });

  const normalizedImage = String(imageUri || "").trim();
  if (normalizedImage.startsWith("data:image/")) {
    payload.set("base64Image", normalizedImage);
  } else {
    payload.set("url", normalizedImage);
  }

  const response = await fetch(OCR_SPACE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload.toString(),
  });
  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = { raw: responseText };
  }

  if (!response.ok || data?.IsErroredOnProcessing) {
    const providerError = Array.isArray(data?.ErrorMessage)
      ? data.ErrorMessage.join(" ")
      : data?.ErrorMessage;
    return {
      success: false,
      message:
        providerError ||
        data?.ErrorDetails ||
        `OCR Space request failed with HTTP ${response.status}.`,
      data,
    };
  }

  return {
    success: true,
    text: parseOcrSpaceResult(data),
    data,
  };
};

const logSensitiveDebug = (...args) => {
  if (sensitiveDebugLoggingEnabled) {
    console.log(...args);
  }
};

const logPhoneOtpForDemo = ({ phoneNumber, otpCode, method }) => {
  if (phoneOtpSmsProviderConfigured && !sensitiveDebugLoggingEnabled) {
    return;
  }

  console.log("");
  console.log("========== PHONE OTP DEMO ==========");
  console.log(`Number : ${phoneNumber}`);
  console.log(`Method : ${method || "sms"}`);
  console.log(`OTP    : ${otpCode}`);
  console.log("====================================");
  console.log("");
};

const getSemaphoreApiKey = () =>
  String(
    process.env.SEMAPHORE_API_KEY ||
      process.env.SEMAPHORE_API_TOKEN ||
      process.env.SMS_API_KEY ||
      "",
  ).trim();

const getIprogTechApiToken = () =>
  String(
    process.env.IPROGTECH_API_TOKEN ||
      process.env.IPROGTECH_API_KEY ||
      process.env.IPROG_SMS_API_TOKEN ||
      process.env.IPROG_SMS_API_KEY ||
      "",
  ).trim();

const getConfiguredSmsProvider = () =>
  String(process.env.SMS_PROVIDER || process.env.PHONE_OTP_PROVIDER || "")
    .trim()
    .toLowerCase();

const isPhoneOtpBackendLogModeEnabled = () =>
  String(process.env.PHONE_OTP_BACKEND_LOG_MODE || "true")
    .trim()
    .toLowerCase() !== "false";

const getPhoneOtpDeliveryProvider = () => {
  if (isPhoneOtpBackendLogModeEnabled()) return "backend_log";

  const configuredProvider = getConfiguredSmsProvider();
  if (configuredProvider === "semaphore" && getSemaphoreApiKey()) return "semaphore";
  if (configuredProvider === "semaphore") return "backend_log";
  if (["iprogtech", "iprog", "iprogsms"].includes(configuredProvider) && getIprogTechApiToken()) {
    return "iprogtech";
  }
  if (["iprogtech", "iprog", "iprogsms"].includes(configuredProvider)) return "backend_log";
  if (configuredProvider === "backend_log") return "backend_log";
  if (getIprogTechApiToken()) return "iprogtech";
  if (getSemaphoreApiKey()) return "semaphore";
  return "backend_log";
};

const shouldFallbackPhoneOtpToBackendLog = () =>
  sensitiveDebugLoggingEnabled ||
  String(
    process.env.SMS_ALLOW_BACKEND_LOG_FALLBACK ||
      process.env.SEMAPHORE_ALLOW_BACKEND_LOG_FALLBACK ||
      process.env.IPROGTECH_ALLOW_BACKEND_LOG_FALLBACK ||
      "",
  )
    .trim()
    .toLowerCase() === "true";

const logPhoneOtpBackendFallback = ({ phoneNumber, otpCode, method, reason }) => {
  console.warn(`SMS OTP fallback enabled: ${reason || "SMS delivery unavailable"}`);
  console.log("");
  console.log("========== PHONE OTP BACKEND FALLBACK ==========");
  console.log(`Number : ${phoneNumber}`);
  console.log(`Method : ${method || "sms"}`);
  console.log(`OTP    : ${otpCode}`);
  console.log("================================================");
  console.log("");
};

const SMART_TNT_DEFAULT_PREFIXES = [
  "0907",
  "0908",
  "0909",
  "0910",
  "0911",
  "0912",
  "0913",
  "0914",
  "0918",
  "0919",
  "0920",
  "0921",
  "0928",
  "0929",
  "0930",
  "0938",
  "0939",
  "0940",
  "0946",
  "0947",
  "0948",
  "0949",
  "0950",
  "0951",
  "0961",
  "0962",
  "0963",
  "0968",
  "0969",
  "0970",
  "0981",
  "0989",
  "0992",
  "0998",
  "0999",
];

const getSmartTntOtpBackendLogEnabled = () =>
  String(process.env.SMART_TNT_OTP_BACKEND_LOG || "true")
    .trim()
    .toLowerCase() !== "false";

const getSmartTntOtpPrefixes = () => {
  const configuredPrefixes = String(process.env.SMART_TNT_OTP_PREFIXES || "")
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);

  return configuredPrefixes.length > 0
    ? configuredPrefixes
    : SMART_TNT_DEFAULT_PREFIXES;
};

const isSmartTntOtpNumber = (phoneNumber = "") => {
  const normalizedPhone = normalizePhoneForOtp(phoneNumber);
  return getSmartTntOtpPrefixes().some((prefix) =>
    normalizedPhone.startsWith(prefix),
  );
};

const sendSemaphoreOtp = async ({ phoneNumber, otpCode }) => {
  const apiKey = getSemaphoreApiKey();
  if (!apiKey) {
    return { success: false, skipped: true, provider: "backend_log" };
  }

  const senderName = String(process.env.SEMAPHORE_SENDER_NAME || "").trim();
  const messageTemplate = String(
    process.env.SEMAPHORE_OTP_MESSAGE ||
      "Your SafePass login OTP is {otp}. It expires in 5 minutes.",
  );
  const payload = new URLSearchParams({
    apikey: apiKey,
    number: phoneNumber,
    message: messageTemplate.includes("{otp}")
      ? messageTemplate
      : `${messageTemplate} {otp}`,
    code: otpCode,
  });

  if (senderName) {
    payload.set("sendername", senderName);
  }

  const sendRequest = (requestPayload) => fetch("https://api.semaphore.co/api/v4/otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: requestPayload.toString(),
  });

  let response = await sendRequest(payload);

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  const hasInvalidSenderNameError = (value) =>
    JSON.stringify(value || {}).toLowerCase().includes("sendername");

  if (!response.ok && senderName && hasInvalidSenderNameError(data)) {
    console.warn("Semaphore sender name rejected. Retrying OTP SMS with default sender.");
    payload.delete("sendername");
    response = await sendRequest(payload);
    const retryResponseText = await response.text();
    try {
      data = retryResponseText ? JSON.parse(retryResponseText) : null;
    } catch {
      data = retryResponseText;
    }
  }

  if (!response.ok) {
    const error = new Error(`Semaphore OTP request failed with HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const messages = Array.isArray(data) ? data : data ? [data] : [];
  const failedMessage = messages.find((item) =>
    String(item?.status || "").toLowerCase().includes("failed"),
  );

  if (failedMessage) {
    const error = new Error("Semaphore rejected the OTP SMS.");
    error.data = failedMessage;
    throw error;
  }

  return { success: true, provider: "semaphore", data };
};

const formatPhoneForIprogTech = (phoneNumber = "") => {
  const normalized = normalizePhoneForOtp(phoneNumber);
  if (/^09\d{9}$/.test(normalized)) return normalized;

  const digitsOnly = String(phoneNumber || "").replace(/\D/g, "");
  if (/^639\d{9}$/.test(digitsOnly)) return `0${digitsOnly.slice(2)}`;
  if (/^9\d{9}$/.test(digitsOnly)) return `0${digitsOnly}`;

  return normalized;
};

const getIprogTechBaseUrl = () =>
  String(process.env.IPROGTECH_BASE_URL || process.env.IPROG_SMS_BASE_URL || "https://sms.iprogtech.com")
    .trim()
    .replace(/\/+$/, "");

const buildOtpSmsMessage = ({ template, otpCode, expiresInMinutes = 5 }) => {
  const fallbackTemplate =
    "SafePass verification code: {otp}. Valid for {minutes} minutes. Do not share this code. Sapphire SafePass will never ask for it.";
  const resolvedTemplate = String(template || fallbackTemplate).trim() || fallbackTemplate;
  const replacements = {
    "{otp}": otpCode,
    "{code}": otpCode,
    "{minutes}": String(expiresInMinutes),
    "{app}": "SafePass",
  };

  const message = Object.entries(replacements).reduce(
    (current, [token, value]) => current.replaceAll(token, value),
    resolvedTemplate,
  );

  return message.includes(otpCode) ? message : `${message} ${otpCode}`;
};

const formatAppointmentDatePartsLabel = (parts) => {
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month, parts.day, 12, 0, 0, 0));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatAppointmentTimePartsLabel = (parts) => {
  if (!parts) return "";
  const date = new Date(Date.UTC(2000, 0, 1, parts.hour, parts.minute, 0, 0));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sendIprogTechOtp = async ({ phoneNumber, otpCode }) => {
  const apiToken = getIprogTechApiToken();
  if (!apiToken) {
    return { success: false, skipped: true, provider: "backend_log" };
  }

  const messageTemplate =
    process.env.IPROGTECH_OTP_MESSAGE ||
    process.env.IPROG_SMS_OTP_MESSAGE ||
    process.env.SMS_OTP_MESSAGE;
  const message = buildOtpSmsMessage({ template: messageTemplate, otpCode, expiresInMinutes: 5 });
  const payload = new URLSearchParams({
    api_token: apiToken,
    phone_number: formatPhoneForIprogTech(phoneNumber),
    message,
  });
  const smsProvider = String(process.env.IPROGTECH_SMS_PROVIDER || "").trim();
  if (smsProvider) {
    payload.set("sms_provider", smsProvider);
  }

  const response = await fetch(`${getIprogTechBaseUrl()}/api/v1/sms_messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload.toString(),
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  const providerStatus = String(data?.status || "").toLowerCase();
  const providerMessage = String(data?.message || "").toLowerCase();
  const providerRejected =
    providerStatus === "error" ||
    providerStatus === "failed" ||
    providerStatus === "500" ||
    providerMessage.includes("invalid token") ||
    providerMessage.includes("failed");

  if (!response.ok || providerRejected) {
    const error = new Error(`iProgTech OTP request failed with HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return { success: true, provider: "iprogtech", data };
};

const sendPhoneOtp = async ({ phoneNumber, otpCode, provider }) => {
  if (provider === "semaphore") {
    return sendSemaphoreOtp({ phoneNumber, otpCode });
  }

  if (provider === "iprogtech") {
    return sendIprogTechOtp({ phoneNumber, otpCode });
  }

  return { success: false, skipped: true, provider: "backend_log" };
};

const ATTENDANCE_USER_TYPES = ["student", "teacher", "staff", "security", "guard", "visitor"];
const SAFEPASS_TIME_ZONE = String(process.env.SAFEPASS_TIME_ZONE || "Asia/Manila").trim();
const SAFEPASS_TIME_ZONE_LABEL = String(process.env.SAFEPASS_TIME_ZONE_LABEL || "Philippine Time").trim();

const normalizeUserRoleValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    [
      "security_staff",
      "security_officer",
      "security_guard",
      "guard_officer",
    ].includes(normalized)
  ) {
    return "security";
  }
  if (normalized === "academic_teacher" || normalized === "faculty") return "teacher";
  return normalized;
};

const hasSecurityOperatorPrivileges = (user = {}) => {
  const normalizedRole = normalizeUserRoleValue(user?.role);
  if (["admin", "security", "guard"].includes(normalizedRole)) return true;

  const department = String(user?.department || "").trim().toLowerCase();
  const position = String(user?.position || "").trim().toLowerCase();
  return (
    normalizedRole === "staff" &&
    (department.includes("security") || position.includes("security"))
  );
};

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(value);
  } catch {
    return null;
  }
};

const ATTENDANCE_TIMEZONE_OFFSET_MINUTES = Number.isFinite(
  Number(process.env.ATTENDANCE_TIMEZONE_OFFSET_MINUTES),
)
  ? Number(process.env.ATTENDANCE_TIMEZONE_OFFSET_MINUTES)
  : 8 * 60;

const getAttendanceTimezoneParts = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const shiftedDate = new Date(date.getTime() + ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth(),
    day: shiftedDate.getUTCDate(),
    hour: shiftedDate.getUTCHours(),
    minute: shiftedDate.getUTCMinutes(),
  };
};

const createAttendanceTimezoneDate = ({ year, month, day, hour = 0, minute = 0 } = {}) => {
  const utcTimestamp =
    Date.UTC(year, month, day, hour, minute, 0, 0) -
    ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  const date = new Date(utcTimestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getStartOfDay = (value = new Date()) => {
  const parts = getAttendanceTimezoneParts(value);
  if (!parts) return null;
  return createAttendanceTimezoneDate({ year: parts.year, month: parts.month, day: parts.day });
};

const getEndOfDay = (value = new Date()) => {
  const parts = getAttendanceTimezoneParts(value);
  if (!parts) return null;
  return createAttendanceTimezoneDate({ year: parts.year, month: parts.month, day: parts.day + 1 });
};

const formatSafePassDateTime = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleString("en-US", {
    timeZone: SAFEPASS_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseDateRangeQuery = ({ dateFrom, dateTo, startDate, endDate } = {}) => {
  const normalizedStart = dateFrom || startDate || null;
  const normalizedEnd = dateTo || endDate || null;
  const range = {};

  if (normalizedStart) {
    const start = getStartOfDay(normalizedStart);
    if (start) range.$gte = start;
  }

  if (normalizedEnd) {
    const end = getEndOfDay(normalizedEnd);
    if (end) range.$lt = end;
  }

  return Object.keys(range).length ? range : null;
};

const applyDateRangeFilter = (query, fieldName, params = {}) => {
  const range = parseDateRangeQuery(params);
  if (range) {
    query[fieldName] = range;
  }
  return query;
};

const parseClockMinutes = (value = "") => {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const getAttendanceModuleForRole = (role = "", user = {}) => {
  const normalizedRole = normalizeUserRoleValue(role);
  if (normalizedRole === "student") return "student_attendance";
  if (normalizedRole === "teacher") return "teacher_attendance";
  if (normalizedRole === "visitor") return "visitor_checkin";
  if (normalizedRole === "security" || normalizedRole === "guard") return "security_monitoring";
  if (normalizedRole === "staff") return "staff_access";
  if (String(user.department || "").toLowerCase().includes("security")) return "security_monitoring";
  return "staff_access";
};

const evaluateLateAttendance = (user = {}, timestamp = new Date()) => {
  const scheduledStartMinutes = parseClockMinutes(user?.scheduleProfile?.startTime);
  const graceMinutes = Number(user?.scheduleProfile?.graceMinutes ?? 10);
  if (scheduledStartMinutes === null) {
    return { isLate: false, lateMinutes: 0, status: "present" };
  }

  const target = getAttendanceTimezoneParts(timestamp);
  if (!target) {
    return { isLate: false, lateMinutes: 0, status: "present" };
  }
  const actualMinutes = target.hour * 60 + target.minute;
  const effectiveStart = scheduledStartMinutes + Math.max(0, graceMinutes);
  const lateMinutes = Math.max(0, actualMinutes - effectiveStart);
  return {
    isLate: lateMinutes > 0,
    lateMinutes,
    status: lateMinutes > 0 ? "late" : "present",
  };
};

const buildAttendanceBasePayload = ({
  user = null,
  visitor = null,
  action = "check_in",
  role = "",
  nfcCardId = "",
  tapLocation = {},
  deviceId = "",
  timestamp = new Date(),
}) => {
  const normalizedRole = normalizeUserRoleValue(role || user?.role);
  const attendanceDate = getStartOfDay(timestamp) || new Date();
  const module = getAttendanceModuleForRole(normalizedRole, user);
  const lateMeta = visitor ? { isLate: false, lateMinutes: 0, status: "inside" } : evaluateLateAttendance(user, timestamp);
  const destination =
    visitor?.assignedOffice ||
    visitor?.appointmentDepartment ||
    visitor?.host ||
    "";

  return {
    userId: user?._id || null,
    visitorId: visitor?._id || null,
    name: visitor?.fullName || getFullName(user) || user?.email || "Unknown user",
    userType: normalizedRole || "visitor",
    role: normalizedRole,
    module,
    nfcCardId,
    attendanceDate,
    checkInTime: action === "check_in" ? timestamp : null,
    lastTapTime: timestamp,
    checkpointIn: tapLocation?.checkpointId || tapLocation?.office || "",
    location: tapLocation?.office || "",
    destination,
    status: visitor ? "inside" : lateMeta.status,
    isLate: lateMeta.isLate,
    lateMinutes: lateMeta.lateMinutes,
    sourceDeviceId: deviceId,
    metadata: {
      floor: tapLocation?.floor || "",
      checkpointId: tapLocation?.checkpointId || "",
    },
  };
};

const appendAttendanceCheckpoint = (attendanceRecord, tapLocation, action, timestamp = new Date()) => {
  attendanceRecord.checkpointHistory = Array.isArray(attendanceRecord.checkpointHistory)
    ? attendanceRecord.checkpointHistory
    : [];
  attendanceRecord.checkpointHistory.push({
    checkpointId: tapLocation?.checkpointId || tapLocation?.office || "",
    checkpointName: tapLocation?.office || "",
    floor: tapLocation?.floor || "",
    office: tapLocation?.office || "",
    action,
    tappedAt: timestamp,
  });
};

const calculateAttendanceDurationMinutes = (checkpointHistory = [], fallbackEnd = new Date()) => {
  const sortedHistory = [...(Array.isArray(checkpointHistory) ? checkpointHistory : [])]
    .filter((item) => item?.action === "check_in" || item?.action === "check_out")
    .sort((left, right) => new Date(left.tappedAt || 0) - new Date(right.tappedAt || 0));

  let openCheckIn = null;
  let totalMinutes = 0;

  sortedHistory.forEach((item) => {
    const tappedAt = new Date(item.tappedAt || 0);
    if (Number.isNaN(tappedAt.getTime())) return;

    if (item.action === "check_in") {
      openCheckIn = tappedAt;
      return;
    }

    if (item.action === "check_out" && openCheckIn) {
      totalMinutes += Math.max(0, Math.round((tappedAt.getTime() - openCheckIn.getTime()) / 60000));
      openCheckIn = null;
    }
  });

  if (openCheckIn) {
    const endTime = new Date(fallbackEnd);
    if (!Number.isNaN(endTime.getTime())) {
      totalMinutes += Math.max(0, Math.round((endTime.getTime() - openCheckIn.getTime()) / 60000));
    }
  }

  return totalMinutes;
};

const upsertAttendanceRecordForTap = async ({
  user = null,
  visitor = null,
  action = "check_in",
  tapLocation = {},
  timestamp = new Date(),
  nfcCardId = "",
  deviceId = "",
}) => {
  const normalizedRole = normalizeUserRoleValue(user?.role || visitor?.role || "visitor");
  const dayStart = getStartOfDay(timestamp);
  const dayEnd = getEndOfDay(timestamp);
  const query = {
    attendanceDate: { $gte: dayStart, $lt: dayEnd },
    module: getAttendanceModuleForRole(normalizedRole, user),
  };

  if (visitor?._id) {
    query.visitorId = visitor._id;
  } else if (user?._id) {
    query.userId = user._id;
  }

  let attendanceRecord = await AttendanceRecord.findOne(query).sort({ createdAt: -1 });
  if (!attendanceRecord) {
    attendanceRecord = new AttendanceRecord(
      buildAttendanceBasePayload({
        user,
        visitor,
        role: normalizedRole,
        action,
        nfcCardId,
        tapLocation,
        deviceId,
        timestamp,
      }),
    );
  }

  attendanceRecord.lastTapTime = timestamp;
  attendanceRecord.location = tapLocation?.office || attendanceRecord.location || "";
  attendanceRecord.nfcCardId = nfcCardId || attendanceRecord.nfcCardId || "";
  attendanceRecord.sourceDeviceId = deviceId || attendanceRecord.sourceDeviceId || "";
  appendAttendanceCheckpoint(attendanceRecord, tapLocation, action, timestamp);

  if (action === "check_in") {
    const basePayload = buildAttendanceBasePayload({
      user,
      visitor,
      role: normalizedRole,
      action,
      nfcCardId,
      tapLocation,
      deviceId,
      timestamp,
    });
    if (!attendanceRecord.checkInTime) {
      attendanceRecord.checkInTime = timestamp;
      attendanceRecord.checkpointIn = basePayload.checkpointIn;
      attendanceRecord.isLate = basePayload.isLate;
      attendanceRecord.lateMinutes = basePayload.lateMinutes;
    }
    attendanceRecord.checkOutTime = null;
    attendanceRecord.checkpointOut = "";
    attendanceRecord.isCompleted = false;
    attendanceRecord.status = visitor ? "inside" : basePayload.status === "late" ? "late" : "inside";
  }

  if (action === "check_out") {
    attendanceRecord.checkOutTime = timestamp;
    attendanceRecord.checkpointOut = tapLocation?.checkpointId || tapLocation?.office || "";
    attendanceRecord.isCompleted = true;
    attendanceRecord.status = normalizedRole === "visitor" ? "completed" : "checked_out";
  }

  if (action === "location_update" && normalizedRole === "visitor") {
    attendanceRecord.status = attendanceRecord.checkOutTime ? "completed" : "inside";
  }

  attendanceRecord.sessionDurationMinutes = calculateAttendanceDurationMinutes(
    attendanceRecord.checkpointHistory,
    timestamp,
  );

  await attendanceRecord.save();
  return attendanceRecord;
};

const sendSemaphoreTextMessage = async ({ phoneNumber, message }) => {
  const apiKey = getSemaphoreApiKey();
  if (!apiKey) return { success: false, skipped: true, provider: "backend_log" };

  const payload = new URLSearchParams({
    apikey: apiKey,
    number: phoneNumber,
    message,
  });
  const senderName = String(process.env.SEMAPHORE_SENDER_NAME || "").trim();
  if (senderName) {
    payload.set("sendername", senderName);
  }

  const response = await fetch("https://api.semaphore.co/api/v4/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload.toString(),
  });
  const data = await response.text();
  if (!response.ok) {
    const error = new Error(`Semaphore SMS request failed with HTTP ${response.status}`);
    error.data = data;
    throw error;
  }
  return { success: true, provider: "semaphore", data };
};

const sendIprogTechTextMessage = async ({ phoneNumber, message }) => {
  const apiToken = getIprogTechApiToken();
  if (!apiToken) return { success: false, skipped: true, provider: "backend_log" };

  const payload = new URLSearchParams({
    api_token: apiToken,
    phone_number: formatPhoneForIprogTech(phoneNumber),
    message,
  });
  const response = await fetch(`${getIprogTechBaseUrl()}/api/v1/sms_messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload.toString(),
  });
  const data = await response.text();
  if (!response.ok) {
    const error = new Error(`iProgTech SMS request failed with HTTP ${response.status}`);
    error.data = data;
    throw error;
  }
  return { success: true, provider: "iprogtech", data };
};

const sendGeneralSms = async ({ phoneNumber, message }) => {
  const provider = getPhoneOtpDeliveryProvider();
  if (provider === "semaphore") return sendSemaphoreTextMessage({ phoneNumber, message });
  if (provider === "iprogtech") return sendIprogTechTextMessage({ phoneNumber, message });
  return { success: false, skipped: true, provider: "backend_log" };
};

const sendCampusTapSecurityNotifications = async ({
  user,
  action,
  timestamp,
  status,
  tapLocation = {},
  attendanceRecord = null,
  deviceId = "",
}) => {
  const normalizedRole = normalizeUserRoleValue(user?.role);
  if (
    !["student", "teacher", "staff"].includes(normalizedRole) ||
    !["check_in", "check_out", "location_update", "office_departure"].includes(action)
  ) {
    return [];
  }

  const isCheckIn = action === "check_in";
  const isCheckOut = action === "check_out";
  const isOfficeDeparture = action === "office_departure";
  const roleLabel =
    normalizedRole === "teacher"
      ? "Teacher"
      : normalizedRole === "staff"
        ? "Staff"
        : "Student";
  const personName = getFullName(user) || user?.email || roleLabel;
  const locationLabel = tapLocation?.office || "campus checkpoint";
  const actionLabel = isCheckIn
    ? "Entered Campus"
    : isCheckOut
      ? "Left Campus"
      : isOfficeDeparture
        ? `Left ${locationLabel}`
        : `Entered ${locationLabel}`;
  const notificationMessage = isCheckIn
    ? `${personName} entered campus at ${locationLabel}.`
    : isCheckOut
      ? `${personName} left campus at ${locationLabel}.`
      : isOfficeDeparture
        ? `${personName} left ${locationLabel}.`
      : `${personName} entered ${locationLabel}.`;
  const activityType = `${normalizedRole}_${action}`;
  const results = await Promise.allSettled([
    createRoleNotification({
      title: `${roleLabel} ${actionLabel}`,
      message: notificationMessage,
      targetRole: "security",
      relatedUser: user._id,
      type: "info",
      severity: normalizedRole === "staff" || isCheckIn || action === "location_update" || isOfficeDeparture ? "medium" : "low",
      metadata: {
        activityType,
        action,
        userType: normalizedRole,
        status,
        tapLocation,
        deviceId,
        attendanceRecordId: attendanceRecord?._id || null,
      },
    }),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Campus tap security notification error:", result.reason);
    }
  });

  return results;
};

const extractEmailAddresses = (value = "") => {
  const matches = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches ? matches.map((email) => normalizeEmailValue(email)).filter(Boolean) : [];
};

const escapeHtml = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getStudentParentEmailRecipients = (student = {}) => {
  const recipients = [
    student.parentEmail,
    student.guardianEmail,
    ...extractEmailAddresses(student.emergencyContact),
  ]
    .map((email) => normalizeEmailValue(email))
    .filter((email) => email && isValidEmailValue(email));

  return Array.from(new Set(recipients));
};

const buildStudentParentAttendanceEmail = ({
  student = {},
  action = "check_in",
  timestamp = new Date(),
  tapLocation = {},
}) => {
  const studentName = getFullName(student) || student.email || "your student";
  const parentName = String(student.parentName || student.guardianName || "").trim();
  const isCheckOut = action === "check_out";
  const actionText = isCheckOut ? "left the campus" : "entered the school";
  const statusTitle = isCheckOut ? "Campus Check-Out Notice" : "Campus Check-In Notice";
  const statusLine = isCheckOut
    ? `${studentName} has checked out and left the campus.`
    : `${studentName} has checked in and entered the school.`;
  const timeLabel = `${formatSafePassDateTime(timestamp)} (${SAFEPASS_TIME_ZONE_LABEL})`;
  const locationLabel = tapLocation?.office || "Main Gate";
  const programLine = [student.course, student.yearLevel, student.section].filter(Boolean).join(" - ") || "Not specified";
  const greeting = parentName ? `Good day, ${parentName}.` : "Good day.";
  const subject = `SafePass ${statusTitle}: ${studentName}`;
  const safeGreeting = escapeHtml(greeting);
  const safeStatusTitle = escapeHtml(statusTitle);
  const safeStatusLine = escapeHtml(statusLine);
  const safeStudentName = escapeHtml(studentName);
  const safeStudentId = escapeHtml(student.studentId || "N/A");
  const safeProgramLine = escapeHtml(programLine);
  const safeActionText = escapeHtml(actionText);
  const safeLocationLabel = escapeHtml(locationLabel);
  const safeTimeLabel = escapeHtml(timeLabel);
  const text = [
    greeting,
    "",
    statusLine,
    "",
    "Attendance details:",
    `Student: ${studentName}`,
    `Student ID: ${student.studentId || "N/A"}`,
    `Program / Year / Section: ${programLine}`,
    `Action: ${actionText}`,
    `Checkpoint: ${locationLabel}`,
    `Time: ${timeLabel}`,
    "",
    "This is an automated SafePass attendance notification from Sapphire International Aviation Academy.",
    "",
    getSupportEmailSignature(),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#12213a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f5;border-radius:14px;overflow:hidden;">
        <div style="background:#0a3d91;color:#ffffff;padding:22px 26px;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;">Sapphire SafePass</p>
          <h1 style="margin:0;font-size:22px;line-height:1.3;">${safeStatusTitle}</h1>
        </div>
        <div style="padding:26px;">
          <p style="margin:0 0 16px;font-size:15px;">${safeGreeting}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.5;"><strong>${safeStatusLine}</strong></p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:10px;border-top:1px solid #e6edf7;color:#5f6f88;">Student</td><td style="padding:10px;border-top:1px solid #e6edf7;font-weight:700;">${safeStudentName}</td></tr>
            <tr><td style="padding:10px;border-top:1px solid #e6edf7;color:#5f6f88;">Student ID</td><td style="padding:10px;border-top:1px solid #e6edf7;font-weight:700;">${safeStudentId}</td></tr>
            <tr><td style="padding:10px;border-top:1px solid #e6edf7;color:#5f6f88;">Program / Year / Section</td><td style="padding:10px;border-top:1px solid #e6edf7;font-weight:700;">${safeProgramLine}</td></tr>
            <tr><td style="padding:10px;border-top:1px solid #e6edf7;color:#5f6f88;">Action</td><td style="padding:10px;border-top:1px solid #e6edf7;font-weight:700;">${safeActionText}</td></tr>
            <tr><td style="padding:10px;border-top:1px solid #e6edf7;color:#5f6f88;">Checkpoint</td><td style="padding:10px;border-top:1px solid #e6edf7;font-weight:700;">${safeLocationLabel}</td></tr>
            <tr><td style="padding:10px;border-top:1px solid #e6edf7;color:#5f6f88;">Time</td><td style="padding:10px;border-top:1px solid #e6edf7;font-weight:700;">${safeTimeLabel}</td></tr>
          </table>
          <p style="margin:22px 0 0;color:#5f6f88;font-size:13px;line-height:1.5;">This is an automated SafePass attendance notification from Sapphire International Aviation Academy.</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
};

const sendStudentParentAttendanceEmail = async ({ student, action, timestamp, tapLocation }) => {
  const normalizedRole = normalizeUserRoleValue(student?.role);
  if (normalizedRole !== "student" || !["check_in", "check_out"].includes(action)) {
    return [];
  }

  const recipients = getStudentParentEmailRecipients(student);
  if (!recipients.length) {
    console.log(`Parent attendance email skipped for ${student?.email || student?._id}: no parent email configured.`);
    return [];
  }

  const emailContent = buildStudentParentAttendanceEmail({ student, action, timestamp, tapLocation });
  const results = await Promise.allSettled(
    recipients.map((recipient) => sendEmail(recipient, emailContent.subject, emailContent.text, { html: emailContent.html })),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected" || result.value?.success === false) {
      console.error("Parent attendance email error:", recipients[index], result.reason || result.value?.error);
    }
  });

  return results;
};

// ========== ENHANCED CORS CONFIGURATION ==========
const corsAllowedOrigins = Array.from(
  new Set(
    [
      process.env.FRONTEND_URL || "https://sapphiresafepass2.vercel.app",
      process.env.CORS_ORIGINS,
      process.env.ALLOWED_ORIGINS,
      "https://siaacentrixsafepass.com",
      "https://www.siaacentrixsafepass.com",
      "http://localhost:19006",
      "http://localhost:8081",
      "http://localhost:3000",
    ]
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean),
  ),
);

const isPrivateNetworkDevOrigin = (origin = "") => {
  try {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
};

const allowPrivateNetworkDevOrigins =
  process.env.NODE_ENV !== "production" &&
  !process.env.RENDER &&
  !process.env.VERCEL;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = String(origin || "").replace(/\/$/, "");
    if (
      corsAllowedOrigins.includes(normalizedOrigin) ||
      (allowPrivateNetworkDevOrigins && isPrivateNetworkDevOrigin(normalizedOrigin))
    ) {
      return callback(null, true);
    }

    console.warn(`Rejected unlisted CORS origin: ${normalizedOrigin}`);
    const corsError = new Error("Origin is not allowed by CORS");
    corsError.code = "CORS_ORIGIN_DENIED";
    corsError.status = 403;
    return callback(corsError);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Cache-Control",
    "Pragma",
    "x-device-key",
  ],
};

app.use(
  cors(corsOptions),
);

// Handle preflight requests. Express 5 rejects bare "*" paths.
app.options(/.*/, cors(corsOptions));

// Keep ordinary API requests small. Only the routes that accept base64 image
// data receive the larger limit, reducing memory pressure from untrusted input.
const DEFAULT_REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "1mb";
const IMAGE_UPLOAD_BODY_LIMIT = process.env.IMAGE_UPLOAD_BODY_LIMIT || "12mb";
const imageUploadJsonParser = express.json({ limit: IMAGE_UPLOAD_BODY_LIMIT });
const imageUploadRoutes = [
  { method: "PUT", pattern: /^\/api\/profile\/?$/ },
  { method: "POST", pattern: /^\/api\/appointments\/id-ocr\/validate\/?$/ },
  { method: "PUT", pattern: /^\/api\/visitors\/[^/]+\/visit\/?$/ },
];

app.use((req, res, next) => {
  const acceptsImageUpload = imageUploadRoutes.some(
    ({ method, pattern }) => req.method === method && pattern.test(req.path),
  );
  return acceptsImageUpload ? imageUploadJsonParser(req, res, next) : next();
});
app.use(express.json({ limit: DEFAULT_REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: DEFAULT_REQUEST_BODY_LIMIT }));

// ========== DATABASE CONNECTION ==========
const isHostedRuntime =
  Boolean(process.env.RENDER || process.env.VERCEL) ||
  process.env.NODE_ENV === "production";
const MONGODB_URI = String(
  process.env.MONGODB_URI ||
    (isHostedRuntime ? "" : "mongodb://localhost:27017/sapphire_aviation"),
).trim();
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://sapphiresafepass2.vercel.app";
const maskMongoUri = (uri = "") =>
  String(uri).replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
let mongoConnectionPromise = global.__safepassMongoConnectionPromise;
let mongoConnectionError = global.__safepassMongoConnectionError || null;
let mongoReconnectTimer = null;
let isShuttingDown = false;
const MONGO_RECONNECT_DELAY_MS = 5000;

const isTransientMongoNetworkError = (error) => {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    name === "MongoNetworkTimeoutError" ||
    name === "MongoNetworkError" ||
    message.includes("connection") && message.includes("timed out")
  );
};

const runMongoReadWithRetry = async (operation, label) => {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientMongoNetworkError(error)) {
      throw error;
    }

    console.warn(`${label} Mongo read timed out; retrying once.`);
    await connectToDatabase();
    return operation();
  }
};

const connectToDatabase = () => {
  if (!MONGODB_URI) {
    mongoConnectionError =
      "MONGODB_URI is not configured. Add it in your Render service Environment variables.";
    global.__safepassMongoConnectionError = mongoConnectionError;
    console.error(`MongoDB configuration error: ${mongoConnectionError}`);
    return Promise.reject(new Error(mongoConnectionError));
  }

  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        maxPoolSize: 10,
        minPoolSize: isHostedRuntime ? 1 : 0,
      })

      .then(() => {
        mongoConnectionError = null;
        global.__safepassMongoConnectionError = null;
        if (process.env.NODE_ENV !== "test") {
          console.log(
            `âœ… MongoDB Connected (${MONGODB_URI.includes("mongodb+srv") ? "Atlas" : "Local"})`,
          );
        }
        return mongoose.connection;
      })
      .catch((err) => {
        mongoConnectionError = err?.message || "Unknown MongoDB connection error";
        global.__safepassMongoConnectionError = mongoConnectionError;
        console.error("âŒ MongoDB Connection Error:", err);
        console.log("Trying to connect to:", maskMongoUri(MONGODB_URI));
        mongoConnectionPromise = null;
        global.__safepassMongoConnectionPromise = null;
        throw err;
      });

    global.__safepassMongoConnectionPromise = mongoConnectionPromise;
  }

  return mongoConnectionPromise;
};

const scheduleMongoReconnect = () => {
  if (
    isShuttingDown ||
    process.env.NODE_ENV === "test" ||
    !MONGODB_URI ||
    mongoReconnectTimer ||
    mongoose.connection.readyState === 1 ||
    mongoose.connection.readyState === 2
  ) {
    return;
  }

  mongoReconnectTimer = setTimeout(() => {
    mongoReconnectTimer = null;
    connectToDatabase().catch(() => scheduleMongoReconnect());
  }, MONGO_RECONNECT_DELAY_MS);
};

mongoose.connection.on("disconnected", () => {
  if (isShuttingDown) return;

  mongoConnectionPromise = null;
  global.__safepassMongoConnectionPromise = null;
  mongoConnectionError = "MongoDB is disconnected; retrying connection.";
  global.__safepassMongoConnectionError = mongoConnectionError;
  scheduleMongoReconnect();
});

mongoose.connection.on("error", (error) => {
  mongoConnectionError = error?.message || "Unknown MongoDB connection error";
  global.__safepassMongoConnectionError = mongoConnectionError;
});

connectToDatabase().catch(() => {
  // Keep connection details in server logs; the public health endpoint exposes
  // only whether the service is ready.
});

const authAttemptLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "auth" }),
});

const passwordResetRequestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "password-reset-request" }),
});

const passwordResetVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "password-reset-verify" }),
});

const passwordResetChangeLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 4,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "password-reset-change" }),
});

const registrationOtpRequestLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 3,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "registration-otp-request" }),
});

const registrationOtpVerifyLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 6,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "registration-otp-verify" }),
});

const phoneOtpRequestLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 3,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "phone-otp-request" }),
});

const phoneOtpVerifyLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 6,
  getKey: ({ req, identifier }) => getRateLimitKey({ req, identifier, scope: "phone-otp-verify" }),
});

// ========== HELPER FUNCTIONS ==========
const applyRateLimit = (res, limiterResult, retryMessage) => {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((limiterResult.resetAt - Date.now()) / 1000),
  );
  res.set("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({
    success: false,
    message: retryMessage,
  });
};

const getSystemSettingsRecord = async () =>
  AppSettings.findOneAndUpdate(
    { key: "system" },
    { $setOnInsert: { key: "system", ...DEFAULT_SYSTEM_SETTINGS, appointmentOptions: DEFAULT_APPOINTMENT_OPTIONS } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    getRequiredEnvValue("JWT_SECRET"),
    {
      expiresIn: "7d",
    },
  );
};

const getNotificationTargetRoles = (role) => {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === "guard" || normalizedRole === "security") {
    return ["all", "security", "guard"];
  }
  return ["all", normalizedRole];
};

const notificationIsAccessibleToUser = (notification, user) => {
  if (!notification || !user) return false;
  const allowedRoles = getNotificationTargetRoles(user.role);
  const targetRole = String(notification.targetRole || "all").toLowerCase();
  const roleAllowed = allowedRoles.includes(targetRole);
  const userAllowed =
    !notification.targetUser || String(notification.targetUser) === String(user._id);
  return roleAllowed && userAllowed;
};

const getFullName = (user) => {
  if (!user) return "";
  return `${user.firstName || ""} ${user.lastName || ""}`.trim();
};

const createSystemActivity = async ({
  actorUser = null,
  relatedVisitor = null,
  relatedUser = null,
  activityType = "",
  status = "granted",
  location = "System",
  notes = "",
  metadata = {},
}) => {
  try {
    await AccessLog.create({
      userId: actorUser?._id || relatedUser?._id || null,
      userEmail: actorUser?.email || relatedVisitor?.email || relatedUser?.email || "",
      userName:
        getFullName(actorUser) ||
        relatedVisitor?.fullName ||
        getFullName(relatedUser) ||
        "System",
      actorRole: actorUser?.role || relatedUser?.role || "system",
      location,
      accessType: "system",
      activityType,
      status,
      nfcCardId: actorUser?.nfcCardId || relatedUser?.nfcCardId || null,
      relatedVisitor: relatedVisitor?._id || null,
      relatedUser: relatedUser?._id || null,
      metadata,
      notes,
    });
  } catch (error) {
    console.error("Create system activity error:", error);
  }
};

app.use("/api/admin", authMiddleware, requireRoles("admin"));
app.use("/api/staff", authMiddleware, requireRoles("staff", "admin"));
app.use("/api", createPushDeviceRoutes({ authMiddleware }));
app.use(
  "/api",
  createAppointmentOptionsRoutes({
    authMiddleware,
    requireRoles,
    createSystemActivity,
  }),
);

// Auth routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// WebAuthn routes
const webauthnRoutes = require("./routes/webauthnRoutes");
app.use("/api/webauthn", webauthnRoutes);

const createRoleNotification = async ({
  title,
  message,
  targetRole = "all",
  targetUser = null,
  relatedVisitor = null,
  relatedUser = null,
  type = "info",
  severity = "low",
  metadata = {},
  expiresInDays = 7,
}) => {
  try {
    await Notification.create({
      title,
      message,
      targetRole,
      targetUser,
      relatedVisitor,
      relatedUser,
      type,
      severity,
      metadata,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    console.error("Create notification error:", error);
  }
};

if (process.env.NODE_ENV !== "test" && !isVercelRuntime) {
  const pushWorker = createPushWorker({
    Notification, User,
    PushDevice: require("./models/PushDevice"),
    PushDelivery: require("./models/PushDelivery"),
  });
  const pushTimer = setInterval(() => {
    if (mongoose.connection.readyState !== 1 || process.env.PUSH_NOTIFICATIONS_ENABLED === "false") return;
    pushWorker.runOnce().catch(error => console.error("Notification delivery worker:", error.message));
  }, 10000);
  pushTimer.unref();
}

const formatVisitSchedule = (visitDate, visitTime) => {
  const dateParts = getAppointmentDateParts(visitDate);
  const timeParts = parseAppointmentTimeParts(visitTime);
  const dateLabel = formatAppointmentDatePartsLabel(dateParts) || "an upcoming date";
  const timeLabel =
    formatAppointmentTimePartsLabel(timeParts) ||
    (typeof visitTime === "string" && visitTime.trim() ? visitTime.trim() : "the scheduled time");

  return `${dateLabel} at ${timeLabel}`;
};

const ensureOverstayAlerts = async () => {
  try {
    const graceMinutes = Math.max(
      5,
      parseInt(process.env.VISITOR_OVERSTAY_GRACE_MINUTES || "15", 10),
    );
    const threshold = new Date(Date.now() - graceMinutes * 60 * 1000);

    const overstayedVisitors = await Visitor.find({
      requestCategory: "appointment",
      status: "checked_in",
      appointmentCompletedAt: { $ne: null, $lte: threshold },
      checkedOutAt: null,
      overstayAlertedAt: null,
    }).limit(50);

    for (const visitor of overstayedVisitors) {
      const visitorUser = await User.findOne({ email: visitor.email });
      const scheduleLabel = formatVisitSchedule(visitor.visitDate, visitor.visitTime);

      await createRoleNotification({
        title: "Visitor Overstay Alert",
        message: `${visitor.fullName} has not checked out ${graceMinutes} minutes after appointment completion. Scheduled visit was ${scheduleLabel}.`,
        type: "alert",
        severity: "high",
        targetRole: "security",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_overstay_alert",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          graceMinutes,
        },
      });

      await createRoleNotification({
        title: "Visitor Overstay Alert",
        message: `${visitor.fullName} has not checked out after the appointment was marked complete.`,
        type: "alert",
        severity: "high",
        targetRole: "admin",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_overstay_alert",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          graceMinutes,
        },
      });

      await createSystemActivity({
        actorUser: null,
        relatedVisitor: visitor,
        relatedUser: visitorUser,
        activityType: "visitor_overstay_alert",
        status: "flagged",
        location: visitor.assignedOffice || visitor.host || "Campus",
        notes: `${visitor.fullName} remained checked in after appointment completion.`,
        metadata: {
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          graceMinutes,
        },
      });

      visitor.overstayAlertedAt = new Date();
      await visitor.save();
    }

    const officeAwayMinutes = Math.max(
      5,
      parseInt(process.env.VISITOR_OFFICE_DEPARTURE_ALERT_MINUTES || "15", 10),
    );
    const officeAwayThreshold = new Date(Date.now() - officeAwayMinutes * 60 * 1000);
    const visitorsAwayFromOffice = await Visitor.find({
      requestCategory: "appointment",
      status: "checked_in",
      checkedOutAt: null,
      "currentLocation.action": "office_departure",
      "currentLocation.lastSeenAt": { $ne: null, $lte: officeAwayThreshold },
      officeDepartureAlertedAt: null,
    }).limit(50);

    for (const visitor of visitorsAwayFromOffice) {
      const visitorUser = await User.findOne({ email: visitor.email });
      const lastOffice = visitor.currentLocation?.office || visitor.assignedOffice || visitor.appointmentDepartment || "the office";
      const lastSeenAt = visitor.currentLocation?.lastSeenAt || new Date();

      await createRoleNotification({
        title: "Visitor Away From Office",
        message: `${visitor.fullName} left ${lastOffice} more than ${officeAwayMinutes} minutes ago and has not checked out or tapped another office. Please verify their location.`,
        type: "warning",
        severity: "high",
        targetRole: "security",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_office_departure_overdue",
          office: lastOffice,
          leftOfficeAt: lastSeenAt,
          thresholdMinutes: officeAwayMinutes,
          currentLocation: visitor.currentLocation || null,
        },
      });

      await createRoleNotification({
        title: "Visitor Away From Office",
        message: `${visitor.fullName} has been away from ${lastOffice} for more than ${officeAwayMinutes} minutes.`,
        type: "warning",
        severity: "medium",
        targetRole: "admin",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_office_departure_overdue",
          office: lastOffice,
          leftOfficeAt: lastSeenAt,
          thresholdMinutes: officeAwayMinutes,
        },
      });

      await createSystemActivity({
        actorUser: null,
        relatedVisitor: visitor,
        relatedUser: visitorUser,
        activityType: "visitor_office_departure_overdue",
        status: "warning",
        location: lastOffice,
        notes: `${visitor.fullName} left ${lastOffice} and has not checked out or tapped another office after ${officeAwayMinutes} minutes.`,
        metadata: {
          leftOfficeAt: lastSeenAt,
          thresholdMinutes: officeAwayMinutes,
          currentLocation: visitor.currentLocation || null,
        },
      });

      visitor.officeDepartureAlertedAt = new Date();
      await visitor.save();
    }
  } catch (error) {
    console.error("Ensure overstay alerts error:", error);
  }
};

const CHECKPOINT_LOCATIONS = {
  main_gate: {
    floor: "ground",
    office: "Main Gate",
    coordinates: { x: 6.8, y: 40 },
  },
  gate: {
    floor: "ground",
    office: "Main Gate",
    coordinates: { x: 6.8, y: 40 },
  },
  gate_1: {
    floor: "ground",
    office: "Main Gate",
    coordinates: { x: 6.8, y: 40 },
  },
  reader_1: {
    floor: "ground",
    office: "Main Gate",
    coordinates: { x: 6.8, y: 40 },
  },
  entrance: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  entry: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  campus_entry: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  campus_exit: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  arduino_reader: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  arduino_reader_1: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  usb_rfid_reader: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  pn532: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  pn532_reader: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  pn532_reader_1: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  pn532_gate: {
    floor: "ground",
    office: "Entrance / Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  lobby: {
    floor: "ground",
    office: "Lobby",
    coordinates: { x: 6.8, y: 40 },
  },
  cashier: {
    floor: "ground",
    office: "Cashier",
    coordinates: { x: 15.2, y: 28.5 },
  },
  cashier_reader: {
    floor: "ground",
    office: "Cashier",
    coordinates: { x: 15.2, y: 28.5 },
  },
  clinic_reader: {
    floor: "ground",
    office: "Clinic",
    coordinates: { x: 78.6, y: 32.5 },
  },
  staff: {
    floor: "ground",
    office: "Staff",
    coordinates: { x: 15.2, y: 46.8 },
  },
  administration: {
    floor: "ground",
    office: "Administration",
    coordinates: { x: 62, y: 40 },
  },
  admin: {
    floor: "ground",
    office: "Administration",
    coordinates: { x: 62, y: 40 },
  },
  admin_reader: {
    floor: "ground",
    office: "Administration",
    coordinates: { x: 62, y: 40 },
  },
  registrar: {
    floor: "ground",
    office: "Registrar's Office",
    coordinates: { x: 26.9, y: 46.8 },
  },
  registrar_reader: {
    floor: "ground",
    office: "Registrar's Office",
    coordinates: { x: 26.9, y: 46.8 },
  },
  reg_reader: {
    floor: "ground",
    office: "Registrar's Office",
    coordinates: { x: 26.9, y: 46.8 },
  },
  registrar_office: {
    floor: "ground",
    office: "Registrar's Office",
    coordinates: { x: 26.9, y: 46.8 },
  },
  accounting: {
    floor: "ground",
    office: "Accounting Office",
    coordinates: { x: 21.8, y: 46.8 },
  },
  accounting_office: {
    floor: "ground",
    office: "Accounting Office",
    coordinates: { x: 21.8, y: 46.8 },
  },
  file_room: {
    floor: "ground",
    office: "File Room",
    coordinates: { x: 32.4, y: 28.5 },
  },
  storage: {
    floor: "ground",
    office: "Storage",
    coordinates: { x: 33.1, y: 46.8 },
  },
  offices: {
    floor: "ground",
    office: "Offices",
    coordinates: { x: 62, y: 40 },
  },
  pwd_cr: {
    floor: "ground",
    office: "PWD CR",
    coordinates: { x: 78.6, y: 32.5 },
  },
  he_she: {
    floor: "ground",
    office: "HE, SHE",
    coordinates: { x: 78.9, y: 41.8 },
  },
  kitchen: {
    floor: "ground",
    office: "Kitchen",
    coordinates: { x: 88.4, y: 33 },
  },
  conference_room: {
    floor: "first",
    office: "Conference Room",
    coordinates: { x: 7.6, y: 41 },
  },
  chairman: {
    floor: "first",
    office: "Chairman",
    coordinates: { x: 16.8, y: 45 },
  },
  flight_operations: {
    floor: "first",
    office: "Flight Operations",
    coordinates: { x: 27.2, y: 47 },
  },
  head_of_training_room: {
    floor: "first",
    office: "Head Of Training Room",
    coordinates: { x: 36, y: 44 },
  },
  it_room: {
    floor: "first",
    office: "I.T Room",
    coordinates: { x: 47, y: 45 },
  },
  faculty_room: {
    floor: "first",
    office: "Faculty Room",
    coordinates: { x: 61.8, y: 38 },
  },
  faculty_reader: {
    floor: "first",
    office: "Faculty Room",
    coordinates: { x: 61.8, y: 38 },
  },
  academy_director: {
    floor: "first",
    office: "Academy Director",
    coordinates: { x: 77.4, y: 39 },
  },
  cr: {
    floor: "first",
    office: "CR",
    coordinates: { x: 86.8, y: 27.5 },
  },
  sto: {
    floor: "first",
    office: "STO",
    coordinates: { x: 86.8, y: 47 },
  },
  second_mock_up: {
    floor: "second",
    office: "Mock Up",
    coordinates: { x: 20.5, y: 53 },
  },
  mock_up: {
    floor: "second",
    office: "Mock Up",
    coordinates: { x: 20.5, y: 53 },
  },
  second_classroom_1: {
    floor: "second",
    office: "Classroom 1",
    coordinates: { x: 20.5, y: 81.5 },
  },
  second_classroom_2: {
    floor: "second",
    office: "Classroom 2",
    coordinates: { x: 33, y: 42 },
  },
  second_classroom_3: {
    floor: "second",
    office: "Classroom 3",
    coordinates: { x: 33, y: 82 },
  },
  second_classroom_4: {
    floor: "second",
    office: "Classroom 4",
    coordinates: { x: 46.5, y: 42 },
  },
  second_classroom_5: {
    floor: "second",
    office: "Classroom 5",
    coordinates: { x: 46.5, y: 82 },
  },
  second_classroom_6: {
    floor: "second",
    office: "Classroom 6",
    coordinates: { x: 60, y: 42 },
  },
  second_classroom_7: {
    floor: "second",
    office: "Classroom 7",
    coordinates: { x: 60, y: 82 },
  },
  second_classroom_8: {
    floor: "second",
    office: "Classroom 8",
    coordinates: { x: 73.5, y: 82 },
  },
  second_laboratory: {
    floor: "second",
    office: "Laboratory",
    coordinates: { x: 73.5, y: 42 },
  },
  laboratory: {
    floor: "second",
    office: "Laboratory",
    coordinates: { x: 73.5, y: 42 },
  },
  second_tesda: {
    floor: "second",
    office: "TESDA",
    coordinates: { x: 91, y: 22.5 },
  },
  tesda: {
    floor: "second",
    office: "TESDA",
    coordinates: { x: 91, y: 22.5 },
  },
  second_hallway: {
    floor: "second",
    office: "Hallway",
    coordinates: { x: 47.5, y: 61 },
  },
  hallway: {
    floor: "second",
    office: "Hallway",
    coordinates: { x: 47.5, y: 61 },
  },
  second_female_cr: {
    floor: "second",
    office: "Female CR",
    coordinates: { x: 88.2, y: 44 },
  },
  second_male_cr: {
    floor: "second",
    office: "Male CR",
    coordinates: { x: 88.2, y: 56 },
  },
  third_workshop: {
    floor: "third",
    office: "Workshop",
    coordinates: { x: 21.5, y: 38.5 },
  },
  workshop: {
    floor: "third",
    office: "Workshop",
    coordinates: { x: 21.5, y: 38.5 },
  },
  third_tools_room: {
    floor: "third",
    office: "Tools Room",
    coordinates: { x: 21.5, y: 88.5 },
  },
  tools_room: {
    floor: "third",
    office: "Tools Room",
    coordinates: { x: 21.5, y: 88.5 },
  },
  third_classroom_1: {
    floor: "third",
    office: "Classroom 1",
    coordinates: { x: 35, y: 38.5 },
  },
  third_classroom_2: {
    floor: "third",
    office: "Classroom 2",
    coordinates: { x: 48, y: 38.5 },
  },
  third_classroom_3: {
    floor: "third",
    office: "Classroom 3",
    coordinates: { x: 61, y: 38.5 },
  },
  third_classroom_4: {
    floor: "third",
    office: "Classroom 4",
    coordinates: { x: 35, y: 79 },
  },
  third_classroom_5: {
    floor: "third",
    office: "Classroom 5",
    coordinates: { x: 48, y: 79 },
  },
  third_library: {
    floor: "third",
    office: "Library",
    coordinates: { x: 73.5, y: 38.5 },
  },
  library: {
    floor: "third",
    office: "Library",
    coordinates: { x: 73.5, y: 38.5 },
  },
  third_students_lounge: {
    floor: "third",
    office: "Students Lounge",
    coordinates: { x: 67, y: 75 },
  },
  students_lounge: {
    floor: "third",
    office: "Students Lounge",
    coordinates: { x: 67, y: 75 },
  },
  third_female_cr: {
    floor: "third",
    office: "Female CR",
    coordinates: { x: 88, y: 38 },
  },
  third_male_cr: {
    floor: "third",
    office: "Male CR",
    coordinates: { x: 88, y: 52 },
  },
  third_fire_exit: {
    floor: "third",
    office: "Fire Exit",
    coordinates: { x: 54.5, y: 15 },
  },
};

const normalizeCheckpointId = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const clampMapCoordinate = (value, min = 5, max = 95) =>
  Math.max(min, Math.min(max, value));

const mapGpsToCampusCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { x: null, y: null };
  }

  const latMin = Number(process.env.CAMPUS_LAT_MIN || 14.5976);
  const latMax = Number(process.env.CAMPUS_LAT_MAX || 14.6007);
  const lngMin = Number(process.env.CAMPUS_LNG_MIN || 120.9823);
  const lngMax = Number(process.env.CAMPUS_LNG_MAX || 120.9857);

  const x = ((lng - lngMin) / (lngMax - lngMin)) * 100;
  const y = (1 - (lat - latMin) / (latMax - latMin)) * 100;

  return {
    x: Number(clampMapCoordinate(x).toFixed(2)),
    y: Number(clampMapCoordinate(y).toFixed(2)),
  };
};

const getTapLocationFromRequest = (body = {}) => {
  const checkpointCandidates = [
    body.checkpointId,
    body.checkpoint,
    body.readerId,
    body.gateId,
    body.location,
    body.office,
    body.deviceId,
  ];
  const checkpointId =
    checkpointCandidates.map(normalizeCheckpointId).find(Boolean) || "";
  const knownCheckpoint =
    checkpointCandidates
      .map(normalizeCheckpointId)
      .map((candidate) => CHECKPOINT_LOCATIONS[candidate])
      .find(Boolean) || null;
  const coordinates = body.coordinates || {};

  return {
    checkpointId: knownCheckpoint
      ? Object.keys(CHECKPOINT_LOCATIONS).find(
          (key) => CHECKPOINT_LOCATIONS[key] === knownCheckpoint,
        ) || checkpointId
      : checkpointId,
    floor: String(body.floor || knownCheckpoint?.floor || "").trim(),
    office: String(body.office || knownCheckpoint?.office || checkpointId || "Unknown Checkpoint").trim(),
    coordinates: {
      x: Number.isFinite(Number(coordinates.x ?? knownCheckpoint?.coordinates?.x))
        ? Number(coordinates.x ?? knownCheckpoint?.coordinates?.x)
        : null,
      y: Number.isFinite(Number(coordinates.y ?? knownCheckpoint?.coordinates?.y))
        ? Number(coordinates.y ?? knownCheckpoint?.coordinates?.y)
        : null,
    },
    source: String(body.source || "arduino_tap").trim(),
  };
};

const getVisitorCheckInLocation = (visitor, source = "mobile_app") => {
  const sourceValue = String(source || "").trim();
  const candidates = [
    visitor?.assignedOffice,
    visitor?.appointmentDepartment,
    visitor?.host,
    sourceValue === "virtual_nfc_card" ? "main_gate" : "",
  ];

  for (const candidate of candidates) {
    const checkpointId = normalizeCheckpointId(candidate);
    const knownCheckpoint = CHECKPOINT_LOCATIONS[checkpointId];
    if (knownCheckpoint) {
      return {
        checkpointId,
        floor: knownCheckpoint.floor,
        office: knownCheckpoint.office,
        coordinates: knownCheckpoint.coordinates,
        source: sourceValue || "mobile_app",
      };
    }
  }

  const fallback = CHECKPOINT_LOCATIONS.main_gate;
  return {
    checkpointId: "main_gate",
    floor: fallback.floor,
    office: fallback.office,
    coordinates: fallback.coordinates,
    source: sourceValue || "mobile_app",
  };
};

const CHECK_IN_GRACE_PERIOD_MINUTES = 15;
const EARLY_LOBBY_CHECK_IN_MINUTES = 20;
const GATE_CHECKPOINT_IDS = new Set([
  "main_gate",
  "gate",
  "gate_1",
  "reader_1",
  "entrance",
  "entry",
  "campus_entry",
  "campus_exit",
  "arduino_reader",
  "arduino_reader_1",
  "usb_rfid_reader",
  "pn532",
  "pn532_reader",
  "pn532_reader_1",
  "pn532_gate",
  "lobby",
]);

const isGateCheckpoint = (location = {}) =>
  GATE_CHECKPOINT_IDS.has(normalizeCheckpointId(location.checkpointId || location.office));

const getAppointmentTimingState = (visitor = {}, nowValue = new Date()) => {
  const checkInWindow = getAppointmentCheckInWindow(visitor);
  if (!checkInWindow) {
    return {
      hasSchedule: false,
      earlyMinutes: 0,
      lateMinutes: 0,
      beforeSchedule: false,
      afterGrace: false,
      inEarlyLobbyWindow: false,
    };
  }

  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const earlyMinutes = Math.ceil((checkInWindow.scheduledAt.getTime() - now.getTime()) / 60000);
  const lateMinutes = Math.floor((now.getTime() - checkInWindow.scheduledAt.getTime()) / 60000);

  return {
    hasSchedule: true,
    scheduledAt: checkInWindow.scheduledAt,
    graceUntil: checkInWindow.graceUntil,
    earlyMinutes: Math.max(0, earlyMinutes),
    lateMinutes: Math.max(0, lateMinutes),
    beforeSchedule: now < checkInWindow.scheduledAt,
    afterGrace: now > checkInWindow.graceUntil,
    inEarlyLobbyWindow:
      now < checkInWindow.scheduledAt &&
      earlyMinutes <= EARLY_LOBBY_CHECK_IN_MINUTES,
  };
};

const isBeforeAppointmentOfficeAccessTime = (visitor = {}) =>
  getAppointmentTimingState(visitor).beforeSchedule;

const isSameCheckpointLocation = (left = {}, right = {}) => {
  const leftCheckpoint = normalizeCheckpointId(left?.checkpointId || left?.office);
  const rightCheckpoint = normalizeCheckpointId(right?.checkpointId || right?.office);
  if (leftCheckpoint && rightCheckpoint && leftCheckpoint === rightCheckpoint) return true;

  const leftOffice = normalizeDepartmentValue(left?.office || left?.checkpointName || "");
  const rightOffice = normalizeDepartmentValue(right?.office || right?.checkpointName || "");
  return Boolean(leftOffice && rightOffice && leftOffice === rightOffice);
};

const getAssignedAppointmentOffice = (visitor = {}) =>
  visitor.currentDestination?.office ||
  visitor.appointmentDepartment ||
  visitor.assignedOffice ||
  visitor.host ||
  "";

const isWrongAppointmentOfficeScan = (visitor = {}, location = {}) => {
  if (!visitor || !location || isGateCheckpoint(location)) return false;

  const assignedOffice = normalizeDepartmentValue(getAssignedAppointmentOffice(visitor));
  const scannedOffice = normalizeDepartmentValue(location.office || location.checkpointId);
  return Boolean(assignedOffice && scannedOffice && assignedOffice !== scannedOffice);
};

const getOfficeLocationFromValue = (value = "") => {
  const checkpointId = normalizeCheckpointId(value);
  const knownLocation = CHECKPOINT_LOCATIONS[checkpointId];
  if (knownLocation) {
    return {
      checkpointId,
      floor: knownLocation.floor,
      office: knownLocation.office,
      coordinates: knownLocation.coordinates,
      source: "office_reader",
    };
  }

  const normalizedDepartment = normalizeDepartmentValue(value);
  const matchedEntry = Object.entries(CHECKPOINT_LOCATIONS).find(([, location]) =>
    normalizeDepartmentValue(location.office) === normalizedDepartment,
  );

  if (matchedEntry) {
    const [matchedCheckpointId, location] = matchedEntry;
    return {
      checkpointId: matchedCheckpointId,
      floor: location.floor,
      office: location.office,
      coordinates: location.coordinates,
      source: "office_reader",
    };
  }

  return {
    checkpointId,
    floor: "",
    office: String(value || "").trim(),
    coordinates: { x: null, y: null },
    source: "office_reader",
  };
};

const createVisitorMovementLog = async ({
  visitor,
  visitorUser = null,
  nfcCardId = "",
  tapLocation = {},
  expectedDestination = "",
  status = "correct_location",
  handledBy = null,
  message = "",
  metadata = {},
  tappedAt = new Date(),
}) => VisitorMovementLog.create({
  visitorId: visitor._id,
  visitorName: visitor.fullName,
  appointmentId: visitor._id,
  relatedUser: visitorUser?._id || null,
  nfcCardId,
  readerId: tapLocation.checkpointId || "",
  checkpointId: tapLocation.checkpointId || "",
  officeName: tapLocation.office || "Unknown Office",
  floor: tapLocation.floor || "",
  expectedDestination,
  actualLocation: tapLocation.office || "Unknown Office",
  status,
  message,
  handledBy: handledBy?._id || handledBy || null,
  coordinates: tapLocation.coordinates || { x: null, y: null },
  metadata,
  tappedAt,
});

const notifyVisitorLocationResult = async ({
  visitor,
  visitorUser = null,
  tapLocation,
  expectedDestination,
  status,
}) => {
  const wrongLocation = status === "wrong_location";
  const title = wrongLocation ? "Wrong Office Warning" : "Location Updated";
  const message = wrongLocation
    ? `Warning: This is not your assigned destination. Please proceed to ${expectedDestination} or ask staff for assistance.`
    : `Location updated: You are now checked in at ${tapLocation.office}.`;

  await createRoleNotification({
    title,
    message,
    type: wrongLocation ? "warning" : "info",
    severity: wrongLocation ? "high" : "low",
    targetRole: "visitor",
    targetUser: visitorUser?._id || null,
    relatedVisitor: visitor._id,
    relatedUser: visitorUser?._id || null,
    metadata: {
      activityType: wrongLocation ? "office_wrong_location" : "office_correct_location",
      expectedDestination,
      actualLocation: tapLocation.office,
      checkpointId: tapLocation.checkpointId,
      floor: tapLocation.floor,
      status,
    },
  });
};

const createWrongOfficeScanNotifications = async ({
  visitor,
  visitorUser,
  tapLocation,
  deviceId,
  movementLog = null,
  action = "scan",
}) => {
  const assignedOffice = getAssignedAppointmentOffice(visitor) || "Assigned office";
  const scannedOffice = tapLocation?.office || "Unknown checkpoint";
  const scannedAt = new Date();
  const message =
    `${visitor.fullName} entered ${scannedOffice}, but their assigned office is ${assignedOffice}.`;

  await Promise.all([
    createRoleNotification({
      title: "Wrong Room Warning",
      message: `You entered ${scannedOffice}, but you are assigned to ${assignedOffice}. Please leave this room and proceed to your assigned office or ask staff for help.`,
      type: "warning",
      severity: "high",
      targetRole: "visitor",
      targetUser: visitorUser?._id || null,
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "wrong_office_scan",
        assignedOffice,
        scannedOffice,
        scannedAt,
        deviceId,
        action,
        movementLogId: movementLog?._id || null,
      },
    }),
    createRoleNotification({
      title: "Unauthorized Room Entry",
      message: `${message} Please verify and assist the visitor.`,
      type: "alert",
      severity: "high",
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "wrong_office_scan",
        visitorName: visitor.fullName,
        assignedOffice,
        scannedOffice,
        scannedAt,
        deviceId,
        action,
        movementLogId: movementLog?._id || null,
      },
    }),
  ]);

  await createSystemActivity({
    actorUser: null,
    relatedVisitor: visitor,
    relatedUser: visitorUser,
    activityType: "wrong_office_scan",
    status: "denied",
    location: scannedOffice,
    notes: `${message} Scan time: ${scannedAt.toLocaleString()}.`,
    metadata: {
      assignedOffice,
      scannedOffice,
      scannedAt,
      deviceId,
      action,
    },
  });
};

const validateDeviceKey = (req, res, next) => {
  const expectedKey = String(process.env.ARDUINO_DEVICE_KEY || "").trim();
  const providedKey = req.header("x-device-key") || req.body?.deviceKey;

  if (!expectedKey) {
    return res.status(503).json({
      success: false,
      message: "Arduino device access is not configured",
    });
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      message: "Invalid device key",
    });
  }

  next();
};

const officeTapAccessMiddleware = (req, res, next) => {
  const expectedKey = String(process.env.ARDUINO_DEVICE_KEY || "").trim();
  const providedKey = req.header("x-device-key") || req.body?.deviceKey;

  if (expectedKey && providedKey === expectedKey) {
    req.officeTapActor = { type: "device" };
    return next();
  }

  return authMiddleware(req, res, () => {
    req.officeTapActor = { type: "user", user: req.user };
    next();
  });
};

// ========== EMAIL DELIVERY ==========
let mailTransporter = null;
let nodemailerLoadError = null;
let mailTransporterVerified = false;

try {
  const nodemailer = require("nodemailer");
  const mailHost = String(process.env.MAIL_HOST || "").trim();
  const mailUser = String(process.env.MAIL_USER || "").trim();
  const mailPass = String(process.env.MAIL_PASS || "").trim();
  const mailPort = Number(process.env.MAIL_PORT || 587);
  const mailSecure = String(process.env.MAIL_SECURE || "false").trim() === "true";

  if (process.env.NODE_ENV !== "test" && mailHost && mailUser && mailPass) {
    mailTransporter = nodemailer.createTransport({
      host: mailHost,
      port: mailPort,
      secure: mailSecure,
      auth: {
        user: mailUser,
        pass: mailPass,
      },
    });
  }
} catch (error) {
  nodemailerLoadError = error;
}

const verifyMailTransporter = async () => {
  if (!mailTransporter) {
    return false;
  }

  try {
    await mailTransporter.verify();
    mailTransporterVerified = true;
    console.log(`SMTP ready for ${String(process.env.MAIL_USER || "").trim()}`);
    return true;
  } catch (error) {
    mailTransporterVerified = false;
    console.error("SMTP verification failed:", error.message);
    return false;
  }
};

verifyMailTransporter();

const getMailFromAddress = () =>
  String(process.env.MAIL_FROM || process.env.MAIL_USER || "no-reply@safepass.local").trim();

const getEmailGreetingName = (user = {}) =>
  String(user.firstName || user.fullName || "User").trim();

const getSupportEmailSignature = () =>
  [
    "Thank you,",
    "Sapphire SafePass",
    "Sapphire International Aviation Academy",
  ].join("\n");

const generateTemporaryPassword = (length = 10) => {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = crypto.randomInt(0, characters.length);
    password += characters[randomIndex];
  }
  return password;
};

const getEmployeeIdPrefix = (role = "staff") => {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === "security" || normalizedRole === "guard") return "SEC";
  if (normalizedRole === "teacher") return "TCH";
  return "STF";
};

const generateYearEmployeeIdCandidate = (role = "staff") => {
  const prefix = getEmployeeIdPrefix(role);
  const currentYear = new Date().getFullYear();
  const numericPart = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  return `${prefix}-${currentYear}-${numericPart}`;
};

const generateUniqueEmployeeId = async (role = "staff") => {
  let candidate = generateYearEmployeeIdCandidate(role);
  while (await User.exists({ employeeId: candidate })) {
    candidate = generateYearEmployeeIdCandidate(role);
  }
  return candidate;
};

const generateAcademicIdCandidate = (prefix = "STU") => {
  const currentYear = new Date().getFullYear();
  const numericPart = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  return `${prefix}-${currentYear}-${numericPart}`;
};

const generateUniqueAcademicId = async ({ role = "student", fieldName = "studentId" } = {}) => {
  const prefix = normalizeUserRoleValue(role) === "teacher" ? "TCH" : "STU";
  let candidate = generateAcademicIdCandidate(prefix);
  while (await User.exists({ [fieldName]: candidate })) {
    candidate = generateAcademicIdCandidate(prefix);
  }
  return candidate;
};

const sendEmail = async (to, subject, body, options = {}) => {
  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: getMailFromAddress(),
        to,
        subject,
        text: body,
        ...(options.html ? { html: options.html } : {}),
      });
      console.log(`Email sent to ${to}. Message ID: ${info.messageId}`);
      return { success: true, simulated: false, delivered: true, messageId: info.messageId };
    } catch (error) {
      console.error(`\nFailed to send email to ${to}:`, error.message);
      return { success: false, simulated: false, delivered: false, error: error.message };
    }
  }

  if (nodemailerLoadError) {
    console.warn(
      "\nNodemailer is not installed yet. Run npm install in the backend folder to enable real email sending.",
    );
  } else if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn(
      "\nMAIL_HOST / MAIL_USER / MAIL_PASS are not configured. Falling back to email simulation.",
    );
  }

  console.log(`Email simulation generated for ${to}. Subject: ${subject}`);
  logSensitiveDebug(`Simulated email body for ${to}:`, body);
  return { success: true, simulated: true, delivered: false };
};

const canUseBackendLogOtpFallback = () => sensitiveDebugLoggingEnabled;

const isOtpDeliveryUsable = (emailResult) =>
  Boolean(emailResult?.success || canUseBackendLogOtpFallback());

const getOtpDeliveryMode = (emailResult) => {
  if (emailResult?.delivered) {
    return "email";
  }

  if (emailResult?.simulated || canUseBackendLogOtpFallback()) {
    return "backend_log";
  }

  return "failed";
};

const logEmailOtpForDemo = ({ email, otpCode, label = "EMAIL OTP DEMO" }) => {
  if (!canUseBackendLogOtpFallback()) {
    return;
  }

  console.log("");
  console.log(`========== ${label} ==========`);
  console.log(`Email  : ${email}`);
  console.log(`OTP    : ${otpCode}`);
  console.log("====================================");
  console.log("");
};

const createVerificationToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  return { token, tokenHash, expiresAt };
};

const createPasswordSetupToken = (hours = 48) => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * hours);
  return { token, tokenHash, expiresAt };
};

const getApiBaseUrl = (req) => {
  if (process.env.API_PUBLIC_URL) {
    return process.env.API_PUBLIC_URL.replace(/\/$/, "");
  }

  const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("host");
  return `${protocol}://${host}`;
};

const sendVerificationEmailSimulation = async (req, user) => {
  const otp = await createRegistrationOtp(user);
  return {
    expiresAt: otp.expiresAt,
    otpExpiresAt: otp.expiresAt,
    emailResult: otp.emailResult,
  };
};

const createRegistrationOtp = async (user) => {
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = crypto.createHash("sha256").update(otpCode).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10);

  user.verificationOtpHash = otpHash;
  user.verificationOtpExpiresAt = expiresAt;
  user.verificationOtpAttempts = 0;
  user.verificationTokenHash = "";
  user.verificationExpiresAt = null;

  const emailResult = await sendEmail(
    user.email,
    "Sapphire SafePass Visitor Verification Code",
    [
      `Good day, ${getEmailGreetingName(user)}.`,
      "",
      "Thank you for creating your Sapphire SafePass visitor account.",
      "Enter the one-time password below in the SafePass app to verify your account:",
      "",
      `OTP Code: ${otpCode}`,
      "",
      "This code will expire in 10 minutes.",
      "For your security, do not share this code with anyone. SafePass will never ask for your OTP outside the app.",
      "",
      "If you did not request this code, you may safely ignore this email.",
      "",
      getSupportEmailSignature(),
    ].join("\n"),
  );

  console.log(`Visitor registration OTP generated for ${user.email}.`);
  logSensitiveDebug(`Visitor registration OTP for ${user.email}: ${otpCode}`);
  if (emailResult?.simulated || canUseBackendLogOtpFallback()) {
    logEmailOtpForDemo({
      email: user.email,
      otpCode,
      label: "VISITOR REGISTRATION OTP",
    });
  }

  return { expiresAt, emailResult };
};

const normalizeOtpCode = (value) => String(value || "").replace(/\D/g, "").slice(0, 6);
const createPasswordResetOtp = async (req, user) => {
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = crypto.createHash("sha256").update(otpCode).digest("hex");
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10);
  const resetLink = `${FRONTEND_URL}?resetEmail=${encodeURIComponent(user.email)}&resetToken=${encodeURIComponent(resetToken)}`;

  user.passwordResetTokenHash = resetTokenHash;
  user.passwordResetOtpHash = otpHash;
  user.passwordResetExpiresAt = expiresAt;
  user.passwordResetAttempts = 0;
  user.passwordResetVerifiedAt = null;

  const emailResult = await sendEmail(
    user.email,
    "Sapphire SafePass Password Reset Code",
    [
      `Good day, ${getEmailGreetingName(user)}.`,
      "",
      "We received a request to reset the password for your Sapphire SafePass account.",
      "Use the code below or open the secure link to continue:",
      "",
      `Password reset code: ${otpCode}`,
      `Password reset link: ${resetLink}`,
      "",
      "This code will expire in 10 minutes.",
      "The reset link expires at the same time.",
      "If you did not request a password reset, you may ignore this email and keep your current password.",
      "",
      getSupportEmailSignature(),
    ].join("\n"),
  );

  console.log(`Password reset code generated for ${user.email}.`);
  logSensitiveDebug(`Password reset link for ${user.email}: ${resetLink}`);
  if (emailResult?.simulated) {
    logEmailOtpForDemo({
      email: user.email,
      otpCode,
      label: "PASSWORD RESET OTP",
    });
    logSensitiveDebug(`Password reset link: ${resetLink}`);
  }

  return { expiresAt, emailResult, resetLink };
};

const clearPasswordResetState = (user) => {
  user.passwordResetTokenHash = "";
  user.passwordResetOtpHash = "";
  user.passwordResetExpiresAt = null;
  user.passwordResetAttempts = 0;
  user.passwordResetVerifiedAt = null;
};

const normalizePhoneForOtp = (value) => {
  let cleanPhone = String(value || "").replace(/[^\d]/g, "");

  if (cleanPhone.startsWith("63")) {
    cleanPhone = `0${cleanPhone.slice(2)}`;
  } else if (cleanPhone.startsWith("9") && cleanPhone.length === 10) {
    cleanPhone = `0${cleanPhone}`;
  }

  if (!cleanPhone.startsWith("09") && cleanPhone.length >= 9) {
    cleanPhone = `09${cleanPhone.slice(-9)}`;
  }

  return cleanPhone;
};

// ========== ROUTES ==========

// 0. TEST ROUTE
app.get("/api/test", (req, res) => {
  res.json({
    message: "API is working!",
    timestamp: new Date(),
    database:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

app.post("/api/device/location-tap", validateDeviceKey, async (req, res) => {
  try {
    const cardId = String(
      req.body?.virtualCardToken ||
        req.body?.virtualNfcToken ||
        req.body?.nfcCardId ||
        req.body?.cardId ||
        req.body?.uid ||
        req.body?.pn532Uid ||
        req.body?.pn532UID ||
        req.body?.cardUID ||
        req.body?.cardUid ||
        req.body?.tagId ||
        "",
    )
      .trim()
      .toUpperCase();
    const normalizedCardId = normalizeNfcCardId(cardId);
    const deviceId = String(req.body?.deviceId || req.body?.readerId || "pn532-reader").trim();
    const tapLocation = getTapLocationFromRequest(req.body || {});
    const tapAction = String(req.body?.action || req.body?.tapAction || "auto")
      .trim()
      .toLowerCase();

    if (!normalizedCardId) {
      return res.status(400).json({
        success: false,
        message: "Missing NFC card ID",
      });
    }

    if (!tapLocation.floor || !tapLocation.office) {
      return res.status(400).json({
        success: false,
        message: "Missing checkpoint floor or office",
      });
    }

    let cardUser = await User.findOne(buildNfcCredentialQuery(cardId, normalizedCardId)).select(
      "_id email firstName lastName nfcCardId safePassId physicalNfcUid phoneNfcUid virtualNfcToken role status accessPermissions department position scheduleProfile course yearLevel section studentId parentName parentEmail guardianName guardianEmail emergencyContact",
    );

    let firstTapAssignment = null;
    if (!cardUser) {
      firstTapAssignment = await findApprovedVisitorForFirstNfcTap(normalizedCardId);
      if (firstTapAssignment.visitor && firstTapAssignment.user) {
        await assignFirstTapNfcUidToVisitor({
          visitor: firstTapAssignment.visitor,
          user: firstTapAssignment.user,
          normalizedCardId,
        });
        cardUser = firstTapAssignment.user;

        await AccessLog.create({
          userId: cardUser._id,
          userEmail: cardUser.email,
          userName: getFullName(cardUser) || firstTapAssignment.visitor.fullName,
          actorRole: "device",
          location: tapLocation.office,
          accessType: "system",
          activityType: "first_nfc_tap_assigned",
          status: "granted",
          nfcCardId: normalizedCardId,
          relatedVisitor: firstTapAssignment.visitor._id,
          relatedUser: cardUser._id,
          metadata: { deviceId, tapLocation, source: "first_tap_auto_assign" },
          notes: `Assigned NFC UID ${normalizedCardId} to ${firstTapAssignment.visitor.fullName} from first PN532 tap.`,
        });
      }
    }

    if (!cardUser) {
      await AccessLog.create({
        userEmail: "",
        userName: "Unknown NFC Card",
        actorRole: "device",
        location: tapLocation.office,
        accessType: "system",
        activityType: "arduino_location_tap",
        status: "denied",
        nfcCardId: normalizedCardId,
        metadata: {
          deviceId,
          tapLocation,
        },
        notes: `Unknown NFC card tapped at ${tapLocation.office}`,
      });

      return res.status(404).json({
        success: false,
        message:
          firstTapAssignment?.reason === "ambiguous"
            ? "More than one approved visitor is waiting for NFC assignment. Assign the card from Security first."
            : "NFC card is not assigned to any user",
      });
    }

    if (!isUserSafePassCardActive(cardUser)) {
      await AccessLog.create({
        userId: cardUser._id,
        userEmail: cardUser.email,
        userName: `${cardUser.firstName || ""} ${cardUser.lastName || ""}`.trim(),
        actorRole: "device",
        location: tapLocation.office,
        accessType: "system",
        activityType: "arduino_location_tap",
        status: "denied",
        nfcCardId: normalizedCardId,
        relatedUser: cardUser._id,
        metadata: {
          deviceId,
          tapLocation,
          accountStatus: cardUser.status,
        },
        notes: `Inactive NFC card tapped at ${tapLocation.office}`,
      });

      return res.status(403).json({
        success: false,
        message: "NFC card is not active",
      });
    }

    const normalizedUserRole = normalizeUserRoleValue(cardUser.role);

    if (normalizedUserRole !== "visitor") {
      const now = new Date();
      const dayStart = getStartOfDay(now);
      const dayEnd = getEndOfDay(now);
      const latestAttendance = await AttendanceRecord.findOne({
        userId: cardUser._id,
        attendanceDate: { $gte: dayStart, $lt: dayEnd },
      }).sort({ createdAt: -1 });

      const hasOpenAttendance = Boolean(
        latestAttendance?.checkInTime && !latestAttendance?.checkOutTime,
      );
      const isMainGateTap = isGateCheckpoint(tapLocation);
      const isAutoGateTap =
        tapAction === "gate" ||
        tapAction === "entry" ||
        tapAction === "exit" ||
        (tapAction === "auto" && isMainGateTap);
      const shouldCheckOut =
        hasOpenAttendance &&
        tapAction !== "location" &&
        tapAction !== "track" &&
        (tapAction === "checkout" || tapAction === "check_out" || isAutoGateTap);
      const shouldCheckIn =
        !hasOpenAttendance &&
        tapAction !== "location" &&
        tapAction !== "track" &&
        (tapAction === "checkin" || tapAction === "check_in" || tapAction === "auto" || isAutoGateTap);
      const action = shouldCheckOut
        ? "check_out"
        : shouldCheckIn
          ? "check_in"
          : "location_update";
      const accessType = action === "check_out" ? "exit" : action === "check_in" ? "entry" : "system";
      const attendanceRecord = await upsertAttendanceRecordForTap({
        user: cardUser,
        action,
        tapLocation,
        timestamp: now,
        nfcCardId: normalizedCardId,
        deviceId,
      });
      const userDisplayName = getFullName(cardUser) || cardUser.email || "Campus user";

      await AccessLog.create({
        userId: cardUser._id,
        userEmail: cardUser.email,
        userName: userDisplayName,
        actorRole: "device",
        location: tapLocation.office,
        accessType,
        activityType: `${normalizedUserRole}_${action}`,
        status: "granted",
        nfcCardId: normalizedCardId,
        relatedUser: cardUser._id,
        metadata: {
          deviceId,
          action,
          tapLocation,
          userType: normalizedUserRole,
          attendanceRecordId: attendanceRecord._id,
        },
        notes: `${userDisplayName} ${action.replace("_", " ")} by NFC at ${tapLocation.office}`,
      });

      await sendCampusTapSecurityNotifications({
        user: cardUser,
        action,
        timestamp: now,
        status: attendanceRecord.status,
        tapLocation,
        attendanceRecord,
        deviceId,
      });

      await sendStudentParentAttendanceEmail({
        student: cardUser,
        action,
        timestamp: now,
        tapLocation,
      });

      return res.json({
        success: true,
        message:
          action === "check_in"
            ? "Attendance check-in recorded"
            : action === "check_out"
              ? "Attendance check-out recorded"
              : "Location checkpoint recorded",
        userType: normalizedUserRole,
        action,
        attendance: attendanceRecord,
        user: getCampusUserTapPayload({ user: cardUser, nfcCardId: normalizedCardId }),
      });
    }

    const visitorCandidates = await Visitor.find({
      email: cardUser.email,
      status: { $ne: "checked_out" },
    }).sort({ checkedInAt: -1, visitDate: 1, registeredAt: -1 });
    const checkedInVisitor = visitorCandidates.find(
      (visitorRecord) => String(visitorRecord?.status || "").toLowerCase() === "checked_in",
    );
    const latestVisitor = getPrioritizedVisitorForNfcTap(visitorCandidates);

    if (!latestVisitor) {
      await AccessLog.create({
        userId: cardUser._id,
        userEmail: cardUser.email,
        userName: `${cardUser.firstName || ""} ${cardUser.lastName || ""}`.trim(),
        actorRole: "device",
        location: tapLocation.office,
        accessType: "system",
        activityType: "arduino_location_tap",
        status: "denied",
        nfcCardId: normalizedCardId,
        relatedUser: cardUser._id,
        metadata: {
          deviceId,
          tapLocation,
        },
        notes: `Card tapped at ${tapLocation.office}, but no active visit was found`,
      });

      return res.status(409).json({
        success: false,
        message: "No active visit found for this NFC card",
      });
    }

    const normalizedCheckpoint = normalizeCheckpointId(tapLocation.checkpointId || tapLocation.office);
    const isMainGateTap = isGateCheckpoint(tapLocation);
    const isAutoGateTap =
      tapAction === "gate" ||
      tapAction === "entry" ||
      tapAction === "exit" ||
      (tapAction === "auto" && isMainGateTap);
    const shouldCheckOut =
      checkedInVisitor &&
      tapAction !== "location" &&
      tapAction !== "track" &&
      (tapAction === "checkout" || tapAction === "check_out" || isAutoGateTap);
    const shouldCheckIn =
      !checkedInVisitor &&
      tapAction !== "location" &&
      tapAction !== "track" &&
      (tapAction === "checkin" || tapAction === "check_in" || isAutoGateTap);

    const visitor = latestVisitor;
    await applyAppointmentLifecycleIfNeeded(visitor);

    let action = "location_update";
    let accessType = "system";
    let activityType = "arduino_location_tap";
    let responseMessage = "Visitor location updated";
    const wrongOfficeScan =
      isWrongAppointmentOfficeScan(visitor, tapLocation) &&
      !shouldCheckOut &&
      (shouldCheckIn || visitor.status === "checked_in");

    if (
      !isMainGateTap &&
      visitor.status === "checked_in" &&
      isBeforeAppointmentOfficeAccessTime(visitor)
    ) {
      const scheduleLabel = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
      await AccessLog.create({
        userId: cardUser._id,
        userEmail: cardUser.email,
        userName: visitor.fullName,
        actorRole: "device",
        location: tapLocation.office,
        accessType: "system",
        activityType: "early_office_scan",
        status: "denied",
        nfcCardId: normalizedCardId,
        relatedVisitor: visitor._id,
        relatedUser: cardUser._id,
        metadata: { deviceId, tapLocation, visitDate: visitor.visitDate, visitTime: visitor.visitTime },
        notes: `${visitor.fullName} arrived early and must wait in the lobby until ${scheduleLabel}.`,
      });

      return res.status(403).json({
        success: false,
        userType: "visitor",
        action: "location_update",
        code: "WAIT_IN_LOBBY",
        message: `Please wait in the lobby until your appointment time: ${scheduleLabel}.`,
        nfcCardId: normalizedCardId,
        visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
      });
    }

    if (wrongOfficeScan) {
      const assignedOffice = getAssignedAppointmentOffice(visitor) || "Assigned office";
      const scannedOffice = tapLocation.office || "Unknown checkpoint";
      const movementLog = await createVisitorMovementLog({
        visitor,
        visitorUser: cardUser,
        nfcCardId: normalizedCardId,
        tapLocation,
        expectedDestination: assignedOffice,
        status: "wrong_location",
        message: `${visitor.fullName} entered ${scannedOffice}, but their assigned destination is ${assignedOffice}.`,
        metadata: {
          deviceId,
          source: "device_location_tap",
          visitorStatus: visitor.status,
          approvalStatus: visitor.approvalStatus,
          appointmentStatus: visitor.appointmentStatus,
        },
      });

      visitor.updateCurrentLocation(tapLocation, {
        deviceId,
        action: "wrong_location",
        statusLabel: `Unauthorized room entry at ${scannedOffice}`,
      });
      await visitor.save();

      await AccessLog.create({
        userId: cardUser._id,
        userEmail: cardUser.email,
        userName: visitor.fullName,
        actorRole: "device",
        location: scannedOffice,
        accessType: shouldCheckIn ? "entry" : "system",
        activityType: "wrong_office_scan",
        status: "denied",
        nfcCardId: normalizedCardId,
        relatedVisitor: visitor._id,
        relatedUser: cardUser._id,
        metadata: {
          deviceId,
          tapLocation,
          assignedOffice,
          scannedOffice,
          movementLogId: movementLog._id,
          visitorStatus: visitor.status,
          approvalStatus: visitor.approvalStatus,
          appointmentStatus: visitor.appointmentStatus,
          currentLocation: visitor.currentLocation,
        },
        notes: `${visitor.fullName} entered ${scannedOffice}, but their assigned office is ${assignedOffice}.`,
      });

      await createWrongOfficeScanNotifications({
        visitor,
        visitorUser: cardUser,
        tapLocation,
        deviceId,
        movementLog,
        action: shouldCheckIn ? "check_in" : "location_update",
      });

      return res.status(403).json({
        success: false,
        code: "WRONG_OFFICE_SCAN",
        message: `You entered ${scannedOffice}, but you are assigned to ${assignedOffice}. Please leave this room and proceed to your assigned office or ask staff for help.`,
        assignedOffice,
        scannedOffice,
        currentLocation: visitor.currentLocation,
        movementLog,
      });
    }

    if (shouldCheckOut) {
      visitor.markCheckedOut(null);
      visitor.updateCurrentLocation(tapLocation, {
        deviceId,
        action: "check_out",
        statusLabel: "Exited",
      });
      action = "check_out";
      accessType = "exit";
      activityType = "nfc_card_checkout";
      responseMessage = "Visitor checked out automatically by NFC card";
    } else if (shouldCheckIn) {
      const checkInEligibility = getVisitorCheckInEligibility(visitor);
      if (!checkInEligibility.allowed) {
        await AccessLog.create({
          userId: cardUser._id,
          userEmail: cardUser.email,
          userName: visitor.fullName,
          actorRole: "device",
          location: tapLocation.office,
          accessType: "entry",
          activityType: "nfc_card_checkin",
          status: "denied",
          nfcCardId: normalizedCardId,
          relatedVisitor: visitor._id,
          relatedUser: cardUser._id,
          metadata: {
            deviceId,
            tapLocation,
            visitorStatus: visitor.status,
            approvalStatus: visitor.approvalStatus,
            appointmentStatus: visitor.appointmentStatus,
          },
          notes: `${visitor.fullName} tapped at ${tapLocation.office}, but check-in was blocked: ${checkInEligibility.message}`,
        });

        return res.status(checkInEligibility.statusCode || 403).json({
          success: false,
          userType: "visitor",
          action: "check_in",
          message: checkInEligibility.message,
          nfcCardId: normalizedCardId,
          visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
          user: {
            _id: cardUser._id,
            name: visitor.fullName,
            email: cardUser.email,
            role: "visitor",
            nfcCardId: normalizedCardId,
          },
        });
      }

      visitor.markCheckedIn(null);
      visitor.updateCurrentLocation(tapLocation, {
        deviceId,
        action: "check_in",
        statusLabel: checkInEligibility.lobbyOnly
          ? "Waiting in lobby"
          : `Inside ${tapLocation.office || "checkpoint"}`,
      });
      action = "check_in";
      accessType = "entry";
      activityType = "nfc_card_checkin";
      responseMessage = "Visitor checked in automatically by NFC card";
    } else {
      if (visitor.status !== "checked_in") {
        await AccessLog.create({
          userId: cardUser._id,
          userEmail: cardUser.email,
          userName: visitor.fullName,
          actorRole: "device",
          location: tapLocation.office,
          accessType: "system",
          activityType: "arduino_location_tap",
          status: "denied",
          nfcCardId: normalizedCardId,
          relatedVisitor: visitor._id,
          relatedUser: cardUser._id,
          metadata: {
            deviceId,
            tapLocation,
            visitorStatus: visitor.status,
          },
          notes: `${visitor.fullName} tapped at ${tapLocation.office}, but visitor is not checked in`,
        });

        return res.status(409).json({
          success: false,
          message: "Visitor must be checked in before location tracking can start",
          userType: "visitor",
          action: "location_update",
          nfcCardId: normalizedCardId,
          visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
        });
      }

      visitor.updateCurrentLocation(tapLocation, {
        deviceId,
        action: "location_update",
        statusLabel: `Moved to ${tapLocation.office || "checkpoint"}`,
      });
    }

    await visitor.save();
    const visitorAttendanceRecord = await upsertAttendanceRecordForTap({
      user: cardUser,
      visitor,
      action,
      tapLocation,
      timestamp: new Date(),
      nfcCardId: normalizedCardId,
      deviceId,
    });

    await AccessLog.create({
      userId: cardUser._id,
      userEmail: visitor.email,
      userName: visitor.fullName,
      actorRole: "device",
      location: tapLocation.office,
      accessType,
      activityType,
      status: "granted",
      nfcCardId: normalizedCardId,
      relatedVisitor: visitor._id,
      relatedUser: cardUser._id,
      metadata: {
        deviceId,
        action,
        tapLocation,
        currentLocation: visitor.currentLocation,
        attendanceRecordId: visitorAttendanceRecord._id,
      },
      notes: `${visitor.fullName} ${action.replace("_", " ")} by NFC card at ${tapLocation.office}`,
    });

    if (action === "check_in" || action === "check_out") {
      const isCheckIn = action === "check_in";
      await Promise.all([
        createRoleNotification({
          title: isCheckIn ? "Visitor Checked In" : "Visitor Checked Out",
          message: `${visitor.fullName} ${isCheckIn ? "checked in" : "checked out"} automatically using the NFC card at ${tapLocation.office}.`,
          targetRole: "security",
          relatedVisitor: visitor._id,
          relatedUser: cardUser._id,
          type: "info",
          severity: "low",
          metadata: {
            activityType,
            source: "nfc_card_tap",
            deviceId,
            action,
          },
        }),
        createRoleNotification({
          title: isCheckIn ? "Visitor Checked In" : "Visitor Checked Out",
          message: `${visitor.fullName} ${isCheckIn ? "checked in" : "checked out"} automatically using the NFC card at ${tapLocation.office}.`,
          targetRole: "admin",
          relatedVisitor: visitor._id,
          relatedUser: cardUser._id,
          type: "info",
          severity: "low",
          metadata: {
            activityType,
            source: "nfc_card_tap",
            deviceId,
            action,
          },
        }),
      ]);
    }

    res.json({
      success: true,
      message: responseMessage,
      action,
      userType: "visitor",
      nfcCardId: normalizedCardId,
      visitorId: visitor._id,
      currentLocation: visitor.currentLocation,
      visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
    });
  } catch (error) {
    console.error("Arduino location tap error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update visitor location",
    });
  }
});

app.post(
  "/api/nfc/station/tap",
  authMiddleware,
  requireRoles("admin", "security", "guard", "staff"),
  async (req, res) => {
    try {
      const cardId = String(
        req.body?.virtualCardToken ||
          req.body?.virtualNfcToken ||
          req.body?.nfcCardId ||
          req.body?.cardId ||
          req.body?.uid ||
          req.body?.pn532Uid ||
          req.body?.pn532UID ||
          req.body?.cardUID ||
          req.body?.cardUid ||
          req.body?.tagId ||
          "",
      )
        .trim()
        .toUpperCase();
      const normalizedCardId = normalizeNfcCardId(cardId);
      const deviceId = String(req.body?.deviceId || req.body?.readerId || "pn532-reader").trim();
      const tapLocation = getTapLocationFromRequest(req.body || {});
      const tapAction = String(req.body?.action || req.body?.tapAction || "auto")
        .trim()
        .toLowerCase();
      const clientTapId = String(req.body?.clientTapId || "").trim().slice(0, 100);
      const operatorRole = normalizeUserRoleValue(req.user?.role);
      const operatorName = getFullName(req.user) || req.user?.email || "Checkpoint operator";

      if (!normalizedCardId) {
        return res.status(400).json({
          success: false,
          message: "Missing NFC card ID",
        });
      }

      if (!tapLocation.floor || !tapLocation.office) {
        return res.status(400).json({
          success: false,
          message: "Missing checkpoint floor or office",
        });
      }

      // A retry may happen after the server processed the tap but before the reader
      // received its response. Reusing the same clientTapId prevents a retry from
      // turning an automatic check-in into a check-out.
      if (clientTapId) {
        const previousTap = await AccessLog.findOne({
          userId: req.user._id,
          status: "granted",
          "metadata.clientTapId": clientTapId,
        })
          .select("nfcCardId metadata")
          .lean();
        if (previousTap) {
          return res.json({
            success: true,
            duplicate: true,
            message: "This checkpoint tap was already processed.",
            action: previousTap.metadata?.action || "location_update",
            nfcCardId: previousTap.nfcCardId || normalizedCardId,
          });
        }
      }

      let cardUser = await User.findOne(buildNfcCredentialQuery(cardId, normalizedCardId)).select(
        "_id email firstName lastName nfcCardId safePassId physicalNfcUid phoneNfcUid virtualNfcToken role status accessPermissions department position scheduleProfile course yearLevel section studentId teacherId employeeId parentName parentEmail guardianName guardianEmail emergencyContact",
      );

      let firstTapAssignment = null;
      if (!cardUser) {
        firstTapAssignment = await findApprovedVisitorForFirstNfcTap(normalizedCardId);
        if (firstTapAssignment.visitor && firstTapAssignment.user) {
          await assignFirstTapNfcUidToVisitor({
            visitor: firstTapAssignment.visitor,
            user: firstTapAssignment.user,
            normalizedCardId,
          });
          cardUser = firstTapAssignment.user;

          await AccessLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            userName: operatorName,
            actorRole: operatorRole || "security",
            location: tapLocation.office,
            accessType: "system",
            activityType: "first_nfc_tap_assigned",
            status: "granted",
            nfcCardId: normalizedCardId,
            relatedVisitor: firstTapAssignment.visitor._id,
            relatedUser: cardUser._id,
            metadata: { deviceId, tapLocation, source: "station_first_tap_auto_assign" },
            notes: `Assigned NFC UID ${normalizedCardId} to ${firstTapAssignment.visitor.fullName} from checkpoint station tap.`,
          });
        }
      }

      if (!cardUser) {
        await AccessLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          userName: operatorName,
          actorRole: operatorRole || "security",
          location: tapLocation.office,
          accessType: "system",
          activityType: "station_location_tap",
          status: "denied",
          nfcCardId: normalizedCardId,
          metadata: {
            deviceId,
            tapLocation,
            targetCardId: normalizedCardId,
          },
          notes: `Checkpoint station could not match NFC card ${normalizedCardId} at ${tapLocation.office}.`,
        });

        return res.status(404).json({
          success: false,
          message:
            firstTapAssignment?.reason === "ambiguous"
              ? "More than one approved visitor is waiting for NFC assignment. Assign the card from Security first."
              : "NFC card is not assigned to any user",
        });
      }

      if (!isUserSafePassCardActive(cardUser)) {
        await AccessLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          userName: operatorName,
          actorRole: operatorRole || "security",
          location: tapLocation.office,
          accessType: "system",
          activityType: "station_location_tap",
          status: "denied",
          nfcCardId: normalizedCardId,
          relatedUser: cardUser._id,
          metadata: {
            deviceId,
            tapLocation,
            accountStatus: cardUser.status,
          },
          notes: `${getFullName(cardUser) || cardUser.email || "Campus user"} has an inactive NFC card.`,
        });

        return res.status(403).json({
          success: false,
          message: "NFC card is not active",
        });
      }

      const normalizedUserRole = normalizeUserRoleValue(cardUser.role);

      if (normalizedUserRole !== "visitor") {
        const now = new Date();
        const dayStart = getStartOfDay(now);
        const dayEnd = getEndOfDay(now);
        const latestAttendance = await AttendanceRecord.findOne({
          userId: cardUser._id,
          attendanceDate: { $gte: dayStart, $lt: dayEnd },
        }).sort({ createdAt: -1 });

        const hasOpenAttendance = Boolean(
          latestAttendance?.checkInTime && !latestAttendance?.checkOutTime,
        );
        const isMainGateTap = isGateCheckpoint(tapLocation);
        const latestCheckpointTap = Array.isArray(latestAttendance?.checkpointHistory)
          ? latestAttendance.checkpointHistory[latestAttendance.checkpointHistory.length - 1]
          : null;
        const isExplicitCheckoutTap = tapAction === "checkout" || tapAction === "check_out";
        const isAutoGateTap =
          tapAction === "gate" ||
          tapAction === "entry" ||
          tapAction === "exit" ||
          (tapAction === "auto" && isMainGateTap);
        if (isExplicitCheckoutTap && !hasOpenAttendance && isMainGateTap) {
          return res.status(400).json({
            success: false,
            message: "Cannot check out because there is no active attendance check-in.",
          });
        }
        const shouldCheckOut =
          hasOpenAttendance &&
          tapAction !== "location" &&
          tapAction !== "track" &&
          isMainGateTap &&
          (isExplicitCheckoutTap || isAutoGateTap);
        const shouldCheckIn =
          !hasOpenAttendance &&
          tapAction !== "location" &&
          tapAction !== "track" &&
          (tapAction === "checkin" || tapAction === "check_in" || tapAction === "auto" || isAutoGateTap);
        const shouldRecordOfficeDeparture =
          hasOpenAttendance &&
          !isMainGateTap &&
          tapAction !== "location" &&
          tapAction !== "track" &&
          (isExplicitCheckoutTap ||
            (tapAction === "auto" &&
              latestCheckpointTap?.action !== "office_departure" &&
              isSameCheckpointLocation(latestCheckpointTap, tapLocation)));
        const action = shouldCheckOut
          ? "check_out"
          : shouldCheckIn
            ? "check_in"
            : shouldRecordOfficeDeparture
              ? "office_departure"
              : "location_update";
        const accessType =
          action === "check_out" ? "exit" : action === "check_in" ? "entry" : "system";
        const attendanceRecord = await upsertAttendanceRecordForTap({
          user: cardUser,
          action,
          tapLocation,
          timestamp: now,
          nfcCardId: normalizedCardId,
          deviceId,
        });
        const userDisplayName = getFullName(cardUser) || cardUser.email || "Campus user";

        await AccessLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          userName: operatorName,
          actorRole: operatorRole || "security",
          location: tapLocation.office,
          accessType,
          activityType: `station_${normalizedUserRole}_${action}`,
          status: "granted",
          nfcCardId: normalizedCardId,
          relatedUser: cardUser._id,
          metadata: {
            deviceId,
            action,
            tapLocation,
            userType: normalizedUserRole,
            attendanceRecordId: attendanceRecord._id,
            targetUserId: cardUser._id,
            clientTapId,
          },
          notes: `${operatorName} recorded ${userDisplayName} ${action.replace("_", " ")} at ${tapLocation.office}.`,
        });

        await sendCampusTapSecurityNotifications({
          user: cardUser,
          action,
          timestamp: now,
          status: attendanceRecord.status,
          tapLocation,
          attendanceRecord,
          deviceId,
        });

        await sendStudentParentAttendanceEmail({
          student: cardUser,
          action,
          timestamp: now,
          tapLocation,
        });

        return res.json({
          success: true,
          message:
            action === "check_in"
              ? "Attendance check-in recorded"
              : action === "check_out"
                ? "Attendance check-out recorded"
                : action === "office_departure"
                  ? "Office departure recorded"
                  : "Location checkpoint recorded",
          userType: normalizedUserRole,
          action,
          attendance: attendanceRecord,
          user: {
            _id: cardUser._id,
            name: userDisplayName,
            email: cardUser.email,
            role: normalizedUserRole,
            nfcCardId: normalizedCardId,
            department: cardUser.department || "",
            position: cardUser.position || "",
            course: cardUser.course || "",
            yearLevel: cardUser.yearLevel || "",
            section: cardUser.section || "",
            studentId: cardUser.studentId || "",
            teacherId: cardUser.teacherId || "",
            employeeId: cardUser.employeeId || "",
          },
        });
      }

      const visitorCandidates = await Visitor.find({
        email: cardUser.email,
        status: { $ne: "checked_out" },
      }).sort({ checkedInAt: -1, visitDate: 1, registeredAt: -1 });
      const checkedInVisitor = visitorCandidates.find(
        (visitorRecord) => String(visitorRecord?.status || "").toLowerCase() === "checked_in",
      );
      const latestVisitor = getPrioritizedVisitorForNfcTap(visitorCandidates);

      if (!latestVisitor) {
        await AccessLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          userName: operatorName,
          actorRole: operatorRole || "security",
          location: tapLocation.office,
          accessType: "system",
          activityType: "station_location_tap",
          status: "denied",
          nfcCardId: normalizedCardId,
          relatedUser: cardUser._id,
          metadata: {
            deviceId,
            tapLocation,
          },
          notes: `Checkpoint station could not find an active visit for ${getFullName(cardUser) || cardUser.email}.`,
        });

        return res.status(409).json({
          success: false,
          message: "No active visit found for this NFC card",
        });
      }

      const visitor = latestVisitor;
      await applyAppointmentLifecycleIfNeeded(visitor);

      const isMainGateTap = isGateCheckpoint(tapLocation);
      const isExplicitCheckoutTap = tapAction === "checkout" || tapAction === "check_out";
      const isAutoGateTap =
        tapAction === "gate" ||
        tapAction === "entry" ||
        tapAction === "exit" ||
        (tapAction === "auto" && isMainGateTap);
      const shouldCheckOut =
        checkedInVisitor &&
        tapAction !== "location" &&
        tapAction !== "track" &&
        isMainGateTap &&
        (isExplicitCheckoutTap || isAutoGateTap);
      const shouldCheckIn =
        !checkedInVisitor &&
        tapAction !== "location" &&
        tapAction !== "track" &&
        (tapAction === "checkin" || tapAction === "check_in" || isAutoGateTap);
      const shouldRecordOfficeDeparture =
        checkedInVisitor &&
        !isMainGateTap &&
        tapAction !== "location" &&
        tapAction !== "track" &&
        (isExplicitCheckoutTap ||
          (tapAction === "auto" &&
            visitor.currentLocation?.action !== "office_departure" &&
            isSameCheckpointLocation(visitor.currentLocation, tapLocation)));

      let action = "location_update";
      let accessType = "system";
      let activityType = "station_location_tap";
      let responseMessage = "Visitor location updated";

      if (
        !isMainGateTap &&
        visitor.status === "checked_in" &&
        isBeforeAppointmentOfficeAccessTime(visitor)
      ) {
        const scheduleLabel = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
        await AccessLog.create({
          userId: req.user._id,
          userEmail: req.user.email,
          userName: operatorName,
          actorRole: operatorRole || "security",
          location: tapLocation.office,
          accessType: "system",
          activityType: "early_office_scan",
          status: "denied",
          nfcCardId: normalizedCardId,
          relatedVisitor: visitor._id,
          relatedUser: cardUser._id,
          metadata: { deviceId, tapLocation, visitDate: visitor.visitDate, visitTime: visitor.visitTime },
          notes: `${visitor.fullName} arrived early and must wait in the lobby until ${scheduleLabel}.`,
        });

        return res.status(403).json({
          success: false,
          userType: "visitor",
          action: "location_update",
          code: "WAIT_IN_LOBBY",
          message: `Please wait in the lobby until your appointment time: ${scheduleLabel}.`,
          nfcCardId: normalizedCardId,
          visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
        });
      }

      if (shouldCheckOut) {
        visitor.markCheckedOut(req.user._id);
        visitor.updateCurrentLocation(tapLocation, {
          deviceId,
          action: "check_out",
          statusLabel: "Exited",
        });
        action = "check_out";
        accessType = "exit";
        activityType = "station_checkout";
        responseMessage = "Visitor checked out at checkpoint station";
      } else if (shouldRecordOfficeDeparture) {
        visitor.updateCurrentLocation(tapLocation, {
          deviceId,
          action: "office_departure",
          statusLabel: `Left ${tapLocation.office || "checkpoint"}`,
        });
        action = "office_departure";
        accessType = "system";
        activityType = "station_office_departure";
        responseMessage = "Visitor office departure recorded";
      } else if (shouldCheckIn) {
        const checkInEligibility = getVisitorCheckInEligibility(visitor);
        if (!checkInEligibility.allowed) {
          await AccessLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            userName: operatorName,
            actorRole: operatorRole || "security",
            location: tapLocation.office,
            accessType: "entry",
            activityType: "station_checkin",
            status: "denied",
            nfcCardId: normalizedCardId,
            relatedVisitor: visitor._id,
            relatedUser: cardUser._id,
            metadata: {
              deviceId,
              tapLocation,
              visitorStatus: visitor.status,
              approvalStatus: visitor.approvalStatus,
              appointmentStatus: visitor.appointmentStatus,
            },
            notes: `${operatorName} could not check in ${visitor.fullName}: ${checkInEligibility.message}`,
          });

          return res.status(checkInEligibility.statusCode || 403).json({
            success: false,
            userType: "visitor",
            action: "check_in",
            message: checkInEligibility.message,
            nfcCardId: normalizedCardId,
            visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
            user: {
              _id: cardUser._id,
              name: visitor.fullName,
              email: cardUser.email,
              role: "visitor",
              nfcCardId: normalizedCardId,
            },
          });
        }

        visitor.markCheckedIn(req.user._id);
        visitor.updateCurrentLocation(tapLocation, {
          deviceId,
          action: "check_in",
          statusLabel: checkInEligibility.lobbyOnly
            ? "Waiting in lobby"
            : `Inside ${tapLocation.office || "checkpoint"}`,
        });
        action = "check_in";
        accessType = "entry";
        activityType = "station_checkin";
        responseMessage = "Visitor checked in at checkpoint station";
      } else {
        if (visitor.status !== "checked_in") {
          await AccessLog.create({
            userId: req.user._id,
            userEmail: req.user.email,
            userName: operatorName,
            actorRole: operatorRole || "security",
            location: tapLocation.office,
            accessType: "system",
            activityType: "station_location_tap",
            status: "denied",
            nfcCardId: normalizedCardId,
            relatedVisitor: visitor._id,
            relatedUser: cardUser._id,
            metadata: {
              deviceId,
              tapLocation,
              visitorStatus: visitor.status,
            },
            notes: `${visitor.fullName} must be checked in before location tracking can start.`,
          });

          return res.status(409).json({
            success: false,
            userType: "visitor",
            action: "location_update",
            message: "Visitor must be checked in before location tracking can start",
            nfcCardId: normalizedCardId,
            visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
            user: {
              _id: cardUser._id,
              name: visitor.fullName,
              email: cardUser.email,
              role: "visitor",
              nfcCardId: normalizedCardId,
            },
          });
        }

        visitor.updateCurrentLocation(tapLocation, {
          deviceId,
          action: "location_update",
          statusLabel: `Moved to ${tapLocation.office || "checkpoint"}`,
        });
      }

      await visitor.save();
      const visitorAttendanceRecord = await upsertAttendanceRecordForTap({
        user: cardUser,
        visitor,
        action,
        tapLocation,
        timestamp: new Date(),
        nfcCardId: normalizedCardId,
        deviceId,
      });

      await AccessLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        userName: operatorName,
        actorRole: operatorRole || "security",
        location: tapLocation.office,
        accessType,
        activityType,
        status: "granted",
        nfcCardId: normalizedCardId,
        relatedVisitor: visitor._id,
        relatedUser: cardUser._id,
        metadata: {
          deviceId,
          action,
          tapLocation,
          currentLocation: visitor.currentLocation,
          attendanceRecordId: visitorAttendanceRecord._id,
          clientTapId,
        },
        notes: `${operatorName} recorded ${visitor.fullName} ${action.replace("_", " ")} at ${tapLocation.office}.`,
      });

      if (["check_in", "check_out", "location_update", "office_departure"].includes(action)) {
        const isCheckIn = action === "check_in";
        const isCheckOut = action === "check_out";
        const isOfficeDeparture = action === "office_departure";
        const notificationTitle = isCheckIn
          ? "Visitor Checked In"
          : isCheckOut
            ? "Visitor Checked Out"
            : isOfficeDeparture
              ? `Visitor Left ${tapLocation.office || "Office"}`
              : `Visitor Entered ${tapLocation.office || "Checkpoint"}`;
        const notificationMessage = isCheckIn
          ? `${visitor.fullName} checked in at ${tapLocation.office}.`
          : isCheckOut
            ? `${visitor.fullName} checked out at ${tapLocation.office}.`
            : isOfficeDeparture
              ? `${visitor.fullName} left ${tapLocation.office || "the selected office"}.`
            : `${visitor.fullName} entered ${tapLocation.office || "the selected checkpoint"}.`;
        await Promise.all([
          createRoleNotification({
            title: notificationTitle,
            message: notificationMessage,
            targetRole: "security",
            relatedVisitor: visitor._id,
            relatedUser: cardUser._id,
            type: "info",
            severity: isCheckIn || action === "location_update" || isOfficeDeparture ? "medium" : "low",
            metadata: {
              activityType,
              source: "checkpoint_station",
              deviceId,
              action,
              tapLocation,
              currentLocation: visitor.currentLocation,
              attendanceRecordId: visitorAttendanceRecord._id,
            },
          }),
          createRoleNotification({
            title: notificationTitle,
            message: notificationMessage,
            targetRole: "admin",
            relatedVisitor: visitor._id,
            relatedUser: cardUser._id,
            type: "info",
            severity: "low",
            metadata: {
              activityType,
              source: "checkpoint_station",
              deviceId,
              action,
              tapLocation,
              currentLocation: visitor.currentLocation,
              attendanceRecordId: visitorAttendanceRecord._id,
            },
          }),
        ]);
      }

      return res.json({
        success: true,
        message: responseMessage,
        action,
        userType: "visitor",
        visitorId: visitor._id,
        currentLocation: visitor.currentLocation,
        visitor: getVisitorTapPayload({ visitor, visitorUser: cardUser, nfcCardId: normalizedCardId }),
      });
    } catch (error) {
      console.error("Checkpoint station tap error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process checkpoint tap",
      });
    }
  },
);

app.post("/api/nfc/office-tap", officeTapAccessMiddleware, async (req, res) => {
  try {
    const cardId = String(
      req.body?.virtualCardToken ||
        req.body?.virtualNfcToken ||
        req.body?.nfcCardId ||
        req.body?.cardId ||
        req.body?.uid ||
        req.body?.pn532Uid ||
        req.body?.pn532UID ||
        req.body?.cardUID ||
        req.body?.cardUid ||
        req.body?.tagId ||
        "",
    )
      .trim()
      .toUpperCase();
    const normalizedCardId = normalizeNfcCardId(cardId);
    let tapLocation = getTapLocationFromRequest({
      ...req.body,
      source: req.body?.source || "office_nfc_reader",
    });
    const configuredCheckpoint = await NfcCheckpoint.findOne({
      isActive: true,
      $or: [
        { checkpointId: tapLocation.checkpointId },
        { readerId: tapLocation.checkpointId },
      ],
    }).lean();
    if (configuredCheckpoint) {
      tapLocation = {
        checkpointId: configuredCheckpoint.checkpointId,
        floor: configuredCheckpoint.floor,
        office: configuredCheckpoint.officeName,
        coordinates: configuredCheckpoint.coordinates || { x: null, y: null },
        source: "office_nfc_reader",
      };
    }
    const deviceId = String(req.body?.deviceId || tapLocation.checkpointId || "office-reader").trim();
    const tappedAt = new Date();

    if (!normalizedCardId && !req.body?.visitorId) {
      return res.status(400).json({
        success: false,
        code: "MISSING_VISITOR_CARD",
        message: "Missing NFC card ID or visitor ID.",
      });
    }

    if (!tapLocation.checkpointId || !tapLocation.office) {
      return res.status(400).json({
        success: false,
        code: "MISSING_OFFICE_READER",
        message: "Missing office NFC reader/checkpoint.",
      });
    }

    const visitorUser = normalizedCardId
      ? await User.findOne({
          ...buildNfcCredentialQuery(cardId, normalizedCardId),
          role: "visitor",
        }).select("_id email firstName lastName nfcCardId safePassId physicalNfcUid phoneNfcUid virtualNfcToken role status")
      : null;

    const visitorQuery = req.body?.visitorId
      ? { _id: req.body.visitorId }
      : visitorUser
        ? { email: visitorUser.email }
        : null;

    const visitor = visitorQuery
      ? await Visitor.findOne({
          ...visitorQuery,
          status: { $ne: "checked_out" },
        }).sort({ checkedInAt: -1, visitDate: -1, registeredAt: -1 })
      : null;

    if (!visitor) {
      await AccessLog.create({
        userEmail: visitorUser?.email || "",
        userName: visitorUser ? getFullName(visitorUser) || visitorUser.email : "Unknown Visitor NFC",
        actorRole: req.officeTapActor?.type || "device",
        location: tapLocation.office,
        accessType: "system",
        activityType: "office_invalid_tap",
        status: "denied",
        nfcCardId: normalizedCardId,
        relatedUser: visitorUser?._id || null,
        metadata: { deviceId, tapLocation },
        notes: `Office tap at ${tapLocation.office} could not be matched to an active visitor appointment.`,
      });

      return res.status(404).json({
        success: false,
        code: "NO_ACTIVE_APPOINTMENT",
        message: "No active appointment was found for this NFC tap.",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    const appointmentStatus = String(visitor.appointmentStatus || "").toLowerCase();
    const hasApprovedAppointment =
      visitor.requestCategory === "appointment" &&
      ["approved", "adjusted"].includes(appointmentStatus);

    if (!hasApprovedAppointment || visitor.status !== "checked_in") {
      await createVisitorMovementLog({
        visitor,
        visitorUser,
        nfcCardId: normalizedCardId,
        tapLocation,
        expectedDestination: getAssignedAppointmentOffice(visitor) || "Approved appointment",
        status: "invalid_tap",
        message: "Visitor must have an approved, checked-in appointment before office tracking works.",
        metadata: {
          deviceId,
          appointmentStatus: visitor.appointmentStatus,
          visitorStatus: visitor.status,
        },
        tappedAt,
      });

      await AccessLog.create({
        userId: visitorUser?._id || null,
        userEmail: visitor.email,
        userName: visitor.fullName,
        actorRole: req.officeTapActor?.type || "device",
        location: tapLocation.office,
        accessType: "system",
        activityType: "office_invalid_tap",
        status: "denied",
        nfcCardId: normalizedCardId,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          deviceId,
          tapLocation,
          appointmentStatus: visitor.appointmentStatus,
          visitorStatus: visitor.status,
        },
        notes: `${visitor.fullName} tapped at ${tapLocation.office}, but office tracking is not active for this appointment.`,
      });

      return res.status(409).json({
        success: false,
        code: "OFFICE_TRACKING_NOT_ACTIVE",
        message: "Visitor must be checked in with an approved appointment before office tracking works.",
      });
    }

    if (!isGateCheckpoint(tapLocation) && isBeforeAppointmentOfficeAccessTime(visitor)) {
      const scheduleLabel = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
      await createVisitorMovementLog({
        visitor,
        visitorUser,
        nfcCardId: normalizedCardId,
        tapLocation,
        expectedDestination: "Lobby waiting area",
        status: "waiting",
        message: `Visitor arrived early and must wait in the lobby until ${scheduleLabel}.`,
        metadata: { deviceId, visitDate: visitor.visitDate, visitTime: visitor.visitTime },
        tappedAt,
      });

      return res.status(403).json({
        success: false,
        code: "WAIT_IN_LOBBY",
        message: `Please wait in the lobby until your appointment time: ${scheduleLabel}.`,
      });
    }

    const expectedDestination = getAssignedAppointmentOffice(visitor) || "Assigned destination";
    const expectedNormalized = normalizeDepartmentValue(expectedDestination);
    const actualNormalized = normalizeDepartmentValue(tapLocation.office || tapLocation.checkpointId);
    const isCorrectLocation = Boolean(expectedNormalized && actualNormalized && expectedNormalized === actualNormalized);
    const movementStatus = isCorrectLocation
      ? visitor.currentDestination?.status === "redirected"
        ? "redirected"
        : "correct_location"
      : "wrong_location";
    const statusLabel = isCorrectLocation
      ? `Inside ${tapLocation.office}`
      : `Wrong office tap at ${tapLocation.office}`;

    const movementLog = await createVisitorMovementLog({
      visitor,
      visitorUser,
      nfcCardId: normalizedCardId,
      tapLocation,
      expectedDestination,
      status: movementStatus,
      handledBy: visitor.currentDestination?.updatedBy || null,
      message: isCorrectLocation
        ? `Location updated: ${visitor.fullName} is now at ${tapLocation.office}.`
        : `${visitor.fullName} tapped at ${tapLocation.office}, but their assigned destination is ${expectedDestination}.`,
      metadata: {
        deviceId,
        source: "office_nfc_reader",
        currentDestination: visitor.currentDestination || null,
      },
      tappedAt,
    });

    if (isCorrectLocation) {
      visitor.updateCurrentLocation(tapLocation, {
        deviceId,
        action: "office_location_update",
        statusLabel,
      });
      await visitor.save();
    }

    await AccessLog.create({
      userId: visitorUser?._id || null,
      userEmail: visitor.email,
      userName: visitor.fullName,
      actorRole: req.officeTapActor?.type || "device",
      location: tapLocation.office,
      accessType: "system",
      activityType: isCorrectLocation ? "office_correct_location" : "office_wrong_location",
      status: isCorrectLocation ? "granted" : "denied",
      nfcCardId: normalizedCardId,
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        deviceId,
        tapLocation,
        expectedDestination,
        actualLocation: tapLocation.office,
        movementStatus,
        movementLogId: movementLog._id,
        currentLocation: visitor.currentLocation,
      },
      notes: isCorrectLocation
        ? `${visitor.fullName} tapped at the correct office: ${tapLocation.office}.`
        : `${visitor.fullName} tapped at ${tapLocation.office}, but their assigned destination is ${expectedDestination}.`,
    });

    await notifyVisitorLocationResult({
      visitor,
      visitorUser,
      tapLocation,
      expectedDestination,
      status: isCorrectLocation ? "correct_location" : "wrong_location",
    });

    await Promise.all([
      createRoleNotification({
        title: isCorrectLocation ? "Visitor Entered Correct Office" : "Wrong Office Alert",
        message: isCorrectLocation
          ? `${visitor.fullName} entered ${tapLocation.office}, matching their assigned destination.`
          : `Visitor ${visitor.fullName} tapped at ${tapLocation.office}, but their assigned destination is ${expectedDestination}.`,
        type: isCorrectLocation ? "info" : "alert",
        severity: isCorrectLocation ? "low" : "high",
        targetRole: "security",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: isCorrectLocation ? "office_correct_location" : "office_wrong_location",
          expectedDestination,
          actualLocation: tapLocation.office,
          movementLogId: movementLog._id,
        },
      }),
      createRoleNotification({
        title: isCorrectLocation ? "Visitor Office Location Updated" : "Visitor Wrong Office Alert",
        message: isCorrectLocation
          ? `${visitor.fullName} is now at ${tapLocation.office}.`
          : `${visitor.fullName} tapped at ${tapLocation.office}, expected ${expectedDestination}.`,
        type: isCorrectLocation ? "info" : "alert",
        severity: isCorrectLocation ? "low" : "medium",
        targetRole: "admin",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: isCorrectLocation ? "office_correct_location" : "office_wrong_location",
          expectedDestination,
          actualLocation: tapLocation.office,
          movementLogId: movementLog._id,
        },
      }),
    ]);

    return res.json({
      success: isCorrectLocation,
      code: isCorrectLocation ? "LOCATION_UPDATED" : "WRONG_OFFICE_LOCATION",
      status: movementStatus,
      message: isCorrectLocation
        ? `Location updated: You are now checked in at ${tapLocation.office}.`
        : `Warning: This is not your assigned destination. Please proceed to ${expectedDestination} or ask staff for assistance.`,
      expectedDestination,
      actualLocation: tapLocation.office,
      currentLocation: visitor.currentLocation,
      movementLog,
    });
  } catch (error) {
    console.error("Office NFC tap error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process office NFC tap.",
    });
  }
});

app.put("/api/visitors/:id/phone-location", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    const requesterRole = String(req.user.role || "").toLowerCase();
    const isOwnVisitorRecord =
      requesterRole === "visitor" &&
      String(visitor.email || "").toLowerCase() === String(req.user.email || "").toLowerCase();
    const canUpdateTrackedLocation =
      isOwnVisitorRecord || ["admin", "security", "guard"].includes(requesterRole);

    if (!canUpdateTrackedLocation) {
      return res.status(403).json({
        success: false,
        message: "You cannot update this visitor location",
      });
    }

    if (visitor.status !== "checked_in") {
      return res.status(409).json({
        success: false,
        message: "Visitor must be checked in before phone GPS tracking can start",
      });
    }

    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    const coordinates = mapGpsToCampusCoordinates(latitude, longitude);
    visitor.updateCurrentLocation(
      {
        floor: req.body?.floor || visitor.currentLocation?.floor || "ground",
        office: req.body?.office || visitor.currentLocation?.office || "Phone GPS",
        checkpointId: "phone_gps",
        coordinates,
        gps: {
          latitude,
          longitude,
          accuracy: req.body?.accuracy,
          altitude: req.body?.altitude,
          heading: req.body?.heading,
          speed: req.body?.speed,
        },
        source: "phone_gps",
      },
      {
        deviceId: req.body?.deviceId || `phone-${req.user._id}`,
      },
    );

    await visitor.save();

    res.json({
      success: true,
      message: "Phone GPS location updated",
      visitorId: visitor._id,
      currentLocation: visitor.currentLocation,
    });
  } catch (error) {
    console.error("Phone GPS location update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update phone GPS location",
    });
  }
});

// 1. REGISTER
const normalizeEmailValue = (value = "") => String(value || "").toLowerCase().trim();
const normalizeUsernameValue = (value = "") => String(value || "").toLowerCase().trim();
const isValidEmailValue = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const escapeRegExpValue = (value = "") => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactTextMatch = (value = "") => ({ $regex: `^${escapeRegExpValue(String(value || "").trim())}$`, $options: "i" });
const sameNormalizedText = (left = "", right = "") =>
  String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
const sanitizeAccountEmailPart = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getGeneratedAccountEmailRolePart = ({ role, department, position } = {}) => {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === "security" || normalizedRole === "guard") return "security";
  return sanitizeAccountEmailPart(department || position || "staff") || "staff";
};

const generateUniqueAccountEmail = async ({ firstName, role, department, position } = {}) => {
  const firstNamePart = sanitizeAccountEmailPart(firstName);
  if (!firstNamePart) return "";

  const rolePart = getGeneratedAccountEmailRolePart({ role, department, position });
  const baseLocalPart = `${firstNamePart}${rolePart}`;
  let suffix = 1;
  let candidate = `${baseLocalPart}@sapphire.edu`;

  while (await User.exists({ email: candidate })) {
    suffix += 1;
    candidate = `${baseLocalPart}${suffix}@sapphire.edu`;
  }

  return candidate;
};
const normalizeDepartmentValue = (value = "") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['â€™]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");

  const aliases = {
    "registrars office": "registrar",
    registrar: "registrar",
    "finance office": "accounting",
    finance: "accounting",
    accounting: "accounting",
    cashier: "accounting",
    guidance: "guidance",
    "guidance office": "guidance",
    "student services": "guidance",
    administration: "administration",
    "administration office": "administration",
    admin: "administration",
    "admin office": "administration",
    admissions: "admissions",
    "admissions office": "admissions",
    "flight operations": "flight operations",
    training: "training",
    "head of training room": "training",
    "i.t room": "i.t room",
    "it room": "i.t room",
    "faculty room": "faculty room",
    "faculty office": "faculty room",
    clinic: "clinic",
    "information desk": "information desk",
    lobby: "information desk",
    "front desk": "information desk",
    "ground offices": "administration",
    "file room": "registrar",
    laboratory: "laboratory",
    tesda: "tesda",
    workshop: "workshop",
    "tools room": "workshop",
    library: "library",
    "students lounge": "student services",
    "student lounge": "student services",
    "student services": "student services",
    sto: "sto",
  };

  return aliases[normalized] || normalized;
};

const formatDepartmentLabel = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const APPOINTMENT_SLOT_LIMIT = DEFAULT_APPOINTMENT_SLOT_LIMIT || 3;
const APPOINTMENT_SLOT_STATUSES = ["pending", "approved", "adjusted", "adjustment_pending", "rescheduled"];
const APPOINTMENT_PURPOSE_OPTIONS = DEFAULT_APPOINTMENT_PURPOSE_OPTIONS;
const APPOINTMENT_DEPARTMENT_OPTIONS = DEFAULT_APPOINTMENT_DEPARTMENT_OPTIONS;
const ACCOUNT_ROLE_OPTIONS = ["admin", "staff", "security", "guard", "visitor", "student", "teacher"];
const ACCOUNT_STATUS_OPTIONS = ["active", "inactive", "pending", "suspended"];

const normalizeOptionValue = (value = "") =>
  String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const isAllowedOption = (value, options) => {
  const normalizedValue = normalizeOptionValue(value);
  return options.some((option) => normalizeOptionValue(option) === normalizedValue);
};

const getAppointmentSlotLimit = (slot = {}) => {
  const parsedLimit = Number(slot?.capacity ?? slot?.limit ?? APPOINTMENT_SLOT_LIMIT);
  return Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : APPOINTMENT_SLOT_LIMIT;
};

const parseAppointmentTimeParts = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return getAppointmentTimezoneParts(value);
  }

  const rawValue = String(value || "").trim();
  const timeMatch = rawValue.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const suffix = String(timeMatch[3] || "").toUpperCase();
    if (suffix === "PM" && hour < 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    if (
      Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return { hour, minute };
    }
  }

  const parsedDate = new Date(rawValue);
  if (!Number.isNaN(parsedDate.getTime())) {
    return getAppointmentTimezoneParts(parsedDate);
  }

  return null;
};

const APPOINTMENT_TIMEZONE_OFFSET_MINUTES = Number.isFinite(
  Number(process.env.APPOINTMENT_TIMEZONE_OFFSET_MINUTES),
)
  ? Number(process.env.APPOINTMENT_TIMEZONE_OFFSET_MINUTES)
  : 8 * 60;

const SCHOOL_OFFICE_HOURS = {
  openHour: Number.isFinite(Number(process.env.SCHOOL_OFFICE_OPEN_HOUR))
    ? Number(process.env.SCHOOL_OFFICE_OPEN_HOUR)
    : 8,
  openMinute: Number.isFinite(Number(process.env.SCHOOL_OFFICE_OPEN_MINUTE))
    ? Number(process.env.SCHOOL_OFFICE_OPEN_MINUTE)
    : 0,
  closeHour: Number.isFinite(Number(process.env.SCHOOL_OFFICE_CLOSE_HOUR))
    ? Number(process.env.SCHOOL_OFFICE_CLOSE_HOUR)
    : 18,
  closeMinute: Number.isFinite(Number(process.env.SCHOOL_OFFICE_CLOSE_MINUTE))
    ? Number(process.env.SCHOOL_OFFICE_CLOSE_MINUTE)
    : 0,
};

const getAppointmentTimezoneParts = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const shiftedDate = new Date(date.getTime() + APPOINTMENT_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth(),
    day: shiftedDate.getUTCDate(),
    hour: shiftedDate.getUTCHours(),
    minute: shiftedDate.getUTCMinutes(),
  };
};

const getAppointmentDateParts = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return getAppointmentTimezoneParts(value);
  }

  const rawValue = String(value || "").trim();
  const dateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return {
      year: Number(dateMatch[1]),
      month: Number(dateMatch[2]) - 1,
      day: Number(dateMatch[3]),
    };
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return getAppointmentTimezoneParts(parsedDate);
};

const createAppointmentTimezoneDate = ({ year, month, day, hour = 0, minute = 0 }) => {
  const utcTimestamp =
    Date.UTC(year, month, day, hour, minute, 0, 0) -
    APPOINTMENT_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  const date = new Date(utcTimestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getAppointmentDuplicateDayKey = (value) => {
  const parts = getAppointmentDateParts(value);
  if (!parts) return "";
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

const normalizeAppointmentDuplicateText = (value = "") =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const getApprovedAppointmentDuplicateKey = (visitor = {}) => {
  const email = normalizeAppointmentDuplicateText(visitor.email);
  const purpose = normalizeAppointmentDuplicateText(
    visitor.purposeOfVisit || visitor.customPurposeOfVisit || visitor.purposeCategory,
  );
  const department = normalizeDepartmentValue(
    visitor.appointmentDepartment || visitor.assignedOffice || visitor.host,
  );
  const day = getAppointmentDuplicateDayKey(visitor.visitDate);
  if (!email || !purpose || !department || !day) return "";
  return `${email}|${purpose}|${department}|${day}`;
};

const closeDuplicateApprovedAppointments = async (approvedVisitor) => {
  const duplicateKey = getApprovedAppointmentDuplicateKey(approvedVisitor);
  if (!duplicateKey) return 0;

  const normalizedEmail = String(approvedVisitor.email || "").trim().toLowerCase();
  const candidates = await Visitor.find({
    _id: { $ne: approvedVisitor._id },
    email: normalizedEmail,
    requestCategory: "appointment",
    approvalStatus: "approved",
    appointmentStatus: { $in: ["approved", "adjusted"] },
    status: { $nin: ["checked_in", "checked_out", "cancelled", "rejected", "expired", "no_show"] },
  });

  const duplicates = candidates.filter(
    (candidate) => getApprovedAppointmentDuplicateKey(candidate) === duplicateKey,
  );
  const closedAt = new Date();

  await Promise.all(
    duplicates.map(async (duplicate) => {
      duplicate.appointmentStatus = "cancelled";
      duplicate.status = "cancelled";
      duplicate.appointmentCancelledAt = closedAt;
      duplicate.appointmentCancellationReason =
        "Duplicate approved appointment automatically closed. Latest approved request kept.";
      duplicate.currentLocation = {
        ...(duplicate.currentLocation || {}),
        isActive: false,
        lastSeenAt: duplicate.currentLocation?.lastSeenAt || closedAt,
      };
      await duplicate.save();
    }),
  );

  return duplicates.length;
};

const getNextSchoolOfficeOpenAt = (value = new Date()) => {
  const submittedParts = getAppointmentTimezoneParts(value);
  if (!submittedParts) return null;

  let candidate = createAppointmentTimezoneDate({
    ...submittedParts,
    hour: SCHOOL_OFFICE_HOURS.openHour,
    minute: SCHOOL_OFFICE_HOURS.openMinute,
  });
  if (!candidate) return null;

  if (candidate <= value) {
    const nextParts = getAppointmentTimezoneParts(candidate);
    if (!nextParts) return null;
    candidate = createAppointmentTimezoneDate({
      ...nextParts,
      day: nextParts.day + 1,
      hour: SCHOOL_OFFICE_HOURS.openHour,
      minute: SCHOOL_OFFICE_HOURS.openMinute,
    });
  }

  while (candidate && !isAppointmentServiceDay(candidate)) {
    const parts = getAppointmentTimezoneParts(candidate);
    if (!parts) return null;
    candidate = createAppointmentTimezoneDate({
      ...parts,
      day: parts.day + 1,
      hour: SCHOOL_OFFICE_HOURS.openHour,
      minute: SCHOOL_OFFICE_HOURS.openMinute,
    });
  }

  return candidate;
};

const getAfterHoursAppointmentNotice = (submittedAt = new Date()) => {
  const submittedParts = getAppointmentTimezoneParts(submittedAt);
  if (!submittedParts) return { isAfterHours: false };

  const openAt = createAppointmentTimezoneDate({
    ...submittedParts,
    hour: SCHOOL_OFFICE_HOURS.openHour,
    minute: SCHOOL_OFFICE_HOURS.openMinute,
  });
  const closedAt = createAppointmentTimezoneDate({
    ...submittedParts,
    hour: SCHOOL_OFFICE_HOURS.closeHour,
    minute: SCHOOL_OFFICE_HOURS.closeMinute,
  });
  const isSchoolDay = isAppointmentServiceDay(submittedAt);
  const isOutsideOfficeHours =
    !isSchoolDay ||
    (openAt && submittedAt < openAt) ||
    (closedAt && submittedAt >= closedAt);

  if (!isOutsideOfficeHours) {
    return { isAfterHours: false };
  }

  const nextOfficeOpenAt = getNextSchoolOfficeOpenAt(submittedAt);
  return {
    isAfterHours: true,
    title: "Appointment Request Received",
    message:
      "Your appointment request has been submitted successfully. Since it was sent after school hours, it will be reviewed once the office reopens on the next school day.",
    nextOfficeOpenAt,
    officeHours: SCHOOL_OFFICE_HOURS,
  };
};

const getAppointmentDayOfWeek = (value) => {
  const parts = getAppointmentDateParts(value);
  if (!parts) return null;
  return createAppointmentTimezoneDate({ ...parts, hour: 12 })?.getUTCDay() ?? null;
};

const getConfiguredAppointmentSlotParts = (slot = {}) => {
  const directHour = Number(slot.hour);
  const directMinute = Number(slot.minute);
  if (
    Number.isInteger(directHour) &&
    Number.isInteger(directMinute) &&
    directHour >= 0 &&
    directHour <= 23 &&
    directMinute >= 0 &&
    directMinute <= 59
  ) {
    return { hour: directHour, minute: directMinute };
  }

  return parseAppointmentTimeParts(slot.value || slot.label);
};

const findAppointmentConfiguredSlot = (timeSlots = [], appointmentDateTime) => {
  if (!appointmentDateTime) return null;
  const selectedParts = parseAppointmentTimeParts(appointmentDateTime);
  if (!selectedParts) return null;

  return timeSlots.find((slot) => {
    const slotParts = getConfiguredAppointmentSlotParts(slot);
    return (
      slotParts &&
      slotParts.hour === selectedParts.hour &&
      slotParts.minute === selectedParts.minute
    );
  }) || null;
};

const normalizePhoneValue = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "");

  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;

  return String(value || "").trim().replace(/\s+/g, " ");
};

const isValidPhoneValue = (value = "") =>
  /^09\d{9}$/.test(normalizePhoneValue(value));

const PHONE_VALIDATION_MESSAGE =
  "Please enter a valid Philippine mobile number, e.g. 09123456789 or +639123456789.";

const isSameObjectId = (left, right) =>
  Boolean(left && right && String(left) === String(right));

const isVisitorOwner = (user = {}, visitor = {}) => {
  if (String(user.role || "").toLowerCase() !== "visitor") return false;

  const sameVisitorId = isSameObjectId(user.visitorId, visitor._id);
  const sameEmail =
    String(user.email || "").trim().toLowerCase() ===
    String(visitor.email || "").trim().toLowerCase();

  return sameVisitorId || sameEmail;
};

const isUserSafePassCardActive = (user = {}) =>
  Boolean(getUserPhysicalNfcUid(user) || getUserPhoneNfcUid(user) || getUserSafePassId(user)) &&
  String(user?.status || "").toLowerCase() === "active" &&
  user?.accessPermissions?.cardActive !== false;

const getVisitorAccountPayload = (user = {}) => ({
  _id: user._id,
  fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
  email: user.email,
  phoneNumber: user.phone,
  status: user.status,
  safePassId: getUserSafePassId(user),
  nfcCardId: getUserPhysicalNfcUid(user),
  physicalNfcUid: getUserPhysicalNfcUid(user),
  phoneNfcUid: getUserPhoneNfcUid(user),
  virtualNfcToken: getUserVirtualNfcToken(user),
  cardActive: isUserSafePassCardActive(user),
  accessPermissions: {
    canAccess: user.accessPermissions?.canAccess || [],
    restrictedAreas: user.accessPermissions?.restrictedAreas || [],
    cardActive: user.accessPermissions?.cardActive !== false,
  },
  registeredAt: user.createdAt,
});

const getVisitorCardAccessAreas = (visitor = {}) => {
  const areas = [
    "main_gate",
    "security_gate",
    visitor.assignedOffice,
    visitor.appointmentDepartment,
    visitor.currentDestination?.office,
  ];

  return Array.from(
    new Set(
      areas
        .map((area) => String(area || "").trim())
        .filter(Boolean),
    ),
  );
};

const getVisitorCardTimeRestrictions = (visitor = {}) => {
  const checkInWindow = getAppointmentCheckInWindow(visitor);
  if (!checkInWindow?.scheduledAt || !checkInWindow?.graceUntil) return [];

  return [
    {
      type: "appointment_window",
      startsAt: checkInWindow.scheduledAt,
      endsAt: checkInWindow.graceUntil,
      visitDate: visitor.visitDate || null,
      visitTime: visitor.visitTime || null,
    },
  ];
};

const activateVisitorSafePassCardForUser = async (user, visitor = {}) => {
  if (!user) return "";

  user.role = "visitor";
  const safePassId = await ensureSafePassAccountId(user);
  user.status = "active";
  user.isActive = true;
  if (visitor?._id) {
    user.visitorId = visitor._id;
  }
  user.accessPermissions = {
    canAccess: getVisitorCardAccessAreas(visitor),
    restrictedAreas: user.accessPermissions?.restrictedAreas || [],
    timeRestrictions: getVisitorCardTimeRestrictions(visitor),
    cardActive: true,
  };

  await user.save();
  return safePassId;
};

const ensureVirtualNfcTokenForVisitor = async (user, visitor = null) => {
  if (!user || normalizeUserRoleValue(user.role) !== "visitor") return "";

  let token = getUserVirtualNfcToken(user);
  if (!token) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateVirtualNfcToken();
      const existing = await User.exists({ virtualNfcToken: candidate });
      if (!existing) {
        token = candidate;
        break;
      }
    }
  }

  if (!token) {
    throw new Error("Unable to generate virtual NFC token.");
  }

  user.virtualNfcToken = token;
  await user.save();

  const visitorRecord = visitor || (await findVisitorForUser(user));
  if (visitorRecord && visitorRecord.virtualNfcToken !== token) {
    visitorRecord.virtualNfcToken = token;
    await visitorRecord.save();
  }

  return token;
};

const isEmptyPhysicalNfcUid = (value = "") => !normalizeSubmittedNfcCardId(value);

const findApprovedVisitorForFirstNfcTap = async (normalizedCardId = "") => {
  if (!normalizedCardId) {
    return { visitor: null, user: null, reason: "missing_uid" };
  }

  const duplicateUser = await User.findOne(buildNfcCredentialQuery(normalizedCardId, normalizedCardId)).select(
    "_id email firstName lastName nfcCardId safePassId physicalNfcUid phoneNfcUid virtualNfcToken role status accessPermissions",
  );
  if (duplicateUser) {
    return { visitor: null, user: duplicateUser, reason: "already_assigned" };
  }

  const inactiveStatuses = ["checked_out", "expired", "no_show", "rejected", "cancelled"];
  const dayStart = getStartOfDay(new Date());
  const dayEnd = getEndOfDay(new Date());
  const approvedVisitors = await Visitor.find({
    requestCategory: "appointment",
    appointmentStatus: { $in: ["approved", "adjusted"] },
    approvalStatus: "approved",
    status: { $nin: inactiveStatuses },
    checkedOutAt: null,
    $or: [
      { physicalNfcUid: { $exists: false } },
      { physicalNfcUid: null },
      { physicalNfcUid: "" },
    ],
  }).sort({ visitDate: 1, visitTime: 1, registeredAt: -1 });

  const candidatesWithUsers = [];
  for (const visitor of approvedVisitors) {
    const visitorUser = await User.findOne({
      role: "visitor",
      $or: [
        ...(visitor.email ? [{ email: String(visitor.email).trim().toLowerCase() }] : []),
        { visitorId: visitor._id },
      ],
    }).select("_id email firstName lastName nfcCardId safePassId physicalNfcUid phoneNfcUid virtualNfcToken role status accessPermissions");

    if (!visitorUser || !isEmptyPhysicalNfcUid(visitorUser.physicalNfcUid)) {
      continue;
    }

    candidatesWithUsers.push({ visitor, user: visitorUser });
  }

  const todayCandidates = candidatesWithUsers.filter(({ visitor }) => {
    const visitDate = new Date(visitor.visitDate);
    return !Number.isNaN(visitDate.getTime()) && visitDate >= dayStart && visitDate <= dayEnd;
  });

  const finalCandidates = todayCandidates.length ? todayCandidates : candidatesWithUsers;
  if (finalCandidates.length !== 1) {
    return {
      visitor: null,
      user: null,
      reason: finalCandidates.length > 1 ? "ambiguous" : "none",
      candidateCount: finalCandidates.length,
    };
  }

  return { ...finalCandidates[0], reason: "matched" };
};

const assignFirstTapNfcUidToVisitor = async ({ visitor, user, normalizedCardId }) => {
  if (!visitor || !user || !normalizedCardId) return null;

  user.physicalNfcUid = normalizedCardId;
  if (!String(user.nfcCardId || "").trim() || !isLegacySafePassToken(user.nfcCardId)) {
    user.nfcCardId = normalizedCardId;
  }
  user.status = "active";
  user.isActive = true;
  user.visitorId = visitor._id;
  user.accessPermissions = {
    canAccess: getVisitorCardAccessAreas(visitor),
    restrictedAreas: user.accessPermissions?.restrictedAreas || [],
    timeRestrictions: getVisitorCardTimeRestrictions(visitor),
    cardActive: true,
  };

  visitor.physicalNfcUid = normalizedCardId;
  visitor.nfcCardId = normalizedCardId;
  visitor.safePassId = visitor.safePassId || getUserSafePassId(user) || "";

  await Promise.all([user.save(), visitor.save()]);
  return { visitor, user };
};

const findVisitorForUser = async (user) => {
  if (!user) return null;

  const visitors = await findVisitorsForUser(user);
  const visitor = getPrioritizedVisitor(visitors);

  if (
    visitor &&
    (!user.visitorId || String(user.visitorId) !== String(visitor._id))
  ) {
    user.visitorId = visitor._id;
    await user.save();
  }

  return visitor;
};

const findVisitorsForUser = async (user) => {
  if (!user) return [];

  const filters = [];
  if (user.visitorId) {
    filters.push({ _id: user.visitorId });
  }
  if (user.email) {
    filters.push({ email: String(user.email).trim().toLowerCase() });
  }

  if (!filters.length) return [];

  return Visitor.find({ $or: filters }).sort({
    appointmentRescheduledAt: -1,
    appointmentRequestedAt: -1,
    registeredAt: -1,
    createdAt: -1,
    visitTime: -1,
    visitDate: -1,
  });
};

const buildUserCleanupTargets = async (user) => {
  const userId = user?._id;
  const visitorFilters = [];

  if (user?.visitorId) {
    visitorFilters.push({ _id: user.visitorId });
  }

  if (user?.email) {
    visitorFilters.push({ email: String(user.email).trim().toLowerCase() });
  }

  const visitorIds = visitorFilters.length
    ? await Visitor.distinct("_id", { $or: visitorFilters })
    : [];

  return {
    visitorIds,
    accessLogQuery: {
      $or: [
        { userId },
        { relatedUser: userId },
        { relatedVisitor: { $in: visitorIds } },
      ],
    },
    notificationQuery: {
      $or: [
        { userId },
        { targetUser: userId },
        { relatedUser: userId },
        { relatedVisitor: { $in: visitorIds } },
      ],
    },
  };
};

const syncVisitorRecordsForUserUpdate = async (existingUser, updatedUser) => {
  const wasVisitor = String(existingUser?.role || "").toLowerCase() === "visitor";
  const isVisitor = String(updatedUser?.role || "").toLowerCase() === "visitor";

  if (!wasVisitor && !isVisitor) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const filters = [];
  if (existingUser?.visitorId) {
    filters.push({ _id: existingUser.visitorId });
  }
  if (existingUser?.email) {
    filters.push({ email: String(existingUser.email).trim().toLowerCase() });
  }
  if (updatedUser?.email) {
    filters.push({ email: String(updatedUser.email).trim().toLowerCase() });
  }

  if (!filters.length) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  return Visitor.updateMany(
    { $or: filters },
    {
      $set: {
        fullName: `${updatedUser.firstName || ""} ${updatedUser.lastName || ""}`.trim(),
        email: String(updatedUser.email || "").trim().toLowerCase(),
        phoneNumber: updatedUser.phone || "",
        updatedAt: new Date(),
      },
    },
  );
};

const attachSafePassIdsToVisitors = async (visitors = [], { ensureMissingIds = true } = {}) => {
  if (!Array.isArray(visitors) || !visitors.length) return [];

  const emails = [
    ...new Set(
      visitors
        .map((visitor) => String(visitor?.email || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const userQuery = emails.length
    ? User.find({ role: "visitor", email: { $in: emails } })
    : null;
  const users = userQuery
    ? ensureMissingIds
      ? await userQuery
      : await userQuery.lean()
    : [];

  if (ensureMissingIds) {
    await Promise.all(users.map((user) => ensureSafePassAccountId(user)));
  }

  const accountIdByEmail = new Map();
  const physicalCardByEmail = new Map();
  const phoneCardByEmail = new Map();
  users.forEach((user) => {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return;
    const safePassId = getUserSafePassId(user);
    const physicalUid = getUserPhysicalNfcUid(user);
    const phoneUid = getUserPhoneNfcUid(user);
    if (safePassId) accountIdByEmail.set(email, safePassId);
    if (physicalUid) physicalCardByEmail.set(email, physicalUid);
    if (phoneUid) phoneCardByEmail.set(email, phoneUid);
  });

  return visitors.map((visitor) => {
    const payload = typeof visitor.toObject === "function" ? visitor.toObject() : { ...visitor };
    const email = String(payload.email || "").trim().toLowerCase();
    const matchedUser = users.find((user) => String(user.email || "").trim().toLowerCase() === email);
    const visitorCardId = String(payload.nfcCardId || "").trim();
    payload.userId = matchedUser?._id || payload.userId || null;
    payload.safePassId =
      payload.safePassId ||
      accountIdByEmail.get(email) ||
      (isLegacySafePassToken(visitorCardId) ? visitorCardId : "");
    payload.physicalNfcUid =
      physicalCardByEmail.get(email) ||
      payload.physicalNfcUid ||
      (visitorCardId && !isLegacySafePassToken(visitorCardId) ? visitorCardId : "");
    payload.phoneNfcUid = phoneCardByEmail.get(email) || payload.phoneNfcUid || "";
    payload.nfcCardId = payload.physicalNfcUid;
    return payload;
  });
};

const getVisitorScheduleTime = (visitor) => {
  const combined = getCombinedAppointmentDateTime(visitor?.visitDate, visitor?.visitTime);
  if (combined) return combined.getTime();

  const fallback = new Date(visitor?.visitDate || visitor?.visitTime || visitor?.registeredAt || 0);
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
};

const getVisitorSubmissionTime = (visitor = {}) => {
  const timestamps = [
    visitor.appointmentRescheduledAt,
    visitor.appointmentRequestedAt,
    visitor.registeredAt,
    visitor.createdAt,
    visitor.visitTime,
    visitor.visitDate,
  ];

  return timestamps.reduce((latest, value) => {
    const timestamp = new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
};

const getPrioritizedVisitor = (visitors = []) => {
  if (!Array.isArray(visitors) || !visitors.length) return null;

  const checkedIn = visitors
    .filter((visitor) => String(visitor?.status || "").toLowerCase() === "checked_in")
    .sort((left, right) => getVisitorSubmissionTime(right) - getVisitorSubmissionTime(left));

  if (checkedIn[0]) return checkedIn[0];

  const submittedAppointments = visitors
    .filter((visitor) => visitor?.requestCategory === "appointment")
    .sort((left, right) => getVisitorSubmissionTime(right) - getVisitorSubmissionTime(left));

  if (submittedAppointments[0]) return submittedAppointments[0];

  return [...visitors].sort((left, right) => getVisitorSubmissionTime(right) - getVisitorSubmissionTime(left))[0];
};

const getPrioritizedVisitorForNfcTap = (visitors = []) => {
  if (!Array.isArray(visitors) || !visitors.length) return null;

  const inactiveStatuses = new Set(["checked_out", "expired", "no_show", "rejected", "cancelled"]);
  const activeVisits = visitors.filter(
    (visitor) => !inactiveStatuses.has(String(visitor?.status || "").toLowerCase()),
  );
  const checkedIn = activeVisits
    .filter((visitor) => String(visitor?.status || "").toLowerCase() === "checked_in")
    .sort((left, right) => getVisitorSubmissionTime(right) - getVisitorSubmissionTime(left));
  if (checkedIn[0]) return checkedIn[0];

  const sortByLatestAppointmentActivity = (left, right) => {
    const submissionDelta = getVisitorSubmissionTime(right) - getVisitorSubmissionTime(left);
    if (submissionDelta !== 0) return submissionDelta;
    return getVisitorScheduleTime(left) - getVisitorScheduleTime(right);
  };

  const todayVisits = activeVisits
    .filter((visitor) => getVisitDateRelation(visitor?.visitDate) === "today")
    .sort(sortByLatestAppointmentActivity);
  if (todayVisits[0]) return todayVisits[0];

  const futureVisits = activeVisits
    .filter((visitor) => getVisitDateRelation(visitor?.visitDate) === "future")
    .sort(sortByLatestAppointmentActivity);
  if (futureVisits[0]) return futureVisits[0];

  return activeVisits.sort(sortByLatestAppointmentActivity)[0] || null;
};

const getVisitorTapPayload = ({ visitor, visitorUser, nfcCardId = "" } = {}) => {
  if (!visitor) return null;

  return {
    _id: visitor._id,
    fullName: visitor.fullName,
    email: visitor.email,
    status: visitor.status,
    appointmentStatus: visitor.appointmentStatus,
    approvalStatus: visitor.approvalStatus,
    visitDate: visitor.visitDate,
    visitTime: visitor.visitTime,
    purposeOfVisit: visitor.purposeOfVisit || visitor.purpose || "",
    purpose: visitor.purposeOfVisit || visitor.purpose || "",
    visitSchedule: formatVisitSchedule(visitor.visitDate, visitor.visitTime),
    currentLocation: visitor.currentLocation,
    assignedOffice: visitor.assignedOffice || "",
    appointmentDepartment: visitor.appointmentDepartment || "",
    host: visitor.assignedStaffName || visitor.host || "",
    safePassId: visitor.safePassId || getUserSafePassId(visitorUser) || "",
    nfcCardId: nfcCardId || getUserPhysicalNfcUid(visitorUser) || visitor.physicalNfcUid || visitor.nfcCardId || "",
    physicalNfcUid: getUserPhysicalNfcUid(visitorUser) || visitor.physicalNfcUid || "",
    phoneNfcUid: getUserPhoneNfcUid(visitorUser) || visitor.phoneNfcUid || "",
    virtualNfcToken: getUserVirtualNfcToken(visitorUser) || visitor.virtualNfcToken || "",
    nfcCredentialType: getNfcCredentialTypeForUser(visitorUser, nfcCardId || visitor.physicalNfcUid || visitor.nfcCardId || ""),
  };
};

const getCampusUserTapPayload = ({ user = {}, nfcCardId = "" } = {}) => ({
  _id: user?._id,
  name: getFullName(user) || user?.email || "Campus user",
  email: user?.email || "",
  role: normalizeUserRoleValue(user?.role),
  safePassId: getUserSafePassId(user),
  nfcCardId: nfcCardId || getUserPhysicalNfcUid(user) || user?.nfcCardId || "",
  physicalNfcUid: getUserPhysicalNfcUid(user),
  phoneNfcUid: getUserPhoneNfcUid(user),
  virtualNfcToken: getUserVirtualNfcToken(user),
  nfcCredentialType: getNfcCredentialTypeForUser(user, nfcCardId || getUserPhysicalNfcUid(user) || user?.nfcCardId || ""),
  department: user?.department || "",
  position: user?.position || "",
  course: user?.course || "",
  yearLevel: user?.yearLevel || "",
  section: user?.section || "",
  studentId: user?.studentId || "",
  teacherId: user?.teacherId || "",
  employeeId: user?.employeeId || "",
  attendanceScope: normalizeUserRoleValue(user?.role) === "student"
    ? "Student attendance with parent notification"
    : "Campus attendance",
});

const getCombinedAppointmentDateTime = (visitDateValue, visitTimeValue) => {
  const visitDate = getAppointmentDateParts(visitDateValue);
  const visitTime = parseAppointmentTimeParts(visitTimeValue);

  if (!visitDate || !visitTime) {
    return null;
  }

  return createAppointmentTimezoneDate({
    year: visitDate.year,
    month: visitDate.month,
    day: visitDate.day,
    hour: visitTime.hour,
    minute: visitTime.minute,
  });
};

const buildVisitorProfilePayload = async (visitorUser) => {
  await ensureSafePassAccountId(visitorUser);
  const visitors = await findVisitorsForUser(visitorUser);
  await Promise.all(visitors.map((visitorRecord) => applyAppointmentLifecycleIfNeeded(visitorRecord)));
  const visitor = getPrioritizedVisitor(visitors);

  if (visitor) {
    if (!visitorUser.visitorId || String(visitorUser.visitorId) !== String(visitor._id)) {
      visitorUser.visitorId = visitor._id;
      await visitorUser.save();
    }

    const visitorPayload = visitor.toObject();
    visitorPayload.safePassId = getUserSafePassId(visitorUser) || visitorPayload.safePassId || "";
    visitorPayload.physicalNfcUid = getUserPhysicalNfcUid(visitorUser) || visitorPayload.physicalNfcUid || "";
    visitorPayload.phoneNfcUid = getUserPhoneNfcUid(visitorUser) || visitorPayload.phoneNfcUid || "";
    visitorPayload.virtualNfcToken = getUserVirtualNfcToken(visitorUser) || visitorPayload.virtualNfcToken || "";
    visitorPayload.nfcCardId = visitorPayload.physicalNfcUid;

    return {
      success: true,
      visitor: visitorPayload,
      appointments: visitors,
      account: getVisitorAccountPayload(visitorUser),
    };
  }

  return {
    success: true,
    visitor: null,
    appointments: [],
    account: getVisitorAccountPayload(visitorUser),
  };
};

const buildLiveVisitorLocationPayload = (visitor = {}) => {
  const currentLocation = visitor.currentLocation || {};
  const expectedDestination =
    visitor.currentDestination?.office ||
    visitor.appointmentDepartment ||
    visitor.assignedOffice ||
    visitor.host ||
    "Campus";
  const coordinates = currentLocation.coordinates || {};
  const lastScanTime =
    currentLocation.lastSeenAt ||
    visitor.checkedInAt ||
    visitor.updatedAt ||
    visitor.registeredAt;
  const statusLabel =
    currentLocation.statusLabel ||
    (String(visitor.status || "").toLowerCase() === "checked_in"
      ? `Inside ${currentLocation.office || visitor.assignedOffice || visitor.host || "campus"}`
      : "Exited");

  return {
    visitorId: visitor._id,
    name: visitor.fullName,
    email: visitor.email,
    phone: visitor.phoneNumber,
    purpose: visitor.purposeOfVisit,
    office: currentLocation.office || visitor.assignedOffice || visitor.host || "Campus",
    currentLocation: currentLocation.office || "",
    lastTappedOffice: currentLocation.office || "",
    expectedDestination,
    currentDestination: visitor.currentDestination || null,
    checkpointId: currentLocation.checkpointId || "",
    floor: currentLocation.floor || "ground",
    coordinates: {
      x: Number.isFinite(Number(coordinates.x)) ? Number(coordinates.x) : null,
      y: Number.isFinite(Number(coordinates.y)) ? Number(coordinates.y) : null,
    },
    lastScanTime,
    status: currentLocation.isActive === false ? "exited" : "inside",
    statusLabel,
    action: currentLocation.action || "",
    source: currentLocation.source || "checkpoint",
    checkedInAt: visitor.checkedInAt,
    movementHistory: visitor.recentMovementHistory || [],
    wrongLocationAlerts: visitor.recentWrongLocationAlerts || [],
  };
};

const getLiveVisitorIdentity = (visitor = {}) => {
  const relatedUserId =
    visitor.relatedUser?._id ||
    visitor.relatedUser ||
    visitor.userId ||
    visitor.accountId ||
    "";
  const candidates = [
    relatedUserId,
    visitor.safePassId,
    visitor.physicalNfcUid,
    visitor.phoneNfcUid,
    visitor.virtualNfcToken,
    visitor.nfcCardId,
    visitor.email,
    visitor._id,
  ];

  return String(candidates.find(Boolean) || "").trim().toLowerCase();
};

const getLiveVisitorTimestamp = (visitor = {}) =>
  new Date(
    visitor.currentLocation?.lastSeenAt ||
      visitor.checkedInAt ||
      visitor.updatedAt ||
      visitor.registeredAt ||
      visitor.createdAt ||
      0,
  ).getTime() || 0;

const buildLivePresencePayload = (attendanceRecord = {}) => {
  const history = Array.isArray(attendanceRecord.checkpointHistory)
    ? attendanceRecord.checkpointHistory
    : [];
  const latestCheckpoint = history.length ? history[history.length - 1] : null;

  return {
    attendanceId: attendanceRecord._id,
    userId: attendanceRecord.userId || null,
    visitorId: attendanceRecord.visitorId || null,
    name: attendanceRecord.name,
    userType: attendanceRecord.userType,
    role: attendanceRecord.role || attendanceRecord.userType,
    module: attendanceRecord.module,
    nfcCardId: attendanceRecord.nfcCardId || "",
    location: attendanceRecord.location || latestCheckpoint?.office || "",
    checkpointId:
      latestCheckpoint?.checkpointId ||
      attendanceRecord.checkpointIn ||
      "",
    checkpointName:
      latestCheckpoint?.checkpointName ||
      latestCheckpoint?.office ||
      attendanceRecord.location ||
      "",
    floor: latestCheckpoint?.floor || "",
    status: attendanceRecord.status,
    checkInTime: attendanceRecord.checkInTime || null,
    lastTapTime: attendanceRecord.lastTapTime || attendanceRecord.checkInTime || null,
    isLate: Boolean(attendanceRecord.isLate),
  };
};

const getActiveLiveVisitors = async (limit = 200) => {
  const activeVisitors = await Visitor.find({
    status: "checked_in",
  })
    .sort({
      "currentLocation.lastSeenAt": -1,
      checkedInAt: -1,
      updatedAt: -1,
      registeredAt: -1,
    })
    .limit(limit)
    .lean();

  const latestByVisitor = new Map();

  activeVisitors.forEach((visitor) => {
    const identity = getLiveVisitorIdentity(visitor);
    if (!identity) {
      return;
    }

    const existingVisitor = latestByVisitor.get(identity);
    if (!existingVisitor || getLiveVisitorTimestamp(visitor) > getLiveVisitorTimestamp(existingVisitor)) {
      latestByVisitor.set(identity, visitor);
    }
  });

  return Array.from(latestByVisitor.values());
};

const getAppointmentSlotWindow = (visitDateValue, visitTimeValue) => {
  const visitDate = getAppointmentDateParts(visitDateValue);
  const visitTime = parseAppointmentTimeParts(visitTimeValue);

  if (!visitDate || !visitTime) {
    return null;
  }

  const dayStart = createAppointmentTimezoneDate({
    year: visitDate.year,
    month: visitDate.month,
    day: visitDate.day,
  });
  const dayEnd = createAppointmentTimezoneDate({
    year: visitDate.year,
    month: visitDate.month,
    day: visitDate.day + 1,
  });
  const slotStart = createAppointmentTimezoneDate({
    year: visitDate.year,
    month: visitDate.month,
    day: visitDate.day,
    hour: visitTime.hour,
    minute: visitTime.minute,
  });

  const slotEnd = new Date(slotStart);
  slotEnd.setMinutes(slotEnd.getMinutes() + 1);

  return { dayStart, dayEnd, slotStart, slotEnd };
};

const getVisitDayWindow = (visitDateValue) => {
  const visitDate = getAppointmentDateParts(visitDateValue);
  if (!visitDate) {
    return null;
  }

  const dayStart = createAppointmentTimezoneDate({
    year: visitDate.year,
    month: visitDate.month,
    day: visitDate.day,
  });
  const dayEnd = createAppointmentTimezoneDate({
    year: visitDate.year,
    month: visitDate.month,
    day: visitDate.day + 1,
  });

  return { dayStart, dayEnd };
};

const getVisitDateRelation = (visitDateValue, nowValue = new Date()) => {
  const visitWindow = getVisitDayWindow(visitDateValue);
  const todayWindow = getVisitDayWindow(nowValue);
  if (!visitWindow || !todayWindow) {
    return "unknown";
  }

  if (visitWindow.dayEnd <= todayWindow.dayStart) return "past";
  if (visitWindow.dayStart >= todayWindow.dayEnd) return "future";
  return "today";
};

const getAppointmentCheckInWindow = (visitor = {}) => {
  const scheduledAt = getCombinedAppointmentDateTime(visitor.visitDate, visitor.visitTime);
  if (!scheduledAt) return null;

  const graceUntil = new Date(scheduledAt);
  graceUntil.setMinutes(graceUntil.getMinutes() + CHECK_IN_GRACE_PERIOD_MINUTES);

  return { scheduledAt, graceUntil };
};

const markPastVisitLifecycleIfNeeded = (visitor) => {
  if (!visitor || visitor.checkedInAt || visitor.checkedOutAt) {
    return false;
  }

  const visitStatus = String(visitor.status || "").toLowerCase();
  const appointmentStatus = String(visitor.appointmentStatus || "").toLowerCase();
  const dateRelation = getVisitDateRelation(visitor.visitDate);

  if (visitStatus === "no_show") {
    const noShowDateRelation = getVisitDateRelation(visitor.noShowMarkedAt || visitor.visitDate);
    if (noShowDateRelation === "past") {
      visitor.markExpired("No-show appointment expired on the next day.");
      return "expired";
    }
    return false;
  }

  if (["expired", "rejected", "cancelled", "checked_out"].includes(visitStatus)) {
    return false;
  }
  if (["rejected", "cancelled"].includes(appointmentStatus)) {
    return false;
  }

  if (visitor.requestCategory === "appointment" && visitor.approvalFlow === "staff") {
    if (["approved", "adjusted"].includes(appointmentStatus)) {
      const checkInWindow = getAppointmentCheckInWindow(visitor);
      if (checkInWindow && new Date() > checkInWindow.graceUntil) {
        visitor.markNoShow(
          `Visitor did not check in within ${CHECK_IN_GRACE_PERIOD_MINUTES} minutes after the scheduled appointment time.`,
        );
        return "no_show";
      }
      return false;
    }

    if (["pending", "rescheduled"].includes(appointmentStatus)) {
      if (dateRelation === "past") {
        visitor.markExpired("Appointment request expired before approval.");
        return "expired";
      }
      return false;
    }
  }

  if (visitor.approvalStatus === "approved") {
    const checkInWindow = getAppointmentCheckInWindow(visitor);
    if (checkInWindow && new Date() > checkInWindow.graceUntil) {
      visitor.markNoShow(
        `Visitor did not check in within ${CHECK_IN_GRACE_PERIOD_MINUTES} minutes after the scheduled visit time.`,
      );
      return "no_show";
    }
    return false;
  }

  if (visitor.approvalStatus === "pending") {
    if (dateRelation === "past") {
      visitor.markExpired("Visit request expired before approval.");
      return "expired";
    }
    return false;
  }

  return false;
};

const notifyAppointmentLifecycleChange = async (visitor, lifecycleStatus) => {
  if (!visitor || !lifecycleStatus) return;

  const visitorUser = visitor.email
    ? await User.findOne({ email: String(visitor.email).trim().toLowerCase(), role: "visitor" })
    : null;
  const assignedStaffUser = visitor.assignedStaff
    ? await User.findById(visitor.assignedStaff)
    : null;
  const schedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);

  if (lifecycleStatus === "no_show") {
    const message = `${visitor.fullName} did not check in for the appointment on ${schedule} within the ${CHECK_IN_GRACE_PERIOD_MINUTES}-minute grace period.`;
    await Promise.all([
      createRoleNotification({
        title: "Appointment Marked No-Show",
        message: "You missed your appointment check-in window. Please request a new appointment if you still need to visit.",
        type: "warning",
        severity: "medium",
        targetRole: "visitor",
        targetUser: visitorUser?._id || null,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: { activityType: "appointment_no_show", visitDate: visitor.visitDate, visitTime: visitor.visitTime },
      }),
      createRoleNotification({
        title: "Appointment No-Show",
        message,
        type: "warning",
        severity: "medium",
        targetRole: "admin",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: { activityType: "appointment_no_show", visitDate: visitor.visitDate, visitTime: visitor.visitTime },
      }),
      assignedStaffUser
        ? createRoleNotification({
            title: "Appointment No-Show",
            message,
            type: "warning",
            severity: "medium",
            targetRole: "staff",
            targetUser: assignedStaffUser._id,
            relatedVisitor: visitor._id,
            relatedUser: visitorUser?._id || null,
            metadata: { activityType: "appointment_no_show", visitDate: visitor.visitDate, visitTime: visitor.visitTime },
          })
        : Promise.resolve(),
    ]);

    await createSystemActivity({
      actorUser: null,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "appointment_no_show",
      status: "no_show",
      location: getAssignedAppointmentOffice(visitor) || "Appointment",
      notes: message,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        graceMinutes: CHECK_IN_GRACE_PERIOD_MINUTES,
      },
    });
    return;
  }

  if (lifecycleStatus === "expired") {
    const message = `${visitor.fullName}'s appointment for ${schedule} is now expired.`;
    await createRoleNotification({
      title: "Appointment Expired",
      message: "Your missed or pending appointment has expired. Please request a new appointment if needed.",
      type: "info",
      severity: "low",
      targetRole: "visitor",
      targetUser: visitorUser?._id || null,
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: { activityType: "appointment_expired", visitDate: visitor.visitDate, visitTime: visitor.visitTime },
    });

    await createSystemActivity({
      actorUser: null,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "appointment_expired",
      status: "expired",
      location: getAssignedAppointmentOffice(visitor) || "Appointment",
      notes: message,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });
  }
};

const applyAppointmentLifecycleIfNeeded = async (visitor) => {
  const lifecycleStatus = markPastVisitLifecycleIfNeeded(visitor);
  if (!lifecycleStatus) return false;

  await visitor.save();
  await notifyAppointmentLifecycleChange(visitor, lifecycleStatus);
  return lifecycleStatus;
};

const runAppointmentLifecycleSweep = async () => {
  try {
    if (mongoose.connection.readyState !== 1) return;

    const candidates = await Visitor.find({
      checkedInAt: null,
      checkedOutAt: null,
      $or: [
        { status: "no_show" },
        {
          requestCategory: "appointment",
          approvalFlow: "staff",
          appointmentStatus: { $in: ["pending", "approved", "adjusted", "rescheduled"] },
          status: { $nin: ["checked_in", "checked_out", "expired", "cancelled", "rejected"] },
        },
        {
          approvalStatus: { $in: ["pending", "approved"] },
          status: { $nin: ["checked_in", "checked_out", "expired", "cancelled", "rejected"] },
        },
      ],
    })
      .sort({ visitDate: 1 })
      .limit(300);

    await Promise.all(candidates.map((visitorRecord) => applyAppointmentLifecycleIfNeeded(visitorRecord)));
  } catch (error) {
    console.error("Appointment lifecycle sweep error:", error);
  }
};

if (process.env.NODE_ENV !== "test") {
  const appointmentLifecycleTimeout = setTimeout(runAppointmentLifecycleSweep, 30 * 1000);
  const appointmentLifecycleInterval = setInterval(runAppointmentLifecycleSweep, 5 * 60 * 1000);

  appointmentLifecycleTimeout.unref?.();
  appointmentLifecycleInterval.unref?.();
}

const getVisitorCheckInEligibility = (visitor) => {
  if (!visitor) {
    return { allowed: false, statusCode: 404, message: "Visitor not found" };
  }

  if (visitor.status === "checked_in") {
    return { allowed: false, statusCode: 400, message: "Visitor is already checked in." };
  }

  if (visitor.status === "checked_out" || visitor.checkedOutAt) {
    return { allowed: false, statusCode: 400, message: "This visit has already been completed." };
  }

  if (visitor.status === "no_show" || visitor.noShowMarkedAt) {
    return {
      allowed: false,
      statusCode: 400,
      message: "This appointment date has passed and was marked as no-show. Please request a new appointment.",
    };
  }

  if (visitor.status === "expired" || visitor.visitExpiredAt) {
    return {
      allowed: false,
      statusCode: 400,
      message: "This appointment has expired. Please request a new appointment.",
    };
  }

  if (!visitor.hasApprovedVisitWindow()) {
    return { allowed: false, statusCode: 400, message: "Your visit is still waiting for approval." };
  }

  const checkInWindow = getAppointmentCheckInWindow(visitor);
  if (!checkInWindow) {
    return { allowed: false, statusCode: 400, message: "This appointment has an invalid schedule." };
  }

  const dateRelation = getVisitDateRelation(visitor.visitDate);
  if (dateRelation === "past") {
    return {
      allowed: false,
      statusCode: 400,
      message: "This appointment date has passed. Please request a new appointment.",
    };
  }

  if (dateRelation === "future") {
    return {
      allowed: false,
      statusCode: 400,
      message: "Check-in is only available on your appointment date.",
    };
  }

  const timingState = getAppointmentTimingState(visitor);
  if (timingState.beforeSchedule && timingState.inEarlyLobbyWindow) {
    return {
      allowed: true,
      earlyArrival: true,
      lobbyOnly: true,
      message: `Early arrival accepted. Please wait in the lobby until your scheduled appointment time: ${formatVisitSchedule(visitor.visitDate, visitor.visitTime)}.`,
    };
  }

  if (timingState.beforeSchedule) {
    const scheduleLabel = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
    return {
      allowed: false,
      statusCode: 400,
      message: `You may check in up to ${EARLY_LOBBY_CHECK_IN_MINUTES} minutes early and wait in the lobby. Your scheduled appointment is ${scheduleLabel}.`,
    };
  }

  if (timingState.afterGrace) {
    return {
      allowed: false,
      statusCode: 400,
      message: `The ${CHECK_IN_GRACE_PERIOD_MINUTES}-minute check-in grace period has passed. This appointment is marked as no-show.`,
    };
  }

  return { allowed: true };
};

const isAppointmentServiceDay = (dateValue) => {
  const dayOfWeek = getAppointmentDayOfWeek(dateValue);
  return dayOfWeek !== null && dayOfWeek !== 0;
};

const countStaffAppointmentsForSlot = async ({
  assignedStaff,
  visitDate,
  visitTime,
  excludeVisitorId = null,
}) => {
  const slot = getAppointmentSlotWindow(visitDate, visitTime);
  if (!slot) return 0;

  const query = {
    requestCategory: "appointment",
    approvalFlow: "staff",
    appointmentStatus: { $in: APPOINTMENT_SLOT_STATUSES },
    assignedStaff,
    visitDate: { $gte: slot.dayStart, $lt: slot.dayEnd },
    visitTime: { $gte: slot.slotStart, $lt: slot.slotEnd },
  };

  if (excludeVisitorId) {
    query._id = { $ne: excludeVisitorId };
  }

  return Visitor.countDocuments(query);
};

const findActiveStaffForDepartment = (departmentLabel = "", staffId = null) =>
  User.findOne({
    ...(staffId ? { _id: staffId } : {}),
    role: "staff",
    isActive: true,
    status: "active",
    department: getStaffDepartmentQuery(departmentLabel),
  }).sort({ lastLogin: -1, createdAt: 1 });

const getStaffDepartmentQuery = (department = "") => {
  const normalizedDepartment = normalizeDepartmentValue(department);
  const aliasGroups = {
    registrar: ["Registrar", "Registrar's Office"],
    "registrar's office": ["Registrar", "Registrar's Office"],
    accounting: ["Accounting", "Accounting Office", "Finance", "Finance Office", "Cashier"],
    "accounting office": ["Accounting", "Accounting Office", "Finance", "Finance Office", "Cashier"],
    cashier: ["Cashier", "Accounting", "Accounting Office", "Finance", "Finance Office"],
    guidance: ["Guidance", "Guidance Office", "Student Services"],
    "guidance office": ["Guidance", "Guidance Office", "Student Services"],
    administration: ["Administration", "Administration Office", "Admissions", "Admissions Office"],
    "administration office": ["Administration", "Administration Office", "Admissions", "Admissions Office"],
    admissions: ["Admissions", "Admissions Office", "Administration", "Administration Office"],
    "information desk": ["Information Desk", "Lobby", "Front Desk", "Entrance / Lobby"],
    lobby: ["Information Desk", "Lobby", "Front Desk", "Entrance / Lobby"],
    "front desk": ["Information Desk", "Lobby", "Front Desk", "Entrance / Lobby"],
    "flight operations": ["Flight Operations"],
    training: ["Training", "Head of Training Room", "Head Of Training Room"],
    "head of training room": ["Training", "Head of Training Room", "Head Of Training Room"],
    "i.t room": ["I.T Room", "IT Room", "Information Technology"],
    "it room": ["I.T Room", "IT Room", "Information Technology"],
    "faculty room": ["Faculty Room", "Academic Department", "Academics"],
    "academy director": ["Academy Director", "Administration", "Administration Office"],
    chairman: ["Chairman", "Administration", "Administration Office"],
    clinic: ["Clinic", "Student Services", "Guidance"],
    "conference room": ["Conference Room", "Administration", "Administration Office"],
    "file room": ["File Room", "Registrar", "Registrar's Office", "Administration"],
    storage: ["Storage", "Administration", "Administration Office"],
    laboratory: ["Laboratory", "Academic Department", "Academics"],
    tesda: ["TESDA"],
    workshop: ["Workshop", "Tools Room", "Academic Department", "Academics"],
    "tools room": ["Tools Room", "Workshop", "Academic Department", "Academics"],
    library: ["Library", "Student Services", "Academic Department", "Academics"],
    "student services": ["Student Services", "Students Lounge"],
    "students lounge": ["Students Lounge", "Student Services"],
    sto: ["STO"],
    "mock up": ["Mock Up", "Training", "Academic Department", "Academics"],
    "classroom 1": ["Classroom 1", "Faculty Room", "Academic Department", "Academics"],
    "classroom 2": ["Classroom 2", "Faculty Room", "Academic Department", "Academics"],
    "classroom 3": ["Classroom 3", "Faculty Room", "Academic Department", "Academics"],
    "classroom 4": ["Classroom 4", "Faculty Room", "Academic Department", "Academics"],
    "classroom 5": ["Classroom 5", "Faculty Room", "Academic Department", "Academics"],
    "classroom 6": ["Classroom 6", "Faculty Room", "Academic Department", "Academics"],
    "classroom 7": ["Classroom 7", "Faculty Room", "Academic Department", "Academics"],
    "classroom 8": ["Classroom 8", "Faculty Room", "Academic Department", "Academics"],
  };

  const labels = aliasGroups[normalizedDepartment] || [department];
  return { $in: labels.map((label) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) };
};

const isStaffAllowedForAppointment = (staffUser = {}, visitor = {}) => {
  if (String(staffUser.role).toLowerCase() === "admin") return true;

  const staffDepartment = normalizeDepartmentValue(staffUser.department);
  const appointmentDepartment = normalizeDepartmentValue(
    visitor.appointmentDepartment || visitor.assignedOffice || visitor.host,
  );

  return Boolean(staffDepartment && appointmentDepartment && staffDepartment === appointmentDepartment);
};

app.post("/api/register", async (req, res) => {
  console.log("Registration attempt received.");

  try {
    const {
      firstName,
      lastName,
      username,
      email,
      password,
      phone,
      role,
      visitorId,
      status,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !phone) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["firstName", "lastName", "email", "password", "phone"],
      });
    }

    const normalizedEmail = normalizeEmailValue(email);
    const normalizedUsername = normalizeUsernameValue(username);

    if (!isValidEmailValue(normalizedEmail)) {
      return res.status(400).json({
        error: "Invalid email format",
        field: "email",
      });
    }

    const normalizedPhone = normalizePhoneValue(phone);
    if (!isValidPhoneValue(normalizedPhone)) {
      return res.status(400).json({
        error: PHONE_VALIDATION_MESSAGE,
        field: "phone",
      });
    }

    // Check if user already exists
    const duplicateChecks = [{ email: normalizedEmail }];
    if (normalizedUsername) {
      duplicateChecks.push({ username: normalizedUsername });
    }

    const existingUser = await User.findOne({ $or: duplicateChecks });
    if (existingUser) {
      const duplicateField =
        existingUser.email === normalizedEmail
          ? "email"
          : existingUser.username === normalizedUsername
            ? "username"
            : "email";

      return res.status(400).json({
        error: duplicateField === "username" ? "Username already registered" : "Email already registered",
        field: duplicateField,
      });
    }

    const normalizedRole = normalizeUserRoleValue(role || "visitor");
    const allowedRegistrationRoles = new Set(["visitor"]);

    if (!allowedRegistrationRoles.has(normalizedRole)) {
      return res.status(400).json({
        error: "Only visitor self-registration is available. Student, staff, and security accounts must be created by an administrator.",
        field: "role",
      });
    }

    let nfcCardId = null;
    if (normalizedRole !== "visitor" || (normalizedRole === "visitor" && status === "active")) {
      const timestamp = Date.now();
      const randomString = Math.random()
        .toString(36)
        .substr(2, 6)
        .toUpperCase();
      nfcCardId = `SAFEPASS-${timestamp}-${randomString}`;
    }

    let employeeId = req.body.employeeId
      ? String(req.body.employeeId).trim()
      : undefined;
    if (!employeeId && ["staff", "guard", "security", "teacher"].includes(normalizedRole)) {
      employeeId = await generateUniqueEmployeeId(normalizedRole);
    }

    let studentId = req.body.studentId ? String(req.body.studentId).trim() : undefined;
    if (!studentId && normalizedRole === "student") {
      studentId = await generateUniqueAcademicId({ role: "student", fieldName: "studentId" });
    }

    let teacherId = req.body.teacherId ? String(req.body.teacherId).trim() : undefined;
    if (!teacherId && normalizedRole === "teacher") {
      teacherId = await generateUniqueAcademicId({ role: "teacher", fieldName: "teacherId" });
    }

    const normalizedParentEmail = normalizeEmailValue(req.body.parentEmail || req.body.guardianEmail || "");
    if (normalizedParentEmail && !isValidEmailValue(normalizedParentEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid parent email address.",
        field: "parentEmail",
      });
    }

const userData = {
  firstName,
  lastName,
  username: normalizedUsername || undefined,
  email: normalizedEmail,
  password,
  phone: normalizedPhone,
  parentName: String(req.body.parentName || req.body.guardianName || "").trim(),
  parentEmail: normalizedParentEmail,
  guardianName: String(req.body.guardianName || req.body.parentName || "").trim(),
  guardianEmail: normalizedParentEmail,
  role: normalizedRole,
  nfcCardId,
  employeeId: employeeId || undefined,
  studentId: studentId || undefined,
  teacherId: teacherId || undefined,
  course: String(req.body.course || "").trim(),
  yearLevel: String(req.body.yearLevel || "").trim(),
  section: String(req.body.section || "").trim(),
  scheduleProfile: {
    startTime: String(req.body?.scheduleProfile?.startTime || req.body.startTime || "").trim(),
    endTime: String(req.body?.scheduleProfile?.endTime || req.body.endTime || "").trim(),
    graceMinutes: Number(req.body?.scheduleProfile?.graceMinutes ?? req.body.graceMinutes ?? 10),
  },
  department: req.body.department || '',
  position: req.body.position || '',     
  status: status || (normalizedRole === 'visitor' ? 'pending' : 'active'),
  visitorId: visitorId || null,
};

    const user = new User(userData);
    await user.save();
    console.log("âœ… User created:", user.email, "Status:", user.status);

    // Generate token (only if user is active)
    let token = null;
    if (user.status === "active") {
      token = generateToken(user._id);

      // Send welcome email with credentials
      sendEmail(
        user.email,
        `Welcome to Sapphire Aviation - Your ${user.role.toUpperCase()} Account`,
        `Dear ${user.firstName} ${user.lastName},\n\n` +
          `Your account has been created successfully!\n\n` +
          `Account details:\n` +
          `Email: ${user.email}\n` +
          `Role: ${user.role.toUpperCase()}\n` +
          `Employee ID: ${user.employeeId || "N/A"}\n\n` +
          `Please sign in using the password you created. If you need a new password, use the password reset option on the login screen.\n\n` +
          getSupportEmailSignature(),
      );
      console.log(`ðŸ“§ Welcome email sent to: ${user.email}`);
    }

    // Create initial access log
    const accessLog = new AccessLog({
      userId: user._id,
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`,
      location: "Registration System",
      accessType: "system",
      status: user.status === "active" ? "granted" : "pending",
      nfcCardId: user.nfcCardId,
      notes:
        user.status === "active"
          ? "Account created and NFC card issued"
          : "Account created pending approval",
    });
    await accessLog.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message:
        user.status === "active"
          ? "Registration successful"
          : "Registration submitted. Pending admin approval.",
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error("âŒ Registration error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        error: "Duplicate field value entered",
        field: Object.keys(error.keyPattern)[0],
      });
    }

    if (error.name === "ValidationError") {
      const errors = {};
      Object.keys(error.errors).forEach((key) => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({ error: "Validation failed", errors });
    }

    res.status(500).json({
      error: "Registration failed",
      message: error.message,
    });
  }
});

// Get visitor profile for logged-in visitor
app.get("/api/visitor/profile", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "visitor") {
      return res.json(await buildVisitorProfilePayload(req.user));
    }

    res.status(404).json({
      success: false,
      message: "Visitor profile not found",
    });
  } catch (error) {
    console.error("Get visitor profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get visitor profile",
    });
  }
});

app.post("/api/visitor/virtual-nfc-token", authMiddleware, async (req, res) => {
  try {
    if (normalizeUserRoleValue(req.user.role) !== "visitor") {
      return res.status(403).json({
        success: false,
        message: "Only visitor accounts can use a virtual NFC card.",
      });
    }

    const visitor = await findVisitorForUser(req.user);
    const token = await ensureVirtualNfcTokenForVisitor(req.user, visitor);

    res.json({
      success: true,
      virtualNfcToken: token,
      visitorId: visitor?._id || null,
    });
  } catch (error) {
    console.error("Ensure virtual NFC token error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to prepare virtual NFC card.",
    });
  }
});

// 2. LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const loginIdentifier = String(email || "").toLowerCase().trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }

    const loginRateLimit = authAttemptLimiter.hit({
      req,
      identifier: loginIdentifier,
    });
    if (!loginRateLimit.allowed) {
      return applyRateLimit(
        res,
        loginRateLimit,
        "Too many login attempts. Please wait a few minutes before trying again.",
      );
    }

    // Visitors can sign in using either their username or email address.
    const user = await User.findOne({
      $or: [{ email: loginIdentifier }, { username: loginIdentifier }],
    });
    if (!user) {
      return res.status(401).json({ error: GENERIC_AUTH_ERROR_MESSAGE });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: GENERIC_AUTH_ERROR_MESSAGE });
    }

    const normalizedLoginRole = normalizeUserRoleValue(user.role);
    if (
      ["student", "teacher"].includes(normalizedLoginRole) &&
      (user.status === "inactive" || user.isActive === false)
    ) {
      user.status = "active";
      user.isActive = true;
      user.isVerified = true;
      clearPasswordResetState(user);
    }

    // Only disclose account state after the password is valid.
    if (user.status === "inactive" || user.status === "suspended") {
      const isActivationPending = ["visitor", "staff", "security", "guard", "student", "teacher"].includes(String(user.role || "").toLowerCase()) &&
        user.passwordResetTokenHash &&
        user.passwordResetExpiresAt &&
        user.passwordResetExpiresAt > new Date();
      return res.status(401).json({
        error: isActivationPending
          ? "Account activation required. Please open the setup link sent to your email."
          : "Account is deactivated",
      });
    }

    if (user.role === "visitor" && user.isVerified === false) {
      return res.status(403).json({
        success: false,
        error: "Your account is not yet verified",
        message: "Please verify your email to continue.",
        requiresOtpVerification: true,
      });
    }

    await ensureSafePassAccountId(user);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Create access log
    const accessLog = new AccessLog({
      userId: user._id,
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`,
      location: "Mobile App",
      accessType: "system",
      status: user.status === "pending" ? "pending" : "granted",
      nfcCardId: user.nfcCardId,
      notes:
        user.status === "pending"
          ? "Pending visitor logged in and is waiting for admin approval"
          : "User logged in via mobile app",
    });
    await accessLog.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log(`Login successful for ${user.email}.`);

    await createSystemActivity({
      actorUser: user,
      relatedUser: user,
      activityType: "user_login",
      status: user.status === "pending" ? "pending" : "granted",
      location: "Mobile App",
      notes: `${user.firstName} ${user.lastName} logged in as ${user.role}.`,
      metadata: {
        role: user.role,
        email: user.email,
      },
    });

    res.json({
      success: true,
      message:
        user.status === "pending"
          ? "Login successful. Account is waiting for admin approval."
          : "Login successful",
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed",
      message: error.message,
    });
  }
});

// 3. GET PROFILE (Protected)
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error("âŒ Profile fetch error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// 4. UPDATE PROFILE (Protected)
app.put("/api/profile", authMiddleware, async (req, res) => {
  try {
    const existingUser = await User.findById(req.user._id);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const body = req.body || {};
    const updates = {};

    if (body.firstName !== undefined) updates.firstName = String(body.firstName || "").trim();
    if (body.lastName !== undefined) updates.lastName = String(body.lastName || "").trim();
    if (body.phone !== undefined) updates.phone = String(body.phone || "").trim();
    if (body.emergencyContact !== undefined) {
      updates.emergencyContact = String(body.emergencyContact || "").trim();
    }
    if (body.profilePhoto !== undefined) updates.profilePhoto = body.profilePhoto || null;

    if (body.email !== undefined) {
      const normalizedEmail = normalizeEmailValue(body.email);
      if (!normalizedEmail || !isValidEmailValue(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address.",
        });
      }

      const duplicateEmail = await User.findOne({
        _id: { $ne: existingUser._id },
        email: normalizedEmail,
      });

      if (duplicateEmail) {
        return res.status(409).json({
          success: false,
          message: "That email address is already used by another account.",
        });
      }

      updates.email = normalizedEmail;
    }

    if (body.username !== undefined) {
      const normalizedUsername = normalizeUsernameValue(body.username);
      if (!normalizedUsername) {
        return res.status(400).json({
          success: false,
          message: "Username cannot be empty.",
        });
      }

      const duplicateUsername = await User.findOne({
        _id: { $ne: existingUser._id },
        username: normalizedUsername,
      });

      if (duplicateUsername) {
        return res.status(409).json({
          success: false,
          message: "That username is already used by another account.",
        });
      }

      updates.username = normalizedUsername;
    }

    if (updates.firstName !== undefined && !updates.firstName) {
      return res.status(400).json({ success: false, message: "First name is required." });
    }

    if (updates.lastName !== undefined && !updates.lastName) {
      return res.status(400).json({ success: false, message: "Last name is required." });
    }

    const user = await User.findByIdAndUpdate(
      existingUser._id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true },
    ).select("-password");

    // Keep every appointment record linked to the visitor account. Updating only
    // the newest Visitor document could orphan older requests after an email edit.
    if (user?.role === "visitor") {
      await syncVisitorRecordsForUserUpdate(existingUser, user);
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("âŒ Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// 4b. CHANGE PASSWORD (Protected)
app.put("/api/auth/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Current and new passwords are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res
        .status(400)
        .json({ success: false, message: "Current password is incorrect" });
    }

    user.password = newPassword;
    user.updatedAt = new Date();
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, message: "Failed to change password" });
  }
});

// 5. CHECK EMAIL EXISTS
app.post("/api/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    res.json({
      success: true,
      message: "Use registration or password reset to continue.",
    });
  } catch (error) {
    console.error("âŒ Check email error:", error);
    res.status(500).json({ error: "Failed to check email" });
  }
});

app.post("/api/auth/request-password-reset", async (req, res) => {
  try {
    const email = normalizeEmailValue(req.body?.email);

    if (!email || !isValidEmailValue(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const resetRateLimit = passwordResetRequestLimiter.hit({
      req,
      identifier: email,
    });
    if (!resetRateLimit.allowed) {
      return applyRateLimit(
        res,
        resetRateLimit,
        "Too many password reset requests. Please wait a few minutes before trying again.",
      );
    }

    const user = await User.findOne({ email });
    if (user) {
      const otp = await createPasswordResetOtp(req, user);
      if (!otp.emailResult?.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to send password reset code.",
        });
      }
      user.updatedAt = new Date();
      await user.save();

      return res.json({
        success: true,
        message: GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
        expiresIn: 600,
        otpExpiresAt: otp.expiresAt,
      });
    }

    const fallbackExpiry = new Date(Date.now() + 1000 * 60 * 10);

    res.json({
      success: true,
      message: GENERIC_PASSWORD_RESET_REQUEST_MESSAGE,
      expiresIn: 600,
      otpExpiresAt: fallbackExpiry,
    });
  } catch (error) {
    console.error("Request password reset error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send password reset code.",
    });
  }
});

app.post("/api/auth/verify-password-reset", async (req, res) => {
  try {
    const email = normalizeEmailValue(req.body?.email);
    const otpCode = normalizeOtpCode(req.body?.otpCode);

    if (!email || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP code are required.",
      });
    }

    if (!/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({
        success: false,
        message: "OTP code must be exactly 6 digits.",
      });
    }

    const resetVerifyRateLimit = passwordResetVerifyLimiter.hit({
      req,
      identifier: email,
    });
    if (!resetVerifyRateLimit.allowed) {
      return applyRateLimit(
        res,
        resetVerifyRateLimit,
        "Too many verification attempts. Please request a new reset code and try again later.",
      );
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: GENERIC_PASSWORD_RESET_VERIFY_MESSAGE,
      });
    }

    if (
      !user.passwordResetOtpHash ||
      !user.passwordResetExpiresAt
    ) {
      return res.status(400).json({
        success: false,
        message: GENERIC_PASSWORD_RESET_VERIFY_MESSAGE,
      });
    }

    if (user.passwordResetExpiresAt <= new Date()) {
      clearPasswordResetState(user);
      await user.save();
      return res.status(400).json({
        success: false,
        message: GENERIC_PASSWORD_RESET_VERIFY_MESSAGE,
      });
    }

    if ((user.passwordResetAttempts || 0) >= 5) {
      clearPasswordResetState(user);
      await user.save();
      return res.status(400).json({
        success: false,
        message: GENERIC_PASSWORD_RESET_VERIFY_MESSAGE,
      });
    }

    const otpHash = crypto.createHash("sha256").update(otpCode).digest("hex");
    if (otpHash !== user.passwordResetOtpHash) {
      user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({
        success: false,
        message: GENERIC_PASSWORD_RESET_VERIFY_MESSAGE,
      });
    }

    user.passwordResetAttempts = 0;
    user.passwordResetVerifiedAt = new Date();
    await user.save();

    res.json({
      success: true,
      verified: true,
      message: "Password reset code verified successfully.",
    });
  } catch (error) {
    console.error("Verify password reset error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify password reset code.",
    });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const email = normalizeEmailValue(req.body?.email);
    const newPassword = String(req.body?.newPassword || "");
    const resetToken = String(req.body?.resetToken || "").trim();

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    const resetChangeRateLimit = passwordResetChangeLimiter.hit({
      req,
      identifier: email,
    });
    if (!resetChangeRateLimit.allowed) {
      return applyRateLimit(
        res,
        resetChangeRateLimit,
        "Too many password reset attempts. Please wait a few minutes before trying again.",
      );
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Please verify the reset code before changing your password.",
      });
    }

    if (!user.passwordResetExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "No verified password reset request was found.",
      });
    }

    if (user.passwordResetExpiresAt <= new Date()) {
      clearPasswordResetState(user);
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Reset session expired. Please request a new code.",
      });
    }

    const resetTokenHash = resetToken
      ? crypto.createHash("sha256").update(resetToken).digest("hex")
      : "";
    const hasValidResetToken =
      resetTokenHash &&
      user.passwordResetTokenHash &&
      resetTokenHash === user.passwordResetTokenHash;

    if (!user.passwordResetVerifiedAt && !hasValidResetToken) {
      return res.status(400).json({
        success: false,
        message: "Please verify the reset code or use the secure reset link before changing your password.",
      });
    }

    user.password = newPassword;
    if (
      hasValidResetToken &&
      ["staff", "security", "guard", "student", "teacher"].includes(String(user.role || "").toLowerCase()) &&
      (user.status === "inactive" || user.isActive === false)
    ) {
      user.status = "active";
      user.isActive = true;
      user.isVerified = true;
      user.verifiedAt = new Date();
    }
    clearPasswordResetState(user);
    user.updatedAt = new Date();
    await user.save();

    await createSystemActivity({
      actorUser: user,
      relatedUser: user,
      activityType: "password_reset",
      status: "granted",
      location: "Login Screen",
      notes: `${user.email} completed a password reset via forgot password.`,
    });

    res.json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password.",
    });
  }
});

app.get("/api/auth/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();

    if (!token) {
      return res.status(400).send("Missing verification token.");
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      verificationTokenHash: tokenHash,
      verificationExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).send(
        "This verification request is invalid or expired. Please request a new OTP code.",
      );
    }

    user.isVerified = true;
    user.verifiedAt = new Date();
    user.verificationTokenHash = "";
    user.verificationExpiresAt = null;
    if (user.status === "pending") {
      user.status = "active";
    }
    await user.save();

    console.log(`Email verified for ${user.email}`);

    res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Email Verified</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f3f7f5; color: #0f172a; padding: 40px; }
            .card { max-width: 520px; margin: 8vh auto; background: white; border-radius: 18px; padding: 32px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12); }
            h1 { color: #047857; margin-top: 0; }
            a { display: inline-block; margin-top: 18px; background: #047857; color: white; padding: 12px 18px; border-radius: 10px; text-decoration: none; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Email verified</h1>
            <p>Your Sapphire SafePass account has been verified. You can now return to the app and log in.</p>
            <a href="${FRONTEND_URL}">Go to SafePass</a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).send("Failed to verify email.");
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Missing verification token.",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      verificationTokenHash: tokenHash,
      verificationExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "This verification request is invalid or expired. Please request a new OTP code.",
      });
    }

    user.isVerified = true;
    user.verifiedAt = new Date();
    user.verificationTokenHash = "";
    user.verificationExpiresAt = null;
    if (user.status === "pending") {
      user.status = "active";
    }
    await user.save();

    console.log(`Email verified for ${user.email}`);

    return res.json({
      success: true,
      message: "Email verified. You can now log in.",
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Verify email API error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify email.",
    });
  }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const email = normalizeEmailValue(req.body?.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const user = await User.findOne({ email, role: "visitor" });

    if (!user) {
      return res.json({
        success: true,
        message: "A verification OTP has been sent if the account is eligible.",
      });
    }

    if (user.isVerified) {
      return res.json({
        success: true,
        message: "This account is already verified.",
      });
    }

    const otp = await createRegistrationOtp(user);
    if (!isOtpDeliveryUsable(otp.emailResult)) {
      return res.status(500).json({
        success: false,
        message: "Failed to resend verification OTP.",
      });
    }
    await user.save();

    res.json({
      success: true,
      message:
        "A verification OTP has been sent if the account is eligible.",
      requiresOtpVerification: true,
      otpExpiresAt: otp.expiresAt,
      otpDeliveryMode: getOtpDeliveryMode(otp.emailResult),
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend verification OTP.",
    });
  }
});

app.post("/api/auth/verify-registration-otp", async (req, res) => {
  try {
    const email = normalizeEmailValue(req.body?.email);
    const otpCode = normalizeOtpCode(req.body?.otpCode);

    if (!email || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP code are required.",
      });
    }

    if (!/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({
        success: false,
        message: "Please enter the 6-digit OTP code.",
      });
    }

    const registrationVerifyRateLimit = registrationOtpVerifyLimiter.hit({
      req,
      identifier: email,
    });
    if (!registrationVerifyRateLimit.allowed) {
      return applyRateLimit(
        res,
        registrationVerifyRateLimit,
        "Too many OTP verification attempts. Please request a new code and try again later.",
      );
    }

    const user = await User.findOne({ email, role: "visitor" });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP code. Please request a new code and try again.",
      });
    }

    if (user.isVerified) {
      return res.json({
        success: true,
        verified: true,
        message: "This account is already verified.",
      });
    }

    if (!user.verificationOtpHash || !user.verificationOtpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "No OTP verification code was found. Please request a new code.",
      });
    }

    if (new Date(user.verificationOtpExpiresAt).getTime() < Date.now()) {
      user.verificationOtpHash = "";
      user.verificationOtpExpiresAt = null;
      user.verificationOtpAttempts = 0;
      await user.save();

      return res.status(400).json({
        success: false,
        message: "OTP code has expired. Please request a new code.",
      });
    }

    if ((user.verificationOtpAttempts || 0) >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect OTP attempts. Please request a new code.",
      });
    }

    const otpHash = crypto.createHash("sha256").update(otpCode).digest("hex");
    if (otpHash !== user.verificationOtpHash) {
      user.verificationOtpAttempts = (user.verificationOtpAttempts || 0) + 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: `Invalid OTP code. ${Math.max(0, 5 - user.verificationOtpAttempts)} attempts remaining.`,
      });
    }

    user.isVerified = true;
    user.verifiedAt = new Date();
    user.verificationOtpHash = "";
    user.verificationOtpExpiresAt = null;
    user.verificationOtpAttempts = 0;
    user.verificationTokenHash = "";
    user.verificationExpiresAt = null;
    if (user.status === "pending") {
      user.status = "active";
    }
    await user.save();

    await createRoleNotification({
      title: "Visitor Account Verified",
      message: `${getFullName(user)} verified their visitor account using OTP.`,
      targetRole: "admin",
      relatedUser: user._id,
      type: "visitor",
      severity: "low",
      metadata: {
        activityType: "visitor_account_otp_verified",
        email: user.email,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      verified: true,
      message: "OTP verified. You can now log in.",
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Verify registration OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP.",
    });
  }
});

app.post("/api/auth/resend-registration-otp", async (req, res) => {
  try {
    const email = normalizeEmailValue(req.body?.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const registrationRequestRateLimit = registrationOtpRequestLimiter.hit({
      req,
      identifier: email,
    });
    if (!registrationRequestRateLimit.allowed) {
      return applyRateLimit(
        res,
        registrationRequestRateLimit,
        "Too many OTP requests. Please wait a few minutes before requesting a new code.",
      );
    }

    const user = await User.findOne({ email, role: "visitor" });
    if (!user) {
      return res.json({
        success: true,
        message: "A new OTP code has been sent if the account is eligible.",
        otpExpiresAt: new Date(Date.now() + 1000 * 60 * 10),
      });
    }

    if (user.isVerified) {
      return res.json({
        success: true,
        verified: true,
        message: "This account is already verified.",
      });
    }

    const otp = await createRegistrationOtp(user);
    if (!isOtpDeliveryUsable(otp.emailResult)) {
      return res.status(500).json({
        success: false,
        message: "Failed to send verification OTP. Please try again.",
      });
    }
    await user.save();

    res.json({
      success: true,
      message: "A new OTP code has been sent if the account is eligible.",
      otpExpiresAt: otp.expiresAt,
      otpDeliveryMode: getOtpDeliveryMode(otp.emailResult),
    });
  } catch (error) {
    console.error("Resend registration OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP.",
    });
  }
});

// ============ VISITOR REGISTRATION ROUTES ============

// Register a new visitor (Complete version with UNIQUE NFC ID for pending visitors)
app.post("/api/visitors/register", async (req, res) => {
  try {
    const visitorData = req.body || {};
    const normalizedFullName = String(visitorData.fullName || "").trim();
    const normalizedEmail = normalizeEmailValue(visitorData.email);
    const normalizedUsername = normalizeUsernameValue(visitorData.username);
    const normalizedPhone = normalizePhoneValue(visitorData.phone || visitorData.phoneNumber);
    const password = String(visitorData.password || "");
    let socialSignup = null;
    if (visitorData.socialSignupToken) {
      try {
        const verifiedSignup = jwt.verify(
          String(visitorData.socialSignupToken),
          getRequiredEnvValue("JWT_SECRET"),
        );
        if (
          verifiedSignup?.purpose !== "visitor_signup" ||
          !["google", "facebook"].includes(verifiedSignup.provider) ||
          !verifiedSignup.socialId ||
          !verifiedSignup.email
        ) {
          throw new Error("Invalid social sign-up proof");
        }
        socialSignup = verifiedSignup;
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: "Your Google/Facebook sign-up verification expired. Please connect it again.",
        });
      }
    }
    const verifiedFullName = socialSignup?.fullName || normalizedFullName;
    const verifiedEmail = socialSignup?.email
      ? normalizeEmailValue(socialSignup.email)
      : normalizedEmail;
    const dataPrivacyAccepted = visitorData.privacyAccepted === true;
    const dataPrivacyAcceptedAt = visitorData.privacyAcceptedAt
      ? new Date(visitorData.privacyAcceptedAt)
      : new Date();

    if (!verifiedFullName || !verifiedEmail || !normalizedUsername || !normalizedPhone || (!password && !socialSignup)) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, username, contact number, and password are required.",
      });
    }

    if (!isValidEmailValue(verifiedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (!socialSignup && password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    if (!isValidPhoneValue(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: PHONE_VALIDATION_MESSAGE,
        field: "phone",
      });
    }

    if (!dataPrivacyAccepted) {
      return res.status(400).json({
        success: false,
        message:
          "By registering, you must agree that your personal data will be collected and used for visitor monitoring and security purposes.",
      });
    }

    const existingEmailUser = await User.findOne({ email: verifiedEmail });
    if (existingEmailUser) {
      return res.status(409).json({
        success: false,
        code: "ACCOUNT_EXISTS",
        field: "email",
        message: "An account with this email already exists. Please log in instead.",
      });
    }

    const existingUsernameUser = await User.findOne({ username: normalizedUsername });
    if (existingUsernameUser) {
      return res.status(400).json({
        success: false,
        field: "username",
        message: "That username is already taken. Please choose another username.",
      });
    }

    const existingSocialUser = socialSignup
      ? await User.findOne({ [socialSignup.provider === "google" ? "googleId" : "facebookId"]: socialSignup.socialId })
      : null;
    if (existingSocialUser) {
      return res.status(409).json({
        success: false,
        code: "ACCOUNT_EXISTS",
        field: "email",
        message: "This social account is already connected to SafePass. Please sign in instead.",
      });
    }

    const existingVisitor = await Visitor.findOne({ email: verifiedEmail }).sort({
      registeredAt: -1,
    });
    const nameParts = verifiedFullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || "Visitor";
    const lastName = nameParts.join(" ") || "User";

    const user = new User();

    user.firstName = firstName;
    user.lastName = lastName;
    user.username = normalizedUsername;
    user.email = verifiedEmail;
    user.password = password || crypto.randomBytes(32).toString("hex");
    user.phone = normalizedPhone;
    user.role = "visitor";
    user.status = "active";
    user.isVerified = false;
    user.nfcCardId = await generateSafePassAccountId(user.createdAt || new Date());
    user.dataPrivacyAccepted = true;
    user.dataPrivacyAcceptedAt = dataPrivacyAcceptedAt;
    user.isActive = true;
    user.visitorId = existingVisitor?._id || user.visitorId || null;
    if (socialSignup?.provider === "google") user.googleId = socialSignup.socialId;
    if (socialSignup?.provider === "facebook") user.facebookId = socialSignup.socialId;

    const otp = await createRegistrationOtp(user);
    if (!isOtpDeliveryUsable(otp.emailResult)) {
      return res.status(500).json({
        success: false,
        message: "Failed to send verification OTP. Please try again.",
      });
    }
    await user.save();
    console.log(
      "Visitor account created, waiting for OTP verification:",
      verifiedEmail
    );

    await createSystemActivity({
      actorUser: user,
      relatedVisitor: existingVisitor?._id ? existingVisitor : null,
      relatedUser: user,
      activityType: "visitor_account_registration",
      status: "pending",
      location: "Visitor Registration",
      notes: `${verifiedFullName} created a visitor account and must verify OTP before login.`,
      metadata: {
        username: user.username,
        email: user.email,
        requiresOtpVerification: true,
      },
    });

    await AccessLog.create({
      userId: user._id,
      userEmail: user.email,
      userName: verifiedFullName,
      actorRole: "visitor",
      location: "Visitor Registration",
      accessType: "system",
      activityType: "visitor_account_registration",
      status: "pending",
      relatedUser: user._id,
      relatedVisitor: existingVisitor?._id || null,
      notes: "Visitor account created and waiting for OTP verification",
    });

    await createRoleNotification({
      title: "New Visitor Account Registered",
      message: `New visitor account registered: ${normalizedFullName}`,
      targetRole: "admin",
      relatedVisitor: existingVisitor?._id || null,
      relatedUser: user._id,
      type: "visitor",
      severity: "low",
      metadata: {
        activityType: "visitor_account_registration",
        userId: user._id,
        email: user.email,
        fullName: normalizedFullName,
        isVerified: false,
        requiresOtpVerification: true,
        timestamp: new Date().toISOString(),
      },
    });

    res.status(201).json({
      success: true,
      message: "Visitor account created. Please enter the OTP code sent to your email before logging in.",
      requiresOtpVerification: true,
      otpExpiresAt: otp.expiresAt,
      otpDeliveryMode: getOtpDeliveryMode(otp.emailResult),
      user: {
        _id: user._id,
        fullName: normalizedFullName,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        nfcCardId: user.nfcCardId,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Visitor registration error:", error);

    if (error.code === 11000) {
      const duplicateField =
        Object.keys(error.keyPattern || {})[0] ||
        Object.keys(error.keyValue || {})[0] ||
        "";

      return res.status(400).json({
        success: false,
        message:
          duplicateField === "email"
            ? "An account with this email already exists. Please log in instead."
            : duplicateField === "username"
              ? "That username is already taken. Please choose another username."
              : "A duplicate entry was found. Please try again with different details.",
        duplicateField,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to register visitor",
      error: error.message,
    });
  }
});

// ============ ADMIN VISITOR APPROVAL ROUTES ============

// Get pending visitors (admin only)
app.get("/api/admin/visitors/pending", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const visitors = await Visitor.find({
      requestCategory: "registration",
      approvalFlow: "admin",
      approvalStatus: "pending",
    })
      .sort({ registeredAt: -1 })
      .lean();

    const visitorsWithSafePassIds = await attachSafePassIdsToVisitors(visitors);

    res.json({
      success: true,
      visitors: visitorsWithSafePassIds,
    });
  } catch (error) {
    console.error("Get pending visitors error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to get pending visitors" });
  }
});

// Get all visitors with filters (admin only)
app.get("/api/admin/visitors", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { status, page = 1, limit = 100 } = req.query;
    let query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (status === "pending") {
      delete query.status;
      query.$or = [
        { requestCategory: "registration", approvalStatus: "pending" },
        { requestCategory: "appointment", appointmentStatus: "pending" },
      ];
    } else if (status === "approved") {
      delete query.status;
      query.approvalStatus = "approved";
      query.$or = [
        { requestCategory: "registration" },
        {
          requestCategory: "appointment",
          appointmentStatus: { $in: ["approved", "adjusted"] },
        },
      ];
    } else if (status === "rejected") {
      delete query.status;
      query.$or = [
        { requestCategory: "registration", approvalStatus: "rejected" },
        { requestCategory: "appointment", appointmentStatus: "rejected" },
      ];
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [visitors, total] = await Promise.all([
      Visitor.find(query)
        .sort({ registeredAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("reports.reportedBy", "firstName lastName email role department")
        .lean(),
      Visitor.countDocuments(query),
    ]);
    const visitorsWithSafePassIds = await attachSafePassIdsToVisitors(visitors);

    res.json({
      success: true,
      visitors: visitorsWithSafePassIds,
      totalPages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
      total,
    });
  } catch (error) {
    console.error("Get all visitors error:", error);
    res.status(500).json({ success: false, message: "Failed to get visitors" });
  }
});

app.put("/api/admin/visitors/:id/appointment-office", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const office = String(
      req.body?.office ||
      req.body?.appointmentDepartment ||
      req.body?.assignedOffice ||
      "",
    ).trim();

    if (!office) {
      return res.status(400).json({
        success: false,
        message: "Office or department is required.",
      });
    }

    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Visitor not found" });
    }

    const nextVisitDate = req.body?.visitDate ? new Date(req.body.visitDate) : null;
    if (req.body?.visitDate && Number.isNaN(nextVisitDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid appointment date.",
      });
    }

    let nextVisitTime = null;
    if (req.body?.visitTime) {
      const timeValue = String(req.body.visitTime).trim();
      const timeMatch = timeValue.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        if (hours > 23 || minutes > 59) {
          return res.status(400).json({
            success: false,
            message: "Please enter a valid appointment time.",
          });
        }
        const baseDate = nextVisitDate || new Date(visitor.visitDate || Date.now());
        nextVisitTime = new Date(baseDate);
        nextVisitTime.setHours(hours, minutes, 0, 0);
      } else {
        nextVisitTime = new Date(timeValue);
      }

      if (Number.isNaN(nextVisitTime.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid appointment time.",
        });
      }
    }

    const previousOffice = visitor.appointmentDepartment || visitor.assignedOffice || visitor.host || "";
    const previousVisitDate = visitor.visitDate;
    const previousVisitTime = visitor.visitTime;
    visitor.appointmentDepartment = office;
    visitor.assignedOffice = office;
    visitor.host = office;
    if (nextVisitDate) visitor.visitDate = nextVisitDate;
    if (nextVisitTime) visitor.visitTime = nextVisitTime;
    visitor.updatedAt = new Date();
    await visitor.save();

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      activityType: "admin_updated_appointment_request",
      status: "granted",
      location: office,
      notes: `${getFullName(req.user)} updated ${visitor.fullName}'s appointment request details.`,
      metadata: {
        previousOffice,
        office,
        previousVisitDate,
        previousVisitTime,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    const [visitorPayload] = await attachSafePassIdsToVisitors([visitor]);
    res.json({
      success: true,
      message: "Appointment request updated successfully.",
      visitor: visitorPayload,
    });
  } catch (error) {
    console.error("Update appointment request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update appointment request.",
    });
  }
});

// Approve visitor registration (admin only) - WITH DEBUG LOGS
app.put("/api/admin/visitors/:id/approve", authMiddleware, async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("ðŸ”µ APPROVE ROUTE CALLED");
  console.log("=".repeat(60));
  console.log("Visitor ID:", req.params.id);
  console.log("Admin User:", req.user?.email);
  console.log("Admin ID:", req.user?._id);

  try {
    if (req.user.role !== "admin") {
      console.log("âŒ Access denied - not admin");
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { adminNotes } = req.body;
    console.log("Admin Notes:", adminNotes);

    // Find the visitor
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      console.log("âŒ Visitor not found:", req.params.id);
      return res
        .status(404)
        .json({ success: false, message: "Visitor not found" });
    }

    console.log("\nðŸ“‹ VISITOR FOUND:");
    console.log(`   Name: ${visitor.fullName}`);
    console.log(`   Email: ${visitor.email}`);
    console.log(`   Current status: ${visitor.status}`);
    console.log(`   Current approvalStatus: ${visitor.approvalStatus}`);
    console.log(`   Visit Date: ${visitor.visitDate}`);
    console.log(`   Purpose: ${visitor.purposeOfVisit}`);

    // Resolve the visitor's permanent SafePass account ID.
    let realNfcCardId = null;

    // Update visitor status - THIS IS THE KEY PART
    console.log("\nðŸ“ UPDATING VISITOR...");
    visitor.approveRegistration(req.user._id, adminNotes || "");
    visitor.temporaryPassword = undefined;

    await visitor.save();
    console.log("âœ… Visitor updated in database");
    console.log(`   New status: ${visitor.status}`);
    console.log(`   New approvalStatus: ${visitor.approvalStatus}`);
    console.log(`   Approved At: ${visitor.approvedAt}`);

    // Find and update the user
    console.log("\nðŸ‘¤ CHECKING FOR USER ACCOUNT...");
    let user = await User.findOne({ email: visitor.email });
    console.log(`   User exists: ${user ? "Yes" : "No"}`);
    realNfcCardId =
      user
        ? await activateVisitorSafePassCardForUser(user, visitor)
        : await generateSafePassAccountId(new Date());
    console.log("SafePass Account ID:", realNfcCardId);
    let setupLink = "";
    let setupToken = null;

    if (!user) {
      console.log("ðŸ“ Creating new user account...");
      setupToken = createPasswordSetupToken(48);
      setupLink = `${FRONTEND_URL}?resetEmail=${encodeURIComponent(visitor.email)}&resetToken=${encodeURIComponent(setupToken.token)}&activation=1`;
      // Create user account for the visitor
      const userData = {
        firstName: visitor.fullName.split(" ")[0] || "Visitor",
        lastName: visitor.fullName.split(" ").slice(1).join(" ") || "User",
        email: visitor.email,
        password: generateTemporaryPassword(),
        phone: visitor.phoneNumber,
        role: "visitor",
        status: "inactive",
        isActive: false,
        isVerified: false,
        visitorId: visitor._id,
        nfcCardId: realNfcCardId,
        safePassId: realNfcCardId,
        passwordResetTokenHash: setupToken.tokenHash,
        passwordResetExpiresAt: setupToken.expiresAt,
        accessPermissions: {
          canAccess: [],
          restrictedAreas: [],
          timeRestrictions: [],
          cardActive: true,
        },
      };

      user = new User(userData);
      await user.save();
      console.log(
        "âœ… User account created for approved visitor:",
        visitor.email,
      );
      console.log(`   User ID: ${user._id}`);
      console.log(`   NFC Card: ${user.nfcCardId}`);
    } else {
      console.log("ðŸ“ Updating existing user account...");
      // Keep the approved account credentials and visitor link in sync.
      user.firstName = visitor.fullName.split(" ")[0] || user.firstName;
      user.lastName =
        visitor.fullName.split(" ").slice(1).join(" ") || user.lastName;
      user.phone = visitor.phoneNumber || user.phone;
      user.role = "visitor";
      user.visitorId = visitor._id;
      if (user.status === "inactive" || user.isActive === false) {
        setupToken = createPasswordSetupToken(48);
        setupLink = `${FRONTEND_URL}?resetEmail=${encodeURIComponent(user.email)}&resetToken=${encodeURIComponent(setupToken.token)}&activation=1`;
        user.passwordResetTokenHash = setupToken.tokenHash;
        user.passwordResetExpiresAt = setupToken.expiresAt;
      } else {
        user.status = "active";
        user.isActive = true;
      }
      user.safePassId = realNfcCardId;
      if (!getUserPhysicalNfcUid(user)) {
        user.nfcCardId = realNfcCardId;
      }
      user.accessPermissions = {
        canAccess: user.accessPermissions?.canAccess || [],
        restrictedAreas: user.accessPermissions?.restrictedAreas || [],
        timeRestrictions: user.accessPermissions?.timeRestrictions || [],
        cardActive: true,
      };
      await user.save();
      console.log(
        "âœ… User account activated with real NFC card:",
        realNfcCardId,
      );
      console.log(`   User ID: ${user._id}`);
      console.log(`   New status: ${user.status}`);
    }

    // Send approval email (simulated)
    sendEmail(
      visitor.email,
      "Visitor Registration Approved - Sapphire Aviation",
      [
        `Dear ${visitor.fullName},`,
        "",
        "Your visitor registration has been approved.",
        "",
        "Visit Details:",
        `Purpose: ${visitor.purposeOfVisit}`,
        `Date: ${new Date(visitor.visitDate).toLocaleDateString()}`,
        `Time: ${new Date(visitor.visitTime).toLocaleTimeString()}`,
        "",
        setupLink
          ? "To activate your SafePass visitor account, open the secure setup link below and create your password:"
          : "You may sign in using your existing SafePass visitor account.",
        setupLink || `Email: ${visitor.email}`,
        "",
        setupLink
          ? "This secure link expires in 48 hours."
          : "If you forgot your password, use the password reset option on the login screen.",
        "",
        getSupportEmailSignature(),
      ].join("\n"),
    );

    const approvalMessage = `${visitor.fullName} has been approved to visit on ${new Date(visitor.visitDate).toLocaleDateString()} at ${new Date(visitor.visitTime).toLocaleTimeString()}`;

    // Notify security about the new approved visitor and notify the visitor directly.
    // targetUser prevents one visitor's approval from appearing in another visitor's inbox.
    await Promise.all([
      createRoleNotification({
        title: "New Visitor Approved",
        message: approvalMessage,
        type: "visitor",
        severity: "medium",
        targetRole: "security",
        relatedVisitor: visitor._id,
        relatedUser: user._id,
        metadata: {
          activityType: "admin_approved_registration",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          purposeOfVisit: visitor.purposeOfVisit,
        },
      }),
      createRoleNotification({
        title: "Visit Approved",
        message: `Your visit request has been approved for ${new Date(visitor.visitDate).toLocaleDateString()} at ${new Date(visitor.visitTime).toLocaleTimeString()}.`,
        type: "visitor",
        severity: "medium",
        targetRole: "visitor",
        targetUser: user._id,
        relatedVisitor: visitor._id,
        relatedUser: user._id,
        metadata: {
          activityType: "visitor_registration_approved",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          purposeOfVisit: visitor.purposeOfVisit,
        },
      }),
    ]);
    console.log(`Visitor approved successfully for ${visitor.email}.`);

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: user,
      activityType: "admin_approved_registration",
      status: "granted",
      location: visitor.assignedOffice || visitor.host || "Admin Approval Desk",
      notes: `${req.user.firstName} ${req.user.lastName} approved ${visitor.fullName}'s registration.`,
      metadata: {
        adminNotes: visitor.adminNotes,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        purposeOfVisit: visitor.purposeOfVisit,
      },
    });

    res.json({
      success: true,
      message: "Visitor approved successfully",
      visitor: {
        _id: visitor._id,
        fullName: visitor.fullName,
        email: visitor.email,
        status: visitor.status,
        approvalStatus: visitor.approvalStatus,
        nfcCardId: getUserPhysicalNfcUid(user),
        physicalNfcUid: getUserPhysicalNfcUid(user),
        phoneNfcUid: getUserPhoneNfcUid(user),
        safePassId: getUserSafePassId(user),
        cardActive: user.accessPermissions?.cardActive !== false,
      },
    });
  } catch (error) {
    console.error("\nâŒ APPROVE VISITOR ERROR:", error);
    console.log("=".repeat(60) + "\n");
    res.status(500).json({
      success: false,
      message: "Failed to approve visitor",
      error: error.message,
    });
  }
});

// Reject visitor registration (admin only)
app.put("/api/admin/visitors/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { reason } = req.body;
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res
        .status(404)
        .json({ success: false, message: "Visitor not found" });
    }

    visitor.rejectRegistration(req.user._id, reason || "No reason provided");
    await visitor.save();

    // Send rejection email (simulated)
    sendEmail(
      visitor.email,
      "Visitor Registration Update - Sapphire Aviation",
      `Dear ${visitor.fullName},\n\nWe regret to inform you that your visitor registration has been rejected.\n\nReason: ${reason || "No specific reason provided"}\n\nIf you have any questions, please contact us.\n\nThank you,\nSapphire Aviation Security Team`,
    );

    // Create notification for security
    await createRoleNotification({
      title: "Visitor Rejected",
      message: `${visitor.fullName}'s registration was rejected. Reason: ${reason || "N/A"}`,
      type: "alert",
      severity: "medium",
      targetRole: "security",
      relatedVisitor: visitor._id,
      metadata: {
        activityType: "admin_rejected_registration",
        reason: reason || "No reason provided",
      },
    });

    console.log("âŒ Visitor rejected:", visitor.email);

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      activityType: "admin_rejected_registration",
      status: "denied",
      location: visitor.assignedOffice || visitor.host || "Admin Approval Desk",
      notes: `${req.user.firstName} ${req.user.lastName} rejected ${visitor.fullName}'s registration.`,
      metadata: {
        reason: reason || "No reason provided",
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    res.json({
      success: true,
      message: "Visitor rejected successfully",
    });
  } catch (error) {
    console.error("Reject visitor error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to reject visitor" });
  }
});

// ============ SECURITY GUARD MANAGEMENT ROUTES ============

// Create staff account (admin only)
app.post("/api/admin/staff/create", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      firstName,
      lastName,
      username,
      email,
      phone,
      department,
      position,
      employeeId,
      nfcCardId,
      uid,
      cardId,
    } = req.body;

    const normalizedFirstName = String(firstName || "").trim();
    const normalizedLastName = String(lastName || "").trim();
    let normalizedEmail = normalizeEmailValue(email);
    const normalizedUsername = normalizeUsernameValue(username);
    const normalizedPhone = normalizePhoneValue(phone);
    const normalizedDepartment = String(department || "").trim();
    const normalizedPosition = String(position || "Staff Member").trim();
    let normalizedEmployeeId = String(employeeId || "").trim();

    if (!normalizedEmail) {
      normalizedEmail = await generateUniqueAccountEmail({
        firstName: normalizedFirstName,
        role: "staff",
        department: normalizedDepartment,
        position: normalizedPosition,
      });
    }

    if (!normalizedEmployeeId) {
      normalizedEmployeeId = await generateUniqueEmployeeId("staff");
    }

    const resolvedUsername = normalizedUsername || normalizeUsernameValue(normalizedEmployeeId || normalizedEmail.split("@")[0]);

    if (
      !normalizedFirstName ||
      !normalizedLastName ||
      !normalizedEmail ||
      !normalizedEmployeeId ||
      !normalizedDepartment
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        required: ["firstName", "lastName", "employeeId", "email", "department"],
      });
    }

    if (!isValidEmailValue(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
        field: "email",
      });
    }

    if (normalizedPhone && !isValidPhoneValue(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: PHONE_VALIDATION_MESSAGE,
        field: "phone",
      });
    }

    const requestedNfcCardId = normalizeSubmittedNfcCardId(nfcCardId || uid || cardId);
    const duplicateChecks = [
      { email: normalizedEmail },
      { username: resolvedUsername },
      { employeeId: exactTextMatch(normalizedEmployeeId) },
    ];
    if (requestedNfcCardId) {
      duplicateChecks.push({ nfcCardId: exactTextMatch(requestedNfcCardId) });
      duplicateChecks.push({ physicalNfcUid: exactTextMatch(requestedNfcCardId) });
      duplicateChecks.push({ phoneNfcUid: exactTextMatch(requestedNfcCardId) });
    }

    const existingUser = await User.findOne({ $or: duplicateChecks });
    if (existingUser) {
      const duplicateField =
        sameNormalizedText(existingUser.email, normalizedEmail)
          ? "email"
          : sameNormalizedText(existingUser.username, resolvedUsername)
            ? "username"
            : sameNormalizedText(existingUser.employeeId, normalizedEmployeeId)
              ? "employeeId"
              : requestedNfcCardId &&
                (
                  sameNormalizedText(existingUser.nfcCardId, requestedNfcCardId) ||
                  sameNormalizedText(existingUser.physicalNfcUid, requestedNfcCardId) ||
                  sameNormalizedText(existingUser.phoneNfcUid, requestedNfcCardId)
                )
                ? "nfcCardId"
            : "email";

      return res.status(400).json({
        success: false,
        message:
          duplicateField === "username"
            ? "Username already registered"
            : duplicateField === "employeeId"
              ? "Staff/Security number already registered"
              : duplicateField === "nfcCardId"
                ? "NFC card UID already assigned"
            : "Email already registered",
        field: duplicateField,
      });
    }

    const temporaryPassword = generateTemporaryPassword();
    const setupToken = createPasswordSetupToken(48);
    const setupLink = `${FRONTEND_URL}?resetEmail=${encodeURIComponent(normalizedEmail)}&resetToken=${encodeURIComponent(setupToken.token)}&activation=1`;

    const resolvedNfcCardId = requestedNfcCardId || "";

    const user = new User({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      username: resolvedUsername,
      email: normalizedEmail,
      password: temporaryPassword,
      phone: normalizedPhone || "",
      role: "staff",
      status: "inactive",
      isActive: false,
      isVerified: false,
      employeeId: normalizedEmployeeId,
      department: normalizedDepartment,
      position: normalizedPosition,
      nfcCardId: resolvedNfcCardId,
      physicalNfcUid: resolvedNfcCardId,
      passwordResetTokenHash: setupToken.tokenHash,
      passwordResetExpiresAt: setupToken.expiresAt,
    });

    await user.save();

    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Created staff account: ${user.email}`,
    });
    await accessLog.save();

    const credentialEmail = await sendEmail(
      user.email,
      "Activate Your Sapphire SafePass Staff Account",
      [
        `Good day, ${user.firstName} ${user.lastName}.`,
        "",
        "An administrator created your Sapphire SafePass staff account.",
        "",
        "Account details:",
        `Name: ${user.firstName} ${user.lastName}`,
        "Assigned role: Staff",
        `Login email: ${user.email}`,
        `Staff/Security number: ${user.employeeId}`,
        `Department: ${user.department}`,
        "",
        "To activate your account, open the secure setup link below and create your password:",
        setupLink,
        "",
        "This secure link expires in 48 hours. Your account remains inactive until you complete this step.",
        "If you did not expect this account, please ignore this email and contact the SafePass administrator.",
        "",
        getSupportEmailSignature(),
      ].join("\n"),
    );

    const userResponse = user.toObject();
    delete userResponse.password;
    const credentialEmailDelivered = Boolean(credentialEmail?.delivered);

    res.status(201).json({
      success: true,
      message: credentialEmailDelivered
        ? "Staff account created successfully and credentials were emailed"
        : credentialEmail?.simulated
          ? "Staff account created successfully and credential email was simulated"
        : "Staff account created, but credential email could not be sent",
      user: userResponse,
      emailDelivery: {
        success: Boolean(credentialEmail?.success),
        delivered: credentialEmailDelivered,
        simulated: Boolean(credentialEmail?.simulated),
        error: credentialEmail?.error || "",
        setupLink: credentialEmail?.simulated ? setupLink : undefined,
      },
    });
  } catch (error) {
    console.error("Create staff account error:", error);

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(400).json({
        success: false,
        message:
          duplicateField === "username"
            ? "Username already registered"
            : duplicateField === "employeeId"
              ? "Staff/Security number already registered"
            : "Email already registered",
        field: duplicateField,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create staff account",
      error: error.message,
    });
  }
});

// Create security guard (admin only)
app.post("/api/admin/security/create", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { firstName, lastName, email, phone, shift, position, employeeId, nfcCardId, uid, cardId } = req.body;

    const normalizedFirstName = String(firstName || "").trim();
    const normalizedLastName = String(lastName || "").trim();
    let normalizedEmail = normalizeEmailValue(email);
    const normalizedPhone = normalizePhoneValue(phone);
    const normalizedPosition = String(position || "Security Guard").trim();
    let normalizedEmployeeId = String(employeeId || "").trim();

    if (!normalizedEmail) {
      normalizedEmail = await generateUniqueAccountEmail({
        firstName: normalizedFirstName,
        role: "security",
        department: "Security Department",
        position: normalizedPosition,
      });
    }

    if (!normalizedEmployeeId) {
      normalizedEmployeeId = await generateUniqueEmployeeId("security");
    }

    if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !normalizedEmployeeId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        required: ["firstName", "lastName", "employeeId", "email"],
      });
    }

    if (!isValidEmailValue(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Invalid email format", field: "email" });
    }

    if (normalizedPhone && !isValidPhoneValue(normalizedPhone)) {
      return res.status(400).json({ success: false, message: PHONE_VALIDATION_MESSAGE, field: "phone" });
    }

    const resolvedUsername = normalizeUsernameValue(normalizedEmployeeId || normalizedEmail.split("@")[0]);
    const requestedNfcCardId = normalizeSubmittedNfcCardId(nfcCardId || uid || cardId);
    const duplicateChecks = [
        { email: normalizedEmail },
        { username: resolvedUsername },
        { employeeId: exactTextMatch(normalizedEmployeeId) },
      ];
    if (requestedNfcCardId) {
      duplicateChecks.push({ nfcCardId: exactTextMatch(requestedNfcCardId) });
      duplicateChecks.push({ physicalNfcUid: exactTextMatch(requestedNfcCardId) });
      duplicateChecks.push({ phoneNfcUid: exactTextMatch(requestedNfcCardId) });
    }
    const existingUser = await User.findOne({ $or: duplicateChecks });
    if (existingUser) {
      const field = sameNormalizedText(existingUser.email, normalizedEmail)
        ? "email"
        : sameNormalizedText(existingUser.username, resolvedUsername)
          ? "username"
          : sameNormalizedText(existingUser.employeeId, normalizedEmployeeId)
            ? "employeeId"
            : requestedNfcCardId &&
              (
                sameNormalizedText(existingUser.nfcCardId, requestedNfcCardId) ||
                sameNormalizedText(existingUser.physicalNfcUid, requestedNfcCardId) ||
                sameNormalizedText(existingUser.phoneNfcUid, requestedNfcCardId)
              )
              ? "nfcCardId"
              : "email";
      return res.status(400).json({
        success: false,
        message:
          field === "username"
            ? "Username already registered"
            : field === "employeeId"
              ? "Staff/Security number already registered"
              : field === "nfcCardId"
                ? "NFC card UID already assigned"
              : "Email already registered",
        field,
      });
    }

    const resolvedNfcCardId = requestedNfcCardId || "";
    const temporaryPassword = generateTemporaryPassword();
    const setupToken = createPasswordSetupToken(48);
    const setupLink = `${FRONTEND_URL}?resetEmail=${encodeURIComponent(normalizedEmail)}&resetToken=${encodeURIComponent(setupToken.token)}&activation=1`;

    const user = new User({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      username: resolvedUsername,
      email: normalizedEmail,
      password: temporaryPassword,
      phone: normalizedPhone || "",
      role: "guard",
      nfcCardId: resolvedNfcCardId,
      physicalNfcUid: resolvedNfcCardId,
      employeeId: normalizedEmployeeId,
      position: normalizedPosition,
      shift: String(shift || "").trim(),
      department: "Security Department",
      status: "inactive",
      isActive: false,
      isVerified: false,
      passwordResetTokenHash: setupToken.tokenHash,
      passwordResetExpiresAt: setupToken.expiresAt,
    });

    await user.save();

    const credentialEmail = await sendEmail(
      user.email,
      "Activate Your Sapphire SafePass Security Account",
      [
        `Good day, ${user.firstName} ${user.lastName}.`,
        "",
        "An administrator created your Sapphire SafePass security account.",
        "",
        "Account details:",
        `Name: ${user.firstName} ${user.lastName}`,
        "Assigned role: Security",
        `Login email: ${user.email}`,
        `Staff/Security number: ${user.employeeId}`,
        `Position: ${user.position}`,
        `Shift: ${user.shift || "To be assigned"}`,
        "",
        "To activate your account, open the secure setup link below and create your password:",
        setupLink,
        "",
        "This secure link expires in 48 hours. Your account remains inactive until you complete this step.",
        "If you did not expect this account, please ignore this email and contact the SafePass administrator.",
        "",
        getSupportEmailSignature(),
      ].join("\n"),
    );

    const userResponse = user.toObject();
    delete userResponse.password;

    const credentialEmailDelivered = Boolean(credentialEmail?.delivered);
    res.status(201).json({
      success: true,
      message: credentialEmailDelivered
        ? "Security account created successfully and activation email was sent"
        : credentialEmail?.simulated
          ? "Security account created successfully and activation email was simulated"
          : "Security account created, but activation email could not be sent",
      user: userResponse,
      emailDelivery: {
        success: Boolean(credentialEmail?.success),
        delivered: credentialEmailDelivered,
        simulated: Boolean(credentialEmail?.simulated),
        error: credentialEmail?.error || "",
        setupLink: credentialEmail?.simulated ? setupLink : undefined,
      },
    });
  } catch (error) {
    console.error("Create security guard error:", error);

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(400).json({
        success: false,
        message:
          duplicateField === "username"
            ? "Username already registered"
            : duplicateField === "employeeId"
              ? "Staff/Security number already registered"
              : "Email already registered",
        field: duplicateField,
      });
    }

    res.status(500).json({ success: false, message: "Failed to create security guard", error: error.message });
  }
});

// Create student account (admin only)
app.post("/api/admin/students/create", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const normalizedFirstName = String(req.body.firstName || "").trim();
    const normalizedLastName = String(req.body.lastName || "").trim();
    let normalizedEmail = normalizeEmailValue(req.body.email);
    const normalizedUsername = normalizeUsernameValue(req.body.username);
    const requestedRole = normalizeUserRoleValue(req.body.role || "student");
    if (!["student", "teacher"].includes(requestedRole)) {
      return res.status(400).json({
        success: false,
        message: "Only student and academic staff accounts can be created here.",
        field: "role",
      });
    }

    const isTeacherAccount = requestedRole === "teacher";
    const academicIdField = isTeacherAccount ? "teacherId" : "studentId";
    const academicLabel = isTeacherAccount ? "Academic Staff" : "Student";
    let normalizedAcademicId = String(req.body[academicIdField] || req.body.studentId || "").trim();
    const requestedNfcCardId = normalizeSubmittedNfcCardId(
      req.body.nfcCardId || req.body.uid || req.body.cardId,
    );
    const normalizedParentEmail = normalizeEmailValue(req.body.parentEmail || req.body.guardianEmail || "");

    if (!normalizedEmail) {
      normalizedEmail = await generateUniqueAccountEmail({
        firstName: normalizedFirstName,
        role: requestedRole,
        department: requestedRole,
        position: requestedRole,
      });
    }

    if (!normalizedAcademicId) {
      normalizedAcademicId = await generateUniqueAcademicId({ role: requestedRole, fieldName: academicIdField });
    }

    const resolvedUsername = normalizedUsername || normalizeUsernameValue(normalizedAcademicId || normalizedEmail.split("@")[0]);

    if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !normalizedAcademicId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        required: ["firstName", "lastName", academicIdField, "email"],
      });
    }

    if (!isValidEmailValue(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Invalid email format", field: "email" });
    }

    if (!isTeacherAccount && normalizedParentEmail && !isValidEmailValue(normalizedParentEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid parent email address",
        field: "parentEmail",
      });
    }

    const duplicateChecks = [
        { email: normalizedEmail },
        { username: resolvedUsername },
        { [academicIdField]: exactTextMatch(normalizedAcademicId) },
      ];
    if (requestedNfcCardId) {
      duplicateChecks.push({ nfcCardId: exactTextMatch(requestedNfcCardId) });
      duplicateChecks.push({ physicalNfcUid: exactTextMatch(requestedNfcCardId) });
      duplicateChecks.push({ phoneNfcUid: exactTextMatch(requestedNfcCardId) });
    }
    const existingUser = await User.findOne({ $or: duplicateChecks });
    if (existingUser) {
      const duplicateField =
        sameNormalizedText(existingUser.email, normalizedEmail)
          ? "email"
          : sameNormalizedText(existingUser.username, resolvedUsername)
            ? "username"
            : sameNormalizedText(existingUser[academicIdField], normalizedAcademicId)
              ? academicIdField
              : requestedNfcCardId &&
                (
                  sameNormalizedText(existingUser.nfcCardId, requestedNfcCardId) ||
                  sameNormalizedText(existingUser.physicalNfcUid, requestedNfcCardId) ||
                  sameNormalizedText(existingUser.phoneNfcUid, requestedNfcCardId)
                )
                ? "nfcCardId"
                : "email";

      return res.status(400).json({
        success: false,
        message:
          duplicateField === "username"
            ? "Username already registered"
            : duplicateField === academicIdField
              ? `${academicLabel} ID already registered`
              : duplicateField === "nfcCardId"
                ? "NFC card UID already assigned"
              : "Email already registered",
        field: duplicateField,
      });
    }

    const temporaryPassword = generateTemporaryPassword();
    const setupToken = createPasswordSetupToken(48);
    const setupLink = `${FRONTEND_URL}?resetEmail=${encodeURIComponent(normalizedEmail)}&resetToken=${encodeURIComponent(setupToken.token)}&activation=1`;
    const resolvedNfcCardId = requestedNfcCardId || "";
    const createAsActive = false;

    const user = new User({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      username: resolvedUsername,
      email: normalizedEmail,
      password: temporaryPassword,
      phone: "",
      parentName: isTeacherAccount ? "" : String(req.body.parentName || req.body.guardianName || "").trim(),
      parentEmail: isTeacherAccount ? "" : normalizedParentEmail,
      guardianName: isTeacherAccount ? "" : String(req.body.guardianName || req.body.parentName || "").trim(),
      guardianEmail: isTeacherAccount ? "" : normalizedParentEmail,
      role: requestedRole,
      status: "inactive",
      isActive: false,
      isVerified: false,
      [academicIdField]: normalizedAcademicId,
      course: String(req.body.course || "").trim(),
      yearLevel: String(req.body.yearLevel || "").trim(),
      section: String(req.body.section || "").trim(),
      nfcCardId: resolvedNfcCardId,
      physicalNfcUid: resolvedNfcCardId,
      passwordResetTokenHash: setupToken.tokenHash,
      passwordResetExpiresAt: setupToken.expiresAt,
    });

    await user.save();

    const credentialEmail = await sendEmail(
      user.email,
      `Activate Your Sapphire SafePass ${academicLabel} Account`,
      [
        `Good day, ${user.firstName} ${user.lastName}.`,
        "",
        `An administrator created your Sapphire SafePass ${academicLabel.toLowerCase()} account.`,
        "",
        "Account details:",
        `Name: ${user.firstName} ${user.lastName}`,
        `Assigned role: ${academicLabel}`,
        `Login email: ${user.email}`,
        `${academicLabel} ID: ${user[academicIdField]}`,
        "",
        "To activate your account, open the secure setup link below and create your password:",
        setupLink,
        "",
        "This secure link expires in 48 hours. Your account remains inactive until you complete this step.",
        "",
        getSupportEmailSignature(),
      ].join("\n"),
    );

    const userResponse = user.toObject();
    delete userResponse.password;
    const credentialEmailDelivered = Boolean(credentialEmail?.delivered);

    res.status(201).json({
      success: true,
      message: credentialEmailDelivered
        ? `${academicLabel} account created successfully and credentials were emailed`
        : credentialEmail?.simulated
          ? `${academicLabel} account created successfully and credential email was simulated`
          : `${academicLabel} account created, but credential email could not be sent`,
      user: userResponse,
      emailDelivery: {
        success: Boolean(credentialEmail?.success),
        delivered: credentialEmailDelivered,
        simulated: Boolean(credentialEmail?.simulated),
        error: credentialEmail?.error || "",
        setupLink: credentialEmail?.simulated ? setupLink : undefined,
      },
    });
  } catch (error) {
    console.error("Create student/academic staff account error:", error);
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(400).json({
        success: false,
        message:
          duplicateField === "username"
            ? "Username already registered"
            : duplicateField === "studentId" || duplicateField === "teacherId"
              ? "Academic ID already registered"
              : "Email already registered",
        field: duplicateField,
      });
    }

    res.status(500).json({ success: false, message: "Failed to create student or academic staff account", error: error.message });
  }
});
// Get all security guards
app.get("/api/admin/security", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const guards = await User.find({ role: { $in: ["guard", "security"] } })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      guards,
    });
  } catch (error) {
    console.error("Get security guards error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get security guards",
    });
  }
});

// Get security guard by ID
app.get("/api/admin/security/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const guard = await User.findOne({
      _id: req.params.id,
      role: { $in: ["guard", "security"] },
    }).select("-password");

    if (!guard) {
      return res.status(404).json({
        success: false,
        message: "Security guard not found",
      });
    }

    res.json({
      success: true,
      guard,
    });
  } catch (error) {
    console.error("Get security guard by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get security guard",
    });
  }
});

// Update security guard
app.put("/api/admin/security/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { id } = req.params;
    const updates = req.body;

    delete updates.password;
    delete updates._id;
    delete updates.__v;

    const guard = await User.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true },
    ).select("-password");

    if (!guard) {
      return res.status(404).json({
        success: false,
        message: "Security guard not found",
      });
    }

    res.json({
      success: true,
      message: "Security guard updated successfully",
      guard,
    });
  } catch (error) {
    console.error("Update security guard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update security guard",
    });
  }
});

// Delete security guard
app.delete("/api/admin/security/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { id } = req.params;
    const guard = await User.findByIdAndDelete(id);

    if (!guard) {
      return res.status(404).json({
        success: false,
        message: "Security guard not found",
      });
    }

    res.json({
      success: true,
      message: "Security guard deleted successfully",
    });
  } catch (error) {
    console.error("Delete security guard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete security guard",
    });
  }
});

// Assign shift to security guard
app.put("/api/admin/security/:id/shift", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { id } = req.params;
    const { shift } = req.body;

    const guard = await User.findByIdAndUpdate(
      id,
      { shift, updatedAt: new Date() },
      { new: true },
    ).select("-password");

    if (!guard) {
      return res.status(404).json({
        success: false,
        message: "Security guard not found",
      });
    }

    res.json({
      success: true,
      message: `Shift updated to ${shift}`,
      guard,
    });
  } catch (error) {
    console.error("Assign shift error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign shift",
    });
  }
});

// Get guard attendance logs (derived from access logs)
app.get("/api/admin/security/:id/attendance", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { startDate, endDate, limit = 100 } = req.query;

    const guard = await User.findById(req.params.id).select("email firstName lastName");
    if (!guard) {
      return res.status(404).json({
        success: false,
        message: "Security guard not found",
      });
    }

    const query = { userEmail: guard.email };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const attendance = await AccessLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      attendance,
      guard: {
        id: guard._id,
        name: `${guard.firstName || ""} ${guard.lastName || ""}`.trim(),
        email: guard.email,
      },
    });
  } catch (error) {
    console.error("Get guard attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get guard attendance",
    });
  }
});

// ============ ADMIN NOTIFICATION ROUTES ============

// Send admin notification
app.post("/api/admin/notifications", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      type,
      visitorId,
      visitorName,
      visitorEmail,
      purpose,
      visitDate,
      visitTime,
      phoneNumber,
    } = req.body;

    const notification = new Notification({
      title: "New Visitor Registration",
      message: `${visitorName} (${visitorEmail}) has registered for a visit.\nPurpose: ${purpose}\nDate: ${new Date(visitDate).toLocaleDateString()}\nTime: ${new Date(visitTime).toLocaleTimeString()}\nPhone: ${phoneNumber}`,
      type: "visitor",
      severity: "medium",
      targetRole: "admin",
      relatedVisitor: visitorId,
      metadata: {
        visitorName,
        visitorEmail,
        purpose,
        visitDate,
        visitTime,
        phoneNumber,
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await notification.save();

    console.log("ðŸ“¢ Admin notification created for visitor:", visitorName);

    res.json({
      success: true,
      message: "Admin notification sent",
    });
  } catch (error) {
    console.error("Send admin notification error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to send notification" });
  }
});

// ============ OTP ROUTES ============

// Request OTP
app.post("/api/auth/request-otp", async (req, res) => {

  try {
    const { phoneNumber, method } = req.body;
    const cleanPhone = normalizePhoneForOtp(phoneNumber);

    if (!/^09\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid Philippine mobile number.",
      });
    }

    const phoneRequestRateLimit = phoneOtpRequestLimiter.hit({
      req,
      identifier: cleanPhone,
    });
    if (!phoneRequestRateLimit.allowed) {
      return applyRateLimit(
        res,
        phoneRequestRateLimit,
        "Too many OTP requests. Please wait a few minutes before requesting another code.",
      );
    }

    // Generate a random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with expiration (5 minutes)
    otpStore.set(cleanPhone, {
      code: otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    // Generate a temporary token
    const tempToken =
      "otp_" + Math.random().toString(36).substring(2) + Date.now();
    let deliveryProvider = getPhoneOtpDeliveryProvider();
    let backendLogPrinted = false;
    const shouldUseBackendLogForSmartTnt =
      getSmartTntOtpBackendLogEnabled() && isSmartTntOtpNumber(cleanPhone);

    if (shouldUseBackendLogForSmartTnt) {
      deliveryProvider = "backend_log";
      logPhoneOtpBackendFallback({
        phoneNumber: cleanPhone,
        otpCode,
        method: method || "sms",
        reason: "Smart/TNT OTP is configured for backend terminal delivery.",
      });
      backendLogPrinted = true;
    }

    if (deliveryProvider === "backend_log" && !backendLogPrinted) {
      logPhoneOtpBackendFallback({
        phoneNumber: cleanPhone,
        otpCode,
        method: method || "sms",
        reason: isPhoneOtpBackendLogModeEnabled()
          ? "Temporary backend OTP mode is enabled; no SMS credit was used."
          : "SMS provider is not configured; OTP is available in the backend terminal.",
      });
      backendLogPrinted = true;
    }

    if (deliveryProvider !== "backend_log") {
      try {
        await sendPhoneOtp({ phoneNumber: cleanPhone, otpCode, provider: deliveryProvider });
      } catch (smsError) {
        console.error(`${deliveryProvider} OTP SMS error:`, smsError?.data || smsError);
        if (shouldFallbackPhoneOtpToBackendLog()) {
          const failedProvider = deliveryProvider;
          deliveryProvider = "backend_log";
          logPhoneOtpBackendFallback({
            phoneNumber: cleanPhone,
            otpCode,
            method: method || "sms",
            reason: `${failedProvider} account is not ready for SMS sending.`,
          });
          backendLogPrinted = true;
        } else {
          otpStore.delete(cleanPhone);
          return res.status(502).json({
            success: false,
            message:
              `Unable to send SMS OTP right now. Please check ${deliveryProvider} credentials, credits, and sender setup.`,
            deliveryMode: deliveryProvider,
          });
        }
      }
    }

    console.log(`Phone OTP generated for ${cleanPhone}.`);
    logPhoneOtpForDemo({
      phoneNumber: cleanPhone,
      otpCode,
      method: method || "sms",
    });
    logSensitiveDebug(`Phone OTP for ${cleanPhone}: ${otpCode}`);

    res.json({
      success: true,
      tempToken: tempToken,
      expiresIn: 300,
      method: method || "sms",
      phoneNumber: cleanPhone,
      deliveryMode: deliveryProvider,
    });
  } catch (error) {
    console.error("OTP request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {

  try {
    const { phoneNumber, otpCode, tempToken } = req.body;
    const cleanPhone = normalizePhoneForOtp(phoneNumber);
    const cleanOtpCode = normalizeOtpCode(otpCode);

    if (!/^09\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Please enter a valid Philippine mobile number.",
      });
    }

    if (!/^\d{6}$/.test(cleanOtpCode)) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Please enter the 6-digit OTP code.",
      });
    }

    const phoneVerifyRateLimit = phoneOtpVerifyLimiter.hit({
      req,
      identifier: cleanPhone,
    });
    if (!phoneVerifyRateLimit.allowed) {
      return applyRateLimit(
        res,
        phoneVerifyRateLimit,
        "Too many verification attempts. Please request a new code and try again later.",
      );
    }

    const storedData = otpStore.get(cleanPhone);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "No verification code found. Please request a new code.",
      });
    }

    if (storedData.expiresAt < Date.now()) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Verification code has expired. Please request a new code.",
      });
    }

    if (storedData.attempts >= 5) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Too many failed attempts. Please request a new code.",
      });
    }

    if (storedData.code === cleanOtpCode) {
      otpStore.delete(cleanPhone);
      return res.json({
        success: true,
        verified: true,
        message: "OTP verified successfully",
      });
    } else {
      storedData.attempts += 1;
      otpStore.set(cleanPhone, storedData);
      return res.status(400).json({
        success: false,
        verified: false,
        message: `Invalid verification code. ${5 - storedData.attempts} attempts remaining.`,
      });
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
});

// Debug endpoint to check all visitors (admin only)
app.get("/api/admin/debug-visitors", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const visitors = await Visitor.find({}).sort({ registeredAt: -1 });

    console.log("\nðŸ“‹ ALL VISITORS IN DATABASE:");
    console.log("=".repeat(60));
    visitors.forEach((v) => {
      console.log(`   ${v.fullName} (${v.email}):`);
      console.log(`      _id: ${v._id}`);
      console.log(`      status: ${v.status}`);
      console.log(`      approvalStatus: ${v.approvalStatus}`);
      console.log(`      visitDate: ${v.visitDate}`);
      console.log(`      registeredAt: ${v.registeredAt}`);
      console.log("   ---");
    });
    console.log(`Total: ${visitors.length} visitors`);
    console.log("=".repeat(60) + "\n");

    res.json({
      success: true,
      total: visitors.length,
      visitors: visitors.map((v) => ({
        id: v._id,
        name: v.fullName,
        email: v.email,
        status: v.status,
        approvalStatus: v.approvalStatus,
        visitDate: v.visitDate,
        registeredAt: v.registeredAt,
      })),
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ success: false, message: "Failed" });
  }
});

app.get("/api/auth/debug-otp/:phone", async (req, res) => {
  if (!sensitiveDebugLoggingEnabled) {
    return res.status(404).json({
      success: false,
      message: "Route not found",
    });
  }
  const { phone } = req.params;
  const cleanPhone = normalizePhoneForOtp(phone);
  const storedData = otpStore.get(cleanPhone);
  if (storedData) {
    res.json({
      phone: cleanPhone,
      otp: storedData.code,
      expiresAt: new Date(storedData.expiresAt),
      attempts: storedData.attempts,
    });
  } else {
    res.json({ phone: cleanPhone, otp: null, message: "No OTP found for this number" });
  }
});

// ============ EMAIL ROUTES ============

// Send approval email
app.post("/api/emails/send-approval", authMiddleware, async (req, res) => {
  try {
    const { to, visitorName, visitDate, visitTime, purpose } = req.body;

    sendEmail(
      to,
      "Visitor Registration Approved - Sapphire Aviation",
      `Dear ${visitorName},\n\nYour visitor registration has been approved.\n\nVisit Details:\nPurpose: ${purpose}\nDate: ${new Date(visitDate).toLocaleDateString()}\nTime: ${new Date(visitTime).toLocaleTimeString()}\n\nPlease sign in using your SafePass visitor account. If you need a new password, use the password reset option on the login screen.\n\n${getSupportEmailSignature()}`,
    );

    res.json({
      success: true,
      message: "Approval email sent",
    });
  } catch (error) {
    console.error("Send approval email error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});

// Send rejection email
app.post("/api/emails/send-rejection", authMiddleware, async (req, res) => {
  try {
    const { to, visitorName, reason } = req.body;

    sendEmail(
      to,
      "Visitor Registration Update - Sapphire Aviation",
      `Dear ${visitorName},\n\nWe regret to inform you that your visitor registration has been rejected.\n\nReason: ${reason || "No specific reason provided"}\n\nIf you have any questions, please contact us.\n\nThank you,\nSapphire Aviation Security Team`,
    );

    res.json({
      success: true,
      message: "Rejection email sent",
    });
  } catch (error) {
    console.error("Send rejection email error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});

// ============ EXISTING ROUTES (Keep all your existing routes) ============

// 6. CREATE ACCESS LOG (Protected)
app.post("/api/access-log", authMiddleware, async (req, res) => {
  try {
    const { location, accessType, status, notes } = req.body;

    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: location || "Unknown Location",
      accessType: accessType || "entry",
      status: status || "pending",
      nfcCardId: req.user.nfcCardId,
      notes: notes || "",
    });

    await accessLog.save();

    res.status(201).json({
      success: true,
      message: "Access log created",
      accessLog,
    });
  } catch (error) {
    console.error("âŒ Create access log error:", error);
    res.status(500).json({ error: "Failed to create access log" });
  }
});

// 7. GET USER ACCESS LOGS (Protected)
app.get("/api/access-logs", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const requesterRole = normalizeUserRoleValue(req.user?.role);
    const canViewAllLogs = ["admin", "security", "guard", "staff"].includes(requesterRole);
    const query = {};

    if (!canViewAllLogs || String(req.query.all || "").toLowerCase() !== "true") {
      query.userId = req.user._id;
    }

    applyDateRangeFilter(query, "timestamp", req.query);

    if (req.query.status) query.status = String(req.query.status).trim().toLowerCase();
    if (req.query.accessType) query.accessType = String(req.query.accessType).trim().toLowerCase();
    if (req.query.activityType) query.activityType = String(req.query.activityType).trim();
    if (req.query.location) {
      query.location = { $regex: String(req.query.location).trim(), $options: "i" };
    }
    if (req.query.userType) {
      query.$or = [
        { actorRole: String(req.query.userType).trim().toLowerCase() },
        { "metadata.userType": String(req.query.userType).trim().toLowerCase() },
      ];
    }

    const accessLogs = await AccessLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AccessLog.countDocuments(query);

    res.json({
      success: true,
      accessLogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("âŒ Get access logs error:", error);
    res.status(500).json({ error: "Failed to fetch access logs" });
  }
});

// 8. LEGACY NFC SCAN SIMULATION (Deprecated)
app.post("/api/nfc-scan", authMiddleware, requireRoles("admin", "security", "guard", "staff"), async (req, res) => {
  try {
    return res.status(410).json({
      success: false,
      message: "This legacy NFC simulation endpoint is disabled. Use /api/nfc/station/tap for live checkpoint taps.",
    });
  } catch (error) {
    console.error("âŒ NFC scan error:", error);
    res.status(500).json({ error: "NFC scan failed" });
  }
});

// 9. LOGOUT (Protected)
app.post("/api/logout", authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Logout failed" });
  }
});

// 10. HEALTH CHECK (Updated)
app.get("/api/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "OK" : "DEGRADED",
    success: databaseConnected,
    service: "SafePass API",
    timestamp: new Date(),
  });
});

// 11. GET STATS (Protected)
app.get("/api/stats", authMiddleware, async (req, res) => {
  try {
    const totalAccess = await AccessLog.countDocuments({
      userId: req.user._id,
    });
    const grantedAccess = await AccessLog.countDocuments({
      userId: req.user._id,
      status: "granted",
    });
    const deniedAccess = await AccessLog.countDocuments({
      userId: req.user._id,
      status: "denied",
    });

    res.json({
      success: true,
      totalAccess,
      grantedAccess,
      deniedAccess,
      successRate:
        totalAccess > 0
          ? ((grantedAccess / totalAccess) * 100).toFixed(1) + "%"
          : "0%",
    });
  } catch (error) {
    console.error("âŒ Get stats error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

// 12. DEMO USER CREATION (For testing)
app.post("/api/create-demo-user", async (req, res) => {
  try {
    const demoUser = new User({
      firstName: "Demo",
      lastName: "User",
      email: "demo@student.sapphire.edu",
      password: "password123",
      phone: "12345678901",
      role: "student",
      studentId: "20240001",
      course: "Bachelor of Science in Aviation",
      yearLevel: "1st Year",
      emergencyContact: "John Doe - 09876543210",
      nfcCardId: "SAFEPASS-DEMO-001",
    });

    await demoUser.save();

    res.json({
      success: true,
      message: "Demo user created",
      user: {
        email: demoUser.email,
        password: "password123",
      },
    });
  } catch (error) {
    console.error("âŒ Demo user creation error:", error);
    res.status(500).json({ error: "Failed to create demo user" });
  }
});

// ============ EXISTING VISITOR ROUTES ============

// Get all visitors (for admin, staff, and security dashboards)
app.get("/api/visitors", authMiddleware, requireRoles("admin", "staff", "security", "guard"), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    let query = {};
    if (status) query.status = status;
    applyDateRangeFilter(query, "visitDate", req.query);

    const { visitorPayloads, total } = await runMongoReadWithRetry(
      async () => {
        const [visitorRecords, visitorTotal] = await Promise.all([
          Visitor.find(query)
            .sort({ registeredAt: -1 })
            .limit(parsedLimit)
            .skip((parsedPage - 1) * parsedLimit)
            .populate("checkedInBy", "firstName lastName")
            .populate("checkedOutBy", "firstName lastName")
            .lean(),
          Visitor.countDocuments(query),
        ]);

        const payloads = await attachSafePassIdsToVisitors(visitorRecords, {
          ensureMissingIds: false,
        });

        return { visitorPayloads: payloads, total: visitorTotal };
      },
      "Get visitors",
    );

    res.json({
      success: true,
      visitors: visitorPayloads,
      totalPages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
      total,
    });
  } catch (error) {
    console.error("Get visitors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch visitors",
    });
  }
});

// Security incident reports are stored on visitor records. Return a flattened,
// paginated view so the Security dashboard is not limited by the visitor list.
app.get(
  "/api/security/reports",
  authMiddleware,
  requireRoles("admin", "security", "guard"),
  async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
      const requestedStatus = String(req.query.status || "all").trim().toLowerCase();

      const visitors = await Visitor.find({ "reports.0": { $exists: true } })
        .select("fullName email assignedOffice reports")
        .populate("reports.reportedBy", "firstName lastName email role")
        .lean();

      const reports = visitors
        .flatMap((visitor) =>
          (visitor.reports || []).map((report, index) => ({
            _id: String(report._id || `${visitor._id}-report-${index}`),
            visitorId: visitor._id,
            visitorName: visitor.fullName || "Unnamed Visitor",
            visitorEmail: visitor.email || "",
            assignedOffice: visitor.assignedOffice || "",
            reason: report.reason || "Security incident",
            createdAt: report.reportedAt || visitor.updatedAt || visitor.registeredAt,
            status: report.resolved ? "Resolved" : "Open",
            resolved: Boolean(report.resolved),
            resolvedAt: report.resolvedAt || null,
            resolutionNotes: report.resolutionNotes || "",
            reportedBy: report.reportedBy || null,
          })),
        )
        .filter((report) =>
          requestedStatus === "all" || String(report.status).toLowerCase() === requestedStatus,
        )
        .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

      const total = reports.length;
      const start = (page - 1) * limit;
      res.json({
        success: true,
        reports: reports.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (error) {
      console.error("Get security reports error:", error);
      res.status(500).json({ success: false, message: "Failed to load security reports" });
    }
  },
);

app.get(
  "/api/attendance",
  authMiddleware,
  requireRoles("admin", "security", "guard", "staff"),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;
      const safeLimit = Math.min(Math.max(limit, 1), 500);
      const skip = (page - 1) * safeLimit;
      const query = {};

      applyDateRangeFilter(query, "attendanceDate", req.query);

      if (req.query.userType) query.userType = String(req.query.userType).trim().toLowerCase();
      if (req.query.status) query.status = String(req.query.status).trim().toLowerCase();
      if (req.query.module) query.module = String(req.query.module).trim().toLowerCase();
      if (req.query.location) {
        query.location = { $regex: String(req.query.location).trim(), $options: "i" };
      }
      if (req.query.search) {
        const searchPattern = { $regex: String(req.query.search).trim(), $options: "i" };
        query.$or = [
          { name: searchPattern },
          { userType: searchPattern },
          { role: searchPattern },
          { status: searchPattern },
          { location: searchPattern },
          { checkpointIn: searchPattern },
          { checkpointOut: searchPattern },
          { nfcCardId: searchPattern },
          { sourceDeviceId: searchPattern },
        ];
      }

      const [records, total] = await Promise.all([
        AttendanceRecord.find(query)
          .sort({ attendanceDate: -1, checkInTime: -1, createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean(),
        AttendanceRecord.countDocuments(query),
      ]);

      res.json({
        success: true,
        attendance: records,
        pagination: {
          page,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit),
        },
      });
    } catch (error) {
      console.error("Get attendance records error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch attendance records",
      });
    }
  },
);

app.get(
  "/api/attendance/summary",
  authMiddleware,
  requireRoles("admin", "security", "guard", "staff"),
  async (req, res) => {
    try {
      const query = {};
      applyDateRangeFilter(query, "attendanceDate", req.query);
      if (req.query.userType) query.userType = String(req.query.userType).trim().toLowerCase();

      const [summaryCounts = {}] = await AttendanceRecord.aggregate([
        { $match: query },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  late: { $sum: { $cond: ["$isLate", 1, 0] } },
                  noShow: { $sum: { $cond: ["$isNoShow", 1, 0] } },
                  expired: { $sum: { $cond: ["$isExpired", 1, 0] } },
                  completed: { $sum: { $cond: ["$isCompleted", 1, 0] } },
                },
              },
            ],
            byUserType: [{ $group: { _id: "$userType", count: { $sum: 1 } } }],
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          },
        },
        {
          $project: {
            totals: { $ifNull: [{ $arrayElemAt: ["$totals", 0] }, {}] },
            byUserType: 1,
            byStatus: 1,
          },
        },
      ]);

      const totals = summaryCounts.totals || {};
      const summary = {
        total: totals.total || 0,
        late: totals.late || 0,
        noShow: totals.noShow || 0,
        expired: totals.expired || 0,
        completed: totals.completed || 0,
        byUserType: Object.fromEntries(
          (summaryCounts.byUserType || [])
            .filter((item) => item._id)
            .map((item) => [item._id, item.count]),
        ),
        byStatus: Object.fromEntries(
          (summaryCounts.byStatus || [])
            .filter((item) => item._id)
            .map((item) => [item._id, item.count]),
        ),
      };

      res.json({ success: true, summary });
    } catch (error) {
      console.error("Get attendance summary error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch attendance summary",
      });
    }
  },
);

app.get("/api/my-attendance", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const query = {
      userId: req.user._id,
    };

    applyDateRangeFilter(query, "attendanceDate", req.query);

    const [records, total] = await Promise.all([
      AttendanceRecord.find(query)
        .sort({ attendanceDate: -1, checkInTime: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AttendanceRecord.countDocuments(query),
    ]);

    res.set("Cache-Control", "no-store");
    res.json({
      success: true,
      attendance: records,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get my attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your attendance records",
    });
  }
});

app.post("/api/my-attendance/tap", authMiddleware, async (req, res) => {
  try {
    const normalizedRole = normalizeUserRoleValue(req.user?.role);
    const allowedSelfTapRoles = ["student", "teacher", "staff"];

    if (!allowedSelfTapRoles.includes(normalizedRole)) {
      return res.status(403).json({
        success: false,
        message: "Self check-in is only available for student, teacher, and staff accounts.",
      });
    }

    const requestedAction = String(req.body?.action || "")
      .trim()
      .toLowerCase();
    const action = requestedAction === "checkout" ? "check_out" : requestedAction;

    if (!["check_in", "check_out"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Choose check_in or check_out.",
      });
    }

    const now = new Date();
    const dayStart = getStartOfDay(now);
    const dayEnd = getEndOfDay(now);
    const latestAttendance = await AttendanceRecord.findOne({
      userId: req.user._id,
      attendanceDate: { $gte: dayStart, $lt: dayEnd },
      module: getAttendanceModuleForRole(normalizedRole, req.user),
    }).sort({ createdAt: -1 });
    const hasOpenAttendance = Boolean(
      latestAttendance?.checkInTime && !latestAttendance?.checkOutTime,
    );

    if (action === "check_in" && hasOpenAttendance) {
      return res.status(409).json({
        success: false,
        message: "You are already checked in.",
        attendance: latestAttendance,
      });
    }

    if (action === "check_out" && !hasOpenAttendance) {
      return res.status(400).json({
        success: false,
        message: "You need to check in before checking out.",
      });
    }

    const source = String(req.body?.source || "mobile_app").trim().toLowerCase();
    const isStaffVirtualCard = normalizedRole === "staff" && source === "virtual_nfc_card";
    const nfcCardId = isStaffVirtualCard
      ? normalizeNfcCardId(req.user?.nfcCardId || req.body?.nfcCardId || "")
      : normalizeNfcCardId(req.body?.nfcCardId || req.user?.nfcCardId || "");

    if (isStaffVirtualCard && !nfcCardId) {
      return res.status(400).json({
        success: false,
        message: "No NFC card is assigned to this staff account yet.",
      });
    }

    const tapLocation = {
      floor: String(req.body?.floor || "Mobile").trim(),
      office: String(
        req.body?.office ||
          (isStaffVirtualCard ? "Staff Virtual NFC Card" : "Mobile Checkpoint"),
      ).trim(),
      checkpointId: String(
        req.body?.checkpointId ||
          (isStaffVirtualCard ? "staff-virtual-nfc" : "mobile-self-check"),
      ).trim(),
    };
    const deviceId = String(
      req.body?.deviceId ||
        (isStaffVirtualCard ? "staff-virtual-nfc-card" : "mobile-self-check"),
    ).trim();
    const attendanceRecord = await upsertAttendanceRecordForTap({
      user: req.user,
      action,
      tapLocation,
      timestamp: now,
      nfcCardId,
      deviceId,
    });
    const userName = getFullName(req.user) || req.user.email || "Campus user";

    await AccessLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userName,
      actorRole: normalizedRole,
      location: tapLocation.office,
      accessType: action === "check_out" ? "exit" : "entry",
      activityType: `self_${normalizedRole}_${action}`,
      status: "granted",
      nfcCardId,
      relatedUser: req.user._id,
      metadata: {
        action,
        source,
        userType: normalizedRole,
        securityVisible: true,
        tapLocation,
        attendanceRecordId: attendanceRecord._id,
      },
      notes: `${userName} used ${isStaffVirtualCard ? "the staff virtual NFC card" : "mobile self check"} to ${action.replace("_", " ")}.`,
    });

    await sendCampusTapSecurityNotifications({
      user: req.user,
      action,
      timestamp: now,
      status: attendanceRecord.status,
      tapLocation,
      attendanceRecord,
      deviceId: source,
    });

    await sendStudentParentAttendanceEmail({
      student: req.user,
      action,
      timestamp: now,
      tapLocation,
    });

    res.json({
      success: true,
      message: action === "check_in" ? "Check-in recorded." : "Check-out recorded.",
      action,
      attendance: attendanceRecord,
      nfcCardId,
    });
  } catch (error) {
    console.error("Self attendance tap error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record your attendance tap.",
    });
  }
});

app.get(
  "/api/security/live-visitor-locations",
  authMiddleware,
  requireRoles("admin", "security", "guard"),
  async (req, res) => {
    try {
      const requestedLimit = Number.parseInt(req.query?.limit, 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 300)
        : 200;
      const activeVisitors = await getActiveLiveVisitors(limit);
      const visitorIds = activeVisitors.map((visitor) => visitor._id).filter(Boolean);
      const recentMovements = visitorIds.length
        ? await VisitorMovementLog.find({ visitorId: { $in: visitorIds } })
            .sort({ tappedAt: -1 })
            .limit(visitorIds.length * 10)
            .lean()
        : [];
      const movementsByVisitor = recentMovements.reduce((groups, movement) => {
        const key = String(movement.visitorId || "");
        if (!groups[key]) groups[key] = [];
        if (groups[key].length < 8) groups[key].push(movement);
        return groups;
      }, {});
      const enrichedVisitors = activeVisitors.map((visitor) => {
        const movementHistory = movementsByVisitor[String(visitor._id)] || [];
        return {
          ...visitor,
          recentMovementHistory: movementHistory,
          recentWrongLocationAlerts: movementHistory.filter(
            (movement) => movement.status === "wrong_location",
          ),
        };
      });

      res.json({
        success: true,
        generatedAt: new Date(),
        visitors: enrichedVisitors.map((visitor) => buildLiveVisitorLocationPayload(visitor)),
      });
    } catch (error) {
      console.error("Get live visitor locations error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch live visitor locations",
      });
    }
  },
);

app.get(
  "/api/security/live-presence",
  authMiddleware,
  requireRoles("admin", "security", "guard"),
  async (req, res) => {
    try {
      const requestedLimit = Number.parseInt(req.query?.limit, 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 300)
        : 200;
      const todayStart = getStartOfDay(new Date());
      const todayEnd = getEndOfDay(new Date());

      const activeRecords = await AttendanceRecord.find({
        attendanceDate: { $gte: todayStart, $lt: todayEnd },
        checkInTime: { $ne: null },
        checkOutTime: null,
      })
        .sort({ lastTapTime: -1, checkInTime: -1, createdAt: -1 })
        .limit(limit)
        .lean();

      const latestByIdentity = new Map();
      activeRecords.forEach((record) => {
        const identity = String(record?.visitorId || record?.userId || record?._id || "");
        if (!identity || latestByIdentity.has(identity)) {
          return;
        }
        latestByIdentity.set(identity, record);
      });

      const presence = Array.from(latestByIdentity.values()).map((record) =>
        buildLivePresencePayload(record),
      );

      const summary = presence.reduce(
        (accumulator, item) => {
          accumulator.total += 1;
          accumulator.byUserType[item.userType] =
            (accumulator.byUserType[item.userType] || 0) + 1;
          return accumulator;
        },
        {
          total: 0,
          byUserType: {},
        },
      );

      res.json({
        success: true,
        generatedAt: new Date(),
        presence,
        summary,
      });
    } catch (error) {
      console.error("Get live presence error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch live presence",
      });
    }
  },
);

app.get("/api/visitor/current-destination", authMiddleware, requireRoles("visitor"), async (req, res) => {
  try {
    const visitor = await Visitor.findOne({
      email: req.user.email,
      status: { $ne: "checked_out" },
    }).sort({ checkedInAt: -1, visitDate: -1, registeredAt: -1 });

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "No active visitor appointment found.",
      });
    }

    res.json({
      success: true,
      destination: {
        office: getAssignedAppointmentOffice(visitor) || "Assigned destination pending",
        currentDestination: visitor.currentDestination || null,
        currentLocation: visitor.currentLocation || null,
        status: visitor.status,
        appointmentStatus: visitor.appointmentStatus,
      },
    });
  } catch (error) {
    console.error("Get current visitor destination error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load current destination.",
    });
  }
});

app.get("/api/visitor/:visitorId/movement-history", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.visitorId);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Visitor not found." });
    }

    const requesterRole = String(req.user.role || "").toLowerCase();
    const isOwner =
      requesterRole === "visitor" &&
      String(visitor.email || "").toLowerCase() === String(req.user.email || "").toLowerCase();
    const canView = isOwner || ["admin", "security", "guard", "staff"].includes(requesterRole);

    if (!canView) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const query = { visitorId: visitor._id };
    applyDateRangeFilter(query, "tappedAt", req.query);
    if (req.query.status && req.query.status !== "all") {
      query.status = String(req.query.status);
    }

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 300);
    const movementHistory = await VisitorMovementLog.find(query)
      .sort({ tappedAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      visitor: {
        _id: visitor._id,
        fullName: visitor.fullName,
        currentLocation: visitor.currentLocation,
        currentDestination: visitor.currentDestination,
      },
      movementHistory,
    });
  } catch (error) {
    console.error("Get visitor movement history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load visitor movement history.",
    });
  }
});

app.patch(
  "/api/staff/visitors/:visitorId/destination",
  authMiddleware,
  requireRoles("staff", "admin"),
  async (req, res) => {
    try {
      const visitor = await Visitor.findById(req.params.visitorId);
      if (!visitor) {
        return res.status(404).json({ success: false, message: "Visitor not found." });
      }

      if (visitor.requestCategory !== "appointment") {
        return res.status(400).json({
          success: false,
          message: "Only appointment visitors can be redirected to another office.",
        });
      }

      if (!["approved", "adjusted"].includes(String(visitor.appointmentStatus || "").toLowerCase())) {
        return res.status(409).json({
          success: false,
          message: "Only approved or adjusted appointments can be redirected.",
        });
      }

      const requestedOffice = String(
        req.body?.office ||
          req.body?.destination ||
          req.body?.nextDestination ||
          req.body?.appointmentDepartment ||
          "",
      ).trim();

      if (!requestedOffice) {
        return res.status(400).json({
          success: false,
          message: "Next destination office is required.",
        });
      }

      const location = getOfficeLocationFromValue(req.body?.checkpointId || requestedOffice);
      const destinationOffice = location.office || requestedOffice;
      visitor.updateNextDestination({
        office: destinationOffice,
        floor: req.body?.floor || location.floor,
        checkpointId: req.body?.checkpointId || location.checkpointId,
        reason: req.body?.reason || "Visitor redirected by staff.",
        staffUser: req.user,
      });
      await visitor.save();
      const visitorAccount = await User.findOne({
        email: String(visitor.email || "").toLowerCase(),
        role: "visitor",
      }).select("_id email");

      const movementLog = await createVisitorMovementLog({
        visitor,
        visitorUser: null,
        tapLocation: {
          ...location,
          office: destinationOffice,
          source: "staff_redirect",
        },
        expectedDestination: destinationOffice,
        status: "redirected",
        handledBy: req.user,
        message: `${visitor.fullName} was redirected to ${destinationOffice} by ${getFullName(req.user) || req.user.email}.`,
        metadata: {
          reason: req.body?.reason || "",
          previousDestination: visitor.destinationHistory?.at?.(-1)?.fromOffice || "",
        },
      });

      await Promise.all([
        createRoleNotification({
          title: "Destination Updated",
          message: `Please proceed to ${destinationOffice}. Staff updated your next destination.`,
          type: "info",
          severity: "medium",
          targetRole: "visitor",
          targetUser: visitorAccount?._id || null,
          relatedVisitor: visitor._id,
          relatedUser: visitorAccount?._id || null,
          metadata: {
            activityType: "visitor_destination_redirected",
            destinationOffice,
            movementLogId: movementLog._id,
          },
        }),
        createRoleNotification({
          title: "Visitor Redirected",
          message: `${visitor.fullName} was redirected to ${destinationOffice} by ${getFullName(req.user) || req.user.email}.`,
          type: "info",
          severity: "medium",
          targetRole: "security",
          relatedVisitor: visitor._id,
          relatedUser: req.user._id,
          metadata: {
            activityType: "visitor_destination_redirected",
            destinationOffice,
            movementLogId: movementLog._id,
          },
        }),
      ]);

      await AccessLog.create({
        userId: req.user._id,
        userEmail: req.user.email,
        userName: getFullName(req.user) || req.user.email,
        actorRole: req.user.role,
        location: destinationOffice,
        accessType: "system",
        activityType: "visitor_destination_redirected",
        status: "granted",
        relatedVisitor: visitor._id,
        relatedUser: req.user._id,
        metadata: {
          destination: visitor.currentDestination,
          movementLogId: movementLog._id,
        },
        notes: `${visitor.fullName} was redirected to ${destinationOffice}.`,
      });

      res.json({
        success: true,
        message: `Visitor destination updated to ${destinationOffice}.`,
        visitor,
        movementLog,
      });
    } catch (error) {
      console.error("Update visitor destination error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update visitor destination.",
      });
    }
  },
);

// Get single visitor by ID
app.get("/api/visitors/:id", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id)
      .populate("checkedInBy", "firstName lastName")
      .populate("checkedOutBy", "firstName lastName");

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    const requesterRole = String(req.user.role || "").toLowerCase();
    const canViewVisitor =
      ["admin", "staff", "security", "guard"].includes(requesterRole) ||
      isVisitorOwner(req.user, visitor);

    if (!canViewVisitor) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    res.json({
      success: true,
      visitor,
    });
  } catch (error) {
    console.error("Get visitor error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch visitor",
    });
  }
});

// Update visitor (admin/security)
app.put("/api/visitors/:id", authMiddleware, requireRoles("admin", "security"), async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates._id;
    delete updates.__v;
    delete updates.registeredAt;

    const visitor = await Visitor.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true },
    );

    if (!visitor) {
      return res.status(404).json({ success: false, message: "Visitor not found" });
    }

    res.json({ success: true, message: "Visitor updated successfully", visitor });
  } catch (error) {
    console.error("Update visitor error:", error);
    res.status(500).json({ success: false, message: "Failed to update visitor" });
  }
});

// Delete visitor (admin only)
app.delete("/api/visitors/:id", authMiddleware, requireRoles("admin"), async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Visitor not found" });
    }

    await Visitor.findByIdAndDelete(req.params.id);

    if (visitor.email) {
      await User.deleteOne({ email: visitor.email.toLowerCase().trim(), role: "visitor" });
    }

    res.json({ success: true, message: "Visitor deleted successfully" });
  } catch (error) {
    console.error("Delete visitor error:", error);
    res.status(500).json({ success: false, message: "Failed to delete visitor" });
  }
});

// Visitor self check-in
app.put("/api/visitors/:id/self-checkin", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    const checkInSource = String(req.body?.source || "mobile_app")
      .trim()
      .toLowerCase();
    const sourceLabel =
      checkInSource === "virtual_nfc_card" ? "virtual NFC card" : "mobile app";

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (!isVisitorOwner(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only check in using your own visitor appointment.",
      });
    }

    if (!isUserSafePassCardActive(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Your SafePass card is not active. Please contact admin or security.",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    const checkInEligibility = getVisitorCheckInEligibility(visitor);
    if (!checkInEligibility.allowed) {
      return res.status(checkInEligibility.statusCode || 400).json({
        success: false,
        message: checkInEligibility.message,
      });
    }

    visitor.markCheckedIn(req.user._id);
    visitor.updateCurrentLocation(getVisitorCheckInLocation(visitor, checkInSource), {
      deviceId: checkInSource === "virtual_nfc_card" ? "visitor-app" : "mobile-app",
      action: "check_in",
    });
    await visitor.save();

    // Create access log
    const accessLog = new AccessLog({
      userEmail: visitor.email,
      userName: visitor.fullName,
      location: checkInSource === "virtual_nfc_card" ? "Virtual NFC Card" : "Mobile App",
      accessType: "entry",
      activityType: "visitor_self_checkin",
      status: "granted",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      actorRole: req.user.role,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        source: checkInSource,
        action: "check_in",
        currentLocation: visitor.currentLocation,
      },
      notes: `Visitor self check-in via ${sourceLabel}`,
    });
    await accessLog.save();

    await createRoleNotification({
      title: "Visitor Checked In",
      message: `${visitor.fullName} checked in using the ${sourceLabel}.`,
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      type: "info",
      severity: "low",
      metadata: {
        activityType: "visitor_self_checkin",
        source: checkInSource,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    await createRoleNotification({
      title: "Visitor Checked In",
      message: `${visitor.fullName} checked in using the ${sourceLabel}.`,
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      type: "info",
      severity: "low",
      metadata: {
        activityType: "visitor_self_checkin",
        source: checkInSource,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    res.json({
      success: true,
      message: "Checked in successfully",
      visitor,
    });
  } catch (error) {
    console.error("Self check-in error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check in",
    });
  }
});

// Visitor self check-out
app.put("/api/visitors/:id/self-checkout", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    const checkOutSource = String(req.body?.source || "mobile_app")
      .trim()
      .toLowerCase();
    const sourceLabel =
      checkOutSource === "virtual_nfc_card"
        ? "virtual NFC card"
        : checkOutSource === "visitor_dashboard"
          ? "visitor dashboard"
          : "mobile app";

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (!isVisitorOwner(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only check out using your own visitor appointment.",
      });
    }

    if (!isUserSafePassCardActive(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Your SafePass card is not active. Please contact admin or security.",
      });
    }

    if (visitor.status === "checked_out") {
      return res.status(400).json({
        success: false,
        message: "This visit has already been checked out.",
      });
    }

    if (visitor.status !== "checked_in") {
      return res.status(400).json({
        success: false,
        message: "You must be checked in before you can check out.",
      });
    }

    visitor.markCheckedOut(req.user._id);
    await visitor.save();

    // Create access log
    const accessLog = new AccessLog({
      userEmail: visitor.email,
      userName: visitor.fullName,
      location:
        checkOutSource === "virtual_nfc_card"
          ? "Virtual NFC Card"
          : checkOutSource === "visitor_dashboard"
            ? "Visitor Dashboard"
            : "Mobile App",
      accessType: "exit",
      activityType: "visitor_self_checkout",
      status: "granted",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      actorRole: req.user.role,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        source: checkOutSource,
        action: "check_out",
        currentLocation: visitor.currentLocation,
      },
      notes: `Visitor self check-out via ${sourceLabel}`,
    });
    await accessLog.save();

    await createRoleNotification({
      title: "Visitor Checked Out",
      message: `${visitor.fullName} checked out using the ${sourceLabel}.`,
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      type: "info",
      severity: "low",
      metadata: {
        activityType: "visitor_self_checkout",
        source: checkOutSource,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    await createRoleNotification({
      title: "Visitor Checked Out",
      message: `${visitor.fullName} checked out using the ${sourceLabel}.`,
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      type: "info",
      severity: "low",
      metadata: {
        activityType: "visitor_self_checkout",
        source: checkOutSource,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    res.json({
      success: true,
      message: "Checked out successfully",
      visitor,
    });
  } catch (error) {
    console.error("Self check-out error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check out",
    });
  }
});

// Get visitor access logs
app.get("/api/visitors/:id/logs", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    const requesterRole = String(req.user.role || "").toLowerCase();
    const canReadLogs =
      ["admin", "security", "guard", "staff"].includes(requesterRole) ||
      isVisitorOwner(req.user, visitor);

    if (!canReadLogs) {
      return res.status(403).json({
        success: false,
        message: "You cannot view another visitor's access logs.",
      });
    }

    const logs = await AccessLog.find({
      $or: [{ userEmail: visitor.email }, { userName: visitor.fullName }],
    })
      .sort({ timestamp: -1 })
      .limit(20);

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Get visitor logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get logs",
    });
  }
});

// Visitor appointment ID OCR validation
app.post("/api/appointments/id-ocr/validate", authMiddleware, async (req, res) => {
  try {
    const { idType, imageUri } = req.body || {};
    const normalizedIdType = String(idType || "").trim();
    const normalizedImageUri = String(imageUri || "").trim();

    if (!normalizedIdType) {
      return res.status(400).json({
        success: false,
        isValid: false,
        status: "missing_id_type",
        confidence: 0,
        message: "Choose the valid ID type before scanning.",
      });
    }

    if (!normalizedImageUri) {
      return res.status(400).json({
        success: false,
        isValid: false,
        status: "missing_image",
        confidence: 0,
        message: "Upload a clear ID image before scanning.",
      });
    }

    if (
      !normalizedImageUri.startsWith("data:image/") &&
      !normalizedImageUri.startsWith("http://") &&
      !normalizedImageUri.startsWith("https://")
    ) {
      return res.status(400).json({
        success: false,
        isValid: false,
        status: "unsupported_image_source",
        confidence: 0,
        message: "Please upload the ID photo from your device before scanning.",
      });
    }

    const ocrResult = await callOcrSpace({ imageUri: normalizedImageUri });
    if (!ocrResult.success) {
      const status =
        !REQUIRE_OCR_ID_VALIDATION
          ? "ocr_manual_review_required"
          : "ocr_validation_error";
      const responseStatus = !REQUIRE_OCR_ID_VALIDATION ? 200 : 502;
      return res.status(responseStatus).json({
        success: !REQUIRE_OCR_ID_VALIDATION,
        isValid: !REQUIRE_OCR_ID_VALIDATION,
        status,
        confidence: 0,
        message:
          !REQUIRE_OCR_ID_VALIDATION
            ? "OCR verification is unavailable right now. You can continue; staff or security will complete the final ID review."
            : ocrResult.message ||
              "OCR verification is unavailable right now. Please try again later.",
        checkedAt: new Date().toISOString(),
      });
    }

    const match = scoreOcrIdMatch({
      idType: normalizedIdType,
      rawText: ocrResult.text,
    });
    const isExactMatch = match.hasMeaningfulText && match.hasExpectedMatch && !match.hasConflict;
    const needsManualReview = match.hasMeaningfulText && !match.hasConflict && !match.hasExpectedMatch;
    const isValid = isExactMatch || needsManualReview;
    const hasReadableButWrongType =
      match.hasMeaningfulText && !match.hasExpectedMatch && match.conflictingMatches.length > 0;

    return res.json({
      success: true,
      isValid,
      status: isExactMatch
        ? "ocr_validation_passed"
        : needsManualReview
          ? "ocr_manual_review_required"
          : "ocr_validation_failed",
      confidence: match.confidence,
      idType: normalizedIdType,
      checkedAt: new Date().toISOString(),
      message: isExactMatch
        ? `${normalizedIdType} passed OCR verification. Staff or security will still complete the final review.`
        : needsManualReview
          ? `Readable ID text was detected, but OCR could not confidently match it to ${normalizedIdType}. You can continue; staff or security will complete the final review.`
        : hasReadableButWrongType
          ? `The uploaded ID appears to be a different ID type. Please upload a ${normalizedIdType}.`
          : "OCR could not read enough ID text. Please upload a brighter front photo or try a closer crop of the ID.",
      checks: [
        {
          key: "ocr_text",
          passed: match.hasMeaningfulText,
          label: "Readable ID text detected",
        },
        {
          key: "id_type_match",
          passed: match.hasExpectedMatch,
          label: "Detected ID type matches selection",
        },
        {
          key: "no_conflicting_id_type",
          passed: !match.hasConflict,
          label: "No conflicting ID type detected",
        },
      ],
      details: {
        matchedKeywords: match.matchedKeywords,
        conflictingMatches: match.conflictingMatches,
      },
    });
  } catch (error) {
    console.error("OCR ID validation error:", error);
    res.status(500).json({
      success: false,
      isValid: false,
      status: "ocr_validation_error",
      confidence: 0,
      message: "Failed to validate the ID image. Please try again.",
    });
  }
});

// Visitor appointment slot availability
app.get("/api/appointments/availability", authMiddleware, async (req, res) => {
  try {
    const { date, department, departments } = req.query || {};
    let staffAssignments;
    try { staffAssignments = parseStaffAssignments(req.query.staffAssignments); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const requestedDepartments = [
      ...new Set(
        String(departments || department || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    const activeAppointmentOptions = await getAppointmentOptions({ activeOnly: true });

    if (!date || !requestedDepartments.length) {
      return res.status(400).json({
        success: false,
        message: "Date and office or department are required.",
      });
    }

    const enabledOfficeLabels = activeAppointmentOptions.offices.map((option) => option.label);
    const invalidDepartment = requestedDepartments.find(
      (requestedDepartment) => !isAllowedOption(requestedDepartment, enabledOfficeLabels),
    );
    if (invalidDepartment) {
      return res.status(400).json({
        success: false,
        message: "Please select an enabled office to visit.",
      });
    }

    const staffRoutes = [];
    for (const requestedDepartment of requestedDepartments) {
      if (req.query.staffAssignments != null && !staffAssignments[requestedDepartment]) {
        return res.status(400).json({ success: false, message: "Please select an available staff account for every office." });
      }
      const routedStaff = await findActiveStaffForDepartment(requestedDepartment, staffAssignments[requestedDepartment]);

      if (!routedStaff) {
        return res.json({
          success: true,
          limit: APPOINTMENT_SLOT_LIMIT,
          department: formatDepartmentLabel(requestedDepartment),
          departments: requestedDepartments.map(formatDepartmentLabel),
          assignedStaff: null,
          slots: [],
          message: `No active staff account is assigned to ${requestedDepartment}.`,
        });
      }

      staffRoutes.push({ department: requestedDepartment, routedStaff });
    }


    const selectedDate = new Date(date);
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid appointment date.",
      });
    }

    const selectedDay = new Date(selectedDate);
    selectedDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDay < today) {
      return res.status(400).json({
        success: false,
        message: "Appointment date cannot be in the past.",
      });
    }

    if (!isAppointmentServiceDay(selectedDay)) {
      return res.status(400).json({
        success: false,
        message: "Appointments are only available from Monday to Saturday.",
      });
    }

    const slots = [];
    for (const configuredSlot of activeAppointmentOptions.timeSlots) {
      const hour = Number(configuredSlot.hour);
      const minute = Number(configuredSlot.minute);
      if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;
      const slotLimit = getAppointmentSlotLimit(configuredSlot);

      const slotTime = new Date(selectedDate);
      slotTime.setHours(hour, minute, 0, 0);
      const routeCounts = await Promise.all(
        staffRoutes.map(async ({ department: routedDepartment, routedStaff }, routeIndex) => {
          const count = await countStaffAppointmentsForSlot({
            assignedStaff: routedStaff._id,
            visitDate: selectedDate,
            visitTime: slotTime,
          });
          const selectedOfficeLoadForStaff = staffRoutes.filter((route, compareIndex) =>
            compareIndex <= routeIndex && isSameObjectId(route.routedStaff._id, routedStaff._id),
          ).length;
          const effectiveCount = count + selectedOfficeLoadForStaff - 1;
          return {
            department: formatDepartmentLabel(routedDepartment),
            assignedStaff: {
              id: routedStaff._id,
              name: getFullName(routedStaff),
            },
            count: effectiveCount,
            limit: slotLimit,
            available: Math.max(slotLimit - effectiveCount, 0),
            isFull: effectiveCount >= slotLimit,
          };
        }),
      );
      const maxCount = Math.max(...routeCounts.map((route) => route.count), 0);
      const minAvailable = Math.min(...routeCounts.map((route) => route.available));

      slots.push({
        value: slotTime.toISOString(),
        label: configuredSlot.label,
        hour,
        minute,
        count: maxCount,
        limit: slotLimit,
        capacity: slotLimit,
        available: Math.max(minAvailable, 0),
        isFull: routeCounts.some((route) => route.isFull),
        departments: routeCounts,
      });
    }

    res.json({
      success: true,
      limit: Math.max(...activeAppointmentOptions.timeSlots.map(getAppointmentSlotLimit), APPOINTMENT_SLOT_LIMIT),
      department: requestedDepartments.map(formatDepartmentLabel).join(", "),
      departments: requestedDepartments.map(formatDepartmentLabel),
      assignedStaff:
        staffRoutes.length === 1
          ? {
              id: staffRoutes[0].routedStaff._id,
              name: getFullName(staffRoutes[0].routedStaff),
            }
          : {
              id: "multiple",
              name: `${staffRoutes.length} staff offices`,
            },
      slots,
    });
  } catch (error) {
    console.error("Get appointment availability error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load appointment availability.",
    });
  }
});

// Visitor appointment request / reappointment
app.put("/api/visitors/:userId/visit", authMiddleware, async (req, res) => {
  try {
    let staffAssignments;
    try { staffAssignments = parseStaffAssignments(req.body?.staffAssignments); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const requesterRole = String(req.user.role || "").toLowerCase();
    if (requesterRole !== "visitor" && requesterRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only visitors can create appointment requests.",
      });
    }

    if (requesterRole === "visitor" && !isSameObjectId(req.user._id, req.params.userId)) {
      return res.status(403).json({
        success: false,
        message: "You can only request appointments for your own account.",
      });
    }

    const requestedUserId =
      requesterRole === "visitor" ? req.user._id : req.params.userId;
    const {
      visitDate,
      preferredDate,
      visitTime,
      preferredTime,
      purposeOfVisit,
      purposeCategory,
      customPurposeOfVisit,
      department,
      departments,
      officeToVisit,
      assignedOffice,
      appointmentDepartment,
      idType,
      idNumber,
      idImage,
      idVerification,
      dataPrivacyAccepted,
      dataPrivacyAcceptedAt,
    } = req.body || {};

    const finalVisitDate = visitDate || preferredDate;
    const finalVisitTime = visitTime || preferredTime;
    const normalizedPurposeCategory = String(purposeCategory || "").trim();
    const normalizedCustomPurpose = String(customPurposeOfVisit || "").trim();
    const activeAppointmentOptions = await getAppointmentOptions({ activeOnly: true });
    const requestedDepartments = [
      ...new Set(
        (Array.isArray(departments)
          ? departments
          : String(
              appointmentDepartment || department || officeToVisit || assignedOffice || "",
            ).split(",")
        )
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    ];
    const requestedDepartment = requestedDepartments[0] || "";
    if (req.body.staffAssignments != null && requestedDepartments.some((office) => !staffAssignments[office])) {
      return res.status(400).json({ success: false, message: "Please select an available staff account for every office." });
    }
    const resolvedPurpose =
      normalizedPurposeCategory === "Other" && normalizedCustomPurpose
        ? normalizedCustomPurpose
        : String(purposeOfVisit || normalizedPurposeCategory || "").trim();

    if (!finalVisitDate || !finalVisitTime || !resolvedPurpose) {
      return res.status(400).json({
        success: false,
        message: "Preferred date, preferred time, and purpose of visit are required.",
      });
    }

    if (!isAllowedOption(normalizedPurposeCategory, activeAppointmentOptions.purposes.map((option) => option.label))) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid purpose of visit.",
      });
    }

    if (normalizedPurposeCategory === "Other" && !normalizedCustomPurpose) {
      return res.status(400).json({
        success: false,
        message: "Please enter your custom purpose of visit.",
      });
    }

    if (!requestedDepartments.length) {
      return res.status(400).json({
        success: false,
        message: "Office or department is required for this appointment.",
      });
    }

    const enabledOfficeLabels = activeAppointmentOptions.offices.map((option) => option.label);
    const invalidDepartment = requestedDepartments.find(
      (departmentLabel) => !isAllowedOption(departmentLabel, enabledOfficeLabels),
    );
    if (invalidDepartment) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid office to visit.",
      });
    }

    const appointmentDateTime = getCombinedAppointmentDateTime(finalVisitDate, finalVisitTime);
    if (!appointmentDateTime) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid appointment date and time.",
      });
    }

    const selectedConfiguredSlot = findAppointmentConfiguredSlot(activeAppointmentOptions.timeSlots, appointmentDateTime);
    if (!selectedConfiguredSlot) {
      return res.status(400).json({
        success: false,
        message: "Please select an enabled appointment time slot.",
      });
    }
    const selectedSlotLimit = getAppointmentSlotLimit(selectedConfiguredSlot);

    const minimumScheduleTime = new Date(Date.now() - 60 * 1000);
    if (appointmentDateTime < minimumScheduleTime) {
      return res.status(400).json({
        success: false,
        message: "Appointment schedule cannot be in the past.",
      });
    }

    if (!isAppointmentServiceDay(finalVisitDate)) {
      return res.status(400).json({
        success: false,
        message: "Appointments are only available from Monday to Saturday.",
      });
    }

    const normalizedIdType = String(idType || idNumber || "").trim();
    const normalizedIdImage = String(idImage || "").trim();

    if (!normalizedIdType) {
      return res.status(400).json({
        success: false,
        message: "Please choose which valid ID you will present for appointment verification.",
      });
    }

    if (dataPrivacyAccepted !== true) {
      return res.status(400).json({
        success: false,
        message: "Please confirm the data privacy agreement before submitting.",
      });
    }

    if (!isAllowedOption(normalizedIdType, APPOINTMENT_ID_TYPE_OPTIONS)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid ID type from the list.",
      });
    }

    let idReview = reviewAppointmentIdImage({
      idType: normalizedIdType,
      idImage: normalizedIdImage,
      idVerification:
        idVerification ||
        (!normalizedIdImage
          ? {
              status: "physical_id_required",
              isValid: true,
              message: `${normalizedIdType} will be presented at campus entry for manual verification.`,
            }
          : null),
    });

    if (!idReview.isAccepted) {
      return res.status(400).json({
        success: false,
        code: "ID_PRECHECK_FAILED",
        idValidationStatus: idReview.status,
        message: idReview.message,
      });
    }

    const user = await User.findById(requestedUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (String(user.role).toLowerCase() !== "visitor") {
      return res.status(400).json({
        success: false,
        message: "Only visitor accounts can create appointment requests.",
      });
    }

    if (user.isVerified === false) {
      return res.status(403).json({
        success: false,
        message: "Please verify your visitor account with OTP before requesting an appointment.",
        requiresOtpVerification: true,
      });
    }

    if (String(user.status).toLowerCase() !== "active") {
      return res.status(400).json({
        success: false,
        message: "Your visitor account must be active before requesting another appointment.",
      });
    }

    const visitorFullName = `${user.firstName} ${user.lastName}`.trim();
    const staffRoutes = [];
    for (const departmentLabel of requestedDepartments) {
      const routedStaff = await findActiveStaffForDepartment(departmentLabel, staffAssignments[departmentLabel]);

      if (!routedStaff) {
        return res.status(400).json({
          success: false,
          message: `No active staff account is assigned to ${departmentLabel}. Please choose another office or contact admin.`,
        });
      }

      const slotCount = await countStaffAppointmentsForSlot({
        assignedStaff: routedStaff._id,
        visitDate: finalVisitDate,
        visitTime: finalVisitTime,
      });

      const plannedForStaff = staffRoutes.filter((route) =>
        isSameObjectId(route.routedStaff._id, routedStaff._id),
      ).length;

      if (slotCount + plannedForStaff >= selectedSlotLimit) {
        return res.status(409).json({
          success: false,
          code: "APPOINTMENT_SLOT_FULL",
          message: `${formatDepartmentLabel(departmentLabel)} is already full for that time. Slots are full please select another time or date.`,
          limit: selectedSlotLimit,
          currentCount: slotCount + plannedForStaff,
        });
      }

      staffRoutes.push({ department: departmentLabel, routedStaff });
    }

    const createdVisitors = [];
    for (const { department: departmentLabel, routedStaff } of staffRoutes) {
      const visitor = new Visitor({
        fullName: visitorFullName,
        email: user.email,
        phoneNumber: user.phone || "Not provided",
        idType: normalizedIdType,
        idNumber: normalizedIdType,
        idImage: normalizedIdImage,
        idValidationStatus: idReview.status,
        idValidationNotes: idReview.message,
        idValidationConfidence: idReview.confidence,
        idValidationCheckedAt: idVerification?.checkedAt
          ? new Date(idVerification.checkedAt)
          : new Date(),
        dataPrivacyAccepted: true,
        dataPrivacyAcceptedAt: dataPrivacyAcceptedAt
          ? new Date(dataPrivacyAcceptedAt)
          : new Date(),
      });
      visitor.queueAppointmentRequest({
        purposeOfVisit: resolvedPurpose,
        purposeCategory: normalizedPurposeCategory || undefined,
        customPurposeOfVisit: normalizedCustomPurpose || undefined,
        visitDate: new Date(finalVisitDate),
        visitTime: appointmentDateTime,
        department: formatDepartmentLabel(departmentLabel),
        assignedStaff: routedStaff._id,
        assignedStaffName: getFullName(routedStaff),
      });
      await visitor.save();
      createdVisitors.push({ visitor, routedStaff, departmentLabel });
    }

    const prioritizedVisitor = getPrioritizedVisitor(await findVisitorsForUser(user));
    if (prioritizedVisitor) {
      user.visitorId = prioritizedVisitor._id;
      await user.save();
    }

    for (const { visitor, routedStaff } of createdVisitors) {
      await createRoleNotification({
        title: "New Department Appointment Request",
        message: `${visitor.fullName} requested ${visitor.appointmentDepartment || visitor.assignedOffice} on ${new Date(visitor.visitDate).toLocaleDateString()} at ${new Date(visitor.visitTime).toLocaleTimeString()}. Purpose: ${visitor.purposeOfVisit}`,
        type: "visitor",
        severity: "medium",
        targetRole: "staff",
        targetUser: routedStaff._id,
        relatedVisitor: visitor._id,
        relatedUser: user._id,
        metadata: {
          activityType: "visitor_appointment_request",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          purposeOfVisit: visitor.purposeOfVisit,
          purposeCategory: visitor.purposeCategory,
          customPurposeOfVisit: visitor.customPurposeOfVisit,
          department: visitor.appointmentDepartment || visitor.assignedOffice,
        },
      });

      await createRoleNotification({
        title: "Visitor Appointment Requested",
        message: `${visitor.fullName} submitted a new appointment request for ${visitor.appointmentDepartment || visitor.assignedOffice}.`,
        type: "info",
        severity: "medium",
        targetRole: "admin",
        relatedVisitor: visitor._id,
        relatedUser: user._id,
        metadata: {
          activityType: "visitor_appointment_request",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          purposeOfVisit: visitor.purposeOfVisit,
          department: visitor.appointmentDepartment || visitor.assignedOffice,
          assignedStaff: routedStaff._id,
        },
      });

      await createSystemActivity({
        actorUser: user,
        relatedVisitor: visitor,
        relatedUser: user,
        activityType: "visitor_appointment_request",
        status: "pending",
        location: visitor.appointmentDepartment || visitor.assignedOffice || "Appointment Request",
        notes: `${visitor.fullName} requested a new appointment for ${visitor.appointmentDepartment || visitor.assignedOffice}.`,
        metadata: {
          requestCategory: "appointment",
          approvalFlow: "staff",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          purposeOfVisit: visitor.purposeOfVisit,
          department: visitor.appointmentDepartment || visitor.assignedOffice,
          assignedStaff: routedStaff._id,
        },
      });
    }

    const afterHoursNotice = getAfterHoursAppointmentNotice(new Date());

    res.json({
      success: true,
      message: createdVisitors.length > 1
        ? "Appointment requests submitted successfully"
        : "Appointment request submitted successfully",
      visitor: createdVisitors[0]?.visitor,
      visitors: createdVisitors.map(({ visitor }) => visitor),
      appointmentStatus: "pending",
      afterHours: afterHoursNotice.isAfterHours,
      afterHoursNotice: afterHoursNotice.isAfterHours
        ? {
            title: afterHoursNotice.title,
            message: afterHoursNotice.message,
            nextOfficeOpenAt: afterHoursNotice.nextOfficeOpenAt,
            officeHours: afterHoursNotice.officeHours,
          }
        : null,
      idValidationStatus: idReview.status,
      idValidationMessage: idReview.message,
      idValidationConfidence: idReview.confidence,
    });
  } catch (error) {
    console.error("Update visitor visit error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to schedule visit",
    });
  }
});

const canVisitorManageAppointment = (visitor = {}) => {
  const appointmentStatus = String(visitor.appointmentStatus || "").toLowerCase();
  const visitStatus = String(visitor.status || "").toLowerCase();
  if (visitor.requestCategory !== "appointment" || visitor.approvalFlow !== "staff") {
    return false;
  }
  if (["rejected", "cancelled", "completed"].includes(appointmentStatus)) return false;
  if (["checked_in", "checked_out", "expired", "no_show", "rejected", "cancelled"].includes(visitStatus)) return false;
  if (visitor.visitExpiredAt || visitor.noShowMarkedAt) return false;
  if (visitor.appointmentCompletedAt) return false;
  return ["pending", "approved", "adjusted", "adjustment_pending", "rescheduled"].includes(appointmentStatus);
};

const isLatestVisitorAppointment = async (visitor = {}) => {
  const visitorUser = await User.findOne({ email: visitor.email, role: "visitor" });
  const visitorRecords = visitorUser
    ? await findVisitorsForUser(visitorUser)
    : await Visitor.find({ email: String(visitor.email || "").trim().toLowerCase() });
  const latestVisitor = getPrioritizedVisitor(visitorRecords);
  return Boolean(latestVisitor && isSameObjectId(latestVisitor._id, visitor._id));
};

app.put("/api/visitors/:id/appointment/accept-adjustment", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (!isVisitorOwner(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only confirm your own appointment.",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    if (String(visitor.appointmentStatus || "").toLowerCase() !== "adjustment_pending") {
      return res.status(400).json({
        success: false,
        message: "There is no staff proposed schedule waiting for confirmation.",
      });
    }

    if (!(await isLatestVisitorAppointment(visitor))) {
      return res.status(400).json({
        success: false,
        message: "Only your latest appointment request can be confirmed.",
      });
    }

    const visitorUser = await User.findOne({ email: visitor.email, role: "visitor" });
    visitor.acceptStaffAdjustment(req.user);
    await visitor.save();

    if (visitorUser) {
      await activateVisitorSafePassCardForUser(visitorUser, visitor);
    }

    const visitSchedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);

    await Promise.all([
      createRoleNotification({
        title: "Adjusted Appointment Confirmed",
        message: `${visitor.fullName} accepted the staff proposed appointment for ${visitSchedule}.`,
        type: "success",
        severity: "low",
        targetRole: "staff",
        targetUser: visitor.assignedStaff || null,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_accepted_staff_adjustment",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
        },
      }),
      createRoleNotification({
        title: "Visitor Appointment Confirmed",
        message: `${visitor.fullName} confirmed the adjusted visit for ${visitSchedule}.`,
        type: "success",
        severity: "low",
        targetRole: "security",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_accepted_staff_adjustment",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
        },
      }),
      createRoleNotification({
        title: "Visitor Appointment Confirmed",
        message: `${visitor.fullName} confirmed the adjusted visit for ${visitSchedule}.`,
        type: "success",
        severity: "low",
        targetRole: "admin",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_accepted_staff_adjustment",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
        },
      }),
    ]);

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "visitor_accepted_staff_adjustment",
      status: "granted",
      location: visitor.appointmentDepartment || visitor.assignedOffice || "Appointment Request",
      notes: `${visitor.fullName} accepted the adjusted appointment for ${visitSchedule}.`,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");
    const [updatedVisitorPayload] = await attachSafePassIdsToVisitors([updatedVisitor]);

    res.json({
      success: true,
      message: "Appointment confirmed. Your virtual SafePass card is now scheduled for that visit window.",
      visitor: updatedVisitorPayload,
    });
  } catch (error) {
    console.error("Accept staff adjustment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to confirm adjusted appointment.",
    });
  }
});

app.put("/api/visitors/:id/appointment/reschedule", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    const requesterRole = String(req.user.role || "").toLowerCase();
    if (requesterRole !== "admin" && !isVisitorOwner(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own appointment.",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    if (!canVisitorManageAppointment(visitor)) {
      return res.status(400).json({
        success: false,
        message: "This appointment can no longer be edited.",
      });
    }

    if (requesterRole !== "admin" && !(await isLatestVisitorAppointment(visitor))) {
      return res.status(400).json({
        success: false,
        message: "Only your latest appointment request can be edited. Older appointments are read-only history.",
      });
    }

    const { visitDate, preferredDate, visitTime, preferredTime, reason = "" } = req.body || {};
    const finalVisitDate = visitDate || preferredDate || visitor.visitDate;
    const finalVisitTime = visitTime || preferredTime || visitor.visitTime;
    const appointmentDateTime = getCombinedAppointmentDateTime(finalVisitDate, finalVisitTime);

    if (!appointmentDateTime) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid appointment date and time.",
      });
    }

    if (appointmentDateTime < new Date(Date.now() - 60 * 1000)) {
      return res.status(400).json({
        success: false,
        message: "Appointment schedule cannot be in the past.",
      });
    }

    if (!isAppointmentServiceDay(finalVisitDate)) {
      return res.status(400).json({
        success: false,
        message: "Appointments are only available from Monday to Saturday.",
      });
    }

    const activeAppointmentOptions = await getAppointmentOptions({ activeOnly: true });
    const selectedConfiguredSlot = findAppointmentConfiguredSlot(activeAppointmentOptions.timeSlots, appointmentDateTime);
    if (!selectedConfiguredSlot) {
      return res.status(400).json({
        success: false,
        message: "Please select an enabled appointment time slot.",
      });
    }

    const selectedSlotLimit = getAppointmentSlotLimit(selectedConfiguredSlot);
    const slotCount = await countStaffAppointmentsForSlot({
      assignedStaff: visitor.assignedStaff,
      visitDate: finalVisitDate,
      visitTime: finalVisitTime,
      excludeVisitorId: visitor._id,
    });

    if (slotCount >= selectedSlotLimit) {
      return res.status(409).json({
        success: false,
        code: "APPOINTMENT_SLOT_FULL",
        message: "That time slot is already full. Slots are full please select another time or date.",
        limit: selectedSlotLimit,
        currentCount: slotCount,
      });
    }

    const originalVisitDate = visitor.visitDate;
    const originalVisitTime = visitor.visitTime;
    const wasApproved = ["approved", "adjusted"].includes(String(visitor.appointmentStatus || "").toLowerCase());
    const wasStaffAdjustmentPending =
      String(visitor.appointmentStatus || "").toLowerCase() === "adjustment_pending";
    const visitorUser = await User.findOne({ email: visitor.email, role: "visitor" });

    visitor.rescheduleAppointmentByVisitor(req.user, {
      visitDate: new Date(finalVisitDate),
      visitTime: appointmentDateTime,
      reason,
    });
    if (!wasApproved && !wasStaffAdjustmentPending) {
      visitor.approvalStatus = "pending";
    }
    await visitor.save();

    const originalSchedule = formatVisitSchedule(originalVisitDate, originalVisitTime);
    const newSchedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
    const assignedStaffUser = visitor.assignedStaff
      ? await User.findById(visitor.assignedStaff)
      : null;

    if (wasStaffAdjustmentPending && assignedStaffUser) {
      await createRoleNotification({
        title: "Staff Proposal Not Accepted",
        message: `${visitor.fullName} requested a different schedule instead of accepting ${originalSchedule}. New request: ${newSchedule}.`,
        type: "warning",
        severity: "medium",
        targetRole: "staff",
        targetUser: assignedStaffUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_declined_staff_adjustment",
          originalVisitDate,
          originalVisitTime,
          newVisitDate: visitor.visitDate,
          newVisitTime: visitor.visitTime,
          reason,
        },
      });
    }

    await createRoleNotification({
      title: "Appointment Rescheduled",
      message: `${visitor.fullName} updated their appointment from ${originalSchedule} to ${newSchedule}.`,
      type: "warning",
      severity: "medium",
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "visitor_rescheduled_appointment",
        originalVisitDate,
        originalVisitTime,
        newVisitDate: visitor.visitDate,
        newVisitTime: visitor.visitTime,
        reason,
      },
    });

    if (assignedStaffUser) {
      await createRoleNotification({
        title: "Appointment Rescheduled",
        message: `${visitor.fullName} updated their appointment from ${originalSchedule} to ${newSchedule}. Please review the new schedule.`,
        type: "warning",
        severity: "medium",
        targetRole: "staff",
        targetUser: assignedStaffUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_rescheduled_appointment",
          originalVisitDate,
          originalVisitTime,
          newVisitDate: visitor.visitDate,
          newVisitTime: visitor.visitTime,
          reason,
        },
      });
    }

    if (wasApproved) {
      await createRoleNotification({
        title: "Approved Appointment Rescheduled",
        message: `${visitor.fullName}'s approved appointment changed from ${originalSchedule} to ${newSchedule}. Staff review is required before entry.`,
        type: "warning",
        severity: "medium",
        targetRole: "security",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_rescheduled_approved_appointment",
          originalVisitDate,
          originalVisitTime,
          newVisitDate: visitor.visitDate,
          newVisitTime: visitor.visitTime,
          reason,
        },
      });
    }

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "visitor_rescheduled_appointment",
      status: "pending",
      location: visitor.appointmentDepartment || visitor.assignedOffice || "Appointment Request",
      notes: `${visitor.fullName} rescheduled their appointment from ${originalSchedule} to ${newSchedule}.`,
      metadata: {
        originalVisitDate,
        originalVisitTime,
        newVisitDate: visitor.visitDate,
        newVisitTime: visitor.visitTime,
        reason,
      },
    });

    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");
    const [updatedVisitorPayload] = await attachSafePassIdsToVisitors([updatedVisitor]);

    res.json({
      success: true,
      message: "Appointment rescheduled successfully. Staff will review the updated schedule.",
      visitor: updatedVisitorPayload,
    });
  } catch (error) {
    console.error("Visitor reschedule appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reschedule appointment.",
    });
  }
});

app.put("/api/visitors/:id/appointment/running-late", authMiddleware, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (!isVisitorOwner(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own appointment.",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    const appointmentStatus = String(visitor.appointmentStatus || "").toLowerCase();
    if (
      visitor.requestCategory !== "appointment" ||
      visitor.approvalFlow !== "staff" ||
      !["approved", "adjusted"].includes(appointmentStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "Only approved appointments can send a late arrival notice.",
      });
    }

    const timingState = getAppointmentTimingState(visitor);
    if (timingState.afterGrace) {
      return res.status(400).json({
        success: false,
        message: `The ${CHECK_IN_GRACE_PERIOD_MINUTES}-minute grace period has already passed. Please request a new appointment or contact the office directly.`,
      });
    }

    const reason = String(req.body?.reason || "Visitor reported they may arrive late.").trim();
    const visitorUser = await User.findOne({ email: visitor.email, role: "visitor" });
    const assignedStaffUser = visitor.assignedStaff
      ? await User.findById(visitor.assignedStaff)
      : null;
    const schedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);

    visitor.runningLateNotifiedAt = new Date();
    visitor.runningLateReason = reason;
    await visitor.save();

    if (assignedStaffUser) {
      await createRoleNotification({
        title: "Visitor May Be Late",
        message: `${visitor.fullName} says they may be late for ${schedule}. SafePass allows a ${CHECK_IN_GRACE_PERIOD_MINUTES}-minute grace period after the scheduled time.`,
        type: "warning",
        severity: "medium",
        targetRole: "staff",
        targetUser: assignedStaffUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_running_late",
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
          graceMinutes: CHECK_IN_GRACE_PERIOD_MINUTES,
          reason,
        },
      });
    }

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "visitor_running_late",
      status: "warning",
      location: visitor.appointmentDepartment || visitor.assignedOffice || "Appointment",
      notes: `${visitor.fullName} reported they may arrive late for ${schedule}.`,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        graceMinutes: CHECK_IN_GRACE_PERIOD_MINUTES,
        reason,
      },
    });

    res.json({
      success: true,
      message: `Thanks for the update. The office has been notified. Please arrive within the ${CHECK_IN_GRACE_PERIOD_MINUTES}-minute grace period if possible.`,
      visitor,
    });
  } catch (error) {
    console.error("Visitor running late notice error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send late arrival notice.",
    });
  }
});

app.put("/api/visitors/:id/appointment/cancel", authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const cancellationReason = String(reason || "").trim();

    if (!cancellationReason) {
      return res.status(400).json({
        success: false,
        message: "Reason for cancellation is required.",
      });
    }

    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    const requesterRole = String(req.user.role || "").toLowerCase();
    if (requesterRole !== "admin" && !isVisitorOwner(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel your own appointment.",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    if (!canVisitorManageAppointment(visitor)) {
      return res.status(400).json({
        success: false,
        message: "This appointment can no longer be cancelled.",
      });
    }

    if (requesterRole !== "admin" && !(await isLatestVisitorAppointment(visitor))) {
      return res.status(400).json({
        success: false,
        message: "Only your latest appointment request can be cancelled. Older appointments are read-only history.",
      });
    }

    const originalVisitDate = visitor.visitDate;
    const originalVisitTime = visitor.visitTime;
    const wasApproved = ["approved", "adjusted"].includes(String(visitor.appointmentStatus || "").toLowerCase());
    const visitorUser = await User.findOne({ email: visitor.email, role: "visitor" });
    const assignedStaffUser = visitor.assignedStaff
      ? await User.findById(visitor.assignedStaff)
      : null;

    visitor.cancelAppointmentByVisitor(req.user, cancellationReason);
    await visitor.save();

    const originalSchedule = formatVisitSchedule(originalVisitDate, originalVisitTime);

    await createRoleNotification({
      title: "Appointment Cancelled",
      message: `${visitor.fullName} cancelled their appointment for ${originalSchedule}. Reason: ${cancellationReason}`,
      type: "warning",
      severity: "medium",
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "visitor_cancelled_appointment",
        originalVisitDate,
        originalVisitTime,
        cancellationReason,
      },
    });

    if (assignedStaffUser) {
      await createRoleNotification({
        title: "Appointment Cancelled",
        message: `${visitor.fullName} cancelled their appointment for ${originalSchedule}. Reason: ${cancellationReason}`,
        type: "warning",
        severity: "medium",
        targetRole: "staff",
        targetUser: assignedStaffUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_cancelled_appointment",
          originalVisitDate,
          originalVisitTime,
          cancellationReason,
        },
      });
    }

    if (wasApproved) {
      await createRoleNotification({
        title: "Approved Appointment Cancelled",
        message: `${visitor.fullName}'s approved appointment for ${originalSchedule} was cancelled. Reason: ${cancellationReason}`,
        type: "warning",
        severity: "medium",
        targetRole: "security",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "visitor_cancelled_approved_appointment",
          originalVisitDate,
          originalVisitTime,
          cancellationReason,
        },
      });
    }

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "visitor_cancelled_appointment",
      status: "cancelled",
      location: visitor.appointmentDepartment || visitor.assignedOffice || "Appointment Request",
      notes: `${visitor.fullName} cancelled their appointment for ${originalSchedule}.`,
      metadata: {
        originalVisitDate,
        originalVisitTime,
        cancellationReason,
      },
    });

    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");
    const [updatedVisitorPayload] = await attachSafePassIdsToVisitors([updatedVisitor]);

    res.json({
      success: true,
      message: "Appointment cancelled successfully.",
      visitor: updatedVisitorPayload,
    });
  } catch (error) {
    console.error("Visitor cancel appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel appointment.",
    });
  }
});

app.get("/api/staff/appointments", authMiddleware, async (req, res) => {
  try {
    const normalizedRole = String(req.user.role).toLowerCase();
    if (!["staff", "admin"].includes(normalizedRole)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { status = "all", limit = 100 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
    const flowScope =
      status === "pending" || status === "rejected"
        ? [{ approvalFlow: "staff" }]
        : [
            { approvalFlow: "staff" },
            {
              status: "checked_in",
              appointmentStatus: { $in: ["approved", "adjusted"] },
            },
          ];
    const query = {
      requestCategory: "appointment",
      $and: [{ $or: flowScope }],
    };

    if (normalizedRole === "staff") {
      const staffDepartmentQuery = getStaffDepartmentQuery(req.user.department);
      query.$and.push({
        $or: [
          { assignedStaff: req.user._id },
          { appointmentDepartment: staffDepartmentQuery },
          { assignedOffice: staffDepartmentQuery },
        ],
      });
    }

    if (status === "pending") {
      query.appointmentStatus = { $in: ["pending", "rescheduled"] };
    } else if (status === "approved") {
      query.appointmentStatus = { $in: ["approved", "adjusted"] };
    } else if (status === "rejected") {
      query.appointmentStatus = "rejected";
    } else if (status === "completed") {
      query.status = "checked_out";
    }

    const appointments = await Visitor.find(query)
      .sort({ visitDate: -1, visitTime: -1, appointmentRequestedAt: -1, updatedAt: -1 })
      .limit(parsedLimit)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");

    await Promise.all(appointments.map((appointment) => applyAppointmentLifecycleIfNeeded(appointment)));

    res.json({
      success: true,
      appointments,
    });
  } catch (error) {
    console.error("Get staff appointments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch staff appointments",
    });
  }
});

app.put("/api/staff/appointments/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (!["staff", "admin"].includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (visitor.requestCategory !== "appointment" || visitor.approvalFlow !== "staff") {
      return res.status(400).json({
        success: false,
        message: "Only staff appointment requests can be approved here.",
      });
    }

    if (!isStaffAllowedForAppointment(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only approve appointments assigned to your department.",
      });
    }

    const lifecycleStatus = await applyAppointmentLifecycleIfNeeded(visitor);
    if (lifecycleStatus) {
      return res.status(400).json({
        success: false,
        message:
          lifecycleStatus === "no_show"
            ? "This appointment missed the 15-minute check-in grace period and is now marked No-Show."
            : "This appointment has expired. Please adjust the schedule before approving.",
      });
    }

    if (!["pending", "rescheduled"].includes(visitor.appointmentStatus || "pending")) {
      return res.status(400).json({
        success: false,
        message: "Only pending or rescheduled appointments can be approved.",
      });
    }

    const appointmentDateTime = getCombinedAppointmentDateTime(visitor.visitDate, visitor.visitTime);
    if (!appointmentDateTime || appointmentDateTime < new Date(Date.now() - 60 * 1000)) {
      return res.status(400).json({
        success: false,
        message: "This appointment schedule is no longer valid. Please adjust it before approving.",
      });
    }

    visitor.approveAppointment(req.user, req.body?.note || "");
    await visitor.save();
    const duplicateAppointmentsClosed = await closeDuplicateApprovedAppointments(visitor);

    let visitorUser = await User.findOne({ email: visitor.email });
    const visitSchedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");
    const [updatedVisitorPayload] = await attachSafePassIdsToVisitors([updatedVisitor]);

    await createRoleNotification({
      title: "Appointment Approved",
      message: `${visitor.fullName}'s appointment for ${visitSchedule} was approved by ${getFullName(req.user)}.`,
      type: "success",
      severity: "low",
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_approved_appointment",
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    if (visitorUser) {
      await createRoleNotification({
        title: "Your Appointment Is Approved",
        message: `Your visit on ${visitSchedule} has been approved. Your virtual SafePass card will work during your scheduled visit window.`,
        type: "success",
        severity: "low",
        targetRole: "visitor",
        targetUser: visitorUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser._id,
        metadata: {
          activityType: "staff_approved_appointment",
        },
      });
    }

    await createRoleNotification({
      title: "Appointment Approved",
      message: `${visitor.fullName}'s appointment for ${visitSchedule} has been approved. Their virtual SafePass card is limited to the scheduled visit window and assigned destination.`,
      type: "success",
      severity: "low",
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_approved_appointment",
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "staff_approved_appointment",
      status: "granted",
      location: visitor.assignedOffice || visitor.host || req.user.department || "Staff Office",
      notes: `${getFullName(req.user)} approved ${visitor.fullName}'s appointment.`,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        purposeOfVisit: visitor.purposeOfVisit,
        duplicateAppointmentsClosed,
      },
    });

    res.json({
      success: true,
      message:
        duplicateAppointmentsClosed > 0
          ? "Appointment approved successfully. Duplicate approved appointment was closed."
          : "Appointment approved successfully",
      visitor: updatedVisitorPayload,
      duplicateAppointmentsClosed,
    });
  } catch (error) {
    console.error("Staff approve appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve appointment",
    });
  }
});

app.put("/api/staff/appointments/:id/adjust", authMiddleware, async (req, res) => {
  try {
    if (!["staff", "admin"].includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { visitDate, preferredDate, visitTime, preferredTime, note } = req.body || {};
    const finalVisitDate = visitDate || preferredDate;
    const finalVisitTime = visitTime || preferredTime;

    if (!finalVisitTime) {
      return res.status(400).json({
        success: false,
        message: "An adjusted preferred time is required.",
      });
    }

    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (visitor.requestCategory !== "appointment" || visitor.approvalFlow !== "staff") {
      return res.status(400).json({
        success: false,
        message: "Only staff appointment requests can be adjusted here.",
      });
    }

    if (!isStaffAllowedForAppointment(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only adjust appointments assigned to your department.",
      });
    }

    if (!["pending", "rescheduled"].includes(visitor.appointmentStatus || "pending")) {
      return res.status(400).json({
        success: false,
        message: "Only pending or rescheduled appointments can be adjusted.",
      });
    }

    const adjustedDate = finalVisitDate || visitor.visitDate;
    const adjustedDateTime = getCombinedAppointmentDateTime(adjustedDate, finalVisitTime);
    if (!adjustedDateTime) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid adjusted date and time.",
      });
    }

    const minimumScheduleTime = new Date(Date.now() - 60 * 1000);
    if (adjustedDateTime < minimumScheduleTime) {
      return res.status(400).json({
        success: false,
        message: "Adjusted appointment time cannot be in the past.",
      });
    }

    const activeAppointmentOptions = await getAppointmentOptions({ activeOnly: true });
    const adjustedConfiguredSlot = findAppointmentConfiguredSlot(activeAppointmentOptions.timeSlots, adjustedDateTime);
    if (!adjustedConfiguredSlot) {
      return res.status(400).json({
        success: false,
        message: "Please select an enabled appointment time slot.",
      });
    }
    const adjustedSlotLimit = getAppointmentSlotLimit(adjustedConfiguredSlot);

    const slotStaffId = visitor.assignedStaff || req.user._id;
    const adjustedSlotCount = await countStaffAppointmentsForSlot({
      assignedStaff: slotStaffId,
      visitDate: adjustedDate,
      visitTime: finalVisitTime,
      excludeVisitorId: visitor._id,
    });

    if (adjustedSlotCount >= adjustedSlotLimit) {
      return res.status(409).json({
        success: false,
        code: "APPOINTMENT_SLOT_FULL",
        message: "That adjusted time slot is already full. Please choose another time.",
        limit: adjustedSlotLimit,
        currentCount: adjustedSlotCount,
      });
    }

    visitor.adjustAppointment(req.user, {
      visitDate: finalVisitDate ? new Date(finalVisitDate) : null,
      visitTime: adjustedDateTime,
      note,
    });
    await visitor.save();

    let visitorUser = await User.findOne({ email: visitor.email });
    if (visitorUser) {
      await activateVisitorSafePassCardForUser(visitorUser, visitor);
    }
    const visitSchedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");
    const [updatedVisitorPayload] = await attachSafePassIdsToVisitors([updatedVisitor]);

    await createRoleNotification({
      title: "Appointment Time Proposed",
      message: `${getFullName(req.user)} proposed ${visitSchedule} for ${visitor.fullName}. Waiting for visitor confirmation.`,
      type: "warning",
      severity: "medium",
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_adjusted_appointment",
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        note: visitor.staffAdjustmentNote,
      },
    });

    if (visitorUser) {
      await createRoleNotification({
        title: "Staff Proposed A New Time",
        message: `Staff proposed ${visitSchedule}. Tap check if it works for you, or choose another schedule if it does not.`,
        type: "warning",
        severity: "medium",
        targetRole: "visitor",
        targetUser: visitorUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser._id,
        metadata: {
          activityType: "staff_adjusted_appointment",
          note: visitor.staffAdjustmentNote,
        },
      });
    }

    await createRoleNotification({
      title: "Appointment Time Proposed",
      message: `${visitor.fullName}'s appointment has a staff proposed time for ${visitSchedule}. Waiting for visitor confirmation.`,
      type: "warning",
      severity: "medium",
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_adjusted_appointment",
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        note: visitor.staffAdjustmentNote,
      },
    });

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "staff_adjusted_appointment",
      status: "granted",
      location: visitor.assignedOffice || visitor.host || req.user.department || "Staff Office",
      notes: `${getFullName(req.user)} adjusted ${visitor.fullName}'s appointment.`,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        purposeOfVisit: visitor.purposeOfVisit,
        note: visitor.staffAdjustmentNote,
      },
    });

    res.json({
      success: true,
      message: "Appointment adjusted successfully",
      visitor: updatedVisitorPayload,
    });
  } catch (error) {
    console.error("Staff adjust appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to adjust appointment",
    });
  }
});

app.put("/api/staff/appointments/:id/redirect", authMiddleware, async (req, res) => {
  try {
    if (!["staff", "admin"].includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const targetOffice = String(
      req.body?.office ||
        req.body?.appointmentDepartment ||
        req.body?.assignedOffice ||
        req.body?.department ||
        "",
    ).trim();
    const redirectNote = String(req.body?.note || req.body?.reason || "").trim();

    if (!targetOffice) {
      return res.status(400).json({
        success: false,
        message: "Please choose the office that should review this appointment.",
      });
    }

    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (visitor.requestCategory !== "appointment" || visitor.approvalFlow !== "staff") {
      return res.status(400).json({
        success: false,
        message: "Only staff appointment requests can be redirected here.",
      });
    }

    if (!isStaffAllowedForAppointment(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only redirect appointments assigned to your department.",
      });
    }

    const appointmentStatus = String(visitor.appointmentStatus || "pending").toLowerCase();
    if (!["pending", "rescheduled", "approved", "adjusted"].includes(appointmentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Only active appointment requests can be redirected.",
      });
    }

    const activeAppointmentOptions = await getAppointmentOptions({ activeOnly: true });
    const enabledOfficeLabels = activeAppointmentOptions.offices.map((option) => option.label);
    if (!isAllowedOption(targetOffice, enabledOfficeLabels)) {
      return res.status(400).json({
        success: false,
        message: "Please choose an enabled office from Appointment Management.",
      });
    }

    const previousOffice = visitor.appointmentDepartment || visitor.assignedOffice || visitor.host || "";
    if (normalizeDepartmentValue(previousOffice) === normalizeDepartmentValue(targetOffice)) {
      return res.status(400).json({
        success: false,
        message: "This appointment is already assigned to that office.",
      });
    }

    const routedStaff = await findActiveStaffForDepartment(targetOffice);
    if (!routedStaff) {
      return res.status(400).json({
        success: false,
        message: `No active staff account is assigned to ${targetOffice}. Please choose another office or contact admin.`,
      });
    }

    const appointmentDateTime = getCombinedAppointmentDateTime(visitor.visitDate, visitor.visitTime);
    if (!appointmentDateTime || appointmentDateTime < new Date(Date.now() - 60 * 1000)) {
      return res.status(400).json({
        success: false,
        message: "This appointment schedule is no longer valid. Please adjust the schedule instead.",
      });
    }

    const configuredSlot = findAppointmentConfiguredSlot(activeAppointmentOptions.timeSlots, appointmentDateTime);
    if (!configuredSlot) {
      return res.status(400).json({
        success: false,
        message: "The appointment time is no longer an enabled slot. Please adjust the schedule instead.",
      });
    }

    const slotLimit = getAppointmentSlotLimit(configuredSlot);
    const targetSlotCount = await countStaffAppointmentsForSlot({
      assignedStaff: routedStaff._id,
      visitDate: visitor.visitDate,
      visitTime: visitor.visitTime,
      excludeVisitorId: visitor._id,
    });

    if (targetSlotCount >= slotLimit) {
      return res.status(409).json({
        success: false,
        code: "APPOINTMENT_SLOT_FULL",
        message: `${formatDepartmentLabel(targetOffice)} is already full for that time. Please adjust the appointment or choose another office.`,
        limit: slotLimit,
        currentCount: targetSlotCount,
      });
    }

    const wasApproved = ["approved", "adjusted"].includes(appointmentStatus);
    const visitorUser = await User.findOne({ email: visitor.email, role: "visitor" });
    const visitSchedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
    const finalOffice = formatDepartmentLabel(targetOffice);
    const finalNote =
      redirectNote ||
      `${getFullName(req.user) || "Staff"} redirected this request from ${previousOffice || "the previous office"} to ${finalOffice}.`;

    visitor.redirectAppointmentToOffice(req.user, {
      office: finalOffice,
      assignedStaff: routedStaff._id,
      assignedStaffName: getFullName(routedStaff),
      note: finalNote,
      wasApproved,
    });
    await visitor.save();

    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");
    const [updatedVisitorPayload] = await attachSafePassIdsToVisitors([updatedVisitor]);

    await Promise.all([
      createRoleNotification({
        title: "Appointment Redirected",
        message: `${visitor.fullName}'s appointment for ${visitSchedule} was redirected from ${previousOffice || "the previous office"} to ${finalOffice}.`,
        type: "warning",
        severity: "medium",
        targetRole: "admin",
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "staff_redirected_appointment",
          previousOffice,
          targetOffice: finalOffice,
          note: finalNote,
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
        },
      }),
      createRoleNotification({
        title: "Redirected Appointment Request",
        message: `${visitor.fullName}'s request was redirected from ${previousOffice || "another office"} to ${finalOffice}. Please review it.`,
        type: "visitor",
        severity: "medium",
        targetRole: "staff",
        targetUser: routedStaff._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser?._id || null,
        metadata: {
          activityType: "staff_redirected_appointment",
          previousOffice,
          targetOffice: finalOffice,
          note: finalNote,
          visitDate: visitor.visitDate,
          visitTime: visitor.visitTime,
        },
      }),
      visitorUser
        ? createRoleNotification({
            title: "Appointment Sent To Another Office",
            message: `Your appointment request was moved from ${previousOffice || "the previous office"} to ${finalOffice}. The ${finalOffice} staff will review it next.`,
            type: "info",
            severity: "medium",
            targetRole: "visitor",
            targetUser: visitorUser._id,
            relatedVisitor: visitor._id,
            relatedUser: visitorUser._id,
            metadata: {
              activityType: "staff_redirected_appointment",
              previousOffice,
              targetOffice: finalOffice,
              note: finalNote,
            },
          })
        : Promise.resolve(),
      wasApproved
        ? createRoleNotification({
            title: "Approved Appointment Redirected",
            message: `${visitor.fullName}'s approved appointment changed from ${previousOffice || "the previous office"} to ${finalOffice}. Staff review is required before entry.`,
            type: "warning",
            severity: "medium",
            targetRole: "security",
            relatedVisitor: visitor._id,
            relatedUser: visitorUser?._id || null,
            metadata: {
              activityType: "staff_redirected_approved_appointment",
              previousOffice,
              targetOffice: finalOffice,
              note: finalNote,
              visitDate: visitor.visitDate,
              visitTime: visitor.visitTime,
            },
          })
        : Promise.resolve(),
    ]);

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "staff_redirected_appointment",
      status: "pending",
      location: finalOffice,
      notes: `${getFullName(req.user)} redirected ${visitor.fullName}'s appointment from ${previousOffice || "the previous office"} to ${finalOffice}.`,
      metadata: {
        previousOffice,
        targetOffice: finalOffice,
        note: finalNote,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    res.json({
      success: true,
      message: `Appointment sent to ${finalOffice}. The visitor and target office were notified.`,
      visitor: updatedVisitorPayload,
    });
  } catch (error) {
    console.error("Staff redirect appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to redirect appointment",
    });
  }
});

app.put("/api/staff/appointments/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (!["staff", "admin"].includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (visitor.requestCategory !== "appointment" || visitor.approvalFlow !== "staff") {
      return res.status(400).json({
        success: false,
        message: "Only staff appointment requests can be rejected here.",
      });
    }

    if (!isStaffAllowedForAppointment(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only reject appointments assigned to your department.",
      });
    }

    if (!["pending", "rescheduled"].includes(visitor.appointmentStatus || "pending")) {
      return res.status(400).json({
        success: false,
        message: "Only pending or rescheduled appointments can be rejected.",
      });
    }

    const rejectionReason = String(
      req.body?.reason || "Appointment request declined by staff.",
    ).trim();

    visitor.rejectAppointment(req.user, rejectionReason);
    await visitor.save();

    const visitorUser = await User.findOne({ email: visitor.email });
    const visitSchedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department");

    if (visitorUser) {
      await createRoleNotification({
        title: "Appointment Request Declined",
        message: `Your appointment request was declined. Reason: ${rejectionReason}`,
        type: "alert",
        severity: "medium",
        targetRole: "visitor",
        targetUser: visitorUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser._id,
        metadata: {
          activityType: "staff_rejected_appointment",
          reason: rejectionReason,
        },
      });
    }

    await createRoleNotification({
      title: "Appointment Request Declined",
      message: `${visitor.fullName}'s appointment for ${visitSchedule} was declined. Reason: ${rejectionReason}`,
      type: "alert",
      severity: "medium",
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_rejected_appointment",
        reason: rejectionReason,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    await createRoleNotification({
      title: "Appointment Request Declined",
      message: `${visitor.fullName}'s appointment for ${visitSchedule} was declined by ${getFullName(req.user)}.`,
      type: "alert",
      severity: "medium",
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_rejected_appointment",
        reason: rejectionReason,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "staff_rejected_appointment",
      status: "denied",
      location: visitor.assignedOffice || visitor.host || req.user.department || "Staff Office",
      notes: `${getFullName(req.user)} rejected ${visitor.fullName}'s appointment.`,
      metadata: {
        reason: rejectionReason,
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
      },
    });

    res.json({
      success: true,
      message: "Appointment rejected successfully",
      visitor: updatedVisitor,
    });
  } catch (error) {
    console.error("Staff reject appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject appointment",
    });
  }
});

app.put("/api/staff/appointments/:id/complete", authMiddleware, async (req, res) => {
  try {
    if (!["staff", "admin"].includes(String(req.user.role).toLowerCase())) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (visitor.requestCategory !== "appointment" || visitor.approvalFlow !== "staff") {
      return res.status(400).json({
        success: false,
        message: "Only staff appointment requests can be completed here.",
      });
    }

    if (!isStaffAllowedForAppointment(req.user, visitor)) {
      return res.status(403).json({
        success: false,
        message: "You can only complete appointments assigned to your department.",
      });
    }

    if (visitor.status !== "checked_in") {
      return res.status(400).json({
        success: false,
        message: "The visitor must be checked in before the appointment can be completed.",
      });
    }

    if (visitor.checkedOutAt) {
      return res.status(400).json({
        success: false,
        message: "This visit has already been checked out.",
      });
    }

    if (visitor.appointmentCompletedAt) {
      return res.status(400).json({
        success: false,
        message: "This appointment has already been marked complete.",
      });
    }

    const completionNote = String(
      req.body?.note || "Appointment completed. Visitor can proceed to check-out.",
    ).trim();

    visitor.completeAppointment(req.user, completionNote);
    await visitor.save();

    const visitorUser = await User.findOne({ email: visitor.email });
    const visitSchedule = formatVisitSchedule(visitor.visitDate, visitor.visitTime);
    const updatedVisitor = await Visitor.findById(visitor._id)
      .populate("assignedStaff", "firstName lastName email department")
      .populate("staffActionBy", "firstName lastName email department")
      .populate("appointmentCompletedBy", "firstName lastName email department");

    await createRoleNotification({
      title: "Appointment Completed",
      message: `${getFullName(req.user)} marked ${visitor.fullName}'s appointment complete. Please prepare for check-out.`,
      type: "info",
      severity: "medium",
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_completed_appointment",
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        note: completionNote,
      },
    });

    await createRoleNotification({
      title: "Appointment Completed",
      message: `${visitor.fullName}'s appointment for ${visitSchedule} was marked complete by ${getFullName(req.user)}.`,
      type: "info",
      severity: "medium",
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "staff_completed_appointment",
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        note: completionNote,
      },
    });

    if (visitorUser) {
      await createRoleNotification({
        title: "Appointment Completed",
        message: "Your appointment is complete. Please proceed to check-out with security before leaving the site.",
        type: "info",
        severity: "medium",
        targetRole: "visitor",
        targetUser: visitorUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser._id,
        metadata: {
          activityType: "staff_completed_appointment",
          note: completionNote,
        },
      });
    }

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "staff_completed_appointment",
      status: "granted",
      location: visitor.assignedOffice || visitor.host || req.user.department || "Staff Office",
      notes: `${getFullName(req.user)} completed ${visitor.fullName}'s appointment.`,
      metadata: {
        visitDate: visitor.visitDate,
        visitTime: visitor.visitTime,
        note: completionNote,
      },
    });

    res.json({
      success: true,
      message: "Appointment marked complete successfully",
      visitor: updatedVisitor,
    });
  } catch (error) {
    console.error("Staff complete appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete appointment",
    });
  }
});

// Check-in visitor (by security)
app.put("/api/visitors/:id/checkin", authMiddleware, requireRoles("admin", "security"), async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    await applyAppointmentLifecycleIfNeeded(visitor);

    const checkInEligibility = getVisitorCheckInEligibility(visitor);
    if (!checkInEligibility.allowed) {
      return res.status(checkInEligibility.statusCode || 400).json({
        success: false,
        message: checkInEligibility.message,
      });
    }

    visitor.markCheckedIn(req.user._id);
    visitor.updateCurrentLocation(getVisitorCheckInLocation(visitor, "security_dashboard"), {
      deviceId: "security-dashboard",
      action: "check_in",
    });
    await visitor.save();

    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: visitor.email,
      userName: visitor.fullName,
      actorRole: req.user.role,
      location: visitor.assignedOffice || visitor.host || "Campus Entry",
      accessType: "entry",
      activityType: "security_checkin",
      status: "granted",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      metadata: {
        action: "check_in",
        currentLocation: visitor.currentLocation,
      },
      notes: `Checked in by ${req.user.firstName} ${req.user.lastName}`,
    });
    await accessLog.save();

    const notification = new Notification({
      title: "Visitor Checked In",
      message: `${visitor.fullName} has checked in`,
      type: "info",
      severity: "low",
      targetRole: "security",
      relatedVisitor: visitor._id,
    });
    await notification.save();

    res.json({
      success: true,
      message: "Visitor checked in successfully",
      visitor,
    });
  } catch (error) {
    console.error("Check-in error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check in visitor",
    });
  }
});

// Check-out visitor (by security)
app.put("/api/visitors/:id/checkout", authMiddleware, requireRoles("admin", "security"), async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (!visitor.hasApprovedVisitWindow()) {
      return res.status(400).json({
        success: false,
        message: "Visitor does not have an approved visit window yet",
      });
    }

    if (visitor.status !== "checked_in") {
      return res.status(400).json({
        success: false,
        message: "Visitor must be checked in before checkout",
      });
    }

    visitor.markCheckedOut(req.user._id);
    await visitor.save();

    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: visitor.email,
      userName: visitor.fullName,
      actorRole: req.user.role,
      location: visitor.assignedOffice || visitor.host || "Campus Exit",
      accessType: "exit",
      activityType: "security_checkout",
      status: "granted",
      relatedVisitor: visitor._id,
      relatedUser: req.user._id,
      metadata: {
        action: "check_out",
        currentLocation: visitor.currentLocation,
      },
      notes: `Checked out by ${req.user.firstName} ${req.user.lastName}`,
    });
    await accessLog.save();

    const notification = new Notification({
      title: "Visitor Checked Out",
      message: `${visitor.fullName} has checked out`,
      type: "info",
      severity: "low",
      targetRole: "security",
      relatedVisitor: visitor._id,
    });
    await notification.save();

    res.json({
      success: true,
      message: "Visitor checked out successfully",
      visitor,
    });
  } catch (error) {
    console.error("Check-out error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check out visitor",
    });
  }
});

// Report visitor
app.post("/api/visitors/:id/report", authMiddleware, requireRoles("admin", "staff", "security"), async (req, res) => {
  try {
    const { reason } = req.body;
    const visitor = await Visitor.findById(req.params.id);
    const reportReason = String(reason || "").trim();

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (!reportReason) {
      return res.status(400).json({
        success: false,
        message: "A report reason is required.",
      });
    }

    visitor.reports.push({
      reason: reportReason,
      reportedBy: req.user._id,
      reportedAt: new Date(),
    });

    await visitor.save();
    const visitorUser = await User.findOne({ email: visitor.email, role: "visitor" });
    const reporterName = getFullName(req.user) || req.user.email || "A staff member";

    await createRoleNotification({
      title: "Visitor Reported",
      message: `${visitor.fullName} was reported by ${reporterName}: ${reportReason}`,
      type: "alert",
      severity: "high",
      targetRole: "security",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "visitor_reported",
        reportedBy: req.user._id,
        reason: reportReason,
      },
    });

    await createRoleNotification({
      title: "Visitor Incident Report",
      message: `${visitor.fullName} was reported and needs admin review. Reason: ${reportReason}`,
      type: "warning",
      severity: "high",
      targetRole: "admin",
      relatedVisitor: visitor._id,
      relatedUser: visitorUser?._id || null,
      metadata: {
        activityType: "visitor_reported",
        reportedBy: req.user._id,
        reason: reportReason,
      },
    });

    if (visitorUser) {
      await createRoleNotification({
        title: "Security Warning",
        message: `A report has been filed on your visitor account. Reason: ${reportReason}. Please coordinate with school staff or security before your next visit.`,
        type: "warning",
        severity: "high",
        targetRole: "visitor",
        targetUser: visitorUser._id,
        relatedVisitor: visitor._id,
        relatedUser: visitorUser._id,
        metadata: {
          activityType: "visitor_reported",
          reportedBy: req.user._id,
          reason: reportReason,
        },
      });
    }

    await createSystemActivity({
      actorUser: req.user,
      relatedVisitor: visitor,
      relatedUser: visitorUser,
      activityType: "visitor_reported",
      status: "flagged",
      location: visitor.assignedOffice || visitor.host || req.user.department || "Security Desk",
      notes: `${reporterName} reported ${visitor.fullName}.`,
      metadata: {
        reason: reportReason,
      },
    });

    res.json({
      success: true,
      message: "Visitor reported successfully",
    });
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to report visitor",
    });
  }
});

// Get notifications (for security dashboard)
app.get("/api/notifications", authMiddleware, async (req, res) => {
  try {
    await ensureOverstayAlerts();

    const { read, limit = 50 } = req.query;
    const targetRoles = getNotificationTargetRoles(req.user.role);
    const now = new Date();

    let query = {
      targetRole: { $in: targetRoles },
      $or: [{ targetUser: null }, { targetUser: req.user._id }],
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
    };

    if (read === "false") {
      query["readBy.user"] = { $ne: req.user._id };
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Math.max(1, parseInt(limit, 10) || 50)))
      .populate("relatedVisitor", "fullName visitDate visitTime appointmentStatus appointmentDepartment assignedOffice")
      .populate("relatedUser", "firstName lastName");

    const unreadCount = await Notification.countDocuments({
      ...query,
      "readBy.user": { $ne: req.user._id },
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
});

// Mark notification as read
app.put("/api/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (!notificationIsAccessibleToUser(notification, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this notification",
      });
    }

    // Add user to readBy if not already there
    if (!notification.readBy.some((r) => r.user.equals(req.user._id))) {
      notification.readBy.push({
        user: req.user._id,
        readAt: new Date(),
      });
      await notification.save();
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
});

// Mark all notifications as read
app.put("/api/notifications/read-all", authMiddleware, async (req, res) => {
  try {
    const targetRoles = getNotificationTargetRoles(req.user.role);
    const now = new Date();
    await Notification.updateMany(
      {
        targetRole: { $in: targetRoles },
        $or: [{ targetUser: null }, { targetUser: req.user._id }],
        $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
        "readBy.user": { $ne: req.user._id },
      },
      {
        $push: {
          readBy: {
            user: req.user._id,
            readAt: new Date(),
          },
        },
      },
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark all as read",
    });
  }
});

// Get visitor stats for dashboard
app.get("/api/visitors/stats", authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = {
      total: await Visitor.countDocuments(),
      pending: await Visitor.countDocuments({ approvalStatus: "pending" }),
      approved: await Visitor.countDocuments({ approvalStatus: "approved" }),
      rejected: await Visitor.countDocuments({ approvalStatus: "rejected" }),
      checkedIn: await Visitor.countDocuments({ status: "checked_in" }),
      checkedOut: await Visitor.countDocuments({ status: "checked_out" }),
      todayExpected: await Visitor.countDocuments({
        visitDate: { $gte: today, $lt: tomorrow },
        approvalStatus: "approved",
      }),
      pendingApprovals: await Visitor.countDocuments({
        approvalStatus: "pending",
      }),
    };

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Get visitor stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get visitor stats",
    });
  }
});

// Get visitor profile for logged-in visitor
app.get("/api/visitor-profile", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "visitor") {
      return res.json(await buildVisitorProfilePayload(req.user));
    }

    res.status(404).json({
      success: false,
      message: "Visitor profile not found",
    });
  } catch (error) {
    console.error("Get visitor profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get visitor profile",
    });
  }
});

// Get visitor by user ID
app.get("/api/visitors/user/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterRole = String(req.user.role || "").toLowerCase();

    if (
      requesterRole === "visitor" &&
      !isSameObjectId(req.user._id, userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own visitor profile.",
      });
    }

    if (
      !["visitor", "admin", "security", "guard", "staff"].includes(requesterRole)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    let visitor = null;

    if (user.visitorId) {
      visitor = await Visitor.findById(user.visitorId);
    }

    if (!visitor) {
      visitor = await Visitor.findOne({ email: user.email });
    }

    if (visitor) {
      await applyAppointmentLifecycleIfNeeded(visitor);
    }

    res.json({
      success: true,
      visitor: visitor || null,
    });
  } catch (error) {
    console.error("Get visitor by user ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get visitor",
    });
  }
});

// ============ ADMIN ROUTES (Existing) ============

app.get("/api/admin/activities", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const limit = Math.min(parseInt(req.query.limit || "60", 10), 200);
    const activities = await AccessLog.find({
      $or: [
        { accessType: "system" },
        { accessType: "entry" },
        { accessType: "exit" },
      ],
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate("relatedVisitor", "fullName email visitDate visitTime purposeOfVisit assignedOffice host status appointmentStatus approvalStatus")
      .populate("relatedUser", "firstName lastName email role department nfcCardId safePassId physicalNfcUid phoneNfcUid");

    const visitorActivityUsers = activities
      .map((activity) => activity.relatedUser)
      .filter((user) => user && String(user.role || "").toLowerCase() === "visitor");
    await Promise.all(visitorActivityUsers.map((user) => ensureSafePassAccountId(user)));

    const activityPayloads = activities.map((activity) => {
      const payload = activity.toObject();
      const relatedPhysicalUid = getUserPhysicalNfcUid(payload.relatedUser);
      const relatedSafePassId = getUserSafePassId(payload.relatedUser);
      const relatedPhoneUid = getUserPhoneNfcUid(payload.relatedUser);
      if (relatedPhysicalUid) {
        payload.nfcCardId = relatedPhysicalUid;
        payload.physicalNfcUid = relatedPhysicalUid;
      }
      if (relatedSafePassId) {
        payload.safePassId = relatedSafePassId;
      }
      if (relatedPhoneUid) {
        payload.phoneNfcUid = relatedPhoneUid;
      }
      if (payload.relatedVisitor) {
        if (relatedPhysicalUid) {
          payload.relatedVisitor.nfcCardId = relatedPhysicalUid;
          payload.relatedVisitor.physicalNfcUid = relatedPhysicalUid;
        }
        if (relatedSafePassId) {
          payload.relatedVisitor.safePassId = relatedSafePassId;
        }
        if (relatedPhoneUid) {
          payload.relatedVisitor.phoneNfcUid = relatedPhoneUid;
        }
      }
      return payload;
    });

    const summary = {
      registrationRequests: activityPayloads.filter((item) => item.activityType === "visitor_registration_request").length,
      appointmentRequests: activityPayloads.filter((item) => item.activityType === "visitor_appointment_request").length,
      staffActions: activityPayloads.filter((item) =>
        [
          "staff_approved_appointment",
          "staff_adjusted_appointment",
          "staff_rejected_appointment",
          "staff_completed_appointment",
        ].includes(item.activityType),
      ).length,
      completedVisits: activityPayloads.filter((item) =>
        item.activityType === "security_checkout" || item.activityType === "visitor_self_checkout",
      ).length,
      approvals: activityPayloads.filter((item) =>
        item.activityType === "admin_approved_registration" || item.activityType === "staff_approved_appointment",
      ).length,
    };

    res.json({
      success: true,
      activities: activityPayloads,
      summary,
    });
  } catch (error) {
    console.error("Get admin activities error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin activities",
    });
  }
});

// Get admin statistics
app.get("/api/admin/stats", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const pendingRegistrationRequestsQuery = {
      requestCategory: "registration",
      approvalFlow: "admin",
      approvalStatus: "pending",
    };
    const pendingAppointmentRequestsQuery = {
      requestCategory: "appointment",
      approvalFlow: "staff",
      appointmentStatus: { $in: ["pending", "rescheduled"] },
    };
    const approvedVisitWindowsQuery = {
      approvalStatus: "approved",
      $or: [
        { requestCategory: "registration" },
        {
          requestCategory: "appointment",
          appointmentStatus: { $in: ["approved", "adjusted"] },
        },
      ],
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeUsers,
      todayAccess,
      totalAdmins,
      totalStaff,
      totalSecurity,
      totalVisitors,
      pendingRegistrationRequests,
      pendingAppointmentRequests,
      approvedVisits,
      checkedInVisitors,
      completedVisits,
      totalAccess,
      grantedAccess,
      deniedAccessToday,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: "active" }),
      AccessLog.countDocuments({ timestamp: { $gte: today } }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "staff" }),
      User.countDocuments({ role: { $in: ["guard", "security"] } }),
      Visitor.countDocuments(),
      Visitor.countDocuments(pendingRegistrationRequestsQuery),
      Visitor.countDocuments(pendingAppointmentRequestsQuery),
      Visitor.countDocuments(approvedVisitWindowsQuery),
      Visitor.countDocuments({ status: "checked_in" }),
      Visitor.countDocuments({ status: "checked_out" }),
      AccessLog.countDocuments(),
      AccessLog.countDocuments({ status: "granted" }),
      AccessLog.countDocuments({
        status: "denied",
        timestamp: { $gte: today },
      }),
    ]);

    const pendingApprovals =
      pendingRegistrationRequests + pendingAppointmentRequests;
    const successRate =
      totalAccess > 0
        ? ((grantedAccess / totalAccess) * 100).toFixed(1) + "%"
        : "0%";

    const pendingIssues = pendingApprovals + deniedAccessToday;

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        todayAccess,
        pendingIssues,
        totalAdmins,
        totalStaff,
        totalSecurity,
        totalVisitors,
        successRate,
        pendingApprovals,
        pendingRegistrationRequests,
        pendingAppointmentRequests,
        approvedVisits,
        checkedInVisitors,
        completedVisits,
      },
    });
  } catch (error) {
    console.error("Get admin stats error:", error);
    res.status(500).json({ success: false, message: "Failed to get stats" });
  }
});

// Get all users with filters
app.get("/api/admin/users", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { role, status, page = 1, limit = 50 } = req.query;
    let query = {};

    // Fix: Handle role filtering correctly
    if (role && role !== "all") {
      query.role = role;
    }
    // If no role specified, return ALL users (including guard and security)
    // No need to add extra filters

    if (status) {
      if (status === "active") query.status = "active";
      else if (status === "inactive") query.status = "inactive";
      else if (status === "pending") query.status = "pending";
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .skip(skip)
        .limit(parsedLimit)
        .sort({ createdAt: -1 })
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
      total,
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ success: false, message: "Failed to get users" });
  }
});

// Get user by ID
app.get("/api/admin/users/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({ success: false, message: "Failed to get user" });
  }
});

// Update user
app.put("/api/admin/users/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const updates = { ...req.body };
    delete updates.password; // Don't allow password update through this route
    delete updates._id;
    delete updates.__v;

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (updates.firstName !== undefined) {
      updates.firstName = String(updates.firstName || "").trim();
      if (!updates.firstName) {
        return res.status(400).json({
          success: false,
          message: "First name is required.",
          field: "firstName",
        });
      }
    }

    if (updates.lastName !== undefined) {
      updates.lastName = String(updates.lastName || "").trim();
      if (!updates.lastName) {
        return res.status(400).json({
          success: false,
          message: "Last name is required.",
          field: "lastName",
        });
      }
    }

    if (updates.email !== undefined) {
      const normalizedEmail = normalizeEmailValue(updates.email);
      if (!normalizedEmail || !isValidEmailValue(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address.",
          field: "email",
        });
      }

      const emailConflict = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.params.id },
      });

      if (emailConflict) {
        return res.status(400).json({
          success: false,
          message: "Email already registered",
          field: "email",
        });
      }

      updates.email = normalizedEmail;
    }

    if (updates.phone !== undefined) {
      updates.phone = normalizePhoneValue(updates.phone);
      if (updates.phone && !isValidPhoneValue(updates.phone)) {
        return res.status(400).json({
          success: false,
          message: PHONE_VALIDATION_MESSAGE,
          field: "phone",
        });
      }
    }

    if (updates.parentName !== undefined) {
      updates.parentName = String(updates.parentName || "").trim();
      updates.guardianName = updates.parentName;
    }

    if (updates.guardianName !== undefined) {
      updates.guardianName = String(updates.guardianName || "").trim();
      updates.parentName = updates.guardianName;
    }

    if (updates.parentEmail !== undefined) {
      const normalizedParentEmail = normalizeEmailValue(updates.parentEmail);
      if (normalizedParentEmail && !isValidEmailValue(normalizedParentEmail)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid parent email address.",
          field: "parentEmail",
        });
      }
      updates.parentEmail = normalizedParentEmail;
      updates.guardianEmail = normalizedParentEmail;
    }

    if (updates.guardianEmail !== undefined) {
      const normalizedGuardianEmail = normalizeEmailValue(updates.guardianEmail);
      if (normalizedGuardianEmail && !isValidEmailValue(normalizedGuardianEmail)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid guardian email address.",
          field: "guardianEmail",
        });
      }
      updates.guardianEmail = normalizedGuardianEmail;
      updates.parentEmail = normalizedGuardianEmail;
    }

    if (updates.studentId !== undefined) {
      const normalizedStudentId = String(updates.studentId || "").trim();
      if (!normalizedStudentId) {
        delete updates.studentId;
      } else {
        const studentIdConflict = await User.findOne({
          studentId: normalizedStudentId,
          _id: { $ne: req.params.id },
        });

        if (studentIdConflict) {
          return res.status(400).json({
            success: false,
            message: "Student ID already registered",
            field: "studentId",
          });
        }

        updates.studentId = normalizedStudentId;
      }
    }

    if (updates.teacherId !== undefined) {
      const normalizedTeacherId = String(updates.teacherId || "").trim();
      if (!normalizedTeacherId) {
        delete updates.teacherId;
      } else {
        const teacherIdConflict = await User.findOne({
          teacherId: normalizedTeacherId,
          _id: { $ne: req.params.id },
        });

        if (teacherIdConflict) {
          return res.status(400).json({
            success: false,
            message: "Academic staff ID already registered",
            field: "teacherId",
          });
        }

        updates.teacherId = normalizedTeacherId;
      }
    }

    if (updates.role !== undefined) {
      updates.role = String(updates.role || "").toLowerCase().trim();
      if (!ACCOUNT_ROLE_OPTIONS.includes(updates.role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
          field: "role",
        });
      }
    }

    if (updates.status !== undefined) {
      updates.status = String(updates.status || "").toLowerCase().trim();
      if (!ACCOUNT_STATUS_OPTIONS.includes(updates.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid account status",
          field: "status",
        });
      }
      updates.isActive = updates.status === "active";
    }

    if (updates.department !== undefined) {
      updates.department = String(updates.department || "").trim();
    }

    if (updates.position !== undefined) {
      updates.position = String(updates.position || "").trim();
    }

    if (updates.course !== undefined) {
      updates.course = String(updates.course || "").trim();
    }

    if (updates.yearLevel !== undefined) {
      updates.yearLevel = String(updates.yearLevel || "").trim();
    }

    if (updates.section !== undefined) {
      updates.section = String(updates.section || "").trim();
    }

    if (updates.username !== undefined) {
      const normalizedUsername = normalizeUsernameValue(updates.username);
      if (!normalizedUsername) {
        delete updates.username;
      } else {
        const usernameConflict = await User.findOne({
          username: normalizedUsername,
          _id: { $ne: req.params.id },
        });

        if (usernameConflict) {
          return res.status(400).json({
            success: false,
            message: "Username already registered",
            field: "username",
          });
        }

        updates.username = normalizedUsername;
      }
    }

    if (updates.employeeId !== undefined) {
      const normalizedEmployeeId = String(updates.employeeId || "").trim();
      if (!normalizedEmployeeId) {
        delete updates.employeeId;
      } else {
        const employeeIdConflict = await User.findOne({
          employeeId: normalizedEmployeeId,
          _id: { $ne: req.params.id },
        });

        if (employeeIdConflict) {
          return res.status(400).json({
            success: false,
            message: "Staff ID already registered",
            field: "employeeId",
          });
        }

        updates.employeeId = normalizedEmployeeId;
      }
    }

    if (updates.nfcCardId !== undefined || updates.uid !== undefined || updates.cardId !== undefined) {
      const submittedNfcCardId = normalizeSubmittedNfcCardId(
        updates.nfcCardId || updates.uid || updates.cardId,
      );
      delete updates.uid;
      delete updates.cardId;

      if (!submittedNfcCardId) {
        updates.nfcCardId = null;
        updates.physicalNfcUid = null;
        updates.accessPermissions = {
          canAccess: existingUser.accessPermissions?.canAccess || [],
          restrictedAreas: existingUser.accessPermissions?.restrictedAreas || [],
          timeRestrictions: existingUser.accessPermissions?.timeRestrictions || [],
          cardActive: false,
        };
      } else {
        const nfcCardConflict = await User.findOne({
          $or: [
            { nfcCardId: exactTextMatch(submittedNfcCardId) },
            { physicalNfcUid: exactTextMatch(submittedNfcCardId) },
            { phoneNfcUid: exactTextMatch(submittedNfcCardId) },
          ],
          _id: { $ne: req.params.id },
        });

        if (nfcCardConflict) {
          return res.status(400).json({
            success: false,
            message: `NFC card UID already assigned to ${nfcCardConflict.email}`,
            field: "nfcCardId",
          });
        }

        updates.nfcCardId = submittedNfcCardId;
        updates.physicalNfcUid = submittedNfcCardId;
        updates.accessPermissions = {
          canAccess: existingUser.accessPermissions?.canAccess || [],
          restrictedAreas: existingUser.accessPermissions?.restrictedAreas || [],
          timeRestrictions: existingUser.accessPermissions?.timeRestrictions || [],
          cardActive: true,
        };
      }
    }

    const finalRole = updates.role || existingUser.role;
    const finalDepartment =
      updates.department !== undefined ? updates.department : existingUser.department;
    if (finalRole === "staff" && !String(finalDepartment || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Department is required for staff accounts.",
        field: "department",
      });
    }

    if (updates.status !== undefined) {
      updates.status = String(updates.status || "").toLowerCase().trim();
      updates.isActive = updates.status === "active";
    } else if (updates.isActive !== undefined) {
      updates.isActive = updates.isActive === true;
      updates.status = updates.isActive ? "active" : "inactive";
    }

    existingUser.set({ ...updates, updatedAt: new Date() });
    await existingUser.save();
    const user = await User.findById(existingUser._id).select("-password");

    const visitorSync = await syncVisitorRecordsForUserUpdate(existingUser, user);

    // Create access log for the update
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Updated user: ${user.email}`,
    });
    await accessLog.save();

    res.json({
      success: true,
      message: "User updated successfully",
      user,
      synced: {
        visitors: visitorSync?.modifiedCount || 0,
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0] || "field";
      return res.status(400).json({
        success: false,
        message: `${duplicateField} is already registered`,
        field: duplicateField,
      });
    }

    if (error?.name === "ValidationError") {
      const firstValidationError = Object.values(error.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: firstValidationError?.message || "Please check the account details and try again.",
      });
    }

    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});

// Update user role
app.put("/api/admin/users/:id/role", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { role } = req.body;

    const normalizedRole = String(role || "").toLowerCase().trim();

    if (!ACCOUNT_ROLE_OPTIONS.includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: normalizedRole, updatedAt: new Date() },
      { new: true },
    ).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Updated role for ${user.email} to ${normalizedRole}`,
    });
    await accessLog.save();

    res.json({ success: true, message: "Role updated successfully", user });
  } catch (error) {
    console.error("Update role error:", error);
    res.status(500).json({ success: false, message: "Failed to update role" });
  }
});

// Deactivate user
app.put("/api/admin/users/:id/deactivate", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: "inactive", isActive: false, updatedAt: new Date() },
      { new: true },
    ).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Deactivated user: ${user.email}`,
    });
    await accessLog.save();

    res.json({ success: true, message: "User deactivated successfully", user });
  } catch (error) {
    console.error("Deactivate user error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to deactivate user" });
  }
});

// Activate user
app.put("/api/admin/users/:id/activate", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: "active", isActive: true, updatedAt: new Date() },
      { new: true },
    ).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Activated user: ${user.email}`,
    });
    await accessLog.save();

    res.json({ success: true, message: "User activated successfully", user });
  } catch (error) {
    console.error("Activate user error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to activate user" });
  }
});

// Delete user
app.delete("/api/admin/users/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Don't allow deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot delete your own account" });
    }

    const cleanupTargets = await buildUserCleanupTargets(user);
    const deletedVisitors = cleanupTargets.visitorIds.length
      ? await Visitor.deleteMany({ _id: { $in: cleanupTargets.visitorIds } })
      : { deletedCount: 0 };
    const deletedAccessLogs = await AccessLog.deleteMany(cleanupTargets.accessLogQuery);
    const deletedNotifications = await Notification.deleteMany(cleanupTargets.notificationQuery);
    const updatedNotifications = await Notification.updateMany(
      { "readBy.user": user._id },
      { $pull: { readBy: { user: user._id } } },
    );
    await User.findByIdAndDelete(req.params.id);

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Deleted user: ${user.email}`,
    });
    await accessLog.save();

    res.json({
      success: true,
      message: "User deleted successfully",
      deleted: {
        users: 1,
        visitors: deletedVisitors.deletedCount || 0,
        accessLogs: deletedAccessLogs.deletedCount || 0,
        notifications: deletedNotifications.deletedCount || 0,
        notificationReadReceipts: updatedNotifications.modifiedCount || 0,
      },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "Failed to delete user" });
  }
});

// Get all NFC cards
app.get("/api/admin/nfc-cards", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { status, page = 1, limit = 50 } = req.query;
    let query = {};

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find({
      $or: [
        { nfcCardId: { $exists: true, $ne: null } },
        { safePassId: { $exists: true, $ne: null } },
        { physicalNfcUid: { $exists: true, $ne: null } },
        { phoneNfcUid: { $exists: true, $ne: null } },
      ],
    })
      .select("firstName lastName email nfcCardId safePassId physicalNfcUid phoneNfcUid role status createdAt accessPermissions")
      .skip(skip)
      .limit(parseInt(limit));

    const cards = users.map((user) => ({
      id: user._id,
      cardNumber: getUserPhysicalNfcUid(user) || getUserSafePassId(user) || user.nfcCardId,
      safePassId: getUserSafePassId(user),
      physicalNfcUid: getUserPhysicalNfcUid(user),
      phoneNfcUid: getUserPhoneNfcUid(user),
      userName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      status: user.status === "active" ? "active" : "inactive",
      cardActive: Boolean(user.accessPermissions?.cardActive),
      issuedDate: user.createdAt,
      userId: user._id,
    }));

    const total = await User.countDocuments({
      $or: [
        { nfcCardId: { $exists: true, $ne: null } },
        { safePassId: { $exists: true, $ne: null } },
        { physicalNfcUid: { $exists: true, $ne: null } },
        { phoneNfcUid: { $exists: true, $ne: null } },
      ],
    });

    res.json({
      success: true,
      cards,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("Get NFC cards error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to get NFC cards" });
  }
});

// Issue NFC card
app.post("/api/admin/nfc-cards/issue", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const safePassId = await ensureSafePassAccountId(user);
    user.accessPermissions = {
      canAccess: user.accessPermissions?.canAccess || [],
      restrictedAreas: user.accessPermissions?.restrictedAreas || [],
      cardActive: true,
    };
    await user.save();

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Issued SafePass virtual ID to ${user.email}: ${safePassId}`,
    });
    await accessLog.save();

    res.json({
      success: true,
      message: "SafePass virtual ID issued successfully",
      card: {
        id: user._id,
        cardNumber: getUserPhysicalNfcUid(user) || safePassId,
        safePassId,
        physicalNfcUid: getUserPhysicalNfcUid(user),
        userName: `${user.firstName} ${user.lastName}`,
        status: "active",
        issuedDate: new Date(),
        userId: user._id,
      },
    });
  } catch (error) {
    console.error("Issue NFC card error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to issue NFC card" });
  }
});

// Assign a physical NFC/RFID card UID to a visitor account
app.post("/api/nfc-cards/assign", authMiddleware, async (req, res) => {
  try {
    const requesterRole = normalizeUserRoleValue(req.user?.role);
    const canAssignAnyUser = requesterRole === "admin";
    const canAssignVisitorOnly = hasSecurityOperatorPrivileges(req.user) && !canAssignAnyUser;

    if (!canAssignAnyUser && !canAssignVisitorOnly) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { userId, email, cardId, nfcCardId, uid, force } = req.body || {};
    const normalizedCardId = normalizeNfcCardId(cardId || nfcCardId || uid);
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const forceReassign = force === true || String(force || "").toLowerCase() === "true";

    if (!normalizedCardId) {
      return res.status(400).json({
        success: false,
        message: "Card UID is required.",
      });
    }

    let user = null;
    if (canAssignVisitorOnly && normalizedEmail) {
      user = await User.findOne({ email: normalizedEmail, role: "visitor" });
    }

    if (!user && userId) {
      user = await User.findById(userId);
    }

    if (!user && normalizedEmail) {
      user = await User.findOne(
        canAssignVisitorOnly
          ? { email: normalizedEmail, role: "visitor" }
          : { email: normalizedEmail },
      );
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const existingCardOwner = await User.findOne({
      $or: [
        { physicalNfcUid: normalizedCardId },
        { phoneNfcUid: normalizedCardId },
        { nfcCardId: normalizedCardId },
      ],
    }).select("_id email role nfcCardId safePassId physicalNfcUid phoneNfcUid");

    if (existingCardOwner && String(existingCardOwner._id) !== String(user._id) && !forceReassign) {
      return res.status(409).json({
        success: false,
        message: `Card ${normalizedCardId} is already assigned to ${existingCardOwner.email}.`,
      });
    }

    if (existingCardOwner && String(existingCardOwner._id) !== String(user._id) && forceReassign) {
      const existingOwnerRole = normalizeUserRoleValue(existingCardOwner.role);
      if (canAssignVisitorOnly && existingOwnerRole !== "visitor") {
        return res.status(403).json({
          success: false,
          message: "Security can only move NFC cards between visitor accounts.",
        });
      }

      const oldOwnerSafePassId = getUserSafePassId(existingCardOwner);
      existingCardOwner.physicalNfcUid = undefined;
      existingCardOwner.phoneNfcUid = undefined;
      if (!isLegacySafePassToken(existingCardOwner.nfcCardId)) {
        existingCardOwner.nfcCardId = oldOwnerSafePassId || undefined;
      }
      await existingCardOwner.save();

      if (existingOwnerRole === "visitor") {
        await Visitor.updateMany(
          { email: existingCardOwner.email },
          {
            $set: {
              nfcCardId: "",
              physicalNfcUid: "",
            },
          },
        );
      }
    }

    const targetRole = normalizeUserRoleValue(user.role);
    if (canAssignVisitorOnly && targetRole !== "visitor") {
      return res.status(403).json({
        success: false,
        message: "Security can only assign NFC cards to visitor accounts.",
      });
    }

    const previousCardId = getUserPhysicalNfcUid(user);
    await ensureSafePassAccountId(user);
    user.physicalNfcUid = normalizedCardId;
    if (!isLegacySafePassToken(user.nfcCardId)) {
      user.nfcCardId = normalizedCardId;
    }
    user.status = "active";
    user.isActive = true;
    user.accessPermissions = {
      canAccess: user.accessPermissions?.canAccess || [],
      restrictedAreas: user.accessPermissions?.restrictedAreas || [],
      timeRestrictions: user.accessPermissions?.timeRestrictions || [],
      cardActive: true,
    };
    await user.save();

    if (targetRole === "visitor") {
      await Visitor.updateMany(
        { email: user.email },
        {
          $set: {
            safePassId: getUserSafePassId(user),
            physicalNfcUid: user.physicalNfcUid,
            nfcCardId: user.physicalNfcUid,
          },
        },
      );
    }

    await AccessLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      nfcCardId: normalizedCardId,
      relatedUser: user._id,
      metadata: {
        previousCardId,
        assignedCardId: normalizedCardId,
        forceReassign,
        previousOwnerEmail:
          existingCardOwner && String(existingCardOwner._id) !== String(user._id)
            ? existingCardOwner.email
            : "",
      },
      notes:
        forceReassign && existingCardOwner && String(existingCardOwner._id) !== String(user._id)
          ? `Moved NFC card ${normalizedCardId} from ${existingCardOwner.email} to ${user.email}`
          : `Assigned NFC card ${normalizedCardId} to ${user.email}`,
    });

    const linkedVisitor =
      targetRole === "visitor"
        ? await Visitor.findOne({ email: user.email })
            .sort({ checkedInAt: -1, visitDate: -1, registeredAt: -1 })
            .lean()
        : null;

    if (linkedVisitor) {
      linkedVisitor.safePassId = getUserSafePassId(user);
      linkedVisitor.physicalNfcUid = user.physicalNfcUid;
      linkedVisitor.nfcCardId = user.physicalNfcUid;
      linkedVisitor.relatedUser = {
        _id: user._id,
        email: user.email,
        nfcCardId: user.physicalNfcUid,
        safePassId: getUserSafePassId(user),
        physicalNfcUid: user.physicalNfcUid,
        role: user.role,
      };
    }

    res.json({
      success: true,
      message:
        forceReassign && existingCardOwner && String(existingCardOwner._id) !== String(user._id)
          ? "NFC card moved and assigned successfully"
          : "NFC card assigned successfully",
      visitor: linkedVisitor,
      card: {
        id: user._id,
        cardNumber: user.physicalNfcUid,
        previousCardNumber: previousCardId,
        safePassId: getUserSafePassId(user),
        physicalNfcUid: user.physicalNfcUid,
        userName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.role,
        status: "active",
        issuedDate: new Date(),
        userId: user._id,
      },
    });
  } catch (error) {
    console.error("Assign NFC card error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign NFC card",
    });
  }
});

// Revoke NFC card
app.put("/api/nfc-cards/:id/revoke", authMiddleware, async (req, res) => {
  try {
    const requesterRole = normalizeUserRoleValue(req.user?.role);
    const canRevokeAnyUser = requesterRole === "admin";
    const canRevokeVisitorOnly = hasSecurityOperatorPrivileges(req.user) && !canRevokeAnyUser;

    if (!canRevokeAnyUser && !canRevokeVisitorOnly) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const normalizedEmail = String(req.body?.email || req.query?.email || "").trim().toLowerCase();
    const paramId = String(req.params.id || "").trim();
    const normalizedCardId = normalizeNfcCardId(
      req.body?.cardId ||
        req.body?.nfcCardId ||
        req.body?.uid ||
        req.query?.cardId ||
        req.query?.nfcCardId ||
        req.query?.uid ||
        paramId,
    );
    let user = null;
    if (canRevokeVisitorOnly && normalizedEmail) {
      user = await User.findOne({ email: normalizedEmail, role: "visitor" });
    }

    if (!user && mongoose.Types.ObjectId.isValid(paramId)) {
      user = await User.findById(paramId);
    }

    if (!user) {
      const lookupEmail = normalizedEmail || paramId.toLowerCase();
      user = await User.findOne(
        canRevokeVisitorOnly
          ? { email: lookupEmail, role: "visitor" }
          : { email: lookupEmail },
      );
    }

    if (!user && normalizedCardId) {
      user = await User.findOne({
        ...(canRevokeVisitorOnly ? { role: "visitor" } : {}),
        $or: [
          { physicalNfcUid: exactTextMatch(normalizedCardId) },
          { nfcCardId: exactTextMatch(normalizedCardId) },
        ],
      });
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "No visitor account is assigned to that NFC UID." });
    }

    const targetRole = normalizeUserRoleValue(user.role);
    if (canRevokeVisitorOnly && targetRole !== "visitor") {
      return res.status(403).json({
        success: false,
        message: "Security can only unassign NFC cards from visitor accounts.",
      });
    }

    const oldCardId = getUserPhysicalNfcUid(user);
    await ensureSafePassAccountId(user);
    user.physicalNfcUid = undefined;
    if (!isLegacySafePassToken(user.nfcCardId)) {
      user.nfcCardId = user.safePassId || undefined;
    }
    user.accessPermissions = {
      canAccess: user.accessPermissions?.canAccess || [],
      restrictedAreas: user.accessPermissions?.restrictedAreas || [],
      timeRestrictions: user.accessPermissions?.timeRestrictions || [],
      cardActive: false,
    };
    await user.save();

    if (targetRole === "visitor") {
      await Visitor.updateMany(
        { email: user.email },
        {
          $set: {
            safePassId: getUserSafePassId(user),
            nfcCardId: "",
            physicalNfcUid: "",
          },
        },
      );
    }

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Revoked NFC card from ${user.email}: ${oldCardId}`,
    });
    await accessLog.save();

    const linkedVisitor =
      targetRole === "visitor"
        ? await Visitor.findOne({ email: user.email })
            .sort({ checkedInAt: -1, visitDate: -1, registeredAt: -1 })
            .lean()
        : null;

    if (linkedVisitor) {
      linkedVisitor.safePassId = getUserSafePassId(user);
      linkedVisitor.physicalNfcUid = "";
      linkedVisitor.nfcCardId = "";
      linkedVisitor.relatedUser = {
        _id: user._id,
        email: user.email,
        nfcCardId: "",
        safePassId: getUserSafePassId(user),
        physicalNfcUid: "",
        role: user.role,
      };
    }

    res.json({ success: true, message: "NFC card revoked successfully", visitor: linkedVisitor });
  } catch (error) {
    console.error("Revoke NFC card error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to revoke NFC card" });
  }
});

// Get access reports
app.get("/api/admin/reports/access", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { date, type, startDate, endDate } = req.query;
    let query = {};

    if (date) {
      const targetDate = new Date(date);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      query.timestamp = { $gte: targetDate, $lt: nextDay };
    } else if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const logs = await AccessLog.find(query).sort({ timestamp: -1 });

    // Calculate statistics
    const totalAccess = logs.length;
    const uniqueUsers = new Set(
      logs.map((log) => log.userId?.toString()).filter((id) => id),
    ).size;
    const grantedAccess = logs.filter((log) => log.status === "granted").length;
    const successRate =
      totalAccess > 0
        ? ((grantedAccess / totalAccess) * 100).toFixed(1) + "%"
        : "0%";

    // Group by location
    const locationCount = {};
    logs.forEach((log) => {
      if (log.location) {
        locationCount[log.location] = (locationCount[log.location] || 0) + 1;
      }
    });

    const byLocation = Object.entries(locationCount)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Find peak hour
    const hourCount = new Array(24).fill(0);
    logs.forEach((log) => {
      const hour = new Date(log.timestamp).getHours();
      hourCount[hour]++;
    });

    const peakHourIndex = hourCount.indexOf(Math.max(...hourCount));
    const peakHour =
      peakHourIndex >= 0
        ? `${peakHourIndex.toString().padStart(2, "0")}:00 - ${(peakHourIndex + 1).toString().padStart(2, "0")}:00`
        : "N/A";

    // Most accessed location
    const mostAccessed = byLocation.length > 0 ? byLocation[0].location : "N/A";

    res.json({
      success: true,
      data: {
        totalAccess,
        uniqueUsers,
        peakHour,
        mostAccessed,
        successRate,
        byLocation,
      },
    });
  } catch (error) {
    console.error("Get access reports error:", error);
    res.status(500).json({ success: false, message: "Failed to get reports" });
  }
});

// Get security logs
app.get("/api/admin/security-logs", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { status, page = 1, limit = 50 } = req.query;
    let query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const logs = await AccessLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("userId", "firstName lastName email");

    const total = await AccessLog.countDocuments(query);

    res.json({
      success: true,
      logs,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("Get security logs error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to get security logs" });
  }
});

// Get system health
app.get("/api/admin/health", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const dbStatus =
      mongoose.connection.readyState === 1 ? "Online" : "Offline";

    res.json({
      success: true,
      health: {
        database: dbStatus,
        api: "Running",
        nfcService: "Active",
        emailDelivery: mailTransporter
          ? mailTransporterVerified
            ? "SMTP Ready"
            : "SMTP Configured - Verify Failed"
          : "Simulation Mode",
      },
    });
  } catch (error) {
    console.error("Get system health error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to get system health" });
  }
});

// Create backup (simplified)
app.post("/api/admin/backup", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: "System backup created",
    });
    await accessLog.save();

    res.json({ success: true, message: "Backup created successfully" });
  } catch (error) {
    console.error("Create backup error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create backup" });
  }
});

// Get system settings
app.get("/api/admin/settings", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const settingsRecord = await getSystemSettingsRecord();

    res.json({
      success: true,
      settings: sanitizeSystemSettings(settingsRecord?.toObject?.() || settingsRecord || {}),
    });
  } catch (error) {
    console.error("Get system settings error:", error);
    res.status(500).json({ success: false, message: "Failed to get settings" });
  }
});

// Update system settings
app.put("/api/admin/settings", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const settings = sanitizeSystemSettings(req.body || {});
    await AppSettings.findOneAndUpdate(
      { key: "system" },
      { $set: { ...settings, updatedAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: "System settings updated",
    });
    await accessLog.save();

    res.json({
      success: true,
      message: "Settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Update system settings error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update settings" });
  }
});

// Get shared campus map settings
app.get("/api/map-settings", async (req, res) => {
  try {
    const settingsRecord = await getSystemSettingsRecord();
    res.set("Cache-Control", "no-store");
    res.json({
      success: true,
      mapSettings: sanitizeMapConfiguration(settingsRecord?.mapConfiguration || {}),
      updatedAt: settingsRecord?.updatedAt || null,
    });
  } catch (error) {
    console.error("Get map settings error:", error);
    res.status(500).json({ success: false, message: "Failed to get map settings" });
  }
});

// Update shared campus map settings
app.put("/api/admin/map-settings", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const mapSettings = sanitizeMapConfiguration(req.body || {});
    await AppSettings.findOneAndUpdate(
      { key: "system" },
      { $set: { mapConfiguration: mapSettings, updatedAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: "Campus map settings updated",
    });
    await accessLog.save();

    res.json({
      success: true,
      message: "Map settings updated successfully",
      mapSettings,
    });
  } catch (error) {
    console.error("Update map settings error:", error);
    res.status(500).json({ success: false, message: "Failed to update map settings" });
  }
});

// Update user access permissions
app.put("/api/admin/users/:id/access", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { canAccess, restrictedAreas, timeRestrictions, cardActive } =
      req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Store access permissions
    user.accessPermissions = {
      canAccess: canAccess || [],
      restrictedAreas: restrictedAreas || [],
      timeRestrictions: timeRestrictions || [],
      cardActive: cardActive !== false,
    };

    await user.save();

    // Create access log
    const accessLog = new AccessLog({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      location: "Admin Panel",
      accessType: "system",
      status: "granted",
      notes: `Updated access permissions for ${user.email}`,
    });
    await accessLog.save();

    res.json({
      success: true,
      message: "Access permissions updated successfully",
    });
  } catch (error) {
    console.error("Update access permissions error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update access permissions" });
  }
});


// ========== 2FA HELPERS ==========
const speakeasy = require('speakeasy');
const TRUST_DEVICE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}
function generateTwoFaSecret() {
  return speakeasy.generateSecret({ length: 20 }).base32;
}
function generateBackupCodes(count = 5) {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{1,2}/g).join('-')
  );
}
function generateTrustedDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}
async function verifyTrustedDevice(userId, tokenHash) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.trustedDeviceToken || !user.trustedDeviceExpiresAt || new Date(user.trustedDeviceExpiresAt) <= new Date()) return false;
    const isValid = crypto.timingSafeEqual(Buffer.from(user.trustedDeviceToken,'hex'), Buffer.from(tokenHash,'hex'));
    if (isValid) { user.lastUsedAt = new Date(); await user.save(); }
    return isValid;
  } catch (e) { return false; }
}

// ========== 2FA ENDPOINTS ==========
app.post('/api/auth/verify-2fa', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user._id);
    if (!user || !user.isTwoFaEnabled) return res.status(400).json({ error: '2FA not enabled' });
    const verified = speakeasy.totp.verify({ secret: user.twoFaSecret, encoding: 'base32', token, window: 1 });
    if (!verified) return res.status(400).json({ error: 'Invalid 2FA token' });
    const authToken = generateToken(user._id);
    res.json({ success: true, token: authToken, user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ error: 'Failed to verify 2FA' }); }
});

app.post('/api/auth/enable-2fa', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const twoFaSecret = generateTwoFaSecret();
    const backupCodes = generateBackupCodes(5);
    user.isTwoFaEnabled = true; user.twoFaSecret = twoFaSecret; user.twoFaBackupCodes = backupCodes.map(hashToken);
    await user.save();
    res.json({ success: true, secret: twoFaSecret, backupCodes });
  } catch (e) { res.status(500).json({ error: 'Failed to enable 2FA' }); }
});

app.post('/api/auth/disable-2fa', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isTwoFaEnabled = false; user.twoFaSecret = null; user.twoFaBackupCodes = [];
    await user.save();
    res.json({ success: true, message: '2FA disabled' });
  } catch (e) { res.status(500).json({ error: 'Failed to disable 2FA' }); }
});

app.post('/api/auth/trust-device', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const trustedDeviceToken = generateTrustedDeviceToken();
    user.trustedDeviceToken = hashToken(trustedDeviceToken);
    user.trustedDeviceExpiresAt = new Date(Date.now() + TRUST_DEVICE_DURATION_MS);
    await user.save();
    res.json({ success: true, trustedDeviceToken });
  } catch (e) { res.status(500).json({ error: 'Failed to trust device' }); }
});

app.post('/api/auth/verify-trusted-device', authMiddleware, async (req, res) => {
  try {
    const trustedDeviceToken = String(req.body?.trustedDeviceToken || '').trim();
    if (!trustedDeviceToken) {
      return res.status(400).json({ success: false, error: 'Trusted-device token is required' });
    }

    const trusted = await verifyTrustedDevice(req.user._id, hashToken(trustedDeviceToken));
    if (!trusted) {
      return res.status(401).json({ success: false, error: 'Trusted device is invalid or expired' });
    }

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to verify trusted device' });
  }
});

app.post('/api/auth/untrust-device', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.trustedDeviceToken = null; user.trustedDeviceExpiresAt = null;
    await user.save();
    res.json({ success: true, message: 'Device trust removed' });
  } catch (e) { res.status(500).json({ error: 'Failed to remove device trust' }); }
});

// ========== ERROR HANDLING MIDDLEWARE ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path, method: req.method });
});

app.use((err, req, res, next) => {
  if (err?.code === "CORS_ORIGIN_DENIED") {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request body is too large",
      message: "Reduce the upload size and try again.",
    });
  }
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;

if (!isVercelRuntime && require.main === module) {
  const server = app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
    console.log('API: http://localhost:' + PORT + '/api');
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') { console.error('Port in use'); process.exit(1); }
    else { console.error(error); }
  });
  process.on('SIGINT', () => {
    isShuttingDown = true;
    if (mongoReconnectTimer) clearTimeout(mongoReconnectTimer);
    server.close(() => {
      mongoose.connection.close(false, () => process.exit(0));
    });
  });
}

module.exports = app;
