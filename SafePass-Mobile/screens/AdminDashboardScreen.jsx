import Alert from '../utils/Alert';
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  AppState,
  Animated,
  StatusBar,
  Dimensions,
  Switch,
  Image,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import ApiService from "../utils/ApiService";
import AIService from "../utils/AIService";
import SharedMonitoringMap from "../components/SharedMonitoringMap";
import {
  formatSafePassDateTime,
  formatSafePassTime,
} from "../utils/dateTimeUtils";
import { printRecordsTable, printUserList } from "../utils/printUtils";
import {
  MONITORING_MAP_BLUEPRINTS,
  MONITORING_MAP_FLOORS,
  MONITORING_MAP_OFFICES,
  MONITORING_MAP_OFFICE_POSITIONS,
} from "../utils/monitoringMapConfig";
import {
  buildManagedMapLabels,
  normalizeMapRoomPositions,
  normalizeMapRooms,
  normalizeMapSettingsPayload,
} from "../utils/mapSettingsUtils";
import {
  PHILIPPINE_MOBILE_NUMBER_MESSAGE,
  isValidPhilippineMobileNumber,
  normalizePhilippineMobileNumber,
} from "../utils/phoneValidation";
import { MobileConnectionBanner } from "../components/mobile/MobileRoleComponents";
import {
  buildDepartmentFilterOptions,
  countMapActivitiesByFilter,
  filterAdminUsers,
  getUserStatusGroups,
} from "../utils/adminDashboardHelpers";
import styles from "../styles/AdminDashboardStyles";

const { width, height } = Dimensions.get("window");
const ADMIN_BLUE = "#1C6DD0";
const ADMIN_BLUE_DARK = "#0A3D91";
const SMART_REFRESH_MIN_INTERVAL_MS = 30000;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const Storage = Platform.OS === "web"
  ? require("../utils/webStorage").default
  : require("@react-native-async-storage/async-storage").default;

const isSafePassConnectionError = (error) =>
  Boolean(error?.isSafePassConnectionError) ||
  String(error?.code || "") === "SAFEPASS_CONNECTION_ERROR" ||
  String(error?.message || "").includes("Cannot connect to the SafePass server") ||
  String(error?.message || "").includes("Network request failed");

const HoverBubble = ({ children, style, hoverScale = 1.05, onPress, ...props }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = useCallback((toValue) => {
    if (Platform.OS !== "web") return;
    Animated.spring(scale, {
      toValue,
      useNativeDriver: false,
      tension: 180,
      friction: 12,
    }).start();
  }, [scale]);

  return (
    <AnimatedPressable
      {...props}
      onPress={onPress}
      onHoverIn={() => animateScale(hoverScale)}
      onHoverOut={() => animateScale(1)}
      onMouseEnter={() => animateScale(hoverScale)}
      onMouseLeave={() => animateScale(1)}
      style={[
        style,
        Platform.OS === "web" && styles.hoverBubble,
        { transform: [{ scale }] },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
};

const STAFF_DEPARTMENT_OPTIONS = [
  { value: "Admissions", label: "Admissions", area: "Ground Floor" },
  { value: "Lobby", label: "Lobby / Front Desk", area: "Ground Floor" },
  { value: "Cashier", label: "Cashier", area: "Ground Floor" },
  { value: "Registrar", label: "Registrar", area: "Ground Floor" },
  { value: "Accounting", label: "Accounting", area: "Ground Floor" },
  { value: "File Room", label: "File Room", area: "Ground Floor" },
  { value: "Ground Offices", label: "Offices", area: "Ground Floor" },
  { value: "Kitchen", label: "Kitchen", area: "Ground Floor" },
  { value: "Guidance", label: "Guidance", area: "Ground Floor" },
  { value: "Conference Room", label: "Conference Room", area: "Mezzanine" },
  { value: "Chairman", label: "Chairman", area: "Mezzanine" },
  { value: "Flight Operations", label: "Flight Operations", area: "Mezzanine" },
  { value: "Training", label: "Head of Training Room", area: "Mezzanine" },
  { value: "I.T Room", label: "I.T Room", area: "Mezzanine" },
  { value: "Faculty Room", label: "Faculty Room", area: "Mezzanine" },
  { value: "Administration", label: "Administration", area: "Mezzanine" },
  { value: "STO", label: "STO", area: "Mezzanine" },
  { value: "Mock Up", label: "Mock Up", area: "Second Floor" },
  { value: "Laboratory", label: "Laboratory", area: "Second Floor" },
  { value: "TESDA", label: "TESDA", area: "Second Floor" },
  { value: "Workshop", label: "Workshop", area: "Third Floor" },
  { value: "Tools Room", label: "Tools Room", area: "Third Floor" },
  { value: "Library", label: "Library", area: "Third Floor" },
  { value: "Student Services", label: "Students Lounge", area: "Third Floor" },
];

const STAFF_OFFICER_OPTIONS_BY_DEPARTMENT = {
  Admissions: [
    { value: "Admissions Officer", label: "Admissions Officer" },
    { value: "Front Desk Officer", label: "Front Desk Officer" },
  ],
  Lobby: [
    { value: "Front Desk Officer", label: "Front Desk Officer" },
    { value: "Visitor Assistance Officer", label: "Visitor Assistance Officer" },
  ],
  Cashier: [
    { value: "Cashier", label: "Cashier" },
    { value: "Payment Officer", label: "Payment Officer" },
  ],
  Registrar: [
    { value: "Registrar Officer", label: "Registrar Officer" },
    { value: "Records Officer", label: "Records Officer" },
  ],
  Accounting: [
    { value: "Accounting Officer", label: "Accounting Officer" },
    { value: "Cashier", label: "Cashier" },
  ],
  Guidance: [
    { value: "Guidance Officer", label: "Guidance Officer" },
    { value: "Student Services Officer", label: "Student Services Officer" },
  ],
  "File Room": [
    { value: "Records Officer", label: "Records Officer" },
    { value: "Document Custodian", label: "Document Custodian" },
  ],
  "Ground Offices": [
    { value: "Administrative Officer", label: "Administrative Officer" },
    { value: "Office Coordinator", label: "Office Coordinator" },
  ],
  Kitchen: [
    { value: "Kitchen Staff", label: "Kitchen Staff" },
    { value: "Facilities Support", label: "Facilities Support" },
  ],
  "Conference Room": [
    { value: "Meeting Coordinator", label: "Meeting Coordinator" },
    { value: "Administrative Assistant", label: "Administrative Assistant" },
  ],
  Chairman: [
    { value: "Chairman", label: "Chairman" },
    { value: "Executive Assistant", label: "Executive Assistant" },
  ],
  "Flight Operations": [
    { value: "Flight Operations Officer", label: "Flight Operations Officer" },
    { value: "Operations Coordinator", label: "Operations Coordinator" },
  ],
  Training: [
    { value: "Training Officer", label: "Training Officer" },
    { value: "Training Coordinator", label: "Training Coordinator" },
  ],
  "I.T Room": [
    { value: "I.T Officer", label: "I.T Officer" },
    { value: "Technical Support Officer", label: "Technical Support Officer" },
  ],
  "Faculty Room": [
    { value: "Faculty Officer", label: "Faculty Officer" },
    { value: "Faculty Coordinator", label: "Faculty Coordinator" },
  ],
  Administration: [
    { value: "Administrative Officer", label: "Administrative Officer" },
    { value: "Academy Director", label: "Academy Director" },
  ],
  STO: [
    { value: "STO Officer", label: "STO Officer" },
    { value: "Safety Training Officer", label: "Safety Training Officer" },
  ],
  "Mock Up": [
    { value: "Mock Up Instructor", label: "Mock Up Instructor" },
    { value: "Training Assistant", label: "Training Assistant" },
  ],
  Laboratory: [
    { value: "Laboratory Instructor", label: "Laboratory Instructor" },
    { value: "Laboratory Custodian", label: "Laboratory Custodian" },
  ],
  TESDA: [
    { value: "TESDA Coordinator", label: "TESDA Coordinator" },
    { value: "Assessment Officer", label: "Assessment Officer" },
  ],
  Workshop: [
    { value: "Workshop Instructor", label: "Workshop Instructor" },
    { value: "Workshop Supervisor", label: "Workshop Supervisor" },
  ],
  "Tools Room": [
    { value: "Tools Custodian", label: "Tools Custodian" },
    { value: "Maintenance Staff", label: "Maintenance Staff" },
  ],
  Library: [
    { value: "Librarian", label: "Librarian" },
    { value: "Library Assistant", label: "Library Assistant" },
  ],
  "Student Services": [
    { value: "Student Services Officer", label: "Student Services Officer" },
    { value: "Lounge Coordinator", label: "Lounge Coordinator" },
  ],
};

const ADMIN_MODULE_FLOORS = [
  { id: "ground", name: "Ground Floor", icon: "home-outline" },
  { id: "first", name: "Mezzanine", icon: "arrow-up-outline" },
  { id: "second", name: "Second Floor", icon: "business-outline" },
  { id: "third", name: "Third Floor", icon: "layers-outline" },
];

const DEFAULT_DATA_COLLECTION_FIELDS = [
  { id: "full-name", label: "Full Name", type: "text", required: true, enabled: true, scope: "visitor" },
  { id: "email-address", label: "Email Address", type: "email", required: true, enabled: true, scope: "visitor" },
  { id: "phone-number", label: "Phone Number", type: "tel", required: true, enabled: true, scope: "visitor" },
  { id: "purpose-of-visit", label: "Purpose of Visit", type: "text", required: true, enabled: true, scope: "visitor" },
  { id: "office-destination", label: "Office Destination", type: "select", required: true, enabled: true, scope: "visitor" },
];

const normalizeTextToId = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;

const normalizeMapText = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const DEFAULT_APPOINTMENT_MANAGEMENT_OPTIONS = {
  offices: [
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
  ].map((label) => ({ id: `office-${normalizeTextToId(label)}`, label, enabled: true })),
  purposes: ["Enrollment", "Payment", "Inquiry", "Document Request", "Other"].map((label) => ({
    id: `purpose-${normalizeTextToId(label)}`,
    label,
    enabled: true,
  })),
  timeSlots: [],
};

for (let hour = 7; hour <= 18; hour += 1) {
  for (const minute of [0, 30]) {
    const hour12 = hour % 12 || 12;
    const suffix = hour >= 12 ? "PM" : "AM";
    DEFAULT_APPOINTMENT_MANAGEMENT_OPTIONS.timeSlots.push({
      id: `slot-${String(hour).padStart(2, "0")}-${String(minute).padStart(2, "0")}`,
      label: `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`,
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      hour,
      minute,
      capacity: 3,
      enabled: true,
    });
  }
}

const ROOM_STORAGE_KEY = "adminManagedRooms";
const ROOM_POSITION_STORAGE_KEY = "adminManagedRoomPositions";
const DATA_FIELDS_STORAGE_KEY = "adminDynamicDataFields";

const FLOOR_VIEW_TO_ID = {
  "map-ground": "ground",
  "map-mezzanine": "first",
  "map-second": "second",
  "map-third": "third",
};

const createRoomDraft = (floor = "ground") => ({
  id: "",
  name: "",
  floor,
  icon: "business-outline",
  x: "50",
  y: "50",
});

const createFieldDraft = () => ({
  id: "",
  label: "",
  type: "text",
  required: false,
  enabled: true,
  scope: "visitor",
});

const createAppointmentFilterDraft = () => ({
  date: "",
  time: "all",
  office: "all",
  status: "all",
  purpose: "all",
});

const ATTENDANCE_SCOPE_OPTIONS = [
  { key: "all", label: "All Person Types", roles: ["student", "teacher", "staff", "security", "guard", "visitor"] },
  { key: "students", label: "Students", roles: ["student"] },
  { key: "teachers", label: "Academic Staff / Teachers", roles: ["teacher"] },
  { key: "staff", label: "Staff", roles: ["staff"] },
  { key: "security", label: "Security", roles: ["security", "guard"] },
  { key: "visitors", label: "Visitors", roles: ["visitor"] },
];

const ATTENDANCE_DATE_SHORTCUTS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "all", label: "All" },
];

const DEFAULT_ADMIN_SETTINGS = {
  emailNotifications: true,
  smsAlerts: true,
  autoApprove: false,
  maintenanceMode: false,
  darkMode: false,
  twoFactorAuth: false,
  sessionTimeout: "30",
  maxLoginAttempts: "5",
  dateFormat: "MM/DD/YYYY",
  timeFormat: "12h",
  language: "en",
};

const ALL_ADMIN_SUBMODULES = [
  "dashboard",
  "account-create",
  "account-records",
  "data-management",
  "map-ground",
  "map-mezzanine",
  "map-second",
  "map-third",
  "appointment-records",
  "appointment-management",
  "attendance-records",
  "analytics",
  "report-records",
  "security-report-records",
  "settings",
];

const storageGetItem = async (key) => {
  if (Storage && typeof Storage.getItem === "function") {
    return Storage.getItem(key);
  }
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return null;
};

const storageSetItem = async (key, value) => {
  if (Storage && typeof Storage.setItem === "function") {
    return Storage.setItem(key, value);
  }
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(key, value);
  }
};

const storageRemoveItem = async (key) => {
  if (Storage && typeof Storage.removeItem === "function") {
    return Storage.removeItem(key);
  }
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(key);
  }
};

const storageMultiRemove = async (keys) => {
  if (Storage && typeof Storage.multiRemove === "function") {
    return Storage.multiRemove(keys);
  }
  await Promise.all((keys || []).map((key) => storageRemoveItem(key)));
};

const storageClear = async () => {
  if (Storage && typeof Storage.clear === "function") {
    return Storage.clear();
  }
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
};

// Helper Functions
const formatDateTime = (date) => {
  return formatSafePassDateTime(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTime = (date) => {
  return formatSafePassTime(date, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateInputValue = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const sanitizeDateInputValue = (value) =>
  String(value || "")
    .replace(/[^\d-]/g, "")
    .slice(0, 10);

const parseDateInputValue = (value) => {
  const sanitizedValue = sanitizeDateInputValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sanitizedValue)) return null;

  const [year, month, day] = sanitizedValue.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
};

const formatTimeInputValue = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour ago`;
  if (diffDays < 7) return `${diffDays} day ago`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatFilterDateLabel = (date) => {
  if (!date) return "Pick Date";
  const resolvedDate = new Date(date);
  if (Number.isNaN(resolvedDate.getTime())) return "Pick Date";
  return resolvedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const titleCaseLabel = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase()) || "Unknown";

const getAttendanceDateRange = (shortcut = "today") => {
  const matchedShortcut = ATTENDANCE_DATE_SHORTCUTS.find((item) => item.key === shortcut);
  if (!matchedShortcut?.days) return {};

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (matchedShortcut.days - 1));

  return {
    dateFrom: formatDateInputValue(start),
    dateTo: formatDateInputValue(end),
  };
};

const getAttendanceStatusColor = (status = "") => {
  const normalizedStatus = String(status || "").toLowerCase();
  if (["inside", "present"].includes(normalizedStatus)) {
    return { background: "#DCFCE7", text: "#166534" };
  }
  if (normalizedStatus === "late") {
    return { background: "#FEF3C7", text: "#92400E" };
  }
  if (["checked_out", "completed"].includes(normalizedStatus)) {
    return { background: "#E0F2FE", text: "#075985" };
  }
  if (["expired", "no_show"].includes(normalizedStatus)) {
    return { background: "#FEE2E2", text: "#B91C1C" };
  }
  return { background: "#E2E8F0", text: "#475569" };
};

const getStatusColor = (status) => {
  switch (status) {
    case "pending":
      return { bg: "#FEF3C7", text: "#D97706", label: "PENDING" };
    case "approved":
      return { bg: "#EEF5FF", text: "#0A3D91", label: "APPROVED" };
    case "rejected":
      return { bg: "#FEE2E2", text: "#DC2626", label: "REJECTED" };
    case "cancelled":
      return { bg: "#FEE2E2", text: "#B91C1C", label: "CANCELLED" };
    case "rescheduled":
      return { bg: "#E0F2FE", text: "#0369A1", label: "RESCHEDULED" };
    case "no_show":
      return { bg: "#FFEDD5", text: "#C2410C", label: "NO-SHOW" };
    case "expired":
      return { bg: "#E5E7EB", text: "#4B5563", label: "EXPIRED" };
    case "checked_in":
      return { bg: "#EEF5FF", text: "#0A3D91", label: "CHECKED IN" };
    case "checked_out":
      return { bg: "#E5E7EB", text: "#6B7280", label: "CHECKED OUT" };
    default:
      return { bg: "#F3F4F6", text: "#6B7280", label: "UNKNOWN" };
  }
};

const getRoleColor = (role) => {
  switch (role) {
    case "admin":
      return "#1B4F72";
    case "staff":
      return "#2980B9";
    case "student":
      return "#0A3D91";
    case "teacher":
      return "#0A3D91";
    case "guard":
      return "#E67E22";
    case "security":
      return "#1C6DD0";
    case "visitor":
      return "#2ECC71";
    default:
      return "#7F8C8D";
  }
};

const getRoleIcon = (role) => {
  switch (role) {
    case "admin":
      return "airplane-outline";
    case "staff":
      return "school-outline";
    case "student":
      return "id-card-outline";
    case "teacher":
      return "school-outline";
    case "guard":
      return "shield-outline";
    case "security":
      return "shield-checkmark-outline";
    case "visitor":
      return "person-outline";
    default:
      return "person-circle-outline";
  }
};

const isSecurityRole = (role) => role === "security" || role === "guard";

const isUserActive = (user) => {
  if (!user) return false;
  if (user.status) return user.status === "active";
  return user.isActive === true;
};

const formatRoleLabel = (role) => {
  if (isSecurityRole(role)) return "Security";
  if (String(role || "").toLowerCase() === "teacher") return "Academic Staff";
  if (String(role || "").toLowerCase() === "staff") return "Admin Services Staff";
  if (!role) return "User";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const sanitizeAccountEmailPart = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeAdminNfcCardUid = (value = "") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  const compactHexValue = rawValue.replace(/[\s:-]/g, "");
  if (/^[0-9A-Fa-f]+$/.test(compactHexValue) && compactHexValue.length >= 4) {
    return compactHexValue.toUpperCase();
  }

  return rawValue.toUpperCase();
};

const getAccountEmailRolePart = (form = {}) => {
  if (String(form.role || "").toLowerCase() === "student") return "student";
  if (String(form.role || "").toLowerCase() === "teacher") return "academic";
  if (isSecurityRole(form.role)) return "security";
  return sanitizeAccountEmailPart(form.department || form.position || "staff") || "staff";
};

const generateAccountEmail = (form = {}, users = []) => {
  const firstNamePart = sanitizeAccountEmailPart(form.firstName);
  const rolePart = getAccountEmailRolePart(form);
  if (!firstNamePart) return "";

  const baseLocalPart = `${firstNamePart}${rolePart}`;
  const existingEmails = new Set(
    (users || [])
      .map((userItem) => String(userItem?.email || "").trim().toLowerCase())
      .filter(Boolean),
  );

  let suffix = 1;
  let candidate = `${baseLocalPart}@sapphire.edu`;
  while (existingEmails.has(candidate)) {
    suffix += 1;
    candidate = `${baseLocalPart}${suffix}@sapphire.edu`;
  }

  return candidate;
};

const generateAccountEmployeeId = (form = {}, users = []) => {
  const normalizedRole = String(form.role || "").toLowerCase();
  const prefix = normalizedRole === "student" ? "STU" : normalizedRole === "teacher" ? "TCH" : isSecurityRole(form.role) ? "SEC" : "STF";
  const year = new Date().getFullYear();
  const base = `${prefix}-${year}`;
  const existingIds = new Set(
    (users || [])
      .map((userItem) => String(normalizedRole === "student" ? userItem?.studentId : normalizedRole === "teacher" ? userItem?.teacherId : userItem?.employeeId || "").trim().toUpperCase())
      .filter(Boolean),
  );
  let highestSequence = 0;

  existingIds.forEach((employeeId) => {
    const match = employeeId.match(new RegExp(`^${base}-(\\d+)$`));
    if (match) {
      highestSequence = Math.max(highestSequence, Number(match[1]) || 0);
    }
  });

  let sequence = highestSequence + 1;
  let candidate = `${base}-${String(sequence).padStart(3, "0")}`;
  while (existingIds.has(candidate)) {
    sequence += 1;
    candidate = `${base}-${String(sequence).padStart(3, "0")}`;
  }

  return candidate;
};

const getUserInitials = (user) => {
  const first = String(user?.firstName || "").trim().charAt(0);
  const last = String(user?.lastName || "").trim().charAt(0);
  return `${first}${last}`.trim().toUpperCase() || "U";
};

const getRequestStatus = (request) => {
  if (!request) return "unknown";
  const requestCategory = String(request.requestCategory || "").toLowerCase();
  const appointmentStatus = String(request.appointmentStatus || "").toLowerCase();
  const approvalStatus = String(request.approvalStatus || "").toLowerCase();
  const visitStatus = String(request.status || "").toLowerCase();

  if (requestCategory === "appointment") {
    if (visitStatus === "expired") return "expired";
    if (visitStatus === "no_show") return "no_show";
    if (appointmentStatus === "cancelled") return "cancelled";
    if (appointmentStatus === "rescheduled") return "rescheduled";
    if (appointmentStatus === "pending") return "pending";
    if (appointmentStatus === "rejected") return "rejected";
    if (appointmentStatus === "approved" || appointmentStatus === "adjusted") {
      return "approved";
    }
  }

  if (approvalStatus === "pending" || visitStatus === "pending") return "pending";
  if (approvalStatus === "rejected" || visitStatus === "rejected") return "rejected";
  if (approvalStatus === "approved" || ["approved", "checked_in", "checked_out"].includes(visitStatus)) {
    return "approved";
  }

  return approvalStatus || visitStatus || "unknown";
};

const getAppointmentRecordLatestSortValue = (record = {}) => {
  const candidates = [
    record.updatedAt,
    record.staffActionAt,
    record.approvedAt,
    record.appointmentRequestedAt,
    record.visitTime,
    record.visitDate,
    record.scheduledVisitStart,
    record.createdAt,
    record.registeredAt,
  ];

  for (const value of candidates) {
    const date = value ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  return 0;
};

const compareAppointmentRecordsByLatest = (left, right) => {
  const timeDifference =
    getAppointmentRecordLatestSortValue(right) - getAppointmentRecordLatestSortValue(left);
  if (timeDifference !== 0) return timeDifference;
  return String(right?._id || "").localeCompare(String(left?._id || ""));
};

const AdminSectionShell = ({
  title,
  subtitle,
  badge,
  actions,
  children,
  isDarkMode,
  theme,
}) => (
  <View
    style={[
      styles.adminSectionShell,
      {
        backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
        borderColor: isDarkMode ? "rgba(148, 163, 184, 0.14)" : theme.borderColor,
      },
    ]}
  >
    <View style={styles.adminSectionShellHeader}>
      <View style={styles.adminSectionShellCopy}>
        <View style={styles.adminSectionShellTitleRow}>
          <Text style={[styles.pageTitle, isDarkMode && styles.darkText]}>{title}</Text>
          {badge ? (
            <View
              style={[
                styles.adminSectionShellBadge,
                {
                  backgroundColor: isDarkMode ? "#0F172A" : "#EFF6FF",
                  borderColor: isDarkMode ? "rgba(148, 163, 184, 0.14)" : theme.borderColor,
                },
              ]}
            >
              <Text
                style={[
                  styles.adminSectionShellBadgeText,
                  { color: isDarkMode ? "#B7D5F6" : "#041E42" },
                ]}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={[styles.headerSubtitle, isDarkMode && styles.darkTextSecondary]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.adminSectionShellActions}>{actions}</View> : null}
    </View>
    {children}
  </View>
);

const AdminFeedbackBanner = ({ notice, isDarkMode, theme, onDismiss }) => {
  if (!notice) return null;

  const palette =
    notice.type === "success"
      ? { background: isDarkMode ? "#052E16" : "#EEF5FF", border: "#86EFAC", icon: "#16A34A" }
      : notice.type === "error"
        ? { background: isDarkMode ? "#450A0A" : "#FEF2F2", border: "#FECACA", icon: "#DC2626" }
        : { background: isDarkMode ? "#082F49" : "#EFF6FF", border: "#B7D5F6", icon: "#0A3D91" };

  return (
    <View
      style={[
        styles.adminFeedbackBanner,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={[styles.adminFeedbackAccent, { backgroundColor: palette.icon }]} />
      <Ionicons
        name={notice.type === "error" ? "alert-circle-outline" : "checkmark-circle-outline"}
        size={20}
        color={palette.icon}
      />
      <View style={styles.adminFeedbackCopy}>
        <Text style={[styles.adminFeedbackTitle, { color: theme.textPrimary }]}>
          {notice.title}
        </Text>
        {notice.message ? (
          <Text style={[styles.adminFeedbackMessage, { color: theme.textSecondary }]}>
            {notice.message}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={onDismiss} style={styles.adminFeedbackDismiss}>
        <Ionicons name="close" size={16} color={theme.textSecondary} />
      </TouchableOpacity>
    </View>
  );
};

const AdminThemeToggle = ({ isDarkMode, onToggle, compact = false }) => (
  <TouchableOpacity
    style={[
      styles.adminThemeToggle,
      isDarkMode && styles.adminThemeToggleDark,
      compact && styles.adminThemeToggleCompact,
    ]}
    onPress={() => onToggle(!isDarkMode)}
    activeOpacity={0.84}
    accessibilityRole="button"
    accessibilityLabel={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
  >
    <View
      style={[
        styles.adminThemeToggleIcon,
        isDarkMode && styles.adminThemeToggleIconDark,
      ]}
    >
      <Ionicons
        name={isDarkMode ? "moon" : "sunny"}
        size={compact ? 15 : 16}
        color={isDarkMode ? "#DBEAFE" : "#0A3D91"}
      />
    </View>
    {!compact ? (
      <Text style={[styles.adminThemeToggleText, isDarkMode && styles.adminThemeToggleTextDark]}>
        {isDarkMode ? "Dark" : "Light"}
      </Text>
    ) : null}
  </TouchableOpacity>
);

const ADMIN_MAP_FLOORS = ADMIN_MODULE_FLOORS;
const ADMIN_MAP_ACTIVITY_TYPES = new Set([
  "visitor_registration_request",
  "visitor_appointment_request",
  "admin_approved_registration",
  "admin_rejected_registration",
  "staff_approved_appointment",
  "staff_adjusted_appointment",
  "staff_rejected_appointment",
  "staff_completed_appointment",
  "security_checkin",
  "visitor_self_checkin",
  "security_checkout",
  "visitor_self_checkout",
]);

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeMonitoringFloor = (floorId) => (floorId === "mezzanine" ? "first" : floorId);

const getMapTrackingSourceLabel = (item) => {
  const source = String(
    item?.trackingSource ||
      item?.location?.source ||
      item?.sourceVisitor?.currentLocation?.source ||
      "",
  ).toLowerCase();

  if (source.includes("phone")) return "Phone GPS";
  if (source.includes("arduino") || source.includes("tap") || source.includes("nfc")) return "Tap checkpoint";
  if (source.includes("manual")) return "Manual update";
  if (source.includes("estimate")) return "Estimated location";
  return "Tracking update";
};

const getMapFreshnessLabel = (dateValue) => {
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return "No recent update";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 45) return "Live now";
  if (diffSeconds < 180) return `${Math.max(1, Math.floor(diffSeconds / 60))}m ago`;
  if (diffSeconds < 900) return `${Math.floor(diffSeconds / 60)}m ago`;
  return "Stale update";
};

const getActivityLabel = (activityType) => {
  switch (activityType) {
    case "visitor_appointment_request":
      return "Appointment Request";
    case "visitor_account_registration":
      return "Visitor Account";
    case "admin_approved_registration":
      return "Admin Approval";
    case "admin_rejected_registration":
      return "Admin Rejection";
    case "staff_approved_appointment":
      return "Staff Approval";
    case "staff_adjusted_appointment":
      return "Time Adjusted";
    case "staff_rejected_appointment":
      return "Staff Rejection";
    case "staff_completed_appointment":
      return "Appointment Complete";
    case "security_checkin":
    case "visitor_self_checkin":
      return "Check In";
    case "security_checkout":
    case "visitor_self_checkout":
      return "Check Out";
    case "visitor_registration_request":
      return "Registration Request";
    default:
      return "System Activity";
  }
};

const getActivityMarkerStatus = (activity) => {
  const type = String(activity?.activityType || "").toLowerCase();
  if (type.includes("reject")) return "alert";
  if (type.includes("checkin")) return "checked_in";
  if (type.includes("appointment_request") || type.includes("adjusted")) return "moving";
  if (type.includes("approve")) return "active";
  return "active";
};

const getAdminMapFilterKey = (activityType) => {
  const type = String(activityType || "").toLowerCase();
  if (type.includes("request")) return "requests";
  if (type.includes("approve")) return "approvals";
  if (type.includes("checkin") || type.includes("checkout")) return "movement";
  if (type.includes("reject") || type.includes("adjust")) return "issues";
  return "all";
};

const getActivityCoordinates = (activity, index = 0) => {
  const haystack = [
    activity?.location,
    activity?.notes,
    activity?.activityType,
    activity?.relatedVisitor?.assignedOffice,
    activity?.relatedVisitor?.host,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const zones = [
    { keywords: ["gate", "checkpoint", "entry"], x: 18, y: 78 },
    { keywords: ["admin"], x: 78, y: 22 },
    { keywords: ["staff", "faculty", "office"], x: 64, y: 42 },
    { keywords: ["security"], x: 24, y: 30 },
    { keywords: ["hangar", "aviation", "academy"], x: 46, y: 62 },
    { keywords: ["appointment"], x: 54, y: 28 },
  ];

  const baseZone =
    zones.find((zone) => zone.keywords.some((keyword) => haystack.includes(keyword))) ||
    { x: 48, y: 48 };

  const offsetX = ((index % 4) - 1.5) * 5;
  const offsetY = ((Math.floor(index / 4) % 3) - 1) * 5;

  return {
    x: clampValue(baseZone.x + offsetX, 8, 92),
    y: clampValue(baseZone.y + offsetY, 10, 90),
  };
};

const getActivityFloor = (activity) => {
  const haystack = [
    activity?.location,
    activity?.notes,
    activity?.activityType,
    activity?.relatedVisitor?.assignedOffice,
    activity?.relatedVisitor?.host,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    [
      "conference room",
      "chairman",
      "flight operations",
      "head of training",
      "i.t room",
      "it room",
      "faculty room",
      "academy director",
      "sto",
      "mezzanine",
    ].some((keyword) => haystack.includes(keyword))
  ) {
    return "first";
  }

  if (["hr department", "it department", "second floor"].some((keyword) => haystack.includes(keyword))) {
    return "second";
  }

  if (["library", "cafeteria", "third floor"].some((keyword) => haystack.includes(keyword))) {
    return "third";
  }

  return "ground";
};

const hasVisitorLiveLocation = (visitor) =>
  Boolean(
    visitor?.currentLocation?.isActive &&
      visitor?.currentLocation?.floor &&
      Number.isFinite(Number(visitor?.currentLocation?.coordinates?.x)) &&
      Number.isFinite(Number(visitor?.currentLocation?.coordinates?.y)),
  );

const getVisitorMonitorFloor = (visitor) =>
  hasVisitorLiveLocation(visitor)
    ? visitor.currentLocation.floor
    : getActivityFloor({
    location: visitor?.assignedOffice,
    notes: visitor?.purposeOfVisit,
    relatedVisitor: visitor,
  });

const getVisitorMonitorCoordinates = (visitor, index = 0) =>
  hasVisitorLiveLocation(visitor)
    ? {
        x: Number(visitor.currentLocation.coordinates.x),
        y: Number(visitor.currentLocation.coordinates.y),
      }
    : getActivityCoordinates(
        {
          location: visitor?.assignedOffice,
          notes: visitor?.purposeOfVisit,
          relatedVisitor: visitor,
        },
        index,
      );

export default function AdminDashboardScreen({ navigation, onLogout }) {
  const { width: viewportWidth } = useWindowDimensions();
  const isAdminMobileLayout = viewportWidth < 900;
  const scrollY = useRef(new Animated.Value(0)).current;
  const mainScrollViewRef = useRef(null);
  const sidebarScrollViewRef = useRef(null);
  const dataManagementScrollViewRef = useRef(null);
  const authErrorHandledRef = useRef(false);
  const adminMapRefreshRef = useRef(false);
  const smartRefreshAtRef = useRef(0);

  // User State
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [expandedModule, setExpandedModule] = useState("account-management");
  const [selectedSubmodule, setSelectedSubmodule] = useState("dashboard");
  const [accountRecordsMode, setAccountRecordsMode] = useState("all");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showAdminMobileMenu, setShowAdminMobileMenu] = useState(false);

  // Visit Request States
  const [visitRequests, setVisitRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [rejectedRequests, setRejectedRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showPendingRequestsModal, setShowPendingRequestsModal] = useState(false);
  const [requestFilter, setRequestFilter] = useState("pending");
  const [requestDateFilter, setRequestDateFilter] = useState("all");
  const [requestDateRange, setRequestDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [requestOfficeFilter, setRequestOfficeFilter] = useState("all");
  const [requestSortOrder, setRequestSortOrder] = useState("newest");
  const [processingId, setProcessingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [requestSearchTerm, setRequestSearchTerm] = useState("");

  // Analytics States
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateAnalytics, setDateAnalytics] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    visitors: [],
  });
  const [visitorHistory, setVisitorHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyDateFilter, setHistoryDateFilter] = useState("all");
  const [historyOfficeFilter, setHistoryOfficeFilter] = useState("all");
  const [historySortOrder, setHistorySortOrder] = useState("newest");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyItemsPerPage] = useState(6);
  const [reportSearchTerm, setReportSearchTerm] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [securityReportSearchTerm, setSecurityReportSearchTerm] = useState("");
  const [securityReportStatusFilter, setSecurityReportStatusFilter] = useState("all");
  const [historyDateRange, setHistoryDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [activeFilterDateField, setActiveFilterDateField] = useState(null);
  const exactDateInputRefs = useRef({});
  const [expandedFilterSections, setExpandedFilterSections] = useState({});

  // Settings States
  const [settings, setSettings] = useState(DEFAULT_ADMIN_SETTINGS);

  const [activeSettingsTab, setActiveSettingsTab] = useState("account");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRunningSystemAction, setIsRunningSystemAction] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);
  const [lastBackupSummary, setLastBackupSummary] = useState(null);
  const [changePasswordData, setChangePasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const getId = (item) => {
    if (!item) return null;
    return item._id || item.id || item.visitorId || null;
  };

  const isDateInShortcutRange = (dateValue, shortcut) => {
    if (!dateValue || shortcut === "all") return shortcut === "all";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dayOfWeek = startOfToday.getDay();
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (shortcut === "today") return date >= startOfToday && date < endOfToday;
    if (shortcut === "week") return date >= startOfWeek && date < endOfWeek;
    if (shortcut === "last_week") return date >= startOfLastWeek && date < startOfWeek;
    if (shortcut === "month") return date >= startOfMonth && date < endOfMonth;
    return true;
  };

  const normalizeFilterValue = (value) => String(value || "").trim().toLowerCase();
  const normalizeSearchValue = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const recordMatchesSearch = (record = {}, query = "", fields = []) => {
    const normalizedQuery = normalizeSearchValue(query);
    if (!normalizedQuery) return true;

    const tokens = normalizedQuery.split(" ").filter(Boolean);
    const haystack = fields
      .map((field) => (typeof field === "function" ? field(record) : record?.[field]))
      .flat()
      .filter((value) => value !== undefined && value !== null)
      .map((value) => normalizeSearchValue(value))
      .join(" ");

    return tokens.every((token) => haystack.includes(token));
  };

  // User Management States
  const [allUsers, setAllUsers] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [guardUsers, setGuardUsers] = useState([]);
  const [visitorUsers, setVisitorUsers] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [userFilter, setUserFilter] = useState("all");
  const [userDepartmentFilter, setUserDepartmentFilter] = useState("all");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userDataPanelMode, setUserDataPanelMode] = useState(null);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [dataManagementPage, setDataManagementPage] = useState(1);
  const [dataManagementFieldPage, setDataManagementFieldPage] = useState(1);
  const [dataManagementItemsPerPage] = useState(6);
  const [appointmentRecordsPage, setAppointmentRecordsPage] = useState(1);
  const [reportRecordsPage, setReportRecordsPage] = useState(1);
  const [securityReportRecordsPage, setSecurityReportRecordsPage] = useState(1);
  const [roomManagementPage, setRoomManagementPage] = useState(1);
  const [appointmentSearchDraft, setAppointmentSearchDraft] = useState("");
  const [appointmentSearchTerm, setAppointmentSearchTerm] = useState("");
  const [appointmentFilterDraft, setAppointmentFilterDraft] = useState(createAppointmentFilterDraft);
  const [appointmentAppliedFilters, setAppointmentAppliedFilters] = useState(createAppointmentFilterDraft);
  const [showAppointmentFilterDatePicker, setShowAppointmentFilterDatePicker] = useState(false);
  const appointmentDateInputRef = useRef(null);
  const [appointmentManagementOptions, setAppointmentManagementOptions] = useState(DEFAULT_APPOINTMENT_MANAGEMENT_OPTIONS);
  const [appointmentOptionDrafts, setAppointmentOptionDrafts] = useState({
    offices: "",
    purposes: "",
    timeSlots: "",
  });
  const [appointmentSlotCapacityDrafts, setAppointmentSlotCapacityDrafts] = useState({});
  const [editingAppointmentOption, setEditingAppointmentOption] = useState(null);
  const [isSavingAppointmentOptions, setIsSavingAppointmentOptions] = useState(false);
  const [savingAppointmentOptionKey, setSavingAppointmentOptionKey] = useState(null);
  const [pendingAdminConfirm, setPendingAdminConfirm] = useState(null);
  const [activeAppointmentConfigTab, setActiveAppointmentConfigTab] = useState("offices");
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceScope, setAttendanceScope] = useState("all");
  const [attendanceDateShortcut, setAttendanceDateShortcut] = useState("today");
  const [attendanceSearchTerm, setAttendanceSearchTerm] = useState("");

  // Modal States
  const [showRequestDetailsModal, setShowRequestDetailsModal] = useState(false);
  const [officeEditValue, setOfficeEditValue] = useState("");
  const [appointmentEditDateValue, setAppointmentEditDateValue] = useState("");
  const [appointmentEditTimeValue, setAppointmentEditTimeValue] = useState("");
  const [isUpdatingOffice, setIsUpdatingOffice] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [lastUserSavedAt, setLastUserSavedAt] = useState(null);
  const [showViewUserModal, setShowViewUserModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  const [showCreateSuccessModal, setShowCreateSuccessModal] = useState(false);
  const [userManagementStatusTab, setUserManagementStatusTab] = useState("active");
  const [createUserMessage, setCreateUserMessage] = useState("");
  const [createdUserSummary, setCreatedUserSummary] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [activitySummary, setActivitySummary] = useState({
    appointmentRequests: 0,
    staffActions: 0,
    completedVisits: 0,
    approvals: 0,
  });
  const [selectedMapActivity, setSelectedMapActivity] = useState(null);
  const [hoveredMapVisitor, setHoveredMapVisitor] = useState(null);
  const [adminLiveVisitorLocations, setAdminLiveVisitorLocations] = useState([]);
  const [showAdminMapModal, setShowAdminMapModal] = useState(false);
  const [adminMapFilter, setAdminMapFilter] = useState("all");
  const [lastAdminMapRefreshAt, setLastAdminMapRefreshAt] = useState(null);
  const [selectedAdminMapFloor, setSelectedAdminMapFloor] = useState("ground");
  const [selectedAdminMapOffice, setSelectedAdminMapOffice] = useState("all");
  const [showAdminMapDock, setShowAdminMapDock] = useState(false);
  const [managedRooms, setManagedRooms] = useState(MONITORING_MAP_OFFICES);
  const [managedRoomPositions, setManagedRoomPositions] = useState(MONITORING_MAP_OFFICE_POSITIONS);
  const [dataCollectionFields, setDataCollectionFields] = useState(DEFAULT_DATA_COLLECTION_FIELDS);
  const [roomDraft, setRoomDraft] = useState(createRoomDraft("ground"));
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [fieldDraft, setFieldDraft] = useState(createFieldDraft());
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [customizationStateReady, setCustomizationStateReady] = useState(false);

  // Chart Data
  const [visitorStats, setVisitorStats] = useState({
    daily: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      data: [0, 0, 0, 0, 0, 0, 0],
    },
    weekly: {
      labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
      data: [0, 0, 0, 0],
    },
    monthly: {
      labels: [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ],
      data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  });

  const [activeChartDataset, setActiveChartDataset] = useState("daily");

  const createEmptyUserForm = (role = "staff") => ({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    role,
    department: role === "security" ? "Security Department" : role === "student" ? "Student Affairs" : role === "teacher" ? "Academic Department" : "Admissions",
    position: role === "security" ? "Security Personnel" : role === "student" ? "Student" : role === "teacher" ? "Academic Staff" : "Admissions Officer",
    shift: "",
    employeeId: "",
    studentId: "",
    teacherId: "",
    course: "",
    yearLevel: "",
    section: "",
    parentName: "",
    parentEmail: "",
    nfcCardId: "",
    status: "inactive",
  });

  // Form States
  const [selectedUser, setSelectedUser] = useState(null);
  const [editUserData, setEditUserData] = useState({
    id: "",
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    role: "",
    department: "",
    employeeId: "",
    studentId: "",
    course: "",
    yearLevel: "",
    section: "",
    parentName: "",
    parentEmail: "",
    nfcCardId: "",
    status: "active",
    isActive: true,
  });

  const [newUserData, setNewUserData] = useState(createEmptyUserForm("staff"));
  const [createUserErrors, setCreateUserErrors] = useState({});
  const [editUserErrors, setEditUserErrors] = useState({});
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(null);
  const [isCreateEmailManuallyEdited, setIsCreateEmailManuallyEdited] = useState(false);
  const [isCreateEmployeeIdManuallyEdited, setIsCreateEmployeeIdManuallyEdited] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    totalRequests: 0,
    totalStaff: 0,
    totalGuards: 0,
    totalAdmin: 0,
    totalUsers: 0,
    activeUsers: 0,
    todayVisits: 0,
    tomorrowVisits: 0,
    weeklyGrowth: 0,
    totalDepartments: 0,
    activeVisitors: 0,
    upcomingVisits: 0,
    totalAdmins: 0,
    checkedInVisitors: 0,
    completedVisits: 0,
  });
  const [adminNotice, setAdminNotice] = useState(null);

  const generatedCreateUserEmail = useMemo(
    () => generateAccountEmail(newUserData, allUsers),
    [newUserData.firstName, newUserData.role, newUserData.department, newUserData.position, allUsers],
  );
  const generatedCreateUserEmployeeId = useMemo(
    () => generateAccountEmployeeId(newUserData, allUsers),
    [newUserData.role, allUsers],
  );
  const createUserReadiness = useMemo(() => {
    const role = String(newUserData.role || "").toLowerCase();
    const isStudentAccount = role === "student";
    const isAcademicStaffAccount = role === "teacher";
    const isAcademicAccessAccount = isStudentAccount || isAcademicStaffAccount;
    const needsAdminPhone = isSecurityRole(newUserData.role);
    const resolvedEmail = String(newUserData.email || generatedCreateUserEmail || "").trim().toLowerCase();
    const resolvedId = String(
      isAcademicStaffAccount
        ? newUserData.teacherId || generatedCreateUserEmployeeId
        : isStudentAccount
          ? newUserData.studentId || generatedCreateUserEmployeeId
          : newUserData.employeeId || generatedCreateUserEmployeeId,
    ).trim();
    const issues = [];

    if (!String(newUserData.firstName || "").trim()) issues.push("First name");
    if (!String(newUserData.lastName || "").trim()) issues.push("Last name");
    if (!resolvedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail)) issues.push("Valid email");
    if (!resolvedId) issues.push(isAcademicStaffAccount ? "Academic staff ID" : isStudentAccount ? "Student ID" : "Staff/Security number");
    if (needsAdminPhone && newUserData.phone && !isValidPhilippineMobileNumber(newUserData.phone)) {
      issues.push("Valid Philippine contact number");
    }
    if (
      isStudentAccount &&
      String(newUserData.parentEmail || "").trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(newUserData.parentEmail || "").trim())
    ) {
      issues.push("Valid parent email");
    }
    if (!isAcademicAccessAccount && !isSecurityRole(newUserData.role) && !String(newUserData.department || "").trim()) {
      issues.push("Department");
    }

    return {
      isReady: issues.length === 0,
      issues,
      email: resolvedEmail,
      accountId: resolvedId,
      idLabel: isAcademicStaffAccount ? "Academic Staff ID" : isStudentAccount ? "Student ID" : "Employee ID",
    };
  }, [generatedCreateUserEmail, generatedCreateUserEmployeeId, newUserData]);
  const isCreateAcademicAccessAccount = ["student", "teacher"].includes(String(newUserData.role || "").toLowerCase());
  const isCreateTeacherAccount = String(newUserData.role || "").toLowerCase() === "teacher";

  useEffect(() => {
    if (isCreateEmailManuallyEdited) return;

    setNewUserData((currentValue) => {
      const nextEmail = generateAccountEmail(currentValue, allUsers);
      if (!nextEmail || currentValue.email === nextEmail) return currentValue;
      return { ...currentValue, email: nextEmail };
    });
  }, [
    allUsers,
    isCreateEmailManuallyEdited,
    newUserData.firstName,
    newUserData.role,
    newUserData.department,
    newUserData.position,
  ]);

  useEffect(() => {
    if (isCreateEmployeeIdManuallyEdited) return;

    setNewUserData((currentValue) => {
      const nextEmployeeId = generateAccountEmployeeId(currentValue, allUsers);
      if (!nextEmployeeId || currentValue.employeeId === nextEmployeeId) return currentValue;
      return { ...currentValue, employeeId: nextEmployeeId };
    });
  }, [allUsers, isCreateEmployeeIdManuallyEdited, newUserData.role]);

  useEffect(() => {
    const isNewArchitectureEnabled = Boolean(globalThis?.nativeFabricUIManager);
    if (
      Platform.OS === "android" &&
      !isNewArchitectureEnabled &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const loadAdminCustomizations = async () => {
      try {
        const [storedRooms, storedRoomPositions, storedFields] = await Promise.all([
          storageGetItem(ROOM_STORAGE_KEY),
          storageGetItem(ROOM_POSITION_STORAGE_KEY),
          storageGetItem(DATA_FIELDS_STORAGE_KEY),
        ]);

        let nextRooms = MONITORING_MAP_OFFICES;
        let nextRoomPositions = MONITORING_MAP_OFFICE_POSITIONS;
        let hasLocalMapSettings = false;

        if (storedRooms) {
          const parsedRooms = JSON.parse(storedRooms);
          if (Array.isArray(parsedRooms) && parsedRooms.length > 0) {
            nextRooms = normalizeMapRooms(parsedRooms);
            hasLocalMapSettings = true;
          }
        }

        if (storedRoomPositions) {
          const parsedPositions = JSON.parse(storedRoomPositions);
          if (parsedPositions && typeof parsedPositions === "object") {
            nextRoomPositions = normalizeMapRoomPositions(parsedPositions);
            hasLocalMapSettings = true;
          }
        }

        try {
          const response = await ApiService.getMapSettings();
          const rawMapSettings = response?.mapSettings || {};
          const hasServerMapSettings =
            (Array.isArray(rawMapSettings.rooms) && rawMapSettings.rooms.length > 0) ||
            (rawMapSettings.roomPositions &&
              typeof rawMapSettings.roomPositions === "object" &&
              Object.keys(rawMapSettings.roomPositions).length > 0);
          if (response?.success && hasServerMapSettings) {
            const serverMapSettings = normalizeMapSettingsPayload(response.mapSettings);
            nextRooms = serverMapSettings.rooms;
            nextRoomPositions = serverMapSettings.roomPositions;
          } else if (response?.success && hasLocalMapSettings) {
            ApiService.updateAdminMapSettings({
              rooms: nextRooms,
              roomPositions: nextRoomPositions,
            }).catch((syncError) => {
              console.log("Local map migration skipped:", syncError?.message || syncError);
            });
          }
        } catch (error) {
          console.log("Shared map settings load skipped:", error?.message || error);
        }

        const defaultRoomById = MONITORING_MAP_OFFICES.reduce((lookup, room) => {
          lookup[room.id] = room;
          return lookup;
        }, {});
        const roomIds = new Set(nextRooms.map((room) => room.id));
        const restoredRequiredRoomIds = ["mezzanine-fire-exit"].filter(
          (roomId) => defaultRoomById[roomId] && !roomIds.has(roomId),
        );

        if (restoredRequiredRoomIds.length) {
          nextRooms = [
            ...nextRooms,
            ...restoredRequiredRoomIds.map((roomId) => defaultRoomById[roomId]),
          ];
          nextRoomPositions = {
            ...nextRoomPositions,
            ...restoredRequiredRoomIds.reduce((positions, roomId) => {
              positions[roomId] = MONITORING_MAP_OFFICE_POSITIONS[roomId];
              return positions;
            }, {}),
          };
          ApiService.updateAdminMapSettings({
            rooms: nextRooms,
            roomPositions: nextRoomPositions,
          }).catch((syncError) => {
            console.log("Required map room migration skipped:", syncError?.message || syncError);
          });
        }

        setManagedRooms(nextRooms);
        setManagedRoomPositions(nextRoomPositions);

        if (storedFields) {
          const parsedFields = JSON.parse(storedFields);
          if (Array.isArray(parsedFields) && parsedFields.length > 0) {
            setDataCollectionFields(parsedFields);
          }
        }
      } catch (error) {
        console.log("Admin customization load skipped:", error?.message || error);
      } finally {
        setCustomizationStateReady(true);
      }
    };

    loadAdminCustomizations();
  }, []);

  useEffect(() => {
    if (!customizationStateReady) return;
    storageSetItem(ROOM_STORAGE_KEY, JSON.stringify(managedRooms));
  }, [customizationStateReady, managedRooms]);

  useEffect(() => {
    if (!customizationStateReady) return;
    storageSetItem(ROOM_POSITION_STORAGE_KEY, JSON.stringify(managedRoomPositions));
  }, [customizationStateReady, managedRoomPositions]);

  useEffect(() => {
    if (!customizationStateReady) return;
    storageSetItem(DATA_FIELDS_STORAGE_KEY, JSON.stringify(dataCollectionFields));
  }, [customizationStateReady, dataCollectionFields]);

  // Helper Functions
  const getFilteredRequests = useCallback(() => {
    let filtered = [...visitRequests];
    if (requestFilter !== "all") {
      filtered = filtered.filter((r) => getRequestStatus(r) === requestFilter);
    }
    if (requestDateFilter !== "all") {
      filtered = filtered.filter((r) =>
        isDateInShortcutRange(r.visitDate || r.scheduledVisitStart || r.createdAt, requestDateFilter),
      );
    }
    if (requestOfficeFilter !== "all") {
      filtered = filtered.filter((r) =>
        normalizeFilterValue(r.assignedOffice || r.appointmentDepartment || r.host) === requestOfficeFilter,
      );
    }
    if (requestDateRange.startDate) {
      filtered = filtered.filter((r) => {
        const requestDate = new Date(r.visitDate || r.scheduledVisitStart || r.createdAt);
        return !Number.isNaN(requestDate.getTime()) && requestDate >= requestDateRange.startDate;
      });
    }
    if (requestDateRange.endDate) {
      filtered = filtered.filter((r) => {
        const requestDate = new Date(r.visitDate || r.scheduledVisitStart || r.createdAt);
        if (Number.isNaN(requestDate.getTime())) return false;
        const inclusiveEndDate = new Date(requestDateRange.endDate);
        inclusiveEndDate.setHours(23, 59, 59, 999);
        return requestDate <= inclusiveEndDate;
      });
    }
    if (searchQuery.trim()) {
      filtered = filtered.filter((r) =>
        recordMatchesSearch(r, searchQuery, [
          "fullName",
          "email",
          "phoneNumber",
          "purposeOfVisit",
          "purposeCategory",
          "customPurposeOfVisit",
          "assignedOffice",
          "appointmentDepartment",
          "host",
          "status",
          "approvalStatus",
          "appointmentStatus",
          "nfcCardId",
          "safePassId",
          (record) => getRequestStatus(record),
          (record) => [record.visitDate, record.visitTime, record.createdAt, record.updatedAt]
            .filter(Boolean)
            .map((dateValue) => formatDateTime(dateValue)),
        ]),
      );
    }
    return filtered.sort((a, b) => {
      if (requestSortOrder === "status") {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
      }
      const timeDifference = new Date(b.createdAt || b.visitDate || 0) - new Date(a.createdAt || a.visitDate || 0);
      return requestSortOrder === "oldest" ? -timeDifference : timeDifference;
    });
  }, [visitRequests, requestFilter, requestDateFilter, requestOfficeFilter, requestDateRange, searchQuery, requestSortOrder]);

  const getFilteredRequestsCount = useCallback(() => {
    return getFilteredRequests().length;
  }, [getFilteredRequests]);

  const getFilteredUsersList = useCallback(
    () =>
      filterAdminUsers({
        users: allUsers,
        accountMode: accountRecordsMode,
        roleFilter: userFilter,
        departmentFilter: userDepartmentFilter,
        searchQuery: userSearchQuery,
        isSecurityRole,
        isUserActive,
        recordMatchesSearch,
        normalizeFilterValue,
      }),
    [accountRecordsMode, allUsers, userDepartmentFilter, userFilter, userSearchQuery],
  );

  const getFilteredUsersCount = useCallback(() => getFilteredUsersList().length, [getFilteredUsersList]);

  const getPaginatedUsers = useCallback(() => {
    const filtered = getFilteredUsersList();
    return filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [getFilteredUsersList, currentPage, itemsPerPage]);

  const userStatusGroups = useMemo(() => getUserStatusGroups(allUsers, isUserActive), [allUsers]);
  const activeUsersList = useMemo(() => userStatusGroups.active, [userStatusGroups]);
  const inactiveUsersList = useMemo(() => userStatusGroups.inactive, [userStatusGroups]);
  const studentUsers = useMemo(
    () => allUsers.filter((userItem) => String(userItem?.role || "").toLowerCase() === "student"),
    [allUsers],
  );
  const academicStaffUsers = useMemo(
    () => allUsers.filter((userItem) => String(userItem?.role || "").toLowerCase() === "teacher"),
    [allUsers],
  );
  const scopedAttendanceRecords = useMemo(() => {
    const selectedScope = ATTENDANCE_SCOPE_OPTIONS.find((item) => item.key === attendanceScope) || ATTENDANCE_SCOPE_OPTIONS[0];
    const allowedRoles = new Set(selectedScope.roles);
    const query = normalizeSearchValue(attendanceSearchTerm);

    return attendanceRecords.filter((record) => {
      const recordType = String(record?.userType || record?.role || "").toLowerCase();
      if (!allowedRoles.has(recordType)) return false;
      if (!query) return true;

      const searchableText = [
        record?.name,
        record?.userType,
        record?.role,
        record?.module,
        record?.nfcCardId,
        record?.sourceDeviceId,
        record?.location,
        record?.checkpointIn,
        record?.checkpointOut,
        formatDateInputValue(record?.attendanceDate),
        formatDateTime(record?.attendanceDate),
        formatDateTime(record?.checkInTime),
        formatDateTime(record?.checkOutTime),
        formatDateTime(record?.lastTapTime),
        ...(Array.isArray(record?.checkpointHistory)
          ? record.checkpointHistory.flatMap((checkpoint) => [
              checkpoint?.checkpointId,
              checkpoint?.checkpointName,
              checkpoint?.office,
              checkpoint?.floor,
              formatDateTime(checkpoint?.tappedAt),
            ])
          : []),
      ]
        .filter(Boolean)
        .map(normalizeSearchValue)
        .join(" ");

      return query.split(" ").filter(Boolean).every((token) => searchableText.includes(token));
    });
  }, [attendanceRecords, attendanceScope, attendanceSearchTerm]);
  const attendanceQuickSummary = useMemo(() => {
    const inside = scopedAttendanceRecords.filter((record) => ["inside", "present"].includes(String(record?.status || "").toLowerCase())).length;
    const late = scopedAttendanceRecords.filter((record) => String(record?.status || "").toLowerCase() === "late").length;
    const completed = scopedAttendanceRecords.filter((record) => ["completed", "checked_out"].includes(String(record?.status || "").toLowerCase())).length;
    return {
      total: scopedAttendanceRecords.length,
      inside,
      late,
      completed,
    };
  }, [scopedAttendanceRecords]);
  const userManagementUsers = useMemo(() => {
    if (userManagementStatusTab === "active") return activeUsersList;
    if (userManagementStatusTab === "inactive") return inactiveUsersList;
    return allUsers;
  }, [activeUsersList, inactiveUsersList, allUsers, userManagementStatusTab]);

  const filteredUsers = useMemo(() => getFilteredUsersList(), [getFilteredUsersList]);
  const paginatedUsers = useMemo(() => getPaginatedUsers(), [getPaginatedUsers]);
  const scopedUsers = useMemo(() => {
    if (accountRecordsMode === "staff") return staffUsers;
    if (accountRecordsMode === "security") return guardUsers;
    return allUsers;
  }, [accountRecordsMode, allUsers, guardUsers, staffUsers]);
  const scopedActiveUsers = useMemo(() => scopedUsers.filter((userItem) => isUserActive(userItem)), [scopedUsers]);
  const scopedInactiveUsers = useMemo(() => scopedUsers.filter((userItem) => !isUserActive(userItem)), [scopedUsers]);
  const totalFilteredUsers = filteredUsers.length;
  const visibleStartIndex = totalFilteredUsers === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const visibleEndIndex = Math.min(currentPage * itemsPerPage, totalFilteredUsers);
  const staffDepartmentCount = useMemo(
    () => new Set(staffUsers.map((userItem) => userItem.department).filter(Boolean)).size,
    [staffUsers],
  );
  const userManagementConfig = useMemo(() => {
    if (accountRecordsMode === "staff") {
      return {
        title: "Staff Directory",
        eyebrow: "Team Administration",
        description: "Review staff accounts, keep assignments organized, and manage who can respond to visitor appointments.",
        icon: "briefcase-outline",
        accent: ADMIN_BLUE,
        primaryActionLabel: "Create Staff",
        primaryActionRole: "staff",
        searchPlaceholder: "Search staff by name, email, phone, or department...",
        stats: [
          { key: "total", label: "Staff Accounts", value: scopedUsers.length, icon: "people-outline" },
          { key: "active", label: "Active Staff", value: scopedActiveUsers.length, icon: "checkmark-circle-outline" },
          { key: "inactive", label: "Inactive Staff", value: scopedInactiveUsers.length, icon: "pause-circle-outline" },
          { key: "departments", label: "Departments", value: staffDepartmentCount, icon: "business-outline" },
        ],
        filters: [
          { key: "all", label: "All Staff", count: scopedUsers.length },
          { key: "active", label: "Active", count: scopedActiveUsers.length },
          { key: "inactive", label: "Inactive", count: scopedInactiveUsers.length },
        ],
      };
    }

    if (accountRecordsMode === "security") {
      return {
        title: "Security Team",
        eyebrow: "Operations Access",
        description: "Manage guards and security personnel who verify arrivals, monitor visits, and handle gate operations.",
        icon: "shield-checkmark-outline",
        accent: ADMIN_BLUE,
        primaryActionLabel: "Create Security",
        primaryActionRole: "security",
        searchPlaceholder: "Search security personnel by name, email, or phone...",
        stats: [
          { key: "total", label: "Security Accounts", value: scopedUsers.length, icon: "shield-outline" },
          { key: "active", label: "Active Team", value: scopedActiveUsers.length, icon: "checkmark-circle-outline" },
          { key: "inactive", label: "Inactive Team", value: scopedInactiveUsers.length, icon: "pause-circle-outline" },
          { key: "visible", label: "Filtered View", value: totalFilteredUsers, icon: "funnel-outline" },
        ],
        filters: [
          { key: "all", label: "All Security", count: scopedUsers.length },
          { key: "active", label: "Active", count: scopedActiveUsers.length },
          { key: "inactive", label: "Inactive", count: scopedInactiveUsers.length },
        ],
      };
    }

    return {
      title: "All Users",
      eyebrow: "Account Control Center",
      description: "Monitor every account in one place, move between roles quickly, and keep only the right users active in the system.",
      icon: "people-circle-outline",
      accent: ADMIN_BLUE,
      primaryActionLabel: null,
      primaryActionRole: null,
      searchPlaceholder: "Search all users by name, email, phone, or department...",
      stats: [
        { key: "total", label: "Total Users", value: allUsers.length, icon: "people-outline" },
        { key: "staff", label: "Staff", value: staffUsers.length, icon: "briefcase-outline" },
        { key: "security", label: "Security", value: guardUsers.length, icon: "shield-outline" },
        { key: "active", label: "Active Users", value: activeUsersList.length, icon: "pulse-outline" },
      ],
      filters: [
        { key: "all", label: "All", count: allUsers.length },
        { key: "staff", label: "Staff", count: staffUsers.length },
        { key: "teacher", label: "Staff Teacher", count: academicStaffUsers.length },
        { key: "student", label: "Students", count: studentUsers.length },
        { key: "security", label: "Security", count: guardUsers.length },
        { key: "visitor", label: "Visitors", count: visitorUsers.length },
        { key: "admin", label: "Admins", count: adminUsers.length },
        { key: "active", label: "Active", count: activeUsersList.length },
        { key: "inactive", label: "Inactive", count: inactiveUsersList.length },
      ],
    };
  }, [
    accountRecordsMode,
    activeUsersList.length,
    adminUsers.length,
    academicStaffUsers.length,
    allUsers.length,
    guardUsers.length,
    inactiveUsersList.length,
    studentUsers.length,
    scopedActiveUsers.length,
    scopedInactiveUsers.length,
    scopedUsers.length,
    staffDepartmentCount,
    staffUsers.length,
    totalFilteredUsers,
    visitorUsers.length,
  ]);

  const requestOfficeFilterOptions = useMemo(() => {
    const officeMap = new Map();
    visitRequests.forEach((request) => {
      const label = request.assignedOffice || request.appointmentDepartment || request.host;
      const key = normalizeFilterValue(label);
      if (!key) return;
      officeMap.set(key, {
        key,
        label,
        count: (officeMap.get(key)?.count || 0) + 1,
        icon: "business-outline",
      });
    });
    return [
      { key: "all", label: "All Offices", count: visitRequests.length, icon: "apps-outline" },
      ...Array.from(officeMap.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 8),
    ];
  }, [visitRequests]);

  const historyOfficeFilterOptions = useMemo(() => {
    const officeMap = new Map();
    visitorHistory.forEach((visitor) => {
      const label = visitor.assignedOffice || visitor.appointmentDepartment || visitor.host;
      const key = normalizeFilterValue(label);
      if (!key) return;
      officeMap.set(key, {
        key,
        label,
        count: (officeMap.get(key)?.count || 0) + 1,
        icon: "business-outline",
      });
    });
    return [
      { key: "all", label: "All Offices", count: visitorHistory.length, icon: "apps-outline" },
      ...Array.from(officeMap.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 8),
    ];
  }, [visitorHistory]);

  const userDepartmentFilterOptions = useMemo(
    () => buildDepartmentFilterOptions({ users: scopedUsers, normalizeFilterValue, limit: 8 }),
    [scopedUsers],
  );

  const dataManagementDepartmentFilterOptions = useMemo(
    () => buildDepartmentFilterOptions({ users: allUsers, normalizeFilterValue, limit: 10 }),
    [allUsers],
  );

  const dataManagementUsers = useMemo(
    () =>
      filterAdminUsers({
        users: allUsers,
        roleFilter: userFilter,
        departmentFilter: userDepartmentFilter,
        searchQuery: userSearchQuery,
        isSecurityRole,
        isUserActive,
        recordMatchesSearch,
        normalizeFilterValue,
      }),
    [allUsers, userDepartmentFilter, userFilter, userSearchQuery],
  );

  const dataManagementTotalPages = Math.max(
    1,
    Math.ceil(dataManagementUsers.length / dataManagementItemsPerPage),
  );
  const paginatedDataManagementUsers = useMemo(
    () =>
      dataManagementUsers.slice(
        (dataManagementPage - 1) * dataManagementItemsPerPage,
        dataManagementPage * dataManagementItemsPerPage,
      ),
    [dataManagementItemsPerPage, dataManagementPage, dataManagementUsers],
  );
  const dataManagementVisibleStart =
    dataManagementUsers.length === 0
      ? 0
      : (dataManagementPage - 1) * dataManagementItemsPerPage + 1;
  const dataManagementVisibleEnd = Math.min(
    dataManagementPage * dataManagementItemsPerPage,
    dataManagementUsers.length,
  );
  const fieldSetupTotalPages = Math.max(
    1,
    Math.ceil(dataCollectionFields.length / dataManagementItemsPerPage),
  );
  const paginatedDataCollectionFields = useMemo(
    () =>
      dataCollectionFields.slice(
        (dataManagementFieldPage - 1) * dataManagementItemsPerPage,
        dataManagementFieldPage * dataManagementItemsPerPage,
      ),
    [dataCollectionFields, dataManagementFieldPage, dataManagementItemsPerPage],
  );
  const fieldSetupVisibleStart =
    dataCollectionFields.length === 0
      ? 0
      : (dataManagementFieldPage - 1) * dataManagementItemsPerPage + 1;
  const fieldSetupVisibleEnd = Math.min(
    dataManagementFieldPage * dataManagementItemsPerPage,
    dataCollectionFields.length,
  );
  const dataManagementRoleFilters = [
    { key: "all", label: "All", count: allUsers.length, icon: "apps-outline" },
    { key: "staff", label: "Staff", count: staffUsers.length, icon: "briefcase-outline" },
    { key: "security", label: "Security", count: guardUsers.length, icon: "shield-outline" },
    { key: "admin", label: "Admin", count: allUsers.filter((userItem) => userItem.role === "admin").length, icon: "person-circle-outline" },
    { key: "visitor", label: "Visitor", count: allUsers.filter((userItem) => userItem.role === "visitor").length, icon: "person-outline" },
    { key: "active", label: "Active", count: allUsers.filter((userItem) => isUserActive(userItem)).length, icon: "checkmark-circle-outline" },
    { key: "inactive", label: "Inactive", count: allUsers.filter((userItem) => !isUserActive(userItem)).length, icon: "pause-circle-outline" },
  ];

  const dateShortcutFilters = [
    { key: "all", label: "Any Date", icon: "calendar-outline" },
    { key: "today", label: "Today", icon: "today-outline" },
    { key: "week", label: "This Week", icon: "calendar-number-outline" },
    { key: "last_week", label: "Last Week", icon: "calendar-outline" },
    { key: "month", label: "This Month", icon: "calendar-clear-outline" },
  ];

  const appointmentRequests = useMemo(
    () =>
      visitRequests.filter((request) => {
        const category = String(request?.requestCategory || request?.visitType || "").toLowerCase();
        return (
          category.includes("appointment") ||
          Boolean(request?.appointmentStatus) ||
          Boolean(request?.scheduledVisitStart) ||
          Boolean(request?.scheduledVisitEnd)
        );
      }),
    [visitRequests],
  );

  const pendingAppointmentRequests = useMemo(
    () =>
      appointmentRequests.filter((request) => {
        const appointmentStatus = String(request?.appointmentStatus || "").toLowerCase();
        const approvalStatus = String(request?.approvalStatus || request?.status || "").toLowerCase();
        return appointmentStatus === "pending" || approvalStatus === "pending";
      }),
    [appointmentRequests],
  );

  const appointmentRecords = useMemo(
    () =>
      appointmentRequests
        .filter((request) => getRequestStatus(request) === "approved")
        .sort(compareAppointmentRecordsByLatest),
    [appointmentRequests],
  );
  const appointmentRecordFilterOptions = useMemo(() => {
    const buildOptionList = (values) => {
      const seen = new Set();
      return values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .filter((value) => {
          const key = normalizeFilterValue(value);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((left, right) => left.localeCompare(right))
        .map((label) => ({ label, value: normalizeFilterValue(label) }));
    };

    const configuredOffices = (appointmentManagementOptions.offices || []).filter((option) => !option.deleted);
    const configuredPurposes = (appointmentManagementOptions.purposes || []).filter((option) => !option.deleted);
    const configuredTimeSlots = (appointmentManagementOptions.timeSlots || []).filter((slot) => !slot.deleted);
    const recordTimeOptions = appointmentRecords
      .map((record) => {
        const value = formatTimeInputValue(record.visitTime);
        return value ? { value, label: formatTime(record.visitTime) } : null;
      })
      .filter(Boolean);

    const timeSeen = new Set();
    const timeOptions = [
      ...configuredTimeSlots
        .map((slot) => ({
          value: String(slot?.value || "").trim(),
          label: String(slot?.label || slot?.value || "").trim(),
        }))
        .filter((slot) => slot.value && slot.label),
      ...recordTimeOptions,
    ]
      .filter((slot) => {
        if (timeSeen.has(slot.value)) return false;
        timeSeen.add(slot.value);
        return true;
      })
      .sort((left, right) => left.value.localeCompare(right.value));

    return {
      offices: buildOptionList([
        ...configuredOffices.map((option) => option.label || option.value),
        ...appointmentRecords.map((record) => record.assignedOffice || record.appointmentDepartment || record.host),
      ]),
      purposes: buildOptionList([
        ...configuredPurposes.map((option) => option.label || option.value),
        ...appointmentRecords.map((record) => record.purposeOfVisit || record.visitType),
      ]),
      statuses: buildOptionList(appointmentRecords.map((record) => getRequestStatus(record))),
      timeSlots: timeOptions,
    };
  }, [appointmentManagementOptions, appointmentRecords]);

  const filteredAppointmentRecords = useMemo(() => {
    const filters = appointmentAppliedFilters || createAppointmentFilterDraft();
    return appointmentRecords.filter((record) => {
      const office = normalizeFilterValue(record.assignedOffice || record.appointmentDepartment || record.host);
      const purpose = normalizeFilterValue(record.purposeOfVisit || record.visitType);
      const status = normalizeFilterValue(getRequestStatus(record));
      const visitDate = formatDateInputValue(record.visitDate || record.scheduledVisitStart || record.createdAt);
      const visitTime = formatTimeInputValue(record.visitTime || record.scheduledVisitStart);

      if (filters.date && visitDate !== filters.date) return false;
      if (filters.time !== "all" && visitTime !== filters.time) return false;
      if (filters.office !== "all" && office !== filters.office) return false;
      if (filters.status !== "all" && status !== filters.status) return false;
      if (filters.purpose !== "all" && purpose !== filters.purpose) return false;

      return recordMatchesSearch(record, appointmentSearchTerm, [
        "fullName",
        "email",
        "purposeOfVisit",
        "purposeCategory",
        "customPurposeOfVisit",
        "visitType",
        "assignedOffice",
        "appointmentDepartment",
        "host",
        "approvalStatus",
        "appointmentStatus",
        "status",
        (item) => getRequestStatus(item),
        (item) => getVisitorSafePassId(item),
        (item) => getVisitorNfcUid(item),
        (item) => [
          formatDateInputValue(item.visitDate || item.scheduledVisitStart || item.createdAt),
          formatTimeInputValue(item.visitTime || item.scheduledVisitStart),
          formatDateTime(item.visitDate || item.scheduledVisitStart || item.createdAt),
          item.visitTime ? formatTime(item.visitTime) : "",
        ],
      ]);
    }).sort(compareAppointmentRecordsByLatest);
  }, [appointmentAppliedFilters, appointmentRecords, appointmentSearchTerm]);

  const appointmentRecordsItemsPerPage = 6;
  const reportRecordsItemsPerPage = 8;
  const securityReportRecordsItemsPerPage = 8;
  const appointmentRecordsPageCount = Math.max(
    1,
    Math.ceil(filteredAppointmentRecords.length / appointmentRecordsItemsPerPage),
  );
  const paginatedAppointmentRecords = useMemo(() => {
    const startIndex = (appointmentRecordsPage - 1) * appointmentRecordsItemsPerPage;
    return filteredAppointmentRecords.slice(startIndex, startIndex + appointmentRecordsItemsPerPage);
  }, [appointmentRecordsPage, filteredAppointmentRecords]);

  useEffect(() => {
    setAppointmentRecordsPage((currentPageValue) => Math.min(currentPageValue, appointmentRecordsPageCount));
  }, [appointmentRecordsPageCount]);

  const securityReportRecords = useMemo(
    () => visitorHistory.filter((visitor) => visitor.reportType === "security_report"),
    [visitorHistory],
  );

  const selectedMapModuleFloor = FLOOR_VIEW_TO_ID[selectedSubmodule] || "ground";
  const managedMapLabels = useMemo(
    () => buildManagedMapLabels(managedRooms, managedRoomPositions),
    [managedRoomPositions, managedRooms],
  );
  const selectedFloorRooms = useMemo(
    () => managedRooms.filter((room) => room.floor === selectedMapModuleFloor),
    [managedRooms, selectedMapModuleFloor],
  );
  const roomManagementItemsPerPage = 5;
  const roomManagementTotalPages = Math.max(
    1,
    Math.ceil(selectedFloorRooms.length / roomManagementItemsPerPage),
  );
  const paginatedSelectedFloorRooms = useMemo(() => {
    const startIndex = (roomManagementPage - 1) * roomManagementItemsPerPage;
    return selectedFloorRooms.slice(startIndex, startIndex + roomManagementItemsPerPage);
  }, [roomManagementPage, selectedFloorRooms]);

  useEffect(() => {
    setRoomManagementPage(1);
  }, [selectedMapModuleFloor]);

  useEffect(() => {
    setRoomManagementPage((currentPageValue) => Math.min(currentPageValue, roomManagementTotalPages));
  }, [roomManagementTotalPages]);

  const selectedSubmoduleMeta = useMemo(() => {
    switch (selectedSubmodule) {
      case "account-create":
        return {
          title: "Creation of Account",
          subtitle: "Create student, academic staff, admin services staff, and security accounts from one controlled workspace.",
          highlights: [
            { label: "Campus", value: studentUsers.length + academicStaffUsers.length, icon: "school-outline", color: ADMIN_BLUE },
            { label: "Operations", value: staffUsers.length + guardUsers.length, icon: "briefcase-outline", color: ADMIN_BLUE },
          ],
        };
      case "account-records":
        return {
          title: "Account Records",
          subtitle: "Browse accounts by role, review status, and keep your directory organized from one workspace.",
          highlights: [
            { label: "Mode", value: accountRecordsMode === "all" ? "All Users" : formatRoleLabel(accountRecordsMode), icon: "funnel-outline", color: ADMIN_BLUE },
            { label: "Visible", value: totalFilteredUsers, icon: "people-outline", color: ADMIN_BLUE },
          ],
        };
      case "data-management":
        return {
          title: "User Data Management",
          subtitle: "Select an account, review its details, and edit the user data that drives role-based access.",
          highlights: [
            { label: "Users", value: allUsers.length, icon: "people-outline", color: ADMIN_BLUE },
            { label: "Active", value: allUsers.filter((userItem) => isUserActive(userItem)).length, icon: "checkmark-circle-outline", color: ADMIN_BLUE },
          ],
        };
      case "map-ground":
      case "map-mezzanine":
      case "map-second":
      case "map-third":
        return {
          title: ADMIN_MODULE_FLOORS.find((floor) => floor.id === selectedMapModuleFloor)?.name || "Floor Map",
          subtitle: "Review the active map layer for this floor and manage the room registry directly beside it.",
          highlights: [
            { label: "Rooms", value: selectedFloorRooms.length, icon: "business-outline", color: ADMIN_BLUE },
            { label: "Active", value: stats.activeVisitors || stats.checkedInVisitors || 0, icon: "locate-outline", color: ADMIN_BLUE },
          ],
        };
      case "appointment-records":
        return {
          title: "Appointment Records",
          subtitle: "See approved appointment history and completed staff-linked visitor visits.",
          highlights: [
            { label: "Records", value: appointmentRecords.length, icon: "calendar-outline", color: ADMIN_BLUE },
            { label: "Approved", value: appointmentRecords.length, icon: "checkmark-circle-outline", color: ADMIN_BLUE },
          ],
        };
      case "appointment-management":
        return {
          title: "Appointment Management",
          subtitle: "Review approval-ready appointments and move the queue forward without leaving the dashboard.",
          highlights: [
            { label: "Pending", value: pendingAppointmentRequests.length, icon: "time-outline", color: ADMIN_BLUE },
            { label: "Approved", value: approvedRequests.length, icon: "checkmark-circle-outline", color: ADMIN_BLUE },
          ],
        };
      case "attendance-records":
        return {
          title: "Attendance Records",
          subtitle: "Review staff and student attendance from NFC taps, names, dates, and campus IDs.",
          highlights: [
            { label: "Visible", value: scopedAttendanceRecords.length, icon: "list-outline", color: ADMIN_BLUE },
            { label: "Late", value: attendanceQuickSummary.late, icon: "alert-circle-outline", color: ADMIN_BLUE },
          ],
        };
      case "analytics":
        return {
          title: "Analytics",
          subtitle: "Track visitor trends, most visited offices, and campus activity distribution.",
          highlights: [
            { label: "Today", value: stats.todayVisits, icon: "calendar-outline", color: ADMIN_BLUE },
            { label: "Reports", value: visitorHistory.length, icon: "analytics-outline", color: ADMIN_BLUE },
          ],
        };
      case "report-records":
        return {
          title: "Report Records",
          subtitle: "Review generated report-ready activity summaries, visitor history, and approval outcomes.",
          highlights: [
            { label: "History", value: visitorHistory.length, icon: "document-text-outline", color: ADMIN_BLUE },
            { label: "Completed", value: stats.completedVisits, icon: "checkmark-done-outline", color: ADMIN_BLUE },
          ],
        };
      case "security-report-records":
        return {
          title: "Security Reports",
          subtitle: "Review visitor incident reports submitted by security and guard accounts.",
          highlights: [
            { label: "Reports", value: securityReportRecords.length, icon: "shield-alert-outline", color: ADMIN_BLUE },
            { label: "Unresolved", value: securityReportRecords.filter((item) => !item.resolved).length, icon: "alert-circle-outline", color: ADMIN_BLUE },
          ],
        };
      case "settings":
        return {
          title: "Settings",
          subtitle: "Control dashboard preferences and communication settings for the admin experience.",
          highlights: [
            { label: "Dark Mode", value: settings.darkMode ? "On" : "Off", icon: "moon-outline", color: ADMIN_BLUE },
            { label: "Email", value: settings.emailNotifications ? "On" : "Off", icon: "mail-outline", color: ADMIN_BLUE },
          ],
        };
      default:
        return {
          title: "Dashboard Overview",
          subtitle: "Review what needs attention today, then move into the right admin workspace.",
          highlights: [
            { label: "Pending", value: stats.pendingRequests, icon: "time-outline", color: ADMIN_BLUE },
            { label: "Live Map", value: stats.activeVisitors || stats.checkedInVisitors || 0, icon: "map-outline", color: ADMIN_BLUE },
          ],
        };
    }
  }, [
    accountRecordsMode,
    allUsers.length,
    appointmentRecords.length,
    appointmentRequests.length,
    approvedRequests.length,
    dataCollectionFields,
    guardUsers.length,
    pendingAppointmentRequests.length,
    selectedMapModuleFloor,
    selectedFloorRooms.length,
    selectedSubmodule,
    settings.darkMode,
    settings.emailNotifications,
    academicStaffUsers.length,
    attendanceQuickSummary.late,
    scopedAttendanceRecords.length,
    staffUsers.length,
    studentUsers.length,
    stats.completedVisits,
    stats.activeVisitors,
    stats.checkedInVisitors,
    stats.pendingRequests,
    totalFilteredUsers,
    visitorHistory.length,
    securityReportRecords,
  ]);

  const adminModules = useMemo(
    () => [
      {
        key: "account-management",
        label: "Account Management",
        icon: "people-circle-outline",
        color: ADMIN_BLUE,
        submodules: [
          { key: "account-create", label: "Creation of Account" },
          { key: "account-records", label: "Account Records" },
          { key: "data-management", label: "User Data Management" },
        ],
      },
      {
        key: "maps",
        label: "Maps",
        icon: "map-outline",
        color: ADMIN_BLUE,
        submodules: [
          { key: "map-ground", label: "Ground Floor" },
          { key: "map-mezzanine", label: "Mezzanine" },
          { key: "map-second", label: "Second Floor" },
          { key: "map-third", label: "Third Floor" },
        ],
      },
      {
        key: "appointment",
        label: "Appointment",
        icon: "calendar-outline",
        color: ADMIN_BLUE,
        submodules: [
          { key: "appointment-records", label: "Appointment Records" },
          { key: "appointment-management", label: "Appointment Management", badge: pendingAppointmentRequests.length },
        ],
      },
      {
        key: "attendance",
        label: "Attendance",
        icon: "time-outline",
        color: ADMIN_BLUE,
        submodules: [
          { key: "attendance-records", label: "Records" },
        ],
      },
      {
        key: "reports",
        label: "Reports",
        icon: "document-text-outline",
        color: ADMIN_BLUE,
        submodules: [
          { key: "analytics", label: "Analytics" },
          { key: "report-records", label: "Report Records" },
          { key: "security-report-records", label: "Security Reports" },
        ],
      },
    ],
    [pendingAppointmentRequests.length],
  );

  const getFilteredHistory = useCallback(() => {
    let filtered = [...visitorHistory];
    
    if (historyFilter !== "all") {
      filtered = filtered.filter(v =>
        historyFilter === "reported"
          ? v.reportType === "security_report"
          : getRequestStatus(v) === historyFilter || v.status === historyFilter,
      );
    }

    if (historyDateFilter !== "all") {
      filtered = filtered.filter(v => isDateInShortcutRange(v.visitDate || v.createdAt, historyDateFilter));
    }

    if (historyOfficeFilter !== "all") {
      filtered = filtered.filter(v =>
        normalizeFilterValue(v.assignedOffice || v.appointmentDepartment || v.host) === historyOfficeFilter,
      );
    }
    
    if (historySearchQuery.trim()) {
      filtered = filtered.filter((v) =>
        recordMatchesSearch(v, historySearchQuery, [
          "fullName",
          "email",
          "purposeOfVisit",
          "assignedOffice",
          "appointmentDepartment",
          "host",
          "status",
          "approvalStatus",
          "appointmentStatus",
          "reportReason",
          "reporterName",
          "reportType",
          "nfcCardId",
          "safePassId",
          (visitor) => getRequestStatus(visitor),
          (visitor) => formatDateTime(visitor.visitDate || visitor.createdAt || visitor.reportedAt),
        ]),
      ); 
    }
    
    if (historyDateRange.startDate) {
      filtered = filtered.filter(v => new Date(v.visitDate || v.createdAt) >= historyDateRange.startDate);
    }
    if (historyDateRange.endDate) {
      filtered = filtered.filter(v => {
        const visitDate = new Date(v.visitDate || v.createdAt);
        const inclusiveEndDate = new Date(historyDateRange.endDate);
        inclusiveEndDate.setHours(23, 59, 59, 999);
        return visitDate <= inclusiveEndDate;
      });
    }

    return filtered.sort((a, b) => {
      const timeDifference = new Date(b.visitDate || b.createdAt || 0) - new Date(a.visitDate || a.createdAt || 0);
      return historySortOrder === "oldest" ? -timeDifference : timeDifference;
    });
  }, [visitorHistory, historyDateFilter, historyFilter, historyOfficeFilter, historySearchQuery, historyDateRange, historySortOrder]);

  const getHistoryStats = useCallback(() => {
    const total = visitorHistory.length;
    const approved = visitorHistory.filter(v => getRequestStatus(v) === "approved").length;
    const pending = visitorHistory.filter(v => getRequestStatus(v) === "pending").length;
    const rejected = visitorHistory.filter(v => getRequestStatus(v) === "rejected").length;
    const checkedIn = visitorHistory.filter(v => v.status === "checked_in").length;
    const checkedOut = visitorHistory.filter(v => v.status === "checked_out").length;
    const reported = visitorHistory.filter(v => v.reportType === "security_report").length;
    const uniqueEmails = new Set(visitorHistory.map(v => v.email).filter(Boolean)).size;
    
    const monthlyData = {};
    visitorHistory.forEach(v => {
      if (v.visitDate) {
        const month = new Date(v.visitDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlyData[month] = (monthlyData[month] || 0) + 1;
      }
    });
    
    return {
      total,
      totalVisits: total,
      approved,
      pending,
      pendingVisits: pending,
      rejected,
      rejectedVisits: rejected,
      checkedIn,
      checkedOut,
      completedVisits: checkedOut,
      reported,
      uniqueEmails,
      monthlyData,
    };
  }, [visitorHistory]);

  const loadVisitorHistory = useCallback(() => {
    const reportRows = visitRequests.flatMap((visitor) =>
      (visitor.reports || []).map((report) => {
        const reporter = report.reportedBy || {};
        const reporterName = [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") ||
          reporter.email ||
          "Security";
        return {
          ...visitor,
          _id: `${visitor._id || visitor.id}-report-${report._id || report.reportedAt || report.reason}`,
          sourceVisitorId: visitor._id || visitor.id,
          status: "reported",
          reportType: "security_report",
          reportReason: report.reason || "Security report",
          reporterName,
          reportedAt: report.reportedAt,
          resolved: report.resolved,
          createdAt: report.reportedAt || visitor.updatedAt || visitor.createdAt,
        };
      }),
    );
    const sortedVisitors = [...visitRequests, ...reportRows].sort((a, b) =>
      new Date(b.reportedAt || b.visitDate || b.createdAt || 0) -
      new Date(a.reportedAt || a.visitDate || a.createdAt || 0),
    );
    setVisitorHistory(sortedVisitors);
  }, [visitRequests]);

  const handleSaveAppointmentOffice = async () => {
    const visitorId = selectedRequest?._id || selectedRequest?.id || selectedRequest?.sourceVisitorId;
    const office = String(officeEditValue || "").trim();
    const visitDate = String(appointmentEditDateValue || "").trim();
    const visitTime = String(appointmentEditTimeValue || "").trim();

    if (!visitorId) {
      Alert.alert("Missing Visitor", "Please select an appointment record first.");
      return;
    }

    if (!office) {
      Alert.alert("Office Required", "Please enter the office or department for this appointment.");
      return;
    }

    if (visitDate && !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
      Alert.alert("Invalid Date", "Please use YYYY-MM-DD for the visit date.");
      return;
    }

    if (visitTime && !/^\d{1,2}:\d{2}$/.test(visitTime)) {
      Alert.alert("Invalid Time", "Please use HH:MM for the visit time.");
      return;
    }

    setIsUpdatingOffice(true);
    try {
      const response = await ApiService.updateVisitorAppointmentOffice(visitorId, {
        office,
        appointmentDepartment: office,
        assignedOffice: office,
        visitDate: visitDate || undefined,
        visitTime: visitTime || undefined,
      });
      if (response?.success) {
        const updatedVisitor = response.visitor;
        setSelectedRequest((current) => ({
          ...(current || {}),
          ...(updatedVisitor || {}),
          assignedOffice: office,
          appointmentDepartment: office,
          host: office,
          visitDate: updatedVisitor?.visitDate || current?.visitDate,
          visitTime: updatedVisitor?.visitTime || current?.visitTime,
        }));
        setVisitRequests((currentRequests) =>
          currentRequests.map((request) =>
            String(request._id || request.id) === String(visitorId)
              ? {
                  ...request,
                  ...(updatedVisitor || {}),
                  assignedOffice: office,
                  appointmentDepartment: office,
                  host: office,
                  visitDate: updatedVisitor?.visitDate || request.visitDate,
                  visitTime: updatedVisitor?.visitTime || request.visitTime,
                }
              : request,
          ),
        );
        publishAdminNotice("success", "Appointment request updated", `${selectedRequest?.fullName || "Visitor"} now has the updated office and schedule.`);
        return;
      }

      Alert.alert("Update Failed", response?.message || "Failed to update appointment office.");
    } catch (error) {
      console.error("Update appointment office error:", error);
      Alert.alert("Update Failed", error?.message || "Failed to update appointment office.");
    } finally {
      setIsUpdatingOffice(false);
    }
  };

  const getVisitorSafePassId = (visitor = {}) =>
    visitor.safePassId ||
    visitor.relatedVisitor?.safePassId ||
    "Not assigned";

  const getVisitorNfcUid = (visitor = {}) =>
    visitor.physicalNfcUid ||
    visitor.nfcCardId ||
    visitor.relatedUser?.physicalNfcUid ||
    visitor.relatedUser?.nfcCardId ||
    visitor.relatedVisitor?.physicalNfcUid ||
    visitor.relatedVisitor?.nfcCardId ||
    "Not assigned";

  const getCurrentChartData = () => visitorStats[activeChartDataset] || visitorStats.daily;

  const getWeekNumber = (date) => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  const calculateChartData = (requests) => {
    const dailyData = [0, 0, 0, 0, 0, 0, 0];
    const weeklyData = [0, 0, 0, 0];
    const monthlyData = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const today = new Date();
    const currentWeek = getWeekNumber(today);

    requests.forEach((request) => {
      if (!request.createdAt) return;
      const date = new Date(request.createdAt);
      const weekNum = getWeekNumber(date);
      const month = date.getMonth();
      const dayDiff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
      if (dayDiff >= 0 && dayDiff < 7) dailyData[6 - dayDiff]++;
      if (weekNum >= currentWeek - 3 && weekNum <= currentWeek) weeklyData[weekNum - (currentWeek - 3)]++;
      if (month >= today.getMonth() - 11) monthlyData[month]++;
    });

    setVisitorStats({
      daily: { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], data: dailyData },
      weekly: { labels: ["Week 1", "Week 2", "Week 3", "Week 4"], data: weeklyData },
      monthly: { labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], data: monthlyData },
    });
  };

  const calculateDateAnalytics = (date) => {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const visitorsOnDate = visitRequests.filter((request) => {
      const visitDate = new Date(request.visitDate);
      return visitDate >= targetDate && visitDate < nextDay;
    });

    const approved = visitorsOnDate.filter((r) => getRequestStatus(r) === "approved");
    const pending = visitorsOnDate.filter((r) => getRequestStatus(r) === "pending");
    const rejected = visitorsOnDate.filter((r) => getRequestStatus(r) === "rejected");

    setDateAnalytics({
      total: visitorsOnDate.length,
      approved: approved.length,
      pending: pending.length,
      rejected: rejected.length,
      visitors: visitorsOnDate,
    });
  };

  const calculateWeeklyGrowth = (requests) => {
    const today = new Date();
    const lastWeek = new Date(today.setDate(today.getDate() - 7));
    const recentRequests = requests.filter((r) => new Date(r.createdAt) > lastWeek);
    return Math.round((recentRequests.length / Math.max(requests.length, 1)) * 100);
  };

  const isAuthError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return (
      message.includes("401") ||
      message.includes("authenticate") ||
      message.includes("unauthorized") ||
      message.includes("token") ||
      message.includes("jwt")
    );
  };

  const handleAuthError = useCallback(async () => {
    if (authErrorHandledRef.current) return;
    authErrorHandledRef.current = true;
    await ApiService.clearAuth();
    Alert.alert("Session Expired", "Please log in again.", [
      { text: "OK", onPress: () => navigation.replace("Login") },
    ]);
  }, [navigation]);

  const publishAdminNotice = useCallback((type, title, message = "") => {
    setAdminNotice({
      id: `${type}-${Date.now()}`,
      type,
      title,
      message,
    });
  }, []);

  const ensureAdminAccess = useCallback(() => {
    const normalizedRole = String(user?.role || "").toLowerCase();
    if (normalizedRole !== "admin") {
      Alert.alert("Admin Required", "Only admin accounts can perform this action.");
      return false;
    }
    return true;
  }, [user]);

  const loadAppointmentManagementOptions = useCallback(async () => {
    try {
      const response = await ApiService.getAdminAppointmentOptions();
      if (response?.success && response.options) {
        setAppointmentManagementOptions(response.options);
      }
    } catch (error) {
      console.error("Load appointment management options error:", error);
    }
  }, []);

  const saveAppointmentManagementOptions = async (nextOptions, successMessage, savingKey = "appointment-options") => {
    if (!ensureAdminAccess()) return;
    setIsSavingAppointmentOptions(true);
    setSavingAppointmentOptionKey(savingKey);
    try {
      const response = await ApiService.updateAdminAppointmentOptions(nextOptions);
      if (response?.success) {
        setAppointmentManagementOptions(response.options || nextOptions);
        publishAdminNotice(
          "success",
          "Appointment options updated",
          successMessage || "Visitor appointment request form options now use the latest configuration.",
        );
        return;
      }
      publishAdminNotice("error", "Options update failed", response?.message || "Unable to save appointment options.");
    } catch (error) {
      publishAdminNotice("error", "Options update failed", error?.message || "Unable to save appointment options.");
    } finally {
      setIsSavingAppointmentOptions(false);
      setSavingAppointmentOptionKey(null);
    }
  };

  const buildAppointmentTextOption = (groupKey, label, existing = {}) => ({
    id: existing.id || `${groupKey}-${normalizeTextToId(label)}-${Date.now()}`,
    label: String(label || "").trim().replace(/\s+/g, " "),
    enabled: existing.enabled !== false,
  });

  const buildAppointmentTimeSlotOption = (value, existing = {}, capacityValue = existing.capacity ?? existing.limit ?? 3) => {
    const normalized = String(value || "").trim();
    const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const suffix = String(match[3] || "").toUpperCase();
    if (suffix === "PM" && hour < 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    const capacity = Number(capacityValue);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      return null;
    }
    const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const hour12 = hour % 12 || 12;
    const label = `${hour12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
    return {
      id: existing.id || `slot-${timeValue.replace(":", "-")}-${Date.now()}`,
      label,
      value: timeValue,
      hour,
      minute,
      capacity,
      enabled: existing.enabled !== false,
    };
  };

  const updateAppointmentOptionGroup = (groupKey, updater, message, savingKey) => {
    const nextOptions = {
      ...appointmentManagementOptions,
      [groupKey]: updater(appointmentManagementOptions[groupKey] || []),
    };
    saveAppointmentManagementOptions(nextOptions, message, savingKey || groupKey);
  };

  const handleAddAppointmentOption = (groupKey) => {
    const draft = String(appointmentOptionDrafts[groupKey] || "").trim();
    if (!draft) {
      Alert.alert("Option Required", "Please enter a value before adding it.");
      return;
    }

    const newOption =
      groupKey === "timeSlots"
        ? buildAppointmentTimeSlotOption(draft)
        : buildAppointmentTextOption(groupKey, draft);

    if (!newOption) {
      Alert.alert("Invalid Time Slot", "Use HH:MM, such as 09:00 or 2:30 PM.");
      return;
    }

    updateAppointmentOptionGroup(
      groupKey,
      (items) => [...items, newOption],
      `${newOption.label} was added to the visitor appointment form.`,
      `${groupKey}:add`,
    );
    setAppointmentOptionDrafts((prev) => ({ ...prev, [groupKey]: "" }));
  };

  const handleSaveEditedAppointmentOption = (groupKey, option) => {
    const draft = String(appointmentOptionDrafts[groupKey] || "").trim();
    if (!draft) {
      Alert.alert("Option Required", "Please enter a value before saving.");
      return;
    }

    const updatedOption =
      groupKey === "timeSlots"
        ? buildAppointmentTimeSlotOption(
            draft,
            option,
            appointmentSlotCapacityDrafts[option.id] ?? option.capacity ?? option.limit ?? 3,
          )
        : buildAppointmentTextOption(groupKey, draft, option);

    if (!updatedOption) {
      Alert.alert("Invalid Time Slot", "Use HH:MM, such as 09:00 or 2:30 PM, and set slots from 1 to 50.");
      return;
    }

    updateAppointmentOptionGroup(
      groupKey,
      (items) => items.map((item) => (item.id === option.id ? updatedOption : item)),
      `${updatedOption.label} was updated in the visitor appointment form.`,
      `${groupKey}:${option.id}:edit`,
    );
    setEditingAppointmentOption(null);
    setAppointmentSlotCapacityDrafts((prev) => {
      const next = { ...prev };
      delete next[option.id];
      return next;
    });
    setAppointmentOptionDrafts((prev) => ({ ...prev, [groupKey]: "" }));
  };

  const handleToggleAppointmentOption = (groupKey, option) => {
    updateAppointmentOptionGroup(
      groupKey,
      (items) => items.map((item) => (item.id === option.id ? { ...item, enabled: item.enabled === false } : item)),
      `${option.label} was ${option.enabled === false ? "enabled" : "disabled"}.`,
      `${groupKey}:${option.id}:toggle`,
    );
  };

  const handleDeleteAppointmentOption = (groupKey, option) => {
    setPendingAdminConfirm({
      title: "Remove Option",
      message: `Remove "${option.label || option.value}" from the visitor appointment form? You can add it again later if needed.`,
      icon: "trash-outline",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () => {
        updateAppointmentOptionGroup(
          groupKey,
          (items) => items.map((item) => (item.id === option.id ? { ...item, enabled: false, deleted: true } : item)),
          `${option.label} was removed from the visitor appointment form.`,
          `${groupKey}:${option.id}:delete`,
        );
      },
    });
  };

  const confirmPendingAdminAction = () => {
    const action = pendingAdminConfirm?.onConfirm;
    setPendingAdminConfirm(null);
    action?.();
  };

  const cancelPendingAdminAction = () => {
    setPendingAdminConfirm(null);
  };

  const applyAppointmentSearch = () => {
    setAppointmentSearchTerm(appointmentSearchDraft.trim());
    setAppointmentRecordsPage(1);
  };

  const clearAppointmentSearch = () => {
    setAppointmentSearchDraft("");
    setAppointmentSearchTerm("");
    setAppointmentRecordsPage(1);
  };

  const applyAppointmentFilters = () => {
    if (appointmentFilterDraft.date && !parseDateInputValue(appointmentFilterDraft.date)) {
      Alert.alert("Invalid Date", "Please use a valid date in YYYY-MM-DD format.");
      return;
    }

    setAppointmentAppliedFilters({ ...appointmentFilterDraft });
    setAppointmentRecordsPage(1);
    setStaffDropdownOpen(null);
  };

  const resetAppointmentFilters = () => {
    const resetFilters = createAppointmentFilterDraft();
    setAppointmentFilterDraft(resetFilters);
    setAppointmentAppliedFilters(resetFilters);
    setAppointmentRecordsPage(1);
    setStaffDropdownOpen(null);
  };

  // FIXED: Load All Visit Requests
  const loadAllVisitRequests = async ({ silent = false } = {}) => {
    try {
      const response = await ApiService.getAllVisitors({ limit: 500 });
      if (response && response.visitors) {
        const requests = response.visitors || [];
        const pending = requests.filter((r) => getRequestStatus(r) === "pending");
        const approved = requests.filter((r) => getRequestStatus(r) === "approved");
        const rejected = requests.filter((r) => getRequestStatus(r) === "rejected");

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextDay = new Date(tomorrow);
        nextDay.setDate(nextDay.getDate() + 1);

        const todayVisits = requests.filter((r) => {
          const visitDate = new Date(r.visitDate);
          return visitDate >= today && visitDate < tomorrow;
        }).length;

        const tomorrowVisits = requests.filter((r) => {
          const visitDate = new Date(r.visitDate);
          return visitDate >= tomorrow && visitDate < nextDay;
        }).length;

        const upcomingVisits = requests.filter((r) => {
          const visitDate = new Date(r.visitDate);
          return visitDate >= today && getRequestStatus(r) === "approved";
        }).length;

        setVisitRequests(requests);
        setPendingRequests(pending);
        setApprovedRequests(approved);
        setRejectedRequests(rejected);
        calculateChartData(requests);
        calculateDateAnalytics(selectedDate);

        setStats((prev) => ({
          ...prev,
          pendingRequests: pending.length,
          approvedRequests: approved.length,
          rejectedRequests: rejected.length,
          totalRequests: requests.length,
          todayVisits,
          tomorrowVisits,
          upcomingVisits,
          weeklyGrowth: calculateWeeklyGrowth(requests),
          activeVisitors: approved.filter((r) => new Date(r.visitDate) >= new Date()).length,
        }));
      } else {
        console.error("Failed to load visit requests:", response);
      }
    } catch (error) {
      if (!isSafePassConnectionError(error)) {
        console.error("Load visit requests error:", error);
      }
      if (isAuthError(error)) {
        await handleAuthError();
        return;
      }
      if (isSafePassConnectionError(error)) {
        setConnectionIssue({
          title: "SafePass server unavailable",
          message: error?.message || "Check your connection or try again.",
          updatedAt: Date.now(),
        });
        return;
      }
      if (!silent) {
        Alert.alert("Error", "Failed to load visit requests. Please check your connection.");
      }
    }
  };

  // FIXED: Load All Users
  const loadAllUsers = async () => {
    try {
      const response = await ApiService.getAllUsers({ limit: 500 });
      if (response && response.users) {
        const users = response.users || [];
        const staff = users.filter((u) => u.role === "staff");
        const security = users.filter((u) => u.role === "security" || u.role === "guard");
        const departments = new Set(staff.filter((s) => s.department).map((s) => s.department));

        setAllUsers(users);
        setStaffUsers(staff);
        setGuardUsers(security);
        setVisitorUsers(users.filter((u) => u.role === "visitor"));
        setAdminUsers(users.filter((u) => u.role === "admin"));
        setStats((prev) => ({
          ...prev,
          totalUsers: users.length,
          totalStaff: staff.length,
          totalGuards: security.length,
          totalAdmin: users.filter((u) => u.role === "admin").length,
          activeUsers: users.filter((u) => u.status === "active" || u.isActive).length,
          totalDepartments: departments.size,
        }));
      } else {
        console.error("Failed to load users:", response);
      }
    } catch (error) {
      if (!isSafePassConnectionError(error)) {
        console.error("Load users error:", error);
      }
      if (isAuthError(error)) {
        await handleAuthError();
        return;
      }
      if (isSafePassConnectionError(error)) {
        setConnectionIssue({
          title: "SafePass server unavailable",
          message: error?.message || "Check your connection or try again.",
          updatedAt: Date.now(),
        });
        return;
      }
      Alert.alert("Error", "Failed to load users. Please check your connection.");
    }
  };

  const loadRecentActivities = useCallback(async () => {
    try {
      const response = await ApiService.getRecentActivities(30);
      const activities = response?.activities || [];
      setRecentActivities(activities);
      setActivitySummary(
        response?.summary || {
          appointmentRequests: 0,
          staffActions: 0,
          completedVisits: 0,
          approvals: 0,
        },
      );
    } catch (error) {
      console.error("Load recent activities error:", error);
      if (isAuthError(error)) {
        await handleAuthError();
        return;
      }
      setRecentActivities([]);
    }
  }, [handleAuthError]);

  const loadAdminStats = useCallback(async () => {
    try {
      const response = await ApiService.getAdminStats();
      const snapshot = response?.stats;
      if (!snapshot) return;

      setStats((prev) => ({
        ...prev,
        totalUsers: snapshot.totalUsers ?? prev.totalUsers,
        activeUsers: snapshot.activeUsers ?? prev.activeUsers,
        totalStaff: snapshot.totalStaff ?? prev.totalStaff,
        totalGuards: snapshot.totalSecurity ?? prev.totalGuards,
        totalAdmin: snapshot.totalAdmins ?? prev.totalAdmin,
        pendingRequests: snapshot.pendingApprovals ?? prev.pendingRequests,
        checkedInVisitors: snapshot.checkedInVisitors ?? prev.checkedInVisitors,
        completedVisits: snapshot.completedVisits ?? prev.completedVisits,
      }));
    } catch (error) {
      if (!isSafePassConnectionError(error)) {
        console.error("Load admin stats error:", error);
      }
      if (isAuthError(error)) {
        await handleAuthError();
        return;
      }
      if (isSafePassConnectionError(error)) {
        setConnectionIssue({
          title: "SafePass server unavailable",
          message: error?.message || "Check your connection or try again.",
          updatedAt: Date.now(),
        });
      }
    }
  }, [handleAuthError]);

  const loadAttendanceRecords = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const dateRange = getAttendanceDateRange(attendanceDateShortcut);
      const [attendanceResponse, summaryResponse] = await Promise.all([
        ApiService.getAttendance({ ...dateRange, limit: 250 }),
        ApiService.getAttendanceSummary(dateRange),
      ]);

      setAttendanceRecords(Array.isArray(attendanceResponse?.attendance) ? attendanceResponse.attendance : []);
      setAttendanceSummary(summaryResponse?.summary || null);
    } catch (error) {
      if (!isSafePassConnectionError(error)) {
        console.error("Load attendance records error:", error);
      }
      if (isAuthError(error)) {
        await handleAuthError();
        return;
      }
      if (isSafePassConnectionError(error)) {
        setConnectionIssue({
          title: "SafePass server unavailable",
          message: error?.message || "Check your connection or try again.",
          updatedAt: Date.now(),
        });
      }
      setAttendanceRecords([]);
      setAttendanceSummary(null);
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendanceDateShortcut, handleAuthError]);

const loadDashboardData = useCallback(async () => {
  authErrorHandledRef.current = false;
  setIsLoading(true);
  try {
    const profileResponse = await ApiService.getProfile();
    const currentUser = profileResponse?.user || (await ApiService.getCurrentUser());
    const role = String(currentUser?.role || "").toLowerCase();
    if (!currentUser || role !== "admin") {
      Alert.alert("Access Denied", "You don't have admin privileges.");
      navigation.replace("Login");
      return;
    }
    setUser(currentUser);
    setIsLoading(false);
    await Promise.allSettled([
      loadAdminStats(),
      loadAllVisitRequests(),
      loadAdminLiveVisitorLocations(),
      loadAllUsers(),
      loadRecentActivities(),
      loadAppointmentManagementOptions(),
    ]);
    setConnectionIssue(null);
  } catch (error) {
    if (!isSafePassConnectionError(error)) {
      console.error("Load dashboard error:", error);
    }
    if (isAuthError(error)) {
      await handleAuthError();
      return;
    }
    if (isSafePassConnectionError(error)) {
      setConnectionIssue({
        title: "SafePass server unavailable",
        message: error?.message || "Check your connection or try again.",
        updatedAt: Date.now(),
      });
      return;
    }
    Alert.alert("Error", "Failed to load dashboard data. Please try again.");
  } finally {
    setIsLoading(false);
    setRefreshing(false);
  }
}, [navigation, handleAuthError, loadRecentActivities, loadAdminStats, loadAppointmentManagementOptions]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    loadAttendanceRecords();
  }, [loadAttendanceRecords]);

  useEffect(() => {
    loadVisitorHistory();
  }, [visitRequests, loadVisitorHistory]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        let nextSettings = DEFAULT_ADMIN_SETTINGS;
        const savedSettings = await storageGetItem("adminSettings");
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          nextSettings = { ...nextSettings, ...parsedSettings };
        }
        const darkModePref = await storageGetItem("isDarkMode");
        if (darkModePref !== null) {
          nextSettings = { ...nextSettings, darkMode: JSON.parse(darkModePref) };
        }
        setSettings(nextSettings);
        setIsDarkMode(!!nextSettings.darkMode);

        const response = await ApiService.getSystemSettings();
        if (response?.success && response?.settings) {
          const serverSettings = { ...DEFAULT_ADMIN_SETTINGS, ...response.settings };
          setSettings(serverSettings);
          setIsDarkMode(!!serverSettings.darkMode);
          await storageSetItem("adminSettings", JSON.stringify(serverSettings));
          await storageSetItem("isDarkMode", JSON.stringify(!!serverSettings.darkMode));
        }
      } catch (error) {
        console.error("Load settings error:", error);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const newTotalPages = Math.ceil(getFilteredUsersCount() / itemsPerPage);
    setTotalPages(newTotalPages > 0 ? newTotalPages : 1);
    if (currentPage > newTotalPages && newTotalPages > 0) setCurrentPage(1);
  }, [getFilteredUsersCount, currentPage, itemsPerPage]);

  useEffect(() => {
    if (dataManagementPage > dataManagementTotalPages) {
      setDataManagementPage(dataManagementTotalPages);
    }
  }, [dataManagementPage, dataManagementTotalPages]);

  useEffect(() => {
    if (dataManagementFieldPage > fieldSetupTotalPages) {
      setDataManagementFieldPage(fieldSetupTotalPages);
    }
  }, [dataManagementFieldPage, fieldSetupTotalPages]);

  useEffect(() => {
    setHistoryPage(1);
  }, [
    historyDateFilter,
    historyDateRange.startDate,
    historyDateRange.endDate,
    historyFilter,
    historyOfficeFilter,
    historySearchQuery,
    historySortOrder,
  ]);

  useEffect(() => {
    if (!createUserMessage) return;
    const timer = setTimeout(() => setCreateUserMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [createUserMessage]);

  useEffect(() => {
    if (!adminNotice) return undefined;
    const timer = setTimeout(() => setAdminNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [adminNotice]);

  useEffect(() => {
    if (selectedSubmodule !== "data-management" || !userDataPanelMode) return undefined;

    const timer = setTimeout(() => {
      dataManagementScrollViewRef.current?.scrollToEnd?.({ animated: true });
    }, 120);

    return () => clearTimeout(timer);
  }, [selectedSubmodule, userDataPanelMode, selectedUser]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData();
  }, [loadDashboardData]);

  const loadAdminLiveVisitorLocations = async () => {
    try {
      const response = await ApiService.getSecurityLiveVisitorLocations({ limit: 200 });
      setAdminLiveVisitorLocations(Array.isArray(response?.visitors) ? response.visitors : []);
      return true;
    } catch (error) {
      console.error("Load admin live visitor locations error:", error);
      setAdminLiveVisitorLocations([]);
      return false;
    }
  };

  const refreshAdminMapData = async () => {
    if (adminMapRefreshRef.current) return;
    adminMapRefreshRef.current = true;
    try {
      await Promise.all([
        loadAllVisitRequests({ silent: true }),
        loadAdminLiveVisitorLocations(),
        loadRecentActivities(),
      ]);
      setLastAdminMapRefreshAt(new Date().toISOString());
    } finally {
      adminMapRefreshRef.current = false;
    }
  };

  const smartRefreshAdminData = useCallback(async () => {
    const now = Date.now();
    if (now - smartRefreshAtRef.current < SMART_REFRESH_MIN_INTERVAL_MS) return;
    smartRefreshAtRef.current = now;

    await Promise.allSettled([
      loadAdminStats(),
      loadAllVisitRequests({ silent: true }),
      loadAdminLiveVisitorLocations(),
      loadRecentActivities(),
      selectedSubmodule === "attendance-records" ? loadAttendanceRecords() : Promise.resolve(),
    ]);
  }, [
    loadAdminStats,
    loadAllVisitRequests,
    loadRecentActivities,
    loadAttendanceRecords,
    selectedSubmodule,
  ]);

  useEffect(() => {
    const isMapVisible = activeMenu === "webmap" || showAdminMapModal || showAdminMapDock;
    if (!isMapVisible) return undefined;

    refreshAdminMapData();
    return undefined;
  }, [activeMenu, showAdminMapModal, showAdminMapDock]);

  useEffect(() => {
    const unsubscribeNavigationFocus = navigation?.addListener?.("focus", smartRefreshAdminData);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        smartRefreshAdminData();
      }
    });

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("focus", smartRefreshAdminData);
      return () => {
        unsubscribeNavigationFocus?.();
        appStateSubscription?.remove?.();
        window.removeEventListener("focus", smartRefreshAdminData);
      };
    }

    return () => {
      unsubscribeNavigationFocus?.();
      appStateSubscription?.remove?.();
    };
  }, [navigation, smartRefreshAdminData]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.96],
    extrapolate: "clamp",
  });

  const getDynamicStyles = () => {
    if (isDarkMode) {
      return {
        backgroundColor: "#0A1020",
        cardBackground: "#111827",
        cardElevated: "#151F31",
        surfaceMuted: "#0F172A",
        textPrimary: "#F8FAFC",
        textSecondary: "#A7B3C6",
        borderColor: "rgba(148, 163, 184, 0.16)",
        subtleBorderColor: "rgba(148, 163, 184, 0.10)",
        headerBackground: "#0F2A55",
        sidebarBackground: "#080F1D",
        inputBackground: "#121C2E",
        successBg: "#064E3B",
        warningBg: "#78350F",
        errorBg: "#7F1D1D",
        infoBg: "#102A4A",
      };
    }
    return {
      backgroundColor: "#F5F8FC",
      cardBackground: "#FFFFFF",
      cardElevated: "#FFFFFF",
      surfaceMuted: "#F8FBFE",
      textPrimary: "#0F172A",
      textSecondary: "#64748B",
      borderColor: "#E2EAF3",
      subtleBorderColor: "#EDF2F8",
      headerBackground: "#FFFFFF",
      sidebarBackground: "#FFFFFF",
      inputBackground: "#F8FBFE",
      successBg: "#EEF5FF",
      warningBg: "#FEF3C7",
      errorBg: "#FEE2E2",
      infoBg: "#EFF6FF",
    };
  };

  const theme = getDynamicStyles();
  const dashboardLineColor = isDarkMode
    ? theme.subtleBorderColor
    : "#E6EEF7";

  const mapActivities = useMemo(
    () =>
      (recentActivities || []).filter((activity) => {
        const activityType = String(activity?.activityType || "").toLowerCase();
        if (!ADMIN_MAP_ACTIVITY_TYPES.has(activityType)) {
          return false;
        }

        return Boolean(activity?.relatedVisitor || activity?.location || activity?.notes);
      }),
    [recentActivities],
  );

  const filteredMapActivities = useMemo(() => {
    if (adminMapFilter === "all") return mapActivities;
    return mapActivities.filter((activity) => getAdminMapFilterKey(activity?.activityType) === adminMapFilter);
  }, [adminMapFilter, mapActivities]);

  const mapActivityCounts = useMemo(
    () => countMapActivitiesByFilter(mapActivities, getAdminMapFilterKey),
    [mapActivities],
  );

  const findManagedRoomForVisitor = useCallback(
    (visitor) => {
      const location = visitor?.currentLocation || {};
      const candidates = [
        location.checkpointId,
        location.office,
        visitor?.assignedOffice,
        visitor?.appointmentDepartment,
        visitor?.host,
      ]
        .map((value) => normalizeMapText(value))
        .filter(Boolean);

      if (candidates.length === 0) return null;

      return (
        managedRooms.find((room) => {
          const roomId = normalizeMapText(room.id);
          const roomName = normalizeMapText(room.name);
          return candidates.some(
            (candidate) =>
              candidate === roomId ||
              candidate === roomName ||
              roomId.includes(candidate) ||
              candidate.includes(roomName),
          );
        }) || null
      );
    },
    [managedRooms],
  );

  const getManagedVisitorMapLocation = useCallback(
    (visitor, index = 0) => {
      const matchedRoom = findManagedRoomForVisitor(visitor);
      const position = matchedRoom ? managedRoomPositions?.[matchedRoom.id] : null;

      if (
        matchedRoom &&
        position &&
        Number.isFinite(Number(position.x)) &&
        Number.isFinite(Number(position.y))
      ) {
        return {
          floor: matchedRoom.floor || getVisitorMonitorFloor(visitor),
          office: matchedRoom.name,
          coordinates: {
            x: Number(position.x),
            y: Number(position.y),
          },
        };
      }

      return {
        floor: getVisitorMonitorFloor(visitor),
        office:
          visitor?.currentLocation?.office ||
          visitor?.assignedOffice ||
          visitor?.host ||
          "On-site visitor",
        coordinates: getVisitorMonitorCoordinates(visitor, index),
      };
    },
    [findManagedRoomForVisitor, managedRoomPositions],
  );

  const monitoredMapVisitors = useMemo(
    () => {
      const checkedInRequestVisitors = visitRequests
        .filter((visitor) => visitor?.status === "checked_in")
        .slice(0, 18)
        .map((visitor, index) => {
          const managedLocation = getManagedVisitorMapLocation(visitor, index);
          return {
            id: visitor?._id || `checked-in-visitor-${index}`,
            name: visitor?.fullName || "Checked-In Visitor",
            purpose: visitor?.purposeOfVisit || "On-site visit",
            status: "checked_in",
            location: {
              floor: managedLocation.floor,
              office: managedLocation.office,
              source: visitor?.currentLocation?.source || "system_estimate",
              timestamp:
                visitor?.currentLocation?.lastSeenAt ||
                visitor?.checkedInAt ||
                visitor?.updatedAt ||
                visitor?.createdAt,
              coordinates: managedLocation.coordinates,
            },
            activityType: "security_checkin",
            eventLabel: "Checked In",
            lastUpdate:
              visitor?.currentLocation?.lastSeenAt ||
              visitor?.checkedInAt ||
              visitor?.updatedAt ||
              visitor?.createdAt,
            detail: managedLocation.office || "Visitor is currently on site.",
            sourceVisitor: visitor,
          };
        });

      if (!adminLiveVisitorLocations.length) {
        return checkedInRequestVisitors;
      }

      const requestById = new Map(
        visitRequests.map((visitor) => [String(visitor?._id || visitor?.id || ""), visitor]),
      );

      return adminLiveVisitorLocations.slice(0, 40).map((liveVisitor, index) => {
        const visitorId = String(liveVisitor?.visitorId || liveVisitor?.id || liveVisitor?._id || "");
        const matchedVisitor = requestById.get(visitorId) || null;
        const coordinates = liveVisitor?.coordinates || {};
        const liveLocation = {
          floor: liveVisitor?.floor || matchedVisitor?.currentLocation?.floor || "ground",
          office:
            liveVisitor?.office ||
            liveVisitor?.currentLocation ||
            matchedVisitor?.currentLocation?.office ||
            matchedVisitor?.assignedOffice ||
            "Campus",
          source: liveVisitor?.source || matchedVisitor?.currentLocation?.source || "checkpoint",
          timestamp:
            liveVisitor?.lastScanTime ||
            liveVisitor?.checkedInAt ||
            matchedVisitor?.currentLocation?.lastSeenAt ||
            matchedVisitor?.checkedInAt ||
            new Date().toISOString(),
          coordinates:
            Number.isFinite(Number(coordinates.x)) && Number.isFinite(Number(coordinates.y))
              ? { x: Number(coordinates.x), y: Number(coordinates.y) }
              : getVisitorMonitorCoordinates(matchedVisitor || liveVisitor, index),
        };
        const sourceVisitor = matchedVisitor
          ? {
              ...matchedVisitor,
              currentLocation: {
                ...(matchedVisitor.currentLocation || {}),
                floor: liveLocation.floor,
                office: liveLocation.office,
                source: liveLocation.source,
                lastSeenAt: liveLocation.timestamp,
                coordinates: liveLocation.coordinates,
                checkpointId: liveVisitor?.checkpointId || matchedVisitor.currentLocation?.checkpointId || "",
                statusLabel: liveVisitor?.statusLabel || matchedVisitor.currentLocation?.statusLabel || "",
                isActive: liveVisitor?.status !== "exited",
              },
            }
          : {
              _id: visitorId,
              fullName: liveVisitor?.name || "Checked-In Visitor",
              email: liveVisitor?.email || "",
              phoneNumber: liveVisitor?.phone || "",
              purposeOfVisit: liveVisitor?.purpose || "On-site visit",
              assignedOffice: liveLocation.office,
              status: "checked_in",
              checkedInAt: liveVisitor?.checkedInAt || liveVisitor?.lastScanTime || "",
              currentLocation: liveLocation,
            };

        return {
          id: visitorId || `live-visitor-${index}`,
          name: sourceVisitor.fullName || liveVisitor?.name || "Checked-In Visitor",
          purpose: sourceVisitor.purposeOfVisit || liveVisitor?.purpose || "On-site visit",
          status: "checked_in",
          location: liveLocation,
          activityType: "security_checkin",
          eventLabel: liveVisitor?.statusLabel || "Checked In",
          lastUpdate: liveLocation.timestamp,
          detail: liveLocation.office || "Visitor is currently on site.",
          sourceVisitor,
          nfcCardId: sourceVisitor.nfcCardId || liveVisitor?.nfcCardId || "",
        };
      });
    },
    [adminLiveVisitorLocations, getManagedVisitorMapLocation, visitRequests],
  );

  const visibleAdminMapVisitors = useMemo(
    () =>
      monitoredMapVisitors.filter((visitor) => {
        const visitorFloor = normalizeMonitoringFloor(visitor?.location?.floor);
        const selectedFloor = normalizeMonitoringFloor(selectedAdminMapFloor);

        if (visitorFloor && visitorFloor !== selectedFloor) {
          return false;
        }

        if (
          selectedAdminMapOffice !== "all" &&
          visitor?.location?.office !== selectedAdminMapOffice
        ) {
          return false;
        }

        return true;
      }),
    [monitoredMapVisitors, selectedAdminMapFloor, selectedAdminMapOffice],
  );

  const activeMapActivity = useMemo(() => {
    if (!selectedMapActivity) return null;
    return visibleAdminMapVisitors.find((item) => item.id === selectedMapActivity.id) || null;
  }, [visibleAdminMapVisitors, selectedMapActivity]);

  const activeMenuMeta = useMemo(() => {
    switch (activeMenu) {
      case "requests":
        return {
          subtitle: "Review visitor requests, approve them quickly, and keep upcoming arrivals organized.",
          highlights: [
            { label: "Pending", value: stats.pendingRequests, icon: "time-outline", color: ADMIN_BLUE },
            { label: "Approved", value: approvedRequests.length, icon: "checkmark-circle-outline", color: ADMIN_BLUE },
          ],
        };
      case "staff":
        return {
          subtitle: "Manage staff accounts, assignments, and who can respond to incoming appointments.",
          highlights: [
            { label: "Staff", value: staffUsers.length, icon: "briefcase-outline", color: ADMIN_BLUE },
            { label: "Departments", value: new Set(staffUsers.map((item) => item.department).filter(Boolean)).size, icon: "business-outline", color: ADMIN_BLUE },
          ],
        };
      case "security":
        return {
          subtitle: "Keep your gate team ready, track active personnel, and support visitor check-ins in real time.",
          highlights: [
            { label: "Security", value: guardUsers.length, icon: "shield-outline", color: ADMIN_BLUE },
            { label: "Active", value: guardUsers.filter((item) => isUserActive(item)).length, icon: "pulse-outline", color: ADMIN_BLUE },
          ],
        };
      case "users":
        return {
          subtitle: "Monitor the full account directory and move between roles without losing control of the admin workflow.",
          highlights: [
            { label: "Users", value: allUsers.length, icon: "people-outline", color: ADMIN_BLUE },
            { label: "Active", value: activeUsersList.length, icon: "checkmark-done-outline", color: ADMIN_BLUE },
          ],
        };
      case "analytics":
        return {
          subtitle: "Track daily trends, visitor outcomes, and operational patterns across the system.",
          highlights: [
            { label: "Today", value: stats.todayVisits, icon: "calendar-outline", color: ADMIN_BLUE },
            { label: "Tomorrow", value: stats.tomorrowVisits, icon: "calendar-clear-outline", color: ADMIN_BLUE },
          ],
        };
      case "attendance":
        return {
          subtitle: "Review campus attendance taps for students, teachers, and staff records.",
          highlights: [
            { label: "Records", value: scopedAttendanceRecords.length, icon: "time-outline", color: ADMIN_BLUE },
            { label: "Late", value: attendanceQuickSummary.late, icon: "alert-circle-outline", color: ADMIN_BLUE },
          ],
        };
      case "settings":
        return {
          subtitle: "Control dashboard preferences and communication settings for the admin experience.",
          highlights: [
            { label: "Dark Mode", value: settings.darkMode ? "On" : "Off", icon: "moon-outline", color: ADMIN_BLUE },
            { label: "Email", value: settings.emailNotifications ? "On" : "Off", icon: "mail-outline", color: ADMIN_BLUE },
          ],
        };
      default:
        return {
          subtitle: "Review the visitor pipeline, move into the right section quickly, and keep the whole campus flow on track.",
          highlights: [
            { label: "Pending", value: stats.pendingRequests, icon: "time-outline", color: ADMIN_BLUE },
            { label: "Live Map", value: monitoredMapVisitors.length, icon: "map-outline", color: ADMIN_BLUE },
          ],
        };
    }
  }, [
    activeMenu,
    activeUsersList.length,
    allUsers.length,
    approvedRequests.length,
    attendanceQuickSummary.late,
    guardUsers,
    monitoredMapVisitors.length,
    scopedAttendanceRecords.length,
    settings.darkMode,
    settings.emailNotifications,
    staffUsers,
    stats.pendingRequests,
    stats.todayVisits,
    stats.tomorrowVisits,
  ]);

  const dashboardQuickActions = useMemo(() => ([
    {
      key: "requests",
      title: "Review Requests",
      subtitle: "Approve or reject visitor requests waiting today.",
      icon: "time-outline",
      color: ADMIN_BLUE,
      badge: `${stats.pendingRequests || 0} pending`,
      action: "requests",
    },
    {
      key: "create",
      title: "Create Accounts",
      subtitle: "Add student, academic staff, services staff, or security accounts.",
      icon: "person-add-outline",
      color: ADMIN_BLUE,
      badge: "Admin only",
      action: "account-create",
    },
    {
      key: "attendance",
      title: "Attendance",
      subtitle: "Open student, teacher, staff, and visitor attendance records.",
      icon: "calendar-clear-outline",
      color: ADMIN_BLUE,
      badge: "Daily logs",
      action: "attendance",
    },
    {
      key: "map",
      title: "Campus Map",
      subtitle: "Open live monitoring on the campus map view.",
      icon: "map-outline",
      color: ADMIN_BLUE,
      badge: `${monitoredMapVisitors.length || 0} live`,
      action: "webmap",
    },
  ]), [
    monitoredMapVisitors.length,
    stats.pendingRequests,
  ]);

  const adminMapFilters = useMemo(() => ([
    { key: "all", label: "All", count: mapActivityCounts.all },
    {
      key: "requests",
      label: "Requests",
      count: mapActivityCounts.requests,
    },
    {
      key: "approvals",
      label: "Approvals",
      count: mapActivityCounts.approvals,
    },
    {
      key: "movement",
      label: "Movement",
      count: mapActivityCounts.movement,
    },
    {
      key: "issues",
      label: "Issues",
      count: mapActivityCounts.issues,
    },
  ]), [mapActivityCounts]);

  const adminMapSummaryItems = useMemo(() => ([
    { label: "Tracked", value: visibleAdminMapVisitors.length || 0, color: ADMIN_BLUE },
    { label: "Movement", value: adminMapFilters.find((item) => item.key === "movement")?.count || 0, color: "#0A3D91" },
    { label: "Issues", value: adminMapFilters.find((item) => item.key === "issues")?.count || 0, color: ADMIN_BLUE },
  ]), [adminMapFilters, visibleAdminMapVisitors.length]);

  const latestAdminMapActivityAt = useMemo(() => {
    const timestamps = [
      lastAdminMapRefreshAt,
      ...mapActivities.map((activity) => activity?.timestamp || activity?.createdAt || activity?.updatedAt),
      ...monitoredMapVisitors.map((visitorItem) => visitorItem?.lastUpdate),
    ]
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);

    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [lastAdminMapRefreshAt, mapActivities, monitoredMapVisitors]);

  const adminMapLegendItems = useMemo(() => ([
    { label: "Checked in", color: "#10B981", icon: "checkmark-circle" },
    { label: "Movement", color: "#0A3D91", icon: "walk-outline" },
    { label: "Requests", color: "#F59E0B", icon: "time-outline" },
    { label: "Issues", color: "#EF4444", icon: "alert-circle-outline" },
  ]), []);

  const applySidebarAnimation = () => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  };

  const syncLegacyMenuState = (action) => {
    setActiveMenu(action);
    setCurrentPage(1);

    switch (action) {
      case "dashboard":
        loadDashboardData();
        break;
      case "webmap":
        loadRecentActivities();
        loadAllVisitRequests();
        break;
      case "requests":
        setRequestFilter("pending");
        loadAllVisitRequests();
        break;
      case "staff":
        setUserFilter("all");
        setUserSearchQuery("");
        loadAllUsers();
        break;
      case "security":
        setUserFilter("all");
        setUserSearchQuery("");
        loadAllUsers();
        break;
      case "users":
        setUserFilter("all");
        setUserSearchQuery("");
        loadAllUsers();
        break;
      case "analytics":
        calculateDateAnalytics(selectedDate);
        break;
      case "settings":
        break;
      default:
        break;
    }
  };

  const getParentModuleForSubmodule = (submoduleKey) => {
    const moduleMatch = adminModules.find((module) =>
      module.submodules.some((submodule) => submodule.key === submoduleKey)
    );
    return moduleMatch?.key || null;
  };

  const selectAdminSubmodule = (submoduleKey, options = {}) => {
    const nextAccountMode =
      options.accountMode ??
      (submoduleKey === "account-records" ? "all" : accountRecordsMode);
    const parentModuleKey = getParentModuleForSubmodule(submoduleKey);
    const legacyMenuKey =
      submoduleKey === "dashboard"
        ? "dashboard"
        : submoduleKey === "account-create" || submoduleKey === "account-records" || submoduleKey === "data-management"
          ? "users"
          : submoduleKey.startsWith("map-")
            ? "webmap"
            : submoduleKey === "appointment-records" || submoduleKey === "appointment-management"
              ? "requests"
              : submoduleKey === "attendance-records"
                ? "attendance"
                : submoduleKey === "analytics" || submoduleKey === "report-records" || submoduleKey === "security-report-records"
                  ? "analytics"
                  : submoduleKey === "settings"
                    ? "settings"
                    : "dashboard";

    applySidebarAnimation();
    setSelectedSubmodule(submoduleKey);
    setExpandedModule(parentModuleKey);
    setAccountRecordsMode(nextAccountMode);
    setSelectedAdminMapOffice("all");
    setShowAdminMobileMenu(false);

    if (submoduleKey.startsWith("map-")) {
      setSelectedAdminMapFloor(FLOOR_VIEW_TO_ID[submoduleKey] || "ground");
      setRoomDraft(createRoomDraft(FLOOR_VIEW_TO_ID[submoduleKey] || "ground"));
      setEditingRoomId(null);
    }

    if (submoduleKey === "data-management") {
      setEditingFieldId(null);
      setFieldDraft(createFieldDraft());
      setUserFilter("all");
      setUserDepartmentFilter("all");
      setUserSearchTerm("");
      setUserSearchQuery("");
      setDataManagementPage(1);
      setDataManagementFieldPage(1);
      setUserDataPanelMode(null);
    }

    if (submoduleKey === "account-create") {
      resetCreateUserForm(options.createRole || "staff");
    }

    syncLegacyMenuState(legacyMenuKey);
  };

  const handleModuleToggle = (moduleKey) => {
    applySidebarAnimation();
    setExpandedModule((currentValue) => (currentValue === moduleKey ? null : moduleKey));
  };

  const handleMenuAction = (action) => {
    switch (action) {
      case "dashboard":
        selectAdminSubmodule("dashboard");
        break;
      case "requests":
        selectAdminSubmodule("appointment-management");
        break;
      case "webmap":
        selectAdminSubmodule("map-ground");
        break;
      case "staff":
        selectAdminSubmodule("account-records", { accountMode: "staff" });
        break;
      case "security":
        selectAdminSubmodule("account-records", { accountMode: "security" });
        break;
      case "users":
        selectAdminSubmodule("account-records", { accountMode: "all" });
        break;
      case "analytics":
        selectAdminSubmodule("analytics");
        break;
      case "attendance":
        selectAdminSubmodule("attendance-records");
        break;
      case "nfc":
        navigation.navigate("NFCManagement");
        break;
      case "settings":
        applySidebarAnimation();
        setSelectedSubmodule("settings");
        setExpandedModule(null);
        syncLegacyMenuState("settings");
        setShowAdminMobileMenu(false);
        break;
      default:
        if (ALL_ADMIN_SUBMODULES.includes(action)) {
          selectAdminSubmodule(action);
          break;
        }
        selectAdminSubmodule("dashboard");
    }
  };

  const performLogout = useCallback(async () => {
    try {
      setIsLoading(true);
      setShowLogoutConfirmModal(false);
      setShowAdminMapModal(false);
      setShowAdminMapDock(false);
      setSelectedMapActivity(null);
      setUser(null);
      authErrorHandledRef.current = false;

      try {
        await ApiService.logout();
      } catch (logoutError) {
        console.log("Logout API error (ignored):", logoutError);
      }

      await ApiService.clearAuth();
      await storageMultiRemove([
        "userData",
        "currentUser",
        "isNewRegistration",
      ]);

      if (typeof onLogout === "function") {
        onLogout();
      }

      navigation.reset({ index: 0, routes: [{ name: "RoleSelect" }] });
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false);
      Alert.alert("Error", "Failed to logout. Please try again.");
    }
  }, [navigation, onLogout]);

  const handleLogout = useCallback(() => {
    setShowLogoutConfirmModal(true);
  }, [performLogout]);

  // FIXED: Handle Approve Request
  const handleApproveRequest = async (request) => {
    const id = request._id || request.id;
    if (!id) {
      Alert.alert("Error", "Cannot find visitor ID. Please refresh and try again.");
      return;
    }
    if (!ensureAdminAccess()) return;
    if (processingId === id) return;

    setProcessingId(id);
    try {
      const response = await ApiService.approveVisitor(id, "Approved by admin");
      if (response && (response.success || response.visitor)) {
        const approvedVisitor = response.visitor || {};
        const updatedRequests = visitRequests.map(req => {
          if ((req._id === id || req.id === id)) {
            return {
              ...req,
              ...approvedVisitor,
              status: approvedVisitor.status || "approved",
              approvalStatus: approvedVisitor.approvalStatus || "approved",
            };
          }
          return req;
        });

        setVisitRequests(updatedRequests);
        setPendingRequests(updatedRequests.filter((r) => getRequestStatus(r) === "pending"));
        setApprovedRequests(updatedRequests.filter((r) => getRequestStatus(r) === "approved"));

        setStats(prev => ({
          ...prev,
          pendingRequests: updatedRequests.filter((r) => getRequestStatus(r) === "pending").length,
          approvedRequests: updatedRequests.filter((r) => getRequestStatus(r) === "approved").length,
        }));

        setShowRequestDetailsModal(false);
        setSelectedRequest(null);
        await loadAllVisitRequests();
        publishAdminNotice(
          "success",
          "Visitor approved",
          `${approvedVisitor.fullName || request.fullName || "Visitor"} is now active and visible to security.`,
        );

        Alert.alert(
          "Visitor Approved",
          `${approvedVisitor.fullName || request.fullName || "Visitor"} has been approved successfully.\n\nThe visitor account has been updated.\nEmail: ${approvedVisitor.email || request.email || "N/A"}\n\nIf this visitor needs a password, they should use the activation or password reset link sent to their email.`,
        );
      } else {
        Alert.alert("Error", response?.message || "Failed to approve request");
      }
    } catch (error) {
      console.error("Approve error:", error);
      publishAdminNotice("error", "Approval failed", error?.message || "Unable to approve the selected request.");
      Alert.alert(
        "Approval Failed",
        error?.status === 403
          ? "This action requires an admin account. Please sign in again as admin."
          : (error.message || "Failed to approve request. Please try again."),
      );
    } finally {
      setProcessingId(null);
    }
  };

  // FIXED: Handle Reject Request
  const handleRejectRequest = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert("Error", "Please provide a reason for rejection");
      return;
    }
    if (!ensureAdminAccess()) return;
    const id = selectedRequest?._id || selectedRequest?.id;
    if (!id) {
      Alert.alert("Error", "Cannot find visitor ID");
      return;
    }

    Alert.alert("Reject Visit Request", `Are you sure you want to reject ${selectedRequest?.fullName}'s visit?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        onPress: async () => {
          setProcessingId(id);
          try {
            const response = await ApiService.rejectVisitor(id, rejectionReason);
            if (response && (response.success || response.visitor)) {
              const updatedRequests = visitRequests.map(req => {
                if ((req._id === id || req.id === id)) {
                  return { ...req, status: "rejected", rejectionReason };
                }
                return req;
              });
              
              setVisitRequests(updatedRequests);
              setPendingRequests(updatedRequests.filter((r) => getRequestStatus(r) === "pending"));
              setRejectedRequests(updatedRequests.filter((r) => getRequestStatus(r) === "rejected"));
              
              setStats(prev => ({
                ...prev,
                pendingRequests: updatedRequests.filter((r) => getRequestStatus(r) === "pending").length,
                rejectedRequests: updatedRequests.filter((r) => getRequestStatus(r) === "rejected").length,
              }));
              
              publishAdminNotice(
                "success",
                "Request rejected",
                `${selectedRequest?.fullName || "Visitor"} was rejected and removed from the pending queue.`,
              );
              Alert.alert("Success", `${selectedRequest?.fullName} has been rejected.`);
              setShowRejectModal(false);
              setRejectionReason("");
              loadAllVisitRequests();
            } else {
              Alert.alert("Error", response?.message || "Failed to reject request");
            }
          } catch (error) {
            console.error("Reject error:", error);
            publishAdminNotice("error", "Rejection failed", error?.message || "Unable to reject the request right now.");
            Alert.alert("Error", error.message || "Failed to reject request. Please try again.");
          } finally {
            setProcessingId(null);
          }
        },
      },
    ]);
  };

  const openCreateUserModal = (role = accountRecordsMode === "security" ? "security" : "staff") => {
    selectAdminSubmodule("account-create", { createRole: role });
  };

  const getStaffDepartmentOption = (department) =>
    STAFF_DEPARTMENT_OPTIONS.find((item) => item.value === department) || STAFF_DEPARTMENT_OPTIONS[0];

  const getStaffOfficerOptions = (department) =>
    STAFF_OFFICER_OPTIONS_BY_DEPARTMENT[getStaffDepartmentOption(department)?.value] ||
    STAFF_OFFICER_OPTIONS_BY_DEPARTMENT.Admissions;

  const getDefaultStaffPosition = (department) =>
    getStaffOfficerOptions(department)[0]?.value || "Staff Officer";

  const updateStaffDepartment = (target, department) => {
    const updateForm = target === "edit" ? setEditUserData : setNewUserData;
    updateForm((currentForm) => ({
      ...currentForm,
      department,
      position: getDefaultStaffPosition(department),
    }));
    setStaffDropdownOpen(null);
  };

  const updateStaffPosition = (target, position) => {
    const updateForm = target === "edit" ? setEditUserData : setNewUserData;
    updateForm((currentForm) => ({
      ...currentForm,
      position,
    }));
    setStaffDropdownOpen(null);
  };

  const normalizeUsernameInput = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");

  const validateCreateUserForm = () => {
    const nextErrors = {};
    const generatedEmail = generateAccountEmail(newUserData, allUsers);
    const normalizedEmail = String(newUserData.email || generatedEmail || "").trim().toLowerCase();
    const normalizedUsername = normalizeUsernameInput(newUserData.username);
    const generatedEmployeeId = generateAccountEmployeeId(newUserData, allUsers);
    const normalizedCreateRole = String(newUserData.role || "").toLowerCase();
    const isStudentAccount = normalizedCreateRole === "student";
    const isAcademicStaffAccount = normalizedCreateRole === "teacher";
    const isAcademicAccessAccount = isStudentAccount || isAcademicStaffAccount;
    const normalizedEmployeeId = String(newUserData.employeeId || (!isAcademicAccessAccount ? generatedEmployeeId : "") || "").trim();
    const normalizedStudentId = String(newUserData.studentId || (isStudentAccount ? generatedEmployeeId : "") || "").trim();
    const normalizedTeacherId = String(newUserData.teacherId || (isAcademicStaffAccount ? generatedEmployeeId : "") || "").trim();
    const normalizedAcademicId = isAcademicStaffAccount ? normalizedTeacherId : normalizedStudentId;
    const normalizedNfcCardId = normalizeAdminNfcCardUid(newUserData.nfcCardId);
    const normalizedParentEmail = String(newUserData.parentEmail || "").trim().toLowerCase();

    if (!String(newUserData.firstName || "").trim()) nextErrors.firstName = "First name is required.";
    if (!String(newUserData.lastName || "").trim()) nextErrors.lastName = "Last name is required.";
    if (!["staff", "security", "guard", "student", "teacher"].includes(normalizedCreateRole)) {
      nextErrors.role = "Admin can only create student, academic staff, admin services staff, or security accounts here.";
    }
    if (isAcademicAccessAccount) {
      if (!normalizedAcademicId) nextErrors[isAcademicStaffAccount ? "teacherId" : "studentId"] = isAcademicStaffAccount ? "Academic staff ID is required." : "Student ID is required.";
    } else if (!normalizedEmployeeId) {
      nextErrors.employeeId = "Staff/Security number is required.";
    }
    if (!normalizedEmail) nextErrors.email = "Email address is required.";
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    const normalizedPhone = isAcademicAccessAccount
      ? ""
      : newUserData.phone
        ? normalizePhilippineMobileNumber(newUserData.phone)
        : "";
    if (!isAcademicAccessAccount && String(newUserData.phone || "").trim() && !isValidPhilippineMobileNumber(newUserData.phone)) {
      nextErrors.phone = PHILIPPINE_MOBILE_NUMBER_MESSAGE;
    }
    if (isStudentAccount && normalizedParentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedParentEmail)) {
      nextErrors.parentEmail = "Enter a valid parent or guardian email address.";
    }

    if (!isSecurityRole(newUserData.role) && !isAcademicAccessAccount) {
      if (!String(newUserData.department || "").trim()) nextErrors.department = "Department is required.";
    }

    const existingEmail = allUsers.find(
      (userItem) => String(userItem?.email || "").trim().toLowerCase() === normalizedEmail,
    );
    if (existingEmail) {
      nextErrors.email = "This email address is already registered.";
    }

    if (normalizedUsername) {
      const existingUsername = allUsers.find(
        (userItem) => normalizeUsernameInput(userItem?.username) === normalizedUsername,
      );
      if (existingUsername) {
        nextErrors.username = "This username is already in use.";
      }
    }
    if (normalizedEmployeeId) {
      const existingEmployeeId = allUsers.find(
        (userItem) => String(userItem?.employeeId || "").trim().toLowerCase() === normalizedEmployeeId.toLowerCase(),
      );
      if (existingEmployeeId) {
        nextErrors.employeeId = "This Staff/Security number is already registered.";
      }
    }
    if (normalizedAcademicId) {
      const existingAcademicId = allUsers.find(
        (userItem) => String(isAcademicStaffAccount ? userItem?.teacherId : userItem?.studentId || "").trim().toLowerCase() === normalizedAcademicId.toLowerCase(),
      );
      if (existingAcademicId) {
        nextErrors[isAcademicStaffAccount ? "teacherId" : "studentId"] = isAcademicStaffAccount
          ? "This academic staff ID is already registered."
          : "This student ID is already registered.";
      }
    }
    if (normalizedNfcCardId) {
      const existingNfcCard = allUsers.find(
        (userItem) => normalizeAdminNfcCardUid(userItem?.physicalNfcUid || userItem?.nfcCardId) === normalizedNfcCardId,
      );
      if (existingNfcCard) {
        nextErrors.nfcCardId = "This NFC card UID is already assigned.";
      }
    }

    setCreateUserErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      normalizedEmail,
      normalizedUsername,
      normalizedPhone,
      normalizedEmployeeId,
      normalizedStudentId,
      normalizedTeacherId,
      normalizedNfcCardId,
      normalizedParentEmail,
    };
  };

  const resetCreateUserForm = (role = "staff") => {
    setIsCreateEmailManuallyEdited(false);
    setIsCreateEmployeeIdManuallyEdited(false);
    setNewUserData(createEmptyUserForm(role));
    setCreateUserErrors({});
    setStaffDropdownOpen(null);
  };

  const switchCreateUserRole = (role = "staff") => {
    setNewUserData((currentValue) => ({
      ...createEmptyUserForm(role),
      firstName: currentValue.firstName,
      lastName: currentValue.lastName,
      username: currentValue.username,
      email: isCreateEmailManuallyEdited ? currentValue.email : "",
      phone: isSecurityRole(role) ? currentValue.phone : "",
      employeeId: isCreateEmployeeIdManuallyEdited ? currentValue.employeeId : "",
      studentId: isCreateEmployeeIdManuallyEdited ? currentValue.studentId : "",
      teacherId: isCreateEmployeeIdManuallyEdited ? currentValue.teacherId : "",
      nfcCardId: currentValue.nfcCardId,
    }));
    setCreateUserErrors({});
    setStaffDropdownOpen(null);
  };

  const renderCreateUserFieldError = (fieldKey) =>
    createUserErrors[fieldKey] ? (
      <Text style={styles.formErrorText}>{createUserErrors[fieldKey]}</Text>
    ) : null;

  const validateEditUserForm = ({ showErrors = true } = {}) => {
    const nextErrors = {};
    const selectedId = editUserData.id;
    const normalizedEmail = String(editUserData.email || "").trim().toLowerCase();
    const normalizedUsername = normalizeUsernameInput(editUserData.username);
    const normalizedEmployeeId = String(editUserData.employeeId || "").trim().toLowerCase();
    const normalizedRole = String(editUserData.role || "").toLowerCase();
    const isEditingStudent = normalizedRole === "student";
    const isEditingTeacher = normalizedRole === "teacher";
    const academicId = String(isEditingTeacher ? editUserData.teacherId : editUserData.studentId || "").trim();
    const normalizedNfcCardId = normalizeAdminNfcCardUid(editUserData.nfcCardId);
    const normalizedParentEmail = String(editUserData.parentEmail || "").trim().toLowerCase();

    if (!String(editUserData.firstName || "").trim()) nextErrors.firstName = "First name is required.";
    if (!String(editUserData.lastName || "").trim()) nextErrors.lastName = "Last name is required.";
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!["staff", "security", "guard", "student", "teacher", "admin", "visitor"].includes(normalizedRole)) {
      nextErrors.role = "Select a valid role.";
    }
    const isEditingSecurity = isSecurityRole(normalizedRole);
    if (isEditingSecurity && !String(editUserData.phone || "").trim()) {
      nextErrors.phone = "Contact number is required.";
    } else if (String(editUserData.phone || "").trim() && !isValidPhilippineMobileNumber(editUserData.phone)) {
      nextErrors.phone = PHILIPPINE_MOBILE_NUMBER_MESSAGE;
    }
    if (normalizedRole === "staff" && !String(editUserData.department || "").trim()) {
      nextErrors.department = "Department is required for staff accounts.";
    }
    if ((isEditingStudent || isEditingTeacher) && !academicId) {
      nextErrors[isEditingTeacher ? "teacherId" : "studentId"] = isEditingTeacher
        ? "Academic staff ID is required."
        : "Student ID is required.";
    }
    if (isEditingStudent && normalizedParentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedParentEmail)) {
      nextErrors.parentEmail = "Enter a valid parent or guardian email address.";
    }
    if (!["active", "inactive", "pending", "suspended"].includes(String(editUserData.status || "").toLowerCase())) {
      nextErrors.status = "Select a valid account status.";
    }

    const duplicateEmail = allUsers.find(
      (userItem) =>
        String(userItem?._id || userItem?.id) !== String(selectedId) &&
        String(userItem?.email || "").trim().toLowerCase() === normalizedEmail,
    );
    if (duplicateEmail) nextErrors.email = "This email address is already registered.";

    if (normalizedUsername) {
      const duplicateUsername = allUsers.find(
        (userItem) =>
          String(userItem?._id || userItem?.id) !== String(selectedId) &&
          normalizeUsernameInput(userItem?.username) === normalizedUsername,
      );
      if (duplicateUsername) nextErrors.username = "This username is already in use.";
    }

    if (normalizedEmployeeId) {
      const duplicateEmployeeId = allUsers.find(
        (userItem) =>
          String(userItem?._id || userItem?.id) !== String(selectedId) &&
          String(userItem?.employeeId || "").trim().toLowerCase() === normalizedEmployeeId,
      );
      if (duplicateEmployeeId) nextErrors.employeeId = "This staff/security ID is already registered.";
    }

    if (normalizedNfcCardId) {
      const duplicateNfcCard = allUsers.find(
        (userItem) =>
          String(userItem?._id || userItem?.id) !== String(selectedId) &&
          normalizeAdminNfcCardUid(userItem?.physicalNfcUid || userItem?.nfcCardId) === normalizedNfcCardId,
      );
      if (duplicateNfcCard) nextErrors.nfcCardId = "This NFC card UID is already assigned.";
    }

    if (showErrors) setEditUserErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      errors: nextErrors,
      normalizedEmail,
      normalizedUsername,
      normalizedEmployeeId,
      normalizedNfcCardId,
      normalizedParentEmail,
    };
  };

  const editUserReadiness = useMemo(() => validateEditUserForm({ showErrors: false }), [editUserData, allUsers]);

  const renderEditUserFieldError = (fieldKey) =>
    editUserErrors[fieldKey] ? (
      <Text style={styles.formErrorText}>{editUserErrors[fieldKey]}</Text>
    ) : null;

  const renderStaffDropdown = ({
    target,
    label,
    value,
    options,
    placeholder,
    icon = "chevron-down-outline",
    onSelect,
  }) => {
    const dropdownKey = `${target}-${label}`;
    const isOpen = staffDropdownOpen === dropdownKey;
    const selectedOption = options.find((item) => item.value === value);

    return (
      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>{label}</Text>
        <TouchableOpacity
          style={[
            styles.staffDropdownTrigger,
            isDarkMode && { backgroundColor: "#334155", borderColor: "#475569" },
          ]}
          onPress={() => setStaffDropdownOpen(isOpen ? null : dropdownKey)}
          activeOpacity={0.85}
        >
          <View style={styles.staffDropdownValueWrap}>
            <Ionicons name={icon} size={16} color="#64748B" />
            <Text style={[styles.staffDropdownValue, isDarkMode && styles.darkText]}>
              {selectedOption?.label || placeholder}
            </Text>
          </View>
          <Ionicons name={isOpen ? "chevron-up-outline" : "chevron-down-outline"} size={18} color="#64748B" />
        </TouchableOpacity>

        {isOpen ? (
          <View
            style={[
              styles.staffDropdownMenu,
              isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
            ]}
          >
            {options.map((item) => {
              const isSelected = item.value === value;
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.staffDropdownOption,
                    isSelected && styles.staffDropdownOptionActive,
                    isDarkMode && !isSelected && { borderColor: theme.borderColor },
                  ]}
                  onPress={() => onSelect(item.value)}
                >
                  <View>
                    <Text
                      style={[
                        styles.staffDropdownOptionText,
                        isSelected && styles.staffDropdownOptionTextActive,
                        isDarkMode && !isSelected && styles.darkText,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.area ? (
                      <Text
                        style={[
                          styles.staffDropdownOptionMeta,
                          isSelected && styles.staffDropdownOptionMetaActive,
                          isDarkMode && !isSelected && styles.darkTextSecondary,
                        ]}
                      >
                        {item.area}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  // FIXED: Handle Create User
  const handleCreateUser = async () => {
    if (!ensureAdminAccess()) return;
    const {
      isValid,
      normalizedEmail,
      normalizedUsername,
      normalizedPhone,
      normalizedEmployeeId,
      normalizedStudentId,
      normalizedTeacherId,
      normalizedNfcCardId,
    } = validateCreateUserForm();
    if (!isValid) {
      Alert.alert("Validation Error", "Please review the highlighted fields before creating the account.");
      return;
    }

    setProcessingId("create-user");
    const normalizedCreateRole = String(newUserData.role || "").toLowerCase();
    const isAcademicStaffAccount = normalizedCreateRole === "teacher";

    try {
      const isSecurityAccount = isSecurityRole(newUserData.role);
      const isStudentAccount = normalizedCreateRole === "student";
      const isAcademicAccessAccount = isStudentAccount || isAcademicStaffAccount;
      
      const userPayload = {
        firstName: newUserData.firstName.trim(),
        lastName: newUserData.lastName.trim(),
        username: normalizedUsername || undefined,
        email: normalizedEmail,
        phone: normalizedPhone,
        role: newUserData.role,
        employeeId: normalizedEmployeeId,
        nfcCardId: normalizedNfcCardId || undefined,
        status: isAcademicAccessAccount ? "active" : "inactive",
        isActive: isAcademicAccessAccount,
      };

      if (isAcademicAccessAccount) {
        delete userPayload.employeeId;
        if (isAcademicStaffAccount) {
          userPayload.teacherId = normalizedTeacherId;
        } else {
          userPayload.studentId = normalizedStudentId;
        }
        userPayload.course = newUserData.course || "";
        userPayload.yearLevel = newUserData.yearLevel || "";
        userPayload.section = newUserData.section || "";
        if (isStudentAccount) {
          userPayload.parentName = newUserData.parentName || "";
          userPayload.parentEmail = newUserData.parentEmail || "";
        }
      } else if (newUserData.role === "staff") {
        userPayload.department = newUserData.department || "General";
        userPayload.position = newUserData.position || "Staff Member";
      } else if (newUserData.role === "security" || newUserData.role === "guard") {
        userPayload.position = newUserData.position || "Security Personnel";
        userPayload.department = "Security Department";
        userPayload.shift = newUserData.shift || "";
      }

      const response = isSecurityAccount
        ? await ApiService.createSecurityGuard({
            firstName: userPayload.firstName,
            lastName: userPayload.lastName,
            email: userPayload.email,
            phone: userPayload.phone,
            employeeId: userPayload.employeeId,
            nfcCardId: userPayload.nfcCardId,
            position: userPayload.position,
            shift: userPayload.shift,
          })
        : isAcademicAccessAccount
          ? await ApiService.createAcademicAccessUser(userPayload)
          : await ApiService.createStaffUser(userPayload);

      if (response && (response.success || response.user)) {
        const roleDisplay = isSecurityAccount ? "SECURITY PERSONNEL" : isAcademicStaffAccount ? "ACADEMIC STAFF" : isStudentAccount ? "STUDENT" : "ADMIN SERVICES STAFF";
        const resolvedRole = isSecurityAccount ? "guard" : (response.user?.role || newUserData.role);
        const createdName = `${newUserData.firstName} ${newUserData.lastName}`.trim();
        
        const newUser = {
          ...userPayload,
          username: response.user?.username || userPayload.username,
          role: resolvedRole,
          status: response.user?.status || userPayload.status,
          isActive: response.user?.isActive ?? userPayload.isActive,
          _id: response.user?._id || response.user?.id || Date.now().toString(),
          createdAt: new Date().toISOString(),
          employeeId: response.user?.employeeId || userPayload.employeeId,
          studentId: response.user?.studentId || userPayload.studentId,
          teacherId: response.user?.teacherId || userPayload.teacherId,
          nfcCardId: response.user?.physicalNfcUid || response.user?.nfcCardId || userPayload.nfcCardId || "",
          physicalNfcUid: response.user?.physicalNfcUid || response.user?.nfcCardId || userPayload.nfcCardId || "",
        };
        
        setAllUsers(prev => [...prev, newUser]);
        
        if (newUserData.role === "staff") {
          setStaffUsers(prev => [...prev, newUser]);
        } else if (newUserData.role === "security" || newUserData.role === "guard") {
          setGuardUsers(prev => [...prev, newUser]);
        }
        
        setStats(prev => ({
          ...prev,
          totalUsers: prev.totalUsers + 1,
          totalStaff: newUserData.role === "staff" ? prev.totalStaff + 1 : prev.totalStaff,
          totalGuards: (newUserData.role === "security" || newUserData.role === "guard") ? prev.totalGuards + 1 : prev.totalGuards,
          activeUsers: prev.activeUsers,
        }));

        setShowAddUserModal(false);
        const emailDelivery = response.emailDelivery || {};
        const deliveryNote = emailDelivery.delivered
          ? isAcademicAccessAccount
            ? `Temporary login credentials were sent to ${normalizedEmail}.`
            : `A secure activation and password setup link has been sent to ${normalizedEmail}.`
          : emailDelivery.simulated
            ? isAcademicAccessAccount
              ? `Account created. Email was simulated, so use the temporary password shown here for first login.`
              : `Account created. Activation email was simulated by the backend, so check the backend logs for the setup link.`
          : `Account created, but the activation email could not be sent. Check the backend mail logs before giving this account to the user.`;
        const createdAccountId =
          response.user?.teacherId ||
          response.user?.studentId ||
          response.user?.employeeId ||
          userPayload.teacherId ||
          userPayload.studentId ||
          userPayload.employeeId;
        const createdNfcCardId = response.user?.physicalNfcUid || response.user?.nfcCardId || userPayload.nfcCardId || "";

        setCreatedUserSummary({
          name: createdName,
          email: normalizedEmail,
          username: newUser.username || "N/A",
          role: roleDisplay,
          employeeId: createdAccountId,
          nfcCardId: createdNfcCardId,
          idLabel: isAcademicStaffAccount ? "Academic Staff ID" : isStudentAccount ? "Student ID" : "Employee ID",
          status: response.user?.status || (isAcademicAccessAccount ? "Active" : "Pending activation"),
          deliveryNote,
        });
        setShowCreateSuccessModal(true);
        setCreateUserErrors({});
        publishAdminNotice(
          "success",
          `${isSecurityAccount ? "Security" : isAcademicStaffAccount ? "Academic staff" : isStudentAccount ? "Student" : "Admin services staff"} account created`,
          `${createdName} was created successfully and can now log in.`,
        );
      } else {
        Alert.alert("Error", response?.message || response?.error || "Failed to create account");
      }
    } catch (error) {
      console.error("Create user error:", error);
      publishAdminNotice("error", "Account creation failed", error?.message || "Unable to create the selected account.");
      const message = String(error?.message || "");
      if (message.toLowerCase().includes("email already")) {
        setCreateUserErrors((currentValue) => ({ ...currentValue, email: "This email address is already registered." }));
        Alert.alert("Email Already Used", "This email is already registered. Please use another email address.");
      } else if (message.toLowerCase().includes("username already")) {
        setCreateUserErrors((currentValue) => ({ ...currentValue, username: "This username is already in use." }));
        Alert.alert("Username Already Used", "This username is already registered. Please use another username.");
      } else if (message.toLowerCase().includes("staff id already") || message.toLowerCase().includes("staff/security number")) {
        setCreateUserErrors((currentValue) => ({ ...currentValue, employeeId: "This Staff/Security number is already registered." }));
        Alert.alert("ID Already Used", "This Staff/Security number is already registered. Please use another ID.");
      } else if (message.toLowerCase().includes("academic id") || message.toLowerCase().includes("student id") || message.toLowerCase().includes("teacher id")) {
        setCreateUserErrors((currentValue) => ({
          ...currentValue,
          [isAcademicStaffAccount ? "teacherId" : "studentId"]: "This academic ID is already registered.",
        }));
        Alert.alert("ID Already Used", "This academic ID is already registered. Please use another ID.");
      } else if (message.toLowerCase().includes("nfc card") || message.toLowerCase().includes("card uid")) {
        setCreateUserErrors((currentValue) => ({ ...currentValue, nfcCardId: "This NFC card UID is already assigned." }));
        Alert.alert("NFC UID Already Used", "This NFC card UID is already assigned. Please use another card.");
      } else {
        Alert.alert("Error", message || "Failed to create account");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const populateEditUserData = (userItem) => {
    const editableUserId = getId(userItem) || userItem?._id || userItem?.id || "";
    setEditUserErrors({});
    setEditUserData({
      id: editableUserId,
      firstName: userItem.firstName || "",
      lastName: userItem.lastName || "",
      username: userItem.username || "",
      email: userItem.email || "",
      phone: userItem.phone || "",
      role: userItem.role || "staff",
      department: userItem.department || "",
      employeeId: userItem.employeeId || "",
      teacherId: userItem.teacherId || "",
      shift: userItem.shift || "",
      position: userItem.position || "",
      studentId: userItem.studentId || "",
      course: userItem.course || "",
      yearLevel: userItem.yearLevel || "",
      section: userItem.section || "",
      parentName: userItem.parentName || userItem.guardianName || "",
      parentEmail: userItem.parentEmail || userItem.guardianEmail || "",
      nfcCardId: userItem.physicalNfcUid || userItem.nfcCardId || "",
      status: isUserActive(userItem) ? "active" : "inactive",
      isActive: isUserActive(userItem),
    });
  };

  const openUserDataViewPanel = (userItem) => {
    setSelectedUser(userItem);
    setEditUserErrors({});
    setUserDataPanelMode(null);
    setShowViewUserModal(true);
    setShowEditUserModal(false);
  };

  const openUserDataEditPanel = (userItem) => {
    setSelectedUser(userItem);
    setLastUserSavedAt(null);
    populateEditUserData(userItem);
    setUserDataPanelMode(null);
    setShowViewUserModal(false);
    setShowEditUserModal(true);
  };

  const handleEditUser = (userItem) => {
    if (selectedSubmodule !== "data-management") {
      handleViewUser(userItem);
      publishAdminNotice(
        "info",
        "Account records are view-only",
        "Open User Data Management to edit account details.",
      );
      return;
    }

    openUserDataEditPanel(userItem);
  };

  const handleViewUser = (userItem) => {
    if (selectedSubmodule === "data-management") {
      openUserDataViewPanel(userItem);
      return;
    }
    setSelectedUser(userItem);
    setShowViewUserModal(true);
  };

  const handleCloseCreateSuccessModal = async () => {
    const createdName = createdUserSummary?.name || "New user";
    const createdRole = String(createdUserSummary?.role || newUserData.role || "staff").toLowerCase();
    const nextAccountMode = isSecurityRole(createdRole)
      ? "security"
      : createdRole === "staff"
        ? "staff"
        : "all";
    setShowCreateSuccessModal(false);
    setCreatedUserSummary(null);
    resetCreateUserForm("staff");
    await loadDashboardData();
    selectAdminSubmodule("account-records", { accountMode: nextAccountMode });
    setUserFilter("all");
    setUserSearchQuery("");
    setCurrentPage(1);
    setUserManagementStatusTab("active");
    setCreateUserMessage(`${createdName} was added successfully.`);
  };

  // FIXED: Confirm Edit User
  const confirmEditUser = async () => {
    if (!ensureAdminAccess()) return;
    const selectedId = editUserData.id || getId(selectedUser);
    if (!selectedId) {
      Alert.alert("Cannot Save", "This user record is missing an account ID. Please refresh and try again.");
      return;
    }

    const {
      isValid,
      normalizedEmail,
      normalizedUsername,
      normalizedEmployeeId,
      normalizedNfcCardId,
    } = validateEditUserForm();
    const isEditingSecurity = isSecurityRole(editUserData.role);
    const isEditingStudent = String(editUserData.role || "").toLowerCase() === "student";
    const previousParentEmail = String(selectedUser?.parentEmail || selectedUser?.guardianEmail || "")
      .trim()
      .toLowerCase();

    if (!isValid) {
      Alert.alert("Validation Error", "Please review the highlighted fields before saving changes.");
      return;
    }

    const duplicateEmail = allUsers.find(
      (userItem) =>
        String(userItem?._id || userItem?.id) !== String(selectedId) &&
        String(userItem?.email || "").trim().toLowerCase() === normalizedEmail,
    );
    if (duplicateEmail) {
      Alert.alert("Email Already Used", "This email is already registered. Please use another email address.");
      return;
    }

    if (normalizedUsername) {
      const duplicateUsername = allUsers.find(
        (userItem) =>
          String(userItem?._id || userItem?.id) !== String(selectedId) &&
          normalizeUsernameInput(userItem?.username) === normalizedUsername,
      );
      if (duplicateUsername) {
        Alert.alert("Username Already Used", "This username is already registered. Please use another username.");
        return;
      }
    }

    if (normalizedEmployeeId) {
      const duplicateEmployeeId = allUsers.find(
        (userItem) =>
          String(userItem?._id || userItem?.id) !== String(selectedId) &&
          String(userItem?.employeeId || "").trim().toLowerCase() === normalizedEmployeeId,
      );
      if (duplicateEmployeeId) {
        Alert.alert("Staff ID Already Used", "This staff/security ID is already registered.");
        return;
      }
    }

    if (!["active", "inactive", "pending", "suspended"].includes(String(editUserData.status || "").toLowerCase())) {
      Alert.alert("Invalid Status", "Please select a valid account status.");
      return;
    }

    setProcessingId("edit-user");
    try {
      const updatePayload = {
        firstName: editUserData.firstName,
        lastName: editUserData.lastName,
        username: normalizedUsername,
        email: normalizedEmail,
        phone: normalizePhilippineMobileNumber(editUserData.phone),
        role: editUserData.role,
        department: editUserData.department,
        position: editUserData.position,
        employeeId: editUserData.employeeId,
        nfcCardId: normalizedNfcCardId || "",
        status: editUserData.status,
        isActive: editUserData.status === "active",
      };

      if (isEditingStudent) {
        updatePayload.studentId = editUserData.studentId;
        updatePayload.course = editUserData.course;
        updatePayload.yearLevel = editUserData.yearLevel;
        updatePayload.section = editUserData.section;
        updatePayload.parentName = String(editUserData.parentName || "").trim();
        updatePayload.parentEmail = String(editUserData.parentEmail || "").trim().toLowerCase();
        updatePayload.guardianName = updatePayload.parentName;
        updatePayload.guardianEmail = updatePayload.parentEmail;
      }
      if (String(editUserData.role || "").toLowerCase() === "teacher") {
        updatePayload.teacherId = editUserData.teacherId;
        updatePayload.course = editUserData.course;
        updatePayload.yearLevel = editUserData.yearLevel;
        updatePayload.section = editUserData.section;
      }
      
      const response = await ApiService.updateUser(selectedId, updatePayload);
      if (response && (response.success || response.user)) {
        const savedUser = response.user || updatePayload;
        const normalizedSavedUser = isEditingStudent
          ? {
              ...savedUser,
              parentName: savedUser.parentName ?? savedUser.guardianName ?? updatePayload.parentName,
              parentEmail: savedUser.parentEmail ?? savedUser.guardianEmail ?? updatePayload.parentEmail,
              guardianName: savedUser.guardianName ?? savedUser.parentName ?? updatePayload.guardianName,
              guardianEmail: savedUser.guardianEmail ?? savedUser.parentEmail ?? updatePayload.guardianEmail,
            }
          : savedUser;
        const updatedUsers = allUsers.map(user => {
          const userId = getId(user) || user?._id || user?.id;
          if (String(userId) === String(selectedId)) {
            return { ...user, ...normalizedSavedUser };
          }
          return user;
        });

        const selectedUserId = getId(selectedUser) || selectedUser?._id || selectedUser?.id;
        const updatedSelectedUser = selectedUser && String(selectedUserId) === String(selectedId)
          ? { ...selectedUser, ...normalizedSavedUser }
          : selectedUser;
        
        setAllUsers(updatedUsers);
        setStaffUsers(updatedUsers.filter(u => u.role === "staff"));
        setGuardUsers(updatedUsers.filter(u => u.role === "security" || u.role === "guard"));
        setSelectedUser(updatedSelectedUser);
        setLastUserSavedAt(new Date());
        
        const savedParentEmail = String(normalizedSavedUser?.parentEmail || normalizedSavedUser?.guardianEmail || "")
          .trim()
          .toLowerCase();
        const parentEmailChanged = isEditingStudent && savedParentEmail && savedParentEmail !== previousParentEmail;
        const updateMessage = parentEmailChanged
          ? `Student details were saved. Parent email is now ${savedParentEmail}.`
          : `${editUserData.firstName} ${editUserData.lastName}'s account details were saved.`;

        publishAdminNotice("success", parentEmailChanged ? "Parent email updated" : "User updated", updateMessage);
        Alert.alert(parentEmailChanged ? "Parent Email Updated" : "Success", updateMessage);
        setShowEditUserModal(false);
        if (userDataPanelMode === "edit") {
          setUserDataPanelMode("view");
        }
        await loadDashboardData();
      } else {
        Alert.alert("Error", response?.message || "Failed to update user");
      }
    } catch (error) {
      console.error("Update user error:", error);
      publishAdminNotice("error", "Update failed", error?.message || "Unable to update the selected user.");
      const message = String(error?.message || "");
      const field = error?.data?.field;
      if (field) {
        setEditUserErrors((currentValue) => ({
          ...currentValue,
          [field]: error?.data?.message || error?.message || "Please review this field.",
        }));
      }

      if (message.toLowerCase().includes("username already")) {
        Alert.alert("Username Already Used", "This username is already registered. Please use another username.");
      } else if (message.toLowerCase().includes("email already") || message.toLowerCase().includes("email is already") || message.toLowerCase().includes("email address")) {
        setEditUserErrors((currentValue) => ({ ...currentValue, email: "This email address is already registered." }));
        Alert.alert("Email Already Used", "This email is already registered. Please use another email address.");
      } else if (message.toLowerCase().includes("parent email") || message.toLowerCase().includes("guardian email")) {
        setEditUserErrors((currentValue) => ({ ...currentValue, parentEmail: "Enter a valid parent or guardian email address." }));
        Alert.alert("Parent Email Error", message || "Please enter a valid parent or guardian email address.");
      } else if (message.toLowerCase().includes("staff id already")) {
        Alert.alert("Staff ID Already Used", "This staff ID is already registered. Please use another staff ID.");
      } else if (message.toLowerCase().includes("nfc card") || message.toLowerCase().includes("card uid")) {
        setEditUserErrors((currentValue) => ({ ...currentValue, nfcCardId: "This NFC card UID is already assigned." }));
        Alert.alert("NFC UID Already Used", "This NFC card UID is already assigned. Please use another card.");
      } else {
        Alert.alert("Error", error.message || "Failed to update user");
      }
    } finally {
      setProcessingId(null);
    }
  };

  // FIXED: Handle Delete User
  const handleDeleteUser = async () => {
    if (!ensureAdminAccess()) return;
    if (selectedSubmodule !== "data-management") {
      Alert.alert("View Only", "Account Records are read-only. Open User Data Management to remove accounts.");
      return;
    }

    const selectedId = selectedUser?._id || selectedUser?.id;
    if (!selectedId) {
      Alert.alert("Error", "Cannot find user ID. Please refresh and try again.");
      return;
    }

    if (String(selectedId) === String(user?._id || user?.id)) {
      Alert.alert("Cannot Delete", "You cannot delete your own admin account.");
      return;
    }

    setProcessingId(`delete-user-${selectedId}`);
    try {
      const response = await ApiService.deleteUser(selectedId);
      if (response?.success) {
        const updatedUsers = allUsers.filter((entry) => entry._id !== selectedId && entry.id !== selectedId);

        setAllUsers(updatedUsers);
        setStaffUsers(updatedUsers.filter((entry) => entry.role === "staff"));
        setGuardUsers(updatedUsers.filter((entry) => entry.role === "security" || entry.role === "guard"));
        setStats((prev) => ({
          ...prev,
          totalUsers: updatedUsers.length,
          totalStaff: updatedUsers.filter((entry) => entry.role === "staff").length,
          totalGuards: updatedUsers.filter((entry) => entry.role === "security" || entry.role === "guard").length,
          activeUsers: updatedUsers.filter((entry) => entry.status === "active" || entry.isActive).length,
        }));

        publishAdminNotice(
          "success",
          "User deleted",
          `${selectedUser?.firstName || "The selected user"} was removed from the directory.`,
        );
        setShowDeleteUserModal(false);
        setShowViewUserModal(false);
        setShowEditUserModal(false);
        setSelectedUser(null);
        await loadDashboardData();
      } else {
        Alert.alert("Error", response?.message || "Failed to delete user");
      }
    } catch (error) {
      console.error("Delete user error:", error);
      publishAdminNotice("error", "Delete failed", error?.message || "Unable to delete the selected user.");
      Alert.alert("Error", error?.message || "Failed to delete user. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleUserStatus = async (userItem) => {
    if (!ensureAdminAccess()) return;

    const userId = userItem?._id || userItem?.id;
    if (!userId) {
      Alert.alert("Error", "Cannot find the selected user.");
      return;
    }

    const nextAction = isUserActive(userItem) ? "deactivate" : "activate";
    const nextStatusLabel = nextAction === "deactivate" ? "Deactivate" : "Activate";

    Alert.alert(
      `${nextStatusLabel} Account`,
      `${nextStatusLabel} ${userItem.firstName} ${userItem.lastName}'s account?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: nextStatusLabel,
          onPress: async () => {
            try {
              setProcessingId(`toggle-user-${userId}`);
              const response = nextAction === "deactivate"
                ? await ApiService.deactivateUser(userId)
                : await ApiService.activateUser(userId);

              if (response?.success) {
                const nextStatus = nextAction === "deactivate" ? "inactive" : "active";
                const savedUser = response.user || {};
                const updatedUsers = allUsers.map((entry) =>
                  (entry._id === userId || entry.id === userId)
                    ? { ...entry, ...savedUser, status: nextStatus, isActive: nextStatus === "active" }
                    : entry,
                );

                setAllUsers(updatedUsers);
                setStaffUsers(updatedUsers.filter((entry) => entry.role === "staff"));
                setGuardUsers(updatedUsers.filter((entry) => entry.role === "security" || entry.role === "guard"));
                setSelectedUser((currentValue) => {
                  if (!currentValue || (currentValue._id !== userId && currentValue.id !== userId)) return currentValue;
                  return { ...currentValue, ...savedUser, status: nextStatus, isActive: nextStatus === "active" };
                });
                setStats((prev) => ({
                  ...prev,
                  activeUsers: updatedUsers.filter((entry) => entry.status === "active" || entry.isActive).length,
                }));

                publishAdminNotice(
                  "success",
                  `User ${nextAction}d`,
                  `${userItem.firstName} ${userItem.lastName} is now ${nextStatus}.`,
                );
                await loadDashboardData();
              } else {
                Alert.alert("Error", response?.message || `Failed to ${nextAction} user`);
              }
            } catch (error) {
              console.error("Toggle user status error:", error);
              Alert.alert("Error", error?.message || `Failed to ${nextAction} user`);
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleThemeModeChange = (value) => {
    setIsDarkMode(value);
    setSettings((prev) => ({ ...prev, darkMode: value }));
    storageSetItem("isDarkMode", JSON.stringify(value));
    storageSetItem("darkModeEnabled", String(value));
  };

  const updateSetting = (key, value) => {
    if (key === "darkMode") {
      handleThemeModeChange(value);
      return;
    }
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    if (!ensureAdminAccess()) return;
    setIsSavingSettings(true);
    try {
      await storageSetItem("adminSettings", JSON.stringify(settings));
      const response = await ApiService.updateSystemSettings(settings);
      publishAdminNotice(
        "success",
        "Settings saved",
        response?.success ? "System settings were saved successfully." : "Settings were stored locally for this admin session.",
      );
      Alert.alert("Success", response?.success ? "Settings saved successfully!" : "Settings saved locally!");
    } catch (error) {
      console.error("Save settings error:", error);
      publishAdminNotice("error", "Settings save failed", "The latest settings could not be saved.");
      Alert.alert("Error", "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const refreshSystemHealth = async () => {
    if (!ensureAdminAccess()) return;
    setIsRunningSystemAction(true);
    try {
      const response = await ApiService.getSystemHealth();
      if (response?.success) {
        setSystemHealth(response.health || null);
        publishAdminNotice("success", "System health refreshed", "Database, API, and NFC service statuses are up to date.");
      } else {
        publishAdminNotice("error", "Health check failed", response?.message || "Unable to refresh system health.");
      }
    } catch (error) {
      console.error("System health error:", error);
      publishAdminNotice("error", "Health check failed", error?.message || "Unable to refresh system health.");
    } finally {
      setIsRunningSystemAction(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!ensureAdminAccess()) return;
    setIsRunningSystemAction(true);
    try {
      const response = await ApiService.createBackup();
      if (response?.success) {
        const backupSummary = {
          message: response.message || "Backup created successfully.",
          createdAt: new Date().toISOString(),
        };
        setLastBackupSummary(backupSummary);
        publishAdminNotice("success", "Backup created", backupSummary.message);
        Alert.alert("Backup Created", backupSummary.message);
      } else {
        publishAdminNotice("error", "Backup failed", response?.message || "Unable to create backup.");
      }
    } catch (error) {
      console.error("Create backup error:", error);
      publishAdminNotice("error", "Backup failed", error?.message || "Unable to create backup.");
      Alert.alert("Backup Failed", error?.message || "Unable to create backup.");
    } finally {
      setIsRunningSystemAction(false);
    }
  };

  const resetSettings = () => {
    Alert.alert("Reset Settings", "Are you sure you want to reset all settings to default?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          const defaultSettings = { ...DEFAULT_ADMIN_SETTINGS };
          setSettings(defaultSettings);
          setIsDarkMode(false);
          await storageSetItem("adminSettings", JSON.stringify(defaultSettings));
          await storageSetItem("isDarkMode", JSON.stringify(false));
          try {
            await ApiService.updateSystemSettings(defaultSettings);
          } catch (error) {
            console.error("Reset settings sync error:", error);
          }
          Alert.alert("Success", "Settings reset to default");
        },
      },
    ]);
  };

  const handleChangePassword = async () => {
    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    if (changePasswordData.newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    try {
      const response = await ApiService.changePassword({
        currentPassword: changePasswordData.currentPassword,
        newPassword: changePasswordData.newPassword,
      });
      if (response?.success) {
        Alert.alert("Success", "Password changed successfully!");
        setShowChangePasswordModal(false);
        setChangePasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        Alert.alert("Error", response?.message || "Failed to change password");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to change password");
    }
  };

  const clearSystemData = () => {
    Alert.alert("Clear Dashboard Cache", "This clears saved admin dashboard preferences on this device only. Accounts, visitors, and your login session will stay intact.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear Cache",
        style: "destructive",
        onPress: async () => {
          try {
            await storageMultiRemove([
              "adminSettings",
              "isDarkMode",
              ROOM_STORAGE_KEY,
              ROOM_POSITION_STORAGE_KEY,
              DATA_FIELDS_STORAGE_KEY,
            ]);
            setSettings(DEFAULT_ADMIN_SETTINGS);
            setIsDarkMode(false);
            setManagedRooms(MONITORING_MAP_OFFICES);
            setManagedRoomPositions(MONITORING_MAP_OFFICE_POSITIONS);
            setDataCollectionFields(DEFAULT_DATA_COLLECTION_FIELDS);
            resetRoomEditor("ground");
            resetFieldEditor();
            publishAdminNotice("success", "Dashboard cache cleared", "Local admin preferences and map customizations were reset.");
            Alert.alert("Success", "Dashboard cache has been cleared.");
          } catch (error) {
            Alert.alert("Error", "Failed to clear dashboard cache");
          }
        },
      },
    ]);
  };

  const handlePrintUsers = async () => {
    const users = getFilteredUsersList();
    if (users.length === 0) {
      Alert.alert("No Data", "There are no users to print.");
      return;
    }

    const getTitle = () => {
      switch (accountRecordsMode) {
        case "staff":
          return "Staff Members List";
        case "security":
          return "Security Personnel List";
        default:
          return "Users List";
      }
    };

    try {
      const generatedAt = new Date();
      const printedBy =
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.email ||
        "Admin User";
      await printUserList(users, getTitle(), accountRecordsMode, {
        printedBy,
        generatedAt,
      });
      publishAdminNotice("success", "Print view ready", `${users.length} account ${users.length === 1 ? "record" : "records"} sent to the browser print dialog.`);
    } catch (error) {
      console.error("Print error:", error);
      Alert.alert("Error", "Failed to generate print view. Please try again.");
    }
  };

  const buildRequestPrintRows = (requests) =>
    (requests || []).map((request) => ({
      visitor: request?.fullName || "Visitor",
      email: request?.email || "-",
      purpose: request?.purposeOfVisit || request?.visitType || "-",
      office: request?.assignedOffice || request?.host || "-",
      status: getStatusColor(getRequestStatus(request)).label,
      submitted: request?.createdAt ? formatDateTime(request.createdAt) : "-",
    }));

  const buildReportPrintRows = (records) =>
    (records || []).map((visitor) => ({
      visitor: visitor?.fullName || `${visitor?.firstName || ""} ${visitor?.lastName || ""}`.trim() || "Visitor",
      email: visitor?.email || "-",
      purpose: visitor?.purposeOfVisit || "-",
      office: visitor?.assignedOffice || visitor?.host || "-",
      status: getStatusColor(getRequestStatus(visitor)).label,
      visitDate: visitor?.visitDate ? formatDateTime(visitor.visitDate) : "-",
    }));

  const handlePrintRequests = async (title, requests, subtitle) => {
    const rows = buildRequestPrintRows(requests);
    if (rows.length === 0) {
      Alert.alert("No Data", "There are no records to print.");
      return;
    }

    try {
      const generatedAt = new Date();
      const printedBy =
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.email ||
        "Admin User";
      await printRecordsTable({
        title,
        subtitle,
        totalLabel: "requests",
        dialogTitle: title,
        printedBy,
        generatedAt,
        columns: [
          { key: "visitor", label: "Visitor" },
          { key: "email", label: "Email" },
          { key: "purpose", label: "Purpose" },
          { key: "office", label: "Office" },
          { key: "status", label: "Status" },
          { key: "submitted", label: "Submitted" },
        ],
        rows,
      });
      publishAdminNotice("success", "Print view ready", `${rows.length} ${rows.length === 1 ? "record" : "records"} sent to the browser print dialog.`);
    } catch (error) {
      console.error("Print request table error:", error);
      Alert.alert("Error", "Failed to generate the printable table.");
    }
  };

  const handlePrintReports = async (recordsToPrint = getFilteredHistory()) => {
    const rows = buildReportPrintRows(recordsToPrint);
    if (rows.length === 0) {
      Alert.alert("No Data", "There are no report rows to print.");
      return;
    }

    try {
      const generatedAt = new Date();
      const printedBy =
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.email ||
        "Admin User";
      await printRecordsTable({
        title: "Visitor Report Records",
        subtitle: "Generated from the report records table in the admin dashboard.",
        totalLabel: "report rows",
        dialogTitle: "Print Report Records",
        printedBy,
        generatedAt,
        columns: [
          { key: "visitor", label: "Visitor" },
          { key: "email", label: "Email" },
          { key: "purpose", label: "Purpose" },
          { key: "office", label: "Office" },
          { key: "status", label: "Status" },
          { key: "visitDate", label: "Visit Date" },
        ],
        rows,
      });
      publishAdminNotice("success", "Print view ready", `${rows.length} report ${rows.length === 1 ? "row" : "rows"} sent to the browser print dialog.`);
    } catch (error) {
      console.error("Print report table error:", error);
      Alert.alert("Error", "Failed to generate the printable report.");
    }
  };

  const handlePrintSecurityReports = async (recordsToPrint = securityReportRecords) => {
    if (!recordsToPrint.length) {
      Alert.alert("No Data", "There are no security reports to print.");
      return;
    }

    try {
      const generatedAt = new Date();
      const printedBy =
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.email ||
        "Admin User";
      await printRecordsTable({
        title: "Security Reports",
        subtitle: "Visitor incident reports submitted by security personnel.",
        totalLabel: "security reports",
        dialogTitle: "Print Security Reports",
        printedBy,
        generatedAt,
        columns: ["Visitor", "Email", "Reason", "Office", "Reporter", "Reported At", "Resolved"],
        rows: recordsToPrint.map((record) => [
          record.fullName || "Visitor",
          record.email || "-",
          record.reportReason || "-",
          record.assignedOffice || record.appointmentDepartment || record.host || "-",
          record.reporterName || "Security",
          formatDateTime(record.reportedAt || record.createdAt),
          record.resolved ? "Resolved" : "Open",
        ]),
      });
    } catch (error) {
      console.error("Print security reports error:", error);
      Alert.alert("Error", "Failed to generate the printable security reports.");
    }
  };

  const handlePrintAttendanceRecords = async (recordsToPrint = scopedAttendanceRecords) => {
    if (!recordsToPrint.length) {
      Alert.alert("No Data", "There are no attendance records to print.");
      return;
    }

    try {
      const generatedAt = new Date();
      const printedBy =
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.email ||
        "Admin User";
      const selectedScopeLabel =
        ATTENDANCE_SCOPE_OPTIONS.find((item) => item.key === attendanceScope)?.label || "Attendance";
      const dateRange = getAttendanceDateRange(attendanceDateShortcut);
      const rangeLabel = dateRange.dateFrom && dateRange.dateTo
        ? `${dateRange.dateFrom} to ${dateRange.dateTo}`
        : "All available dates";

      await printRecordsTable({
        title: `${selectedScopeLabel} Attendance Records`,
        subtitle: `Generated from Admin Attendance Records. Range: ${rangeLabel}. Search: ${attendanceSearchTerm || "None"}.`,
        totalLabel: "attendance rows",
        dialogTitle: "Print Attendance Records",
        printedBy,
        generatedAt,
        columns: [
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "date", label: "Date" },
          { key: "checkIn", label: "Check In" },
          { key: "checkOut", label: "Check Out" },
          { key: "status", label: "Status" },
          { key: "location", label: "Location" },
        ],
        rows: recordsToPrint.map((record) => ({
          name: record?.name || "Unnamed",
          type: titleCaseLabel(record?.userType),
          date: formatDateInputValue(record?.attendanceDate) || "-",
          checkIn: formatTime(record?.checkInTime),
          checkOut: formatTime(record?.checkOutTime),
          status: titleCaseLabel(record?.status),
          location: record?.location || record?.checkpointIn || "-",
        })),
      });
    } catch (error) {
      console.error("Print attendance records error:", error);
      Alert.alert("Error", "Failed to generate the printable attendance records.");
    }
  };

  const renderRecordListPrintButton = ({ label = "Print Records", color = "#1C6DD0", onPress, disabled = false }) => (
    <TouchableOpacity
      style={[
        styles.recordListPrintButton,
        { borderColor: `${color}33`, backgroundColor: `${color}12` },
        disabled && styles.recordListPrintButtonDisabled,
        isDarkMode && { backgroundColor: "#0F172A", borderColor: `${color}55` },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="print-outline" size={18} color={disabled ? "#94A3B8" : color} />
      <Text style={[styles.recordListPrintButtonText, { color: disabled ? "#94A3B8" : color }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderAdminTable = ({
    columns = [],
    rows = [],
    keyExtractor,
    emptyTitle = "No records found",
    emptySubtitle = "There is nothing to display in this table yet.",
    emptyIcon = "reader-outline",
    emptyActionLabel = "",
    onEmptyAction,
    minTableHeight,
  }) => {
    const availableTableWidth = Platform.OS === "web"
      ? Math.max(620, width - 340)
      : Math.max(320, width - 32);
    const fallbackColumnWidth = 132;
    const totalColumnWidth = columns.reduce(
      (total, column) => total + (column.width || fallbackColumnWidth),
      0,
    );
    const columnScale = totalColumnWidth > availableTableWidth
      ? availableTableWidth / totalColumnWidth
      : 1;
    const extraTableWidth = Math.max(0, availableTableWidth - totalColumnWidth);
    const totalGrowWeight = columns.reduce((total, column) => {
      if (column.grow === 0) return total;
      if (typeof column.grow === "number") return total + column.grow;
      return total + (column.key === "actions" ? 0.25 : 1);
    }, 0);
    const getColumnStyle = (column) => {
      const baseWidth = column.width || fallbackColumnWidth;
      const minimumWidth = column.minWidth || (column.key === "actions" ? 132 : 86);
      const growWeight =
        column.grow === 0
          ? 0
          : typeof column.grow === "number"
            ? column.grow
            : column.key === "actions"
              ? 0.25
              : 1;
      const extraWidth =
        extraTableWidth > 0 && totalGrowWeight > 0
          ? Math.floor((extraTableWidth * growWeight) / totalGrowWeight)
          : 0;
      const scaledWidth = Math.max(minimumWidth, Math.floor(baseWidth * columnScale) + extraWidth);

      return {
        width: scaledWidth,
        minWidth: scaledWidth,
      };
    };

    if (!rows.length) {
      return (
        <View style={[styles.emptyState, styles.userEmptyState, isDarkMode && { backgroundColor: "#0F172A" }]}>
          <Ionicons name={emptyIcon} size={56} color="#CBD5E1" />
          <Text style={[styles.emptyStateTitle, isDarkMode && styles.darkText]}>{emptyTitle}</Text>
          <Text style={[styles.emptyStateSubtitle, isDarkMode && styles.darkTextSecondary]}>{emptySubtitle}</Text>
          {onEmptyAction ? (
            <TouchableOpacity style={styles.emptyStateActionButton} onPress={onEmptyAction}>
              <Ionicons name="refresh-outline" size={15} color="#FFFFFF" />
              <Text style={styles.emptyStateActionText}>{emptyActionLabel || "Refresh"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          styles.adminTableScroll,
          minTableHeight ? { minHeight: minTableHeight } : null,
        ]}
        contentContainerStyle={[
          styles.adminTableScrollContent,
          minTableHeight ? { minHeight: minTableHeight } : null,
        ]}
      >
        <View
          style={[
            styles.adminTable,
            {
              width: availableTableWidth,
              minWidth: availableTableWidth,
              minHeight: minTableHeight || undefined,
            },
          ]}
        >
          <View style={[styles.adminTableHeaderRow, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
            {columns.map((column) => (
              <View key={column.key} style={[styles.adminTableCell, styles.adminTableHeaderCell, getColumnStyle(column)]}>
                <Text style={styles.adminTableHeaderText}>{column.label}</Text>
              </View>
            ))}
          </View>

          {rows.map((row, index) => (
            <View
              key={keyExtractor ? keyExtractor(row, index) : `${index}`}
              style={[
                styles.adminTableRow,
                {
                  backgroundColor: isDarkMode ? (index % 2 === 0 ? "#111827" : "#0F172A") : index % 2 === 0 ? "#FFFFFF" : "#F8FBFE",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              {columns.map((column) => (
                <View key={column.key} style={[styles.adminTableCell, getColumnStyle(column)]}>
                  {column.render ? (
                    column.render(row)
                  ) : (
                    <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                      {row?.[column.key] ?? "-"}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderRecordsSearchPanel = ({
    title = "Search",
    subtitle = "Type a specific keyword, name, office, purpose, or date, then press Search.",
    value,
    onChangeText,
    onApply,
    onClear,
    placeholder,
    accent = "#1C6DD0",
  }) => (
    <View style={[styles.recordsToolPanel, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
      <View style={styles.recordsToolHeader}>
        <View style={[styles.recordsToolIcon, { backgroundColor: `${accent}16` }]}>
          <Ionicons name="search-outline" size={18} color={accent} />
        </View>
        <View style={styles.recordsToolCopy}>
          <Text style={[styles.recordsToolTitle, isDarkMode && styles.darkText]}>{title}</Text>
          <Text style={[styles.recordsToolSubtitle, isDarkMode && styles.darkTextSecondary]}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.recordsSearchRow}>
        <View style={[styles.recordsSearchInputWrap, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}>
          <Ionicons name="create-outline" size={16} color={isDarkMode ? "#94A3B8" : "#64748B"} />
          <TextInput
            style={[styles.recordsSearchInput, isDarkMode && styles.darkText]}
            placeholder={placeholder}
            placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
            value={value}
            onChangeText={onChangeText}
            returnKeyType="search"
            onSubmitEditing={onApply}
          />
          {value ? (
            <TouchableOpacity onPress={onClear}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={[styles.recordsSearchButton, { backgroundColor: accent }]} onPress={onApply}>
          <Ionicons name="search-outline" size={16} color="#FFFFFF" />
          <Text style={styles.recordsSearchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRecordsFilterPanel = ({
    title = "Filter",
    subtitle = "Use quick shortcuts to narrow records faster.",
    filters = [],
    groups = null,
    activeValue,
    onSelect,
    accent = "#1C6DD0",
    onReset,
    footerContent = null,
    panelKey = "default",
  }) => (
    <View style={[styles.recordsToolPanel, styles.recordsFilterPanel, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
      <View style={styles.recordsToolHeader}>
        <View style={[styles.recordsToolIcon, { backgroundColor: `${accent}16` }]}>
          <Ionicons name="funnel-outline" size={18} color={accent} />
        </View>
        <View style={styles.recordsToolCopy}>
          <Text style={[styles.recordsToolTitle, isDarkMode && styles.darkText]}>{title}</Text>
          <Text style={[styles.recordsToolSubtitle, isDarkMode && styles.darkTextSecondary]}>{subtitle}</Text>
        </View>
        {onReset ? (
          <TouchableOpacity style={styles.recordsResetButton} onPress={onReset}>
            <Ionicons name="refresh-outline" size={14} color={accent} />
            <Text style={[styles.recordsResetButtonText, { color: accent }]}>Reset</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {(groups || [{ key: "default", label: null, filters, activeValue, onSelect }]).map((group) => {
        const sectionKey = `${panelKey}-${group.key}`;
        const isExpanded = !!expandedFilterSections[sectionKey];
        return (
          <View
            key={group.key}
            style={[
              styles.recordsFilterAccordion,
              isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
            ]}
          >
            <TouchableOpacity
              style={styles.recordsFilterAccordionHeader}
              onPress={() =>
                setExpandedFilterSections((current) => ({
                  ...current,
                  [sectionKey]: !current[sectionKey],
                }))
              }
              activeOpacity={0.85}
            >
              <Text style={[styles.recordsFilterGroupLabel, styles.recordsFilterAccordionLabel, isDarkMode && styles.darkTextSecondary]}>
                {group.label || "Filters"}
              </Text>
              <Ionicons
                name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
                size={16}
                color={group.accent || accent}
              />
            </TouchableOpacity>
            {isExpanded ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recordsFilterChips}>
                {group.filters.map((filterItem) => {
                  const isActive = group.activeValue === filterItem.key;
                  return (
                    <TouchableOpacity
                      key={filterItem.key}
                      style={[
                        styles.recordsFilterChip,
                        isActive && { backgroundColor: group.accent || accent, borderColor: group.accent || accent },
                        isDarkMode && !isActive && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
                      ]}
                      onPress={() => group.onSelect(filterItem.key)}
                      activeOpacity={0.85}
                    >
                      {filterItem.icon ? (
                        <Ionicons name={filterItem.icon} size={14} color={isActive ? "#FFFFFF" : group.accent || accent} />
                      ) : null}
                      <Text style={[styles.recordsFilterChipText, isActive && styles.recordsFilterChipTextActive, isDarkMode && !isActive && styles.darkTextSecondary]}>
                        {filterItem.label}{typeof filterItem.count === "number" ? ` (${filterItem.count})` : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        );
      })}

      {footerContent ? (
        <View
          style={[
            styles.recordsFilterAccordion,
            styles.recordsFilterFooter,
            isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
          ]}
        >
          <TouchableOpacity
            style={styles.recordsFilterAccordionHeader}
            onPress={() =>
              setExpandedFilterSections((current) => ({
                ...current,
                [`${panelKey}-date-range`]: !current[`${panelKey}-date-range`],
              }))
            }
            activeOpacity={0.85}
          >
            <Text style={[styles.recordsFilterGroupLabel, styles.recordsFilterAccordionLabel, isDarkMode && styles.darkTextSecondary]}>
              Exact Date Range
            </Text>
            <Ionicons
              name={expandedFilterSections[`${panelKey}-date-range`] ? "chevron-up-outline" : "chevron-down-outline"}
              size={16}
              color={accent}
            />
          </TouchableOpacity>
          {expandedFilterSections[`${panelKey}-date-range`] ? footerContent : null}
        </View>
      ) : null}
    </View>
  );

  const renderCompactPagination = ({
    currentPage,
    totalPages,
    itemCount,
    itemLabel,
    onPrevious,
    onNext,
  }) => (
    <View style={styles.userPaginationRow}>
      <Text style={[styles.userPaginationSummary, isDarkMode && styles.darkTextSecondary]}>
        Page {currentPage} of {totalPages} • {itemCount} {itemLabel}
      </Text>
      <View style={styles.userPaginationControls}>
        <TouchableOpacity
          style={[styles.userPaginationButton, currentPage === 1 && styles.userPaginationButtonDisabled]}
          onPress={onPrevious}
          disabled={currentPage === 1}
        >
          <Ionicons
            name="chevron-back-outline"
            size={14}
            color={currentPage === 1 ? "#94A3B8" : "#334155"}
          />
          <Text
            style={[
              styles.userPaginationButtonText,
              currentPage === 1 && styles.userPaginationButtonTextDisabled,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.userPaginationButton, currentPage === totalPages && styles.userPaginationButtonDisabled]}
          onPress={onNext}
          disabled={currentPage === totalPages}
        >
          <Text
            style={[
              styles.userPaginationButtonText,
              currentPage === totalPages && styles.userPaginationButtonTextDisabled,
            ]}
          >
            Next
          </Text>
          <Ionicons
            name="chevron-forward-outline"
            size={14}
            color={currentPage === totalPages ? "#94A3B8" : "#334155"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleExactDateInputChange = (field, value) => {
    const nextDate = parseDateInputValue(value);
    if (!nextDate) return;

    if (field === "request-start") {
      setRequestDateRange((currentRange) => ({ ...currentRange, startDate: nextDate }));
    } else if (field === "request-end") {
      setRequestDateRange((currentRange) => ({ ...currentRange, endDate: nextDate }));
    } else if (field === "history-start") {
      setHistoryDateRange((currentRange) => ({ ...currentRange, startDate: nextDate }));
      setHistoryPage(1);
    } else if (field === "history-end") {
      setHistoryDateRange((currentRange) => ({ ...currentRange, endDate: nextDate }));
      setHistoryPage(1);
    }
  };

  const openExactDatePicker = (field, fallbackPicker) => {
    if (Platform.OS === "web" && field) {
      const input = exactDateInputRefs.current[field];
      if (input?.showPicker) {
        input.showPicker();
      } else if (input?.click) {
        input.click();
      } else if (input?.focus) {
        input.focus();
      }
      return;
    }

    fallbackPicker?.();
  };

  const renderDateRangeControls = ({
    accent = "#1C6DD0",
    startDate,
    endDate,
    onPickStart,
    onPickEnd,
    onClear,
    startField,
    endField,
  }) => (
    <View style={styles.recordsDateRangeWrap}>
      <Text style={[styles.recordsFilterGroupLabel, isDarkMode && styles.darkTextSecondary]}>
        Exact Date Range
      </Text>
      <View style={styles.recordsDateRangeRow}>
        <TouchableOpacity
          style={[
            styles.recordsDateButton,
            isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
          ]}
          onPress={() => openExactDatePicker(startField, onPickStart)}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar-outline" size={14} color={accent} />
          <Text style={[styles.recordsDateButtonText, isDarkMode && styles.darkText]}>
            {startDate ? formatFilterDateLabel(startDate) : "Start Date"}
          </Text>
          {Platform.OS === "web" && startField ? (
            <input
              ref={(element) => {
                exactDateInputRefs.current[startField] = element;
              }}
              type="date"
              value={formatDateInputValue(startDate)}
              onChange={(event) => handleExactDateInputChange(startField, event.target.value)}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                pointerEvents: "none",
              }}
              aria-label="Select start date"
              tabIndex={-1}
            />
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.recordsDateButton,
            isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
          ]}
          onPress={() => openExactDatePicker(endField, onPickEnd)}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar-clear-outline" size={14} color={accent} />
          <Text style={[styles.recordsDateButtonText, isDarkMode && styles.darkText]}>
            {endDate ? formatFilterDateLabel(endDate) : "End Date"}
          </Text>
          {Platform.OS === "web" && endField ? (
            <input
              ref={(element) => {
                exactDateInputRefs.current[endField] = element;
              }}
              type="date"
              value={formatDateInputValue(endDate)}
              onChange={(event) => handleExactDateInputChange(endField, event.target.value)}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                pointerEvents: "none",
              }}
              aria-label="Select end date"
              tabIndex={-1}
            />
          ) : null}
        </TouchableOpacity>
        {(startDate || endDate) ? (
          <TouchableOpacity style={styles.recordsDateClearButton} onPress={onClear} activeOpacity={0.85}>
            <Ionicons name="close-circle-outline" size={14} color={accent} />
            <Text style={[styles.recordsDateClearText, { color: accent }]}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderBarChart = (labels, data) => {
    const max = Math.max(...(data || [0]), 1);
    const chartColors = [ADMIN_BLUE, ADMIN_BLUE, ADMIN_BLUE, ADMIN_BLUE, ADMIN_BLUE, ADMIN_BLUE];
    return (
      <View style={styles.analyticsBarChart}>
        {(labels || []).map((label, index) => {
          const value = data?.[index] || 0;
          const percentage = value === 0 ? 0 : Math.max(8, Math.round((value / max) * 100));
          const barColor = chartColors[index % chartColors.length];
          return (
            <View key={`${label}-${index}`} style={styles.analyticsBarRow}>
              <View style={styles.analyticsBarMeta}>
                <Text style={[styles.analyticsBarLabel, { color: theme.textSecondary }]}>{label}</Text>
                <Text style={[styles.analyticsBarValue, { color: theme.textPrimary }]}>{value}</Text>
              </View>
              <View style={[styles.analyticsBarTrack, { backgroundColor: isDarkMode ? "#334155" : "#E2E8F0" }]}>
                <View
                  style={[
                    styles.analyticsBarFill,
                    {
                      width: `${percentage}%`,
                      backgroundColor: barColor,
                      opacity: value === 0 ? 0 : 1,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderMostVisitedOfficeChart = (items = []) => {
    const max = Math.max(
      1,
      ...items.flatMap((item) => [
        item.students || 0,
        item.visitors || 0,
        item.staff || 0,
      ]),
    );
    const groupConfig = [
      { key: "students", label: "Students", color: "#0A3D91" },
      { key: "visitors", label: "Visitors", color: "#F97316" },
      { key: "staff", label: "Staff", color: "#7C3AED" },
    ];

    if (!items.length) {
      return (
        <View style={styles.analyticsOfficeEmpty}>
          <Ionicons name="business-outline" size={30} color={theme.textSecondary} />
          <Text style={[styles.analyticsOfficeEmptyText, { color: theme.textSecondary }]}>
            Office visit analytics will appear after student, visitor, or staff taps are recorded.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.analyticsOfficeChart}>
        <View style={styles.analyticsOfficeYAxis}>
          {[max, Math.ceil(max * 0.75), Math.ceil(max * 0.5), Math.ceil(max * 0.25), 0].map((value, index) => (
            <Text key={`${value}-${index}`} style={[styles.analyticsOfficeAxisText, { color: theme.textSecondary }]}>
              {value}
            </Text>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analyticsOfficeBarsScroll}>
          {items.map((item) => (
            <View key={item.key} style={styles.analyticsOfficeGroup}>
              <View style={[styles.analyticsOfficeBarsArea, { borderBottomColor: theme.borderColor }]}>
                {groupConfig.map((group) => {
                  const value = item[group.key] || 0;
                  const heightPercent = value === 0 ? 0 : Math.max(8, Math.round((value / max) * 100));
                  return (
                    <View key={group.key} style={styles.analyticsOfficeBarWrap}>
                      <Text style={[styles.analyticsOfficeBarValue, { color: theme.textSecondary }]}>
                        {value || ""}
                      </Text>
                      <View
                        style={[
                          styles.analyticsOfficeBar,
                          {
                            height: `${heightPercent}%`,
                            minHeight: value > 0 ? 8 : 0,
                            backgroundColor: group.color,
                            opacity: value > 0 ? 1 : 0.16,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.analyticsOfficeLabel, { color: theme.textPrimary }]} numberOfLines={2}>
                {item.label}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const handleFilterDateSelection = (event, date) => {
    if (Platform.OS !== "ios") {
      setActiveFilterDateField(null);
    }

    if (!date || !activeFilterDateField) {
      return;
    }

    if (activeFilterDateField === "request-start") {
      setRequestDateRange((currentRange) => ({
        ...currentRange,
        startDate: date,
      }));
    } else if (activeFilterDateField === "request-end") {
      setRequestDateRange((currentRange) => ({
        ...currentRange,
        endDate: date,
      }));
    } else if (activeFilterDateField === "history-start") {
      setHistoryDateRange((currentRange) => ({
        ...currentRange,
        startDate: date,
      }));
      setHistoryPage(1);
    } else if (activeFilterDateField === "history-end") {
      setHistoryDateRange((currentRange) => ({
        ...currentRange,
        endDate: date,
      }));
      setHistoryPage(1);
    }
  };

  const renderRequestCard = (request) => {
    const id = getId(request) || `${request?.email || "request"}-${request?.visitDate || request?.createdAt || Date.now()}`;
    const statusInfo = getStatusColor(getRequestStatus(request));

    return (
      <TouchableOpacity
        key={id}
        activeOpacity={0.85}
        onPress={() => {
          setSelectedRequest(request);
          setShowRequestDetailsModal(true);
        }}
        style={[
          styles.dashboardRequestCard,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.borderColor,
          },
        ]}
      >
        <View style={styles.dashboardRequestCardTop}>
          <View style={styles.dashboardRequestCardInfo}>
            <Text style={[styles.dashboardRequestName, { color: theme.textPrimary }]}>
              {request?.fullName || "Unknown Visitor"}
            </Text>
            <Text style={[styles.dashboardRequestEmail, { color: theme.textSecondary }]}>
              {request?.email || "No email"}
            </Text>
            <Text style={[styles.dashboardRequestPurpose, { color: theme.textSecondary }]}>
              {request?.purposeOfVisit || "No purpose provided"}
            </Text>
            <Text style={[styles.dashboardRequestTime, { color: theme.textSecondary }]}>
              {formatDateTime(request?.visitDate || request?.createdAt)}
            </Text>
          </View>

          <View style={styles.dashboardRequestRight}>
            <View style={[styles.dashboardStatusBadge, { backgroundColor: statusInfo.bg }]}>
              <Text style={[styles.dashboardStatusText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
            </View>
            <Text style={[styles.dashboardRequestDate, { color: theme.textSecondary }]}>
              {formatDate(request?.createdAt)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAdminMapFilters = () => (
    <View
      style={[
        styles.adminMapFilters,
        {
          backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
          borderColor: theme.borderColor,
        },
      ]}
    >
      <Text style={[styles.adminMapFilterLabel, isDarkMode && styles.darkTextSecondary]}>Floor</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminMapFilterRow}>
        {ADMIN_MAP_FLOORS.map((floor) => {
          const isActive = selectedAdminMapFloor === floor.id;
          return (
            <TouchableOpacity
              key={floor.id}
              style={[
                styles.adminMapFilterChip,
                isActive && styles.adminMapFilterChipActive,
                isDarkMode && !isActive && { backgroundColor: "#111827", borderColor: theme.borderColor },
              ]}
              onPress={() => {
                setSelectedAdminMapFloor(floor.id);
                setSelectedAdminMapOffice("all");
              }}
            >
              <Text style={[styles.adminMapFilterChipText, isActive && styles.adminMapFilterChipTextActive]}>
                {floor.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[styles.adminMapFilterLabel, isDarkMode && styles.darkTextSecondary]}>Office</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminMapFilterRow}>
        <TouchableOpacity
          style={[
            styles.adminMapFilterChip,
            selectedAdminMapOffice === "all" && styles.adminMapFilterChipActive,
            isDarkMode && selectedAdminMapOffice !== "all" && { backgroundColor: "#111827", borderColor: theme.borderColor },
          ]}
          onPress={() => setSelectedAdminMapOffice("all")}
        >
          <Text
            style={[
              styles.adminMapFilterChipText,
              selectedAdminMapOffice === "all" && styles.adminMapFilterChipTextActive,
            ]}
          >
            All Offices
          </Text>
        </TouchableOpacity>
        {managedRooms.filter(
          (office) => normalizeMonitoringFloor(office.floor) === normalizeMonitoringFloor(selectedAdminMapFloor),
        ).map((office) => {
          const isActive = selectedAdminMapOffice === office.name;
          return (
            <TouchableOpacity
              key={office.id}
              style={[
                styles.adminMapFilterChip,
                isActive && styles.adminMapFilterChipActive,
                isDarkMode && !isActive && { backgroundColor: "#111827", borderColor: theme.borderColor },
              ]}
              onPress={() => setSelectedAdminMapOffice(office.name)}
            >
              <Text style={[styles.adminMapFilterChipText, isActive && styles.adminMapFilterChipTextActive]}>
                {office.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.adminMapLegend}>
        {adminMapLegendItems.map((item) => (
          <View key={item.label} style={styles.adminMapLegendItem}>
            <View style={[styles.adminMapLegendIcon, { backgroundColor: `${item.color}18` }]}>
              <Ionicons name={item.icon} size={12} color={item.color} />
            </View>
            <Text style={[styles.adminMapLegendText, isDarkMode && styles.darkTextSecondary]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderAdminMapOperationalStrip = () => (
    <View
      style={[
        styles.adminMapOpsStrip,
        {
          backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
          borderColor: theme.borderColor,
        },
      ]}
    >
      {[
        {
          label: "Last update",
          value: latestAdminMapActivityAt ? getMapFreshnessLabel(latestAdminMapActivityAt) : "Waiting",
          meta: latestAdminMapActivityAt ? formatDateTime(latestAdminMapActivityAt) : "No map sync yet",
          icon: "radio-outline",
        },
        {
          label: "Tracked now",
          value: visibleAdminMapVisitors.length,
          meta: `${monitoredMapVisitors.length} checked-in visitors`,
          icon: "location-outline",
        },
        {
          label: "Selected view",
          value: ADMIN_MAP_FLOORS.find((floor) => floor.id === selectedAdminMapFloor)?.name || "Floor",
          meta: selectedAdminMapOffice === "all" ? "All offices" : selectedAdminMapOffice,
          icon: "layers-outline",
        },
      ].map((item) => (
        <View key={item.label} style={styles.adminMapOpsItem}>
          <View style={styles.adminMapOpsIcon}>
            <Ionicons name={item.icon} size={16} color={ADMIN_BLUE} />
          </View>
          <View style={styles.adminMapOpsCopy}>
            <Text style={[styles.adminMapOpsLabel, isDarkMode && styles.darkTextSecondary]}>{item.label}</Text>
            <Text style={[styles.adminMapOpsValue, isDarkMode && styles.darkText]} numberOfLines={1}>
              {item.value}
            </Text>
            <Text style={[styles.adminMapOpsMeta, isDarkMode && styles.darkTextSecondary]} numberOfLines={1}>
              {item.meta}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderAdminMapEmptyState = ({ title, message, icon = "radio-outline" }) => (
    <View
      style={[
        styles.adminMapEmptyState,
        {
          backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
          borderColor: theme.borderColor,
        },
      ]}
    >
      <View style={styles.adminMapEmptyIcon}>
        <Ionicons name={icon} size={20} color={ADMIN_BLUE} />
      </View>
      <View style={styles.adminMapEmptyCopy}>
        <Text style={[styles.adminMapEmptyTitle, isDarkMode && styles.darkText]}>{title}</Text>
        <Text style={[styles.adminMapEmptyText, isDarkMode && styles.darkTextSecondary]}>{message}</Text>
      </View>
    </View>
  );

  const renderAdminMapActivityItem = (activity, index, keySuffix = "activity") => {
    const marker = visibleAdminMapVisitors[index];
    const filterKey = getAdminMapFilterKey(activity?.activityType);
    const tone =
      filterKey === "issues" ? "#EF4444" :
      filterKey === "movement" ? "#0A3D91" :
      filterKey === "requests" ? "#F59E0B" :
      "#10B981";

    return (
      <TouchableOpacity
        key={activity._id || `${activity.activityType}-${index}-${keySuffix}`}
        onPress={() => marker && setSelectedMapActivity(marker)}
        style={[
          styles.adminMapActivityItem,
          index === 0 && { borderTopWidth: 0 },
          index > 0 && { borderTopColor: theme.borderColor },
        ]}
      >
        <View style={styles.adminMapActivityItemTop}>
          <View style={[styles.adminMapActivityTone, { backgroundColor: `${tone}18` }]}>
            <Ionicons name={filterKey === "issues" ? "alert-circle-outline" : filterKey === "movement" ? "walk-outline" : "radio-outline"} size={14} color={tone} />
          </View>
          <View style={styles.adminMapActivityCopy}>
            <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "800", marginBottom: 3 }}>
              {getActivityLabel(activity.activityType)}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
              {activity.notes || activity.relatedVisitor?.fullName || "Recent system action"}
            </Text>
          </View>
        </View>
        <View style={styles.adminMapActivityMetaRow}>
          <Text style={[styles.adminMapActivityMeta, { color: theme.textSecondary }]}>
            SafePass ID: {getVisitorSafePassId(activity)}
          </Text>
          <Text style={[styles.adminMapActivityMeta, { color: theme.textSecondary }]}>
            NFC UID: {getVisitorNfcUid(activity)}
          </Text>
          <Text style={[styles.adminMapActivityMeta, { color: theme.textSecondary }]}>
            {getMapFreshnessLabel(activity.timestamp || activity.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAdminActivityFilters = () => (
    <View
      style={[
        styles.adminMapActivityFilterPanel,
        {
          backgroundColor: isDarkMode ? "#111827" : "#FFFFFF",
          borderColor: theme.borderColor,
        },
      ]}
    >
      <Text style={[styles.adminMapFilterLabel, isDarkMode && styles.darkTextSecondary]}>Activity Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminMapFilterRow}>
        {adminMapFilters.map((filterItem) => {
          const isActive = adminMapFilter === filterItem.key;
          return (
            <TouchableOpacity
              key={filterItem.key}
              style={[
                styles.adminMapFilterChip,
                isActive && styles.adminMapFilterChipActive,
                isDarkMode && !isActive && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
              ]}
              onPress={() => setAdminMapFilter(filterItem.key)}
            >
              <Text style={[styles.adminMapFilterChipText, isActive && styles.adminMapFilterChipTextActive]}>
                {filterItem.label} ({filterItem.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderAdminMonitoringDock = () => (
    <View
      style={[
        styles.adminMonitoringDock,
        {
          backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
          borderColor: theme.borderColor,
        },
      ]}
    >
      <View style={[styles.adminMonitoringDockHeader, { borderBottomColor: theme.borderColor }]}>
        <View>
          <Text style={[styles.adminMonitoringDockTitle, isDarkMode && styles.darkText]}>Campus Monitoring</Text>
          <Text style={[styles.adminMonitoringDockSubtitle, isDarkMode && styles.darkTextSecondary]}>
            Shared live map for approved visitors, check-ins, and admin actions.
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowAdminMapDock(false)} style={styles.adminMonitoringDockClose}>
          <Ionicons name="close" size={20} color={isDarkMode ? "#94A3B8" : "#6B7280"} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.adminMonitoringDockBody} showsVerticalScrollIndicator={false}>
        {renderAdminMapOperationalStrip()}
        <SharedMonitoringMap
          title="Live Monitoring Map"
          subtitle="Dashboard monitoring panel for admin and security."
          iconName="radio-outline"
          iconColor={ADMIN_BLUE}
          actionLabel="Expand"
          onActionPress={() => setShowAdminMapModal(true)}
          controls={renderAdminMapFilters()}
          visitors={visibleAdminMapVisitors}
          floors={ADMIN_MAP_FLOORS}
          offices={managedRooms}
          selectedFloor={selectedAdminMapFloor}
          selectedOffice={selectedAdminMapOffice}
          mapBlueprints={MONITORING_MAP_BLUEPRINTS}
          mapLabels={managedMapLabels}
          officePositions={managedRoomPositions}
          onFloorChange={(floorId) => {
            setSelectedAdminMapFloor(floorId);
            setSelectedAdminMapOffice("all");
          }}
          onVisitorHover={(item) => setHoveredMapVisitor(item)}
          onVisitorLeave={() => setHoveredMapVisitor(null)}
          onVisitorSelect={(item) => setSelectedMapActivity(item)}
          hoveredVisitor={hoveredMapVisitor}
          backgroundColor={isDarkMode ? "#0F172A" : "#F8FBFE"}
          borderColor={theme.borderColor}
          mapBackgroundColor={isDarkMode ? "#111827" : "#FFFFFF"}
          textPrimary={theme.textPrimary}
          textSecondary={theme.textSecondary}
          summaryItems={adminMapSummaryItems}
          statusLabel="Admin monitoring"
          showFloorNavigation={false}
        />

        <View style={[styles.adminMapSideCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="flash-outline" size={18} color="#1C6DD0" />
              <Text style={[styles.sectionTitle, isDarkMode && styles.darkText]}>Focus Activity</Text>
            </View>
          </View>

          {activeMapActivity ? (
            <View
              style={[
                styles.adminMapFocusCard,
                {
                  backgroundColor: isDarkMode ? "#111827" : "#FFFFFF",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 4 }}>
                {activeMapActivity.name}
              </Text>
              <Text style={{ color: "#1C6DD0", fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
                {activeMapActivity.eventLabel}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>
                {activeMapActivity.detail}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}>
                {getMapTrackingSourceLabel(activeMapActivity)} - {getMapFreshnessLabel(activeMapActivity.lastUpdate)}
              </Text>
              <View style={{ marginTop: 10, gap: 6 }}>
                {[
                  ["Phone", activeMapActivity.sourceVisitor?.phoneNumber || activeMapActivity.sourceVisitor?.phone || "No phone"],
                  ["Email", activeMapActivity.sourceVisitor?.email || "No email"],
                  ["Office", activeMapActivity.location?.office || activeMapActivity.sourceVisitor?.assignedOffice || "Campus"],
                  ["Schedule", activeMapActivity.sourceVisitor?.visitDate ? `${formatDate(activeMapActivity.sourceVisitor.visitDate)} ${activeMapActivity.sourceVisitor?.visitTime ? `at ${formatTime(activeMapActivity.sourceVisitor.visitTime)}` : ""}` : "No schedule"],
                  ["Checked In", activeMapActivity.sourceVisitor?.checkedInAt ? formatDateTime(activeMapActivity.sourceVisitor.checkedInAt) : formatDateTime(activeMapActivity.lastUpdate)],
                ].map(([label, value]) => (
                  <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: "700" }}>{label}</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 11, fontWeight: "700", flex: 1, textAlign: "right" }} numberOfLines={1}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            renderAdminMapEmptyState({
              title: "No marker selected",
              message: "Select a live visitor marker or activity row to inspect source, location, and freshness.",
              icon: "scan-outline",
            })
          )}

          {renderAdminActivityFilters()}

          <View style={styles.adminMapActivityList}>
            {filteredMapActivities.length > 0
              ? filteredMapActivities.slice(0, 6).map((activity, index) => renderAdminMapActivityItem(activity, index, "dock"))
              : renderAdminMapEmptyState({
                  title: "No activity in this filter",
                  message: "Map sync is running. Try All activity or refresh after a visitor check-in or request update.",
                  icon: "funnel-outline",
                })}
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const renderAdminMapWorkspace = () => (
    <View style={[styles.analyticsSplitGrid, width < 1200 && styles.analyticsSplitGridStack, { marginBottom: 14 }]}>
      <View style={styles.analyticsPrimaryColumn}>
        <View style={[styles.adminMapSection, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
          {renderAdminMapOperationalStrip()}
          <SharedMonitoringMap
            title="Live Monitoring Map"
            subtitle="Track approvals, appointment requests, and gate activity with the same shared monitoring map used by security."
            iconName="map-outline"
            iconColor={ADMIN_BLUE}
            actionLabel="Full Screen"
            onActionPress={() => setShowAdminMapModal(true)}
            controls={renderAdminMapFilters()}
            visitors={visibleAdminMapVisitors}
            floors={ADMIN_MAP_FLOORS}
            offices={managedRooms}
            selectedFloor={selectedAdminMapFloor}
            selectedOffice={selectedAdminMapOffice}
            mapBlueprints={MONITORING_MAP_BLUEPRINTS}
            mapLabels={managedMapLabels}
            officePositions={managedRoomPositions}
            onFloorChange={(floorId) => {
              setSelectedAdminMapFloor(floorId);
              setSelectedAdminMapOffice("all");
            }}
            onVisitorHover={(item) => setHoveredMapVisitor(item)}
            onVisitorLeave={() => setHoveredMapVisitor(null)}
            onVisitorSelect={(item) => setSelectedMapActivity(item)}
            hoveredVisitor={hoveredMapVisitor}
            backgroundColor={theme.cardBackground}
            borderColor={theme.borderColor}
            mapBackgroundColor={isDarkMode ? "#0F172A" : "#FFFFFF"}
            textPrimary={theme.textPrimary}
            textSecondary={theme.textSecondary}
            summaryItems={adminMapSummaryItems}
            statusLabel="Admin monitoring"
            showFloorNavigation={false}
            containerStyle={{ padding: 0, borderWidth: 0 }}
            mapWrapperStyle={styles.adminMapContainer}
          />
        </View>
      </View>

      <View style={styles.analyticsSideColumn}>
        <View style={[styles.adminMapSideCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="radio-outline" size={20} color="#1C6DD0" />
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Activity Monitor</Text>
            </View>
            <TouchableOpacity onPress={loadRecentActivities}>
              <Text style={styles.viewAll}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {renderAdminActivityFilters()}

          <View style={styles.adminMapSummaryGrid}>
            {[
              { label: "Requests", value: adminMapFilters.find((item) => item.key === "requests")?.count || 0, color: ADMIN_BLUE },
              { label: "Approvals", value: adminMapFilters.find((item) => item.key === "approvals")?.count || 0, color: ADMIN_BLUE },
              { label: "Movement", value: adminMapFilters.find((item) => item.key === "movement")?.count || 0, color: ADMIN_BLUE },
              { label: "Issues", value: adminMapFilters.find((item) => item.key === "issues")?.count || 0, color: ADMIN_BLUE },
            ].map((item) => (
              <View
                key={item.label}
                style={[
                  styles.adminMapSummaryCard,
                  {
                    backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <Text style={{ color: item.color, fontSize: 20, fontWeight: "800" }}>{item.value || 0}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 2 }}>{item.label}</Text>
              </View>
            ))}
          </View>

          {activeMapActivity ? (
            <View
              style={[
                styles.adminMapFocusCard,
                {
                  backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 4 }}>
                {activeMapActivity.name}
              </Text>
              <Text style={{ color: "#1C6DD0", fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
                {activeMapActivity.eventLabel}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>
                {activeMapActivity.detail}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}>
                {getMapTrackingSourceLabel(activeMapActivity)} - {getMapFreshnessLabel(activeMapActivity.lastUpdate)}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                {formatDateTime(activeMapActivity.lastUpdate)}
              </Text>
              <View style={{ marginTop: 10, gap: 6 }}>
                {[
                  ["Phone", activeMapActivity.sourceVisitor?.phoneNumber || activeMapActivity.sourceVisitor?.phone || "No phone"],
                  ["Email", activeMapActivity.sourceVisitor?.email || "No email"],
                  ["Office", activeMapActivity.location?.office || activeMapActivity.sourceVisitor?.assignedOffice || "Campus"],
                  ["Schedule", activeMapActivity.sourceVisitor?.visitDate ? `${formatDate(activeMapActivity.sourceVisitor.visitDate)} ${activeMapActivity.sourceVisitor?.visitTime ? `at ${formatTime(activeMapActivity.sourceVisitor.visitTime)}` : ""}` : "No schedule"],
                  ["Checked In", activeMapActivity.sourceVisitor?.checkedInAt ? formatDateTime(activeMapActivity.sourceVisitor.checkedInAt) : formatDateTime(activeMapActivity.lastUpdate)],
                ].map(([label, value]) => (
                  <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: "700" }}>{label}</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 11, fontWeight: "700", flex: 1, textAlign: "right" }} numberOfLines={1}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            renderAdminMapEmptyState({
              title: "Select a live marker",
              message: visibleAdminMapVisitors.length
                ? "Markers are available on the map. Select one to view location source and last update."
                : "No checked-in visitors match the current floor and office filters.",
              icon: "location-outline",
            })
          )}

          <View style={styles.adminMapActivityList}>
            {filteredMapActivities.length > 0
              ? filteredMapActivities.slice(0, 5).map((activity, index) => renderAdminMapActivityItem(activity, index))
              : renderAdminMapEmptyState({
                  title: "No live activity for this view",
                  message: "The selected activity type has no recent events. Switch filters or wait for the next map sync.",
                  icon: "radio-outline",
                })}
          </View>
        </View>
      </View>
    </View>
  );

  const renderAttendanceRecordsContent = () => {
    const dateRange = getAttendanceDateRange(attendanceDateShortcut);
    const selectedScopeLabel =
      ATTENDANCE_SCOPE_OPTIONS.find((item) => item.key === attendanceScope)?.label || "Attendance";

    return (
      <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.pageContainer}>
          <AdminSectionShell
            title="Attendance Records"
            subtitle="Review student and staff attendance from campus NFC taps. Search updates instantly by name, ID, date, or location."
            badge={`${scopedAttendanceRecords.length} visible`}
            isDarkMode={isDarkMode}
            theme={theme}
            actions={
              <>
                {renderRecordListPrintButton({
                  label: "Print Records",
                  color: ADMIN_BLUE,
                  disabled: attendanceLoading || scopedAttendanceRecords.length === 0,
                  onPress: () => handlePrintAttendanceRecords(scopedAttendanceRecords),
                })}
                <TouchableOpacity
                  style={styles.pageRefreshButton}
                  onPress={loadAttendanceRecords}
                  disabled={attendanceLoading}
                >
                  {attendanceLoading ? (
                    <ActivityIndicator size="small" color={ADMIN_BLUE} />
                  ) : (
                    <Ionicons name="refresh-outline" size={22} color={ADMIN_BLUE} />
                  )}
                </TouchableOpacity>
              </>
            }
          >
            {renderAdminRecordToolbar({
              searchTitle: "Search Attendance",
              searchValue: attendanceSearchTerm,
              onSearchChange: setAttendanceSearchTerm,
              searchPlaceholder: "Search name, ID, date, or location...",
              searchSubtitle: "Find attendance by student, staff member, ID, date, location, or status.",
              hasSearch: Boolean(attendanceSearchTerm),
              onClearSearch: () => setAttendanceSearchTerm(""),
              filterTitle: "Filters",
              filterSubtitle: "Narrow attendance records by person type and date range.",
              hasFilters: attendanceScope !== "all" || attendanceDateShortcut !== "today",
              onResetFilters: () => {
                setAttendanceScope("all");
                setAttendanceDateShortcut("today");
              },
              filterGroups: [
                {
                  label: "Person Type",
                  value: attendanceScope,
                  icon: "people-outline",
                  options: ATTENDANCE_SCOPE_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.key,
                  })),
                  onSelect: setAttendanceScope,
                },
                {
                  label: "Date Range",
                  value: attendanceDateShortcut,
                  icon: "calendar-outline",
                  options: ATTENDANCE_DATE_SHORTCUTS.map((option) => ({
                    label: option.label,
                    value: option.key,
                  })),
                  onSelect: setAttendanceDateShortcut,
                },
              ],
            })}

            <View style={styles.attendanceSummaryGrid}>
              {[
                { label: `${selectedScopeLabel} Records`, value: attendanceQuickSummary.total, icon: "list-outline", color: ADMIN_BLUE },
                { label: "Inside / Present", value: attendanceQuickSummary.inside, icon: "log-in-outline", color: "#10B981" },
                { label: "Late", value: attendanceQuickSummary.late, icon: "alert-circle-outline", color: "#F59E0B" },
                { label: "Checked Out", value: attendanceQuickSummary.completed, icon: "log-out-outline", color: "#64748B" },
              ].map((item) => (
                <View
                  key={item.label}
                  style={[
                    styles.attendanceSummaryCard,
                    {
                      backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                      borderColor: theme.borderColor,
                    },
                  ]}
                >
                  <View style={[styles.attendanceSummaryIcon, { backgroundColor: `${item.color}16` }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <Text style={[styles.attendanceSummaryValue, { color: theme.textPrimary }]}>{item.value}</Text>
                  <Text style={[styles.attendanceSummaryLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.attendanceRangeRow}>
              <Text style={[styles.attendanceRangeText, { color: theme.textSecondary }]}>
                Showing {dateRange.dateFrom && dateRange.dateTo ? `${dateRange.dateFrom} to ${dateRange.dateTo}` : "all available dates"}
              </Text>
              {attendanceSummary?.total ? (
                <Text style={[styles.attendanceRangeText, { color: theme.textSecondary }]}>
                  {attendanceSummary.total} loaded from server
                </Text>
              ) : null}
            </View>

            {attendanceLoading ? (
              <View style={[styles.modularEmptyState, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                <ActivityIndicator size="small" color={ADMIN_BLUE} />
                <Text style={[styles.modularEmptyStateText, isDarkMode && styles.darkTextSecondary]}>
                  Loading attendance records...
                </Text>
              </View>
            ) : scopedAttendanceRecords.length === 0 ? (
              <View style={[styles.modularEmptyState, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                <Ionicons name="calendar-clear-outline" size={24} color="#94A3B8" />
                <Text style={[styles.modularEmptyStateText, isDarkMode && styles.darkTextSecondary]}>
                  No attendance records match this filter.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.adminTableScroll}>
                <View style={[styles.adminTable, { minWidth: 920, backgroundColor: isDarkMode ? "#0F172A" : "#FFFFFF", borderColor: theme.borderColor }]}>
                  <View style={[styles.adminTableHeaderRow, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}>
                    {["Name", "Person Type", "Date", "Check In", "Check Out", "Status", "Location"].map((heading) => (
                      <View key={heading} style={[styles.adminTableCell, styles.adminTableHeaderCell, heading === "Name" ? { width: 210 } : styles.adminTableFlexCell]}>
                        <Text style={[styles.adminTableHeaderText, isDarkMode && styles.darkTextSecondary]}>{heading}</Text>
                      </View>
                    ))}
                  </View>

                  {scopedAttendanceRecords.slice(0, 120).map((record, index) => {
                    const statusColors = getAttendanceStatusColor(record?.status);
                    const recordKey = record?._id || `${record?.name}-${record?.attendanceDate}-${index}`;
                    return (
                      <View
                        key={recordKey}
                        style={[
                          styles.adminTableRow,
                          {
                            backgroundColor:
                              isDarkMode
                                ? index % 2 === 0
                                  ? "#0F172A"
                                  : "#111827"
                                : index % 2 === 0
                                  ? "#FFFFFF"
                                  : "#F8FBFE",
                            borderColor: theme.borderColor,
                          },
                        ]}
                      >
                        <View style={[styles.adminTableCell, { width: 210 }]}>
                          <Text style={[styles.adminTablePrimaryText, isDarkMode && styles.darkText]} numberOfLines={1}>
                            {record?.name || "Unnamed"}
                          </Text>
                          <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]} numberOfLines={1}>
                            {record?.nfcCardId || record?.sourceDeviceId || "No card ID"}
                          </Text>
                        </View>
                        <View style={[styles.adminTableCell, styles.adminTableFlexCell]}>
                          <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                            {titleCaseLabel(record?.userType)}
                          </Text>
                        </View>
                        <View style={[styles.adminTableCell, styles.adminTableFlexCell]}>
                          <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                            {formatDateInputValue(record?.attendanceDate) || "N/A"}
                          </Text>
                        </View>
                        <View style={[styles.adminTableCell, styles.adminTableFlexCell]}>
                          <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                            {formatTime(record?.checkInTime)}
                          </Text>
                        </View>
                        <View style={[styles.adminTableCell, styles.adminTableFlexCell]}>
                          <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                            {formatTime(record?.checkOutTime)}
                          </Text>
                        </View>
                        <View style={[styles.adminTableCell, styles.adminTableFlexCell]}>
                          <View style={[styles.statusBadge, { alignSelf: "flex-start", backgroundColor: statusColors.background }]}>
                            <Text style={[styles.statusText, { color: statusColors.text }]}>
                              {titleCaseLabel(record?.status)}
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.adminTableCell, styles.adminTableFlexCell]}>
                          <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]} numberOfLines={1}>
                            {record?.location || record?.checkpointIn || "No location"}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </AdminSectionShell>
        </View>
      </ScrollView>
    );
  };

  const renderDashboardContent = () => (
    <ScrollView
      style={styles.contentScrollView}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#1C6DD0"
          colors={["#1C6DD0"]}
          title="Refreshing dashboard..."
          titleColor="#1C6DD0"
        />
      }
    >
      <View style={styles.pageContainer}>
        <View
          style={[
            styles.dashboardOverviewPanel,
            {
              backgroundColor: theme.cardBackground,
              borderColor: dashboardLineColor,
            },
          ]}
        >
          <View style={styles.dashboardOverviewTop}>
            <View style={styles.dashboardOverviewTextBlock}>
              <Text style={styles.dashboardOverviewEyebrow}>Today at a glance</Text>
              <Text style={[styles.dashboardOverviewTitle, { color: theme.textPrimary }]}>
                {(pendingRequests.length || stats.pendingRequests || 0) > 0
                  ? `${pendingRequests.length || stats.pendingRequests || 0} request${(pendingRequests.length || stats.pendingRequests || 0) > 1 ? "s" : ""} need review`
                  : "Campus operations look clear"}
              </Text>
              <Text style={[styles.dashboardOverviewText, { color: theme.textSecondary }]}>
                Start with the items that need action. Full records stay organized in the sidebar modules.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.dashboardOverviewRefresh,
                {
                  backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                  borderColor: dashboardLineColor,
                },
              ]}
              onPress={loadDashboardData}
            >
              <Ionicons name="refresh-outline" size={18} color={ADMIN_BLUE} />
              <Text style={styles.dashboardOverviewRefreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.dashboardStatsGrid, styles.dashboardStatsGridCompact]}>
            {[
              { label: "Pending Requests", value: stats.pendingRequests || 0, icon: "time-outline", color: "#F59E0B" },
              { label: "Today Visits", value: stats.todayVisits || 0, icon: "calendar-outline", color: "#1C6DD0" },
              { label: "Live Visitors", value: monitoredMapVisitors.length || stats.activeVisitors || stats.checkedInVisitors || 0, icon: "locate-outline", color: "#10B981" },
            ].map((item) => (
              <HoverBubble
                key={item.label}
                hoverScale={1.035}
                style={[
                  styles.dashboardStatCard,
                  styles.dashboardStatCardCompact,
                  {
                    width: width > 760 ? "32%" : "100%",
                    backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                    borderColor: dashboardLineColor,
                  },
                ]}
              >
                <View style={styles.dashboardStatHeader}>
                  <Text style={[styles.dashboardStatLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                  <View style={[styles.dashboardStatIcon, { backgroundColor: `${item.color}16` }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                </View>
                <Text style={[styles.dashboardStatValue, { color: theme.textPrimary }]}>{item.value}</Text>
              </HoverBubble>
            ))}
          </View>
        </View>

        <View style={styles.dashboardSectionHeaderRow}>
          <View>
            <Text style={[styles.dashboardSectionHeading, { color: theme.textPrimary }]}>Priority actions</Text>
            <Text style={[styles.dashboardSectionSubtitle, { color: theme.textSecondary }]}>
              The tools admins usually need first.
            </Text>
          </View>
        </View>

        <View style={styles.quickActionsGrid}>
          {dashboardQuickActions.map((item) => (
            <HoverBubble
              key={item.key}
              hoverScale={1.055}
              style={[
                styles.quickActionCard,
                {
                  width: width > 1100 ? "24%" : width > 760 ? "48%" : "100%",
                  backgroundColor: theme.cardBackground,
                  borderColor: dashboardLineColor,
                },
              ]}
              onPress={() => handleMenuAction(item.action)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <View style={styles.quickActionContent}>
                <Text style={[styles.quickActionTitle, { color: theme.textPrimary }]}>{item.title}</Text>
                <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>{item.subtitle}</Text>
              </View>
              <View style={[styles.quickActionBadge, { backgroundColor: `${item.color}14` }]}>
                <Text style={[styles.quickActionBadgeText, { color: item.color }]}>{item.badge}</Text>
              </View>
            </HoverBubble>
          ))}
        </View>

        <View style={styles.dashboardSectionHeaderRow}>
          <View>
            <Text style={[styles.dashboardSectionHeading, { color: theme.textPrimary }]}>Analytics</Text>
            <Text style={[styles.dashboardSectionSubtitle, { color: theme.textSecondary }]}>
              A quick read of today's campus activity and account coverage.
            </Text>
          </View>
        </View>

        <View style={styles.dashboardStatsGrid}>
          {[
            { label: "Total Accounts", value: allUsers.length || stats.totalUsers || 0, icon: "people-outline", color: "#7C3AED" },
            { label: "Completed Visits", value: stats.completedVisits || 0, icon: "checkmark-done-outline", color: "#10B981" },
            { label: "Approved Requests", value: approvedRequests.length || 0, icon: "shield-checkmark-outline", color: ADMIN_BLUE },
            { label: "Security Reports", value: securityReportRecords.length || 0, icon: "document-text-outline", color: "#F59E0B" },
          ].map((item) => (
            <HoverBubble
              key={item.label}
              hoverScale={1.035}
              style={[
                styles.dashboardStatCard,
                styles.dashboardStatCardCompact,
                {
                  width: width > 1100 ? "24%" : width > 760 ? "48%" : "100%",
                  backgroundColor: theme.cardBackground,
                  borderColor: dashboardLineColor,
                },
              ]}
            >
              <View style={styles.dashboardStatHeader}>
                <Text style={[styles.dashboardStatLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                <View style={[styles.dashboardStatIcon, { backgroundColor: `${item.color}16` }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
              </View>
              <Text style={[styles.dashboardStatValue, { color: theme.textPrimary }]}>{item.value}</Text>
            </HoverBubble>
          ))}
        </View>

        <View style={styles.dashboardSectionHeaderRow}>
          <View>
            <Text style={[styles.dashboardSectionHeading, { color: theme.textPrimary }]}>Activity Monitoring</Text>
            <Text style={[styles.dashboardSectionSubtitle, { color: theme.textSecondary }]}>
              Monitor visitor movement, tap activity, and the campus map from the overview.
            </Text>
          </View>
        </View>

        {renderAdminMapWorkspace()}
      </View>
    </ScrollView>
  );

  const handleRoomDraftChange = (field, value) => {
    setRoomDraft((currentValue) => ({
      ...currentValue,
      [field]: value,
    }));
  };

  const resetRoomEditor = (floor = selectedMapModuleFloor) => {
    setEditingRoomId(null);
    setRoomDraft(createRoomDraft(floor));
  };

  const handleEditRoom = (room) => {
    setEditingRoomId(room.id);
    setRoomDraft({
      id: room.id,
      name: room.name,
      floor: room.floor,
      icon: room.icon || "business-outline",
      x: String(managedRoomPositions?.[room.id]?.x ?? 50),
      y: String(managedRoomPositions?.[room.id]?.y ?? 50),
    });
  };

  const persistSharedMapSettings = async (nextRooms, nextRoomPositions) => {
    await Promise.all([
      storageSetItem(ROOM_STORAGE_KEY, JSON.stringify(nextRooms)),
      storageSetItem(ROOM_POSITION_STORAGE_KEY, JSON.stringify(nextRoomPositions)),
    ]);

    try {
      await ApiService.updateAdminMapSettings({
        rooms: nextRooms,
        roomPositions: nextRoomPositions,
      });
      return true;
    } catch (error) {
      console.error("Shared map sync error:", error);
      publishAdminNotice(
        "warning",
        "Map saved locally",
        "The map changed on this device, but the shared visitor and security map could not sync yet.",
      );
      return false;
    }
  };

  const handleDeleteRoom = (room) => {
    Alert.alert(
      "Delete Room",
      `Remove ${room.name} from ${ADMIN_MODULE_FLOORS.find((floor) => floor.id === room.floor)?.name || "this floor"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const nextRooms = managedRooms.filter((item) => item.id !== room.id);
            const nextPositions = { ...managedRoomPositions };
            delete nextPositions[room.id];

            setManagedRooms(nextRooms);
            setManagedRoomPositions(nextPositions);
            if (editingRoomId === room.id) {
              resetRoomEditor(room.floor);
            }
            const synced = await persistSharedMapSettings(nextRooms, nextPositions);
            if (synced) {
              publishAdminNotice("success", "Room removed", `${room.name} was removed from the shared campus map.`);
            }
          },
        },
      ],
    );
  };

  const submitRoomDraft = async () => {
    if (!editingRoomId) {
      Alert.alert("Select a room", "Choose a room from the list first, then rename it.");
      return;
    }

    const trimmedName = roomDraft.name.trim();
    if (!trimmedName) {
      Alert.alert("Room name required", "Please enter a room name before saving.");
      return;
    }

    const nextX = Number(roomDraft.x);
    const nextY = Number(roomDraft.y);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || nextX < 0 || nextX > 100 || nextY < 0 || nextY > 100) {
      Alert.alert("Invalid coordinates", "Map X and Map Y must be numbers from 0 to 100.");
      return;
    }

    const currentRoom = managedRooms.find((room) => room.id === editingRoomId);
    if (!currentRoom) {
      Alert.alert("Room not found", "Please choose the room again before renaming it.");
      resetRoomEditor(selectedMapModuleFloor);
      return;
    }

    const roomId = currentRoom.id;
    const nextRoom = {
      ...currentRoom,
      name: trimmedName,
    };
    const roundedPosition = {
      x: Math.round(nextX * 10) / 10,
      y: Math.round(nextY * 10) / 10,
    };
    const nextRooms = managedRooms.map((room) => (room.id === roomId ? nextRoom : room));
    const nextPositions = {
      ...managedRoomPositions,
      [roomId]: roundedPosition,
    };

    setManagedRooms(nextRooms);
    setManagedRoomPositions(nextPositions);

    setSelectedAdminMapFloor(nextRoom.floor);
    setSelectedAdminMapOffice("all");
    setRoomDraft((currentDraft) => ({
      ...currentDraft,
      id: roomId,
      name: trimmedName,
      floor: nextRoom.floor,
      icon: nextRoom.icon || currentDraft.icon || "business-outline",
      x: String(roundedPosition.x),
      y: String(roundedPosition.y),
    }));

    const synced = await persistSharedMapSettings(nextRooms, nextPositions);
    if (synced) {
      publishAdminNotice(
        "success",
        "Room updated",
        `${currentRoom.name} is now ${trimmedName} at X ${roundedPosition.x}, Y ${roundedPosition.y}. Visitor and security maps will use this shared position.`,
      );
    }
  };

  const handleFieldDraftChange = (field, value) => {
    setFieldDraft((currentValue) => ({
      ...currentValue,
      [field]: value,
    }));
  };

  const resetFieldEditor = () => {
    setEditingFieldId(null);
    setFieldDraft(createFieldDraft());
  };

  const handleEditField = (field) => {
    setEditingFieldId(field.id);
    setFieldDraft({
      id: field.id,
      label: field.label,
      type: field.type || "text",
      required: !!field.required,
      enabled: field.enabled !== false,
      scope: field.scope || "visitor",
    });
  };

  const handleDeleteField = (field) => {
    Alert.alert(
      "Delete Field",
      `Remove ${field.label} from the data collection builder?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setDataCollectionFields((currentFields) =>
              currentFields.filter((item) => item.id !== field.id),
            );
            setDataManagementFieldPage(1);
            if (editingFieldId === field.id) {
              resetFieldEditor();
            }
          },
        },
      ],
    );
  };

  const submitFieldDraft = () => {
    const trimmedLabel = fieldDraft.label.trim();
    if (!trimmedLabel) {
      Alert.alert("Field label required", "Please enter a field label before saving.");
      return;
    }

    const fieldId = editingFieldId || normalizeTextToId(fieldDraft.id || trimmedLabel);
    const nextField = {
      id: fieldId,
      label: trimmedLabel,
      type: fieldDraft.type || "text",
      required: !!fieldDraft.required,
      enabled: fieldDraft.enabled !== false,
      scope: fieldDraft.scope || "visitor",
    };

    setDataCollectionFields((currentFields) => {
      const hasExistingField = currentFields.some((field) => field.id === fieldId);
      if (hasExistingField) {
        return currentFields.map((field) => (field.id === fieldId ? nextField : field));
      }
      return [...currentFields, nextField];
    });

    setDataManagementFieldPage(1);
    resetFieldEditor();
  };

  const renderAccountCreationContent = () => {
    const creationRole = String(newUserData.role || "staff").toLowerCase();
    const isCreatingSecurity = isSecurityRole(creationRole);
    const isCreatingStudent = creationRole === "student";
    const isCreatingAcademicStaff = creationRole === "teacher";
    const isCreatingAcademicAccess = isCreatingStudent || isCreatingAcademicStaff;
    const creationRoleColor = getRoleColor(creationRole);
    const creationRoleIcon = getRoleIcon(creationRole);
    const creationRoleLabel = isCreatingSecurity
      ? "Security"
      : isCreatingAcademicStaff
        ? "Academic Staff"
        : isCreatingStudent
          ? "Student"
          : "Admin Services Staff";
    const creationRoleInitials = isCreatingSecurity
      ? "SE"
      : isCreatingAcademicStaff
        ? "AS"
        : isCreatingStudent
          ? "ST"
          : "AD";
    const creationRecords = isCreatingSecurity
      ? guardUsers
      : allUsers.filter((item) => String(item?.role || "").toLowerCase() === creationRole);
    const accountCreationOptions = [
      {
        role: "student",
        title: "Create Student",
        label: "Student Account",
        meta: `${allUsers.filter((item) => String(item?.role || "").toLowerCase() === "student").length} existing students`,
        icon: "id-card-outline",
      },
      {
        role: "teacher",
        title: "Create Academic Staff",
        label: "Teacher Account",
        meta: `${allUsers.filter((item) => String(item?.role || "").toLowerCase() === "teacher").length} existing teachers`,
        icon: "school-outline",
      },
      {
        role: "staff",
        title: "Create Admin Services Staff",
        label: "Admin Services Staff",
        meta: `${staffUsers.length} existing staff`,
        icon: "briefcase-outline",
      },
      {
        role: "security",
        title: "Create Security",
        label: "Security Account",
        meta: `${guardUsers.length} existing guards`,
        icon: "shield-checkmark-outline",
      },
    ];

    return (
    <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.pageContainer}>
        <AdminSectionShell
          title="Creation of Account"
          subtitle="Admins can create student, academic staff, admin services staff, and security accounts here."
          badge="Admin only"
          isDarkMode={isDarkMode}
          theme={theme}
        >
          <View
            style={[
              styles.modularInfoPanel,
              {
                backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                borderColor: theme.borderColor,
                marginBottom: 16,
              },
            ]}
          >
            <Text style={[styles.modularInfoTitle, isDarkMode && styles.darkText]}>
              Choose account type
            </Text>
            <Text style={[styles.createUserHeroText, isDarkMode && styles.darkTextSecondary, { marginBottom: 14 }]}>
              Select the account you want to create. The form below will update for that user type.
            </Text>
            <View style={styles.managementQuickStatsRow}>
              {accountCreationOptions.map((item) => {
                const active = creationRole === item.role || (item.role === "security" && isCreatingSecurity);
                const color = getRoleColor(item.role);
                return (
                  <TouchableOpacity
                    key={item.role}
                    activeOpacity={0.88}
                    style={[
                      styles.managementQuickStatCard,
                      {
                        backgroundColor: isDarkMode ? "#111827" : "#FFFFFF",
                        borderColor: active ? color : theme.borderColor,
                        flex: 1,
                      },
                    ]}
                    onPress={() => switchCreateUserRole(item.role)}
                  >
                    <View style={[styles.managementQuickStatIcon, { backgroundColor: `${color}18` }]}>
                      <Ionicons name={item.icon} size={18} color={color} />
                    </View>
                    <Text style={[styles.managementQuickStatValue, { color }]}>{item.title}</Text>
                    <Text style={[styles.managementQuickStatLabel, isDarkMode && styles.darkTextSecondary]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.managementQuickStatMeta, isDarkMode && styles.darkTextSecondary]}>
                      {item.meta}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={styles.staffCreationLayout}>
            <View
              style={[
                styles.staffCreationFormCard,
                {
                  backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={[styles.createUserHero, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                <View style={[styles.userProfileAvatar, { backgroundColor: `${creationRoleColor}18` }]}>
                  <Text style={[styles.userProfileAvatarText, { color: creationRoleColor }]}>{creationRoleInitials}</Text>
                </View>
                <View style={styles.createUserHeroCopy}>
                  <Text style={[styles.createUserHeroTitle, isDarkMode && styles.darkText]}>
                    {creationRoleLabel} Account Setup
                  </Text>
                  <Text style={[styles.createUserHeroText, isDarkMode && styles.darkTextSecondary]}>
                    Fill in the {creationRoleLabel.toLowerCase()} credentials below. The account record will refresh after a successful save.
                  </Text>
                </View>
              </View>

              <View style={[styles.createUserPreviewCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                <View style={styles.createUserPreviewHeader}>
                  <Ionicons name="sparkles-outline" size={17} color={creationRoleColor} />
                  <Text style={[styles.createUserPreviewTitle, isDarkMode && styles.darkText]}>
                    Generated account details
                  </Text>
                </View>
                <View style={styles.adminMapSummaryGrid}>
                  {[
                    { label: "Email", value: createUserReadiness.email || "Enter first name", icon: "mail-outline" },
                    { label: createUserReadiness.idLabel, value: createUserReadiness.accountId || "Generating ID", icon: "card-outline" },
                    { label: "Activation", value: "Email link", icon: "lock-closed-outline" },
                  ].map((item) => (
                    <View
                      key={item.label}
                      style={[
                        styles.createUserPreviewInfoCard,
                        styles.userDataInfoCard,
                        isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor },
                      ]}
                    >
                      <Ionicons name={item.icon} size={16} color={creationRoleColor} />
                      <View style={styles.userDataInfoCopy}>
                        <Text style={styles.userProfileInfoLabel}>{item.label}</Text>
                        <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]} numberOfLines={1}>
                          {item.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
                {!createUserReadiness.isReady ? (
                  <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                    Complete: {createUserReadiness.issues.join(", ")}
                  </Text>
                ) : (
                  <Text style={[styles.inputHint, { color: creationRoleColor }]}>
                    Ready to create. The account will remain inactive until the secure email setup is completed.
                  </Text>
                )}
              </View>

              <View style={styles.userEditorSection}>
                <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Basic Information</Text>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>First Name *</Text>
                    <TextInput
                      style={[
                        styles.input,
                        createUserErrors.firstName && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={newUserData.firstName}
                      onChangeText={(text) => {
                        setNewUserData((currentValue) => ({ ...currentValue, firstName: text }));
                        setCreateUserErrors((currentValue) => ({ ...currentValue, firstName: null }));
                      }}
                      placeholder="Enter first name"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderCreateUserFieldError("firstName")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Last Name *</Text>
                    <TextInput
                      style={[
                        styles.input,
                        createUserErrors.lastName && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={newUserData.lastName}
                      onChangeText={(text) => {
                        setNewUserData((currentValue) => ({ ...currentValue, lastName: text }));
                        setCreateUserErrors((currentValue) => ({ ...currentValue, lastName: null }));
                      }}
                      placeholder="Enter last name"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderCreateUserFieldError("lastName")}
                  </View>
                </View>
              </View>

              <View style={styles.userEditorSection}>
                <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Account Credentials</Text>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Username</Text>
                    <TextInput
                      style={[
                        styles.input,
                        createUserErrors.username && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={newUserData.username}
                      onChangeText={(text) => {
                        setNewUserData((currentValue) => ({ ...currentValue, username: normalizeUsernameInput(text) }));
                        setCreateUserErrors((currentValue) => ({ ...currentValue, username: null }));
                      }}
                      placeholder="Choose a username"
                      autoCapitalize="none"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderCreateUserFieldError("username")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Email Address *</Text>
                    <TextInput
                      style={[
                        styles.input,
                        createUserErrors.email && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={newUserData.email}
                      onChangeText={(text) => {
                        setIsCreateEmailManuallyEdited(true);
                        setNewUserData((currentValue) => ({ ...currentValue, email: text }));
                        setCreateUserErrors((currentValue) => ({ ...currentValue, email: null }));
                      }}
                      placeholder={generatedCreateUserEmail || "staff@sapphire.edu"}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                      Auto-generated from first name and role. Admin can edit it when needed.
                    </Text>
                    {renderCreateUserFieldError("email")}
                  </View>
                </View>

                <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                  <Ionicons name="mail-outline" size={16} color="#0A3D91" />
                  <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                    A secure activation email will be sent. The user creates their password from that link before the account becomes active.
                  </Text>
                </View>
              </View>

              <View style={styles.userEditorSection}>
                <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>
                  {isCreatingAcademicAccess ? "Academic Details" : "Role & Department"}
                </Text>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                      {isCreatingAcademicStaff ? "Academic Staff ID *" : isCreatingStudent ? "Student ID *" : isCreatingSecurity ? "Security Number *" : "Staff Number *"}
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        (isCreatingAcademicStaff ? createUserErrors.teacherId : isCreatingStudent ? createUserErrors.studentId : createUserErrors.employeeId) && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={isCreatingAcademicStaff ? newUserData.teacherId : isCreatingStudent ? newUserData.studentId : newUserData.employeeId}
                      onChangeText={(text) => {
                        setIsCreateEmployeeIdManuallyEdited(true);
                        const idField = isCreatingAcademicStaff ? "teacherId" : isCreatingStudent ? "studentId" : "employeeId";
                        setNewUserData((currentValue) => ({ ...currentValue, [idField]: text }));
                        setCreateUserErrors((currentValue) => ({ ...currentValue, [idField]: null }));
                      }}
                      placeholder={generatedCreateUserEmployeeId || (isCreatingAcademicStaff ? "TCH-2026-001" : isCreatingStudent ? "STU-2026-001" : isCreatingSecurity ? "SEC-2026-001" : "STF-2026-001")}
                      autoCapitalize="characters"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                      Auto-generated and checked for duplicates. Admin can edit it when needed.
                    </Text>
                    {renderCreateUserFieldError(isCreatingAcademicStaff ? "teacherId" : isCreatingStudent ? "studentId" : "employeeId")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                      Contact Number
                    </Text>
                    {!isCreatingSecurity ? (
                      <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                        <Ionicons name="phone-portrait-outline" size={16} color="#64748B" />
                        <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                          User will add phone number during profile setup
                        </Text>
                      </View>
                    ) : (
                      <>
                        <TextInput
                          style={[
                            styles.input,
                            createUserErrors.phone && styles.inputErrorState,
                            isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                          ]}
                          value={newUserData.phone}
                          onChangeText={(text) => {
                            setNewUserData((currentValue) => ({ ...currentValue, phone: text }));
                            setCreateUserErrors((currentValue) => ({ ...currentValue, phone: null }));
                          }}
                          placeholder="09123456789"
                          keyboardType="phone-pad"
                          maxLength={16}
                          placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        />
                        <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                          Optional. Leave blank if the guard will add it after activation.
                        </Text>
                        {renderCreateUserFieldError("phone")}
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>NFC Card UID</Text>
                    <TextInput
                      style={[
                        styles.input,
                        createUserErrors.nfcCardId && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={newUserData.nfcCardId}
                      onChangeText={(text) => {
                        setNewUserData((currentValue) => ({ ...currentValue, nfcCardId: text }));
                        setCreateUserErrors((currentValue) => ({ ...currentValue, nfcCardId: null }));
                      }}
                      placeholder="Scan or type card UID, e.g. 04A1B2C3"
                      autoCapitalize="characters"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                      Optional. Use this when assigning the physical NFC card UID now.
                    </Text>
                    {renderCreateUserFieldError("nfcCardId")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Card Status</Text>
                    <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                      <Ionicons name="radio-outline" size={16} color="#64748B" />
                      <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                        {newUserData.nfcCardId ? "Physical UID will be linked" : "SafePass ID will be generated"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.userEditorGrid}>
                  {isCreatingAcademicAccess ? (
                    <>
                      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                          {isCreatingAcademicStaff ? "Teaching Subject / Area" : "Program"}
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                          ]}
                          value={newUserData.course}
                          onChangeText={(text) => setNewUserData((currentValue) => ({ ...currentValue, course: text }))}
                          placeholder={isCreatingAcademicStaff ? "Teaching subject or area" : "Program"}
                          placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        />
                      </View>
                      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                          {isCreatingAcademicStaff ? "Department / Grade Level" : "Year Level"}
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                          ]}
                          value={newUserData.yearLevel}
                          onChangeText={(text) => setNewUserData((currentValue) => ({ ...currentValue, yearLevel: text }))}
                          placeholder={isCreatingAcademicStaff ? "Department or teaching level" : "Year level"}
                          placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        />
                      </View>
                      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                          {isCreatingAcademicStaff ? "Assigned Section" : "Section"}
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                          ]}
                          value={newUserData.section}
                          onChangeText={(text) => setNewUserData((currentValue) => ({ ...currentValue, section: text }))}
                          placeholder="Section"
                          placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        />
                      </View>
                      {isCreatingStudent ? (
                        <>
                          <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                            <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Parent / Guardian Name (Enrollment Record)</Text>
                            <TextInput
                              style={[
                                styles.input,
                                isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                              ]}
                              value={newUserData.parentName}
                              onChangeText={(text) => setNewUserData((currentValue) => ({ ...currentValue, parentName: text }))}
                              placeholder="Parent or guardian name"
                              placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                            />
                          </View>
                          <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                            <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Parent Email (Enrollment Record)</Text>
                            <TextInput
                              style={[
                                styles.input,
                                createUserErrors.parentEmail && styles.inputErrorState,
                                isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                              ]}
                              value={newUserData.parentEmail}
                              onChangeText={(text) => {
                                setNewUserData((currentValue) => ({ ...currentValue, parentEmail: text }));
                                setCreateUserErrors((currentValue) => ({ ...currentValue, parentEmail: null }));
                              }}
                              placeholder="parent@example.com"
                              placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                              keyboardType="email-address"
                              autoCapitalize="none"
                            />
                            {renderCreateUserFieldError("parentEmail")}
                            <Text
                              style={{
                                color: isDarkMode ? "#94A3B8" : "#64748B",
                                fontSize: 12,
                                lineHeight: 17,
                                marginTop: 6,
                              }}
                            >
                              Official school-managed contact. Students can view this masked, but only admins can update it.
                            </Text>
                          </View>
                        </>
                      ) : null}
                    </>
                  ) : isCreatingSecurity ? (
                    <>
                      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Department</Text>
                        <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                          <Ionicons name="shield-checkmark-outline" size={16} color="#64748B" />
                          <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                            Security Department
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Position</Text>
                        <TextInput
                          style={[
                            styles.input,
                            isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                          ]}
                          value={newUserData.position}
                          onChangeText={(text) => setNewUserData((currentValue) => ({ ...currentValue, position: text }))}
                          placeholder="Security Personnel"
                          placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      {renderStaffDropdown({
                        target: "create",
                        label: "Department *",
                        value: newUserData.department,
                        options: STAFF_DEPARTMENT_OPTIONS,
                        placeholder: "Choose department",
                        icon: "business-outline",
                        onSelect: (department) => {
                          updateStaffDepartment("create", department);
                          setCreateUserErrors((currentValue) => ({ ...currentValue, department: null }));
                        },
                      })}
                      {renderStaffDropdown({
                        target: "create",
                        label: "Officer Type",
                        value: newUserData.position,
                        options: getStaffOfficerOptions(newUserData.department),
                        placeholder: "Choose officer type",
                        icon: "id-card-outline",
                        onSelect: (position) => {
                          updateStaffPosition("create", position);
                        },
                      })}
                    </>
                  )}
                </View>
                {renderCreateUserFieldError("department")}

              </View>

              <View style={styles.userEditorSection}>
                <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Account Status / Activation</Text>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Assigned Area</Text>
                    <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                      <Ionicons name="location-outline" size={16} color="#64748B" />
                      <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                        {isCreatingAcademicStaff
                          ? newUserData.course || "Teaching assignment"
                          : isCreatingStudent
                            ? newUserData.course || "Student program"
                            : isCreatingSecurity
                              ? "Security Post / Gate Operations"
                              : getStaffDepartmentOption(newUserData.department)?.area || "General Area"}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Initial Status</Text>
                    <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                      <Ionicons name="lock-closed-outline" size={16} color="#0A3D91" />
                      <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                        Pending activation by secure email link
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={[styles.modalFooter, styles.inlineCreateFooter, isDarkMode && { borderTopColor: theme.borderColor }]}>
                <TouchableOpacity
                  style={[styles.cancelButton, isDarkMode && { backgroundColor: "#334155" }]}
                  onPress={() => resetCreateUserForm(newUserData.role)}
                >
                  <Text style={[styles.cancelButtonText, isDarkMode && styles.darkTextSecondary]}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: creationRoleColor },
                    (!createUserReadiness.isReady || processingId === "create-user") && styles.submitButtonDisabled,
                  ]}
                  onPress={handleCreateUser}
                  disabled={!createUserReadiness.isReady || processingId === "create-user"}
                >
                  {processingId === "create-user" ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>Create {creationRoleLabel} Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.staffCreationAside}>
              <View
                style={[
                  styles.modularInfoPanel,
                  {
                    backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <Text style={[styles.modularInfoTitle, isDarkMode && styles.darkText]}>
                  {creationRoleLabel} account checklist
                </Text>
                <View style={styles.staffChecklist}>
                  {(isCreatingSecurity ? [
                    "Admin creates and assigns the security role automatically.",
                    "Email and security ID are checked for duplicates.",
                    "A secure activation link is emailed automatically.",
                    "Saved accounts appear immediately in Security Records.",
                  ] : isCreatingAcademicStaff ? [
                    "Admin creates the academic staff account.",
                    "Email and academic staff ID are checked for duplicates.",
                    "The teacher adds their phone number after activation.",
                    "Academic staff opens the student-style campus tap dashboard.",
                  ] : isCreatingStudent ? [
                    "Admin creates the student account.",
                    "Email and student ID are checked for duplicates.",
                    "The student adds their phone number after activation.",
                    "Student accounts use the virtual campus ID dashboard.",
                  ] : [
                    "Admin creates and assigns the admin services staff role automatically.",
                    "Email, username, and staff ID are checked for duplicates.",
                    "A secure activation link is emailed automatically.",
                    "Saved accounts appear immediately in Staff Records.",
                  ]).map((item) => (
                    <View key={item} style={styles.staffChecklistItem}>
                      <Ionicons name="checkmark-circle" size={18} color={creationRoleColor} />
                      <Text style={[styles.staffChecklistText, isDarkMode && styles.darkTextSecondary]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View
                style={[
                  styles.modularInfoPanel,
                  {
                    backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <Text style={[styles.modularInfoTitle, isDarkMode && styles.darkText]}>
                  Current {creationRoleLabel.toLowerCase()} records
                </Text>
                <View style={styles.modularInfoStats}>
                  {(isCreatingSecurity ? [
                    { label: "Security", value: guardUsers.length, color: ADMIN_BLUE },
                    { label: "Active", value: guardUsers.filter((item) => isUserActive(item)).length, color: ADMIN_BLUE },
                    { label: "Inactive", value: guardUsers.filter((item) => !isUserActive(item)).length, color: ADMIN_BLUE },
                  ] : isCreatingAcademicAccess ? [
                    { label: creationRoleLabel, value: creationRecords.length, color: creationRoleColor },
                    { label: "Active", value: creationRecords.filter((item) => isUserActive(item)).length, color: creationRoleColor },
                    { label: "Inactive", value: creationRecords.filter((item) => !isUserActive(item)).length, color: creationRoleColor },
                  ] : [
                    { label: "Staff", value: staffUsers.length, color: ADMIN_BLUE },
                    { label: "Active", value: staffUsers.filter((item) => isUserActive(item)).length, color: ADMIN_BLUE },
                    { label: "Inactive", value: staffUsers.filter((item) => !isUserActive(item)).length, color: ADMIN_BLUE },
                  ]).map((item) => (
                    <View
                      key={item.label}
                      style={[
                        styles.modularInfoStatCard,
                        {
                          backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                          borderColor: theme.borderColor,
                        },
                      ]}
                    >
                      <Text style={[styles.modularInfoStatValue, { color: item.color }]}>{item.value}</Text>
                      <Text style={[styles.modularInfoStatLabel, isDarkMode && styles.darkTextSecondary]}>
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.managementSecondaryButton, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}
                  onPress={() => selectAdminSubmodule("account-records", { accountMode: isCreatingSecurity ? "security" : isCreatingAcademicAccess ? "all" : "staff" })}
                >
                  <Ionicons name="reader-outline" size={18} color={creationRoleColor} />
                  <Text style={[styles.managementSecondaryButtonText, { color: creationRoleColor }]}>
                    Open {creationRoleLabel} Records
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </AdminSectionShell>
      </View>
    </ScrollView>
    );
  };

  const renderUserDataPanel = () => {
    return null;

    if (!userDataPanelMode || !selectedUser) return null;

    const isEditing = userDataPanelMode === "edit";
    const panelUser = isEditing ? editUserData : selectedUser;
    const roleColor = getRoleColor(panelUser?.role);
    const infoItems = [
      { label: "Username", value: selectedUser?.username || "Not set", icon: "person-outline" },
      { label: "Phone", value: selectedUser?.phone || "No phone number", icon: "call-outline" },
      {
        label:
          String(selectedUser?.role || "").toLowerCase() === "student"
            ? "Student ID"
            : String(selectedUser?.role || "").toLowerCase() === "teacher"
              ? "Academic Staff ID"
              : "Employee ID",
        value: selectedUser?.studentId || selectedUser?.teacherId || selectedUser?.employeeId || "Not assigned",
        icon: "card-outline",
      },
      { label: "Department", value: selectedUser?.department || "General", icon: "business-outline" },
      { label: "Position", value: selectedUser?.position || (isSecurityRole(selectedUser?.role) ? "Security Personnel" : "Not set"), icon: "briefcase-outline" },
      { label: "Status", value: isUserActive(selectedUser) ? "Active" : "Inactive", icon: "checkmark-circle-outline" },
    ];
    const isStudentUser = String(panelUser?.role || "").toLowerCase() === "student";
    if (isStudentUser) {
      infoItems.splice(3, 0,
        {
          label: "Parent / Guardian (Enrollment)",
          value: selectedUser?.parentName || selectedUser?.guardianName || "Not configured",
          icon: "people-outline",
        },
        {
          label: "Parent Email (Enrollment)",
          value: selectedUser?.parentEmail || selectedUser?.guardianEmail || "Not configured",
          icon: "mail-outline",
        },
      );
    }

    return (
      <View style={[styles.userDataBottomPanel, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
        <View style={styles.userDataPanelHeader}>
          <View style={styles.userDataPanelIdentity}>
            <View style={[styles.userProfileAvatar, styles.userDataPanelAvatar, { backgroundColor: `${roleColor}16` }]}>
              <Text style={[styles.userProfileAvatarText, { color: roleColor }]}>
                {getUserInitials(panelUser)}
              </Text>
            </View>
            <View style={styles.userDataPanelTitleBlock}>
              <Text style={[styles.userDataPanelTitle, isDarkMode && styles.darkText]}>
                {isEditing ? "Edit Account" : "Account Details"}
              </Text>
              <Text style={[styles.userDataPanelSubtitle, isDarkMode && styles.darkTextSecondary]}>
                {panelUser?.firstName || "User"} {panelUser?.lastName || ""} • {panelUser?.email || "No email"}
              </Text>
              <View style={styles.userProfileBadgeRow}>
                <View style={[styles.userProfileBadge, { backgroundColor: `${roleColor}14` }]}>
                  <Text style={[styles.userProfileBadgeText, { color: roleColor }]}>
                    {formatRoleLabel(panelUser?.role)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.userProfileBadge,
                    { backgroundColor: isUserActive(panelUser) ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)" },
                  ]}
                >
                  <Text
                    style={[
                      styles.userProfileBadgeText,
                      { color: isUserActive(panelUser) ? "#10B981" : "#EF4444" },
                    ]}
                  >
                    {isUserActive(panelUser) ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.userDataPanelActions}>
            {!isEditing ? (
              <TouchableOpacity style={styles.dataManagementPrimaryButton} onPress={() => openUserDataEditPanel(selectedUser)}>
                <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                <Text style={styles.dataManagementPrimaryButtonText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.dataManagementGhostButton, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}
              onPress={() => setUserDataPanelMode(null)}
            >
              <Ionicons name="close-outline" size={16} color="#0A3D91" />
              <Text style={styles.dataManagementGhostButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isEditing ? (
          <View style={styles.userDataEditGrid}>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>First Name</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.firstName}
                onChangeText={(text) => setEditUserData({ ...editUserData, firstName: text })}
                placeholder="First name"
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
              {renderEditUserFieldError("firstName")}
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Last Name</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.lastName}
                onChangeText={(text) => setEditUserData({ ...editUserData, lastName: text })}
                placeholder="Last name"
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
              {renderEditUserFieldError("lastName")}
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Username</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.username}
                onChangeText={(text) => setEditUserData({ ...editUserData, username: normalizeUsernameInput(text) })}
                placeholder="Username"
                autoCapitalize="none"
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
              {renderEditUserFieldError("username")}
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Email</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.email}
                onChangeText={(text) => setEditUserData({ ...editUserData, email: text })}
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
              {renderEditUserFieldError("email")}
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Phone</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.phone}
                onChangeText={(text) => setEditUserData({ ...editUserData, phone: text })}
                placeholder="09123456789"
                keyboardType="phone-pad"
                maxLength={16}
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
              {renderEditUserFieldError("phone")}
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Employee ID</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.employeeId}
                onChangeText={(text) => setEditUserData({ ...editUserData, employeeId: text })}
                placeholder="Staff / Security ID"
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
              {renderEditUserFieldError("employeeId")}
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Department</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.department}
                onChangeText={(text) => setEditUserData({ ...editUserData, department: text })}
                placeholder="Department"
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
              {renderEditUserFieldError("department")}
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Position</Text>
              <TextInput
                style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                value={editUserData.position}
                onChangeText={(text) => setEditUserData({ ...editUserData, position: text })}
                placeholder="Position"
                placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
              />
            </View>
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Role</Text>
              <View style={styles.userDataCompactOptions}>
                {["student", "teacher", "staff", "security", "admin", "visitor"].map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.userDataCompactOption,
                      editUserData.role === role && styles.userDataCompactOptionActive,
                    ]}
                    onPress={() => setEditUserData({ ...editUserData, role })}
                  >
                    <Text style={[styles.userDataCompactOptionText, editUserData.role === role && styles.userDataCompactOptionTextActive]}>
                      {formatRoleLabel(role)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {renderEditUserFieldError("role")}
            </View>
            {String(editUserData.role || "").toLowerCase() === "student" ? (
              <>
                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Student ID</Text>
                  <TextInput
                    style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                    value={editUserData.studentId}
                    onChangeText={(text) => setEditUserData({ ...editUserData, studentId: text })}
                    placeholder="Student ID"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                  />
                  {renderEditUserFieldError("studentId")}
                </View>
                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Parent Email</Text>
                  <TextInput
                    style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                    value={editUserData.parentEmail}
                    onChangeText={(text) => setEditUserData({ ...editUserData, parentEmail: text })}
                    placeholder="parent@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                  />
                  {renderEditUserFieldError("parentEmail")}
                </View>
              </>
            ) : null}
            {String(editUserData.role || "").toLowerCase() === "teacher" ? (
              <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Academic Staff ID</Text>
                <TextInput
                  style={[styles.input, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor, color: "#F8FBFE" }]}
                  value={editUserData.teacherId}
                  onChangeText={(text) => setEditUserData({ ...editUserData, teacherId: text })}
                  placeholder="Academic staff ID"
                  placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                />
                {renderEditUserFieldError("teacherId")}
              </View>
            ) : null}
            <View style={[styles.userEditorHalfField, styles.inputGroup]}>
              <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Status</Text>
              <View style={styles.userDataCompactOptions}>
                {["active", "inactive"].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.userDataCompactOption,
                      editUserData.status === status && styles.userDataCompactOptionActive,
                    ]}
                    onPress={() => setEditUserData({ ...editUserData, status, isActive: status === "active" })}
                  >
                    <Text style={[styles.userDataCompactOptionText, editUserData.status === status && styles.userDataCompactOptionTextActive]}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {renderEditUserFieldError("status")}
            </View>
            <View style={styles.userDataPanelFooter}>
              <TouchableOpacity
                style={[styles.dataManagementGhostButton, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}
                onPress={() => selectedUser && openUserDataViewPanel(selectedUser)}
              >
                <Ionicons name="arrow-back-outline" size={15} color="#0A3D91" />
                <Text style={styles.dataManagementGhostButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dataManagementPrimaryButton,
                  processingId === "edit-user" && styles.submitButtonDisabled,
                ]}
                onPress={confirmEditUser}
                disabled={processingId === "edit-user"}
              >
                <Ionicons name="save-outline" size={15} color="#FFFFFF" />
                <Text style={styles.dataManagementPrimaryButtonText}>
                  {processingId === "edit-user" ? "Saving..." : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.userDataInfoGrid}>
            {infoItems.map((item) => (
              <View key={item.label} style={[styles.userDataInfoCard, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}>
                <Ionicons name={item.icon} size={16} color="#0A3D91" />
                <View style={styles.userDataInfoCopy}>
                  <Text style={styles.userProfileInfoLabel}>{item.label}</Text>
                  <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                    {item.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderDataManagementContent = () => (
    <ScrollView
      ref={dataManagementScrollViewRef}
      style={styles.contentScrollView}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageContainer}>
        <AdminSectionShell
          title="User Data Management"
          subtitle="Select a user account first, then view or edit the details connected to that account."
          badge={`${dataManagementUsers.length} users`}
          isDarkMode={isDarkMode}
          theme={theme}
          actions={
            <TouchableOpacity style={styles.pageRefreshButton} onPress={loadAllUsers}>
              <Ionicons name="refresh-outline" size={22} color="#0A3D91" />
            </TouchableOpacity>
          }
        >
          <View
            style={[
              styles.modularEditorCard,
              {
                backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                borderColor: theme.borderColor,
                marginBottom: 18,
              },
            ]}
          >
            <Text style={[styles.modularEditorTitle, isDarkMode && styles.darkText]}>
              Select User to Manage
            </Text>
            <Text style={[styles.modularListMeta, isDarkMode && styles.darkTextSecondary]}>
              Search or filter the account list, then choose View or Edit.
            </Text>

            {renderAdminRecordToolbar({
              searchTitle: "Search Users",
              searchValue: userSearchTerm,
              onSearchChange: (value) => {
                setUserSearchTerm(value);
                setUserSearchQuery(value.trim());
                setDataManagementPage(1);
              },
              searchPlaceholder: "Search name, email, username, phone, staff ID...",
              searchSubtitle: "Find by name, username, email, role, department, phone, or staff ID.",
              hasSearch: Boolean(userSearchTerm || userSearchQuery),
              onClearSearch: () => {
                setUserSearchTerm("");
                setUserSearchQuery("");
                setDataManagementPage(1);
              },
              filterTitle: "Filters",
              filterSubtitle: "Narrow users by role/status and department.",
              hasFilters: userFilter !== "all" || userDepartmentFilter !== "all",
              onResetFilters: () => {
                setUserFilter("all");
                setUserDepartmentFilter("all");
                setDataManagementPage(1);
              },
              filterGroups: [
                {
                  label: "Role / Status",
                  value: userFilter,
                  icon: "people-outline",
                  options: dataManagementRoleFilters.map((filterItem) => ({
                    label: `${filterItem.label}${typeof filterItem.count === "number" ? ` (${filterItem.count})` : ""}`,
                    value: filterItem.key,
                  })),
                  onSelect: (value) => {
                    setUserFilter(value);
                    setDataManagementPage(1);
                  },
                },
                {
                  label: "Department",
                  value: userDepartmentFilter,
                  icon: "business-outline",
                  options: dataManagementDepartmentFilterOptions.map((filterItem) => ({
                    label: `${filterItem.label}${typeof filterItem.count === "number" ? ` (${filterItem.count})` : ""}`,
                    value: filterItem.key,
                  })),
                  onSelect: (value) => {
                    setUserDepartmentFilter(value);
                    setDataManagementPage(1);
                  },
                },
              ],
            })}

            {renderAdminTable({
              rows: paginatedDataManagementUsers,
              keyExtractor: (userItem) => userItem._id || userItem.id || userItem.email,
              emptyTitle: "No users found",
              emptySubtitle: "Try clearing the search or filter to find the account you want to manage.",
              emptyIcon: "people-outline",
              emptyActionLabel: "Reload Users",
              onEmptyAction: loadAllUsers,
              minTableHeight: 372,
              columns: [
                {
                  key: "name",
                  label: "User",
                  width: 220,
                  grow: 1.4,
                  render: (userItem) => {
                    const roleColor = getRoleColor(userItem.role);
                    return (
                      <View style={styles.adminTableIdentityCell}>
                        <View style={[styles.userAvatar, { backgroundColor: `${roleColor}18` }]}>
                          <Text style={[styles.userAvatarInitials, { color: roleColor }]}>
                            {getUserInitials(userItem)}
                          </Text>
                        </View>
                        <View style={styles.adminTableIdentityCopy}>
                          <Text style={[styles.adminTablePrimaryText, isDarkMode && styles.darkText]}>
                            {userItem.firstName} {userItem.lastName}
                          </Text>
                          <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                            {userItem.email || "No email"}
                          </Text>
                        </View>
                      </View>
                    );
                  },
                },
                {
                  key: "role",
                  label: "Role",
                  width: 105,
                  grow: 0.75,
                  render: (userItem) => {
                    const roleColor = getRoleColor(userItem.role);
                    return (
                      <View style={[styles.roleBadge, { backgroundColor: `${roleColor}14`, alignSelf: "flex-start" }]}>
                        <Text style={[styles.roleBadgeText, { color: roleColor }]}>
                          {formatRoleLabel(userItem.role)}
                        </Text>
                      </View>
                    );
                  },
                },
                {
                  key: "department",
                  label: "Department",
                  width: 140,
                  grow: 1,
                  render: (userItem) => (
                    <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                      {userItem.department || "General"}
                    </Text>
                  ),
                },
                {
                  key: "contact",
                  label: "Contact",
                  width: 160,
                  grow: 1,
                  render: (userItem) => (
                    <View>
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {userItem.username || "-"}
                      </Text>
                      <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                        {userItem.phone || "No phone"}
                      </Text>
                    </View>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  width: 100,
                  grow: 0.55,
                  render: (userItem) => {
                    const userIsActive = isUserActive(userItem);
                    return (
                      <View
                        style={[
                          styles.userLiveStatusBadge,
                          {
                            backgroundColor: userIsActive ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
                            alignSelf: "flex-start",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.userLiveStatusText,
                            { color: userIsActive ? "#10B981" : "#EF4444" },
                          ]}
                        >
                          {userIsActive ? "Active" : "Inactive"}
                        </Text>
                      </View>
                    );
                  },
                },
                {
                  key: "actions",
                  label: "Manage",
                  width: 210,
                  grow: 0.15,
                  render: (userItem) => (
                    <View style={styles.adminTableActionRow}>
                      <TouchableOpacity
                        style={[styles.adminTableActionButton, { borderColor: "rgba(59,130,246,0.24)", backgroundColor: "rgba(59,130,246,0.12)" }]}
                        onPress={() => openUserDataViewPanel(userItem)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${userItem.firstName || "user"} ${userItem.lastName || ""}`}
                      >
                        <Ionicons name="eye-outline" size={14} color="#0A3D91" />
                        <Text style={[styles.adminTableActionText, { color: "#0A3D91" }]}>View</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.adminTableActionButton, { borderColor: "rgba(16,185,129,0.24)", backgroundColor: "rgba(16,185,129,0.12)" }]}
                        onPress={() => openUserDataEditPanel(userItem)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${userItem.firstName || "user"} ${userItem.lastName || ""}`}
                      >
                        <Ionicons name="create-outline" size={14} color="#10B981" />
                        <Text style={[styles.adminTableActionText, { color: "#10B981" }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.adminTableActionButton, { borderColor: "rgba(239,68,68,0.22)", backgroundColor: "rgba(239,68,68,0.12)" }]}
                        onPress={() => {
                          setSelectedUser(userItem);
                          setShowDeleteUserModal(true);
                        }}
                      >
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        <Text style={[styles.adminTableActionText, { color: "#EF4444" }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                },
              ],
            })}
            <View style={styles.userPaginationRow}>
              <Text style={[styles.userPaginationSummary, isDarkMode && styles.darkTextSecondary]}>
                Showing {dataManagementVisibleStart}-{dataManagementVisibleEnd} of {dataManagementUsers.length} users
              </Text>
              <View style={styles.userPaginationControls}>
                <TouchableOpacity
                  style={[
                    styles.userPaginationButton,
                    dataManagementPage === 1 && styles.userPaginationButtonDisabled,
                  ]}
                  onPress={() => setDataManagementPage((page) => Math.max(1, page - 1))}
                  disabled={dataManagementPage === 1}
                >
                  <Ionicons name="chevron-back-outline" size={16} color={dataManagementPage === 1 ? "#94A3B8" : "#334155"} />
                  <Text style={[styles.userPaginationButtonText, dataManagementPage === 1 && styles.userPaginationButtonTextDisabled]}>
                    Previous
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.userPaginationSummary, isDarkMode && styles.darkTextSecondary]}>
                  Page {dataManagementPage} of {dataManagementTotalPages}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.userPaginationButton,
                    dataManagementPage >= dataManagementTotalPages && styles.userPaginationButtonDisabled,
                  ]}
                  onPress={() => setDataManagementPage((page) => Math.min(dataManagementTotalPages, page + 1))}
                  disabled={dataManagementPage >= dataManagementTotalPages}
                >
                  <Text style={[styles.userPaginationButtonText, dataManagementPage >= dataManagementTotalPages && styles.userPaginationButtonTextDisabled]}>
                    Next
                  </Text>
                  <Ionicons name="chevron-forward-outline" size={16} color={dataManagementPage >= dataManagementTotalPages ? "#94A3B8" : "#334155"} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {false ? (
          <View
            style={[
              styles.modularEditorCard,
              {
                backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                borderColor: theme.borderColor,
                marginBottom: 18,
              },
            ]}
          >
            <Text style={[styles.modularEditorTitle, isDarkMode && styles.darkText]}>
              Form Field Setup
            </Text>
            <Text style={[styles.modularListMeta, isDarkMode && styles.darkTextSecondary]}>
              Optional setup for the fields collected in future visitor/admin workflows.
            </Text>
          </View>
          ) : null}

          {false ? (
          <View style={styles.modularTwoColumnLayout}>
            <View
              style={[
                styles.modularEditorCard,
                {
                  backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <Text style={[styles.modularEditorTitle, isDarkMode && styles.darkText]}>
                {editingFieldId ? "Edit field" : "Add field"}
              </Text>
              <TextInput
                style={[styles.modularTextInput, isDarkMode && styles.darkInput]}
                placeholder="Field label"
                placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                value={fieldDraft.label}
                onChangeText={(value) => handleFieldDraftChange("label", value)}
              />
              <TextInput
                style={[styles.modularTextInput, isDarkMode && styles.darkInput]}
                placeholder="Field type (text, email, select...)"
                placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                value={fieldDraft.type}
                onChangeText={(value) => handleFieldDraftChange("type", value)}
              />
              <TextInput
                style={[styles.modularTextInput, isDarkMode && styles.darkInput]}
                placeholder="Scope (visitor, admin, security...)"
                placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                value={fieldDraft.scope}
                onChangeText={(value) => handleFieldDraftChange("scope", value)}
              />

              <View style={styles.modularSwitchRow}>
                <Text style={[styles.modularSwitchLabel, isDarkMode && styles.darkText]}>Required</Text>
                <Switch
                  value={!!fieldDraft.required}
                  onValueChange={(value) => handleFieldDraftChange("required", value)}
                />
              </View>
              <View style={styles.modularSwitchRow}>
                <Text style={[styles.modularSwitchLabel, isDarkMode && styles.darkText]}>Enabled</Text>
                <Switch
                  value={fieldDraft.enabled !== false}
                  onValueChange={(value) => handleFieldDraftChange("enabled", value)}
                />
              </View>

              <View style={styles.modularEditorActions}>
                <TouchableOpacity style={styles.submitButton} onPress={submitFieldDraft}>
                  <Text style={styles.submitButtonText}>{editingFieldId ? "Save Field" : "Add Field"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={resetFieldEditor}>
                  <Text style={styles.cancelButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View
              style={[
                styles.modularEditorCard,
                {
                  backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <Text style={[styles.modularEditorTitle, isDarkMode && styles.darkText]}>
                Current fields
              </Text>
              {renderAdminTable({
                rows: paginatedDataCollectionFields,
                keyExtractor: (field) => field.id,
                emptyTitle: "No fields configured",
                emptySubtitle: "Add a field to start shaping the data collection setup.",
                columns: [
                  {
                    key: "field",
                    label: "Field",
                    width: 190,
                    render: (field) => (
                      <Text style={[styles.adminTablePrimaryText, isDarkMode && styles.darkText]}>
                        {field.label}
                      </Text>
                    ),
                  },
                  {
                    key: "type",
                    label: "Type",
                    width: 120,
                    render: (field) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {field.type || "text"}
                      </Text>
                    ),
                  },
                  {
                    key: "scope",
                    label: "Scope",
                    width: 130,
                    render: (field) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {field.scope || "visitor"}
                      </Text>
                    ),
                  },
                  {
                    key: "required",
                    label: "Required",
                    width: 120,
                    render: (field) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {field.required ? "Required" : "Optional"}
                      </Text>
                    ),
                  },
                  {
                    key: "enabled",
                    label: "Status",
                    width: 110,
                    render: (field) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {field.enabled ? "Enabled" : "Disabled"}
                      </Text>
                    ),
                  },
                  {
                    key: "actions",
                    label: "Actions",
                    width: 150,
                    render: (field) => (
                      <View style={styles.adminTableActionRow}>
                        <TouchableOpacity
                          style={[styles.adminTableActionButton, { borderColor: "rgba(37,99,235,0.24)", backgroundColor: "rgba(37,99,235,0.12)" }]}
                          onPress={() => handleEditField(field)}
                        >
                          <Text style={[styles.adminTableActionText, { color: "#0A3D91" }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.adminTableActionButton, { borderColor: "rgba(239,68,68,0.22)", backgroundColor: "rgba(239,68,68,0.12)" }]}
                          onPress={() => handleDeleteField(field)}
                        >
                          <Text style={[styles.adminTableActionText, { color: "#EF4444" }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    ),
                  },
                ],
              })}
              <View style={styles.userPaginationRow}>
                <Text style={[styles.userPaginationSummary, isDarkMode && styles.darkTextSecondary]}>
                  Showing {fieldSetupVisibleStart}-{fieldSetupVisibleEnd} of {dataCollectionFields.length} fields
                </Text>
                <View style={styles.userPaginationControls}>
                  <TouchableOpacity
                    style={[
                      styles.userPaginationButton,
                      dataManagementFieldPage === 1 && styles.userPaginationButtonDisabled,
                    ]}
                    onPress={() => setDataManagementFieldPage((page) => Math.max(1, page - 1))}
                    disabled={dataManagementFieldPage === 1}
                  >
                    <Ionicons name="chevron-back-outline" size={16} color={dataManagementFieldPage === 1 ? "#94A3B8" : "#334155"} />
                    <Text style={[styles.userPaginationButtonText, dataManagementFieldPage === 1 && styles.userPaginationButtonTextDisabled]}>
                      Previous
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.userPaginationSummary, isDarkMode && styles.darkTextSecondary]}>
                    Page {dataManagementFieldPage} of {fieldSetupTotalPages}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.userPaginationButton,
                      dataManagementFieldPage >= fieldSetupTotalPages && styles.userPaginationButtonDisabled,
                    ]}
                    onPress={() => setDataManagementFieldPage((page) => Math.min(fieldSetupTotalPages, page + 1))}
                    disabled={dataManagementFieldPage >= fieldSetupTotalPages}
                  >
                    <Text style={[styles.userPaginationButtonText, dataManagementFieldPage >= fieldSetupTotalPages && styles.userPaginationButtonTextDisabled]}>
                      Next
                    </Text>
                    <Ionicons name="chevron-forward-outline" size={16} color={dataManagementFieldPage >= fieldSetupTotalPages ? "#94A3B8" : "#334155"} />
                  </TouchableOpacity>
                </View>
              </View>
              {false ? (
              <View style={styles.modularListStack}>
                {dataCollectionFields.map((field) => (
                  <View
                    key={field.id}
                    style={[
                      styles.modularListCard,
                      {
                        backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                        borderColor: theme.borderColor,
                      },
                    ]}
                  >
                    <View style={styles.modularListHeader}>
                      <View style={styles.modularListCopy}>
                        <Text style={[styles.modularListTitle, isDarkMode && styles.darkText]}>{field.label}</Text>
                        <Text style={[styles.modularListMeta, isDarkMode && styles.darkTextSecondary]}>
                          {field.type} • {field.scope} • {field.required ? "Required" : "Optional"} • {field.enabled ? "Enabled" : "Disabled"}
                        </Text>
                      </View>
                      <View style={styles.modularInlineActions}>
                        <TouchableOpacity style={styles.modularInlineButton} onPress={() => handleEditField(field)}>
                          <Ionicons name="create-outline" size={16} color="#0A3D91" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modularInlineButton} onPress={() => handleDeleteField(field)}>
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              ) : null}
            </View>
          </View>
          ) : null}
        </AdminSectionShell>
      </View>
    </ScrollView>
  );

  const renderFloorMapContent = () => (
    <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.pageContainer}>
        <AdminSectionShell
          title={ADMIN_MODULE_FLOORS.find((floor) => floor.id === selectedMapModuleFloor)?.name || "Floor Map"}
          subtitle="Use the shared map canvas on the left and rename existing room labels from the panel on the right."
          badge={`${selectedFloorRooms.length} rooms`}
          isDarkMode={isDarkMode}
          theme={theme}
          actions={
            <TouchableOpacity
              style={styles.pageRefreshButton}
              onPress={() => {
                setSelectedAdminMapFloor(selectedMapModuleFloor);
                loadRecentActivities();
              }}
            >
              <Ionicons name="refresh-outline" size={22} color={ADMIN_BLUE} />
            </TouchableOpacity>
          }
        >
          <View style={styles.modularTwoColumnLayout}>
            <View style={styles.modularMapColumn}>
              <SharedMonitoringMap
                title={ADMIN_MODULE_FLOORS.find((floor) => floor.id === selectedMapModuleFloor)?.name || "Floor Map"}
                subtitle="Tracked visitors appear here while admin-managed rooms stay editable in the adjacent panel."
                iconName="map-outline"
                iconColor={ADMIN_BLUE}
                visitors={visibleAdminMapVisitors}
                floors={ADMIN_MODULE_FLOORS}
                offices={managedRooms}
                selectedFloor={selectedMapModuleFloor}
                selectedOffice={selectedAdminMapOffice}
                mapBlueprints={MONITORING_MAP_BLUEPRINTS}
                mapLabels={managedMapLabels}
                officePositions={managedRoomPositions}
                onFloorChange={(floorId) => {
                  const floorViewKey = Object.entries(FLOOR_VIEW_TO_ID).find(([, floorValue]) => floorValue === floorId)?.[0];
                  if (floorViewKey) {
                    selectAdminSubmodule(floorViewKey);
                  }
                }}
                onVisitorHover={(item) => setHoveredMapVisitor(item)}
                onVisitorLeave={() => setHoveredMapVisitor(null)}
                onVisitorSelect={(item) => setSelectedMapActivity(item)}
                hoveredVisitor={hoveredMapVisitor}
                backgroundColor="transparent"
                borderColor={theme.borderColor}
                mapBackgroundColor={isDarkMode ? "#0F172A" : "#FFFFFF"}
                textPrimary={theme.textPrimary}
                textSecondary={theme.textSecondary}
                showFloorNavigation={false}
                containerStyle={{ padding: 0, borderWidth: 0 }}
                mapWrapperStyle={styles.adminMapModalMapWrap}
              />
            </View>

            <View
              style={[
                styles.modularEditorCard,
                styles.modularRoomsPanel,
                {
                  backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <Text style={[styles.modularEditorTitle, isDarkMode && styles.darkText]}>
                {editingRoomId ? "Rename room" : "Rename a room"}
              </Text>
              <Text style={[styles.modularEditorHint, isDarkMode && styles.darkTextSecondary]}>
                Tap the pencil beside any room below, then update its display name here.
              </Text>
              <TextInput
                style={[styles.modularTextInput, isDarkMode && styles.darkInput]}
                placeholder="Room name"
                placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                value={roomDraft.name}
                onChangeText={(value) => handleRoomDraftChange("name", value)}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Map X</Text>
                  <TextInput
                    style={[styles.modularTextInput, isDarkMode && styles.darkInput]}
                    placeholder="0-100"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                    keyboardType="numeric"
                    value={roomDraft.x}
                    onChangeText={(value) => handleRoomDraftChange("x", value)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Map Y</Text>
                  <TextInput
                    style={[styles.modularTextInput, isDarkMode && styles.darkInput]}
                    placeholder="0-100"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                    keyboardType="numeric"
                    value={roomDraft.y}
                    onChangeText={(value) => handleRoomDraftChange("y", value)}
                  />
                </View>
              </View>
              <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                X moves left/right and Y moves up/down on the blueprint. Matching NFC visitor markers follow this room position.
              </Text>

              <View style={styles.modularEditorActions}>
                <TouchableOpacity style={styles.submitButton} onPress={submitRoomDraft}>
                  <Text style={styles.submitButtonText}>Save Room</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => resetRoomEditor(selectedMapModuleFloor)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.modularEditorTitle, styles.modularEditorSecondaryTitle, isDarkMode && styles.darkText]}>
                Floor rooms
              </Text>

              <View style={styles.modularListStack}>
                {selectedFloorRooms.length > 0 ? (
                  <>
                    <View
                      style={[
                        styles.modularRoomTable,
                        {
                          backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                          borderColor: theme.borderColor,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.modularRoomTableHeader,
                          {
                            backgroundColor: isDarkMode ? "#111827" : "#EEF5FF",
                            borderColor: theme.borderColor,
                          },
                        ]}
                      >
                        <Text style={styles.modularRoomTableHeaderText}>Room</Text>
                        <Text style={styles.modularRoomTableHeaderText}>Position</Text>
                        <Text style={[styles.modularRoomTableHeaderText, styles.modularRoomTableActionsHeader]}>Actions</Text>
                      </View>

                      {paginatedSelectedFloorRooms.map((room, index) => (
                        <View
                          key={room.id}
                          style={[
                            styles.modularRoomTableRow,
                            {
                              backgroundColor:
                                isDarkMode
                                  ? index % 2 === 0
                                    ? "#0F172A"
                                    : "#111827"
                                  : index % 2 === 0
                                    ? "#FFFFFF"
                                    : "#F8FBFE",
                              borderColor: theme.borderColor,
                            },
                          ]}
                        >
                          <View style={styles.modularRoomTableNameCell}>
                            <Text
                              style={[styles.modularListTitle, isDarkMode && styles.darkText]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {room.name}
                            </Text>
                          </View>
                          <Text style={[styles.modularListMeta, styles.modularRoomTablePositionCell, isDarkMode && styles.darkTextSecondary]}>
                            {managedRoomPositions?.[room.id]?.x ?? 50}, {managedRoomPositions?.[room.id]?.y ?? 50}
                          </Text>
                          <View style={[styles.modularInlineActions, styles.modularRoomTableActionsCell]}>
                            <TouchableOpacity style={styles.modularInlineButton} onPress={() => handleEditRoom(room)}>
                              <Ionicons name="create-outline" size={16} color="#0A3D91" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>

                    {roomManagementTotalPages > 1
                      ? renderCompactPagination({
                          currentPage: roomManagementPage,
                          totalPages: roomManagementTotalPages,
                          itemCount: selectedFloorRooms.length,
                          itemLabel: "rooms",
                          onPrevious: () => setRoomManagementPage((page) => Math.max(1, page - 1)),
                          onNext: () =>
                            setRoomManagementPage((page) =>
                              Math.min(roomManagementTotalPages, page + 1),
                            ),
                        })
                      : null}
                  </>
                ) : (
                  <View
                    style={[
                      styles.modularEmptyState,
                      {
                        backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                        borderColor: theme.borderColor,
                      },
                    ]}
                  >
                    <Ionicons name="business-outline" size={24} color="#94A3B8" />
                    <Text style={[styles.modularEmptyStateText, isDarkMode && styles.darkTextSecondary]}>
                      No rooms configured for this floor yet.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </AdminSectionShell>
      </View>
    </ScrollView>
  );

  const renderAppointmentFilterDropdown = ({ label, value, options, onSelect, icon }) => {
    const dropdownKey = `appointment-filter-${label}`;
    const isOpen = staffDropdownOpen === dropdownKey;
    const selectedOption = options.find((option) => option.value === value);

    return (
      <View style={[styles.appointmentToolbarField, isOpen && styles.appointmentToolbarFieldOpen]}>
        <Text style={[styles.appointmentToolbarLabel, isDarkMode && styles.darkTextSecondary]}>{label}</Text>
        <TouchableOpacity
          style={[
            styles.appointmentToolbarSelect,
            isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
          ]}
          onPress={() => setStaffDropdownOpen(isOpen ? null : dropdownKey)}
          activeOpacity={0.85}
        >
          <View style={styles.appointmentToolbarSelectValue}>
            <Ionicons name={icon} size={15} color="#64748B" />
            <Text
              style={[styles.appointmentToolbarSelectText, isDarkMode && styles.darkText]}
              numberOfLines={1}
            >
              {selectedOption?.label || "All"}
            </Text>
          </View>
          <Ionicons name={isOpen ? "chevron-up-outline" : "chevron-down-outline"} size={16} color="#64748B" />
        </TouchableOpacity>
        {isOpen ? (
          <View
            style={[
              styles.appointmentToolbarDropdownMenu,
              isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
            ]}
          >
            <ScrollView style={styles.appointmentToolbarDropdownScroll} nestedScrollEnabled>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <TouchableOpacity
                    key={`${label}-${option.value}`}
                    style={[
                      styles.appointmentToolbarDropdownOption,
                      isSelected && styles.appointmentToolbarDropdownOptionActive,
                    ]}
                    onPress={() => {
                      onSelect(option.value);
                      setStaffDropdownOpen(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.appointmentToolbarDropdownText,
                        isSelected && styles.appointmentToolbarDropdownTextActive,
                        isDarkMode && !isSelected && styles.darkText,
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                    {isSelected ? <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  };

  const renderAppointmentRecordsToolbar = () => {
    const allOption = { label: "All", value: "all" };
    const hasSearch = Boolean(appointmentSearchTerm);
    const hasFilters = Object.entries(appointmentAppliedFilters).some(([key, value]) =>
      key === "date" ? Boolean(value) : value !== "all",
    );
    const openAppointmentDatePicker = () => {
      if (Platform.OS === "web") {
        const input = appointmentDateInputRef.current;
        if (input?.showPicker) {
          input.showPicker();
        } else if (input?.click) {
          input.click();
        } else if (input?.focus) {
          input.focus();
        }
        return;
      }

      setShowAppointmentFilterDatePicker(true);
    };

    return (
      <View style={styles.appointmentRecordsToolbar}>
        <View
          style={[
            styles.appointmentToolbarCard,
            isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
          ]}
        >
          <View style={styles.appointmentToolbarHeader}>
            <View style={styles.appointmentToolbarHeaderCopy}>
              <Text style={[styles.appointmentToolbarTitle, isDarkMode && styles.darkText]}>Search Appointments</Text>
              <Text style={[styles.appointmentToolbarSubtitle, isDarkMode && styles.darkTextSecondary]}>
                Search by visitor, date, time, office, or purpose.
              </Text>
            </View>
            {hasSearch ? (
              <TouchableOpacity style={styles.appointmentToolbarClearButton} onPress={clearAppointmentSearch}>
                <Ionicons name="close-outline" size={14} color="#64748B" />
                <Text style={styles.appointmentToolbarClearText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.appointmentToolbarSearchRow}>
            <View
              style={[
                styles.appointmentToolbarSearchInputWrap,
                isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
              ]}
            >
              <Ionicons name="search-outline" size={17} color="#64748B" />
              <TextInput
                style={[styles.appointmentToolbarSearchInput, isDarkMode && styles.darkText]}
                placeholder="Name, YYYY-MM-DD, 3:30 PM, office, purpose"
                placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                value={appointmentSearchDraft}
                onChangeText={setAppointmentSearchDraft}
                returnKeyType="search"
                onSubmitEditing={applyAppointmentSearch}
              />
            </View>
            <TouchableOpacity style={styles.appointmentToolbarPrimaryButton} onPress={applyAppointmentSearch}>
              <Ionicons name="search-outline" size={16} color="#FFFFFF" />
              <Text style={styles.appointmentToolbarPrimaryText}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.appointmentToolbarCard,
            isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
          ]}
        >
          <View style={styles.appointmentToolbarHeader}>
            <View style={styles.appointmentToolbarHeaderCopy}>
              <Text style={[styles.appointmentToolbarTitle, isDarkMode && styles.darkText]}>Filters</Text>
              <Text style={[styles.appointmentToolbarSubtitle, isDarkMode && styles.darkTextSecondary]}>
                Narrow results by schedule, office, status, and purpose.
              </Text>
            </View>
            {hasFilters ? (
              <TouchableOpacity style={styles.appointmentToolbarClearButton} onPress={resetAppointmentFilters}>
                <Ionicons name="refresh-outline" size={14} color="#64748B" />
                <Text style={styles.appointmentToolbarClearText}>Reset</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.appointmentToolbarFilterGrid}>
            <View style={styles.appointmentToolbarField}>
              <Text style={[styles.appointmentToolbarLabel, isDarkMode && styles.darkTextSecondary]}>Date</Text>
              <View
                style={[
                  styles.appointmentToolbarInputWrap,
                  isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
                ]}
              >
                <TouchableOpacity onPress={openAppointmentDatePicker} accessibilityRole="button" accessibilityLabel="Open appointment date calendar">
                  <Ionicons name="calendar-outline" size={15} color="#64748B" />
                </TouchableOpacity>
                {Platform.OS === "web" ? (
                  <input
                    ref={appointmentDateInputRef}
                    type="date"
                    value={appointmentFilterDraft.date}
                    onChange={(event) =>
                      setAppointmentFilterDraft((current) => ({
                        ...current,
                        date: sanitizeDateInputValue(event.target.value),
                      }))
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: isDarkMode ? "#F8FAFC" : "#0F172A",
                      fontSize: 13,
                      paddingTop: 9,
                      paddingBottom: 9,
                    }}
                  />
                ) : (
                  <TextInput
                    style={[styles.appointmentToolbarInput, isDarkMode && styles.darkText]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                    value={appointmentFilterDraft.date}
                    onChangeText={(value) =>
                      setAppointmentFilterDraft((current) => ({
                        ...current,
                        date: sanitizeDateInputValue(value.trim()),
                      }))
                    }
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={10}
                  />
                )}
              </View>
            </View>

            {renderAppointmentFilterDropdown({
              label: "Time",
              value: appointmentFilterDraft.time,
              icon: "time-outline",
              options: [allOption, ...appointmentRecordFilterOptions.timeSlots],
              onSelect: (value) => setAppointmentFilterDraft((current) => ({ ...current, time: value })),
            })}
            {renderAppointmentFilterDropdown({
              label: "Office",
              value: appointmentFilterDraft.office,
              icon: "business-outline",
              options: [allOption, ...appointmentRecordFilterOptions.offices],
              onSelect: (value) => setAppointmentFilterDraft((current) => ({ ...current, office: value })),
            })}
            {renderAppointmentFilterDropdown({
              label: "Status",
              value: appointmentFilterDraft.status,
              icon: "flag-outline",
              options: [allOption, ...appointmentRecordFilterOptions.statuses],
              onSelect: (value) => setAppointmentFilterDraft((current) => ({ ...current, status: value })),
            })}
            {renderAppointmentFilterDropdown({
              label: "Purpose",
              value: appointmentFilterDraft.purpose,
              icon: "clipboard-outline",
              options: [allOption, ...appointmentRecordFilterOptions.purposes],
              onSelect: (value) => setAppointmentFilterDraft((current) => ({ ...current, purpose: value })),
            })}
          </View>
          <View style={styles.appointmentToolbarActionRow}>
            <TouchableOpacity style={styles.appointmentToolbarSecondaryButton} onPress={resetAppointmentFilters}>
              <Text style={styles.appointmentToolbarSecondaryText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.appointmentToolbarPrimaryButton} onPress={applyAppointmentFilters}>
              <Ionicons name="funnel-outline" size={16} color="#FFFFFF" />
              <Text style={styles.appointmentToolbarPrimaryText}>Apply Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderAdminRecordToolbar = ({
    searchTitle = "Search",
    searchValue,
    onSearchChange,
    searchPlaceholder,
    searchSubtitle = "Find records by visitor, office, purpose, date, reporter, or status.",
    hasSearch,
    onClearSearch,
    filterTitle = "Filters",
    filterGroups = [],
    filterSubtitle = "Keep the table focused without a long filter form.",
    hasFilters,
    onResetFilters,
    filterFooter = null,
  }) => (
    <View style={styles.appointmentRecordsToolbar}>
      <View
        style={[
          styles.appointmentToolbarCard,
          isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
        ]}
      >
        <View style={styles.appointmentToolbarHeader}>
          <View style={styles.appointmentToolbarHeaderCopy}>
            <Text style={[styles.appointmentToolbarTitle, isDarkMode && styles.darkText]}>{searchTitle}</Text>
            <Text style={[styles.appointmentToolbarSubtitle, isDarkMode && styles.darkTextSecondary]}>
              {searchSubtitle}
            </Text>
          </View>
          {hasSearch ? (
            <TouchableOpacity style={styles.appointmentToolbarClearButton} onPress={onClearSearch}>
              <Ionicons name="close-outline" size={14} color="#64748B" />
              <Text style={styles.appointmentToolbarClearText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.appointmentToolbarSearchRow}>
          <View
            style={[
              styles.appointmentToolbarSearchInputWrap,
              isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
            ]}
          >
            <Ionicons name="search-outline" size={17} color="#64748B" />
            <TextInput
              style={[styles.appointmentToolbarSearchInput, isDarkMode && styles.darkText]}
              placeholder={searchPlaceholder}
              placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
              value={searchValue}
              onChangeText={onSearchChange}
              returnKeyType="search"
            />
          </View>
        </View>
      </View>

      <View
        style={[
          styles.appointmentToolbarCard,
          isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
        ]}
      >
        <View style={styles.appointmentToolbarHeader}>
          <View style={styles.appointmentToolbarHeaderCopy}>
            <Text style={[styles.appointmentToolbarTitle, isDarkMode && styles.darkText]}>{filterTitle}</Text>
            <Text style={[styles.appointmentToolbarSubtitle, isDarkMode && styles.darkTextSecondary]}>
              {filterSubtitle}
            </Text>
          </View>
          {hasFilters ? (
            <TouchableOpacity style={styles.appointmentToolbarClearButton} onPress={onResetFilters}>
              <Ionicons name="refresh-outline" size={14} color="#64748B" />
              <Text style={styles.appointmentToolbarClearText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.appointmentToolbarFilterGrid}>
          {filterGroups.map((filterGroup) =>
            renderAppointmentFilterDropdown({
              label: filterGroup.label,
              value: filterGroup.value,
              icon: filterGroup.icon,
              options: filterGroup.options,
              onSelect: filterGroup.onSelect,
            }),
          )}
        </View>
        {filterFooter ? <View style={styles.appointmentToolbarFooter}>{filterFooter}</View> : null}
      </View>
    </View>
  );

  const renderAppointmentRecordsContent = () => (
    <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.pageContainer}>
        <AdminSectionShell
          title="Appointment Records"
          subtitle="Read through approved appointment records after staff approval."
          badge={`${filteredAppointmentRecords.length} visible`}
          isDarkMode={isDarkMode}
          theme={theme}
          actions={renderRecordListPrintButton({
            label: "Print Records",
            color: ADMIN_BLUE,
            disabled: !filteredAppointmentRecords.length,
            onPress: () =>
              handlePrintRequests(
                "Appointment Records",
                filteredAppointmentRecords,
                "Generated from the appointment records table in the admin dashboard.",
              ),
          })}
        >
          <View style={styles.modularCardGrid}>
            {[
              { label: "Total Records", value: appointmentRecords.length, color: ADMIN_BLUE },
              { label: "Pending Requests", value: pendingAppointmentRequests.length, color: ADMIN_BLUE },
              { label: "Visible", value: filteredAppointmentRecords.length, color: ADMIN_BLUE },
            ].map((item) => (
              <View
                key={item.label}
                style={[
                  styles.modularStatCard,
                  {
                    backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <Text style={[styles.modularStatValue, { color: item.color }]}>{item.value}</Text>
                <Text style={[styles.modularStatLabel, isDarkMode && styles.darkTextSecondary]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {renderAppointmentRecordsToolbar()}

          {showAppointmentFilterDatePicker && Platform.OS !== "web" ? (
            <DateTimePicker
              value={parseDateInputValue(appointmentFilterDraft.date) || new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(event, date) => {
                setShowAppointmentFilterDatePicker(false);
                if (date) {
                  setAppointmentFilterDraft((current) => ({
                    ...current,
                    date: formatDateInputValue(date),
                  }));
                }
              }}
            />
          ) : null}

          {renderAdminTable({
            rows: paginatedAppointmentRecords,
            keyExtractor: (request) => request._id || request.id || request.email,
            emptyTitle: "No appointment records",
            emptySubtitle: "Pending appointment requests will appear here only after staff approval.",
            emptyIcon: "calendar-outline",
            emptyActionLabel: "Reload Appointments",
            onEmptyAction: loadAllVisitRequests,
            columns: [
              {
                key: "visitor",
                label: "Visitor",
                width: 210,
                render: (request) => (
                  <View>
                    <Text style={[styles.adminTablePrimaryText, isDarkMode && styles.darkText]}>
                      {request.fullName || "Visitor"}
                    </Text>
                    <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                      {request.email || "-"}
                    </Text>
                    <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                      SafePass ID: {getVisitorSafePassId(request)}
                    </Text>
                    <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                      NFC UID: {getVisitorNfcUid(request)}
                    </Text>
                  </View>
                ),
              },
              {
                key: "purpose",
                label: "Purpose",
                width: 210,
                render: (request) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                    {request.purposeOfVisit || request.visitType || "-"}
                  </Text>
                ),
              },
              {
                key: "office",
                label: "Office",
                width: 180,
                render: (request) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                    {request.assignedOffice || request.host || "-"}
                  </Text>
                ),
              },
              {
                key: "status",
                label: "Status",
                width: 120,
                render: (request) => {
                  const statusInfo = getStatusColor(getRequestStatus(request));
                  return (
                    <View style={[styles.dashboardStatusBadge, { backgroundColor: statusInfo.bg, alignSelf: "flex-start" }]}>
                      <Text style={[styles.dashboardStatusText, { color: statusInfo.text }]}>
                        {statusInfo.label}
                      </Text>
                    </View>
                  );
                },
              },
              {
                key: "submitted",
                label: "Submitted",
                width: 170,
                render: (request) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                    {request.createdAt ? formatDateTime(request.createdAt) : "-"}
                  </Text>
                ),
              },
            ],
          })}

          {filteredAppointmentRecords.length ? (
            renderCompactPagination({
              currentPage: appointmentRecordsPage,
              totalPages: appointmentRecordsPageCount,
              itemCount: filteredAppointmentRecords.length,
              itemLabel: "records",
              onPrevious: () => setAppointmentRecordsPage((currentValue) => Math.max(1, currentValue - 1)),
              onNext: () =>
                setAppointmentRecordsPage((currentValue) =>
                  Math.min(appointmentRecordsPageCount, currentValue + 1),
                ),
            })
          ) : null}
        </AdminSectionShell>
      </View>
    </ScrollView>
  );

  const renderAppointmentOptionManager = ({ title, subtitle, groupKey, placeholder, icon }) => {
    const options = (appointmentManagementOptions[groupKey] || []).filter((option) => !option.deleted);
    const editingId =
      editingAppointmentOption?.groupKey === groupKey ? editingAppointmentOption.optionId : null;
    const enabledCount = options.filter((option) => option.enabled !== false).length;

    return (
      <View
        style={[
          styles.appointmentOptionCard,
          isDarkMode && styles.appointmentOptionCardDark,
          {
            backgroundColor: isDarkMode ? "#111827" : "#FFFFFF",
            borderColor: isDarkMode ? "rgba(148, 163, 184, 0.14)" : theme.borderColor,
          },
        ]}
      >
        <View style={styles.appointmentOptionHeader}>
          <View style={[styles.appointmentOptionIcon, isDarkMode && styles.appointmentOptionIconDark]}>
            <Ionicons name={icon} size={20} color="#0A3D91" />
          </View>
          <View style={styles.appointmentOptionTitleBlock}>
            <Text style={[styles.appointmentOptionTitle, isDarkMode && styles.darkText]}>{title}</Text>
            <Text style={[styles.appointmentOptionSubtitle, isDarkMode && styles.darkTextSecondary]}>
              {subtitle}
            </Text>
          </View>
          <View style={[styles.appointmentOptionCountBadge, isDarkMode && styles.appointmentOptionCountBadgeDark]}>
            <Text style={[styles.appointmentOptionCountText, isDarkMode && styles.darkTextSecondary]}>
              {enabledCount}/{options.length || 0}
            </Text>
          </View>
        </View>

        <View style={styles.appointmentOptionAddRow}>
          <TextInput
            style={[styles.appointmentOptionInput, isDarkMode && styles.darkInput]}
            placeholder={placeholder}
            placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
            value={appointmentOptionDrafts[groupKey]}
            onChangeText={(value) => setAppointmentOptionDrafts((prev) => ({ ...prev, [groupKey]: value }))}
          />
          <HoverBubble
            style={styles.appointmentOptionAddButton}
            disabled={isSavingAppointmentOptions}
            onPress={() => handleAddAppointmentOption(groupKey)}
            hoverScale={1.04}
          >
            {savingAppointmentOptionKey === `${groupKey}:add` ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="add-outline" size={17} color="#FFFFFF" />
                <Text style={styles.appointmentOptionAddText}>Add</Text>
              </>
            )}
          </HoverBubble>
        </View>

        <ScrollView
          style={styles.appointmentOptionListScroll}
          contentContainerStyle={styles.appointmentOptionList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {options.length ? options.map((option) => {
            const isEditing = editingId === option.id;
            const optionKey = `${groupKey}:${option.id}`;
            const savingAction = savingAppointmentOptionKey?.startsWith(`${optionKey}:`)
              ? savingAppointmentOptionKey.split(":").pop()
              : null;
            const isRowSaving = Boolean(savingAction);
            return (
              <View
                key={option.id || option.label}
                style={[
                  styles.appointmentOptionItem,
                  isDarkMode && styles.appointmentOptionItemDark,
                  isRowSaving && styles.appointmentOptionItemSaving,
                  {
                    borderColor: isDarkMode ? "rgba(148, 163, 184, 0.12)" : theme.borderColor,
                    backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                  },
                ]}
              >
                <View style={styles.appointmentOptionItemMain}>
                  {isEditing ? (
                    <View style={styles.appointmentOptionEditFields}>
                      <TextInput
                        style={[styles.appointmentOptionEditInput, isDarkMode && styles.darkInput]}
                        placeholder={placeholder}
                        placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                        value={appointmentOptionDrafts[groupKey]}
                        onChangeText={(value) => setAppointmentOptionDrafts((prev) => ({ ...prev, [groupKey]: value }))}
                      />
                      {groupKey === "timeSlots" ? (
                        <TextInput
                          style={[styles.appointmentOptionCapacityInput, isDarkMode && styles.darkInput]}
                          placeholder="Slots"
                          placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                          value={String(appointmentSlotCapacityDrafts[option.id] ?? option.capacity ?? option.limit ?? 3)}
                          keyboardType="number-pad"
                          onChangeText={(value) =>
                            setAppointmentSlotCapacityDrafts((prev) => ({ ...prev, [option.id]: value }))
                          }
                        />
                      ) : null}
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.appointmentOptionItemTitle, isDarkMode && styles.darkText]}>
                        {option.label || option.value}
                      </Text>
                      <View style={styles.appointmentOptionMetaRow}>
                        <Ionicons
                          name={option.enabled === false ? "eye-off-outline" : "eye-outline"}
                          size={13}
                          color="#64748B"
                        />
                        <Text style={[styles.appointmentOptionStatusText, isDarkMode && styles.darkTextSecondary]}>
                          {option.enabled === false ? "Hidden" : "Visible"}
                        </Text>
                        {groupKey === "timeSlots" ? (
                          <>
                            <Ionicons name="people-outline" size={13} color="#64748B" />
                            <Text style={[styles.appointmentOptionStatusText, isDarkMode && styles.darkTextSecondary]}>
                              {option.capacity || option.limit || 3} slots
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </>
                  )}
                </View>
                <View style={styles.appointmentOptionActions}>
                  {isEditing ? (
                    <TouchableOpacity
                      style={[styles.appointmentOptionMiniButton, isDarkMode && styles.appointmentOptionMiniButtonDark]}
                      disabled={isSavingAppointmentOptions}
                      onPress={() => handleSaveEditedAppointmentOption(groupKey, option)}
                    >
                      {savingAction === "edit" ? (
                        <ActivityIndicator size="small" color="#0A3D91" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-outline" size={15} color="#0A3D91" />
                          <Text style={styles.appointmentOptionMiniText}>Save</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.appointmentOptionMiniButton, isDarkMode && styles.appointmentOptionMiniButtonDark]}
                      disabled={isSavingAppointmentOptions}
                      onPress={() => {
                        setEditingAppointmentOption({ groupKey, optionId: option.id });
                        setAppointmentOptionDrafts((prev) => ({ ...prev, [groupKey]: option.value || option.label || "" }));
                        if (groupKey === "timeSlots") {
                          setAppointmentSlotCapacityDrafts((prev) => ({
                            ...prev,
                            [option.id]: String(option.capacity || option.limit || 3),
                          }));
                        }
                      }}
                    >
                      <Ionicons name="create-outline" size={15} color="#475569" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.appointmentOptionMiniButton, isDarkMode && styles.appointmentOptionMiniButtonDark]}
                    disabled={isSavingAppointmentOptions}
                    onPress={() => handleToggleAppointmentOption(groupKey, option)}
                  >
                    {savingAction === "toggle" ? (
                      <ActivityIndicator size="small" color="#475569" />
                    ) : (
                      <Ionicons name={option.enabled === false ? "eye-outline" : "eye-off-outline"} size={15} color="#475569" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.appointmentOptionMiniButton,
                      styles.appointmentOptionDeleteButton,
                      isDarkMode && styles.appointmentOptionMiniButtonDark,
                      isDarkMode && styles.appointmentOptionDeleteButtonDark,
                    ]}
                    disabled={isSavingAppointmentOptions}
                    onPress={() => handleDeleteAppointmentOption(groupKey, option)}
                  >
                    {savingAction === "delete" ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }) : (
            <View style={[styles.appointmentOptionEmpty, { borderColor: theme.borderColor }]}>
              <Text style={[styles.appointmentOptionEmptyText, isDarkMode && styles.darkTextSecondary]}>
                No options yet. Add one above.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderAppointmentManagementContent = () => {
    const configSections = [
      {
        key: "offices",
        title: "Office",
        managerTitle: "Office To Visit",
        subtitle: "Add, edit, hide, or delete the offices visitors can select.",
        placeholder: "Add office, e.g. Registrar",
        icon: "business-outline",
      },
      {
        key: "timeSlots",
        title: "Time Slots",
        managerTitle: "Available Time Slots",
        subtitle: "Control the appointment times shown in the visitor request form.",
        placeholder: "Add time, e.g. 09:00 or 2:30 PM",
        icon: "time-outline",
      },
      {
        key: "purposes",
        title: "Purpose",
        managerTitle: "Purpose Of Visit",
        subtitle: "Maintain the reasons visitors can choose when requesting an appointment.",
        placeholder: "Add purpose, e.g. Consultation",
        icon: "clipboard-outline",
      },
    ];
    const activeConfig = configSections.find((section) => section.key === activeAppointmentConfigTab) || configSections[0];
    const totalOptions = configSections.reduce(
      (sum, section) => sum + (appointmentManagementOptions[section.key]?.length || 0),
      0,
    );
    const enabledOptions = configSections.reduce(
      (sum, section) =>
        sum + (appointmentManagementOptions[section.key] || []).filter((option) => option.enabled !== false).length,
      0,
    );

    return (
      <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.pageContainer}>
          <AdminSectionShell
            title="Appointment Management"
            subtitle="Central configuration for the visitor Appointment Request form."
            badge="Configuration"
            isDarkMode={isDarkMode}
            theme={theme}
            actions={
              <View style={styles.adminSectionShellActions}>
                <TouchableOpacity style={styles.pageRefreshButton} onPress={loadAppointmentManagementOptions}>
                  <Ionicons name="refresh-outline" size={22} color={ADMIN_BLUE} />
                </TouchableOpacity>
              </View>
            }
          >
            <View style={styles.appointmentManagementOverview}>
              <View style={[styles.appointmentManagementIntroCard, isDarkMode && styles.appointmentManagementIntroCardDark]}>
                <View style={[styles.appointmentManagementIntroIcon, isDarkMode && styles.appointmentManagementIntroIconDark]}>
                  <Ionicons name="options-outline" size={22} color={ADMIN_BLUE} />
                </View>
                <View style={styles.appointmentManagementIntroCopy}>
                  <Text style={[styles.appointmentManagementIntroTitle, isDarkMode && styles.darkText]}>
                    Visitor appointment request settings
                  </Text>
                  <Text style={[styles.appointmentManagementIntroText, isDarkMode && styles.darkTextSecondary]}>
                    Edit offices, time slots, and purpose choices here. Changes save to the same configuration used by the visitor Appointment Request module.
                  </Text>
                </View>
              </View>

              <View style={styles.appointmentManagementStatsGrid}>
                {[
                  { label: "Enabled", value: enabledOptions, icon: "eye-outline" },
                  { label: "Total Options", value: totalOptions, icon: "layers-outline" },
                  { label: "Slot Limit", value: "2", icon: "people-outline" },
                ].map((item) => (
                  <View
                    key={item.label}
                    style={[
                      styles.appointmentManagementStatCard,
                      isDarkMode && styles.appointmentManagementStatCardDark,
                      {
                        backgroundColor: isDarkMode ? theme.cardBackground : "#F8FBFE",
                        borderColor: isDarkMode ? "rgba(148, 163, 184, 0.12)" : theme.borderColor,
                      },
                    ]}
                  >
                    <View style={[styles.appointmentManagementStatIcon, isDarkMode && styles.appointmentManagementStatIconDark]}>
                      <Ionicons name={item.icon} size={16} color={ADMIN_BLUE} />
                    </View>
                    <View>
                      <Text style={[styles.appointmentManagementStatValue, isDarkMode && styles.darkText]}>
                        {item.value}
                      </Text>
                      <Text style={[styles.appointmentManagementStatLabel, isDarkMode && styles.darkTextSecondary]}>
                        {item.label}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.appointmentConfigWorkspace}>
              <View style={[styles.appointmentConfigTabs, isDarkMode && styles.appointmentConfigTabsDark]}>
                {configSections.map((section) => {
                  const isActive = activeAppointmentConfigTab === section.key;
                  const count = appointmentManagementOptions[section.key]?.length || 0;
                  return (
                    <TouchableOpacity
                      key={section.key}
                      style={[
                        styles.appointmentConfigTab,
                        isActive && styles.appointmentConfigTabActive,
                        isDarkMode && !isActive && styles.appointmentConfigTabDark,
                      ]}
                      onPress={() => {
                        setActiveAppointmentConfigTab(section.key);
                        setEditingAppointmentOption(null);
                      }}
                    >
                      <Ionicons name={section.icon} size={16} color={isActive ? "#FFFFFF" : ADMIN_BLUE} />
                      <Text style={[styles.appointmentConfigTabText, isActive && styles.appointmentConfigTabTextActive]}>
                        {section.title}
                      </Text>
                      <View style={[styles.appointmentConfigTabBadge, isActive && styles.appointmentConfigTabBadgeActive]}>
                        <Text style={[styles.appointmentConfigTabBadgeText, isActive && styles.appointmentConfigTabBadgeTextActive]}>
                          {count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.appointmentConfigEditorGrid}>
                <View style={styles.appointmentConfigPrimary}>
                  {renderAppointmentOptionManager({
                    title: activeConfig.managerTitle,
                    subtitle: activeConfig.subtitle,
                    groupKey: activeConfig.key,
                    placeholder: activeConfig.placeholder,
                    icon: activeConfig.icon,
                  })}
                </View>

                <View
                  style={[
                    styles.appointmentConfigSideCard,
                    isDarkMode && styles.appointmentConfigSideCardDark,
                    {
                      backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                      borderColor: isDarkMode ? "rgba(148, 163, 184, 0.14)" : theme.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.appointmentManagementSectionTitle, isDarkMode && styles.darkText]}>
                    Live Form Connection
                  </Text>
                  <Text style={[styles.appointmentManagementSectionText, isDarkMode && styles.darkTextSecondary]}>
                    This panel controls the existing visitor Appointment Request screen. There is no separate queue or duplicate data source.
                  </Text>
                  <View style={styles.appointmentConfigConnectionList}>
                    {configSections.map((section) => {
                      const options = appointmentManagementOptions[section.key] || [];
                      const enabledCount = options.filter((option) => option.enabled !== false).length;
                      return (
                        <View key={section.key} style={styles.appointmentConfigConnectionItem}>
                          <Ionicons name={section.icon} size={16} color={ADMIN_BLUE} />
                          <Text style={[styles.appointmentConfigConnectionText, isDarkMode && styles.darkTextSecondary]}>
                            {section.title}: {enabledCount} visible / {options.length} total
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>
          </AdminSectionShell>
        </View>
      </ScrollView>
    );
  };

  const renderReportRecordsContent = () => {
    const historyStats = getHistoryStats();
    const filteredHistory = getFilteredHistory().filter((record) => {
      if (reportStatusFilter !== "all") {
        const recordStatus = record.reportType === "security_report" ? "reported" : getRequestStatus(record);
        if (recordStatus !== reportStatusFilter && record.status !== reportStatusFilter) return false;
      }
      return recordMatchesSearch(record, reportSearchTerm, [
        "fullName",
        "email",
        "purposeOfVisit",
        "reportReason",
        "assignedOffice",
        "appointmentDepartment",
        "host",
        "status",
        "approvalStatus",
        "appointmentStatus",
        "reporterName",
        (item) => getRequestStatus(item),
        (item) => [item.reportedAt, item.visitDate, item.createdAt].filter(Boolean).map(formatDateTime),
      ]);
    });
    const reportRecordsPageCount = Math.max(
      1,
      Math.ceil(filteredHistory.length / reportRecordsItemsPerPage),
    );
    const activeReportRecordsPage = Math.min(reportRecordsPage, reportRecordsPageCount);
    const paginatedReportRecords = filteredHistory.slice(
      (activeReportRecordsPage - 1) * reportRecordsItemsPerPage,
      activeReportRecordsPage * reportRecordsItemsPerPage,
    );

    return (
      <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.pageContainer}>
          <AdminSectionShell
            title="Report Records"
          subtitle="Use the built-in history stream as a report-ready ledger for completed, pending, and rejected visits."
          badge={`${filteredHistory.length} visible`}
          isDarkMode={isDarkMode}
          theme={theme}
          actions={
            <View style={styles.adminSectionShellActions}>
              <TouchableOpacity style={styles.pageRefreshButton} onPress={loadVisitorHistory}>
                <Ionicons name="refresh-outline" size={22} color={ADMIN_BLUE} />
              </TouchableOpacity>
              {renderRecordListPrintButton({
                label: "Print Records",
                color: ADMIN_BLUE,
                disabled: !filteredHistory.length,
                onPress: () => handlePrintReports(filteredHistory),
              })}
            </View>
          }
        >
            <View style={styles.modularCardGrid}>
              {[
                { label: "Total History", value: historyStats.totalVisits, color: ADMIN_BLUE },
                { label: "Completed", value: historyStats.completedVisits, color: ADMIN_BLUE },
                { label: "Pending", value: historyStats.pendingVisits, color: ADMIN_BLUE },
                { label: "Rejected", value: historyStats.rejected, color: ADMIN_BLUE },
                { label: "Security Reports", value: historyStats.reported, color: ADMIN_BLUE },
              ].map((item) => (
                <View
                  key={item.label}
                  style={[
                    styles.modularStatCard,
                    {
                      backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                      borderColor: theme.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.modularStatValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={[styles.modularStatLabel, isDarkMode && styles.darkTextSecondary]}>{item.label}</Text>
                </View>
              ))}
            </View>

            {renderAdminRecordToolbar({
              searchTitle: "Search Report Records",
              searchValue: reportSearchTerm,
              onSearchChange: (value) => {
                setReportSearchTerm(value);
                setReportRecordsPage(1);
              },
              searchPlaceholder: "Search visitor, office, purpose, date, or status...",
              searchSubtitle: "Find report rows by visitor, office, purpose, date, reporter, or status.",
              hasSearch: Boolean(reportSearchTerm),
              onClearSearch: () => {
                setReportSearchTerm("");
                setReportRecordsPage(1);
              },
              filterTitle: "Filters",
              filterSubtitle: "Narrow report records by status or security report type.",
              hasFilters: reportStatusFilter !== "all",
              onResetFilters: () => {
                setReportStatusFilter("all");
                setReportRecordsPage(1);
              },
              filterGroups: [
                {
                  label: "Status",
                  value: reportStatusFilter,
                  icon: "layers-outline",
                  options: [
                    { label: "All", value: "all" },
                    { label: "Completed", value: "completed" },
                    { label: "Pending", value: "pending" },
                    { label: "Rejected", value: "rejected" },
                    { label: "Security Reports", value: "reported" },
                  ],
                  onSelect: (value) => {
                    setReportStatusFilter(value);
                    setReportRecordsPage(1);
                  },
                },
              ],
            })}

            {renderAdminTable({
              rows: paginatedReportRecords,
              keyExtractor: (visitor) => visitor._id || visitor.id || `${visitor.email}-${visitor.visitDate}`,
              emptyTitle: "No report records",
              emptySubtitle: "There are no report rows to display with the current filters.",
              emptyIcon: "document-text-outline",
              emptyActionLabel: "Reload Records",
              onEmptyAction: loadAllVisitRequests,
              columns: [
                {
                  key: "visitor",
                  label: "Visitor",
                  width: 220,
                  render: (visitor) => (
                    <View>
                      <Text style={[styles.adminTablePrimaryText, isDarkMode && styles.darkText]}>
                        {visitor.fullName || `${visitor.firstName || ""} ${visitor.lastName || ""}`.trim() || "Visitor"}
                      </Text>
                      <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                        {visitor.email || "-"}
                      </Text>
                    </View>
                  ),
                },
                {
                  key: "purpose",
                  label: "Purpose",
                  width: 210,
                  render: (visitor) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                      {visitor.reportType === "security_report"
                        ? `Reported: ${visitor.reportReason || "-"}`
                        : visitor.purposeOfVisit || "-"}
                    </Text>
                  ),
                },
                {
                  key: "office",
                  label: "Office",
                  width: 170,
                  render: (visitor) => (
                    <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                      {visitor.assignedOffice || visitor.host || "-"}
                    </Text>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  width: 120,
                  render: (visitor) => {
                    const statusInfo = visitor.reportType === "security_report"
                      ? { bg: "rgba(220,38,38,0.12)", text: "#DC2626", label: "Reported" }
                      : getStatusColor(getRequestStatus(visitor));
                    return (
                      <View style={[styles.dashboardStatusBadge, { backgroundColor: statusInfo.bg, alignSelf: "flex-start" }]}>
                        <Text style={[styles.dashboardStatusText, { color: statusInfo.text }]}>
                          {statusInfo.label}
                        </Text>
                      </View>
                    );
                  },
                },
                {
                  key: "visitDate",
                  label: "Visit Date",
                  width: 170,
                  render: (visitor) => (
                    <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                      {formatDateTime(visitor.reportedAt || visitor.visitDate || visitor.createdAt)}
                    </Text>
                  ),
                },
                {
                  key: "reporter",
                  label: "Reporter",
                  width: 160,
                  render: (visitor) => (
                    <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                      {visitor.reportType === "security_report" ? visitor.reporterName || "Security" : "-"}
                    </Text>
                  ),
                },
              ],
            })}

            {filteredHistory.length ? (
              renderCompactPagination({
                currentPage: activeReportRecordsPage,
                totalPages: reportRecordsPageCount,
                itemCount: filteredHistory.length,
                itemLabel: "records",
                onPrevious: () => setReportRecordsPage((currentValue) => Math.max(1, currentValue - 1)),
                onNext: () =>
                  setReportRecordsPage((currentValue) =>
                    Math.min(reportRecordsPageCount, currentValue + 1),
                  ),
              })
            ) : null}
          </AdminSectionShell>
        </View>
      </ScrollView>
    );
  };

  const renderSecurityReportRecordsContent = () => {
    const filteredSecurityReportRecords = securityReportRecords.filter((record) => {
      if (securityReportStatusFilter === "open" && record.resolved) return false;
      if (securityReportStatusFilter === "resolved" && !record.resolved) return false;
      return recordMatchesSearch(record, securityReportSearchTerm, [
        "fullName",
        "email",
        "reportReason",
        "assignedOffice",
        "appointmentDepartment",
        "host",
        "reporterName",
        (item) => (item.resolved ? "resolved" : "open"),
        (item) => [item.reportedAt, item.createdAt].filter(Boolean).map(formatDateTime),
      ]);
    });
    const securityReportRecordsPageCount = Math.max(
      1,
      Math.ceil(filteredSecurityReportRecords.length / securityReportRecordsItemsPerPage),
    );
    const activeSecurityReportRecordsPage = Math.min(securityReportRecordsPage, securityReportRecordsPageCount);
    const paginatedSecurityReportRecords = filteredSecurityReportRecords.slice(
      (activeSecurityReportRecordsPage - 1) * securityReportRecordsItemsPerPage,
      activeSecurityReportRecordsPage * securityReportRecordsItemsPerPage,
    );

    return (
      <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.pageContainer}>
          <AdminSectionShell
            title="Security Reports"
            subtitle="Reports filed by security and guard users are separated here for review and follow-up."
            badge={`${filteredSecurityReportRecords.length} visible`}
            isDarkMode={isDarkMode}
            theme={theme}
            actions={
              <View style={styles.adminSectionShellActions}>
                <TouchableOpacity style={styles.pageRefreshButton} onPress={loadVisitorHistory}>
                  <Ionicons name="refresh-outline" size={22} color={ADMIN_BLUE} />
                </TouchableOpacity>
                {renderRecordListPrintButton({
                  label: "Print Reports",
                  color: ADMIN_BLUE,
                  disabled: !filteredSecurityReportRecords.length,
                  onPress: () => handlePrintSecurityReports(filteredSecurityReportRecords),
                })}
              </View>
            }
          >
          <View style={styles.modularCardGrid}>
            {[
              { label: "Total Reports", value: securityReportRecords.length, color: ADMIN_BLUE },
              { label: "Open", value: securityReportRecords.filter((item) => !item.resolved).length, color: ADMIN_BLUE },
              { label: "Resolved", value: securityReportRecords.filter((item) => item.resolved).length, color: ADMIN_BLUE },
            ].map((item) => (
              <View
                key={item.label}
                style={[
                  styles.modularStatCard,
                  {
                    backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <Text style={[styles.modularStatValue, { color: item.color }]}>{item.value}</Text>
                <Text style={[styles.modularStatLabel, isDarkMode && styles.darkTextSecondary]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {renderAdminRecordToolbar({
            searchTitle: "Search Security Reports",
            searchValue: securityReportSearchTerm,
            onSearchChange: (value) => {
              setSecurityReportSearchTerm(value);
              setSecurityReportRecordsPage(1);
            },
            searchPlaceholder: "Search visitor, incident, office, reporter, or date...",
            searchSubtitle: "Find security reports by visitor, incident, office, reporter, or date.",
            hasSearch: Boolean(securityReportSearchTerm),
            onClearSearch: () => {
              setSecurityReportSearchTerm("");
              setSecurityReportRecordsPage(1);
            },
            filterTitle: "Filters",
            filterSubtitle: "Narrow security reports by review status.",
            hasFilters: securityReportStatusFilter !== "all",
            onResetFilters: () => {
              setSecurityReportStatusFilter("all");
              setSecurityReportRecordsPage(1);
            },
            filterGroups: [
              {
                label: "Status",
                value: securityReportStatusFilter,
                icon: "shield-checkmark-outline",
                options: [
                  { label: "All", value: "all" },
                  { label: "Open", value: "open" },
                  { label: "Resolved", value: "resolved" },
                ],
                onSelect: (value) => {
                  setSecurityReportStatusFilter(value);
                  setSecurityReportRecordsPage(1);
                },
              },
            ],
          })}

          {renderAdminTable({
            rows: paginatedSecurityReportRecords,
            keyExtractor: (record) => record._id || `${record.email}-${record.reportedAt}-${record.reportReason}`,
            emptyTitle: "No security reports",
            emptySubtitle: "Reports submitted by security or guard accounts will appear here.",
            emptyIcon: "shield-checkmark-outline",
            emptyActionLabel: "Reload Reports",
            onEmptyAction: loadAllVisitRequests,
            columns: [
              {
                key: "visitor",
                label: "Visitor",
                width: 220,
                render: (record) => (
                  <View>
                    <Text style={[styles.adminTablePrimaryText, isDarkMode && styles.darkText]}>
                      {record.fullName || "Visitor"}
                    </Text>
                    <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                      {record.email || "-"}
                    </Text>
                  </View>
                ),
              },
              {
                key: "reason",
                label: "Reason",
                width: 280,
                render: (record) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                    {record.reportReason || "-"}
                  </Text>
                ),
              },
              {
                key: "office",
                label: "Office",
                width: 170,
                render: (record) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                    {record.assignedOffice || record.appointmentDepartment || record.host || "-"}
                  </Text>
                ),
              },
              {
                key: "reporter",
                label: "Reported By",
                width: 180,
                render: (record) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                    {record.reporterName || "Security"}
                  </Text>
                ),
              },
              {
                key: "reportedAt",
                label: "Reported At",
                width: 170,
                render: (record) => (
                  <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                    {formatDateTime(record.reportedAt || record.createdAt)}
                  </Text>
                ),
              },
              {
                key: "status",
                label: "Status",
                width: 130,
                render: (record) => (
                  <View
                    style={[
                      styles.dashboardStatusBadge,
                      {
                        backgroundColor: record.resolved ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.12)",
                        alignSelf: "flex-start",
                      },
                    ]}
                  >
                    <Text style={[styles.dashboardStatusText, { color: record.resolved ? "#10B981" : "#DC2626" }]}>
                      {record.resolved ? "Resolved" : "Open"}
                    </Text>
                  </View>
                ),
              },
            ],
          })}

          {filteredSecurityReportRecords.length ? (
            renderCompactPagination({
              currentPage: activeSecurityReportRecordsPage,
              totalPages: securityReportRecordsPageCount,
              itemCount: filteredSecurityReportRecords.length,
              itemLabel: "reports",
              onPrevious: () => setSecurityReportRecordsPage((currentValue) => Math.max(1, currentValue - 1)),
              onNext: () =>
                setSecurityReportRecordsPage((currentValue) =>
                  Math.min(securityReportRecordsPageCount, currentValue + 1),
                ),
            })
          ) : null}
          </AdminSectionShell>
        </View>
      </ScrollView>
    );
  };

  const renderAnalyticsContent = () => {
    const chart = getCurrentChartData();
    const historyStats = getHistoryStats();
    const filteredHistory = getFilteredHistory();
    const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / historyItemsPerPage));
    const safeHistoryPage = Math.min(historyPage, historyTotalPages);
    const historyStartIndex = (safeHistoryPage - 1) * historyItemsPerPage;
    const paginatedHistory = filteredHistory.slice(historyStartIndex, historyStartIndex + historyItemsPerPage);
    const historyVisibleStart = filteredHistory.length ? historyStartIndex + 1 : 0;
    const historyVisibleEnd = Math.min(historyStartIndex + historyItemsPerPage, filteredHistory.length);
    const activeDatasetLabel = activeChartDataset.charAt(0).toUpperCase() + activeChartDataset.slice(1);
    const selectedDateLabel = selectedDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const totalRequests = stats.totalRequests || 0;
    const approvalRate = totalRequests > 0 ? Math.round((stats.approvedRequests / totalRequests) * 100) : 0;
    const chartTotal = (chart?.data || []).reduce((sum, value) => sum + value, 0);
    const chartPeakValue = Math.max(...(chart?.data || [0]), 0);
    const chartPeakIndex = chart?.data?.findIndex((value) => value === chartPeakValue) ?? -1;
    const chartPeakLabel = chartPeakIndex >= 0 ? chart?.labels?.[chartPeakIndex] : "N/A";
    const chartAverage = chart?.data?.length ? (chartTotal / chart.data.length).toFixed(1) : "0.0";
    const chartInsightText = chartPeakValue > 0
      ? `${chartPeakLabel} is the busiest ${activeChartDataset} window with ${chartPeakValue} requests logged.`
      : `No ${activeChartDataset} trend data is available yet.`;
    const selectedDateVisitors = [...(dateAnalytics.visitors || [])].sort(
      (a, b) => new Date(a.visitTime || a.visitDate) - new Date(b.visitTime || b.visitDate)
    );
    const selectedDateApprovalRate = dateAnalytics.total > 0
      ? Math.round((dateAnalytics.approved / dateAnalytics.total) * 100)
      : 0;
    const filteredTodayCount = filteredHistory.filter((visitor) => {
      if (!visitor?.visitDate) return false;
      return new Date(visitor.visitDate).toDateString() === new Date().toDateString();
    }).length;
    const distributionItems = [
      { key: "approved", label: "Approved", value: stats.approvedRequests || 0, color: ADMIN_BLUE },
      { key: "pending", label: "Pending", value: stats.pendingRequests || 0, color: ADMIN_BLUE },
      { key: "rejected", label: "Rejected", value: stats.rejectedRequests || 0, color: ADMIN_BLUE },
    ];
    const topDistributionItem = [...distributionItems].sort((a, b) => b.value - a.value)[0];
    const metricCards = [
      {
        key: "total",
        icon: "layers-outline",
        label: "Total Requests",
        value: totalRequests,
        accent: "#1C6DD0",
        helper: "All recorded visitor requests",
      },
      {
        key: "approval",
        icon: "checkmark-done-outline",
        label: "Approval Rate",
        value: `${approvalRate}%`,
        accent: ADMIN_BLUE,
        helper: `${stats.approvedRequests || 0} approved requests`,
      },
      {
        key: "today",
        icon: "today-outline",
        label: "Today Visits",
        value: stats.todayVisits || 0,
        accent: "#F97316",
        helper: "Scheduled for today",
      },
      {
        key: "upcoming",
        icon: "time-outline",
        label: "Upcoming",
        value: stats.upcomingVisits || 0,
        accent: "#1C6DD0",
        helper: "Approved future visits",
      },
    ];
    const officeVisitMap = new Map();
    const addOfficeVisit = (officeLabel, groupKey) => {
      const label = String(officeLabel || "").trim();
      const key = normalizeFilterValue(label);
      if (!key || !["students", "visitors", "staff"].includes(groupKey)) return;

      const current = officeVisitMap.get(key) || {
        key,
        label,
        students: 0,
        visitors: 0,
        staff: 0,
        total: 0,
      };
      current[groupKey] += 1;
      current.total += 1;
      officeVisitMap.set(key, current);
    };

    attendanceRecords.forEach((record) => {
      const userType = String(record?.userType || record?.role || "").toLowerCase();
      const office = record?.location ||
        record?.checkpointIn ||
        record?.checkpointOut ||
        record?.checkpointHistory?.[record.checkpointHistory.length - 1]?.office;

      if (["student", "teacher"].includes(userType)) {
        addOfficeVisit(office, "students");
      } else if (["staff", "security", "guard"].includes(userType)) {
        addOfficeVisit(office, "staff");
      }
    });

    (visitorHistory.length ? visitorHistory : visitRequests).forEach((visitor) => {
      addOfficeVisit(
        visitor?.currentLocation?.office ||
          visitor?.assignedOffice ||
          visitor?.appointmentDepartment ||
          visitor?.host ||
          visitor?.destination,
        "visitors",
      );
    });

    const mostVisitedOfficeItems = Array.from(officeVisitMap.values())
      .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
      .slice(0, 8);
    const topVisitedOffice = mostVisitedOfficeItems[0] || null;
    const aiAnalyticsInsights = AIService.generateAnalyticsInsights({
      topVisitedOffice,
      mostVisitedOfficeItems,
      stats,
      distributionItems,
      approvalRate,
      chartPeakLabel,
      chartPeakValue,
      attendanceCount: attendanceRecords.length,
      visitorCount: visitorHistory.length || visitRequests.length,
    });
    const historyFilters = [
      { key: "all", label: "All" },
      { key: "pending", label: "Pending" },
      { key: "approved", label: "Approved" },
      { key: "checked_in", label: "Checked In" },
      { key: "checked_out", label: "Checked Out" },
      { key: "rejected", label: "Rejected" },
      { key: "reported", label: "Reported" },
    ];

    return (
      <ScrollView
        style={styles.contentScrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.analyticsContainer}
      >
        <View style={[styles.analyticsHeader, width < 900 && { flexDirection: "column", gap: 14 }]}>
          <View>
            <Text style={styles.analyticsEyebrow}>Operations Intelligence</Text>
            <Text style={[styles.analyticsHeaderTitle, { color: theme.textPrimary }]}>Analytics</Text>
            <Text style={[styles.analyticsHeaderSubtitle, { color: theme.textSecondary }]}>
              Monitor request momentum, scheduled arrivals, and visitor outcomes from one place.
            </Text>
          </View>
          <View style={styles.analyticsHeaderActions}>
            <TouchableOpacity
              style={[styles.analyticsActionButton, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}
              onPress={onRefresh}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={16} color="#1C6DD0" />
              <Text style={styles.analyticsActionButtonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.analyticsActionButton, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={16} color="#1C6DD0" />
              <Text style={styles.analyticsActionButtonText}>Pick Date</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.analyticsHeroCard,
            width < 960 && { flexDirection: "column" },
            { backgroundColor: theme.cardBackground, borderColor: theme.borderColor },
          ]}
        >
          <View style={styles.analyticsHeroContent}>
            <View style={[styles.analyticsHeroBadge, { backgroundColor: isDarkMode ? "#041E42" : "#EEF5FF" }]}>
              <Ionicons name="pulse-outline" size={14} color="#6366F1" />
              <Text style={styles.analyticsHeroBadgeText}>Operational Snapshot</Text>
            </View>
            <Text style={[styles.analyticsHeroTitle, { color: theme.textPrimary }]}>
              {dateAnalytics.total > 0
                ? `${dateAnalytics.total} visit request${dateAnalytics.total > 1 ? "s are" : " is"} scheduled for ${selectedDateLabel}.`
                : `No visit requests are scheduled for ${selectedDateLabel}.`}
            </Text>
            <Text style={[styles.analyticsHeroSubtitle, { color: theme.textSecondary }]}>
              Approval rate is currently {approvalRate}% with {stats.upcomingVisits || 0} approved visit
              {stats.upcomingVisits === 1 ? "" : "s"} still upcoming.
            </Text>
            <View style={styles.analyticsHeroInsightRow}>
              <View style={[styles.analyticsHeroInsightCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                <Text style={[styles.analyticsHeroInsightLabel, { color: theme.textSecondary }]}>Selected Date</Text>
                <Text style={[styles.analyticsHeroInsightValue, { color: theme.textPrimary }]}>{selectedDateLabel}</Text>
              </View>
              <View style={[styles.analyticsHeroInsightCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                <Text style={[styles.analyticsHeroInsightLabel, { color: theme.textSecondary }]}>Busiest Window</Text>
                <Text style={[styles.analyticsHeroInsightValue, { color: theme.textPrimary }]}>{chartPeakLabel || "N/A"}</Text>
              </View>
              <View style={[styles.analyticsHeroInsightCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                <Text style={[styles.analyticsHeroInsightLabel, { color: theme.textSecondary }]}>Active Visits</Text>
                <Text style={[styles.analyticsHeroInsightValue, { color: theme.textPrimary }]}>{historyStats.checkedIn}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.analyticsHeroStats, width < 960 && { width: "100%", flexDirection: "row" }]}>
            <View style={[styles.analyticsHeroStat, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
              <Text style={[styles.analyticsHeroStatValue, { color: theme.textPrimary }]}>{historyStats.uniqueEmails}</Text>
              <Text style={[styles.analyticsHeroStatLabel, { color: theme.textSecondary }]}>Unique Visitors</Text>
            </View>
            <View style={[styles.analyticsHeroStat, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
              <Text style={[styles.analyticsHeroStatValue, { color: theme.textPrimary }]}>{stats.weeklyGrowth || 0}%</Text>
              <Text style={[styles.analyticsHeroStatLabel, { color: theme.textSecondary }]}>7d Activity</Text>
            </View>
          </View>
        </View>

        <View style={styles.keyMetricsRow}>
          {metricCards.map((card) => (
            <View
              key={card.key}
              style={[styles.keyMetricCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}
            >
              <View style={[styles.keyMetricIcon, { backgroundColor: `${card.accent}15` }]}>
                <Ionicons name={card.icon} size={22} color={card.accent} />
              </View>
              <View style={styles.analyticsMetricContent}>
                <Text style={[styles.keyMetricValue, { color: theme.textPrimary }]}>{card.value}</Text>
                <Text style={[styles.keyMetricLabel, { color: theme.textSecondary }]}>{card.label}</Text>
                <Text style={[styles.analyticsMetricHelper, { color: theme.textSecondary }]}>{card.helper}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.analyticsAiCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
          <View style={styles.analyticsAiHeader}>
            <View style={[styles.analyticsAiIcon, { backgroundColor: isDarkMode ? "#172554" : "#EFF6FF" }]}>
              <Ionicons name="sparkles-outline" size={22} color={ADMIN_BLUE} />
            </View>
            <View style={styles.analyticsAiTitleBlock}>
              <Text style={[styles.analyticsAiEyebrow, { color: ADMIN_BLUE }]}>AI Analytics Assistant</Text>
              <Text style={[styles.analyticsAiTitle, { color: theme.textPrimary }]}>Operational insight</Text>
            </View>
            <View style={[styles.analyticsAiConfidenceBadge, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
              <Text style={[styles.analyticsAiConfidenceText, { color: theme.textSecondary }]}>
                {aiAnalyticsInsights.confidence} confidence
              </Text>
            </View>
          </View>

          <Text style={[styles.analyticsAiSummary, { color: theme.textPrimary }]}>
            {aiAnalyticsInsights.summary}
          </Text>

          <View style={styles.analyticsAiGrid}>
            <View style={[styles.analyticsAiPanel, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
              <Text style={[styles.analyticsAiPanelTitle, { color: theme.textPrimary }]}>What AI noticed</Text>
              {aiAnalyticsInsights.observations.map((item, index) => (
                <View key={`ai-observation-${index}`} style={styles.analyticsAiListItem}>
                  <View style={[styles.analyticsAiBullet, { backgroundColor: ADMIN_BLUE }]} />
                  <Text style={[styles.analyticsAiListText, { color: theme.textSecondary }]}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.analyticsAiPanel, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
              <Text style={[styles.analyticsAiPanelTitle, { color: theme.textPrimary }]}>Suggested actions</Text>
              {aiAnalyticsInsights.actions.map((item, index) => (
                <View key={`ai-action-${index}`} style={styles.analyticsAiListItem}>
                  <Ionicons name="checkmark-circle-outline" size={15} color="#10B981" />
                  <Text style={[styles.analyticsAiListText, { color: theme.textSecondary }]}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.mainStatCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor, marginBottom: 20 }]}>
          <View style={styles.analyticsChartHeader}>
            <View>
              <Text style={[styles.distributionTitle, { color: theme.textPrimary, marginBottom: 4 }]}>Most Visited Offices</Text>
              <Text style={[styles.analyticsChartSubtitle, { color: theme.textSecondary }]}>
                Compare student, visitor, and staff office traffic from attendance taps and visit records.
              </Text>
            </View>
            <View style={styles.analyticsMiniLegend}>
              {[
                { label: "Students", color: "#0A3D91" },
                { label: "Visitors", color: "#F97316" },
                { label: "Staff", color: "#7C3AED" },
              ].map((item) => (
                <View key={item.label} style={styles.analyticsMiniLegendItem}>
                  <View style={[styles.analyticsMiniLegendDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.analyticsMiniLegendText, { color: theme.textSecondary }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.analyticsChartCallout, { backgroundColor: isDarkMode ? "#172554" : "#EFF6FF", borderColor: isDarkMode ? "#041E42" : "#B7D5F6" }]}>
            <Ionicons name="business-outline" size={18} color={ADMIN_BLUE} />
            <Text style={[styles.analyticsChartCalloutText, { color: isDarkMode ? "#B7D5F6" : "#1E40AF", flex: 1 }]}>
              {topVisitedOffice
                ? `${topVisitedOffice.label} is currently the most visited office with ${topVisitedOffice.total} recorded interaction${topVisitedOffice.total === 1 ? "" : "s"}.`
                : "No office traffic has been recorded yet."}
            </Text>
          </View>

          <View style={[styles.analyticsChartSurface, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
            {renderMostVisitedOfficeChart(mostVisitedOfficeItems)}
          </View>
        </View>

        <View style={[styles.analyticsSplitGrid, width < 1200 && styles.analyticsSplitGridStack]}>
          <View style={styles.analyticsPrimaryColumn}>
            <View style={[styles.mainStatCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
              <View style={styles.analyticsChartHeader}>
                <View>
                  <Text style={[styles.distributionTitle, { color: theme.textPrimary, marginBottom: 4 }]}>Visitor Trend</Text>
                  <Text style={[styles.analyticsChartSubtitle, { color: theme.textSecondary }]}>
                    Compare {activeChartDataset} request activity and spot the busiest period quickly.
                  </Text>
                </View>
                <View style={[styles.analyticsDatasetSelector, { backgroundColor: isDarkMode ? "#0F172A" : "#F1F5F9" }]}>
                  {["daily", "weekly", "monthly"].map((dataset) => (
                    <TouchableOpacity
                      key={dataset}
                      style={[
                        styles.analyticsDatasetButton,
                        activeChartDataset === dataset && styles.analyticsDatasetButtonActive,
                      ]}
                      onPress={() => setActiveChartDataset(dataset)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.analyticsDatasetButtonText,
                          { color: activeChartDataset === dataset ? "#FFFFFF" : theme.textSecondary },
                        ]}
                      >
                        {dataset.charAt(0).toUpperCase() + dataset.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={[styles.analyticsChartCallout, { backgroundColor: isDarkMode ? "#172554" : "#EFF6FF", borderColor: isDarkMode ? "#041E42" : "#B7D5F6" }]}>
                <View style={styles.analyticsChartCalloutCopy}>
                  <Text style={[styles.analyticsChartCalloutTitle, { color: isDarkMode ? "#EEF5FF" : "#041E42" }]}>
                    {activeDatasetLabel} trend insight
                  </Text>
                  <Text style={[styles.analyticsChartCalloutText, { color: isDarkMode ? "#B7D5F6" : "#1E40AF" }]}>
                    {chartInsightText}
                  </Text>
                </View>
                <View style={styles.analyticsMiniLegend}>
                  {distributionItems.map((item) => (
                    <View key={item.key} style={styles.analyticsMiniLegendItem}>
                      <View style={[styles.analyticsMiniLegendDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.analyticsMiniLegendText, { color: isDarkMode ? "#EEF5FF" : "#1E3A8A" }]}>
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.analyticsQuickStatsRow}>
                <View style={[styles.analyticsQuickStat, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.analyticsQuickStatValue, { color: theme.textPrimary }]}>{chartTotal}</Text>
                  <Text style={[styles.analyticsQuickStatLabel, { color: theme.textSecondary }]}>Total Volume</Text>
                </View>
                <View style={[styles.analyticsQuickStat, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.analyticsQuickStatValue, { color: theme.textPrimary }]}>{chartPeakLabel || "N/A"}</Text>
                  <Text style={[styles.analyticsQuickStatLabel, { color: theme.textSecondary }]}>Busiest Period</Text>
                </View>
                <View style={[styles.analyticsQuickStat, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.analyticsQuickStatValue, { color: theme.textPrimary }]}>{chartAverage}</Text>
                  <Text style={[styles.analyticsQuickStatLabel, { color: theme.textSecondary }]}>Average</Text>
                </View>
              </View>

              <View style={[styles.analyticsChartSurface, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                {renderBarChart(chart.labels, chart.data)}
              </View>
            </View>

            <View style={[styles.historyCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
              <View style={styles.historyHeader}>
                <View>
                  <Text style={[styles.historyTitle, { color: theme.textPrimary }]}>Visitor History</Text>
                  <Text style={[styles.analyticsChartSubtitle, { color: theme.textSecondary }]}>
                    Search and filter recent visitor records by status.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.historyRefreshButton, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE" }]}
                  onPress={onRefresh}
                >
                  <Ionicons name="refresh-outline" size={16} color="#1C6DD0" />
                </TouchableOpacity>
              </View>

              <View style={styles.historyOverviewRow}>
                <View style={[styles.historyOverviewCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.historyOverviewValue, { color: theme.textPrimary }]}>{filteredHistory.length}</Text>
                  <Text style={[styles.historyOverviewLabel, { color: theme.textSecondary }]}>Visible Records</Text>
                </View>
                <View style={[styles.historyOverviewCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.historyOverviewValue, { color: theme.textPrimary }]}>{filteredTodayCount}</Text>
                  <Text style={[styles.historyOverviewLabel, { color: theme.textSecondary }]}>Scheduled Today</Text>
                </View>
                <View style={[styles.historyOverviewCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.historyOverviewValue, { color: theme.textPrimary }]}>{historyStats.checkedOut}</Text>
                  <Text style={[styles.historyOverviewLabel, { color: theme.textSecondary }]}>Completed Visits</Text>
                </View>
              </View>

              <View
                style={[
                  styles.historyToolbarWrap,
                  {
                    backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE",
                    borderColor: isDarkMode ? "rgba(148, 163, 184, 0.16)" : theme.borderColor,
                  },
                ]}
              >
                {renderAdminRecordToolbar({
                  searchTitle: "Search Visitor History",
                  searchValue: historySearchTerm,
                  onSearchChange: (value) => {
                    setHistorySearchTerm(value);
                    setHistorySearchQuery(value.trim());
                    setHistoryPage(1);
                  },
                  searchPlaceholder: "Search visitor, email, office, purpose, status, or date...",
                  searchSubtitle: "Find visitor records by name, email, office, purpose, status, or exact date.",
                  hasSearch: Boolean(historySearchTerm || historySearchQuery),
                  onClearSearch: () => {
                    setHistorySearchTerm("");
                    setHistorySearchQuery("");
                    setHistoryPage(1);
                  },
                  filterTitle: "Filters",
                  filterSubtitle: "Narrow visitor history by status, date, office, and time order.",
                  hasFilters:
                    historyFilter !== "all" ||
                    historyDateFilter !== "all" ||
                    historyOfficeFilter !== "all" ||
                    historySortOrder !== "newest" ||
                    Boolean(historyDateRange.startDate || historyDateRange.endDate),
                  onResetFilters: () => {
                    setHistoryFilter("all");
                    setHistoryDateFilter("all");
                    setHistoryOfficeFilter("all");
                    setHistoryDateRange({ startDate: null, endDate: null });
                    setHistorySortOrder("newest");
                    setHistoryPage(1);
                  },
                  filterGroups: [
                    {
                      label: "Status",
                      value: historyFilter,
                      icon: "layers-outline",
                      options: historyFilters.map((filter) => ({
                        label: `${filter.label}${typeof filter.count === "number" ? ` (${filter.count})` : ""}`,
                        value: filter.key,
                      })),
                      onSelect: setHistoryFilter,
                    },
                    {
                      label: "Date Range",
                      value: historyDateFilter,
                      icon: "calendar-outline",
                      options: dateShortcutFilters.map((filter) => ({
                        label: filter.label,
                        value: filter.key,
                      })),
                      onSelect: setHistoryDateFilter,
                    },
                    {
                      label: "Office",
                      value: historyOfficeFilter,
                      icon: "business-outline",
                      options: historyOfficeFilterOptions.map((filter) => ({
                        label: `${filter.label}${typeof filter.count === "number" ? ` (${filter.count})` : ""}`,
                        value: filter.key,
                      })),
                      onSelect: setHistoryOfficeFilter,
                    },
                    {
                      label: "Time Order",
                      value: historySortOrder,
                      icon: "swap-vertical-outline",
                      options: [
                        { label: "Newest First", value: "newest" },
                        { label: "Oldest First", value: "oldest" },
                      ],
                      onSelect: setHistorySortOrder,
                    },
                  ],
                  filterFooter: renderDateRangeControls({
                    accent: "#1C6DD0",
                    startDate: historyDateRange.startDate,
                    endDate: historyDateRange.endDate,
                    startField: "history-start",
                    endField: "history-end",
                    onPickStart: () => setActiveFilterDateField("history-start"),
                    onPickEnd: () => setActiveFilterDateField("history-end"),
                    onClear: () => {
                      setHistoryDateRange({ startDate: null, endDate: null });
                      setHistoryPage(1);
                    },
                  }),
                })}
              </View>

              <View style={styles.historyResultsHeader}>
                <View>
                  <Text style={[styles.historyResultsTitle, { color: theme.textPrimary }]}>
                    Visitor Identification
                  </Text>
                  <Text style={[styles.historyResultsSubtitle, { color: theme.textSecondary }]}>
                    Names, SafePass IDs, NFC UIDs, schedules, and status.
                  </Text>
                </View>
                <Text style={[styles.historyResultsCount, { color: theme.textSecondary }]}>
                  {filteredHistory.length} record{filteredHistory.length === 1 ? "" : "s"}
                </Text>
              </View>

              {filteredHistory.length === 0 ? (
                <View style={styles.emptyHistoryState}>
                  <Ionicons name="search-outline" size={42} color={theme.textSecondary} />
                  <Text style={[styles.emptyHistoryTitle, { color: theme.textPrimary }]}>No matching history</Text>
                  <Text style={[styles.emptyHistorySubtitle, { color: theme.textSecondary }]}>
                    Try adjusting your status filter or search term.
                  </Text>
                </View>
              ) : (
                <>
                {paginatedHistory.map((visitor) => {
                  const statusInfo = getStatusColor(visitor.status);
                  const isToday =
                    visitor.visitDate &&
                    new Date(visitor.visitDate).toDateString() === new Date().toDateString();

                  return (
                    <View
                      key={visitor._id || visitor.id || `${visitor.email}-${visitor.visitDate}`}
                      style={[styles.historyItem, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}
                    >
                      <View style={styles.historyItemHeader}>
                        <View style={[styles.historyItemAvatar, { backgroundColor: isDarkMode ? "#1E293B" : "#EFF6FF" }]}>
                          <Text style={styles.historyItemAvatarText}>
                            {(visitor.fullName || "V")
                              .split(" ")
                              .map((name) => name[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.historyItemInfo}>
                          <Text style={[styles.historyItemName, { color: theme.textPrimary }]}>{visitor.fullName}</Text>
                          <Text style={[styles.historyItemEmail, { color: theme.textSecondary }]}>{visitor.email}</Text>
                          <Text style={[styles.historyItemEmail, { color: theme.textSecondary }]}>
                            SafePass ID: {getVisitorSafePassId(visitor)}
                          </Text>
                          <Text style={[styles.historyItemEmail, { color: theme.textSecondary }]}>
                            NFC UID: {getVisitorNfcUid(visitor)}
                          </Text>
                          <Text style={[styles.historyItemPurpose, { color: theme.textSecondary }]}>
                            {visitor.purposeOfVisit || "No purpose provided"}
                          </Text>
                        </View>
                        <View style={[styles.analyticsStatusBadge, { backgroundColor: statusInfo.bg }]}>
                          <Text style={[styles.analyticsStatusBadgeText, { color: statusInfo.text }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.historyItemDetails, { borderTopColor: theme.borderColor }]}>
                        <View style={styles.historyDetailItem}>
                          <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
                          <Text style={[styles.historyDetailText, { color: theme.textSecondary }]}>
                            {formatDate(visitor.visitDate)}
                          </Text>
                        </View>
                        <View style={styles.historyDetailItem}>
                          <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
                          <Text style={[styles.historyDetailText, { color: theme.textSecondary }]}>
                            {formatTime(visitor.visitTime)}
                          </Text>
                        </View>
                        <View style={styles.historyDetailItem}>
                          <Ionicons name="swap-horizontal-outline" size={14} color={isToday ? ADMIN_BLUE : theme.textSecondary} />
                          <Text
                            style={[
                              styles.historyDetailText,
                              isToday ? styles.historyTodayBadge : styles.historyPastBadge,
                            ]}
                          >
                            {isToday ? "Today" : "Past Schedule"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.userPaginationRow}>
                  <Text style={[styles.userPaginationSummary, { color: theme.textSecondary }]}>
                    Showing {historyVisibleStart}-{historyVisibleEnd} of {filteredHistory.length} records
                  </Text>
                  <View style={styles.userPaginationControls}>
                    <TouchableOpacity
                      style={[styles.userPaginationButton, safeHistoryPage === 1 && styles.userPaginationButtonDisabled]}
                      onPress={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      disabled={safeHistoryPage === 1}
                    >
                      <Ionicons name="chevron-back-outline" size={16} color={safeHistoryPage === 1 ? "#94A3B8" : "#334155"} />
                      <Text style={[styles.userPaginationButtonText, safeHistoryPage === 1 && styles.userPaginationButtonTextDisabled]}>
                        Previous
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.userPaginationSummary, { color: theme.textSecondary }]}>
                      Page {safeHistoryPage} of {historyTotalPages}
                    </Text>
                    <TouchableOpacity
                      style={[styles.userPaginationButton, safeHistoryPage >= historyTotalPages && styles.userPaginationButtonDisabled]}
                      onPress={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                      disabled={safeHistoryPage >= historyTotalPages}
                    >
                      <Text style={[styles.userPaginationButtonText, safeHistoryPage >= historyTotalPages && styles.userPaginationButtonTextDisabled]}>
                        Next
                      </Text>
                      <Ionicons name="chevron-forward-outline" size={16} color={safeHistoryPage >= historyTotalPages ? "#94A3B8" : "#334155"} />
                    </TouchableOpacity>
                  </View>
                </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.analyticsSideColumn}>
            <View style={[styles.distributionCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
              <View style={styles.analyticsPanelHeader}>
                <View>
                  <Text style={[styles.distributionTitle, { color: theme.textPrimary }]}>Selected Date Snapshot</Text>
                  <Text style={[styles.analyticsPanelSubtitle, { color: theme.textSecondary }]}>
                    Live schedule details and approval health for the chosen date.
                  </Text>
                </View>
                <View style={[styles.analyticsPanelPill, { backgroundColor: isDarkMode ? "#172554" : "#EFF6FF" }]}>
                  <Text style={[styles.analyticsPanelPillText, { color: "#1C6DD0" }]}>{selectedDateApprovalRate}% approved</Text>
                </View>
              </View>
              <View style={styles.analyticsDateSummaryRow}>
                <View style={[styles.analyticsDateSummaryCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.analyticsDateSummaryValue, { color: theme.textPrimary }]}>{dateAnalytics.total}</Text>
                  <Text style={[styles.analyticsDateSummaryLabel, { color: theme.textSecondary }]}>Total Visits</Text>
                </View>
                <View style={[styles.analyticsDateSummaryCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                  <Text style={[styles.analyticsDateSummaryValue, { color: theme.textPrimary }]}>{dateAnalytics.approved}</Text>
                  <Text style={[styles.analyticsDateSummaryLabel, { color: theme.textSecondary }]}>Approved</Text>
                </View>
              </View>

              <View style={[styles.analyticsDateCallout, { backgroundColor: isDarkMode ? "#172554" : "#EFF6FF", borderColor: isDarkMode ? "#041E42" : "#B7D5F6" }]}>
                <Ionicons name="calendar-clear-outline" size={18} color="#1C6DD0" />
                <View style={styles.analyticsDateCalloutTextWrap}>
                  <Text style={[styles.analyticsDateCalloutTitle, { color: theme.textPrimary }]}>{selectedDateLabel}</Text>
                  <Text style={[styles.analyticsDateCalloutSubtitle, { color: theme.textSecondary }]}>
                    Pending {dateAnalytics.pending} | Rejected {dateAnalytics.rejected}
                  </Text>
                </View>
              </View>

              <View style={styles.analyticsDateVisitorsList}>
                {selectedDateVisitors.length === 0 ? (
                  <View style={styles.emptyHistoryState}>
                    <Ionicons name="calendar-outline" size={36} color={theme.textSecondary} />
                    <Text style={[styles.emptyHistoryTitle, { color: theme.textPrimary }]}>No visitors scheduled</Text>
                    <Text style={[styles.emptyHistorySubtitle, { color: theme.textSecondary }]}>
                      Pick another date to inspect scheduled visits.
                    </Text>
                  </View>
                ) : (
                  selectedDateVisitors.slice(0, 5).map((visitor) => {
                    const statusInfo = getStatusColor(visitor.status);
                    return (
                      <View
                        key={visitor._id || visitor.id || `${visitor.email}-${visitor.visitDate}`}
                        style={[styles.analyticsDateVisitorItem, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}
                      >
                        <View style={styles.analyticsDateVisitorInfo}>
                          <Text style={[styles.analyticsDateVisitorName, { color: theme.textPrimary }]}>{visitor.fullName}</Text>
                          <Text style={[styles.analyticsDateVisitorMeta, { color: theme.textSecondary }]}>
                            {formatTime(visitor.visitTime)} | {visitor.purposeOfVisit || "Visit"}
                          </Text>
                        </View>
                        <View style={[styles.analyticsStatusBadge, { backgroundColor: statusInfo.bg }]}>
                          <Text style={[styles.analyticsStatusBadgeText, { color: statusInfo.text }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            <View style={[styles.distributionCard, { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
              <View style={styles.analyticsPanelHeader}>
                <View>
                  <Text style={[styles.distributionTitle, { color: theme.textPrimary }]}>Status Distribution</Text>
                  <Text style={[styles.analyticsPanelSubtitle, { color: theme.textSecondary }]}>
                    Compare how requests are progressing across the full system.
                  </Text>
                </View>
              </View>
              <View style={styles.distributionStats}>
                {distributionItems.map((item) => {
                  const percent = totalRequests > 0 ? Math.round((item.value / totalRequests) * 100) : 0;
                  return (
                    <View key={item.key} style={styles.distributionItem}>
                      <View style={[styles.distributionDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.distributionLabel, { color: theme.textPrimary }]}>{item.label}</Text>
                      <Text style={[styles.distributionValue, { color: theme.textPrimary }]}>{item.value}</Text>
                      <View style={[styles.distributionBar, { backgroundColor: isDarkMode ? "#334155" : "#E2E8F0" }]}>
                        <View
                          style={[
                            styles.distributionBarFill,
                            { width: `${percent}%`, backgroundColor: item.color },
                          ]}
                        />
                      </View>
                      <Text style={[styles.distributionPercent, { color: theme.textSecondary }]}>{percent}%</Text>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.analyticsDistributionCallout, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                <Ionicons name="analytics-outline" size={18} color={topDistributionItem?.color || "#1C6DD0"} />
                <Text style={[styles.analyticsDistributionCalloutText, { color: theme.textPrimary }]}>
                  {topDistributionItem?.label || "No status data"} currently leads with {topDistributionItem?.value || 0} request
                  {(topDistributionItem?.value || 0) === 1 ? "" : "s"}.
                </Text>
              </View>

              <View style={styles.analyticsDistributionFooter}>
                <View style={[styles.analyticsDistributionStat, { borderColor: theme.borderColor }]}>
                  <Text style={[styles.analyticsDistributionValue, { color: theme.textPrimary }]}>{historyStats.checkedIn}</Text>
                  <Text style={[styles.analyticsDistributionLabel, { color: theme.textSecondary }]}>Checked In</Text>
                </View>
                <View style={[styles.analyticsDistributionStat, { borderColor: theme.borderColor }]}>
                  <Text style={[styles.analyticsDistributionValue, { color: theme.textPrimary }]}>{historyStats.checkedOut}</Text>
                  <Text style={[styles.analyticsDistributionLabel, { color: theme.textSecondary }]}>Checked Out</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) {
                setSelectedDate(date);
                calculateDateAnalytics(date);
              }
            }}
          />
        )}
        {activeFilterDateField && (
          <DateTimePicker
            value={
              activeFilterDateField === "request-start"
                ? requestDateRange.startDate || new Date()
                : activeFilterDateField === "request-end"
                  ? requestDateRange.endDate || requestDateRange.startDate || new Date()
                  : activeFilterDateField === "history-start"
                    ? historyDateRange.startDate || new Date()
                    : historyDateRange.endDate || historyDateRange.startDate || new Date()
            }
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleFilterDateSelection}
          />
        )}
      </ScrollView>
    );
  };

  const renderSettingsContent = () => {
    const settingTabs = [
      { key: "account", label: "Account", icon: "person-circle-outline" },
      { key: "notifications", label: "Notifications", icon: "notifications-outline" },
      { key: "system", label: "System", icon: "server-outline" },
    ];
    const healthItems = [
      { label: "Database", value: systemHealth?.database || "Not checked" },
      { label: "API", value: systemHealth?.api || "Not checked" },
      { label: "NFC Service", value: systemHealth?.nfcService || "Not checked" },
    ];

    return (
      <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.settingsContainer}>
          <View style={styles.settingsHeader}>
            <View>
              <Text style={[styles.settingsHeaderTitle, isDarkMode && styles.darkText]}>Settings</Text>
              <Text style={[styles.settingsHeaderSubtitle, isDarkMode && styles.darkTextSecondary]}>
                Manage admin preferences, account security, and system tools.
              </Text>
            </View>
            <View style={styles.settingsHeaderActions}>
              <TouchableOpacity style={[styles.settingsResetButton, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]} onPress={resetSettings}>
                <Ionicons name="refresh-outline" size={16} color={isDarkMode ? "#CBD5E1" : "#64748B"} />
                <Text style={[styles.settingsResetButtonText, isDarkMode && styles.darkTextSecondary]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.settingsSaveButton, isSavingSettings && styles.settingsSaveButtonDisabled]} onPress={saveSettings} disabled={isSavingSettings}>
                {isSavingSettings ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="save-outline" size={16} color="#FFFFFF" />}
                <Text style={styles.settingsSaveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.settingsTabs, isDarkMode && { backgroundColor: "#111827" }]}>
            {settingTabs.map((tab) => {
              const isActive = activeSettingsTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.settingsTab, isActive && styles.settingsTabActive, isDarkMode && isActive && { backgroundColor: "#1E293B" }]}
                  onPress={() => setActiveSettingsTab(tab.key)}
                >
                  <Ionicons name={tab.icon} size={16} color={isActive ? ADMIN_BLUE : theme.textSecondary} />
                  <Text style={[styles.settingsTabText, isActive && styles.settingsTabTextActive, isDarkMode && !isActive && styles.darkTextSecondary]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeSettingsTab === "account" && (
            <View style={[styles.settingsCard, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
              <View style={styles.settingsCardHeader}>
                <View>
                  <Text style={[styles.settingsCardTitle, isDarkMode && styles.darkText]}>Account Security</Text>
                  <Text style={[styles.settingsHeaderSubtitle, isDarkMode && styles.darkTextSecondary]}>
                    Update your admin password without leaving the dashboard.
                  </Text>
                </View>
                <Ionicons name="lock-closed-outline" size={22} color={ADMIN_BLUE} />
              </View>
              <TouchableOpacity style={styles.submitButton} onPress={() => setShowChangePasswordModal(true)}>
                <Text style={styles.submitButtonText}>Change Password</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeSettingsTab === "notifications" && (
            <View style={[styles.settingsCard, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
              {[
                { key: "darkMode", label: "Dark Mode" },
                { key: "emailNotifications", label: "Email Notifications" },
                { key: "smsAlerts", label: "SMS Alerts" },
                { key: "autoApprove", label: "Auto Approve" },
                { key: "maintenanceMode", label: "Maintenance Mode" },
              ].map((item) => (
                <View key={item.key} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>{item.label}</Text>
                  <Switch value={!!settings[item.key]} onValueChange={(value) => updateSetting(item.key, value)} />
                </View>
              ))}
            </View>
          )}

          {activeSettingsTab === "system" && (
            <View style={[styles.settingsCard, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
              <View style={styles.settingsCardHeader}>
                <View>
                  <Text style={[styles.settingsCardTitle, isDarkMode && styles.darkText]}>System Tools</Text>
                  <Text style={[styles.settingsHeaderSubtitle, isDarkMode && styles.darkTextSecondary]}>
                    Check service status, create a backup log, or reset local dashboard customizations.
                  </Text>
                </View>
                <Ionicons name="hardware-chip-outline" size={22} color={ADMIN_BLUE} />
              </View>

              <View style={{ gap: 10, marginBottom: 14 }}>
                {healthItems.map((item) => (
                  <View key={item.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.textSecondary }}>{item.label}</Text>
                    <Text style={{ color: theme.textPrimary, fontWeight: "700" }}>{item.value}</Text>
                  </View>
                ))}
                {lastBackupSummary && (
                  <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                    Last backup: {formatDateTime(lastBackupSummary.createdAt)}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <TouchableOpacity style={[styles.submitButton, { flex: 1, minWidth: 180 }]} onPress={refreshSystemHealth} disabled={isRunningSystemAction}>
                  <Text style={styles.submitButtonText}>Check Health</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitButton, { flex: 1, minWidth: 180, backgroundColor: "#10B981" }]} onPress={handleCreateBackup} disabled={isRunningSystemAction}>
                  <Text style={styles.submitButtonText}>Create Backup</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.cancelButton, { marginTop: 10, backgroundColor: "#FEE2E2" }]} onPress={clearSystemData}>
                <Text style={[styles.cancelButtonText, { color: "#B91C1C" }]}>Clear Dashboard Cache</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderUserManagementContent = () => (
    <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.pageContainer}>
        <View
          style={[
            styles.managementHeroCard,
            {
              backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
              borderColor: theme.borderColor,
            },
          ]}
        >
          <View style={styles.managementHeroMain}>
            <View style={[styles.managementIconBadge, { backgroundColor: `${userManagementConfig.accent}18` }]}>
              <Ionicons name={userManagementConfig.icon} size={26} color={userManagementConfig.accent} />
            </View>
            <View style={styles.managementHeroCopy}>
              <Text style={[styles.managementEyebrow, { color: userManagementConfig.accent }]}>
                {userManagementConfig.eyebrow}
              </Text>
              <Text style={[styles.pageTitle, isDarkMode && styles.darkText]}>
                {userManagementConfig.title}
              </Text>
              <Text style={[styles.managementDescription, isDarkMode && styles.darkTextSecondary]}>
                {userManagementConfig.description}
              </Text>
            </View>
          </View>

          <View style={styles.managementHeaderActions}>
            {userManagementConfig.primaryActionLabel ? (
              <TouchableOpacity
                style={[styles.managementPrimaryButton, { backgroundColor: userManagementConfig.accent }]}
                onPress={() => openCreateUserModal(userManagementConfig.primaryActionRole)}
              >
                <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
                <Text style={styles.managementPrimaryButtonText}>
                  {userManagementConfig.primaryActionLabel}
                </Text>
              </TouchableOpacity>
            ) : null}

          </View>
        </View>

        {createUserMessage ? (
          <View
            style={[
              styles.adminNoticeCard,
              {
                backgroundColor: isDarkMode ? "#064E3B" : "#ECFDF5",
                borderColor: isDarkMode ? "#10B981" : "#A7F3D0",
              },
            ]}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color={isDarkMode ? "#A7F3D0" : "#047857"} />
            <Text style={[styles.adminNoticeText, { color: isDarkMode ? "#D1FAE5" : "#065F46" }]}>
              {createUserMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.managementStatsGrid}>
          {userManagementConfig.stats.map((item) => (
            <View
              key={item.key}
              style={[
                styles.managementStatCard,
                {
                  backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={[styles.managementStatIcon, { backgroundColor: `${userManagementConfig.accent}16` }]}>
                <Ionicons name={item.icon} size={18} color={userManagementConfig.accent} />
              </View>
              <Text style={[styles.managementStatValue, isDarkMode && styles.darkText]}>
                {item.value}
              </Text>
              <Text style={[styles.managementStatLabel, isDarkMode && styles.darkTextSecondary]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={[
            styles.userWorkspaceCard,
            {
              backgroundColor: isDarkMode ? theme.cardBackground : "#FFFFFF",
              borderColor: theme.borderColor,
            },
          ]}
        >
          <View style={styles.userWorkspaceHeader}>
            <View>
              <Text style={[styles.userWorkspaceTitle, isDarkMode && styles.darkText]}>Directory View</Text>
              <Text style={[styles.userWorkspaceSubtitle, isDarkMode && styles.darkTextSecondary]}>
                Showing {visibleStartIndex}-{visibleEndIndex} of {totalFilteredUsers} matching accounts
              </Text>
            </View>
            <View style={styles.recordListActionRow}>
              {renderRecordListPrintButton({
                label: "Print Records",
                color: userManagementConfig.accent,
                disabled: totalFilteredUsers === 0,
                onPress: handlePrintUsers,
              })}
              <TouchableOpacity
                style={[
                  styles.userRefreshButton,
                  isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
                ]}
                onPress={loadAllUsers}
              >
                <Ionicons name="refresh-outline" size={18} color={userManagementConfig.accent} />
                <Text style={[styles.userRefreshButtonText, { color: userManagementConfig.accent }]}>
                  Refresh
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.appointmentRecordsToolbar}>
            <View
              style={[
                styles.appointmentToolbarCard,
                isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
              ]}
            >
              <View style={styles.appointmentToolbarHeader}>
                <View style={styles.appointmentToolbarHeaderCopy}>
                  <Text style={[styles.appointmentToolbarTitle, isDarkMode && styles.darkText]}>
                    Search Accounts
                  </Text>
                  <Text style={[styles.appointmentToolbarSubtitle, isDarkMode && styles.darkTextSecondary]}>
                    Find by name, username, email, department, role, phone, or staff ID.
                  </Text>
                </View>
                {userSearchTerm || userSearchQuery ? (
                  <TouchableOpacity
                    style={styles.appointmentToolbarClearButton}
                    onPress={() => {
                      setUserSearchTerm("");
                      setUserSearchQuery("");
                      setCurrentPage(1);
                    }}
                  >
                    <Ionicons name="close-outline" size={14} color="#64748B" />
                    <Text style={styles.appointmentToolbarClearText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.appointmentToolbarSearchRow}>
                <View
                  style={[
                    styles.appointmentToolbarSearchInputWrap,
                    isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor },
                  ]}
                >
                  <Ionicons name="search-outline" size={17} color="#64748B" />
                  <TextInput
                    style={[styles.appointmentToolbarSearchInput, isDarkMode && styles.darkText]}
                    placeholder={userManagementConfig.searchPlaceholder}
                    placeholderTextColor={isDarkMode ? "#64748B" : "#94A3B8"}
                    value={userSearchTerm}
                    onChangeText={(value) => {
                      setUserSearchTerm(value);
                      setUserSearchQuery(value.trim());
                      setCurrentPage(1);
                    }}
                    returnKeyType="search"
                  />
                </View>
              </View>
            </View>

            <View
              style={[
                styles.appointmentToolbarCard,
                isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor },
              ]}
            >
              <View style={styles.appointmentToolbarHeader}>
                <View style={styles.appointmentToolbarHeaderCopy}>
                  <Text style={[styles.appointmentToolbarTitle, isDarkMode && styles.darkText]}>
                    Filters
                  </Text>
                  <Text style={[styles.appointmentToolbarSubtitle, isDarkMode && styles.darkTextSecondary]}>
                    Narrow accounts by role/status and department.
                  </Text>
                </View>
                {userFilter !== "all" || userDepartmentFilter !== "all" ? (
                  <TouchableOpacity
                    style={styles.appointmentToolbarClearButton}
                    onPress={() => {
                      setUserFilter("all");
                      setUserDepartmentFilter("all");
                      setCurrentPage(1);
                    }}
                  >
                    <Ionicons name="refresh-outline" size={14} color="#64748B" />
                    <Text style={styles.appointmentToolbarClearText}>Reset</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.appointmentToolbarFilterGrid}>
                {renderAppointmentFilterDropdown({
                  label: accountRecordsMode === "all" ? "Role / Status" : "Status",
                  value: userFilter,
                  icon: "people-outline",
                  options: userManagementConfig.filters.map((filterItem) => ({
                    label: `${filterItem.label}${typeof filterItem.count === "number" ? ` (${filterItem.count})` : ""}`,
                    value: filterItem.key,
                  })),
                  onSelect: (value) => {
                    setUserFilter(value);
                    setCurrentPage(1);
                  },
                })}
                {renderAppointmentFilterDropdown({
                  label: "Department",
                  value: userDepartmentFilter,
                  icon: "business-outline",
                  options: userDepartmentFilterOptions.map((filterItem) => ({
                    label: `${filterItem.label}${typeof filterItem.count === "number" ? ` (${filterItem.count})` : ""}`,
                    value: filterItem.key,
                  })),
                  onSelect: (value) => {
                    setUserDepartmentFilter(value);
                    setCurrentPage(1);
                  },
                })}
              </View>
            </View>
          </View>

          {paginatedUsers.length > 0 ? (
            <>
              {renderAdminTable({
                rows: paginatedUsers,
                keyExtractor: (userItem) => userItem._id || userItem.id || userItem.email,
                columns: [
                  {
                    key: "name",
                    label: "Name",
                    width: 220,
                    render: (userItem) => {
                      const roleColor = getRoleColor(userItem.role);
                      return (
                        <View style={styles.adminTableIdentityCell}>
                          <View style={[styles.userAvatar, { backgroundColor: `${roleColor}18` }]}>
                            <Text style={[styles.userAvatarInitials, { color: roleColor }]}>
                              {getUserInitials(userItem)}
                            </Text>
                          </View>
                          <View style={styles.adminTableIdentityCopy}>
                            <Text style={[styles.adminTablePrimaryText, isDarkMode && styles.darkText]}>
                              {userItem.firstName} {userItem.lastName}
                            </Text>
                            <Text style={[styles.adminTableSecondaryText, isDarkMode && styles.darkTextSecondary]}>
                              {userItem.email}
                            </Text>
                          </View>
                        </View>
                      );
                    },
                  },
                  {
                    key: "role",
                    label: "Role",
                    width: 130,
                    render: (userItem) => {
                      const roleColor = getRoleColor(userItem.role);
                      return (
                        <View style={[styles.roleBadge, { backgroundColor: `${roleColor}14`, alignSelf: "flex-start" }]}>
                          <Text style={[styles.roleBadgeText, { color: roleColor }]}>
                            {formatRoleLabel(userItem.role)}
                          </Text>
                        </View>
                      );
                    },
                  },
                  {
                    key: "department",
                    label: "Department",
                    width: 170,
                    render: (userItem) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {userItem.department || "General"}
                      </Text>
                    ),
                  },
                  {
                    key: "username",
                    label: "Username",
                    width: 140,
                    render: (userItem) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {userItem.username || "-"}
                      </Text>
                    ),
                  },
                  {
                    key: "employeeId",
                    label: "Staff ID",
                    width: 150,
                    render: (userItem) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {userItem.employeeId || "-"}
                      </Text>
                    ),
                  },
                  {
                    key: "phone",
                    label: "Phone",
                    width: 150,
                    render: (userItem) => (
                      <Text style={[styles.adminTableCellText, isDarkMode && styles.darkText]}>
                        {userItem.phone || "-"}
                      </Text>
                    ),
                  },
                  {
                    key: "status",
                    label: "Status",
                    width: 120,
                    render: (userItem) => {
                      const userIsActive = isUserActive(userItem);
                      return (
                        <View
                          style={[
                            styles.userLiveStatusBadge,
                            {
                              backgroundColor: userIsActive ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
                              alignSelf: "flex-start",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.userLiveStatusText,
                              { color: userIsActive ? "#10B981" : "#EF4444" },
                            ]}
                          >
                            {userIsActive ? "Active" : "Inactive"}
                          </Text>
                        </View>
                      );
                    },
                  },
                  {
                    key: "actions",
                    label: "Actions",
                    width: 130,
                    render: (userItem) => {
                      const roleColor = getRoleColor(userItem.role);
                      return (
                        <View style={styles.adminTableActionRow}>
                          <TouchableOpacity
                            style={[styles.adminTableActionButton, { borderColor: `${roleColor}30`, backgroundColor: `${roleColor}12` }]}
                            onPress={() => handleViewUser(userItem)}
                          >
                            <Ionicons name="eye-outline" size={14} color={roleColor} />
                            <Text style={[styles.adminTableActionText, { color: roleColor }]}>View</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    },
                  },
                ],
              })}
              {renderCompactPagination({
                currentPage,
                totalPages,
                itemCount: totalFilteredUsers,
                itemLabel: "accounts",
                onPrevious: () => setCurrentPage((prev) => Math.max(1, prev - 1)),
                onNext: () => setCurrentPage((prev) => Math.min(totalPages, prev + 1)),
              })}
            </>
          ) : (
            <View style={[styles.emptyState, styles.userEmptyState, isDarkMode && { backgroundColor: "#0F172A" }]}>
              <Ionicons name="people-outline" size={64} color="#CBD5E1" />
              <Text style={[styles.emptyStateTitle, isDarkMode && styles.darkText]}>
                No accounts found
              </Text>
              <Text style={[styles.emptyStateSubtitle, isDarkMode && styles.darkTextSecondary]}>
                {userSearchQuery
                  ? "Try a different keyword or clear the search field to see more accounts."
                  : "There are no accounts in this view yet. Create a new account or switch filters to continue."}
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );

  const renderAdminMapPage = () => (
    <ScrollView style={styles.contentScrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.pageContainer}>
        <AdminSectionShell
          title="Campus Map"
          subtitle="Monitoring view for approved visitors, check-ins, and live system actions."
          badge={`${monitoredMapVisitors.length || 0} live markers`}
          isDarkMode={isDarkMode}
          theme={theme}
          actions={
            <TouchableOpacity style={styles.pageRefreshButton} onPress={loadRecentActivities}>
              <Ionicons name="refresh-outline" size={22} color={ADMIN_BLUE} />
            </TouchableOpacity>
          }
        >
          {renderAdminMapWorkspace()}
        </AdminSectionShell>
      </View>
    </ScrollView>
  );

  const renderSelectedModuleContent = () => {
    switch (selectedSubmodule) {
      case "account-create":
        return renderAccountCreationContent();
      case "account-records":
        return renderUserManagementContent();
      case "data-management":
        return renderDataManagementContent();
      case "map-ground":
      case "map-mezzanine":
      case "map-second":
      case "map-third":
        return renderFloorMapContent();
      case "appointment-records":
        return renderAppointmentRecordsContent();
      case "appointment-management":
        return renderAppointmentManagementContent();
      case "attendance-records":
        return renderAttendanceRecordsContent();
      case "analytics":
        return renderAnalyticsContent();
      case "report-records":
        return renderReportRecordsContent();
      case "security-report-records":
        return renderSecurityReportRecordsContent();
      case "settings":
        return renderSettingsContent();
      default:
        return renderDashboardContent();
    }
  };

  const getHeaderPrintAction = () => {
    switch (selectedSubmodule) {
      case "account-records":
        return {
          label: "Print Account Records",
          color: ADMIN_BLUE,
          onPress: handlePrintUsers,
        };
      case "appointment-records":
        return {
          label: "Print Appointment Records",
          color: ADMIN_BLUE,
          onPress: () =>
            handlePrintRequests(
              "Appointment Records",
              appointmentRecords,
              "Generated from the appointment records table in the admin dashboard.",
            ),
        };
      case "report-records":
        return {
          label: "Print Report Records",
          color: ADMIN_BLUE,
          onPress: handlePrintReports,
        };
      case "security-report-records":
        return {
          label: "Print Security Reports",
          color: ADMIN_BLUE,
          onPress: handlePrintSecurityReports,
        };
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Image
          source={require("../assets/LogoSapphire.jpg")}
          resizeMode="contain"
          style={{ width: 116, height: 58, marginBottom: 18 }}
        />
        <ActivityIndicator size="large" color="#1C6DD0" />
        <Text style={styles.loadingText}>Loading admin dashboard...</Text>
        <Text style={styles.loadingSubtext}>Restoring requests, users, reports, and live campus data.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, isDarkMode && { backgroundColor: theme.backgroundColor }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.backgroundColor} />
      <View style={[styles.mainContainer, isDarkMode && { backgroundColor: theme.backgroundColor }]}>
        {isAdminMobileLayout && showAdminMobileMenu ? (
          <TouchableOpacity
            style={styles.mobileSidebarBackdrop}
            activeOpacity={1}
            onPress={() => setShowAdminMobileMenu(false)}
          />
        ) : null}
        {/* Sidebar */}
        {!isAdminMobileLayout || showAdminMobileMenu ? (
        <View
          style={[
            styles.sidebar,
            isAdminMobileLayout && styles.mobileSidebar,
            isDarkMode && {
              backgroundColor: theme.sidebarBackground,
              borderRightColor: "rgba(148, 163, 184, 0.16)",
            },
          ]}
        >
          <ScrollView ref={sidebarScrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.sidebarContent}>
            <View style={[styles.sidebarHeader, isDarkMode && styles.darkSidebarPanel]}>
              <Image source={require("../assets/LogoSapphire.jpg")} style={styles.sidebarLogoImage} />
              <Text style={[styles.sidebarBrand, isDarkMode && styles.darkText]}>Sapphire International Aviation Academy</Text>
              <View style={[styles.sidebarRoleBadge, isDarkMode && styles.darkSidebarRoleBadge]}><Text style={[styles.sidebarRoleText, isDarkMode && { color: "#DBEAFE" }]}>ADMIN</Text></View>
              <View style={[styles.sidebarStats, isDarkMode && styles.darkSidebarStats]}>
                <View style={styles.sidebarStat}><Text style={[styles.sidebarStatNumber, isDarkMode && styles.darkText]}>{stats.pendingRequests}</Text><Text style={[styles.sidebarStatLabel, isDarkMode && { color: "rgba(255,255,255,0.6)" }]}>Pending</Text></View>
                <View style={[styles.sidebarStatDivider, isDarkMode && { backgroundColor: "rgba(255,255,255,0.1)" }]} />
                <View style={styles.sidebarStat}><Text style={[styles.sidebarStatNumber, isDarkMode && styles.darkText]}>{stats.totalStaff}</Text><Text style={[styles.sidebarStatLabel, isDarkMode && { color: "rgba(255,255,255,0.6)" }]}>Staff</Text></View>
                <View style={[styles.sidebarStatDivider, isDarkMode && { backgroundColor: "rgba(255,255,255,0.1)" }]} />
                <View style={styles.sidebarStat}><Text style={[styles.sidebarStatNumber, isDarkMode && styles.darkText]}>{stats.totalGuards}</Text><Text style={[styles.sidebarStatLabel, isDarkMode && { color: "rgba(255,255,255,0.6)" }]}>Guards</Text></View>
              </View>
            </View>

            <HoverBubble
              style={[
                styles.sidebarOverviewButton,
                selectedSubmodule === "dashboard" && styles.sidebarOverviewButtonActive,
                isDarkMode && styles.darkSidebarButton,
                isDarkMode && selectedSubmodule === "dashboard" && styles.darkSidebarButtonActive,
              ]}
              onPress={() => handleMenuAction("dashboard")}
              hoverScale={1.035}
            >
              <View style={[styles.sidebarMenuIcon, { backgroundColor: isDarkMode ? "rgba(96,165,250,0.18)" : "rgba(37,99,235,0.16)" }]}>
                <Ionicons name="grid-outline" size={20} color="#0A3D91" />
              </View>
              <Text style={[styles.sidebarMenuLabel, selectedSubmodule === "dashboard" && styles.sidebarMenuLabelActive, isDarkMode && styles.darkText]}>
                Dashboard Overview
              </Text>
            </HoverBubble>

            <View style={styles.sidebarModuleGroup}>
              {adminModules.map((module) => {
                const isExpanded = expandedModule === module.key;
                const hasSelectedChild = module.submodules.some((submodule) => submodule.key === selectedSubmodule);

                return (
                  <View key={module.key} style={[styles.sidebarModuleCard, isDarkMode && styles.darkSidebarCard]}>
                    <HoverBubble
                      style={[
                        styles.sidebarModuleButton,
                        hasSelectedChild && styles.sidebarModuleButtonActive,
                        isDarkMode && styles.darkSidebarModuleButton,
                        isDarkMode && hasSelectedChild && styles.darkSidebarButtonActive,
                      ]}
                      onPress={() => handleModuleToggle(module.key)}
                      hoverScale={1.025}
                    >
                      <View style={[styles.sidebarMenuIcon, { backgroundColor: `${ADMIN_BLUE}16` }]}>
                        <Ionicons name={module.icon} size={20} color={module.color} />
                      </View>
                      <View style={styles.sidebarModuleCopy}>
                        <Text style={[styles.sidebarMenuLabel, hasSelectedChild && styles.sidebarMenuLabelActive, isDarkMode && styles.darkText]}>
                          {module.label}
                        </Text>
                        <Text style={[styles.sidebarModuleHint, isDarkMode && styles.darkSidebarMutedText]}>
                          {module.submodules.length} section{module.submodules.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
                        size={18}
                        color={hasSelectedChild ? module.color : isDarkMode ? "#94A3B8" : "#64748B"}
                      />
                    </HoverBubble>

                    {isExpanded ? (
                      <View style={styles.sidebarSubmoduleList}>
                        {module.submodules.map((submodule) => {
                          const isSubmoduleActive = selectedSubmodule === submodule.key;

                          return (
                            <HoverBubble
                              key={submodule.key}
                              style={[
                                styles.sidebarSubmoduleButton,
                                isSubmoduleActive && styles.sidebarSubmoduleButtonActive,
                                isDarkMode && styles.darkSidebarSubmoduleButton,
                                isDarkMode && isSubmoduleActive && styles.darkSidebarButtonActive,
                              ]}
                              onPress={() => selectAdminSubmodule(submodule.key)}
                              hoverScale={1.025}
                            >
                              <Text
                                style={[
                                  styles.sidebarSubmoduleLabel,
                                  isSubmoduleActive && styles.sidebarSubmoduleLabelActive,
                                  isDarkMode && styles.darkSidebarMutedText,
                                  isDarkMode && isSubmoduleActive && styles.darkText,
                                ]}
                              >
                                {submodule.label}
                              </Text>
                              {submodule.badge > 0 ? (
                                <View style={[styles.sidebarSubmoduleBadge, isDarkMode && { backgroundColor: "#334155" }]}>
                                  <Text style={[styles.sidebarSubmoduleBadgeText, isDarkMode && styles.darkText]}>{submodule.badge}</Text>
                                </View>
                              ) : null}
                            </HoverBubble>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <HoverBubble
              style={[
                styles.sidebarUtilityButton,
                selectedSubmodule === "settings" && styles.sidebarUtilityButtonActive,
                isDarkMode && styles.darkSidebarButton,
                isDarkMode && selectedSubmodule === "settings" && styles.darkSidebarButtonActive,
              ]}
              onPress={() => handleMenuAction("settings")}
              hoverScale={1.035}
            >
              <View style={[styles.sidebarMenuIcon, { backgroundColor: isDarkMode ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.14)" }]}>
                <Ionicons name="settings-outline" size={20} color="#64748B" />
              </View>
              <Text style={[styles.sidebarMenuLabel, selectedSubmodule === "settings" && styles.sidebarMenuLabelActive, isDarkMode && styles.darkText]}>
                Settings
              </Text>
            </HoverBubble>

            <View style={[styles.sidebarUserSection, isDarkMode && styles.darkSidebarPanel]}>
              <View style={styles.sidebarUserInfo}>
                <View style={[styles.sidebarUserAvatar, isDarkMode && { backgroundColor: "#334155" }]}><Text style={[styles.sidebarUserAvatarText, isDarkMode && { color: "#1C6DD0" }]}>{user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}</Text></View>
                <View><Text style={[styles.sidebarUserName, isDarkMode && styles.darkText]}>{user?.firstName} {user?.lastName}</Text><Text style={[styles.sidebarUserEmail, isDarkMode && { color: "rgba(255,255,255,0.5)" }]}>{user?.email}</Text></View>
              </View>
              <HoverBubble style={[styles.sidebarLogoutButton, isDarkMode && { backgroundColor: "rgba(239,68,68,0.2)" }]} onPress={handleLogout} hoverScale={1.035}>
                <Ionicons name="log-out-outline" size={20} color="#DC2626" /><Text style={[styles.sidebarLogoutText, isDarkMode && { color: "#FCA5A5" }]}>Sign Out</Text>
              </HoverBubble>
            </View>

            <View style={styles.sidebarFooter}>
              <Text style={[styles.sidebarFooterText, isDarkMode && { color: "rgba(255,255,255,0.3)" }]}>Sapphire International Aviation Academy</Text>
              <Text style={[styles.sidebarFooterVersion, isDarkMode && { color: "rgba(255,255,255,0.2)" }]}>v1.0.0</Text>
            </View>
          </ScrollView>
        </View>
        ) : null}

        {/* Main Content */}
        <View style={styles.adminContentShell}>
        <View style={[styles.contentArea, isDarkMode && { backgroundColor: theme.backgroundColor }]}>
          {isAdminMobileLayout ? (
            <View
              style={[
                styles.mobileAdminTopBar,
                isDarkMode && styles.darkSidebarPanel,
                isDarkMode && { borderBottomColor: "rgba(148, 163, 184, 0.14)" },
              ]}
            >
              <TouchableOpacity
                style={[styles.mobileAdminMenuButton, isDarkMode && styles.darkSidebarButton]}
                onPress={() => setShowAdminMobileMenu(true)}
                activeOpacity={0.82}
              >
                <Ionicons name="menu-outline" size={22} color={isDarkMode ? "#DBEAFE" : ADMIN_BLUE_DARK} />
                <Text style={[styles.mobileAdminMenuButtonText, isDarkMode && styles.darkText]}>
                  Menu
                </Text>
              </TouchableOpacity>
              <View style={styles.mobileAdminTopCopy}>
                <Text style={[styles.mobileAdminTopTitle, isDarkMode && styles.darkText]} numberOfLines={1}>
                  {selectedSubmoduleMeta.title}
                </Text>
                <Text style={[styles.mobileAdminTopSubtitle, isDarkMode && styles.darkTextSecondary]} numberOfLines={1}>
                  Admin dashboard
                </Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate("Profile")} style={styles.mobileAdminProfileButton}>
                <Text style={styles.profileInitials}>{user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}</Text>
              </TouchableOpacity>
              <AdminThemeToggle
                isDarkMode={isDarkMode}
                onToggle={handleThemeModeChange}
                compact
              />
            </View>
          ) : null}
          <Animated.View
            style={[
              styles.header,
              isAdminMobileLayout && styles.headerMobileCompact,
              { opacity: headerOpacity },
              isDarkMode && {
                backgroundColor: ADMIN_BLUE_DARK,
                borderBottomColor: "rgba(183, 213, 246, 0.18)",
              },
            ]}
          >
            <View style={styles.headerTop}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>
                {selectedSubmoduleMeta.title}
              </Text>
              <Text style={styles.headerSubtitle}>
                {selectedSubmoduleMeta.subtitle}
              </Text>
              <View style={styles.headerMetaRow}>
                <View style={[styles.headerMetaBadge, isDarkMode && styles.darkHeaderMetaBadge]}>
                  <Ionicons name="calendar-outline" size={14} color={isDarkMode ? "#DBEAFE" : ADMIN_BLUE_DARK} />
                  <Text style={[styles.headerMetaText, isDarkMode && styles.darkHeaderMetaText]}>
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </Text>
                </View>
                {selectedSubmoduleMeta.highlights.map((item) => (
                  <View
                    key={item.label}
                    style={[styles.headerMetaBadge, isDarkMode && styles.darkHeaderMetaBadge]}
                  >
                    <Ionicons name={item.icon} size={14} color={isDarkMode ? "#DBEAFE" : item.color} />
                    <Text style={[styles.headerMetaText, isDarkMode && styles.darkHeaderMetaText]}>
                      {item.label}: {item.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
              <View style={styles.headerActions}>
                <AdminThemeToggle
                  isDarkMode={isDarkMode}
                  onToggle={handleThemeModeChange}
                />
                <TouchableOpacity onPress={() => navigation.navigate("Profile")} style={styles.profileButton}><View style={[styles.profileIcon, isDarkMode && { backgroundColor: "#1C6DD0" }]}><Text style={styles.profileInitials}>{user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}</Text></View></TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          <AdminFeedbackBanner
            notice={adminNotice}
            isDarkMode={isDarkMode}
            theme={theme}
            onDismiss={() => setAdminNotice(null)}
          />

          <View style={{ paddingHorizontal: isAdminMobileLayout ? 16 : 28, paddingTop: connectionIssue ? 14 : 0 }}>
            <MobileConnectionBanner
              dark={isDarkMode}
              visible={!!connectionIssue}
              title={connectionIssue?.title}
              message={connectionIssue?.message}
              onRetry={loadDashboardData}
            />
          </View>

          {renderSelectedModuleContent()}
        </View>
        </View>
      </View>

      {/* Request Details Modal */}
      <Modal visible={showRequestDetailsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View style={[styles.modalHeader, isDarkMode && { borderBottomColor: theme.borderColor }]}>
              <Text style={[styles.modalTitle, isDarkMode && styles.darkText]}>Visit Request Details</Text>
              <TouchableOpacity onPress={() => setShowRequestDetailsModal(false)}>
                <Ionicons name="close" size={24} color={isDarkMode ? "#94A3B8" : "#6B7280"} />
              </TouchableOpacity>
            </View>
            {selectedRequest && (
              <ScrollView style={styles.modalBody}>
                <View style={[styles.detailAvatar, isDarkMode && { backgroundColor: "#334155" }]}>
                  <Text style={styles.detailAvatarText}>{selectedRequest.fullName?.charAt(0) || "V"}</Text>
                </View>
                <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                  <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Full Name</Text>
                  <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>{selectedRequest.fullName}</Text>
                </View>
                <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                  <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Email</Text>
                  <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>{selectedRequest.email}</Text>
                </View>
                <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                  <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Phone</Text>
                  <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>{selectedRequest.phoneNumber}</Text>
                </View>
                <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                  <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Purpose of Visit</Text>
                  <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>{selectedRequest.purposeOfVisit}</Text>
                </View>
                <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                  <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Appointment Request Update</Text>
                  <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>
                    Current: {selectedRequest.assignedOffice || selectedRequest.appointmentDepartment || selectedRequest.host || "Unassigned"} - {formatDateTime(selectedRequest.visitDate)} - {formatTime(selectedRequest.visitTime)}
                  </Text>
                  <TextInput
                    style={[
                      styles.rejectInput,
                      {
                        minHeight: 46,
                        marginTop: 10,
                        textAlignVertical: "center",
                      },
                      isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                    ]}
                    placeholder="Update office shown in visitor appointment"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    value={officeEditValue}
                    onChangeText={setOfficeEditValue}
                  />
                  <View style={{ flexDirection: width < 560 ? "column" : "row", gap: 10, marginTop: 10 }}>
                    <TextInput
                      style={[
                        styles.rejectInput,
                        {
                          flex: 1,
                          minHeight: 46,
                          textAlignVertical: "center",
                        },
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      placeholder="Visit date: YYYY-MM-DD"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                      value={appointmentEditDateValue}
                      onChangeText={setAppointmentEditDateValue}
                    />
                    <TextInput
                      style={[
                        styles.rejectInput,
                        {
                          flex: 1,
                          minHeight: 46,
                          textAlignVertical: "center",
                        },
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      placeholder="Visit time: HH:MM"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                      value={appointmentEditTimeValue}
                      onChangeText={setAppointmentEditTimeValue}
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      { alignSelf: "flex-start", marginTop: 10, backgroundColor: "#F59E0B" },
                    ]}
                    onPress={handleSaveAppointmentOffice}
                    disabled={isUpdatingOffice}
                  >
                    {isUpdatingOffice ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>Save Appointment Update</Text>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                  <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Visit Date & Time</Text>
                  <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>{formatDateTime(selectedRequest.visitDate)}</Text>
                </View>
                {selectedRequest.vehicleNumber && (
                  <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                    <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Vehicle Number</Text>
                    <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>{selectedRequest.vehicleNumber}</Text>
                  </View>
                )}
                <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                  <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(getRequestStatus(selectedRequest)).bg, alignSelf: "flex-start" }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(getRequestStatus(selectedRequest)).text }]}>{getStatusColor(getRequestStatus(selectedRequest)).label}</Text>
                  </View>
                </View>
                {selectedRequest.rejectionReason && (
                  <View style={[styles.detailSection, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                    <Text style={[styles.detailLabel, isDarkMode && styles.darkTextSecondary]}>Rejection Reason</Text>
                    <Text style={[styles.detailValue, isDarkMode && styles.darkText]}>{selectedRequest.rejectionReason}</Text>
                  </View>
                )}
              </ScrollView>
            )}
            <View style={[styles.modalFooter, isDarkMode && { borderTopColor: theme.borderColor }]}>
              <TouchableOpacity style={[styles.cancelButton, isDarkMode && { backgroundColor: "#334155" }]} onPress={() => setShowRequestDetailsModal(false)}>
                <Text style={[styles.cancelButtonText, isDarkMode && styles.darkTextSecondary]}>Close</Text>
              </TouchableOpacity>
              {getRequestStatus(selectedRequest) === "pending" && (
                <>
                  <TouchableOpacity style={[styles.submitButton, { backgroundColor: "#10B981" }]} onPress={() => handleApproveRequest(selectedRequest)} disabled={processingId === selectedRequest?._id}>
                    {processingId === selectedRequest?._id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Approve</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitButton, { backgroundColor: "#EF4444" }]} onPress={() => { setShowRequestDetailsModal(false); setShowRejectModal(true); }}>
                    <Text style={styles.submitButtonText}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.rejectModal, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
            <Text style={[styles.confirmTitle, isDarkMode && styles.darkText]}>Reject Visit Request</Text>
            <Text style={[styles.confirmMessage, isDarkMode && styles.darkTextSecondary]}>Reason for rejecting {selectedRequest?.fullName}'s visit request</Text>
            <TextInput style={[styles.rejectInput, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]} placeholder="Enter rejection reason..." placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"} multiline numberOfLines={3} value={rejectionReason} onChangeText={setRejectionReason} />
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={[styles.confirmCancel, isDarkMode && { backgroundColor: "#334155" }]} onPress={() => { setShowRejectModal(false); setRejectionReason(""); }}>
                <Text style={[styles.confirmCancelText, isDarkMode && styles.darkTextSecondary]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmButton, { backgroundColor: "#EF4444" }]} onPress={handleRejectRequest} disabled={processingId === selectedRequest?._id}>
                {processingId === selectedRequest?._id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.confirmButtonText}>Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showChangePasswordModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, { alignItems: "stretch", maxWidth: 460 }, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Ionicons name="lock-closed-outline" size={42} color={ADMIN_BLUE} />
              <Text style={[styles.confirmTitle, isDarkMode && styles.darkText]}>Change Password</Text>
              <Text style={[styles.confirmMessage, isDarkMode && styles.darkTextSecondary]}>
                Enter your current password and choose a new one.
              </Text>
            </View>

            {[
              { key: "currentPassword", label: "Current Password" },
              { key: "newPassword", label: "New Password" },
              { key: "confirmPassword", label: "Confirm New Password" },
            ].map((field) => (
              <View key={field.key} style={[styles.inputGroup, { marginBottom: 12 }]}>
                <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>{field.label}</Text>
                <TextInput
                  style={[styles.input, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]}
                  placeholder={field.label}
                  placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                  secureTextEntry
                  value={changePasswordData[field.key]}
                  onChangeText={(value) => setChangePasswordData((currentValue) => ({ ...currentValue, [field.key]: value }))}
                />
              </View>
            ))}

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmCancel, isDarkMode && { backgroundColor: "#334155" }]}
                onPress={() => {
                  setShowChangePasswordModal(false);
                  setChangePasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
                }}
              >
                <Text style={[styles.confirmCancelText, isDarkMode && styles.darkTextSecondary]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmButton, { backgroundColor: ADMIN_BLUE }]} onPress={handleChangePassword}>
                <Text style={styles.confirmButtonText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

{/* Add User Modal */}
<Modal visible={showAddUserModal} transparent animationType="slide">
  <View style={styles.modalOverlay}>
    <View
      style={[
        styles.createUserModal,
        isDarkMode && {
          backgroundColor: theme.cardBackground,
          borderColor: theme.borderColor,
        },
      ]}
    >
      <View
        style={[
          styles.modalHeader,
          isDarkMode && { borderBottomColor: theme.borderColor },
        ]}
      >
        <View style={styles.createAccountHeaderCopy}>
          <View style={styles.createAccountHeaderTitleRow}>
            <View
              style={[
                styles.createAccountHeaderIcon,
                { backgroundColor: `${getRoleColor(newUserData.role)}18` },
              ]}
            >
              <Ionicons
                name={getRoleIcon(newUserData.role)}
                size={20}
                color={getRoleColor(newUserData.role)}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, isDarkMode && styles.darkText]}>
                Create New Account
              </Text>
              <Text
                style={[
                  styles.createUserSubtitle,
                  isDarkMode && styles.darkTextSecondary,
                ]}
              >
                Add a student, academic staff, admin services staff, or security account with a cleaner setup flow and
                live preview.
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity onPress={() => setShowAddUserModal(false)}>
          <Ionicons
            name="close"
            size={24}
            color={isDarkMode ? "#94A3B8" : "#6B7280"}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.modalBody}
        contentContainerStyle={styles.createUserBody}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.createAccountLayout,
            isDarkMode && { borderColor: theme.borderColor },
          ]}
        >
          {/* LEFT SIDE */}
          <View style={styles.createAccountFormColumn}>
            <View
              style={[
                styles.createAccountSectionCard,
                isDarkMode && {
                  backgroundColor: "#0F172A",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={styles.createAccountSectionHeader}>
                <Ionicons
                  name="layers-outline"
                  size={18}
                  color={getRoleColor(newUserData.role)}
                />
                <View>
                  <Text
                    style={[
                      styles.createAccountSectionTitle,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    Account Type
                  </Text>
                  <Text
                    style={[
                      styles.createAccountSectionSubtitle,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Choose what kind of account you want to create.
                  </Text>
                </View>
              </View>

              <View style={styles.roleCardRow}>
                {["student", "teacher", "staff", "security"].map((role) => {
                  const active = newUserData.role === role;
                  return (
                    <TouchableOpacity
                      key={role}
                      activeOpacity={0.9}
                      style={[
                        styles.roleCard,
                        active && styles.roleCardActive,
                        {
                          borderColor: active
                            ? getRoleColor(role)
                            : isDarkMode
                              ? theme.borderColor
                              : "#E2E8F0",
                          backgroundColor: active
                            ? `${getRoleColor(role)}12`
                            : isDarkMode
                              ? "#111827"
                              : "#FFFFFF",
                        },
                      ]}
                      onPress={() => {
                        switchCreateUserRole(role);
                      }}
                    >
                      <View
                        style={[
                          styles.roleCardIcon,
                          { backgroundColor: `${getRoleColor(role)}18` },
                        ]}
                      >
                        <Ionicons
                          name={getRoleIcon(role)}
                          size={18}
                          color={getRoleColor(role)}
                        />
                      </View>

                      <Text
                        style={[
                          styles.roleCardTitle,
                          isDarkMode && styles.darkText,
                        ]}
                      >
                        {role === "student"
                          ? "Student"
                          : role === "teacher"
                            ? "Academic Staff"
                            : role === "staff"
                              ? "Admin Services Staff"
                              : "Security Personnel"}
                      </Text>

                      <Text
                        style={[
                          styles.roleCardText,
                          isDarkMode && styles.darkTextSecondary,
                        ]}
                      >
                        {role === "student"
                          ? "Virtual campus ID and attendance tap access."
                          : role === "teacher"
                            ? "Teacher access with student-style campus tap attendance."
                          : role === "staff"
                            ? "Admin services, records, and appointment handling."
                            : "Checkpoint, access control, and visitor verification."}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                styles.createAccountSectionCard,
                isDarkMode && {
                  backgroundColor: "#0F172A",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={styles.createAccountSectionHeader}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={getRoleColor(newUserData.role)}
                />
                <View>
                  <Text
                    style={[
                      styles.createAccountSectionTitle,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    Personal Information
                  </Text>
                  <Text
                    style={[
                      styles.createAccountSectionSubtitle,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Enter the basic identity and contact details.
                  </Text>
                </View>
              </View>

              <View style={styles.userEditorRow}>
                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                    First Name
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      createUserErrors.firstName && styles.inputError,
                      isDarkMode && {
                        backgroundColor: "#111827",
                        borderColor: theme.borderColor,
                        color: "#F8FBFE",
                      },
                    ]}
                    placeholder="Enter first name"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    value={newUserData.firstName}
                    onChangeText={(text) =>
                      setNewUserData((prev) => ({ ...prev, firstName: text }))
                    }
                  />
                  {renderCreateUserFieldError("firstName")}
                </View>

                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                    Last Name
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      createUserErrors.lastName && styles.inputError,
                      isDarkMode && {
                        backgroundColor: "#111827",
                        borderColor: theme.borderColor,
                        color: "#F8FBFE",
                      },
                    ]}
                    placeholder="Enter last name"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    value={newUserData.lastName}
                    onChangeText={(text) =>
                      setNewUserData((prev) => ({ ...prev, lastName: text }))
                    }
                  />
                  {renderCreateUserFieldError("lastName")}
                </View>
              </View>

              <View style={styles.userEditorRow}>
                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                    Email Address
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      createUserErrors.email && styles.inputError,
                      isDarkMode && {
                        backgroundColor: "#111827",
                        borderColor: theme.borderColor,
                        color: "#F8FBFE",
                      },
                    ]}
                    placeholder="Enter email address"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={newUserData.email}
                    onChangeText={(text) => {
                      setIsCreateEmailManuallyEdited(true);
                      setNewUserData((prev) => ({ ...prev, email: text }));
                    }}
                  />
                  <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                    Auto-generated from first name and role. Admin can edit it when needed.
                  </Text>
                  {renderCreateUserFieldError("email")}
                </View>

                {isSecurityRole(newUserData.role) ? (
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                      Phone Number
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        createUserErrors.phone && styles.inputError,
                        isDarkMode && {
                          backgroundColor: "#111827",
                          borderColor: theme.borderColor,
                          color: "#F8FBFE",
                        },
                      ]}
                      placeholder="Enter phone number"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                      keyboardType="phone-pad"
                      value={newUserData.phone}
                      onChangeText={(text) => {
                        setNewUserData((prev) => ({ ...prev, phone: text }));
                        setCreateUserErrors((prev) => ({ ...prev, phone: null }));
                      }}
                    />
                    <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                      Optional. Leave blank if the guard will add it after activation.
                    </Text>
                    {renderCreateUserFieldError("phone")}
                  </View>
                ) : (
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                      Phone Number
                    </Text>
                    <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}>
                      <Ionicons name="phone-portrait-outline" size={16} color={isDarkMode ? "#94A3B8" : "#64748B"} />
                      <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                        User will add phone number during profile setup
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View
              style={[
                styles.createAccountSectionCard,
                isDarkMode && {
                  backgroundColor: "#0F172A",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={styles.createAccountSectionHeader}>
                <Ionicons
                  name="briefcase-outline"
                  size={18}
                  color={getRoleColor(newUserData.role)}
                />
                <View>
                  <Text
                    style={[
                      styles.createAccountSectionTitle,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    Work Details
                  </Text>
                  <Text
                    style={[
                      styles.createAccountSectionSubtitle,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Assign role-specific account information.
                  </Text>
                </View>
              </View>

              {newUserData.role === "student" || newUserData.role === "teacher" ? (
                <>
                  <View style={styles.userEditorRow}>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {newUserData.role === "teacher" ? "Academic Staff ID" : "Student ID"}
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          (newUserData.role === "teacher" ? createUserErrors.teacherId : createUserErrors.studentId) && styles.inputError,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder={generatedCreateUserEmployeeId}
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.role === "teacher" ? newUserData.teacherId : newUserData.studentId}
                        onChangeText={(text) => {
                          setIsCreateEmployeeIdManuallyEdited(true);
                          setNewUserData((prev) => ({
                            ...prev,
                            [newUserData.role === "teacher" ? "teacherId" : "studentId"]: text,
                          }));
                        }}
                      />
                      {renderCreateUserFieldError(newUserData.role === "teacher" ? "teacherId" : "studentId")}
                    </View>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {isCreateTeacherAccount ? "Teaching Subject / Area" : "Program"}
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder={isCreateTeacherAccount ? "e.g. Aircraft Maintenance" : "e.g. Aircraft Maintenance"}
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.course}
                        onChangeText={(text) => setNewUserData((prev) => ({ ...prev, course: text }))}
                      />
                    </View>
                  </View>
                  <View style={styles.userEditorRow}>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {isCreateTeacherAccount ? "Department / Grade Level" : "Year Level"}
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder={isCreateTeacherAccount ? "Department or teaching level" : "Year level"}
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.yearLevel}
                        onChangeText={(text) => setNewUserData((prev) => ({ ...prev, yearLevel: text }))}
                      />
                    </View>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {isCreateTeacherAccount ? "Assigned Section" : "Section"}
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder="Section"
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.section}
                        onChangeText={(text) => setNewUserData((prev) => ({ ...prev, section: text }))}
                      />
                    </View>
                  </View>
                </>
              ) : newUserData.role === "staff" ? (
                <>
                  <View style={styles.userEditorRow}>
                    {renderStaffDropdown({
                      target: "department",
                      label: "Department",
                      value: newUserData.department,
                      options: STAFF_DEPARTMENT_OPTIONS,
                      placeholder: "Select department",
                      icon: "business-outline",
                      onSelect: (value) => {
                        const firstOfficer =
                          STAFF_OFFICER_OPTIONS_BY_DEPARTMENT[value]?.[0]?.value ||
                          "";
                        setNewUserData((prev) => ({
                          ...prev,
                          department: value,
                          position: firstOfficer,
                        }));
                        setStaffDropdownOpen(null);
                      },
                    })}

                    {renderStaffDropdown({
                      target: "position",
                      label: "Officer Type",
                      value: newUserData.position,
                      options:
                        STAFF_OFFICER_OPTIONS_BY_DEPARTMENT[
                          newUserData.department
                        ] || [],
                      placeholder: "Select officer type",
                      icon: "id-card-outline",
                      onSelect: (value) => {
                        setNewUserData((prev) => ({ ...prev, position: value }));
                        setStaffDropdownOpen(null);
                      },
                    })}
                  </View>

                  <View style={styles.userEditorRow}>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text
                        style={[styles.inputLabel, isDarkMode && styles.darkText]}
                      >
                        Shift
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder="e.g. 8:00 AM - 5:00 PM"
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.shift}
                        onChangeText={(text) =>
                          setNewUserData((prev) => ({ ...prev, shift: text }))
                        }
                      />
                    </View>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text
                        style={[styles.inputLabel, isDarkMode && styles.darkText]}
                      >
                        {newUserData.role === "staff" ? "Generated Staff ID" : "Generated Security ID"}
                      </Text>
                      <View
                        style={[
                          styles.createAccountStatusBadge,
                          {
                            backgroundColor: "rgba(28,109,208,0.12)",
                            borderColor: "rgba(28,109,208,0.22)",
                            justifyContent: "flex-start",
                          },
                        ]}
                      >
                        <Text style={[styles.createAccountStatusText, { color: "#0A3D91" }]}>
                          {newUserData.employeeId || generatedCreateUserEmployeeId}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.userEditorRow}>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text
                        style={[styles.inputLabel, isDarkMode && styles.darkText]}
                      >
                        Department
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder="Security Department"
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.department}
                        onChangeText={(text) =>
                          setNewUserData((prev) => ({
                            ...prev,
                            department: text,
                          }))
                        }
                      />
                    </View>

                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text
                        style={[styles.inputLabel, isDarkMode && styles.darkText]}
                      >
                        Position
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder="Security Personnel"
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.position}
                        onChangeText={(text) =>
                          setNewUserData((prev) => ({
                            ...prev,
                            position: text,
                          }))
                        }
                      />
                    </View>
                  </View>

                  <View style={styles.userEditorRow}>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text
                        style={[styles.inputLabel, isDarkMode && styles.darkText]}
                      >
                        Shift
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          isDarkMode && {
                            backgroundColor: "#111827",
                            borderColor: theme.borderColor,
                            color: "#F8FBFE",
                          },
                        ]}
                        placeholder="e.g. Day Shift / Night Shift"
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        value={newUserData.shift}
                        onChangeText={(text) =>
                          setNewUserData((prev) => ({ ...prev, shift: text }))
                        }
                      />
                    </View>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text
                        style={[styles.inputLabel, isDarkMode && styles.darkText]}
                      >
                        Generated Security ID
                      </Text>
                      <View
                        style={[
                          styles.createAccountStatusBadge,
                          {
                            backgroundColor: "rgba(28,109,208,0.12)",
                            borderColor: "rgba(28,109,208,0.22)",
                            justifyContent: "flex-start",
                          },
                        ]}
                      >
                        <Text style={[styles.createAccountStatusText, { color: "#0A3D91" }]}>
                          {newUserData.employeeId || generatedCreateUserEmployeeId}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>

            <View
              style={[
                styles.createAccountSectionCard,
                isDarkMode && {
                  backgroundColor: "#0F172A",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={styles.createAccountSectionHeader}>
                <Ionicons
                  name="radio-outline"
                  size={18}
                  color={getRoleColor(newUserData.role)}
                />
                <View>
                  <Text
                    style={[
                      styles.createAccountSectionTitle,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    NFC Card UID
                  </Text>
                  <Text
                    style={[
                      styles.createAccountSectionSubtitle,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Assign the physical NFC card UID now, or leave it blank to generate a SafePass ID.
                  </Text>
                </View>
              </View>

              <View style={styles.userEditorRow}>
                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                    Card UID
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      createUserErrors.nfcCardId && styles.inputError,
                      isDarkMode && {
                        backgroundColor: "#111827",
                        borderColor: theme.borderColor,
                        color: "#F8FBFE",
                      },
                    ]}
                    placeholder="04A1B2C3"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    autoCapitalize="characters"
                    value={newUserData.nfcCardId}
                    onChangeText={(text) => {
                      setNewUserData((prev) => ({ ...prev, nfcCardId: text }));
                      setCreateUserErrors((prev) => ({ ...prev, nfcCardId: null }));
                    }}
                  />
                  {renderCreateUserFieldError("nfcCardId")}
                </View>
                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                    Assignment
                  </Text>
                  <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#111827", borderColor: theme.borderColor }]}>
                    <Ionicons name="id-card-outline" size={16} color={isDarkMode ? "#94A3B8" : "#64748B"} />
                    <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                      {newUserData.nfcCardId ? "Physical card UID will be saved" : "Auto SafePass ID will be used"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.createAccountSectionCard,
                isDarkMode && {
                  backgroundColor: "#0F172A",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={styles.createAccountSectionHeader}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={getRoleColor(newUserData.role)}
                />
                <View>
                  <Text
                    style={[
                      styles.createAccountSectionTitle,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    Login Details
                  </Text>
                  <Text
                    style={[
                      styles.createAccountSectionSubtitle,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    SafePass will generate a secure temporary credential and email the activation link automatically.
                  </Text>
                </View>
              </View>

              <View style={styles.userEditorRow}>
                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                    Username
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      createUserErrors.username && styles.inputError,
                      isDarkMode && {
                        backgroundColor: "#111827",
                        borderColor: theme.borderColor,
                        color: "#F8FBFE",
                      },
                    ]}
                    placeholder="Enter username"
                    placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    autoCapitalize="none"
                    value={newUserData.username}
                    onChangeText={(text) =>
                      setNewUserData((prev) => ({ ...prev, username: text }))
                    }
                  />
                  {renderCreateUserFieldError("username")}
                </View>

                <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                    Status
                  </Text>
                  <View
                    style={[
                      styles.createAccountStatusBadge,
                      {
                        backgroundColor:
                          newUserData.status === "active"
                            ? "rgba(16,185,129,0.12)"
                            : "rgba(148,163,184,0.12)",
                        borderColor:
                          newUserData.status === "active"
                            ? "rgba(16,185,129,0.28)"
                            : "rgba(148,163,184,0.24)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.createAccountStatusText,
                        {
                          color:
                            newUserData.status === "active"
                              ? "#10B981"
                              : "#64748B",
                        },
                      ]}
                    >
                      {newUserData.status === "active"
                        ? "Active account"
                        : "Inactive account"}
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.createAccountStatusBadge,
                  {
                    backgroundColor: "rgba(28,109,208,0.12)",
                    borderColor: "rgba(28,109,208,0.22)",
                    justifyContent: "flex-start",
                  },
                ]}
              >
                <Text style={[styles.createAccountStatusText, { color: "#0A3D91" }]}>
                  Temporary password delivery: sent to the user's Gmail after account creation.
                </Text>
              </View>
            </View>
          </View>

          {/* RIGHT SIDE */}
          <View style={styles.createAccountPreviewColumn}>
            <View
              style={[
                styles.previewStickyCard,
                isDarkMode && {
                  backgroundColor: "#0F172A",
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <View style={styles.createAccountPreviewTop}>
                <View
                  style={[
                    styles.createAccountPreviewAvatar,
                    { backgroundColor: `${getRoleColor(newUserData.role)}16` },
                  ]}
                >
                  <Text
                    style={[
                      styles.createAccountPreviewAvatarText,
                      { color: getRoleColor(newUserData.role) },
                    ]}
                  >
                    {`${(newUserData.firstName || "A").charAt(0)}${(
                      newUserData.lastName || "U"
                    ).charAt(0)}`.toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.createAccountPreviewName,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    {`${newUserData.firstName || "New"} ${newUserData.lastName || "User"}`}
                  </Text>
                  <View
                    style={[
                      styles.createAccountPreviewRoleBadge,
                      { backgroundColor: `${getRoleColor(newUserData.role)}14` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.createAccountPreviewRoleText,
                        { color: getRoleColor(newUserData.role) },
                      ]}
                    >
                      {newUserData.role === "staff"
                        ? "Staff Account"
                        : "Security Account"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.createAccountPreviewList}>
                <View style={styles.createAccountPreviewItem}>
                  <Text
                    style={[
                      styles.createAccountPreviewLabel,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Email
                  </Text>
                  <Text
                    style={[
                      styles.createAccountPreviewValue,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    {newUserData.email || "No email yet"}
                  </Text>
                </View>

                <View style={styles.createAccountPreviewItem}>
                  <Text
                    style={[
                      styles.createAccountPreviewLabel,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Phone
                  </Text>
                  <Text
                    style={[
                      styles.createAccountPreviewValue,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    {newUserData.phone || "No phone yet"}
                  </Text>
                </View>

                <View style={styles.createAccountPreviewItem}>
                  <Text
                    style={[
                      styles.createAccountPreviewLabel,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Department
                  </Text>
                  <Text
                    style={[
                      styles.createAccountPreviewValue,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    {newUserData.department || "Not assigned"}
                  </Text>
                </View>

                <View style={styles.createAccountPreviewItem}>
                  <Text
                    style={[
                      styles.createAccountPreviewLabel,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Position
                  </Text>
                  <Text
                    style={[
                      styles.createAccountPreviewValue,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    {newUserData.position || "Not assigned"}
                  </Text>
                </View>

                <View style={styles.createAccountPreviewItem}>
                  <Text
                    style={[
                      styles.createAccountPreviewLabel,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Employee ID
                  </Text>
                  <Text
                    style={[
                      styles.createAccountPreviewValue,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    {newUserData.employeeId || generatedCreateUserEmployeeId}
                  </Text>
                </View>

                <View style={styles.createAccountPreviewItem}>
                  <Text
                    style={[
                      styles.createAccountPreviewLabel,
                      isDarkMode && styles.darkTextSecondary,
                    ]}
                  >
                    Username
                  </Text>
                  <Text
                    style={[
                      styles.createAccountPreviewValue,
                      isDarkMode && styles.darkText,
                    ]}
                  >
                    {newUserData.username || "No username yet"}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.createAccountPreviewNote,
                  isDarkMode && {
                    backgroundColor: "#111827",
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <Ionicons name="information-circle-outline" size={16} color="#1C6DD0" />
                <Text
                  style={[
                    styles.createAccountPreviewNoteText,
                    isDarkMode && styles.darkTextSecondary,
                  ]}
                >
                  Review all details before saving. This account will be routed
                  to the proper dashboard after login.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.modalFooter,
          isDarkMode && { borderTopColor: theme.borderColor },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.cancelButton,
            isDarkMode && { backgroundColor: "#334155" },
          ]}
          onPress={() => resetCreateUserForm(newUserData.role)}
        >
          <Text
            style={[
              styles.cancelButtonText,
              isDarkMode && styles.darkTextSecondary,
            ]}
          >
            Clear Form
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: getRoleColor(newUserData.role) }]}
          onPress={handleCreateUser}
          disabled={processingId === "create-user"}
        >
          {processingId === "create-user" ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Create Account</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>

      {/* Edit User Modal */}
      <Modal visible={showViewUserModal} transparent animationType="fade" onRequestClose={() => setShowViewUserModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.userProfileModal, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View
              style={[
                styles.userProfileHero,
                { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderBottomColor: theme.borderColor },
              ]}
            >
              <View style={styles.userProfileHeroTopRow}>
                <View
                  style={[
                    styles.userProfileAvatar,
                    { backgroundColor: `${getRoleColor(selectedUser?.role)}16` || "rgba(59,130,246,0.14)" },
                  ]}
                >
                  <Text style={[styles.userProfileAvatarText, { color: getRoleColor(selectedUser?.role) || "#1C6DD0" }]}>
                    {getUserInitials(selectedUser)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowViewUserModal(false)} style={styles.userProfileCloseButton}>
                  <Ionicons name="close" size={22} color={isDarkMode ? "#94A3B8" : "#64748B"} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.userProfileName, isDarkMode && styles.darkText]}>
                {selectedUser?.firstName} {selectedUser?.lastName}
              </Text>
              <Text style={[styles.userProfileEmail, isDarkMode && styles.darkTextSecondary]}>
                {selectedUser?.email || "No email available"}
              </Text>

              <View style={styles.userProfileBadgeRow}>
                <View style={[styles.userProfileBadge, { backgroundColor: `${getRoleColor(selectedUser?.role)}14` || "rgba(59,130,246,0.12)" }]}>
                  <Text style={[styles.userProfileBadgeText, { color: getRoleColor(selectedUser?.role) || "#1C6DD0" }]}>
                    {formatRoleLabel(selectedUser?.role)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.userProfileBadge,
                    {
                      backgroundColor: isUserActive(selectedUser) ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.userProfileBadgeText,
                      { color: isUserActive(selectedUser) ? "#10B981" : "#EF4444" },
                    ]}
                  >
                    {isUserActive(selectedUser) ? "Active Account" : "Inactive Account"}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView style={styles.userProfileBody} contentContainerStyle={styles.userProfileBodyContent} showsVerticalScrollIndicator={false}>
              <View style={styles.userProfileSection}>
                <Text style={[styles.userProfileSectionTitle, isDarkMode && styles.darkText]}>Account Overview</Text>
                <View style={styles.userProfileInfoGrid}>
                  <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                    <Text style={styles.userProfileInfoLabel}>Username</Text>
                    <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                      {selectedUser?.username || "Not set"}
                    </Text>
                  </View>
                  <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                    <Text style={styles.userProfileInfoLabel}>Phone</Text>
                    <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                      {selectedUser?.phone || "No phone number"}
                    </Text>
                  </View>
                  <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                    <Text style={styles.userProfileInfoLabel}>
                      {String(selectedUser?.role || "").toLowerCase() === "student"
                        ? "Student ID"
                        : String(selectedUser?.role || "").toLowerCase() === "teacher"
                          ? "Academic Staff ID"
                          : "Employee ID"}
                    </Text>
                    <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                      {selectedUser?.studentId || selectedUser?.teacherId || selectedUser?.employeeId || "Not assigned"}
                    </Text>
                  </View>
                  <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                    <Text style={styles.userProfileInfoLabel}>Department</Text>
                    <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                      {selectedUser?.department || "General"}
                    </Text>
                  </View>
                  <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                    <Text style={styles.userProfileInfoLabel}>Position</Text>
                    <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                      {selectedUser?.position || (isSecurityRole(selectedUser?.role) ? "Security Personnel" : "Not set")}
                    </Text>
                  </View>
                  <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                    <Text style={styles.userProfileInfoLabel}>NFC Card UID</Text>
                    <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                      {selectedUser?.physicalNfcUid || selectedUser?.nfcCardId || "Not assigned"}
                    </Text>
                  </View>
                  {String(selectedUser?.role || "").toLowerCase() === "student" ? (
                    <>
                      <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                        <Text style={styles.userProfileInfoLabel}>Parent / Guardian (Enrollment)</Text>
                        <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                          {selectedUser?.parentName || selectedUser?.guardianName || "Not configured"}
                        </Text>
                      </View>
                      <View style={[styles.userProfileInfoCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                        <Text style={styles.userProfileInfoLabel}>Parent Email (Enrollment)</Text>
                        <Text style={[styles.userProfileInfoValue, isDarkMode && styles.darkText]}>
                          {selectedUser?.parentEmail || selectedUser?.guardianEmail || "Not configured"}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>

              <View
                style={[
                  styles.userProfileCallout,
                  isDarkMode && { backgroundColor: "#172554", borderColor: "#041E42" },
                ]}
              >
                <Ionicons name="information-circle-outline" size={18} color="#1C6DD0" />
                <Text style={[styles.userProfileCalloutText, isDarkMode && { color: "#EEF5FF" }]}>
                  Review the account details here before editing access, role, or status.
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, isDarkMode && { borderTopColor: theme.borderColor }]}>
              <TouchableOpacity
                style={[styles.cancelButton, isDarkMode && { backgroundColor: "#334155" }]}
                onPress={() => setShowViewUserModal(false)}
              >
                <Text style={[styles.cancelButtonText, isDarkMode && styles.darkTextSecondary]}>Close</Text>
              </TouchableOpacity>
              {selectedSubmodule === "data-management" ? (
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => {
                    if (selectedUser) {
                      handleEditUser(selectedUser);
                      setShowViewUserModal(false);
                    }
                  }}
                >
                  <Text style={styles.submitButtonText}>Edit User</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit User Modal */}
      <Modal visible={showEditUserModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.userEditorModal, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View style={[styles.modalHeader, isDarkMode && { borderBottomColor: theme.borderColor }]}>
              <View>
                <Text style={[styles.modalTitle, isDarkMode && styles.darkText]}>Edit User</Text>
                <Text style={[styles.userEditorSubtitle, isDarkMode && styles.darkTextSecondary]}>
                  Update account details, role, and operational status.
                </Text>
                {lastUserSavedAt ? (
                  <Text style={[styles.userEditorSubtitle, { color: "#047857", marginTop: 4 }]}>
                    Saved just now at {formatSafePassTime(lastUserSavedAt)}.
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setShowEditUserModal(false)}>
                <Ionicons name="close" size={24} color={isDarkMode ? "#94A3B8" : "#6B7280"} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.userEditorBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.userEditorHero, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                <View style={[styles.userProfileAvatar, { backgroundColor: `${getRoleColor(editUserData.role)}16` }]}>
                  <Text style={[styles.userProfileAvatarText, { color: getRoleColor(editUserData.role) }]}>
                    {getUserInitials(editUserData)}
                  </Text>
                </View>
                <View style={styles.userEditorHeroCopy}>
                  <Text style={[styles.userEditorHeroName, isDarkMode && styles.darkText]}>
                    {editUserData.firstName || "User"} {editUserData.lastName || ""}
                  </Text>
                  <Text style={[styles.userEditorHeroEmail, isDarkMode && styles.darkTextSecondary]}>
                    {editUserData.email || "No email available"}
                  </Text>
                  <View style={styles.userProfileBadgeRow}>
                    <View style={[styles.userProfileBadge, { backgroundColor: `${getRoleColor(editUserData.role)}14` }]}>
                      <Text style={[styles.userProfileBadgeText, { color: getRoleColor(editUserData.role) }]}>
                        {formatRoleLabel(editUserData.role)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.userProfileBadge,
                        {
                          backgroundColor: editUserData.status === "active" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.userProfileBadgeText,
                          { color: editUserData.status === "active" ? "#10B981" : "#EF4444" },
                        ]}
                      >
                        {editUserData.status === "active" ? "Active" : "Inactive"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.userEditorSection}>
                <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Identity</Text>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>First Name</Text>
                    <TextInput
                      style={[
                        styles.input,
                        editUserErrors.firstName && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={editUserData.firstName}
                      onChangeText={(text) => {
                        setEditUserData({ ...editUserData, firstName: text });
                        setEditUserErrors((currentValue) => ({ ...currentValue, firstName: null }));
                      }}
                      placeholder="First Name"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderEditUserFieldError("firstName")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Last Name</Text>
                    <TextInput
                      style={[
                        styles.input,
                        editUserErrors.lastName && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={editUserData.lastName}
                      onChangeText={(text) => {
                        setEditUserData({ ...editUserData, lastName: text });
                        setEditUserErrors((currentValue) => ({ ...currentValue, lastName: null }));
                      }}
                      placeholder="Last Name"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderEditUserFieldError("lastName")}
                  </View>
                </View>
              </View>

              <View style={styles.userEditorSection}>
                <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Contact</Text>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Username</Text>
                    <TextInput
                      style={[
                        styles.input,
                        editUserErrors.username && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={editUserData.username}
                      onChangeText={(text) => {
                        setEditUserData({ ...editUserData, username: normalizeUsernameInput(text) });
                        setEditUserErrors((currentValue) => ({ ...currentValue, username: null }));
                      }}
                      placeholder="Username"
                      autoCapitalize="none"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderEditUserFieldError("username")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Email</Text>
                    <TextInput
                      style={[
                        styles.input,
                        editUserErrors.email && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={editUserData.email}
                      onChangeText={(text) => {
                        setEditUserData({ ...editUserData, email: text });
                        setEditUserErrors((currentValue) => ({ ...currentValue, email: null }));
                      }}
                      placeholder="user@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderEditUserFieldError("email")}
                  </View>
                </View>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Phone</Text>
                    <TextInput
                      style={[
                        styles.input,
                        editUserErrors.phone && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={editUserData.phone}
                      onChangeText={(text) => {
                        setEditUserData({ ...editUserData, phone: text });
                        setEditUserErrors((currentValue) => ({ ...currentValue, phone: null }));
                      }}
                      placeholder="09123456789"
                      keyboardType="phone-pad"
                      maxLength={16}
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    {renderEditUserFieldError("phone")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Staff ID</Text>
                    <TextInput
                      style={[styles.input, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]}
                      value={editUserData.employeeId}
                      onChangeText={(text) => setEditUserData({ ...editUserData, employeeId: text })}
                      placeholder="Staff ID"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.userEditorSection}>
                <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Access & Role</Text>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Role</Text>
                  <View style={styles.userEditorRoleWrap}>
                    {["staff", "teacher", "security", "student", "admin", "visitor"].map((role) => (
                      <TouchableOpacity
                        key={role}
                        style={[
                          styles.userEditorRoleOption,
                          editUserData.role === role && styles.roleOptionActive,
                          isDarkMode && editUserData.role !== role && { backgroundColor: "#334155", borderColor: "#475569" },
                        ]}
                        onPress={() => setEditUserData((currentForm) => {
                          const nextDepartment =
                            role === "security"
                              ? "Security Department"
                              : currentForm.department === "Security Department" || !currentForm.department
                                ? "Admissions"
                                : currentForm.department;
                          return {
                            ...currentForm,
                            role,
                            department: nextDepartment,
                            position:
                              role === "security"
                                ? currentForm.position || "Security Personnel"
                                : currentForm.position === "Security Personnel"
                                  ? getDefaultStaffPosition(nextDepartment)
                                  : currentForm.position || getDefaultStaffPosition(nextDepartment),
                            shift: "",
                          };
                        })}
                      >
                        <Text style={[styles.roleText, editUserData.role === role && styles.roleTextActive, isDarkMode && editUserData.role !== role && { color: "#CBD5E1" }]}>
                          {formatRoleLabel(role)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Status</Text>
                    <View style={styles.roleSelector}>
                      <TouchableOpacity
                        style={[styles.roleOption, editUserData.status === "active" && styles.roleOptionActive, isDarkMode && editUserData.status !== "active" && { backgroundColor: "#334155", borderColor: "#475569" }]}
                        onPress={() => setEditUserData({ ...editUserData, status: "active", isActive: true })}
                      >
                        <Text style={[styles.roleText, editUserData.status === "active" && styles.roleTextActive, isDarkMode && editUserData.status !== "active" && { color: "#CBD5E1" }]}>Active</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.roleOption, editUserData.status === "inactive" && styles.roleOptionActive, isDarkMode && editUserData.status !== "inactive" && { backgroundColor: "#334155", borderColor: "#475569" }]}
                        onPress={() => setEditUserData({ ...editUserData, status: "inactive", isActive: false })}
                      >
                        <Text style={[styles.roleText, editUserData.status === "inactive" && styles.roleTextActive, isDarkMode && editUserData.status !== "inactive" && { color: "#CBD5E1" }]}>Inactive</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Employee ID</Text>
                    <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                      <Ionicons name="card-outline" size={16} color="#64748B" />
                      <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                        {editUserData.employeeId || "Not assigned"}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.userEditorGrid}>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>NFC Card UID</Text>
                    <TextInput
                      style={[
                        styles.input,
                        editUserErrors.nfcCardId && styles.inputErrorState,
                        isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                      ]}
                      value={editUserData.nfcCardId}
                      onChangeText={(text) => {
                        setEditUserData({ ...editUserData, nfcCardId: text });
                        setEditUserErrors((currentValue) => ({ ...currentValue, nfcCardId: null }));
                      }}
                      placeholder="Scan or type card UID"
                      autoCapitalize="characters"
                      placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                    />
                    <Text style={[styles.inputHint, isDarkMode && styles.darkTextSecondary]}>
                      This is the UID matched when the physical NFC card is tapped.
                    </Text>
                    {renderEditUserFieldError("nfcCardId")}
                  </View>
                  <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                    <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Card Link</Text>
                    <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                      <Ionicons name="radio-outline" size={16} color="#64748B" />
                      <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                        {editUserData.nfcCardId ? "Assigned to this account" : "No physical UID assigned"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {(editUserData.role === "student" || editUserData.role === "teacher") && (
                <View style={styles.userEditorSection}>
                  <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>
                    {editUserData.role === "teacher" ? "Academic Staff Details" : "Student Details"}
                  </Text>
                  <View style={styles.userEditorGrid}>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {editUserData.role === "teacher" ? "Academic Staff ID" : "Student ID"}
                      </Text>
                      <TextInput
                        style={[styles.input, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]}
                        value={editUserData.role === "teacher" ? editUserData.teacherId : editUserData.studentId}
                        onChangeText={(text) => setEditUserData({ ...editUserData, [editUserData.role === "teacher" ? "teacherId" : "studentId"]: text })}
                        placeholder={editUserData.role === "teacher" ? "Academic staff ID" : "Student ID"}
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                      />
                    </View>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {editUserData.role === "teacher" ? "Teaching Subject / Area" : "Program"}
                      </Text>
                      <TextInput
                        style={[styles.input, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]}
                        value={editUserData.course}
                        onChangeText={(text) => setEditUserData({ ...editUserData, course: text })}
                        placeholder={editUserData.role === "teacher" ? "Teaching subject or area" : "Program"}
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                      />
                    </View>
                  </View>
                  <View style={styles.userEditorGrid}>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {editUserData.role === "teacher" ? "Department / Grade Level" : "Year Level"}
                      </Text>
                      <TextInput
                        style={[styles.input, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]}
                        value={editUserData.yearLevel}
                        onChangeText={(text) => setEditUserData({ ...editUserData, yearLevel: text })}
                        placeholder={editUserData.role === "teacher" ? "Department or teaching level" : "Year level"}
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                      />
                    </View>
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>
                        {editUserData.role === "teacher" ? "Assigned Section" : "Section"}
                      </Text>
                      <TextInput
                        style={[styles.input, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]}
                        value={editUserData.section}
                        onChangeText={(text) => setEditUserData({ ...editUserData, section: text })}
                        placeholder="Section"
                        placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                      />
                    </View>
                  </View>
                  {editUserData.role === "student" ? (
                    <View style={styles.userEditorGrid}>
                      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Parent / Guardian Name (Enrollment Record)</Text>
                        <TextInput
                          style={[styles.input, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" }]}
                          value={editUserData.parentName}
                          onChangeText={(text) => setEditUserData({ ...editUserData, parentName: text })}
                          placeholder="Parent or guardian name"
                          placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                        />
                      </View>
                      <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                        <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Parent Email (Enrollment Record)</Text>
                        <TextInput
                          style={[
                            styles.input,
                            editUserErrors.parentEmail && styles.inputErrorState,
                            isDarkMode && { backgroundColor: "#334155", borderColor: "#475569", color: "#F1F5F9" },
                          ]}
                          value={editUserData.parentEmail}
                          onChangeText={(text) => {
                            setEditUserData({ ...editUserData, parentEmail: text });
                            setEditUserErrors((currentValue) => ({ ...currentValue, parentEmail: null }));
                          }}
                          placeholder="parent@example.com"
                          placeholderTextColor={isDarkMode ? "#64748B" : "#9CA3AF"}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                        {renderEditUserFieldError("parentEmail")}
                        <Text
                          style={{
                            color: isDarkMode ? "#94A3B8" : "#64748B",
                            fontSize: 12,
                            lineHeight: 17,
                            marginTop: 6,
                          }}
                        >
                          Based on the official enrollment record. Admin changes save directly to the student profile.
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}

              {editUserData.role === "staff" && (
                <View style={styles.userEditorSection}>
                  <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Staff Details</Text>
                  <View style={styles.userEditorGrid}>
                    {renderStaffDropdown({
                      target: "edit",
                      label: "Department",
                      value: editUserData.department,
                      options: STAFF_DEPARTMENT_OPTIONS,
                      placeholder: "Choose department",
                      icon: "business-outline",
                      onSelect: (department) => updateStaffDepartment("edit", department),
                    })}
                    {renderStaffDropdown({
                      target: "edit",
                      label: "Officer Type",
                      value: editUserData.position,
                      options: getStaffOfficerOptions(editUserData.department),
                      placeholder: "Choose officer type",
                      icon: "id-card-outline",
                      onSelect: (position) => updateStaffPosition("edit", position),
                    })}
                    <View style={[styles.userEditorHalfField, styles.inputGroup]}>
                      <Text style={[styles.inputLabel, isDarkMode && styles.darkText]}>Assigned Area</Text>
                      <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                        <Ionicons name="location-outline" size={16} color="#64748B" />
                        <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                          {getStaffDepartmentOption(editUserData.department)?.area || "General Area"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {isSecurityRole(editUserData.role) && (
                <View style={styles.userEditorSection}>
                  <Text style={[styles.userEditorSectionTitle, isDarkMode && styles.darkText]}>Security Details</Text>
                  <View style={[styles.userEditorReadonlyCard, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
                    <Ionicons name="time-outline" size={16} color="#64748B" />
                    <Text style={[styles.userEditorReadonlyText, isDarkMode && styles.darkText]}>
                      Shift schedule is not stored here because assignments can rotate anytime.
                    </Text>
                  </View>
                </View>
              )}

              <View style={[styles.userProfileCallout, isDarkMode && { backgroundColor: "#172554", borderColor: "#041E42" }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#1C6DD0" />
                <Text style={[styles.userProfileCalloutText, isDarkMode && { color: "#EEF5FF" }]}>
                  Email and employee ID stay visible here for reference while you update role-based access settings.
                </Text>
              </View>
            </ScrollView>
            <View style={[styles.modalFooter, isDarkMode && { borderTopColor: theme.borderColor }]}>
              <TouchableOpacity style={[styles.cancelButton, isDarkMode && { backgroundColor: "#334155" }]} onPress={() => setShowEditUserModal(false)}>
                <Text style={[styles.cancelButtonText, isDarkMode && styles.darkTextSecondary]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  processingId === "edit-user" && styles.submitButtonDisabled,
                ]}
                onPress={confirmEditUser}
                disabled={processingId === "edit-user"}
              >
                {processingId === "edit-user" ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Confirm Modal */}
      <Modal
        visible={!!pendingAdminConfirm}
        transparent
        animationType="fade"
        onRequestClose={cancelPendingAdminAction}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View
              style={[
                styles.confirmIconWrap,
                pendingAdminConfirm?.destructive ? styles.confirmIconDanger : styles.confirmIconInfo,
              ]}
            >
              <Ionicons
                name={pendingAdminConfirm?.icon || "help-circle-outline"}
                size={30}
                color={pendingAdminConfirm?.destructive ? "#EF4444" : ADMIN_BLUE}
              />
            </View>
            <Text style={[styles.confirmTitle, isDarkMode && styles.darkText]}>{pendingAdminConfirm?.title}</Text>
            <Text style={[styles.confirmMessage, isDarkMode && styles.darkTextSecondary]}>
              {pendingAdminConfirm?.message}
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmCancel, isDarkMode && { backgroundColor: "#334155" }]}
                onPress={cancelPendingAdminAction}
              >
                <Text style={[styles.confirmCancelText, isDarkMode && styles.darkTextSecondary]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  { backgroundColor: pendingAdminConfirm?.destructive ? "#EF4444" : ADMIN_BLUE },
                ]}
                onPress={confirmPendingAdminAction}
              >
                <Text style={styles.confirmButtonText}>{pendingAdminConfirm?.confirmLabel || "Confirm"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete User Modal */}
      <Modal visible={showDeleteUserModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <Ionicons name="warning" size={48} color="#EF4444" />
            <Text style={[styles.confirmTitle, isDarkMode && styles.darkText]}>Delete User</Text>
            <Text style={[styles.confirmMessage, isDarkMode && styles.darkTextSecondary]}>Delete {selectedUser?.firstName} {selectedUser?.lastName}?</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={[styles.confirmCancel, isDarkMode && { backgroundColor: "#334155" }]} onPress={() => setShowDeleteUserModal(false)}>
                <Text style={[styles.confirmCancelText, isDarkMode && styles.darkTextSecondary]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: "#EF4444" }]}
                onPress={handleDeleteUser}
                disabled={processingId === `delete-user-${selectedUser?._id || selectedUser?.id}`}
              >
                {processingId === `delete-user-${selectedUser?._id || selectedUser?.id}` ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPendingRequestsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPendingRequestsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.pendingRequestsModal,
              isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor },
            ]}
          >
            <View style={[styles.modalHeader, isDarkMode && { borderBottomColor: theme.borderColor }]}>
              <View>
                <Text style={[styles.modalTitle, isDarkMode && styles.darkText]}>Pending Requests</Text>
                <Text style={[styles.pendingRequestsModalSubtitle, isDarkMode && styles.darkTextSecondary]}>
                  Review visitor requests without crowding the dashboard.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowPendingRequestsModal(false)}
              >
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.pendingRequestsModalList}
              contentContainerStyle={styles.pendingRequestsModalListContent}
              showsVerticalScrollIndicator={false}
            >
              {pendingRequests.length ? (
                pendingRequests.slice(0, 10).map((request) => renderRequestCard(request))
              ) : (
                <View style={styles.pendingRequestsModalEmpty}>
                  <Ionicons name="checkmark-circle-outline" size={42} color={ADMIN_BLUE} />
                  <Text style={[styles.pendingRequestsModalEmptyTitle, isDarkMode && styles.darkText]}>
                    No pending requests
                  </Text>
                  <Text style={[styles.pendingRequestsModalEmptyText, isDarkMode && styles.darkTextSecondary]}>
                    New visitor requests will appear here as notifications.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={[styles.modalFooter, isDarkMode && { borderTopColor: theme.borderColor }]}>
              <TouchableOpacity
                style={[styles.cancelButton, isDarkMode && { backgroundColor: "#334155" }]}
                onPress={() => setShowPendingRequestsModal(false)}
              >
                <Text style={[styles.cancelButtonText, isDarkMode && styles.darkTextSecondary]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => {
                  setShowPendingRequestsModal(false);
                  handleMenuAction("requests");
                }}
              >
                <Text style={styles.submitButtonText}>Open Requests</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showLogoutConfirmModal} transparent animationType="fade" onRequestClose={() => setShowLogoutConfirmModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <Ionicons name="log-out-outline" size={48} color="#EF4444" />
            <Text style={[styles.confirmTitle, isDarkMode && styles.darkText]}>Sign Out</Text>
            <Text style={[styles.confirmMessage, isDarkMode && styles.darkTextSecondary]}>
              Would you like to sign out?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmCancel, isDarkMode && { backgroundColor: "#334155" }]}
                onPress={() => setShowLogoutConfirmModal(false)}
                disabled={isLoading}
              >
                <Text style={[styles.confirmCancelText, isDarkMode && styles.darkTextSecondary]}>Stay Signed In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: "#EF4444" }]}
                onPress={performLogout}
                disabled={isLoading}
              >
                {isLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.confirmButtonText}>Sign Out</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create User Success Modal */}
      <Modal
        visible={showCreateSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCreateSuccessModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View style={[styles.createSuccessIcon, isDarkMode && { backgroundColor: "#064E3B" }]}>
              <Ionicons name="checkmark-circle" size={52} color={ADMIN_BLUE} />
            </View>
            <Text style={[styles.confirmTitle, isDarkMode && styles.darkText]}>Account Created</Text>
            <Text style={[styles.confirmMessage, isDarkMode && styles.darkTextSecondary]}>
              The new {createdUserSummary?.role?.toLowerCase() || "user"} account has been created successfully.
            </Text>

            <View style={[styles.createSuccessSummary, isDarkMode && { backgroundColor: "#0F172A", borderColor: theme.borderColor }]}>
              <View style={styles.createSuccessRow}>
                <Text style={[styles.createSuccessLabel, isDarkMode && styles.darkTextSecondary]}>Name</Text>
                <Text style={[styles.createSuccessValue, isDarkMode && styles.darkText]}>{createdUserSummary?.name || "N/A"}</Text>
              </View>
              <View style={styles.createSuccessRow}>
                <Text style={[styles.createSuccessLabel, isDarkMode && styles.darkTextSecondary]}>Email</Text>
                <Text style={[styles.createSuccessValue, isDarkMode && styles.darkText]}>{createdUserSummary?.email || "N/A"}</Text>
              </View>
              <View style={styles.createSuccessRow}>
                <Text style={[styles.createSuccessLabel, isDarkMode && styles.darkTextSecondary]}>Username</Text>
                <Text style={[styles.createSuccessValue, isDarkMode && styles.darkText]}>{createdUserSummary?.username || "N/A"}</Text>
              </View>
              <View style={styles.createSuccessRow}>
                <Text style={[styles.createSuccessLabel, isDarkMode && styles.darkTextSecondary]}>Role</Text>
                <Text style={[styles.createSuccessValue, isDarkMode && styles.darkText]}>{createdUserSummary?.role || "N/A"}</Text>
              </View>
              <View style={styles.createSuccessRow}>
                <Text style={[styles.createSuccessLabel, isDarkMode && styles.darkTextSecondary]}>
                  {createdUserSummary?.idLabel || "Employee ID"}
                </Text>
                <Text style={[styles.createSuccessValue, isDarkMode && styles.darkText]}>{createdUserSummary?.employeeId || "N/A"}</Text>
              </View>
              <View style={styles.createSuccessRow}>
                <Text style={[styles.createSuccessLabel, isDarkMode && styles.darkTextSecondary]}>NFC Card UID</Text>
                <Text style={[styles.createSuccessValue, isDarkMode && styles.darkText]}>{createdUserSummary?.nfcCardId || "No physical UID assigned"}</Text>
              </View>
              <View style={styles.createSuccessRow}>
                <Text style={[styles.createSuccessLabel, isDarkMode && styles.darkTextSecondary]}>Status</Text>
                <Text style={[styles.createSuccessValue, isDarkMode && styles.darkText]}>{createdUserSummary?.status || "N/A"}</Text>
              </View>
            </View>

            <View style={[styles.createSuccessNote, isDarkMode && { backgroundColor: "#172554", borderColor: "#041E42" }]}>
              <Ionicons name="mail-outline" size={16} color="#1C6DD0" />
              <Text style={[styles.createSuccessNoteText, isDarkMode && { color: "#B7D5F6" }]}>
                {createdUserSummary?.deliveryNote || "The account details are ready to review."}
              </Text>
            </View>

            <View style={styles.confirmButtons}>
              <TouchableOpacity style={[styles.submitButton, { flex: 1 }]} onPress={handleCloseCreateSuccessModal}>
                <Text style={styles.submitButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* User Management Modal */}
      <Modal visible={showUserManagementModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.userManagementModalContent, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View style={[styles.modalHeader, isDarkMode && { borderBottomColor: theme.borderColor }]}>
              <Text style={[styles.modalTitle, isDarkMode && styles.darkText]}>User Management</Text>
              <TouchableOpacity onPress={() => setShowUserManagementModal(false)}>
                <Ionicons name="close" size={24} color={isDarkMode ? "#94A3B8" : "#6B7280"} />
              </TouchableOpacity>
            </View>

            <View style={styles.userManagementModalBody}>
              {createUserMessage ? (
                <View
                  style={{
                    backgroundColor: isDarkMode ? "#064E3B" : "#EEF5FF",
                    borderColor: isDarkMode ? "#10B981" : "#86EFAC",
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: isDarkMode ? "#A7F3D0" : "#041E42", fontWeight: "600" }}>
                    {createUserMessage}
                  </Text>
                </View>
              ) : null}

              <View style={styles.roleSelector}>
                {[
                  { key: "active", label: `Active (${activeUsersList.length})` },
                  { key: "inactive", label: `Inactive (${inactiveUsersList.length})` },
                  { key: "all", label: `All (${allUsers.length})` },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.roleOption, userManagementStatusTab === item.key && styles.roleOptionActive, isDarkMode && { backgroundColor: "#334155", borderColor: "#475569" }]}
                    onPress={() => setUserManagementStatusTab(item.key)}
                  >
                    <Text style={[styles.roleText, userManagementStatusTab === item.key && styles.roleTextActive, isDarkMode && userManagementStatusTab !== item.key && { color: "#94A3B8" }]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView style={styles.userManagementList} showsVerticalScrollIndicator={false}>
                {userManagementUsers.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                    <Text style={[styles.emptyStateTitle, isDarkMode && styles.darkText]}>No users found</Text>
                    <Text style={[styles.emptyStateSubtitle, isDarkMode && styles.darkTextSecondary]}>
                      No {userManagementStatusTab} users available.
                    </Text>
                  </View>
                ) : (
                  userManagementUsers.map((userItem) => (
                    <View key={userItem._id || userItem.id || userItem.email} style={[styles.userRow, isDarkMode && { borderBottomColor: theme.borderColor }]}>
                      <View style={styles.userInfo}>
                        <View style={[styles.userAvatar, { backgroundColor: `${getRoleColor(userItem.role)}20` }]}>
                          <Ionicons name={getRoleIcon(userItem.role)} size={22} color={getRoleColor(userItem.role)} />
                        </View>
                        <View style={styles.userManagementTextBlock}>
                          <Text style={[styles.userName, isDarkMode && styles.darkText]}>{userItem.firstName} {userItem.lastName}</Text>
                          <Text style={[styles.userEmail, isDarkMode && styles.darkTextSecondary]}>{userItem.email}</Text>
                          <View style={styles.userMeta}>
                            <View style={styles.roleBadge}>
                              <Text style={styles.roleBadgeText}>{userItem.role?.toUpperCase() || "USER"}</Text>
                            </View>
                            <View style={[styles.roleBadge, (userItem.status === "active" || userItem.isActive) ? styles.userStatusBadgeActive : styles.userStatusBadgeInactive]}>
                              <Text style={[styles.roleBadgeText, (userItem.status === "active" || userItem.isActive) ? styles.userStatusTextActive : styles.userStatusTextInactive]}>
                                {(userItem.status === "active" || userItem.isActive) ? "ACTIVE" : "INACTIVE"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>

            <View style={[styles.modalFooter, isDarkMode && { borderTopColor: theme.borderColor }]}>
              <TouchableOpacity style={[styles.cancelButton, { flex: 1 }, isDarkMode && { backgroundColor: "#334155" }]} onPress={() => setShowUserManagementModal(false)}>
                <Text style={[styles.cancelButtonText, isDarkMode && styles.darkTextSecondary]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitButton, { flex: 1 }]} onPress={() => { setShowUserManagementModal(false); handleMenuAction("users"); }}>
                <Text style={styles.submitButtonText}>Open User Page</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAdminMapModal} transparent animationType="slide" onRequestClose={() => setShowAdminMapModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.adminMapModalContent, isDarkMode && { backgroundColor: theme.cardBackground, borderColor: theme.borderColor }]}>
            <View style={[styles.adminMapModalHeader, isDarkMode && { borderBottomColor: theme.borderColor }]}>
              <Text style={[styles.adminMapModalTitle, isDarkMode && styles.darkText]}>Live Monitoring Map</Text>
              <TouchableOpacity onPress={() => setShowAdminMapModal(false)}>
                <Ionicons name="close" size={24} color={isDarkMode ? "#94A3B8" : "#6B7280"} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.adminMapModalBody} showsVerticalScrollIndicator={false}>
              {renderAdminMapOperationalStrip()}
              <SharedMonitoringMap
                title="Live Monitoring Map"
                subtitle="Shared monitoring map for approved visitors, check-ins, and real-time administrative activity."
                iconName="map-outline"
                iconColor={ADMIN_BLUE}
                controls={renderAdminMapFilters()}
                visitors={visibleAdminMapVisitors}
                floors={ADMIN_MAP_FLOORS}
                offices={managedRooms}
                selectedFloor={selectedAdminMapFloor}
                selectedOffice={selectedAdminMapOffice}
                mapBlueprints={MONITORING_MAP_BLUEPRINTS}
                mapLabels={managedMapLabels}
                officePositions={managedRoomPositions}
                onFloorChange={(floorId) => {
                  setSelectedAdminMapFloor(floorId);
                  setSelectedAdminMapOffice("all");
                }}
                onVisitorHover={(item) => setHoveredMapVisitor(item)}
                onVisitorLeave={() => setHoveredMapVisitor(null)}
                onVisitorSelect={(item) => setSelectedMapActivity(item)}
                hoveredVisitor={hoveredMapVisitor}
                fullscreen
                backgroundColor="transparent"
                borderColor={theme.borderColor}
                mapBackgroundColor={isDarkMode ? "#0F172A" : "#FFFFFF"}
                textPrimary={theme.textPrimary}
                textSecondary={theme.textSecondary}
                showFloorNavigation={false}
                containerStyle={{ padding: 0, borderWidth: 0 }}
                mapWrapperStyle={styles.adminMapModalMapWrap}
              />

              <View style={[styles.adminMapSideCard, { backgroundColor: isDarkMode ? "#0F172A" : "#F8FBFE", borderColor: theme.borderColor }]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleContainer}>
                    <Ionicons name="pulse-outline" size={20} color={ADMIN_BLUE} />
                    <Text style={[styles.sectionTitle, isDarkMode && styles.darkText]}>Live Activity Feed</Text>
                  </View>
                </View>

                {renderAdminActivityFilters()}

                {filteredMapActivities.length > 0
                  ? filteredMapActivities.slice(0, 8).map((activity, index) => renderAdminMapActivityItem(activity, index, "modal"))
                  : renderAdminMapEmptyState({
                      title: "No feed activity yet",
                      message: "The live feed will populate after visitor requests, approvals, check-ins, or checkout events.",
                      icon: "pulse-outline",
                    })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal> 
    </SafeAreaView>
  );
}
