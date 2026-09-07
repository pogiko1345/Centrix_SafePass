import Alert from '../utils/Alert';
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Image,
  Platform,
  Animated,
  StatusBar,
  LayoutAnimation,
  UIManager,
  AppState,
  useWindowDimensions,
  Pressable,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import ApiService from "../utils/ApiService";
import { canAccessSecurityDashboard, normalizeRole } from "../utils/authFlow";
import {
  formatSafePassDate,
  formatSafePassDateTime,
  formatSafePassTime,
} from "../utils/dateTimeUtils";
import {
  BRAND,
  MobileBottomNav,
  MobileConnectionBanner,
  MobileEmptyState,
  MobileFilterChips,
  MobileLoadingState,
  MobileSearchField,
  MobileStatusBadge,
} from "../components/mobile/MobileRoleComponents";
import {
  PHILIPPINE_MOBILE_NUMBER_MESSAGE,
  isValidPhilippineMobileNumber,
  normalizePhilippineMobileNumber,
} from "../utils/phoneValidation";
import { describeRfidReaderInput, normalizeRfidReaderInput } from "../utils/rfidReaderUtils";
import styles from "../styles/SecurityDashboardStyles";
import Logo from "../assets/LogoSapphire.jpg";

// Import map components
import SharedMonitoringMap from "../components/SharedMonitoringMap";
import {
  MONITORING_MAP_BLUEPRINTS,
  MONITORING_MAP_FLOORS,
  MONITORING_MAP_OFFICES,
  MONITORING_MAP_OFFICE_POSITIONS,
} from "../utils/monitoringMapConfig";
import {
  buildManagedMapLabels,
  normalizeMapSettingsPayload,
} from "../utils/mapSettingsUtils";

const SECURITY_OPERATIONAL_REFRESH_INTERVAL_MS = 60000;
const SECURITY_DASHBOARD_LOG_THROTTLE_MS = 30000;
const SMART_REFRESH_MIN_INTERVAL_MS = 30000;
const securityDashboardLogTimestamps = new Map();
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const logSecurityDashboardLoadError = (key, label, error) => {
  const now = Date.now();
  const lastLoggedAt = securityDashboardLogTimestamps.get(key) || 0;
  if (now - lastLoggedAt < SECURITY_DASHBOARD_LOG_THROTTLE_MS) return;

  securityDashboardLogTimestamps.set(key, now);
  console.error(label, error);
};

const isSafePassConnectionError = (error) =>
  Boolean(error?.isSafePassConnectionError) ||
  String(error?.code || "") === "SAFEPASS_CONNECTION_ERROR" ||
  String(error?.message || "").includes("Cannot connect to the SafePass server") ||
  String(error?.message || "").includes("Network request failed");

const SidebarHoverPressable = ({ children, style, hoverScale = 1.035, onPress, disabled, ...props }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = (toValue) => {
    if (Platform.OS !== "web") return;
    Animated.spring(scale, {
      toValue,
      useNativeDriver: false,
      tension: 180,
      friction: 12,
    }).start();
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => animateScale(hoverScale)}
      onHoverOut={() => animateScale(1)}
      onMouseEnter={() => animateScale(hoverScale)}
      onMouseLeave={() => animateScale(1)}
      style={[
        style,
        Platform.OS === "web" && styles.sidebarHoverSurface,
        { transform: [{ scale }] },
        disabled && { opacity: 0.7 },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
};

const getAppointmentDateKey = (appointment) => {
  const scheduleValue = appointment?.visitDate || appointment?.visitTime;
  if (!scheduleValue) return "unscheduled";

  const date = new Date(scheduleValue);
  if (Number.isNaN(date.getTime())) return "unscheduled";

  return date.toISOString().slice(0, 10);
};

const getAppointmentDateSortValue = (appointment) => {
  const scheduleValue = appointment?.visitDate || appointment?.visitTime;
  const date = scheduleValue ? new Date(scheduleValue) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : Number.MAX_SAFE_INTEGER;
};

const getAppointmentTimeSortValue = (appointment) => {
  const scheduleValue = appointment?.visitTime || appointment?.visitDate;
  const date = scheduleValue ? new Date(scheduleValue) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : Number.MAX_SAFE_INTEGER;
};

const formatDate = (date) => {
  return formatSafePassDate(date);
};

const compareAppointmentsBySchedule = (left, right) => {
  const dateDifference = getAppointmentDateSortValue(left) - getAppointmentDateSortValue(right);
  if (dateDifference !== 0) return dateDifference;

  const timeDifference = getAppointmentTimeSortValue(left) - getAppointmentTimeSortValue(right);
  if (timeDifference !== 0) return timeDifference;

  return String(left?._id || "").localeCompare(String(right?._id || ""));
};

const groupAppointmentsByDate = (appointments = []) => {
  const groupedAppointments = appointments.reduce((groups, appointment) => {
    const dateKey = getAppointmentDateKey(appointment);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey).push(appointment);
    return groups;
  }, new Map());

  return Array.from(groupedAppointments.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([dateKey, entries]) => ({
      dateKey,
      label:
        dateKey === "unscheduled"
          ? "Schedule pending"
          : formatDate(entries[0]?.visitDate || entries[0]?.visitTime),
      entries: [...entries].sort(compareAppointmentsBySchedule),
    }));
};

const titleCase = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase()) || "Unknown";

const securityMobileTabs = [
  { key: "monitor", label: "Monitor", icon: "pulse-outline", activeIcon: "pulse" },
  { key: "map", label: "Map", icon: "map-outline", activeIcon: "map" },
  { key: "logs", label: "Logs", icon: "list-outline", activeIcon: "list" },
  { key: "alerts", label: "Alerts", icon: "warning-outline", activeIcon: "warning" },
  { key: "profile", label: "Profile", icon: "person-outline", activeIcon: "person" },
];

const securityStatusFilters = [
  { key: "all", label: "All" },
  { key: "active", label: "Inside" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Done" },
];

const securityDateFilters = [
  { key: "all", label: "Any Date" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
];

const securityLogFilters = [
  { key: "all", label: "All" },
  { key: "arrival", label: "Arrivals" },
  { key: "departure", label: "Departures" },
  { key: "denied", label: "Denied" },
];

const SECURITY_ATTENDANCE_SCOPE_OPTIONS = [
  { value: "all", label: "All People" },
  { value: "student", label: "Students" },
  { value: "teacher", label: "Academic Staff" },
  { value: "staff", label: "Staff" },
  { value: "security", label: "Security" },
  { value: "visitor", label: "Visitors" },
];

const SECURITY_ATTENDANCE_DATE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Dates" },
];

const SECURITY_ATTENDANCE_STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "inside", label: "Inside / Present" },
  { value: "late", label: "Late" },
  { value: "checked_out", label: "Checked Out" },
  { value: "completed", label: "Completed" },
];

const getOptionLabel = (options = [], value, fallback = "All") =>
  options.find((option) => option.value === value || option.key === value)?.label || fallback;

const buildAttendanceEmptyCopy = ({ scope, dateFilter, statusFilter, search }) => {
  const scopeLabel = getOptionLabel(SECURITY_ATTENDANCE_SCOPE_OPTIONS, scope, "people").toLowerCase();
  const dateLabel = getOptionLabel(SECURITY_ATTENDANCE_DATE_OPTIONS, dateFilter, "selected dates").toLowerCase();
  const statusLabel = getOptionLabel(SECURITY_ATTENDANCE_STATUS_OPTIONS, statusFilter, "all statuses").toLowerCase();
  const trimmedSearch = String(search || "").trim();

  if (trimmedSearch) {
    return {
      title: "No matching attendance records",
      subtitle: `No ${scopeLabel} records match "${trimmedSearch}" for ${dateLabel} and ${statusLabel}.`,
    };
  }

  return {
    title: `No ${scopeLabel} attendance found`,
    subtitle: `There are no ${statusLabel} records for ${scopeLabel} in ${dateLabel}. Try another date range or person type.`,
  };
};

const getFriendlyNfcErrorMessage = (error, actionLabel = "update this UID") => {
  const status = Number(error?.status || error?.data?.status || 0);
  const message = String(error?.message || error?.data?.message || "").trim();
  const lowered = message.toLowerCase();

  if (status === 403 || lowered.includes("access denied")) {
    return `Access denied. Please sign in with a Security or Admin account that has NFC card permissions, then try to ${actionLabel}.`;
  }

  if (status === 409 || lowered.includes("already assigned")) {
    return `${message || "This UID is already assigned to another account."} Use Replace UID to move it to the selected visitor.`;
  }

  if (status === 404 || lowered.includes("not found")) {
    return message || "No matching visitor account was found for this UID action. Refresh the visitor list and try again.";
  }

  return message || `Unable to ${actionLabel}. Please try again.`;
};

const getSecurityAttendanceDateRange = (shortcut = "today") => {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);

  if (shortcut === "all") return {};
  if (shortcut === "week") fromDate.setDate(now.getDate() - 6);
  if (shortcut === "month") fromDate.setDate(now.getDate() - 29);

  return {
    dateFrom: fromDate.toISOString().slice(0, 10),
    dateTo: toDate,
  };
};

const buildSecurityProfileForm = (profile = {}) => ({
  firstName: profile.firstName || "",
  lastName: profile.lastName || "",
  username: profile.username || "",
  email: profile.email || "",
  phone: profile.phone || "",
  emergencyContact: profile.emergencyContact || "",
  profilePhoto: profile.profilePhoto || null,
});

export default function SecurityDashboardScreen({ navigation }) {
  const { width: viewportWidth } = useWindowDimensions();
  const isDesktop = viewportWidth >= 1024;
  const isMobileLayout = viewportWidth < 768;
  const sidebarTargetWidth = isDesktop ? 280 : 260;

  // ============ STATE MANAGEMENT ============
  const [user, setUser] = useState(null);
  const [securityProfileForm, setSecurityProfileForm] = useState(buildSecurityProfileForm());
  const [securityProfileEditing, setSecurityProfileEditing] = useState(false);
  const [securityProfileSaving, setSecurityProfileSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  
  // Logout Modal State
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const sidebarAnim = useRef(new Animated.Value(isDesktop ? 1 : 0)).current;
  const fullscreenMapAnim = useRef(new Animated.Value(0)).current;
  const liveMapRefreshRef = useRef(false);
  const securityLiveRefreshRef = useRef(false);
  const lastOperationalRefreshAtRef = useRef(0);
  const smartRefreshAtRef = useRef(0);
  const operationalDataSignatureRef = useRef("");
  const notificationDataSignatureRef = useRef("");
  const visitorNfcInputRef = useRef(null);
  const visitorNfcLastInputAtRef = useRef(0);
  const authRedirectHandledRef = useRef(false);

  const clearConnectionIssue = () => setConnectionIssue(null);
  const noteConnectionIssue = (error) => {
    if (!isSafePassConnectionError(error)) return false;
    setConnectionIssue({
      title: "SafePass server unavailable",
      message: error?.message || "Check your internet connection or try again.",
      updatedAt: Date.now(),
    });
    return true;
  };
  
  // Dashboard Data
  const [dashboardStats, setDashboardStats] = useState({
    activeUsers: 0,
    totalVisitorsToday: 0,
    activeAlerts: 0,
    recentAccess: 0,
    occupancyRate: 0,
  });
  
  const [activeUsers, setActiveUsers] = useState([]);
  const [livePresenceSummary, setLivePresenceSummary] = useState({
    total: 0,
    byUserType: {},
  });
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceScope, setAttendanceScope] = useState("all");
  const [attendanceDateFilter, setAttendanceDateFilter] = useState("today");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState("all");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendancePagination, setAttendancePagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    pages: 1,
  });
  const [recentAccess, setRecentAccess] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  // Visitor Management
  const [visitors, setVisitors] = useState({
    active: [],
    pending: [],
    approved: [],
    notReady: [],
    completed: [],
    all: [],
  });
  const [visitorStats, setVisitorStats] = useState({
    totalToday: 0,
    totalThisWeek: 0,
    totalThisMonth: 0,
    activeNow: 0,
    pendingApproval: 0,
  });
  const [analytics, setAnalytics] = useState({
    mostVisitedOffices: [],
    visitorsByHour: [],
    popularVisitPurposes: [],
    averageVisitDuration: 0,
  });
  
  // Map and tracking states
  const [selectedFloor, setSelectedFloor] = useState('ground');
  const [selectedOffice, setSelectedOffice] = useState('all');
  const [mapStatusFilter, setMapStatusFilter] = useState("all");
  const [hoveredVisitor, setHoveredVisitor] = useState(null);
  const [visitorLocations, setVisitorLocations] = useState([]);
  const [showMapModal, setShowMapModal] = useState(false);
  
  // UI State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [securityMobileTab, setSecurityMobileTab] = useState('monitor');
  const [mobileDarkModeEnabled, setMobileDarkModeEnabled] = useState(false);
  const [expandedModule, setExpandedModule] = useState('home');
  const [selectedSubmodule, setSelectedSubmodule] = useState('home-main');
  const [visitorFilter, setVisitorFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visitorNfcSearch, setVisitorNfcSearch] = useState('');
  const [selectedVisitorNfcId, setSelectedVisitorNfcId] = useState('');
  const [visitorNfcUid, setVisitorNfcUid] = useState('');
  const [visitorNfcBusy, setVisitorNfcBusy] = useState(false);
  const [visitorNfcStatus, setVisitorNfcStatus] = useState(null);
  const [visitorNfcLocalVisitors, setVisitorNfcLocalVisitors] = useState({});
  const [visitorNfcPinnedVisitor, setVisitorNfcPinnedVisitor] = useState(null);
  const [mobileDateFilter, setMobileDateFilter] = useState('all');
  const [mobileLocationFilter, setMobileLocationFilter] = useState('all');
  const [mobileLogFilter, setMobileLogFilter] = useState('all');
  const [recordFilterDropdownOpen, setRecordFilterDropdownOpen] = useState(null);
  const [appointmentRecordsPage, setAppointmentRecordsPage] = useState(1);
  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  useEffect(() => {
    const loadMobileTheme = async () => {
      try {
        const savedDarkMode =
          Platform.OS === "web" && typeof window !== "undefined" && window.localStorage
            ? window.localStorage.getItem("darkModeEnabled")
            : typeof AsyncStorage?.getItem === "function"
              ? await AsyncStorage.getItem("darkModeEnabled")
              : null;
        setMobileDarkModeEnabled(savedDarkMode === "true");
      } catch (error) {
        console.log("Security dark mode preference unavailable:", error?.message || error);
      }
    };

    loadMobileTheme();
  }, []);
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingVisitorId, setProcessingVisitorId] = useState(null);
  const [resolvingAlertId, setResolvingAlertId] = useState(null);
  
  // Form State
  const [newVisitor, setNewVisitor] = useState({
    fullName: "",
    phoneNumber: "",
    email: "",
    idNumber: "",
    purposeOfVisit: "",
    host: "",
    assignedOffice: "",
    visitDate: new Date(),
    visitTime: new Date(),
    vehicleNumber: "",
    idPhotoUri: null,
    idPhotoBase64: null,
  });
  
  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Access Logs State
  const [accessLogs, setAccessLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  
  // Reports State
  const [reports, setReports] = useState([]);
  const [reportDateRange, setReportDateRange] = useState({ start: null, end: null });
  const [reportType, setReportType] = useState('daily');
  const [reportsPage, setReportsPage] = useState(1);
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState('all');
  const [reportForm, setReportForm] = useState({
    visitorId: '',
    category: 'suspicious',
    details: '',
  });
  const [mapRooms, setMapRooms] = useState(MONITORING_MAP_OFFICES);
  const [mapRoomPositions, setMapRoomPositions] = useState(MONITORING_MAP_OFFICE_POSITIONS);
  
  // Floors and offices data
  const floors = MONITORING_MAP_FLOORS;
  
  const offices = mapRooms;

  const mapBlueprints = MONITORING_MAP_BLUEPRINTS;

  const officePositions = mapRoomPositions;
  const mapLabels = useMemo(
    () => buildManagedMapLabels(mapRooms, mapRoomPositions),
    [mapRooms, mapRoomPositions],
  );

  const normalizeMapText = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/['".,]/g, "")
      .replace(/\s+/g, " ");

  const getFloorLabel = (floorId) => {
    const matchedFloor = floors.find(
      (floor) => normalizeFloorId(floor.id) === normalizeFloorId(floorId),
    );
    return matchedFloor?.name || "Unassigned floor";
  };

  const getOfficeConfigForLabel = (officeLabel) => {
    const normalizedLabel = normalizeMapText(officeLabel);
    if (!normalizedLabel) {
      return null;
    }

    return (
      offices.find(
        (office) =>
          normalizeMapText(office.name) === normalizedLabel ||
          normalizeMapText(office.id) === normalizedLabel,
      ) ||
      offices.find((office) => normalizeMapText(office.name).includes(normalizedLabel)) ||
      offices.find((office) => normalizedLabel.includes(normalizeMapText(office.name))) ||
      null
    );
  };

  const getVisitorAssignedDestination = (visitor) => {
    const officeLabel =
      visitor?.assignedOffice ||
      visitor?.appointmentDepartment ||
      visitor?.host ||
      "";
    const matchedOffice = getOfficeConfigForLabel(officeLabel);
    const mappedPosition = matchedOffice ? officePositions?.[matchedOffice.id] : null;

    return {
      officeName: matchedOffice?.name || officeLabel || "Campus access",
      floorId: matchedOffice?.floor || "",
      floorLabel: matchedOffice?.floor ? getFloorLabel(matchedOffice.floor) : "Unassigned floor",
      coordinates:
        matchedOffice && mappedPosition
          ? { x: Number(mappedPosition.x), y: Number(mappedPosition.y) }
          : null,
      officeId: matchedOffice?.id || "",
    };
  };

  const getSharedMapLocationForVisitor = (visitor = {}) => {
    const location = visitor?.currentLocation || visitor?.location || {};
    const officeLabel =
      location.office ||
      visitor?.lastTappedOffice ||
      visitor?.office ||
      visitor?.assignedOffice ||
      visitor?.appointmentDepartment ||
      visitor?.expectedDestination ||
      visitor?.host ||
      "";
    const matchedOffice = getOfficeConfigForLabel(officeLabel);
    const mappedPosition = matchedOffice ? officePositions?.[matchedOffice.id] : null;

    if (
      matchedOffice &&
      mappedPosition &&
      Number.isFinite(Number(mappedPosition.x)) &&
      Number.isFinite(Number(mappedPosition.y))
    ) {
      return {
        floor: matchedOffice.floor || location.floor || "ground",
        office: matchedOffice.name,
        coordinates: {
          x: Number(mappedPosition.x),
          y: Number(mappedPosition.y),
        },
        officeId: matchedOffice.id,
      };
    }

    return null;
  };

  // ============ LOGOUT FUNCTIONS ============
  const handleLogoutPress = () => {
    setShowLogoutModal(true);
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  const performLogout = async () => {
    setShowLogoutModal(false);
    setIsLoggingOut(true);
    
    try {
      await ApiService.logout();
      await ApiService.clearAuth();
      navigation.replace("RoleSelect");
    } catch (error) {
      console.error("Logout error:", error);
      await ApiService.clearAuth();
      navigation.replace("RoleSelect");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // ============ INITIALIZATION ============
  useEffect(() => {
    initializeScreen();
    requestPermissions();
    
    return undefined;
  }, []);

  useEffect(() => {
    if (!showMapModal) {
      fullscreenMapAnim.setValue(0);
      return;
    }

    Animated.spring(fullscreenMapAnim, {
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
      tension: 90,
      friction: 13,
    }).start();
  }, [fullscreenMapAnim, showMapModal]);

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

  const initializeScreen = async () => {
    try {
      const currentUser = await loadUserData();
      if (!currentUser) {
        return;
      }

      setIsLoading(false);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();

      await loadOperationalData({ force: true });
      lastOperationalRefreshAtRef.current = Date.now();
      setTimeout(() => {
        Promise.allSettled([
          loadSecurityLivePresence(),
          loadReports(),
          loadNotifications(currentUser, { force: true }),
          loadMapSettings(),
        ]);
      }, 100);
      setTimeout(() => {
        loadSecurityAttendanceRecords();
      }, 500);
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== 'granted') {
        Alert.alert('Permission Needed', 'Camera permission is required to capture visitor ID photos.');
      }
    }
  };

  useEffect(() => {
    const nextSidebarOpen = isDesktop;
    setSidebarOpen(nextSidebarOpen);
    Animated.spring(sidebarAnim, {
      toValue: nextSidebarOpen ? 1 : 0,
      useNativeDriver: false,
      tension: 260,
      friction: 28,
    }).start();
  }, [isDesktop, sidebarAnim]);

  const toggleSidebar = () => {
    const toValue = sidebarOpen ? 0 : 1;
    Animated.spring(sidebarAnim, {
      toValue,
      useNativeDriver: false,
      tension: 300,
      friction: 30,
    }).start();
    setSidebarOpen(!sidebarOpen);
  };

  const getStartOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const normalizeNotificationReadState = (notification, currentUserId) => {
    if (!notification || !currentUserId) {
      return false;
    }

    return Array.isArray(notification.readBy) && notification.readBy.some((entry) => {
      const readByUserId =
        typeof entry?.user === 'object' ? entry?.user?._id : entry?.user;
      return String(readByUserId) === String(currentUserId);
    });
  };

  const normalizeNotifications = (items = [], currentUserId = user?._id) =>
    items.map((notification) => ({
      ...notification,
      read: normalizeNotificationReadState(notification, currentUserId),
    }));

  const SECURITY_ACTION_ALERT_TYPES = new Set([
    "wrong_office_scan",
    "office_wrong_location",
    "visitor_office_departure_overdue",
    "visitor_overstay_alert",
    "visitor_reported",
  ]);

  const isActiveAlertNotification = (notification) => {
    if (!notification || notification.read) {
      return false;
    }

    const activityType = String(notification.metadata?.activityType || "").toLowerCase();
    const type = String(notification.type || "").toLowerCase();
    const severity = String(notification.severity || "").toLowerCase();
    const title = String(notification.title || "").toLowerCase();

    if (SECURITY_ACTION_ALERT_TYPES.has(activityType)) {
      return true;
    }

    return (
      type === "alert" &&
      severity === "high" &&
      (
        title.includes("unauthorized") ||
        title.includes("wrong") ||
        title.includes("overstay") ||
        title.includes("reported") ||
        title.includes("away from office")
      )
    );
  };

  const getAlertNotificationKey = (notification = {}) => {
    const activityType = String(notification.metadata?.activityType || notification.type || "alert").toLowerCase();
    const visitorId =
      notification.relatedVisitor?._id ||
      notification.relatedVisitor ||
      notification.metadata?.visitorId ||
      notification.metadata?.visitorName ||
      notification.title ||
      notification._id;
    const location =
      notification.metadata?.scannedOffice ||
      notification.metadata?.actualLocation ||
      notification.metadata?.office ||
      "";
    return [activityType, visitorId, location].map((value) => String(value || "").toLowerCase()).join(":");
  };

  const getSpecificSecurityAlerts = (items = []) => {
    const alertMap = new Map();

    items
      .filter(isActiveAlertNotification)
      .forEach((notification) => {
        const key = getAlertNotificationKey(notification);
        const existingAlert = alertMap.get(key);
        if (
          !existingAlert ||
          new Date(notification.createdAt || 0).getTime() > new Date(existingAlert.createdAt || 0).getTime()
        ) {
          alertMap.set(key, notification);
        }
      });

    return Array.from(alertMap.values()).sort(
      (left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime(),
    );
  };

  const COMPLETED_VISITOR_HISTORY_DAYS = 30;

  const isWithinCompletedHistoryWindow = (visitor) => {
    const completedAt =
      visitor?.checkedOutAt ||
      visitor?.updatedAt ||
      visitor?.visitDate;

    if (!completedAt) {
      return false;
    }

    const completedDate = new Date(completedAt);
    if (Number.isNaN(completedDate.getTime())) {
      return false;
    }

    const cutoffDate = new Date();
    cutoffDate.setHours(0, 0, 0, 0);
    cutoffDate.setDate(cutoffDate.getDate() - COMPLETED_VISITOR_HISTORY_DAYS);

    return completedDate >= cutoffDate;
  };

  const getCompletedHistoryDaysLeft = (visitor) => {
    const completedAt =
      visitor?.checkedOutAt ||
      visitor?.updatedAt ||
      visitor?.visitDate;

    if (!completedAt) {
      return null;
    }

    const completedDate = new Date(completedAt);
    if (Number.isNaN(completedDate.getTime())) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    completedDate.setHours(0, 0, 0, 0);

    const elapsedDays = Math.floor((today - completedDate) / 86400000);
    return Math.max(0, COMPLETED_VISITOR_HISTORY_DAYS - elapsedDays);
  };

  const getVisitorDuplicateDayKey = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  };

  const normalizeDuplicateText = (value = "") =>
    String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

  const getApprovedDuplicateKey = (visitor = {}) => {
    const email = normalizeDuplicateText(visitor.email);
    const purpose = normalizeDuplicateText(
      visitor.purposeOfVisit || visitor.customPurposeOfVisit || visitor.purposeCategory,
    );
    const day = getVisitorDuplicateDayKey(visitor.visitDate);
    if (!email || !purpose || !day) return "";
    return `${email}|${purpose}|${day}`;
  };

  const dedupeApprovedVisitors = (items = []) => {
    const visitorMap = new Map();
    const passthrough = [];

    items.forEach((visitor) => {
      const key = getApprovedDuplicateKey(visitor);
      if (!key) {
        passthrough.push(visitor);
        return;
      }

      const existing = visitorMap.get(key);
      const visitorTime = new Date(
        visitor.updatedAt || visitor.staffActionAt || visitor.approvedAt || visitor.registeredAt || 0,
      ).getTime();
      const existingTime = new Date(
        existing?.updatedAt || existing?.staffActionAt || existing?.approvedAt || existing?.registeredAt || 0,
      ).getTime();
      if (!existing || visitorTime > existingTime) {
        visitorMap.set(key, visitor);
      }
    });

    return [...passthrough, ...visitorMap.values()];
  };

  const deriveVisitorCollections = (all = []) => {
    const active = all.filter((visitor) => visitor.status === 'checked_in');
    const pending = all.filter(
      (visitor) =>
        visitor.appointmentStatus === 'pending' ||
        (!visitor.appointmentStatus && visitor.approvalStatus === 'pending'),
    );
    const approved = dedupeApprovedVisitors(all.filter(
      (visitor) =>
        isCheckInAllowedNow(visitor) &&
        visitor.status !== 'checked_in' &&
        visitor.status !== 'checked_out',
    ));
    const notReady = dedupeApprovedVisitors(all.filter(
      (visitor) =>
        hasApprovedVisitWindow(visitor) &&
        !isCheckInAllowedNow(visitor) &&
        visitor.status !== 'checked_in' &&
        visitor.status !== 'checked_out',
    ));
    const completed = all.filter(
      (visitor) =>
        visitor.status === 'checked_out' &&
        isWithinCompletedHistoryWindow(visitor),
    );
    const securityStatusUpdates = all.filter((visitor) => {
      const appointmentStatus = String(visitor?.appointmentStatus || "").toLowerCase();
      const approvalStatus = String(visitor?.approvalStatus || "").toLowerCase();
      return (
        approvalStatus === "approved" &&
        ["rescheduled", "cancelled"].includes(appointmentStatus)
      );
    });
    const allVisible = [...active, ...approved, ...notReady, ...completed, ...securityStatusUpdates]
      .filter((visitor, index, items) =>
        index === items.findIndex((item) => String(item?._id) === String(visitor?._id)),
      )
      .sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || b.visitDate) - new Date(a.updatedAt || a.createdAt || a.visitDate)
    );

    return { active, pending, approved, notReady, completed, all: allVisible };
  };

  const deriveVisitorStats = (all = [], active = [], pending = []) => {
    const today = getStartOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    return {
      totalToday: all.filter((visitor) => {
        const visitDate = new Date(visitor.visitDate);
        return visitDate >= today && visitDate < tomorrow;
      }).length,
      totalThisWeek: all.filter((visitor) => new Date(visitor.visitDate) >= weekAgo).length,
      totalThisMonth: all.filter((visitor) => new Date(visitor.visitDate) >= monthAgo).length,
      activeNow: active.length,
      pendingApproval: pending.length,
    };
  };

  const deriveAnalytics = (all = []) => {
    const officeCount = {};
    const purposeCount = {};
    const visitsByHour = new Array(24).fill(0);
    const visitDurations = [];

    all.forEach((visitor) => {
      const office = visitor.assignedOffice || visitor.host;
      if (office) {
        officeCount[office] = (officeCount[office] || 0) + 1;
      }

      const purpose = visitor.purposeOfVisit;
      if (purpose) {
        purposeCount[purpose] = (purposeCount[purpose] || 0) + 1;
      }

      if (visitor.visitTime) {
        const visitHour = new Date(visitor.visitTime).getHours();
        if (!Number.isNaN(visitHour)) {
          visitsByHour[visitHour] += 1;
        }
      }

      if (visitor.checkedInAt && visitor.checkedOutAt) {
        const durationMinutes =
          (new Date(visitor.checkedOutAt) - new Date(visitor.checkedInAt)) / 60000;
        if (durationMinutes > 0) {
          visitDurations.push(durationMinutes);
        }
      }
    });

    const totalVisitors = all.length || 1;
    const mostVisitedOffices = Object.entries(officeCount)
      .map(([office, count]) => ({
        office,
        count,
        percentage: Math.round((count / totalVisitors) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const popularVisitPurposes = Object.entries(purposeCount)
      .map(([purpose, count]) => ({ purpose, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const averageVisitDuration =
      visitDurations.length > 0
        ? Math.round(
            visitDurations.reduce((sum, minutes) => sum + minutes, 0) /
              visitDurations.length,
          )
        : 0;

    return {
      mostVisitedOffices,
      visitorsByHour: visitsByHour.map((count, hour) => ({ hour, count })),
      popularVisitPurposes,
      averageVisitDuration,
    };
  };

  const getVisitorTrackingIdentity = (visitor = {}) => {
    const relatedUserId =
      visitor?.relatedUser?._id ||
      visitor?.sourceVisitor?.relatedUser?._id ||
      visitor?.relatedUser ||
      visitor?.sourceVisitor?.relatedUser ||
      visitor?.userId ||
      visitor?.sourceVisitor?.userId ||
      visitor?.accountId ||
      visitor?.sourceVisitor?.accountId ||
      "";
    const candidates = [
      relatedUserId,
      visitor?.safePassId,
      visitor?.sourceVisitor?.safePassId,
      visitor?.physicalNfcUid,
      visitor?.sourceVisitor?.physicalNfcUid,
      visitor?.phoneNfcUid,
      visitor?.sourceVisitor?.phoneNfcUid,
      visitor?.virtualNfcToken,
      visitor?.sourceVisitor?.virtualNfcToken,
      visitor?.nfcCardId,
      visitor?.sourceVisitor?.nfcCardId,
      visitor?.email,
      visitor?.sourceVisitor?.email,
      visitor?._id,
      visitor?.visitorId,
    ];

    return String(candidates.find(Boolean) || "").trim().toLowerCase();
  };

  const getVisitorTrackingTimestamp = (visitor = {}) =>
    new Date(
      visitor?.currentLocation?.lastSeenAt ||
        visitor?.checkedInAt ||
        visitor?.updatedAt ||
        visitor?.registeredAt ||
        visitor?.createdAt ||
        0,
    ).getTime() || 0;

  const getVisitorLocationAction = (visitor = {}) =>
    String(
      visitor?.location?.action ||
        visitor?.currentLocation?.action ||
        visitor?.sourceVisitor?.currentLocation?.action ||
        "",
    ).toLowerCase();

  const getVisitorCurrentOfficeLabel = (visitor = {}) =>
    String(
      visitor?.location?.office ||
        visitor?.currentLocation?.office ||
        visitor?.sourceVisitor?.currentLocation?.office ||
        visitor?.currentLocation?.checkpointId ||
        visitor?.location?.checkpointId ||
        "",
    ).trim();

  const normalizeMapOfficeLabel = (office = "") =>
    String(office || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\boffice\b/g, "")
      .replace(/\broom\b/g, "")
      .trim();

  const getVisitorExpectedOfficeLabel = (visitor = {}) =>
    String(
      visitor?.expectedDestination ||
        visitor?.currentDestination?.office ||
        visitor?.sourceVisitor?.currentDestination?.office ||
        visitor?.appointmentDepartment ||
        visitor?.sourceVisitor?.appointmentDepartment ||
        visitor?.assignedOffice ||
        visitor?.sourceVisitor?.assignedOffice ||
        visitor?.host ||
        visitor?.sourceVisitor?.host ||
        "",
    ).trim();

  const isVisitorAtExpectedOffice = (visitor = {}) => {
    const currentOffice = normalizeMapOfficeLabel(getVisitorCurrentOfficeLabel(visitor));
    const expectedOffice = normalizeMapOfficeLabel(getVisitorExpectedOfficeLabel(visitor));
    return Boolean(currentOffice && expectedOffice && currentOffice === expectedOffice);
  };

  const hasActiveWrongLocationAlert = (visitor = {}) =>
    Boolean(visitor?.wrongLocationAlerts?.length) && !isVisitorAtExpectedOffice(visitor);

  const isLobbyOrGateLocation = (office = "") => {
    const normalizedOffice = String(office || "").trim().toLowerCase();
    return ["lobby", "entrance", "gate", "main gate", "front desk"].some((keyword) =>
      normalizedOffice.includes(keyword),
    );
  };

  const getVisitorLocationTimestamp = (visitor = {}) =>
    new Date(
      visitor?.location?.timestamp ||
        visitor?.currentLocation?.lastSeenAt ||
        visitor?.sourceVisitor?.currentLocation?.lastSeenAt ||
        0,
    ).getTime();

  const isVisitorAwaitingNextCheckpoint = (visitor = {}) => {
    const action = getVisitorLocationAction(visitor);
    return action === "office_departure";
  };

  const isVisitorMovementStale = (visitor = {}) => {
    if (!isVisitorAwaitingNextCheckpoint(visitor)) return false;
    const timestamp = getVisitorLocationTimestamp(visitor);
    return timestamp > 0 && Date.now() - timestamp > 15 * 60 * 1000;
  };

  const getVisitorMapState = (visitor = {}) => {
    if (hasActiveWrongLocationAlert(visitor) || isVisitorMovementStale(visitor)) return "attention";
    const action = getVisitorLocationAction(visitor);
    if (action === "office_departure") return "left_office";
    if (action === "check_in" && isLobbyOrGateLocation(getVisitorCurrentOfficeLabel(visitor))) {
      return "in_lobby";
    }
    if (["check_in", "location_update"].includes(action)) {
      return isLobbyOrGateLocation(getVisitorCurrentOfficeLabel(visitor)) ? "in_lobby" : "inside_office";
    }
    if (String(visitor?.status || visitor?.sourceVisitor?.status || "").toLowerCase() === "checked_in") {
      return "checked_in";
    }
    return "unknown";
  };

  const getVisitorMapStateMeta = (visitor = {}) => {
    const state = getVisitorMapState(visitor);
    if (state === "attention") {
      return { label: "Needs Attention", color: BRAND.danger, icon: "warning-outline" };
    }
    if (state === "inside_office") {
      return { label: "Entered Office", color: BRAND.blue, icon: "business-outline" };
    }
    if (state === "in_lobby") {
      return { label: "In Lobby", color: BRAND.success, icon: "log-in-outline" };
    }
    if (state === "left_office") {
      return { label: "Left Office", color: BRAND.warning, icon: "walk-outline" };
    }
    if (state === "checked_in") {
      return { label: "Checked In", color: BRAND.success, icon: "checkmark-circle-outline" };
    }
    return { label: "Tracking", color: BRAND.muted, icon: "radio-outline" };
  };

  const isMapAttentionVisitor = (visitor = {}) => {
    if (hasActiveWrongLocationAlert(visitor)) return true;
    return isVisitorMovementStale(visitor);
  };

  const getMapAttentionReason = (visitor = {}) => {
    if (hasActiveWrongLocationAlert(visitor)) {
      const alert = visitor.wrongLocationAlerts[0];
      const actualOffice = alert?.actualLocation || visitor?.location?.office || "unknown office";
      const expectedOffice = getVisitorExpectedOfficeLabel(visitor);
      return expectedOffice
        ? `Wrong office: ${actualOffice}. Expected: ${expectedOffice}.`
        : `Wrong office: ${actualOffice}.`;
    }
    if (isMapAttentionVisitor(visitor)) {
      return "Left office more than 15 minutes ago. Verify next checkpoint or checkout.";
    }
    return "No action needed.";
  };

  const getMapLastUpdatedLabel = (items = visitorLocations) => {
    const latestTimestamp = Math.max(
      0,
      ...items.map((visitor) => getVisitorTrackingTimestamp(visitor)).filter(Boolean),
    );
    if (!latestTimestamp) return "No live updates yet";
    return `Updated ${getFreshnessLabel(latestTimestamp)}`;
  };

  const dedupeActiveTrackedVisitors = (activeVisitors = []) => {
    const visitorMap = new Map();

    activeVisitors
      .filter((visitor) => visitor?.status === 'checked_in')
      .forEach((visitor) => {
        const identity = getVisitorTrackingIdentity(visitor);
        if (!identity) return;

        const existingVisitor = visitorMap.get(identity);
        if (!existingVisitor || getVisitorTrackingTimestamp(visitor) > getVisitorTrackingTimestamp(existingVisitor)) {
          visitorMap.set(identity, visitor);
        }
      });

    return Array.from(visitorMap.values());
  };

  const deriveVisitorLocations = (activeVisitors = []) =>
    dedupeActiveTrackedVisitors(activeVisitors)
      .map((visitor, index) => {
        const assignedDestination = getVisitorAssignedDestination(visitor);
        const liveLocation = visitor.currentLocation?.isActive
          ? visitor.currentLocation
          : null;
        const sharedMapLocation = getSharedMapLocationForVisitor(visitor);
        const liveCoordinates = liveLocation?.coordinates || {};
        const hasLiveCoordinates =
          Number.isFinite(Number(liveCoordinates.x)) &&
          Number.isFinite(Number(liveCoordinates.y));
        const hasAssignedCoordinates =
          Number.isFinite(Number(assignedDestination?.coordinates?.x)) &&
          Number.isFinite(Number(assignedDestination?.coordinates?.y));

        const normalizedVisitor = {
          id: visitor._id,
          _id: visitor._id,
          name: visitor.fullName,
          email: visitor.email,
          phone: visitor.phoneNumber,
          purpose: visitor.purposeOfVisit,
          host: visitor.host,
          checkInTime: visitor.checkedInAt,
          status: visitor.status,
          trackingStatus: liveLocation?.statusLabel || "Inside campus",
          lastScanTime: liveLocation?.lastSeenAt || visitor.checkedInAt,
          idPhoto: visitor.idImage,
          sourceVisitor: visitor,
          location: {
            floor: sharedMapLocation?.floor || liveLocation?.floor || assignedDestination.floorId || 'ground',
            office: sharedMapLocation?.office || liveLocation?.office || assignedDestination.officeName || getRandomOffice(),
            coordinates: sharedMapLocation?.coordinates
              ? sharedMapLocation.coordinates
              : hasLiveCoordinates
              ? {
                  x: Number(liveCoordinates.x),
                  y: Number(liveCoordinates.y),
                }
              : hasAssignedCoordinates
                ? {
                    x: Number(assignedDestination.coordinates.x),
                    y: Number(assignedDestination.coordinates.y),
                  }
              : {
                  x: 15 + ((index * 17) % 70),
                  y: 15 + ((index * 23) % 70),
                },
            timestamp: liveLocation?.lastSeenAt || visitor.checkedInAt || new Date(),
            source:
              liveLocation?.source ||
              (sharedMapLocation ? 'shared_map_position' : null) ||
              (hasAssignedCoordinates ? 'assigned_office' : 'system_estimate'),
            action: liveLocation?.action || "",
            statusLabel: liveLocation?.statusLabel || "Inside campus",
            checkpointId: liveLocation?.checkpointId || sharedMapLocation?.officeId || "",
          },
          movement: visitor.locationHistory || [],
        };
        const mapState = getVisitorMapState(normalizedVisitor);
        return {
          ...normalizedVisitor,
          mapState,
          markerColor: getVisitorMapStateMeta(normalizedVisitor).color,
        };
      });

  const normalizeLiveVisitorLocations = (liveVisitors = []) => {
    const normalizedVisitors = liveVisitors.map((visitor, index) => {
      const matchedVisitor =
        visitors.all.find(
          (existingVisitor) => String(existingVisitor?._id) === String(visitor?.visitorId),
        ) || null;
      const coordinates = visitor?.coordinates || {};
      const hasCoordinates =
        Number.isFinite(Number(coordinates.x)) &&
        Number.isFinite(Number(coordinates.y));
      const sharedMapLocation = getSharedMapLocationForVisitor({
        ...matchedVisitor,
        ...visitor,
        currentLocation: {
          ...(matchedVisitor?.currentLocation || {}),
          office: visitor.office || matchedVisitor?.currentLocation?.office || matchedVisitor?.assignedOffice || "",
          floor: visitor.floor || matchedVisitor?.currentLocation?.floor || "ground",
          checkpointId: visitor.checkpointId || matchedVisitor?.currentLocation?.checkpointId || "",
        },
      });
      const resolvedCoordinates = sharedMapLocation?.coordinates ||
        (hasCoordinates
          ? {
              x: Number(coordinates.x),
              y: Number(coordinates.y),
            }
          : {
              x: 15 + ((index * 17) % 70),
              y: 15 + ((index * 23) % 70),
            });

      const normalizedVisitor = {
        id: visitor.visitorId,
        _id: visitor.visitorId,
        name: matchedVisitor?.fullName || visitor.name,
        fullName: matchedVisitor?.fullName || visitor.name,
        email: matchedVisitor?.email || visitor.email,
        phone: matchedVisitor?.phoneNumber || visitor.phone,
        phoneNumber: matchedVisitor?.phoneNumber || visitor.phone,
        purpose: matchedVisitor?.purposeOfVisit || visitor.purpose,
        purposeOfVisit: matchedVisitor?.purposeOfVisit || visitor.purpose,
        host: matchedVisitor?.host || matchedVisitor?.assignedStaffName || "",
        assignedOffice: matchedVisitor?.assignedOffice || visitor.office || "",
        expectedDestination: visitor.expectedDestination || matchedVisitor?.currentDestination?.office || matchedVisitor?.appointmentDepartment || matchedVisitor?.assignedOffice || "",
        lastTappedOffice: visitor.lastTappedOffice || visitor.office || "",
        checkInTime: matchedVisitor?.checkedInAt || visitor.checkedInAt,
        checkedInAt: matchedVisitor?.checkedInAt || visitor.checkedInAt,
        status: matchedVisitor?.status || visitor.status,
        trackingStatus: visitor.statusLabel || "Inside campus",
        lastScanTime: visitor.lastScanTime,
        idPhoto: matchedVisitor?.idImage || null,
        idImage: matchedVisitor?.idImage || null,
        sourceVisitor: matchedVisitor,
        location: {
          floor: sharedMapLocation?.floor || visitor.floor || "ground",
          office: sharedMapLocation?.office || visitor.office || getRandomOffice(),
          coordinates: resolvedCoordinates,
          timestamp: visitor.lastScanTime || new Date(),
          source: sharedMapLocation ? "shared_map_position" : visitor.source || "checkpoint",
          action: visitor.action || matchedVisitor?.currentLocation?.action || "",
          statusLabel: visitor.statusLabel || "Inside campus",
          checkpointId: visitor.checkpointId || sharedMapLocation?.officeId || "",
        },
        currentLocation: {
          ...(matchedVisitor?.currentLocation || {}),
          floor: sharedMapLocation?.floor || matchedVisitor?.currentLocation?.floor || visitor.floor || "ground",
          office: sharedMapLocation?.office || matchedVisitor?.currentLocation?.office || visitor.office || "Campus",
          coordinates: resolvedCoordinates,
          lastSeenAt: visitor.lastScanTime || matchedVisitor?.currentLocation?.lastSeenAt || null,
          source: sharedMapLocation ? "shared_map_position" : visitor.source || matchedVisitor?.currentLocation?.source || "checkpoint",
          action: visitor.action || matchedVisitor?.currentLocation?.action || "",
          statusLabel: visitor.statusLabel || matchedVisitor?.currentLocation?.statusLabel || "Inside campus",
          checkpointId: visitor.checkpointId || matchedVisitor?.currentLocation?.checkpointId || sharedMapLocation?.officeId || "",
          isActive: matchedVisitor?.currentLocation?.isActive ?? visitor.status !== "exited",
        },
        movement: visitor.movementHistory || matchedVisitor?.locationHistory || [],
        wrongLocationAlerts: visitor.wrongLocationAlerts || [],
      };
      const mapState = getVisitorMapState(normalizedVisitor);
      return {
        ...normalizedVisitor,
        mapState,
        markerColor: getVisitorMapStateMeta(normalizedVisitor).color,
      };
    });
    const visitorMap = new Map();

    normalizedVisitors.forEach((visitor) => {
      const identity = getVisitorTrackingIdentity(visitor);
      if (!identity) return;

      const existingVisitor = visitorMap.get(identity);
      if (!existingVisitor || getVisitorTrackingTimestamp(visitor) > getVisitorTrackingTimestamp(existingVisitor)) {
        visitorMap.set(identity, visitor);
      }
    });

    return Array.from(visitorMap.values());
  };

  const deriveAccessLogs = (all = []) =>
    all
      .flatMap((visitor) => {
        const officeLocation =
          visitor.assignedOffice || visitor.host || 'Main Gate';
        const entries = [];

        if (visitor.approvedAt) {
          entries.push({
            _id: `${visitor._id}-approved`,
            userName: visitor.fullName,
            location: officeLocation,
            status: 'granted',
            accessType: 'approval',
            notes: 'Visitor approved for entry',
            timestamp: visitor.approvedAt,
          });
        }

        if (visitor.checkedInAt) {
          entries.push({
            _id: `${visitor._id}-checked-in`,
            userName: visitor.fullName,
            location: officeLocation,
            status: 'granted',
            accessType: 'entry',
            notes: 'Checked in by security',
            timestamp: visitor.checkedInAt,
          });
        }

        if (visitor.checkedOutAt) {
          entries.push({
            _id: `${visitor._id}-checked-out`,
            userName: visitor.fullName,
            location: officeLocation,
            status: 'granted',
            accessType: 'exit',
            notes: 'Checked out by security',
            timestamp: visitor.checkedOutAt,
          });
        }

        return entries;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const deriveReports = (all = []) =>
    all
      .flatMap((visitor) =>
        (visitor.reports || []).map((report, index) => ({
          _id: `${visitor._id}-report-${index}`,
          reason: report.reason || 'Security incident',
          createdAt: report.reportedAt,
          visitorName: visitor.fullName,
          status: report.resolved ? 'Resolved' : 'Open',
          resolved: !!report.resolved,
        })),
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const buildOperationalDataSignature = (all = []) =>
    all
      .map((visitor) => {
        const currentLocation = visitor?.currentLocation || {};
        const coordinates = currentLocation?.coordinates || {};
        return [
          visitor?._id,
          visitor?.status,
          visitor?.approvalStatus,
          visitor?.appointmentStatus,
          visitor?.checkedInAt,
          visitor?.checkedOutAt,
          visitor?.updatedAt,
          currentLocation?.checkpointId,
          currentLocation?.office,
          currentLocation?.floor,
          currentLocation?.isActive,
          currentLocation?.lastSeenAt,
          coordinates?.x,
          coordinates?.y,
        ].map((value) => value ?? "").join(":");
      })
      .sort()
      .join("|");

  const buildNotificationDataSignature = (items = []) =>
    items
      .map((notification) =>
        [
          notification?._id,
          notification?.read,
          notification?.updatedAt,
          notification?.createdAt,
          notification?.severity,
          notification?.type,
        ].map((value) => value ?? "").join(":"),
      )
      .sort()
      .join("|");

  // ============ DATA LOADING FUNCTIONS ============
  const isAuthError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return (
      error?.status === 401 ||
      message.includes("401") ||
      message.includes("authenticate") ||
      message.includes("unauthorized")
    );
  };

  const handleAuthExpired = async () => {
    if (authRedirectHandledRef.current) return;
    authRedirectHandledRef.current = true;
    await ApiService.clearAuth();
    navigation.replace("Login");
  };

  const loadUserData = async () => {
    try {
      const [cachedUser, token] = await Promise.all([
        ApiService.getCurrentUser(),
        ApiService.getToken(),
      ]);

      if (!token) {
        await ApiService.clearAuth();
        navigation.replace("Login");
        return;
      }

      const normalizedRole = normalizeRole(cachedUser?.role);
      const normalizedUser = { ...cachedUser, role: normalizedRole };
      if (!cachedUser || !canAccessSecurityDashboard(normalizedUser)) {
        const fallbackRoute = normalizedRole === "staff" ? "StaffDashboard" : "Login";
        navigation.replace(fallbackRoute);
        return null;
      }
      setUser(normalizedUser);
      setSecurityProfileForm(buildSecurityProfileForm(normalizedUser));

      ApiService.getProfile()
        .then((profileResponse) => {
          const profileUser = profileResponse?.user || null;
          if (!profileUser) return;
          const refreshedUser = {
            ...normalizedUser,
            ...profileUser,
            role: normalizeRole(profileUser.role || normalizedRole),
          };
          if (!canAccessSecurityDashboard(refreshedUser)) {
            navigation.replace(refreshedUser.role === "staff" ? "StaffDashboard" : "Login");
            return;
          }
          setUser(refreshedUser);
          setSecurityProfileForm(buildSecurityProfileForm(refreshedUser));
        })
        .catch((profileError) => {
          if (isAuthError(profileError)) {
            handleAuthExpired();
            return;
          }
          console.log("Security profile refresh skipped:", profileError?.message || profileError);
        });

      return normalizedUser;
    } catch (error) {
      console.error("Load user error:", error);
      Alert.alert("Error", "Failed to load user data");
      return null;
    }
  };

  const loadOperationalData = async ({ force = false } = {}) => {
    try {
      const [allVisitorsRes, accessLogsRes] = await Promise.allSettled([
        ApiService.getVisitors({ limit: 100 }),
        ApiService.getAccessLogs(1, 100, { all: true }),
      ]);
      if (allVisitorsRes.status === "rejected") {
        throw allVisitorsRes.reason;
      }
      const allVisitors = allVisitorsRes.value?.visitors || [];
      const realAccessLogs =
        accessLogsRes.status === "fulfilled" && Array.isArray(accessLogsRes.value?.accessLogs)
          ? accessLogsRes.value.accessLogs
          : [];
      const nextSignature = `${buildOperationalDataSignature(allVisitors)}::${realAccessLogs
        .map((log) => [log?._id, log?.timestamp, log?.activityType, log?.status].join(":"))
        .join("|")}`;

      if (!force && operationalDataSignatureRef.current === nextSignature) {
        return false;
      }

      operationalDataSignatureRef.current = nextSignature;
      const collections = deriveVisitorCollections(allVisitors);
      const stats = deriveVisitorStats(
        collections.all,
        collections.active,
        collections.pending,
      );
      const operationalAnalytics = deriveAnalytics(collections.all);
      const derivedLogs = deriveAccessLogs(collections.all);
      const combinedLogs = [...realAccessLogs, ...derivedLogs]
        .filter((log, index, items) =>
          index === items.findIndex((item) => String(item?._id) === String(log?._id)),
        )
        .sort((left, right) => new Date(right?.timestamp || 0) - new Date(left?.timestamp || 0));
      setVisitors(collections);
      setVisitorStats(stats);
      setAnalytics(operationalAnalytics);
      setVisitorLocations(deriveVisitorLocations(collections.active));
      setAccessLogs(combinedLogs);
      setLogsTotal(combinedLogs.length);
      setRecentAccess(combinedLogs.slice(0, 10));
      setDashboardStats((current) => ({
        ...current,
        activeUsers: current.activeUsers || collections.active.length,
        totalVisitorsToday: stats.totalToday,
        recentAccess: combinedLogs.length,
        occupancyRate: 0,
      }));
      clearConnectionIssue();
      return true;
    } catch (error) {
      logSecurityDashboardLoadError("operational-data", "Load operational data error:", error);
      noteConnectionIssue(error);
      if (isAuthError(error)) {
        await handleAuthExpired();
      }
      return false;
    }
  };

  const loadLiveVisitorLocations = async () => {
    try {
      const response = await ApiService.getSecurityLiveVisitorLocations({ limit: 200 });
      setVisitorLocations(
        normalizeLiveVisitorLocations(Array.isArray(response?.visitors) ? response.visitors : []),
      );
      clearConnectionIssue();
      return true;
    } catch (error) {
      logSecurityDashboardLoadError("live-visitor-locations", "Load live visitor locations error:", error);
      noteConnectionIssue(error);
      if (isAuthError(error)) {
        await handleAuthExpired();
      }
      return false;
    }
  };

  const loadSecurityLivePresence = async () => {
    try {
      const response = await ApiService.getSecurityLivePresence({ limit: 200 });
      const presence = Array.isArray(response?.presence) ? response.presence : [];
      const summary = response?.summary || { total: presence.length, byUserType: {} };

      setActiveUsers(presence);
      setLivePresenceSummary(summary);
      setDashboardStats((current) => ({
        ...current,
        activeUsers: summary.total || presence.length,
      }));
      clearConnectionIssue();
      return true;
    } catch (error) {
      logSecurityDashboardLoadError("live-presence", "Load security live presence error:", error);
      noteConnectionIssue(error);
      if (isAuthError(error)) {
        await handleAuthExpired();
      }
      return false;
    }
  };

  const loadSecurityAttendanceRecords = async () => {
    setAttendanceLoading(true);
    try {
      const query = {
        ...getSecurityAttendanceDateRange(attendanceDateFilter),
        page: attendancePage,
        limit: attendancePagination.limit,
      };
      if (attendanceScope === "security") {
        query.module = "security_monitoring";
      } else if (attendanceScope !== "all") {
        query.userType = attendanceScope;
      }
      if (attendanceStatusFilter !== "all") query.status = attendanceStatusFilter;
      if (attendanceSearch.trim()) query.search = attendanceSearch.trim();

      const response = await ApiService.getAttendance(query);
      setAttendanceRecords(Array.isArray(response?.attendance) ? response.attendance : []);
      setAttendancePagination((current) => ({
        page: response?.pagination?.page || attendancePage,
        limit: response?.pagination?.limit || current.limit,
        total: response?.pagination?.total || 0,
        pages: Math.max(1, response?.pagination?.pages || 1),
      }));
      clearConnectionIssue();
      return true;
    } catch (error) {
      logSecurityDashboardLoadError("attendance-records", "Load security attendance records error:", error);
      noteConnectionIssue(error);
      if (isAuthError(error)) {
        await handleAuthExpired();
      }
      return false;
    } finally {
      setAttendanceLoading(false);
    }
  };

  const loadMapSettings = async () => {
    try {
      const response = await ApiService.getMapSettings();
      if (response?.success) {
        const nextMapSettings = normalizeMapSettingsPayload(response.mapSettings);
        setMapRooms(nextMapSettings.rooms);
        setMapRoomPositions(nextMapSettings.roomPositions);
      }
      return true;
    } catch (error) {
      console.log("Security map settings load skipped:", error?.message || error);
      return false;
    }
  };

  const loadDashboardData = loadOperationalData;
  const loadVisitors = loadOperationalData;

  const loadAccessLogs = async () => {
    await loadOperationalData({ force: true });
  };

  const loadReports = async () => {
    try {
      const response = await ApiService.getSecurityReports();
      setReports(Array.isArray(response?.reports) ? response.reports : []);
      return true;
    } catch (error) {
      logSecurityDashboardLoadError("security-reports", "Load security reports error:", error);
      noteConnectionIssue(error);
      if (isAuthError(error)) {
        await handleAuthExpired();
      }
      return false;
    }
  };

  const loadNotifications = async (currentUser = user, { force = false } = {}) => {
    try {
      const response = await ApiService.getNotifications({ limit: 100 });
      const normalizedNotifications = normalizeNotifications(
        Array.isArray(response?.notifications) ? response.notifications : [],
        currentUser?._id,
      )
        .filter((notification) => notification?._id)
        .filter(
          (notification, index, items) =>
            index === items.findIndex((item) => String(item?._id) === String(notification?._id)),
        )
        .sort(
          (left, right) =>
            new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime(),
        );
      const unreadNotifications = normalizedNotifications.filter((notification) => !notification.read);
      const alertNotifications = getSpecificSecurityAlerts(unreadNotifications);
      const nextSignature = buildNotificationDataSignature(normalizedNotifications);

      if (!force && notificationDataSignatureRef.current === nextSignature) {
        return false;
      }

      notificationDataSignatureRef.current = nextSignature;
      const normalizedUnreadCount = Number.isFinite(Number(response?.unreadCount))
        ? Number(response.unreadCount)
        : unreadNotifications.length;

      setNotifications(normalizedNotifications);
      setUnreadCount(normalizedUnreadCount);
      setAlerts(alertNotifications);
      setDashboardStats((current) => ({
        ...current,
        activeAlerts: alertNotifications.length,
      }));
      clearConnectionIssue();
      return true;
    } catch (error) {
      logSecurityDashboardLoadError("notifications", "Load notifications error:", error);
      noteConnectionIssue(error);
      if (isAuthError(error)) {
        await handleAuthExpired();
      }
      return false;
    }
  };

  const loadAnalytics = async () => {
    await loadOperationalData({ force: true });
  };

  const loadVisitorLocations = async () => {
    await Promise.all([
      loadOperationalData({ force: true }),
      loadLiveVisitorLocations(),
      loadSecurityLivePresence(),
      loadSecurityAttendanceRecords(),
    ]);
  };

  const getRandomFloor = () => {
    const floorsList = ['ground', 'first', 'second', 'third'];
    return floorsList[Math.floor(Math.random() * floorsList.length)];
  };

  const guardModules = [
    {
      key: 'home',
      label: 'Home',
      icon: 'home-outline',
      color: '#0A3D91',
      submodules: [{ key: 'home-main', label: 'Home', badge: 0 }],
    },
    {
      key: 'maps',
      label: 'Maps',
      icon: 'map-outline',
      color: '#0A3D91',
      submodules: [
        { key: 'map-ground', label: 'Ground Floor', badge: 0 },
        { key: 'map-mezzanine', label: 'Mezzanine', badge: 0 },
        { key: 'map-second', label: 'Second Floor', badge: 0 },
        { key: 'map-third', label: 'Third Floor', badge: 0 },
      ],
    },
    {
      key: 'appointment',
      label: 'Appointment',
      icon: 'calendar-outline',
      color: '#0A3D91',
      submodules: [
        { key: 'appointment-records', label: 'Appointment Records', badge: visitors.all.length || 0 },
      ],
    },
    {
      key: 'campus-activity',
      label: 'Visitor Monitoring',
      icon: 'walk-outline',
      color: '#0A3D91',
      submodules: [
        { key: 'checked-in-visitors', label: 'Visitor Arrival / Departure', badge: visitors.active.length || 0 },
      ],
    },
    {
      key: 'attendance',
      label: 'Attendance',
      icon: 'clipboard-outline',
      color: '#0A3D91',
      submodules: [
        { key: 'attendance-monitoring', label: 'Attendance Monitoring', badge: livePresenceSummary?.total || 0 },
      ],
    },
    {
      key: 'nfc-scan',
      label: 'NFC Scan',
      icon: 'scan-outline',
      color: '#0A3D91',
      submodules: [
        { key: 'nfc-assign', label: 'Assign / Unassign', badge: 0 },
      ],
    },
    {
      key: 'reports',
      label: 'Reports',
      icon: 'document-text-outline',
      color: '#1C6DD0',
      submodules: [
        { key: 'report-file', label: 'File a Report', badge: reports.length || 0 },
      ],
    },
  ];

  const floorSubmoduleToFloor = {
    'map-ground': 'ground',
    'map-mezzanine': 'mezzanine',
    'map-second': 'second',
    'map-third': 'third',
  };

  const getGuardParentModule = (submoduleKey) =>
    guardModules.find((module) => module.submodules.some((submodule) => submodule.key === submoduleKey))?.key || 'home';

  const getContentKeyForSubmodule = (submoduleKey) => {
    if (submoduleKey === 'home-main') return 'dashboard';
    if (submoduleKey.startsWith('map-')) return 'map';
    if (submoduleKey === 'appointment-records') return 'visitors';
    if (submoduleKey === 'checked-in-visitors') return 'presence';
    if (submoduleKey === 'attendance-monitoring') return 'attendance';
    if (submoduleKey === 'nfc-assign') return 'nfc';
    if (submoduleKey === 'report-file') return 'reports';
    return 'dashboard';
  };

  const getSelectedSubmoduleMeta = () => {
    switch (selectedSubmodule) {
      case 'map-ground':
        return { title: 'Ground Floor Map', subtitle: 'View-only monitoring of the ground floor layout and active visitor positions.' };
      case 'map-mezzanine':
        return { title: 'Mezzanine Map', subtitle: 'View-only monitoring of the mezzanine layout and active visitor positions.' };
      case 'map-second':
        return { title: 'Second Floor Map', subtitle: 'View-only monitoring of the second floor layout and active visitor positions.' };
      case 'map-third':
        return { title: 'Third Floor Map', subtitle: 'View-only monitoring of the third floor layout and active visitor positions.' };
      case 'appointment-records':
        return { title: 'Appointment Records', subtitle: 'Review appointment records in a read-only security view.' };
      case 'checked-in-visitors':
        return {
          title: 'Visitor Arrival / Departure',
          subtitle: 'Monitor visitor arrivals, assigned destinations, and completed departures.',
        };
      case 'attendance-monitoring':
        return {
          title: 'Attendance Monitoring',
          subtitle: 'Monitor student, academic staff, staff, security, and visitor NFC attendance records.',
        };
      case 'report-file':
        return { title: 'File a Report', subtitle: 'Submit a security report and review recently filed incidents.' };
      case 'nfc-assign':
        return {
          title: 'NFC Scan',
          subtitle: 'Assign and unassign visitor RFID cards from the security USB reader.',
        };
      case 'home-main':
      default:
        return { title: 'Security Home', subtitle: 'Live guard operations, visitor status, and priority actions.' };
    }
  };

  const selectGuardSubmodule = (submoduleKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const parentModule = getGuardParentModule(submoduleKey);
    setExpandedModule(parentModule);
    setSelectedSubmodule(submoduleKey);
    setActiveTab(getContentKeyForSubmodule(submoduleKey));

    if (floorSubmoduleToFloor[submoduleKey]) {
      setSelectedFloor(floorSubmoduleToFloor[submoduleKey]);
      setSelectedOffice('all');
    }

    if (submoduleKey === 'appointment-records') {
      setVisitorFilter('all');
    }

    if (submoduleKey === 'attendance-monitoring') {
      loadSecurityAttendanceRecords();
    }
  };

  const toggleGuardModule = (moduleKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedModule((currentValue) => (currentValue === moduleKey ? null : moduleKey));
  };

  const normalizeFloorId = (floorId) => {
    if (floorId === 'mezzanine') {
      return 'first';
    }
    return floorId;
  };
  
  const getRandomOffice = () => {
    const officeNames = offices.filter(o => o.id !== 'all').map(o => o.name);
    return officeNames[Math.floor(Math.random() * officeNames.length)];
  };

  const getFilteredVisitorLocations = () => {
    return visitorLocations.filter(visitor => {
      if (
        normalizeFloorId(visitor.location.floor) !== normalizeFloorId(selectedFloor)
      ) {
        return false;
      }
      if (mapStatusFilter === "attention") return isMapAttentionVisitor(visitor);
      if (mapStatusFilter === "inside_office") return getVisitorMapState(visitor) === "inside_office";
      if (mapStatusFilter === "in_lobby") return getVisitorMapState(visitor) === "in_lobby";
      if (mapStatusFilter === "left_office") return getVisitorMapState(visitor) === "left_office";
      if (mapStatusFilter === "wrong_office") return hasActiveWrongLocationAlert(visitor);
      return true;
    });
  };

  const handleVisitorHover = (visitor) => {
    setHoveredVisitor(visitor);
  };
  
  const handleVisitorLeave = () => {
    setHoveredVisitor(null);
  };
  
  const handleVisitorSelect = (visitor) => {
    setSelectedVisitor(visitor?.sourceVisitor || visitor);
    setShowDetailModal(true);
  };

  // ============ HELPER FUNCTIONS ============
  const refreshData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadOperationalData({ force: true }),
        loadReports(),
        loadSecurityLivePresence(),
        loadNotifications(user, { force: true }),
      ]);
      lastOperationalRefreshAtRef.current = Date.now();
    } finally {
      setRefreshing(false);
    }
  };

  const applyVisitorNfcCardUpdate = (visitorEmail, cardId = "", visitorDetails = null) => {
    const normalizedEmail = String(visitorEmail || "").trim().toLowerCase();
    if (!normalizedEmail) return;
    const { safePassId: _ignoredSafePassId, ...safeVisitorDetails } = visitorDetails || {};
    const sourceVisitor = selectedVisitorForNfc?.email?.toLowerCase?.() === normalizedEmail ? selectedVisitorForNfc : {};
    const localVisitor = {
      ...sourceVisitor,
      ...safeVisitorDetails,
      email: safeVisitorDetails.email || sourceVisitor.email || visitorEmail,
      nfcCardId: cardId,
      physicalNfcUid: cardId,
    };
    const localIdentity = getVisitorNfcIdentity(localVisitor) || normalizedEmail;

    const updateCollection = (collection = []) =>
      collection.map((visitor) =>
        String(visitor?.email || "").trim().toLowerCase() === normalizedEmail
          ? {
              ...visitor,
              ...safeVisitorDetails,
              nfcCardId: cardId,
              physicalNfcUid: cardId,
            }
          : visitor,
      );

    setVisitorNfcLocalVisitors((current) => ({
      ...current,
      [localIdentity]: localVisitor,
    }));
    setVisitorNfcPinnedVisitor(localVisitor);
    setVisitors((current) => ({
      ...current,
      active: updateCollection(current.active),
      pending: updateCollection(current.pending),
      approved: updateCollection(current.approved),
      notReady: updateCollection(current.notReady),
      completed: updateCollection(current.completed),
      all: updateCollection(current.all),
    }));
  };

  const handleAssignVisitorNfc = async (scannedValue = visitorNfcUid) => {
    if (!selectedVisitorForNfc?.email) {
      setVisitorNfcStatus({ type: "error", message: "Choose a visitor before assigning a card UID." });
      Alert.alert("Select Visitor", "Choose a visitor before assigning a card UID.");
      return;
    }

    const normalizedCardId = getCleanVisitorNfcUid(scannedValue);
    const currentCard = getVisitorAssignedNfcUid(selectedVisitorForNfc);
    setVisitorNfcPinnedVisitor(selectedVisitorForNfc);
    if (!normalizedCardId) {
      if (currentCard) {
        setVisitorNfcStatus({
          type: "success",
          message: `${selectedVisitorForNfc.fullName || "Visitor"} already has UID ${currentCard}. Tap a different card to replace it.`,
        });
        setTimeout(() => visitorNfcInputRef.current?.focus?.(), 100);
        return;
      }
      setVisitorNfcStatus({ type: "error", message: "Tap a card on the USB reader or enter the UID first." });
      Alert.alert("Card UID Required", "Tap a card on the USB reader or enter the UID first.");
      return;
    }

    if (currentCard && normalizedCardId === currentCard) {
      setVisitorNfcUid("");
      setVisitorNfcStatus({
        type: "success",
        message: `${selectedVisitorForNfc.fullName || "Visitor"} is already assigned to UID ${currentCard}.`,
      });
      setTimeout(() => visitorNfcInputRef.current?.focus?.(), 100);
      return;
    }

    try {
      setVisitorNfcBusy(true);
      setVisitorNfcStatus({
        type: "info",
        message: currentCard
          ? `Replacing ${currentCard} with ${normalizedCardId} for ${selectedVisitorForNfc.fullName || selectedVisitorForNfc.email}...`
          : `Assigning ${normalizedCardId} to ${selectedVisitorForNfc.fullName || selectedVisitorForNfc.email}...`,
      });
      const response = await ApiService.assignNfcCard({
        userId:
          selectedVisitorForNfc.userId ||
          selectedVisitorForNfc.relatedUser?._id ||
          selectedVisitorForNfc.accountId ||
          undefined,
        email: selectedVisitorForNfc.email,
        cardId: normalizedCardId,
        force: true,
      });
      const assignedCardId = response?.card?.cardNumber || normalizedCardId;
      setVisitorNfcUid("");
      setSelectedVisitorNfcId(getVisitorNfcIdentity(response?.visitor || selectedVisitorForNfc));
      applyVisitorNfcCardUpdate(selectedVisitorForNfc.email, assignedCardId, response?.visitor);
      await refreshData();
      applyVisitorNfcCardUpdate(selectedVisitorForNfc.email, assignedCardId, response?.visitor);
      setTimeout(() => visitorNfcInputRef.current?.focus?.(), 100);
      setVisitorNfcStatus({
        type: "success",
        message: currentCard
          ? `UID replaced successfully. Current UID: ${assignedCardId}.`
          : `NFC card assigned successfully. Current UID: ${assignedCardId}.`,
      });
    } catch (error) {
      const friendlyMessage = getFriendlyNfcErrorMessage(error, currentCard ? "replace this UID" : "assign this UID");
      setVisitorNfcStatus({ type: "error", message: friendlyMessage });
      Alert.alert(currentCard ? "Replace UID Failed" : "Assign UID Failed", friendlyMessage);
    } finally {
      setVisitorNfcBusy(false);
    }
  };

  const handleUnassignVisitorNfc = async () => {
    if (!selectedVisitorForNfc?.email) {
      setVisitorNfcStatus({ type: "error", message: "Choose a visitor before unassigning a card UID." });
      Alert.alert("Select Visitor", "Choose a visitor before unassigning a card UID.");
      return;
    }

    const currentCard = getVisitorAssignedNfcUid(selectedVisitorForNfc);
    const cardToRemove = currentCard;
    setVisitorNfcPinnedVisitor(selectedVisitorForNfc);
    if (!cardToRemove) {
      setVisitorNfcStatus({ type: "error", message: "Choose a visitor with an assigned UID before removing it." });
      Alert.alert("No UID Assigned", "Choose a visitor with an assigned UID before removing it.");
      return;
    }

    try {
      setVisitorNfcBusy(true);
      setVisitorNfcStatus({
        type: "info",
        message: `Unassigning ${cardToRemove} from ${selectedVisitorForNfc.fullName || selectedVisitorForNfc.email}...`,
      });
      const response = await ApiService.revokeNfcCard({
        userId:
          selectedVisitorForNfc.userId ||
            selectedVisitorForNfc.relatedUser?._id ||
            selectedVisitorForNfc.accountId ||
            undefined,
        email: selectedVisitorForNfc.email,
        cardId: cardToRemove,
      });
      setSelectedVisitorNfcId(getVisitorNfcIdentity(response?.visitor || selectedVisitorForNfc));
      const updatedVisitorEmail = response?.visitor?.email || selectedVisitorForNfc.email;
      applyVisitorNfcCardUpdate(updatedVisitorEmail, "", response?.visitor);
      await refreshData();
      applyVisitorNfcCardUpdate(updatedVisitorEmail, "", response?.visitor);
      setVisitorNfcUid("");
      setTimeout(() => visitorNfcInputRef.current?.focus?.(), 100);
      setVisitorNfcStatus({
        type: "success",
        message: response?.message || `UID ${cardToRemove} was unassigned successfully.`,
      });
    } catch (error) {
      const friendlyMessage = getFriendlyNfcErrorMessage(error, "remove this UID");
      setVisitorNfcStatus({ type: "error", message: friendlyMessage });
      Alert.alert("Remove UID Failed", friendlyMessage);
    } finally {
      setVisitorNfcBusy(false);
    }
  };

  async function smartRefreshSecurityData() {
    const now = Date.now();
    if (now - smartRefreshAtRef.current < SMART_REFRESH_MIN_INTERVAL_MS) return;
    smartRefreshAtRef.current = now;

    await Promise.allSettled([
      refreshSecurityLiveData(),
      loadNotifications(user),
      loadMapSettings(),
    ]);
  }

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        smartRefreshSecurityData();
      }
    });

    const unsubscribeNavigationFocus = navigation?.addListener?.("focus", smartRefreshSecurityData);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("focus", smartRefreshSecurityData);
      return () => {
        appStateSubscription?.remove?.();
        unsubscribeNavigationFocus?.();
        window.removeEventListener("focus", smartRefreshSecurityData);
      };
    }

    return () => {
      appStateSubscription?.remove?.();
      unsubscribeNavigationFocus?.();
    };
  }, [navigation, user]);

  const refreshSecurityLiveData = async () => {
    if (securityLiveRefreshRef.current) return;
    securityLiveRefreshRef.current = true;
    try {
      const shouldRefreshOperationalData =
        Date.now() - lastOperationalRefreshAtRef.current >= SECURITY_OPERATIONAL_REFRESH_INTERVAL_MS;
      const refreshTasks = [
        loadLiveVisitorLocations(),
        loadSecurityLivePresence(),
      ];

      if (shouldRefreshOperationalData) {
        lastOperationalRefreshAtRef.current = Date.now();
        refreshTasks.push(loadOperationalData());
        refreshTasks.push(loadMapSettings());
      }

      await Promise.all(refreshTasks);
    } finally {
      securityLiveRefreshRef.current = false;
    }
  };

  const refreshLiveMapData = async () => {
    if (liveMapRefreshRef.current) return;
    liveMapRefreshRef.current = true;
    try {
      const [loaded] = await Promise.all([
        loadLiveVisitorLocations(),
        loadMapSettings(),
      ]);
      if (!loaded) {
        await loadOperationalData();
      }
    } finally {
      liveMapRefreshRef.current = false;
    }
  };

  useEffect(() => {
    const isMapVisible = activeTab === 'map' || showMapModal;
    if (!isMapVisible) return undefined;

    refreshLiveMapData();
    return undefined;
  }, [activeTab, showMapModal]);

  useEffect(() => {
    if (!selectedVisitor?._id) return;

    const updatedVisitor = visitors.all.find(
      (visitor) => String(visitor?._id) === String(selectedVisitor._id),
    );

    if (updatedVisitor && updatedVisitor !== selectedVisitor) {
      setSelectedVisitor(updatedVisitor);
    }
  }, [visitors.all, selectedVisitor?._id]);

  const formatDate = (date) => {
    return formatSafePassDate(date);
  };

  const formatTime = (date) => {
    return formatSafePassTime(date);
  };

  const formatDateTime = (date) => {
    return formatSafePassDateTime(date, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasApprovedVisitWindow = (visitor) => {
    if (!visitor) return false;
    const appointmentStatus = String(visitor.appointmentStatus || "").toLowerCase();
    const approvalStatus = String(visitor.approvalStatus || "").toLowerCase();

    if (visitor.requestCategory === "appointment") {
      return approvalStatus === "approved" && ["approved", "adjusted"].includes(appointmentStatus);
    }

    return approvalStatus === "approved";
  };

  const getVisitorScheduleDates = (visitor) =>
    [visitor?.visitDate, visitor?.visitTime]
      .map((value) => {
        const date = new Date(value || "");
        return Number.isNaN(date.getTime()) ? null : date;
      })
      .filter(Boolean);

  const getVisitDayRelation = (visitor) => {
    const scheduleDates = getVisitorScheduleDates(visitor);
    if (!scheduleDates.length) return "unknown";
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    if (scheduleDates.some((date) => date >= todayStart && date < todayEnd)) {
      return "today";
    }
    if (scheduleDates.some((date) => date >= todayEnd)) {
      return "future";
    }
    return "past";
  };

  const isVisitorScheduledTodayForNfc = (visitor) => {
    if (!visitor) return false;
    const relation = getVisitDayRelation(visitor);
    if (relation !== "today") return false;

    const visitStatus = String(visitor?.status || "").toLowerCase();
    const appointmentStatus = String(visitor?.appointmentStatus || "").toLowerCase();
    const approvalStatus = String(visitor?.approvalStatus || "").toLowerCase();
    const blockedStatuses = ["cancelled", "rejected", "expired", "no_show", "checked_out", "completed"];

    if (blockedStatuses.includes(visitStatus) || blockedStatuses.includes(appointmentStatus)) return false;
    if (approvalStatus === "rejected") return false;

    return true;
  };

  const getVisitorNfcDestination = (visitor) =>
    visitor?.assignedOffice ||
    visitor?.appointmentDepartment ||
    visitor?.currentDestination?.office ||
    visitor?.host ||
    "No assigned office";

  const getVisitorNfcScheduleLabel = (visitor) => {
    const scheduleDate = formatDate(visitor?.visitDate || visitor?.visitTime);
    const scheduleTime = formatTime(visitor?.visitTime || visitor?.visitDate);
    if (scheduleDate === "N/A" && scheduleTime === "N/A") return "Schedule pending";
    return `${scheduleDate} at ${scheduleTime}`;
  };

  const getVisitorNfcStatusLabel = (visitor) =>
    titleCase(visitor?.appointmentStatus || visitor?.status || visitor?.approvalStatus || "Scheduled");

  const getVisitorNfcLocationLabel = (visitor) =>
    visitor?.currentLocation?.office ||
    visitor?.currentLocation?.checkpointId ||
    visitor?.currentLocation?.statusLabel ||
    (visitor?.status === "checked_in" ? "Inside campus" : "Not checked in");

  const getVisitorNfcIdentity = (visitor) =>
    String(visitor?.email || "").trim().toLowerCase() ||
    String(visitor?.userId || visitor?.relatedUser?._id || visitor?.accountId || visitor?._id || "").trim();

  const isVisitorPhysicalNfcUid = (value) => {
    const normalizedValue = normalizeRfidReaderInput(value);
    if (!normalizedValue) return false;
    if (/^\d{4}-\d{5,}$/i.test(normalizedValue)) return false;
    if (/^SAFEPASS-/i.test(normalizedValue)) return false;
    return true;
  };

  const collapseRepeatedVisitorNfcUid = (value = "") => {
    const normalizedValue = normalizeRfidReaderInput(value);

    if (
      normalizedValue.length >= 8 &&
      normalizedValue.length % 2 === 0 &&
      normalizedValue.slice(0, normalizedValue.length / 2) === normalizedValue.slice(normalizedValue.length / 2)
    ) {
      return normalizedValue.slice(0, normalizedValue.length / 2);
    }

    return normalizedValue;
  };

  const normalizeVisitorNfcUidInput = (value = "") => {
    const normalizedValue = collapseRepeatedVisitorNfcUid(value);
    const now = Date.now();
    const previousValue = visitorNfcUid;
    const timeSinceLastInput = now - visitorNfcLastInputAtRef.current;
    visitorNfcLastInputAtRef.current = now;

    const isFreshScannerBurst = timeSinceLastInput > 250;
    if (
      previousValue &&
      normalizedValue.length > previousValue.length &&
      normalizedValue.startsWith(previousValue) &&
      isFreshScannerBurst
    ) {
      return normalizedValue.slice(previousValue.length);
    }

    return normalizedValue;
  };

  const getCleanVisitorNfcUid = (value = "") => collapseRepeatedVisitorNfcUid(value);

  const getVisitorAssignedNfcUid = (visitor) =>
    [
      visitor?.physicalNfcUid,
      visitor?.relatedUser?.physicalNfcUid,
      visitor?.account?.physicalNfcUid,
      visitor?.nfcCardId,
      visitor?.relatedUser?.nfcCardId,
      visitor?.account?.nfcCardId,
    ]
      .map((value) => getCleanVisitorNfcUid(value))
      .find((value) => isVisitorPhysicalNfcUid(value)) || "";

  const getVisitorNfcDetailRows = (visitor) => [
    ["Schedule", getVisitorNfcScheduleLabel(visitor)],
    ["Office", getVisitorNfcDestination(visitor)],
    ["Host/Staff", visitor?.assignedStaffName || visitor?.host || "Not assigned"],
    ["Phone", visitor?.phoneNumber || "No phone"],
    ["Status", getVisitorNfcStatusLabel(visitor)],
    ["Location", getVisitorNfcLocationLabel(visitor)],
  ];

  const isCheckInAllowedNow = (visitor) => {
    if (!hasApprovedVisitWindow(visitor)) return false;
    const visitStatus = String(visitor?.status || "").toLowerCase();
    if (["checked_in", "checked_out", "expired", "cancelled", "rejected", "no_show"].includes(visitStatus)) {
      return false;
    }
    if (visitor?.visitExpiredAt || visitor?.noShowMarkedAt) return false;

    const relation = getVisitDayRelation(visitor);
    return relation === "today" || relation === "unknown";
  };

  const getCheckInBlockedLabel = (visitor) => {
    const relation = getVisitDayRelation(visitor);
    if (String(visitor?.status || "").toLowerCase() === "expired" || visitor?.visitExpiredAt || relation === "past") {
      return "Expired - new appointment needed";
    }
    if (relation === "future") {
      return "Scheduled for later";
    }
    return "Not ready for check-in";
  };

  const getStatusBadge = (visitor) => {
    const visitStatus = String(visitor?.status || "").toLowerCase();
    const appointmentStatus = String(visitor?.appointmentStatus || "").toLowerCase();
    const approvalStatus = String(visitor?.approvalStatus || "").toLowerCase();

    if (visitStatus === 'no_show') {
      return { bg: '#FFEDD5', text: '#C2410C', label: 'NO-SHOW' };
    } else if (visitStatus === 'expired') {
      return { bg: '#E5E7EB', text: '#4B5563', label: 'EXPIRED' };
    } else if (appointmentStatus === 'cancelled' || visitStatus === 'cancelled') {
      return { bg: '#FEE2E2', text: '#B91C1C', label: 'CANCELLED' };
    } else if (appointmentStatus === 'rescheduled') {
      return { bg: '#E0F2FE', text: '#0369A1', label: 'RESCHEDULED' };
    } else if (visitStatus === 'checked_in') {
      return { bg: '#EEF5FF', text: '#0A3D91', label: 'CHECKED IN' };
    } else if (visitStatus === 'checked_out') {
      return { bg: '#F3F4F6', text: '#6B7280', label: 'CHECKED OUT' };
    } else if (appointmentStatus === 'rejected' || approvalStatus === 'rejected') {
      return { bg: '#FEE2E2', text: '#DC2626', label: 'REJECTED' };
    } else if (
      appointmentStatus === 'pending' ||
      (!appointmentStatus && approvalStatus === 'pending')
    ) {
      return { bg: '#FEF3C7', text: '#D97706', label: 'PENDING' };
    } else if (hasApprovedVisitWindow(visitor) && getVisitDayRelation(visitor) === "past") {
      return { bg: '#E5E7EB', text: '#4B5563', label: 'EXPIRED' };
    } else if (hasApprovedVisitWindow(visitor)) {
      return { bg: '#EEF5FF', text: '#1C6DD0', label: 'APPROVED' };
    }
    return { bg: '#F3F4F6', text: '#6B7280', label: 'UNKNOWN' };
  };

  const isVisitorProcessing = (visitorId) => processingVisitorId === visitorId;

  // ============ VISITOR MANAGEMENT ============
  const handleRegisterVisitor = () => {
    setNewVisitor({
      fullName: "",
      phoneNumber: "",
      email: "",
      idNumber: "",
      purposeOfVisit: "",
      host: "",
      assignedOffice: "",
      visitDate: new Date(),
      visitTime: new Date(),
      vehicleNumber: "",
      idPhotoUri: null,
      idPhotoBase64: null,
    });
    setShowVisitorModal(true);
  };

  const pickIdImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled) {
        setNewVisitor({
          ...newVisitor,
          idPhotoUri: result.assets[0].uri,
          idPhotoBase64: result.assets[0].base64,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const takeIdPhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled) {
        setNewVisitor({
          ...newVisitor,
          idPhotoUri: result.assets[0].uri,
          idPhotoBase64: result.assets[0].base64,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const submitVisitor = async () => {
    const normalizedFullName = String(newVisitor.fullName || "").trim();
    const normalizedPhone = String(newVisitor.phoneNumber || "").trim();
    const normalizedEmail = String(newVisitor.email || "").trim().toLowerCase();
    const normalizedIdNumber = String(newVisitor.idNumber || "").trim();
    const normalizedPurpose = String(newVisitor.purposeOfVisit || "").trim();
    const normalizedHost = String(newVisitor.host || "").trim();
    const normalizedOffice = String(newVisitor.assignedOffice || "").trim();

    if (
      !normalizedFullName ||
      !normalizedPurpose ||
      !normalizedHost ||
      !normalizedPhone ||
      !normalizedEmail ||
      !normalizedIdNumber
    ) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid visitor email address.");
      return;
    }

    if (!isValidPhilippineMobileNumber(normalizedPhone)) {
      Alert.alert("Invalid Contact Number", PHILIPPINE_MOBILE_NUMBER_MESSAGE);
      return;
    }

    if (!newVisitor.idPhotoUri) {
      Alert.alert("Error", "Please upload a photo of the visitor's ID");
      return;
    }

    const visitDate = new Date(newVisitor.visitDate);
    const visitTime = new Date(newVisitor.visitTime);
    const visitSchedule = new Date(visitDate);
    visitSchedule.setHours(visitTime.getHours(), visitTime.getMinutes(), 0, 0);

    if (Number.isNaN(visitSchedule.getTime())) {
      Alert.alert("Invalid Schedule", "Please choose a valid visit date and time.");
      return;
    }

    if (visitSchedule < new Date(Date.now() - 60 * 1000)) {
      Alert.alert("Invalid Schedule", "Visit schedule cannot be in the past.");
      return;
    }

    setIsSubmitting(true);

    try {
      const visitorData = {
        fullName: normalizedFullName,
        phoneNumber: normalizePhilippineMobileNumber(normalizedPhone),
        email: normalizedEmail,
        idNumber: normalizedIdNumber,
        purposeOfVisit: normalizedPurpose,
        host: normalizedHost,
        assignedOffice: normalizedOffice,
        visitDate,
        visitTime: visitSchedule,
        vehicleNumber: String(newVisitor.vehicleNumber || "").trim(),
        idImage: newVisitor.idPhotoBase64 ? `data:image/jpeg;base64,${newVisitor.idPhotoBase64}` : null,
        registeredBy: user._id,
        registeredByName: `${user.firstName} ${user.lastName}`,
      };

      const response = await ApiService.registerVisitorWithNotification(visitorData);
      
      if (response.success) {
        setShowVisitorModal(false);
        await refreshData();
        Alert.alert("Success", "Visitor registered successfully");
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to register visitor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckIn = async (visitor) => {
    if (isVisitorProcessing(visitor._id)) {
      return;
    }

    if (!hasApprovedVisitWindow(visitor)) {
      Alert.alert("Approval Required", `${visitor.fullName} does not have an approved visit window yet.`);
      return;
    }

    if (visitor.status === 'checked_in') {
      Alert.alert("Already Checked In", `${visitor.fullName} is already checked in.`);
      return;
    }

    if (visitor.status === 'checked_out') {
      Alert.alert("Visit Completed", `${visitor.fullName} has already checked out.`);
      return;
    }

    if (!isCheckInAllowedNow(visitor)) {
      Alert.alert("Cannot Mark Arrived", getCheckInBlockedLabel(visitor));
      return;
    }

    try {
      setProcessingVisitorId(visitor._id);
      const response = await ApiService.securityCheckIn(visitor._id);
      if (response.success) {
        await refreshData();
        Alert.alert("Success", `${visitor.fullName} checked in successfully`);
      }
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to check in visitor");
    } finally {
      setProcessingVisitorId(null);
    }
  };

  const handleCheckOut = async (visitor) => {
    if (isVisitorProcessing(visitor._id)) {
      return;
    }

    if (visitor.status !== 'checked_in') {
      Alert.alert("Check-in Required", `${visitor.fullName} must be checked in before checkout.`);
      return;
    }

    const performCheckOut = async () => {
      try {
        setProcessingVisitorId(visitor._id);
        const response = await ApiService.securityCheckOut(visitor._id);
        if (response.success) {
          await refreshData();
          Alert.alert("Success", `${visitor.fullName} checked out successfully`);
        }
      } catch (error) {
        Alert.alert("Error", error.message || "Failed to check out visitor");
      } finally {
        setProcessingVisitorId(null);
      }
    };

    if (Platform.OS === "web") {
      await performCheckOut();
      return;
    }

    Alert.alert(
      "Confirm Release",
      `Release ${visitor.fullName} from campus?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Release",
          onPress: performCheckOut
        }
      ]
    );
  };

  const handleReportVisitor = (visitor) => {
    Alert.alert(
      "Report Visitor",
      "Select reason for reporting:",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Suspicious Behavior", onPress: () => submitReport(visitor, "suspicious") },
        { text: "Overstayed", onPress: () => submitReport(visitor, "overstayed") },
        { text: "Violation", onPress: () => submitReport(visitor, "violation") },
        { text: "Other", onPress: () => submitReport(visitor, "other") },
      ]
    );
  };

  const submitReport = async (visitor, reason) => {
    try {
      await ApiService.reportVisitor(visitor._id, { reason, reportedBy: user._id });
      await refreshData();
      Alert.alert("Report Submitted", "The report has been sent to admin for review.");
    } catch (error) {
      Alert.alert("Error", "Failed to submit report");
    }
  };

  const submitSecurityReportForm = async () => {
    if (!reportForm.visitorId) {
      Alert.alert("Visitor Required", "Please choose a checked-in visitor for this report.");
      return;
    }

    if (!reportForm.details.trim()) {
      Alert.alert("Report Details Required", "Please add a short report description before submitting.");
      return;
    }

    const visitor = visitors.active.find((entry) => String(entry._id) === String(reportForm.visitorId));
    if (!visitor?._id) {
      Alert.alert("Visitor Not Inside", "Only visitors who are currently checked in can be reported.");
      return;
    }

    try {
      setIsSubmitting(true);
      const reason = `${reportForm.category}: ${reportForm.details.trim()}`;
      await ApiService.reportVisitor(visitor._id, { reason, reportedBy: user._id });
      await refreshData();
      setReportForm({
        visitorId: '',
        category: 'suspicious',
        details: '',
      });
      Alert.alert("Report Submitted", "The security report has been sent to admin for review.");
    } catch (error) {
      Alert.alert("Error", error?.message || "Failed to submit security report");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDetails = (visitor) => {
    setSelectedVisitor(visitor);
    setShowDetailModal(true);
  };

  // ============ NOTIFICATION FUNCTIONS ============
  const markAsRead = async (notification) => {
    try {
      await ApiService.markNotificationAsRead(notification._id);
      await loadNotifications();
    } catch (error) {
      console.error("Mark as read error:", error);
    }
  };

  const handleResolveAlert = async (alert) => {
    if (!alert?._id || resolvingAlertId === alert._id) {
      return;
    }

    try {
      setResolvingAlertId(alert._id);
      const result = await ApiService.resolveAlert(alert._id);
      if (!result?.success) {
        throw new Error("Failed to resolve alert");
      }

      setNotifications((current) =>
        current.map((item) =>
          item._id === alert._id ? { ...item, read: true } : item
        )
      );
      setAlerts((current) => current.filter((item) => item._id !== alert._id));
      setUnreadCount((current) => Math.max(0, current - 1));
      setDashboardStats((current) => ({
        ...current,
        activeAlerts: Math.max(0, current.activeAlerts - 1),
      }));
    } catch (error) {
      console.error("Resolve alert error:", error);
      Alert.alert("Error", "Failed to resolve alert. Please try again.");
    } finally {
      setResolvingAlertId(null);
    }
  };

  const markAllAsRead = async () => {
    try {
      await ApiService.markAllNotificationsAsRead();
      await loadNotifications();
    } catch (error) {
      console.error("Mark all read error:", error);
    }
  };

  // ============ RENDER FUNCTIONS FOR EACH TAB ============

  // Filter visitors based on search and filter
  const filteredVisitors = useMemo(() => {
    let list = [];
    
    switch(visitorFilter) {
      case 'active':
        list = visitors.active;
        break;
      case 'pending':
        list = visitors.pending;
        break;
      case 'approved':
        list = visitors.approved;
        break;
      case 'completed':
        list = visitors.completed;
        break;
      default:
        list = visitors.all;
        break;
    }
    
    if (!searchQuery) return list;

    return list.filter(v => 
      v.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.phoneNumber?.includes(searchQuery) ||
      v.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.purposeOfVisit?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.host?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [visitorFilter, visitors, searchQuery]);

  const mobileLocationOptions = useMemo(() => {
    const labels = filteredVisitors
      .map((visitor) => visitor.assignedOffice || visitor.appointmentDepartment || visitor.host || "")
      .filter(Boolean);
    return [
      { key: "all", label: "All Locations" },
      ...Array.from(new Set(labels)).slice(0, 8).map((label) => ({ key: label, label })),
    ];
  }, [filteredVisitors]);

  const mobileVisibleVisitors = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    return filteredVisitors.filter((visitor) => {
      const scheduleDate = new Date(visitor.visitDate || visitor.checkedInAt || visitor.updatedAt || 0);
      const location = visitor.assignedOffice || visitor.appointmentDepartment || visitor.host || "";

      if (mobileLocationFilter !== "all" && location !== mobileLocationFilter) return false;
      if (mobileDateFilter === "today") return scheduleDate >= startOfToday && scheduleDate < endOfToday;
      if (mobileDateFilter === "week") return scheduleDate >= startOfWeek;
      return true;
    });
  }, [filteredVisitors, mobileDateFilter, mobileLocationFilter]);

  const mobileNeedsAttentionVisitors = useMemo(() => {
    const actionableVisitors = [
      ...(visitors.active || []),
      ...(visitors.approved || []),
    ].filter((visitor) => visitor?.status !== "checked_out");

    return actionableVisitors.sort((left, right) => {
      const leftAlertCount = hasActiveWrongLocationAlert(left) ? 1 : 0;
      const rightAlertCount = hasActiveWrongLocationAlert(right) ? 1 : 0;
      if (leftAlertCount !== rightAlertCount) return rightAlertCount - leftAlertCount;

      const leftCheckedIn = left?.status === "checked_in" ? 1 : 0;
      const rightCheckedIn = right?.status === "checked_in" ? 1 : 0;
      if (leftCheckedIn !== rightCheckedIn) return rightCheckedIn - leftCheckedIn;

      return (
        new Date(left?.visitDate || left?.checkedInAt || 0).getTime() -
        new Date(right?.visitDate || right?.checkedInAt || 0).getTime()
      );
    });
  }, [visitors.active, visitors.approved]);

  const mobileNotReadyVisitors = useMemo(
    () =>
      [...(visitors.notReady || [])].sort(
        (left, right) =>
          new Date(left?.visitDate || left?.visitTime || 0).getTime() -
          new Date(right?.visitDate || right?.visitTime || 0).getTime(),
      ),
    [visitors.notReady],
  );

  const mobileWrongLocationCount = useMemo(
    () =>
      [...(visitors.active || []), ...(visitors.approved || [])].filter(
        (visitor) => hasActiveWrongLocationAlert(visitor),
      ).length,
    [visitors.active, visitors.approved],
  );

  const assignableNfcVisitors = useMemo(() => {
    const normalizedSearch = String(visitorNfcSearch || "").trim().toLowerCase();
    const deduped = new Map();

    [
      ...(visitors.all || []),
      ...(visitors.active || []),
      ...(visitors.approved || []),
      ...(visitors.notReady || []),
      ...Object.values(visitorNfcLocalVisitors || {}),
      visitorNfcPinnedVisitor,
    ].filter(Boolean).forEach((visitor) => {
      if (!isVisitorScheduledTodayForNfc(visitor)) return;

      const email = String(visitor?.email || "").trim().toLowerCase();
      const userIdentity = String(
        visitor?.userId ||
        visitor?.relatedUser?._id ||
        visitor?.accountId ||
        "",
      ).trim();
      const identity = email || userIdentity || String(visitor?._id || "").trim();
      if (!identity) return;
      const existing = deduped.get(identity);
      if (existing) {
        const existingHasCard = Boolean(getVisitorAssignedNfcUid(existing));
        const nextHasCard = Boolean(getVisitorAssignedNfcUid(visitor));
        if (existingHasCard || !nextHasCard) return;
      }
      deduped.set(identity, visitor);
    });

    return Array.from(deduped.values())
      .filter((visitor) => {
        if (!normalizedSearch) return true;
        return [
          visitor.fullName,
          visitor.email,
          visitor.phoneNumber,
          getVisitorAssignedNfcUid(visitor),
          visitor.safePassId,
          visitor.assignedOffice,
          visitor.appointmentDepartment,
          visitor.host,
          visitor.assignedStaffName,
          visitor.status,
          visitor.appointmentStatus,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      })
      .sort(
        (left, right) =>
          getAppointmentTimeSortValue(left) - getAppointmentTimeSortValue(right) ||
          String(left?.fullName || left?.email || "").localeCompare(String(right?.fullName || right?.email || "")),
      )
      .slice(0, 18);
  }, [
    visitorNfcSearch,
    visitorNfcLocalVisitors,
    visitorNfcPinnedVisitor,
    visitors.all,
    visitors.active,
    visitors.approved,
    visitors.notReady,
  ]);

  const selectedVisitorForNfc = useMemo(
    () => {
      const selectedFromList = assignableNfcVisitors.find(
        (visitor) =>
          getVisitorNfcIdentity(visitor) === String(selectedVisitorNfcId || "").trim() ||
          String(visitor?._id) === String(selectedVisitorNfcId),
      );
      if (selectedFromList) return selectedFromList;

      const pinnedIdentity = getVisitorNfcIdentity(visitorNfcPinnedVisitor);
      const selectedIdentity = String(selectedVisitorNfcId || "").trim();
      if (
        visitorNfcPinnedVisitor &&
        (!selectedIdentity || pinnedIdentity === selectedIdentity || String(visitorNfcPinnedVisitor?._id) === selectedIdentity)
      ) {
        return visitorNfcPinnedVisitor;
      }

      return assignableNfcVisitors[0] || null;
    },
    [assignableNfcVisitors, selectedVisitorNfcId, visitorNfcPinnedVisitor],
  );

  const visitorNfcListVisitors = useMemo(() => {
    if (assignableNfcVisitors.length) return assignableNfcVisitors;
    return selectedVisitorForNfc ? [selectedVisitorForNfc] : [];
  }, [assignableNfcVisitors, selectedVisitorForNfc]);

  useEffect(() => {
    if (!selectedVisitorNfcId && assignableNfcVisitors[0]) {
      setSelectedVisitorNfcId(getVisitorNfcIdentity(assignableNfcVisitors[0]));
    }
  }, [assignableNfcVisitors, selectedVisitorNfcId]);

  const mobileLogItems = useMemo(() => {
    const normalizedSearch = String(searchQuery || "").trim().toLowerCase();
    return (accessLogs || []).filter((log) => {
      const normalizedStatus = String(log.status || "").toLowerCase();
      const normalizedType = String(log.activityType || log.accessType || "").toLowerCase();
      if (
        mobileLogFilter === "arrival" &&
        !["entry", "checkin", "check_in", "security_checkin"].some((keyword) => normalizedType.includes(keyword))
      ) {
        return false;
      }
      if (
        mobileLogFilter === "departure" &&
        !["exit", "checkout", "check_out", "security_checkout"].some((keyword) => normalizedType.includes(keyword))
      ) {
        return false;
      }
      if (mobileLogFilter === "denied" && normalizedStatus !== "denied") {
        return false;
      }

      if (!normalizedSearch) return true;
      return [
        log.visitorName,
        log.userName,
        log.location,
        log.status,
        log.activityType,
        log.accessType,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [accessLogs, mobileLogFilter, searchQuery]);

  const getMobileLogDisplay = (log = {}) => {
    const normalizedStatus = String(log.status || "").toLowerCase();
    const normalizedType = String(log.activityType || log.accessType || "").toLowerCase();
    const person = log.visitorName || log.userName || log.userEmail || "Visitor";
    const place = log.location || "Campus checkpoint";

    if (normalizedStatus === "denied") {
      return {
        icon: "close-circle-outline",
        color: BRAND.danger,
        title: `${person} was blocked`,
        message: place,
      };
    }

    if (["exit", "checkout", "check_out", "security_checkout"].some((keyword) => normalizedType.includes(keyword))) {
      return {
        icon: "log-out-outline",
        color: BRAND.success,
        title: `${person} departed`,
        message: place,
      };
    }

    if (["entry", "checkin", "check_in", "security_checkin"].some((keyword) => normalizedType.includes(keyword))) {
      return {
        icon: "log-in-outline",
        color: BRAND.blue,
        title: `${person} arrived`,
        message: place,
      };
    }

    return {
      icon: "radio-outline",
      color: BRAND.warning,
      title: person,
      message: `${titleCase(log.activityType || log.accessType || "activity")} at ${place}`,
    };
  };

  const appointmentRecordsItemsPerPage = 6;
  const checkedInVisitors = useMemo(
    () =>
      [...(visitors.active || [])].sort(
        (left, right) =>
          new Date(right?.checkedInAt || 0).getTime() - new Date(left?.checkedInAt || 0).getTime(),
      ),
    [visitors.active],
  );
  const liveVisitorMonitoringRows = useMemo(() => {
    const visitorMap = new Map();
    const addVisitor = (visitor) => {
      if (!visitor) return;
      const sourceVisitor = visitor.sourceVisitor || visitor;
      const key = getVisitorTrackingIdentity(sourceVisitor) || getVisitorTrackingIdentity(visitor);
      if (!key) return;

      const mergedVisitor = {
        ...sourceVisitor,
        ...visitor,
        status: sourceVisitor.status || visitor.status || "checked_in",
        fullName: sourceVisitor.fullName || visitor.fullName || visitor.name || "Visitor",
        assignedOffice:
          visitor.location?.office ||
          visitor.currentLocation?.office ||
          sourceVisitor.assignedOffice ||
          visitor.assignedOffice ||
          sourceVisitor.appointmentDepartment ||
          "",
        checkedInAt: sourceVisitor.checkedInAt || visitor.checkedInAt || visitor.checkInTime,
        currentLocation: {
          ...(sourceVisitor.currentLocation || {}),
          ...(visitor.currentLocation || {}),
          office:
            visitor.location?.office ||
            visitor.currentLocation?.office ||
            sourceVisitor.currentLocation?.office ||
            sourceVisitor.assignedOffice ||
            "",
          floor:
            visitor.location?.floor ||
            visitor.currentLocation?.floor ||
            sourceVisitor.currentLocation?.floor ||
            "ground",
          lastSeenAt:
            visitor.location?.timestamp ||
            visitor.currentLocation?.lastSeenAt ||
            sourceVisitor.currentLocation?.lastSeenAt ||
            sourceVisitor.checkedInAt,
          statusLabel:
            visitor.location?.statusLabel ||
            visitor.currentLocation?.statusLabel ||
            sourceVisitor.currentLocation?.statusLabel ||
            "Inside campus",
          action:
            visitor.location?.action ||
            visitor.currentLocation?.action ||
            sourceVisitor.currentLocation?.action ||
            "",
          isActive: true,
        },
      };

      const existingVisitor = visitorMap.get(key);
      if (
        !existingVisitor ||
        getVisitorTrackingTimestamp(mergedVisitor) > getVisitorTrackingTimestamp(existingVisitor)
      ) {
        visitorMap.set(key, mergedVisitor);
      }
    };

    visitors.active.forEach(addVisitor);
    visitorLocations.forEach(addVisitor);

    return Array.from(visitorMap.values()).sort(
      (left, right) => getVisitorTrackingTimestamp(right) - getVisitorTrackingTimestamp(left),
    );
  }, [visitors.active, visitorLocations]);
  const recentlyCheckedOutVisitors = useMemo(
    () =>
      [...(visitors.completed || [])]
        .sort(
          (left, right) =>
            new Date(right?.checkedOutAt || right?.updatedAt || 0).getTime() -
            new Date(left?.checkedOutAt || left?.updatedAt || 0).getTime(),
        )
        .slice(0, 8),
    [visitors.completed],
  );
  const appointmentRecordsPageCount = Math.max(
    1,
    Math.ceil(filteredVisitors.length / appointmentRecordsItemsPerPage),
  );
  const paginatedAppointmentRecords = useMemo(() => {
    const startIndex = (appointmentRecordsPage - 1) * appointmentRecordsItemsPerPage;
    return [...filteredVisitors]
      .sort(compareAppointmentsBySchedule)
      .slice(startIndex, startIndex + appointmentRecordsItemsPerPage);
  }, [filteredVisitors, appointmentRecordsPage]);
  const paginatedAppointmentRecordGroups = useMemo(
    () => groupAppointmentsByDate(paginatedAppointmentRecords),
    [paginatedAppointmentRecords],
  );

  const filteredReports = useMemo(() => {
    const normalizedSearch = String(reportSearchQuery || '').trim().toLowerCase();
    return reports.filter((report) => {
      const status = String(report.status || 'Open').toLowerCase();
      if (reportStatusFilter !== 'all' && status !== reportStatusFilter) return false;
      if (!normalizedSearch) return true;
      return [
        report.reason,
        report.visitorName,
        report.status,
        report.createdAt ? formatDate(report.createdAt) : '',
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [reportSearchQuery, reportStatusFilter, reports]);

  const reportsItemsPerPage = 6;
  const reportsPageCount = Math.max(1, Math.ceil(filteredReports.length / reportsItemsPerPage));
  const paginatedReports = useMemo(() => {
    const startIndex = (reportsPage - 1) * reportsItemsPerPage;
    return filteredReports.slice(startIndex, startIndex + reportsItemsPerPage);
  }, [filteredReports, reportsPage]);

  const filteredAttendanceRecords = useMemo(() => {
    const query = String(attendanceSearch || "").trim().toLowerCase();
    if (!query) return attendanceRecords;
    return attendanceRecords.filter((record) =>
      [
        record?.name,
        record?.userType,
        record?.role,
        record?.status,
        record?.location,
        record?.checkpointIn,
        record?.checkpointOut,
        record?.nfcCardId,
        record?.sourceDeviceId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [attendanceRecords, attendanceSearch]);

  const attendanceOverview = useMemo(() => {
    return filteredAttendanceRecords.reduce(
      (summary, record) => {
        const status = String(record?.status || "").toLowerCase();
        summary.total += 1;
        if (status === "late" || record?.isLate) summary.late += 1;
        if (["inside", "present"].includes(status)) summary.inside += 1;
        if (["checked_out", "completed"].includes(status) || record?.isCompleted) summary.checkedOut += 1;
        summary.byType[record?.userType || "unknown"] = (summary.byType[record?.userType || "unknown"] || 0) + 1;
        return summary;
      },
      { total: 0, inside: 0, late: 0, checkedOut: 0, byType: {} },
    );
  }, [filteredAttendanceRecords]);

  const attendanceEmptyCopy = useMemo(
    () =>
      buildAttendanceEmptyCopy({
        scope: attendanceScope,
        dateFilter: attendanceDateFilter,
        statusFilter: attendanceStatusFilter,
        search: attendanceSearch,
      }),
    [attendanceScope, attendanceDateFilter, attendanceStatusFilter, attendanceSearch],
  );

  useEffect(() => {
    setAppointmentRecordsPage(1);
  }, [visitorFilter, searchQuery]);

  useEffect(() => {
    setAppointmentRecordsPage((currentPageValue) => Math.min(currentPageValue, appointmentRecordsPageCount));
  }, [appointmentRecordsPageCount]);

  useEffect(() => {
    setReportsPage((currentPageValue) => Math.min(currentPageValue, reportsPageCount));
  }, [reportsPageCount]);

  useEffect(() => {
    setReportsPage(1);
  }, [reportSearchQuery, reportStatusFilter]);

  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceScope, attendanceDateFilter, attendanceStatusFilter, attendanceSearch]);

  useEffect(() => {
    setAttendancePage((currentPageValue) =>
      Math.min(currentPageValue, Math.max(1, attendancePagination.pages || 1)),
    );
  }, [attendancePagination.pages]);

  useEffect(() => {
    if (!user) return;
    loadSecurityAttendanceRecords();
  }, [attendanceScope, attendanceDateFilter, attendanceStatusFilter, attendancePage]);

  useEffect(() => {
    if (!user) return;
    const searchRefresh = setTimeout(() => {
      if (attendancePage !== 1) {
        setAttendancePage(1);
        return;
      }
      loadSecurityAttendanceRecords();
    }, 450);

    return () => clearTimeout(searchRefresh);
  }, [attendanceSearch]);

  const renderAppointmentPagination = () => (
    <View style={styles.appointmentRecordsPaginationRow}>
      <Text style={styles.appointmentRecordsPaginationInfo}>
        Page {appointmentRecordsPage} of {appointmentRecordsPageCount} - {filteredVisitors.length} records
      </Text>
      <View style={styles.appointmentRecordsPaginationActions}>
        <TouchableOpacity
          style={[
            styles.appointmentRecordsPaginationButton,
            appointmentRecordsPage === 1 && styles.appointmentRecordsPaginationButtonDisabled,
          ]}
          onPress={() => setAppointmentRecordsPage((currentValue) => Math.max(1, currentValue - 1))}
          disabled={appointmentRecordsPage === 1}
        >
          <Ionicons
            name="chevron-back-outline"
            size={14}
            color={appointmentRecordsPage === 1 ? "#94A3B8" : "#334155"}
          />
          <Text
            style={[
              styles.appointmentRecordsPaginationButtonText,
              appointmentRecordsPage === 1 && styles.appointmentRecordsPaginationButtonTextDisabled,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.appointmentRecordsPaginationButton,
            appointmentRecordsPage === appointmentRecordsPageCount &&
              styles.appointmentRecordsPaginationButtonDisabled,
          ]}
          onPress={() =>
            setAppointmentRecordsPage((currentValue) =>
              Math.min(appointmentRecordsPageCount, currentValue + 1),
            )
          }
          disabled={appointmentRecordsPage === appointmentRecordsPageCount}
        >
          <Text
            style={[
              styles.appointmentRecordsPaginationButtonText,
              appointmentRecordsPage === appointmentRecordsPageCount &&
                styles.appointmentRecordsPaginationButtonTextDisabled,
            ]}
          >
            Next
          </Text>
          <Ionicons
            name="chevron-forward-outline"
            size={14}
            color={appointmentRecordsPage === appointmentRecordsPageCount ? "#94A3B8" : "#334155"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSecurityTablePagination = ({
    currentPage,
    totalPages,
    totalItems,
    itemLabel,
    onPrevious,
    onNext,
  }) => (
    <View style={styles.appointmentRecordsPaginationRow}>
      <Text style={styles.appointmentRecordsPaginationInfo}>
        Page {currentPage} of {totalPages} - {totalItems} {itemLabel}
      </Text>
      <View style={styles.appointmentRecordsPaginationActions}>
        <TouchableOpacity
          style={[
            styles.appointmentRecordsPaginationButton,
            currentPage === 1 && styles.appointmentRecordsPaginationButtonDisabled,
          ]}
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
              styles.appointmentRecordsPaginationButtonText,
              currentPage === 1 && styles.appointmentRecordsPaginationButtonTextDisabled,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.appointmentRecordsPaginationButton,
            currentPage === totalPages && styles.appointmentRecordsPaginationButtonDisabled,
          ]}
          onPress={onNext}
          disabled={currentPage === totalPages}
        >
          <Text
            style={[
              styles.appointmentRecordsPaginationButtonText,
              currentPage === totalPages && styles.appointmentRecordsPaginationButtonTextDisabled,
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

  const getPresenceIcon = (userType) => {
    switch (String(userType || "").toLowerCase()) {
      case "student":
        return "school-outline";
      case "teacher":
        return "reader-outline";
      case "staff":
        return "briefcase-outline";
      case "security":
      case "guard":
        return "shield-checkmark-outline";
      case "visitor":
        return "person-outline";
      default:
        return "person-circle-outline";
    }
  };

  const getPresenceLocation = (item) =>
    item?.location || item?.checkpointName || item?.checkpointId || "Campus checkpoint";

  const renderVisitorNfcAssignmentPanel = () => {
    const hasPinnedOnlyVisitor = !assignableNfcVisitors.length && Boolean(selectedVisitorForNfc);
    const selectedVisitorCurrentUid = getVisitorAssignedNfcUid(selectedVisitorForNfc);
    const scannedNfcUid = getCleanVisitorNfcUid(visitorNfcUid);
    const canRemoveNfcUid = Boolean(selectedVisitorCurrentUid);

    return (
    <View style={styles.visitorNfcPanel}>
      <View style={styles.visitorNfcHeader}>
        <View style={styles.sectionTitleContainer}>
          <Ionicons name="card-outline" size={20} color="#0A3D91" />
          <View>
            <Text style={styles.sectionTitle}>Assign Visitor Card</Text>
            <Text style={styles.securitySectionSubtitle}>
              Select today's scheduled visitor, then link the physical UID before the visitor gate tap.
            </Text>
          </View>
        </View>
        <View style={styles.visitorNfcCountBadge}>
          <Text style={styles.visitorNfcCountText}>{visitorNfcListVisitors.length} today</Text>
        </View>
      </View>

      {selectedVisitorForNfc ? (
        <View style={styles.visitorNfcWorkspace}>
          <View style={styles.visitorNfcSelectorColumn}>
            <TextInput
              style={styles.visitorNfcSearchInput}
              value={visitorNfcSearch}
              onChangeText={setVisitorNfcSearch}
              placeholder="Search today's visitors"
              placeholderTextColor="#94A3B8"
            />

            <ScrollView style={styles.visitorNfcSelectList} showsVerticalScrollIndicator={false}>
              {visitorNfcListVisitors.map((visitor) => {
                const visitorIdentity = getVisitorNfcIdentity(visitor);
                const selected = visitorIdentity === getVisitorNfcIdentity(selectedVisitorForNfc);
                const assignedNfcUid = getVisitorAssignedNfcUid(visitor);
                const hasAssignedCard = Boolean(assignedNfcUid);
                return (
                  <TouchableOpacity
                    key={visitorIdentity || visitor?._id || visitor?.email}
                    style={[styles.visitorNfcSelectCard, selected && styles.visitorNfcSelectCardActive]}
                    onPress={() => {
                      setSelectedVisitorNfcId(visitorIdentity || visitor?._id || "");
                      setVisitorNfcPinnedVisitor(visitor);
                      setVisitorNfcStatus(null);
                      setTimeout(() => visitorNfcInputRef.current?.focus?.(), 80);
                    }}
                  >
                    <View style={styles.visitorNfcSelectIcon}>
                      <Ionicons
                        name={selected ? "person" : "person-outline"}
                        size={17}
                        color={selected ? "#FFFFFF" : "#0A3D91"}
                      />
                    </View>
                    <View style={styles.visitorNfcSelectContent}>
                      <Text
                        style={[styles.visitorNfcChipName, selected && styles.visitorNfcChipNameActive]}
                        numberOfLines={1}
                      >
                        {visitor?.fullName || visitor?.email || "Visitor"}
                      </Text>
                      <Text
                        style={[styles.visitorNfcChipMeta, selected && styles.visitorNfcChipMetaActive]}
                        numberOfLines={1}
                      >
                        {getVisitorNfcDestination(visitor)}
                      </Text>
                      <Text
                        style={[styles.visitorNfcChipMeta, selected && styles.visitorNfcChipMetaActive]}
                        numberOfLines={1}
                      >
                        {assignedNfcUid || "No UID assigned"}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.visitorNfcAssignmentBadge,
                        hasAssignedCard && styles.visitorNfcAssignmentBadgeAssigned,
                        selected && styles.visitorNfcAssignmentBadgeActive,
                      ]}
                    >
                      <Ionicons
                        name={hasAssignedCard ? "checkmark-circle" : "ellipse-outline"}
                        size={14}
                        color={selected ? "#FFFFFF" : hasAssignedCard ? "#047857" : "#64748B"}
                      />
                      <Text
                        style={[
                          styles.visitorNfcAssignmentBadgeText,
                          hasAssignedCard && styles.visitorNfcAssignmentBadgeTextAssigned,
                          selected && styles.visitorNfcAssignmentBadgeTextActive,
                        ]}
                      >
                        {hasAssignedCard ? "Assigned" : "Open"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {hasPinnedOnlyVisitor ? (
              <View style={styles.visitorNfcStatus}>
                <Ionicons name="sync-outline" size={16} color="#0A3D91" />
                <Text style={styles.visitorNfcStatusText}>
                  Showing the selected visitor while today's list refreshes. UID status is shown above.
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.visitorNfcAssignBox}>
            <View style={styles.visitorNfcSelected}>
              <Text style={styles.visitorNfcSelectedLabel}>Selected Visitor</Text>
              <Text style={styles.visitorNfcSelectedName}>{selectedVisitorForNfc.fullName || "Visitor"}</Text>
              <Text style={styles.visitorNfcSelectedMeta}>
                {selectedVisitorForNfc.email || "No email"} | Current UID:{" "}
                {selectedVisitorCurrentUid || "None"}
              </Text>
            </View>

            <View style={styles.visitorNfcDetailsGrid}>
              {getVisitorNfcDetailRows(selectedVisitorForNfc).map(([label, value]) => (
                <View key={label} style={styles.visitorNfcDetailItem}>
                  <Text style={styles.visitorNfcDetailLabel}>{label}</Text>
                  <Text style={styles.visitorNfcDetailValue} numberOfLines={2}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            <TextInput
              ref={visitorNfcInputRef}
              style={styles.visitorNfcUidInput}
              value={visitorNfcUid}
              onChangeText={(value) => {
                setVisitorNfcUid(normalizeVisitorNfcUidInput(value));
                if (visitorNfcStatus?.type === "error") setVisitorNfcStatus(null);
              }}
              onSubmitEditing={(event) => handleAssignVisitorNfc(event?.nativeEvent?.text)}
              onFocus={() => {
                visitorNfcLastInputAtRef.current = Date.now();
                if (visitorNfcStatus?.type === "error") setVisitorNfcStatus(null);
              }}
              placeholder="Tap visitor card on USB reader"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              blurOnSubmit={false}
              showSoftInputOnFocus={false}
            />

            <View style={styles.visitorNfcFooter}>
              <View style={styles.visitorNfcHint}>
                <Ionicons name="radio-outline" size={16} color="#0A3D91" />
                <Text style={styles.visitorNfcHintText}>{describeRfidReaderInput(visitorNfcUid)}</Text>
              </View>
              {canRemoveNfcUid ? (
                <TouchableOpacity
                  style={[styles.visitorNfcUnassignButton, visitorNfcBusy && styles.visitorNfcAssignButtonDisabled]}
                  onPress={() => handleUnassignVisitorNfc()}
                  disabled={visitorNfcBusy}
                >
                  <Ionicons name="unlink-outline" size={16} color="#B91C1C" />
                  <Text style={styles.visitorNfcUnassignButtonText}>
                    Unassign Current UID
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.visitorNfcAssignButton, visitorNfcBusy && styles.visitorNfcAssignButtonDisabled]}
                onPress={() => handleAssignVisitorNfc()}
                disabled={visitorNfcBusy}
              >
                {visitorNfcBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="link-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.visitorNfcAssignButtonText}>
                      {selectedVisitorCurrentUid ? "Replace UID" : "Assign UID"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {visitorNfcStatus?.message ? (
              <View
                style={[
                  styles.visitorNfcStatus,
                  visitorNfcStatus.type === "success" && styles.visitorNfcStatusSuccess,
                  visitorNfcStatus.type === "error" && styles.visitorNfcStatusError,
                ]}
              >
                <Ionicons
                  name={
                    visitorNfcStatus.type === "success"
                      ? "checkmark-circle-outline"
                      : visitorNfcStatus.type === "error"
                        ? "alert-circle-outline"
                        : "time-outline"
                  }
                  size={16}
                  color={
                    visitorNfcStatus.type === "success"
                      ? "#047857"
                      : visitorNfcStatus.type === "error"
                        ? "#B91C1C"
                        : "#0A3D91"
                  }
                />
                <Text
                  style={[
                    styles.visitorNfcStatusText,
                    visitorNfcStatus.type === "success" && styles.visitorNfcStatusTextSuccess,
                    visitorNfcStatus.type === "error" && styles.visitorNfcStatusTextError,
                  ]}
                >
                  {visitorNfcStatus.message}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.visitorNfcEmpty}>
          <TextInput
            style={styles.visitorNfcSearchInput}
            value={visitorNfcSearch}
            onChangeText={setVisitorNfcSearch}
            placeholder="Search today's visitors"
            placeholderTextColor="#94A3B8"
          />
          <Ionicons name="person-outline" size={24} color="#94A3B8" />
          <Text style={styles.visitorNfcEmptyText}>No scheduled visitors today match this search.</Text>
        </View>
      )}
    </View>
    );
  };

  const renderNfcAssignmentTab = () => (
    <ScrollView
      style={styles.scrollView}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshData}
          tintColor="#0A3D91"
          colors={["#0A3D91"]}
          title="Refreshing NFC assignments..."
          titleColor="#0A3D91"
        />
      }
    >
      <View style={styles.dashboardShell}>
        {renderVisitorNfcAssignmentPanel()}
      </View>
    </ScrollView>
  );

  // Render Dashboard Tab
  const renderDashboardTab = () => (
    <ScrollView 
      style={styles.scrollView}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshData}
          tintColor="#0A3D91"
          colors={["#0A3D91"]}
          title="Refreshing dashboard..."
          titleColor="#0A3D91"
        />
      }
    >
      <View style={styles.dashboardShell}>
      <View style={styles.securityHeroSection}>
        <LinearGradient
          colors={['#041E42', '#0A3D91', '#1C6DD0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.securityHeroCard}
        >
          <View style={styles.securityHeroTop}>
            <View style={styles.securityHeroBadge}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#D8E8FF" />
              <Text style={styles.securityHeroBadgeText}>Security Operations Center</Text>
            </View>
            <View style={styles.securityHeroShiftBadge}>
              <Text style={styles.securityHeroShiftText}>On Duty</Text>
            </View>
          </View>

          <Text style={styles.securityHeroTitle}>Keep campus access moving safely and visibly.</Text>
          <Text style={styles.securityHeroSubtitle}>
            Track approved visitors, monitor live movement, and respond to alerts from one command workspace.
          </Text>

          <View style={styles.securityHeroActions}>
            <TouchableOpacity
              style={styles.securityHeroPrimaryAction}
              onPress={() => selectGuardSubmodule('nfc-assign')}
              accessibilityRole="button"
              accessibilityLabel="Open NFC assignment module"
            >
              <Ionicons name="scan-outline" size={18} color="#0A3D91" />
              <Text style={styles.securityHeroPrimaryActionText}>NFC Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.securityHeroSecondaryAction}
              onPress={() => selectGuardSubmodule('map-ground')}
            >
              <Ionicons name="map-outline" size={18} color="#FFFFFF" />
              <Text style={styles.securityHeroSecondaryActionText}>Live Map</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.securityHeroStats}>
            <View style={styles.securityHeroStatCard}>
              <Text style={styles.securityHeroStatValue}>{visitorStats.activeNow}</Text>
              <Text style={styles.securityHeroStatLabel}>Active Visitors</Text>
            </View>
            <View style={styles.securityHeroStatCard}>
              <Text style={styles.securityHeroStatValue}>{visitorStats.totalToday}</Text>
              <Text style={styles.securityHeroStatLabel}>Today's Visits</Text>
            </View>
            <View style={styles.securityHeroStatCard}>
              <Text style={styles.securityHeroStatValue}>{unreadCount}</Text>
              <Text style={styles.securityHeroStatLabel}>Unread Alerts</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.securityHeroSideCards}>
          <View style={styles.securityHeroSideCard}>
            <View style={[styles.securityHeroSideIcon, { backgroundColor: '#EEF5FF' }]}>
              <Ionicons name="people-circle-outline" size={18} color="#0A3D91" />
            </View>
            <Text style={styles.securityHeroSideValue}>{dashboardStats.activeUsers}</Text>
            <Text style={styles.securityHeroSideLabel}>On-Site Now</Text>
            <Text style={styles.securityHeroSideMeta}>{visitorStats.pendingApproval} awaiting admin review</Text>
          </View>

          <View style={styles.securityHeroSideCard}>
            <View style={[styles.securityHeroSideIcon, { backgroundColor: '#EEF5FF' }]}>
              <Ionicons name="document-text-outline" size={18} color="#1C6DD0" />
            </View>
            <Text style={styles.securityHeroSideValue}>{reports.length}</Text>
            <Text style={styles.securityHeroSideLabel}>Reports Logged</Text>
            <Text style={styles.securityHeroSideMeta}>{alerts.length} security alert{alerts.length === 1 ? '' : 's'} tracked</Text>
          </View>
        </View>
      </View>

      <View style={styles.securityWorkspaceGrid}>
        {/* Live Operations Queue */}
        <View style={[styles.securityPanelCard, styles.securityWorkspacePrimary]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="pulse-outline" size={20} color="#10B981" />
              <View>
                <Text style={styles.sectionTitle}>Live Operations Queue</Text>
                <Text style={styles.securitySectionSubtitle}>Monitor active visitors and recent status changes without the campus map.</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => selectGuardSubmodule('appointment-records')}>
              <Text style={styles.viewAll}>Open Records</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.securityMiniStats}>
            <View style={styles.securityMiniStatCard}>
              <Text style={styles.securityMiniStatValue}>{visitors.active.length}</Text>
              <Text style={styles.securityMiniStatLabel}>Checked In</Text>
            </View>
            <View style={styles.securityMiniStatCard}>
              <Text style={styles.securityMiniStatValue}>{visitors.approved.length}</Text>
              <Text style={styles.securityMiniStatLabel}>Approved</Text>
            </View>
            <View style={styles.securityMiniStatCard}>
              <Text style={styles.securityMiniStatValue}>{visitors.pending.length}</Text>
              <Text style={styles.securityMiniStatLabel}>Pending</Text>
            </View>
          </View>

          <View style={styles.activityList}>
            {[...visitors.active, ...visitors.approved].slice(0, 6).map((visitor, index) => (
              <TouchableOpacity
                key={visitor._id || `${visitor.email}-${index}`}
                style={styles.activityItem}
                onPress={() => handleViewDetails(visitor)}
              >
                <View style={[styles.activityIcon, {
                  backgroundColor: visitor.status === 'checked_in' ? '#EEF5FF' : '#EEF5FF',
                }]}>
                  <Ionicons
                    name={visitor.status === 'checked_in' ? 'log-in-outline' : 'checkmark-circle-outline'}
                    size={16}
                    color={visitor.status === 'checked_in' ? '#0A3D91' : '#0A3D91'}
                  />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>{visitor.fullName}</Text>
                  <Text style={styles.activityLocation}>
                    {visitor.status === 'checked_in' ? 'Currently on site' : 'Ready for arrival'} - {visitor.assignedOffice || visitor.host || 'Campus access'}
                  </Text>
                </View>
                <Text style={styles.activityTime}>
                  {formatTime(visitor.checkedInAt || visitor.visitTime)}
                </Text>
              </TouchableOpacity>
            ))}

            {[...visitors.active, ...visitors.approved].length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="pulse-outline" size={44} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No live visitor activity</Text>
                <Text style={styles.emptyStateSubtitle}>Approved arrivals and active check-ins will appear here automatically.</Text>
                <TouchableOpacity
                  style={styles.emptyRefreshButton}
                  onPress={refreshData}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh dashboard"
                >
                  <Ionicons name="refresh-outline" size={15} color="#0A3D91" />
                  <Text style={styles.emptyRefreshButtonText}>Refresh dashboard</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Operations Overview */}
        <View style={[styles.securityPanelCard, styles.securityWorkspaceSecondary]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="clipboard-outline" size={20} color="#10B981" />
              <View>
                <Text style={styles.sectionTitle}>Operations Snapshot</Text>
                <Text style={styles.securitySectionSubtitle}>A quick read of approved, pending, and completed visits.</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => {
              setVisitorFilter('all');
              selectGuardSubmodule('appointment-records');
            }}>
              <Text style={styles.viewAll}>Appointment Records</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reportStatsGrid}>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatValue}>{visitors.approved.length}</Text>
              <Text style={styles.reportStatLabel}>Approved Visits</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatValue}>{visitors.pending.length}</Text>
              <Text style={styles.reportStatLabel}>Pending Review</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatValue}>{visitors.completed.length}</Text>
              <Text style={styles.reportStatLabel}>Completed Today</Text>
            </View>
          </View>

          <View style={styles.activityList}>
            {analytics.mostVisitedOffices.slice(0, 3).map((office, index) => (
              <View key={office.office || index} style={styles.activityItem}>
                <View style={[styles.activityIcon, { backgroundColor: '#EEF5FF' }]}>
                  <Ionicons name="business-outline" size={16} color="#0A3D91" />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>{office.office}</Text>
                  <Text style={styles.activityLocation}>{office.count} scheduled visit{office.count === 1 ? '' : 's'}</Text>
                </View>
                <Text style={styles.activityTime}>{office.percentage}%</Text>
              </View>
            ))}

            {analytics.mostVisitedOffices.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="business-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No Office Traffic Yet</Text>
                <Text style={styles.emptyStateSubtitle}>Visitor assignments will appear here once registrations come in</Text>
                <TouchableOpacity
                  style={styles.emptyRefreshButton}
                  onPress={refreshData}
                  accessibilityRole="button"
                  accessibilityLabel="Check office traffic again"
                >
                  <Ionicons name="refresh-outline" size={15} color="#0A3D91" />
                  <Text style={styles.emptyRefreshButtonText}>Check again</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.securityPanelCard, styles.securityWorkspaceFull]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="people-outline" size={20} color="#0A3D91" />
              <View>
                <Text style={styles.sectionTitle}>Visitor Monitoring</Text>
                <Text style={styles.securitySectionSubtitle}>
                  Focused view of approved visitor arrivals, active check-ins, and completed departures.
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => selectGuardSubmodule('checked-in-visitors')}>
              <Text style={styles.viewAll}>Open Visitors</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reportStatsGrid}>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatValue}>{liveVisitorMonitoringRows.length || 0}</Text>
              <Text style={styles.reportStatLabel}>Checked In</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatValue}>{visitors.approved.length || 0}</Text>
              <Text style={styles.reportStatLabel}>Approved</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatValue}>{visitors.pending.length || 0}</Text>
              <Text style={styles.reportStatLabel}>Pending</Text>
            </View>
            <View style={styles.reportStatCard}>
              <Text style={styles.reportStatValue}>{visitors.completed.length || 0}</Text>
              <Text style={styles.reportStatLabel}>Completed</Text>
            </View>
          </View>

          <View style={styles.activityList}>
            {[...(liveVisitorMonitoringRows || []), ...(visitors.approved || [])].slice(0, 6).map((visitor, index) => (
              <View
                key={visitor._id || visitor.id || `${visitor.email}-${index}`}
                style={styles.activityItem}
              >
                <View style={[styles.activityIcon, { backgroundColor: '#EEF5FF' }]}>
                  <Ionicons name={visitor.status === 'checked_in' ? "walk-outline" : "person-outline"} size={16} color="#0A3D91" />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>{visitor.fullName || visitor.name || "Visitor"}</Text>
                  <Text style={styles.activityLocation}>
                    {visitor.status === 'checked_in' ? "Inside" : titleCase(visitor.status || "Approved")} at {visitor.currentLocation?.office || visitor.location?.office || visitor.assignedOffice || visitor.appointmentDepartment || visitor.host || "Campus"}
                  </Text>
                </View>
                <Text style={styles.activityTime}>{formatTime(visitor.currentLocation?.lastSeenAt || visitor.checkedInAt || visitor.visitTime || visitor.visitDate)}</Text>
              </View>
            ))}

            {[...(liveVisitorMonitoringRows || []), ...(visitors.approved || [])].length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={44} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No visitor activity yet</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Approved visitors and active check-ins will appear here.
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Command Actions */}
      <View style={styles.quickActionsSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="flash-outline" size={20} color="#F59E0B" />
            <View>
              <Text style={styles.sectionTitle}>Command Actions</Text>
              <Text style={styles.securitySectionSubtitle}>Fast access to the guard tools used during daily operations.</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.securityCommandGrid}>
          <TouchableOpacity style={styles.securityCommandCard} onPress={() => selectGuardSubmodule('appointment-records')}>
            <View style={[styles.securityCommandIcon, { backgroundColor: '#EEF5FF' }]}>
              <Ionicons name="reader-outline" size={24} color="#0A3D91" />
            </View>
            <View style={styles.securityCommandCopy}>
              <Text style={styles.securityCommandTitle}>Appointment Records</Text>
              <Text style={styles.securityCommandSubtitle}>Review approved appointments, check-ins, and completed visits.</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.securityCommandCard} onPress={() => selectGuardSubmodule('report-file')}>
            <View style={[styles.securityCommandIcon, { backgroundColor: '#EEF5FF' }]}>
              <Ionicons name="flag-outline" size={24} color="#0A3D91" />
            </View>
            <View style={styles.securityCommandCopy}>
              <Text style={styles.securityCommandTitle}>File a Report</Text>
              <Text style={styles.securityCommandSubtitle}>Submit incidents, overstays, or security observations.</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.securityCommandCard} onPress={() => selectGuardSubmodule('map-ground')}>
            <View style={[styles.securityCommandIcon, { backgroundColor: '#CCFBF1' }]}>
              <Ionicons name="map-outline" size={24} color="#0A3D91" />
            </View>
            <View style={styles.securityCommandCopy}>
              <Text style={styles.securityCommandTitle}>Monitoring Map</Text>
              <Text style={styles.securityCommandSubtitle}>Track checked-in visitors by floor and assigned office.</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Security Alerts Section */}
      {alerts.length > 0 && (
        <View style={styles.alertsSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Ionicons name="warning-outline" size={20} color="#DC2626" />
              <Text style={styles.sectionTitle}>Security Alerts</Text>
            </View>
            <TouchableOpacity onPress={() => selectGuardSubmodule('report-file')}>
              <Text style={styles.viewAllLink}>Open Reports</Text>
            </TouchableOpacity>
          </View>

          {alerts.slice(0, 3).map((alert, index) => (
            <View key={alert._id || index} style={[styles.alertItem, { 
              borderLeftColor: alert.severity === 'high' ? '#DC2626' : 
                              alert.severity === 'medium' ? '#F59E0B' : '#10B981' 
            }]}>
              <View style={styles.alertIcon}>
                <Ionicons 
                  name={alert.severity === 'high' ? "warning" : 
                        alert.severity === 'medium' ? "alert-circle" : "information-circle"} 
                  size={20} 
                  color={alert.severity === 'high' ? '#DC2626' : 
                         alert.severity === 'medium' ? '#F59E0B' : '#10B981'} 
                />
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertMessage}>{alert.message}</Text>
                <Text style={styles.alertTime}>{formatTime(alert.createdAt)}</Text>
              </View>
              <View style={[styles.alertSeverity, { 
                backgroundColor: alert.severity === 'high' ? '#FEE2E2' : 
                               alert.severity === 'medium' ? '#FEF3C7' : '#EEF5FF' 
              }]}>
                <Text style={[styles.alertSeverityText, { 
                  color: alert.severity === 'high' ? '#DC2626' : 
                         alert.severity === 'medium' ? '#F59E0B' : '#10B981' 
                }]}>
                  {alert.severity?.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
      </View>
    </ScrollView>
  );

  // Render Map Tab
  const renderMapTab = () => {
    const visibleLocations = getFilteredVisitorLocations();
    const attentionLocations = visibleLocations.filter(isMapAttentionVisitor);
    const mapFilterOptions = [
      { key: "all", label: "All" },
      { key: "attention", label: "Needs attention" },
      { key: "in_lobby", label: "In lobby" },
      { key: "inside_office", label: "Inside office" },
      { key: "left_office", label: "Left office" },
      { key: "wrong_office", label: "Wrong office" },
    ];

    return (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.mapSectionFull}>
        <View style={styles.mapToolbar}>
          <View style={styles.mapToolbarCopy}>
            <Text style={styles.mapToolbarTitle}>Campus Map</Text>
            <Text style={styles.mapToolbarMeta}>{getMapLastUpdatedLabel(visitorLocations)}</Text>
          </View>
          <TouchableOpacity style={styles.mapToolbarRefresh} onPress={refreshData}>
            <Ionicons name="refresh-outline" size={16} color="#0A3D91" />
            <Text style={styles.mapToolbarRefreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mapFilterScroll}>
          <View style={styles.mapFilterRow}>
            {mapFilterOptions.map((option) => {
              const isActive = mapStatusFilter === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.mapFilterChip, isActive && styles.mapFilterChipActive]}
                  onPress={() => setMapStatusFilter(option.key)}
                >
                  <Text style={[styles.mapFilterChipText, isActive && styles.mapFilterChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        <SharedMonitoringMap
          title="Live Visitor Tracking Map"
          iconName="map-outline"
          iconColor="#10B981"
          actionLabel="Full Screen"
          onActionPress={() => setShowMapModal(true)}
          visitors={visibleLocations}
          floors={floors}
          offices={offices}
          selectedFloor={selectedFloor}
          selectedOffice={selectedOffice}
          mapBlueprints={mapBlueprints}
          mapLabels={mapLabels}
          officePositions={officePositions}
          onFloorChange={(floorId) => {
            setSelectedFloor(floorId);
            setSelectedOffice('all');
          }}
          onVisitorHover={handleVisitorHover}
          onVisitorLeave={handleVisitorLeave}
          onVisitorSelect={handleVisitorSelect}
          hoveredVisitor={hoveredVisitor}
          renderHoverCard={renderHoverCard}
          backgroundColor="#FFFFFF"
          borderColor="#E5E7EB"
          summaryItems={[
            { label: "Checked In", value: visitors.active.length || 0, color: "#10B981", helper: "On campus" },
            {
              label: "Entered Office",
              value: visibleLocations.filter((visitor) =>
                getVisitorMapState(visitor) === "inside_office",
              ).length,
              color: "#0A3D91",
              helper: "Latest tap inside",
            },
            {
              label: "Left Office",
              value: visibleLocations.filter((visitor) => getVisitorLocationAction(visitor) === "office_departure").length,
              color: "#F59E0B",
              helper: "Waiting for next tap",
            },
            { label: "Needs Attention", value: attentionLocations.length, color: "#DC2626", helper: "Verify now" },
          ]}
          statusLabel="Security monitoring"
          showFloorNavigation={false}
        />
        <View style={styles.mapAttentionPanel}>
          <View style={styles.mapAttentionHeader}>
            <View>
              <Text style={styles.mapAttentionTitle}>Needs Attention</Text>
              <Text style={styles.mapAttentionSubtitle}>Wrong office or overdue left-office movement.</Text>
            </View>
            <Text style={styles.mapAttentionCount}>{attentionLocations.length}</Text>
          </View>
          {attentionLocations.length ? (
            attentionLocations.slice(0, 5).map((visitor) => {
              const stateMeta = getVisitorMapStateMeta(visitor);
              return (
                <TouchableOpacity key={visitor.id} style={styles.mapAttentionItem} onPress={() => handleVisitorSelect(visitor)}>
                  <View style={[styles.mapAttentionIcon, { backgroundColor: `${stateMeta.color}18` }]}>
                    <Ionicons name={stateMeta.icon} size={18} color={stateMeta.color} />
                  </View>
                  <View style={styles.mapAttentionCopy}>
                    <Text style={styles.mapAttentionName} numberOfLines={1}>{visitor.name}</Text>
                    <Text style={styles.mapAttentionReason} numberOfLines={2}>{getMapAttentionReason(visitor)}</Text>
                  </View>
                  <Text style={styles.mapAttentionTime}>{getFreshnessLabel(visitor.location?.timestamp)}</Text>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.mapAttentionEmpty}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
              <Text style={styles.mapAttentionEmptyText}>No visitor needs attention on this floor.</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
    );
  };

  const renderRecordFilterDropdown = ({ id, label, value, options, onSelect, icon = "filter-outline" }) => {
    const isOpen = recordFilterDropdownOpen === id;
    const selectedOption = options.find((option) => option.value === value);

    return (
      <View style={[styles.recordToolbarField, isOpen && styles.recordToolbarFieldOpen]}>
        <Text style={styles.recordToolbarLabel}>{label}</Text>
        <TouchableOpacity
          style={styles.recordToolbarSelect}
          onPress={() => setRecordFilterDropdownOpen(isOpen ? null : id)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${label} filter`}
        >
          <View style={styles.recordToolbarSelectValue}>
            <Ionicons name={icon} size={15} color="#64748B" />
            <Text style={styles.recordToolbarSelectText} numberOfLines={1}>
              {selectedOption?.label || "All"}
            </Text>
          </View>
          <Ionicons name={isOpen ? "chevron-up-outline" : "chevron-down-outline"} size={16} color="#64748B" />
        </TouchableOpacity>
        {isOpen ? (
          <View style={styles.recordToolbarDropdownMenu}>
            <ScrollView style={styles.recordToolbarDropdownScroll} nestedScrollEnabled>
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <TouchableOpacity
                    key={`${id}-${option.value}`}
                    style={[styles.recordToolbarDropdownOption, selected && styles.recordToolbarDropdownOptionActive]}
                    onPress={() => {
                      onSelect(option.value);
                      setRecordFilterDropdownOpen(null);
                    }}
                  >
                    <Text style={[styles.recordToolbarDropdownText, selected && styles.recordToolbarDropdownTextActive]} numberOfLines={1}>
                      {option.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  };

  const renderRecordSearchFilterToolbar = ({
    searchTitle,
    searchSubtitle,
    searchValue,
    onSearchChange,
    onClearSearch,
    searchPlaceholder,
    filterSubtitle,
    hasFilters,
    onResetFilters,
    filterGroups,
  }) => (
    <View style={styles.recordToolbar}>
      <View style={styles.recordToolbarCard}>
        <View style={styles.recordToolbarHeader}>
          <View style={styles.recordToolbarHeaderCopy}>
            <Text style={styles.recordToolbarTitle}>{searchTitle}</Text>
            <Text style={styles.recordToolbarSubtitle}>{searchSubtitle}</Text>
          </View>
          {searchValue ? (
            <TouchableOpacity style={styles.recordToolbarClear} onPress={onClearSearch}>
              <Text style={styles.recordToolbarClearText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor="#9CA3AF"
            value={searchValue}
            onChangeText={onSearchChange}
            returnKeyType="search"
          />
        </View>
      </View>

      <View style={styles.recordToolbarCard}>
        <View style={styles.recordToolbarHeader}>
          <View style={styles.recordToolbarHeaderCopy}>
            <Text style={styles.recordToolbarTitle}>Filters</Text>
            <Text style={styles.recordToolbarSubtitle}>{filterSubtitle}</Text>
          </View>
          {hasFilters ? (
            <TouchableOpacity style={styles.recordToolbarClear} onPress={onResetFilters}>
              <Text style={styles.recordToolbarClearText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.recordToolbarFilterGrid}>
          {filterGroups.map((group) =>
            renderRecordFilterDropdown({
              id: group.id,
              label: group.label,
              value: group.value,
              icon: group.icon,
              options: group.options,
              onSelect: group.onSelect,
            }),
          )}
        </View>
      </View>
    </View>
  );

  // Render Visitors Tab
  const renderVisitorsTab = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.visitorsContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="calendar-outline" size={20} color="#0A3D91" />
            <View>
              <Text style={styles.sectionTitle}>Appointment Records</Text>
              <Text style={styles.securitySectionSubtitle}>
                Security can review appointment records here in a read-only view.
              </Text>
            </View>
          </View>
        </View>

        {renderRecordSearchFilterToolbar({
          searchTitle: "Search Appointments",
          searchSubtitle: "Find by name, phone, email, purpose, or host.",
          searchValue: searchQuery,
          onSearchChange: setSearchQuery,
          onClearSearch: () => setSearchQuery(''),
          searchPlaceholder: "Search name, phone, email, purpose, or host...",
          filterSubtitle: "Narrow appointment records by visitor status.",
          hasFilters: visitorFilter !== 'all',
          onResetFilters: () => setVisitorFilter('all'),
          filterGroups: [
            {
              id: "security-visitor-status",
              label: "Status",
              value: visitorFilter,
              icon: "layers-outline",
              options: [
                { value: "all", label: `All (${visitors.all.length})` },
                { value: "active", label: `Active (${visitors.active.length})` },
                { value: "approved", label: `Approved (${visitors.approved.length})` },
                { value: "completed", label: `Completed (${visitors.completed.length})` },
              ],
              onSelect: setVisitorFilter,
            },
          ],
        })}

        <View style={styles.readonlyInfoBanner}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#0A3D91" />
          <Text style={styles.readonlyInfoBannerText}>
            This section is view-only for guards. Open a record to inspect appointment details.
          </Text>
        </View>

        {/* Appointment Records Table */}
        {filteredVisitors.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.appointmentRecordsTable}>
              <View style={[styles.appointmentRecordsTableRow, styles.appointmentRecordsTableHeader]}>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsVisitorCell]}>Visitor</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsPurposeCell]}>Purpose</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsOfficeCell]}>Office / Host</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsScheduleCell]}>Schedule</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsContactCell]}>Contact</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsStatusCell]}>Status</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsActionCell]}>Action</Text>
              </View>
              {paginatedAppointmentRecordGroups.flatMap((group) => [
                <View key={`appointment-group-${group.dateKey}`} style={styles.appointmentRecordsDateGroupRow}>
                  <Text style={styles.appointmentRecordsDateGroupText}>{group.label}</Text>
                </View>,
                ...group.entries.map((visitor) => renderAppointmentRecordRow(visitor)),
              ])}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No appointment records found</Text>
            <Text style={styles.emptyStateSubtitle}>
              {searchQuery
                ? 'Try a different search term'
                : visitorFilter === 'completed'
                  ? 'No completed appointments are available in the last 30 days'
                  : 'No appointment records in this category'}
            </Text>
          </View>
        )}

        {filteredVisitors.length > 0 ? renderAppointmentPagination() : null}
      </View>
    </ScrollView>
  );

  const renderCampusActivityRow = (visitor, mode = 'checked_in') => {
    const assignedDestination = getVisitorAssignedDestination(visitor);
    const isCheckedIn = mode === 'checked_in';
    const eventTime = isCheckedIn ? visitor?.checkedInAt : visitor?.checkedOutAt;

    return (
      <TouchableOpacity
        key={`${mode}-${visitor._id}`}
        style={styles.appointmentRecordsTableRow}
        onPress={() => handleViewDetails(visitor)}
        activeOpacity={0.75}
      >
        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsVisitorCell]}>
          <View style={styles.appointmentRecordsAvatar}>
            {visitor.idImage ? (
              <Image source={{ uri: visitor.idImage }} style={styles.appointmentRecordsAvatarImage} />
            ) : (
              <Ionicons
                name={isCheckedIn ? "log-in-outline" : "log-out-outline"}
                size={16}
                color="#64748B"
              />
            )}
          </View>
          <View style={styles.appointmentRecordsVisitorInfo}>
            <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
              {visitor.fullName}
            </Text>
            <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
              {visitor.purposeOfVisit || 'No purpose recorded'}
            </Text>
          </View>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsOfficeCell]}>
          <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
            {assignedDestination.officeName}
          </Text>
          <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
            Floor: {assignedDestination.floorLabel}
          </Text>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsScheduleCell]}>
          <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
            {formatDate(eventTime)}
          </Text>
          <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
            {formatTime(eventTime)}
          </Text>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsContactCell]}>
          <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
            {visitor.phoneNumber || 'No phone'}
          </Text>
          <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
            {visitor.host || visitor.assignedStaffName || 'No host assigned'}
          </Text>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsStatusCell]}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: isCheckedIn ? '#DCFCE7' : '#F3F4F6' },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                { color: isCheckedIn ? '#166534' : '#475569' },
              ]}
            >
              {isCheckedIn ? 'Inside Campus' : 'Checked Out'}
            </Text>
          </View>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsActionCell]}>
          <View style={styles.readonlyRecordActions}>
            <TouchableOpacity onPress={() => handleViewDetails(visitor)}>
              <Text style={styles.readonlyRecordActionText}>View Record</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCampusActivityTab = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.visitorsContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="walk-outline" size={20} color="#0A3D91" />
            <View>
              <Text style={styles.sectionTitle}>Visitor Arrival / Departure</Text>
              <Text style={styles.securitySectionSubtitle}>
                Track visitor arrivals, assigned destinations, and the latest visitor departures.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.readonlyInfoBanner}>
          <Ionicons name="navigate-outline" size={18} color="#0A3D91" />
          <Text style={styles.readonlyInfoBannerText}>
            Assigned office and floor are used as the starting map destination immediately after security check-in.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="log-in-outline" size={18} color="#166534" />
            <Text style={styles.sectionTitle}>Currently Inside Campus</Text>
          </View>
          <Text style={styles.securitySectionSubtitle}>{checkedInVisitors.length} active visitor{checkedInVisitors.length === 1 ? '' : 's'}</Text>
        </View>

        {checkedInVisitors.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.appointmentRecordsTable}>
              <View style={[styles.appointmentRecordsTableRow, styles.appointmentRecordsTableHeader]}>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsVisitorCell]}>Visitor</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsOfficeCell]}>Destination</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsScheduleCell]}>Check-In Time</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsContactCell]}>Contact / Host</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsStatusCell]}>Status</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsActionCell]}>Action</Text>
              </View>
              {checkedInVisitors.map((visitor) => renderCampusActivityRow(visitor, 'checked_in'))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="walk-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No visitors inside campus</Text>
            <Text style={styles.emptyStateSubtitle}>Checked-in visitors will appear here with their assigned floor and office.</Text>
          </View>
        )}

        <View style={[styles.readonlyInfoBanner, { marginTop: 16 }]}>
          <Ionicons name="people-outline" size={18} color="#0A3D91" />
          <Text style={styles.readonlyInfoBannerText}>
            Student, staff, and security attendance is tracked separately from visitor monitoring.
          </Text>
          <TouchableOpacity onPress={() => selectGuardSubmodule('attendance-monitoring')}>
            <Text style={styles.viewAll}>Open Attendance</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionHeader, { marginTop: 12 }]}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="log-out-outline" size={18} color="#475569" />
            <Text style={styles.sectionTitle}>Recently Checked Out</Text>
          </View>
          <Text style={styles.securitySectionSubtitle}>Latest completed campus exits</Text>
        </View>

        {recentlyCheckedOutVisitors.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.appointmentRecordsTable}>
              <View style={[styles.appointmentRecordsTableRow, styles.appointmentRecordsTableHeader]}>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsVisitorCell]}>Visitor</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsOfficeCell]}>Last Destination</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsScheduleCell]}>Check-Out Time</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsContactCell]}>Contact / Host</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsStatusCell]}>Status</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsActionCell]}>Action</Text>
              </View>
              {recentlyCheckedOutVisitors.map((visitor) => renderCampusActivityRow(visitor, 'checked_out'))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="exit-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No recent check-outs</Text>
            <Text style={styles.emptyStateSubtitle}>Visitors that just left campus will appear here.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  // Render Alerts Tab
  const renderAlertsTab = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.alertsContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="warning-outline" size={20} color="#DC2626" />
            <Text style={styles.sectionTitle}>Security Alerts</Text>
          </View>
          <TouchableOpacity onPress={refreshData}>
            <Ionicons name="refresh-outline" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {alerts.length > 0 ? (
          alerts.map((alert) => (
            <View key={alert._id} style={[styles.alertCard, { 
              borderLeftColor: alert.severity === 'high' ? '#DC2626' : 
                              alert.severity === 'medium' ? '#F59E0B' : '#10B981',
              borderLeftWidth: 4,
            }]}>
              <View style={styles.alertCardHeader}>
                <View style={styles.alertCardIcon}>
                  <Ionicons 
                    name={alert.severity === 'high' ? "warning" : 
                          alert.severity === 'medium' ? "alert-circle" : "information-circle"} 
                    size={24} 
                    color={alert.severity === 'high' ? '#DC2626' : 
                           alert.severity === 'medium' ? '#F59E0B' : '#10B981'} 
                  />
                </View>
                <View style={styles.alertCardContent}>
                  <Text style={styles.alertCardTitle}>{alert.title || 'Security Alert'}</Text>
                  <Text style={styles.alertCardMessage}>{alert.message}</Text>
                  <Text style={styles.alertCardTime}>{formatDateTime(alert.createdAt)}</Text>
                </View>
              </View>
              {!alert.resolved && (
                <TouchableOpacity 
                  style={styles.resolveButton}
                  onPress={() => handleResolveAlert(alert)}
                  disabled={resolvingAlertId === alert._id}
                >
                  {resolvingAlertId === alert._id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.resolveButtonText}>Mark as Resolved</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No Active Alerts</Text>
            <Text style={styles.emptyStateSubtitle}>Only wrong-room, overstay, overdue movement, and visitor report alerts appear here.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderAttendanceMonitoringTab = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.visitorsContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="clipboard-outline" size={20} color="#0A3D91" />
            <View>
              <Text style={styles.sectionTitle}>Attendance Monitoring</Text>
              <Text style={styles.securitySectionSubtitle}>
                View NFC attendance records for students, academic staff, staff, security, and visitors.
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={loadSecurityAttendanceRecords} disabled={attendanceLoading}>
            <Text style={styles.viewAll}>{attendanceLoading ? "Refreshing..." : "Refresh"}</Text>
          </TouchableOpacity>
        </View>

        {renderRecordSearchFilterToolbar({
          searchTitle: "Search Attendance",
          searchSubtitle: "Find attendance by name, UID, location, type, or status.",
          searchValue: attendanceSearch,
          onSearchChange: setAttendanceSearch,
          onClearSearch: () => setAttendanceSearch(""),
          searchPlaceholder: "Search name, UID, location, or status...",
          filterSubtitle: "Narrow attendance by person type, date, and status.",
          hasFilters:
            attendanceScope !== "all" ||
            attendanceDateFilter !== "today" ||
            attendanceStatusFilter !== "all",
          onResetFilters: () => {
            setAttendanceScope("all");
            setAttendanceDateFilter("today");
            setAttendanceStatusFilter("all");
            setAttendancePage(1);
          },
          filterGroups: [
            {
              id: "attendance-scope",
              label: "Person Type",
              value: attendanceScope,
              icon: "people-outline",
              options: SECURITY_ATTENDANCE_SCOPE_OPTIONS,
              onSelect: setAttendanceScope,
            },
            {
              id: "attendance-date",
              label: "Date Range",
              value: attendanceDateFilter,
              icon: "calendar-outline",
              options: SECURITY_ATTENDANCE_DATE_OPTIONS,
              onSelect: setAttendanceDateFilter,
            },
            {
              id: "attendance-status",
              label: "Status",
              value: attendanceStatusFilter,
              icon: "pulse-outline",
              options: SECURITY_ATTENDANCE_STATUS_OPTIONS,
              onSelect: setAttendanceStatusFilter,
            },
          ],
        })}

        <View style={styles.reportStatsGrid}>
          <View style={styles.reportStatCard}>
            <Text style={styles.reportStatValue}>{attendanceOverview.total}</Text>
            <Text style={styles.reportStatLabel}>Records</Text>
          </View>
          <View style={styles.reportStatCard}>
            <Text style={styles.reportStatValue}>{attendanceOverview.inside}</Text>
            <Text style={styles.reportStatLabel}>Inside / Present</Text>
          </View>
          <View style={styles.reportStatCard}>
            <Text style={styles.reportStatValue}>{attendanceOverview.late}</Text>
            <Text style={styles.reportStatLabel}>Late</Text>
          </View>
          <View style={styles.reportStatCard}>
            <Text style={styles.reportStatValue}>{attendanceOverview.checkedOut}</Text>
            <Text style={styles.reportStatLabel}>Checked Out</Text>
          </View>
        </View>

        {attendanceLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="small" color="#0A3D91" />
            <Text style={styles.emptyStateTitle}>Loading attendance records</Text>
          </View>
        ) : filteredAttendanceRecords.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.appointmentRecordsTable}>
              <View style={[styles.appointmentRecordsTableRow, styles.appointmentRecordsTableHeader]}>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsVisitorCell]}>Person</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsPurposeCell]}>Type</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsScheduleCell]}>Date</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsScheduleCell]}>Check In</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsScheduleCell]}>Check Out</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsStatusCell]}>Status</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsOfficeCell]}>Location</Text>
                <Text style={[styles.appointmentRecordsHeaderCell, styles.appointmentRecordsContactCell]}>NFC UID</Text>
              </View>
              {filteredAttendanceRecords.map((record, index) => (
                <View
                  key={record?._id || `${record?.name}-${record?.attendanceDate}-${index}`}
                  style={styles.appointmentRecordsTableRow}
                >
                  <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsVisitorCell]}>
                    <View style={[styles.activityIcon, { backgroundColor: '#EEF5FF' }]}>
                      <Ionicons name={getPresenceIcon(record?.userType)} size={16} color="#0A3D91" />
                    </View>
                    <View style={styles.appointmentRecordsVisitorInfo}>
                      <Text style={styles.appointmentRecordsVisitorName}>{record?.name || "Unknown"}</Text>
                      <Text style={styles.appointmentRecordsVisitorEmail}>{record?.sourceDeviceId || "Checkpoint tap"}</Text>
                    </View>
                  </View>
                  <Text style={[styles.appointmentRecordsCell, styles.appointmentRecordsPurposeCell]}>
                    {titleCase(record?.userType || record?.role || "User")}
                  </Text>
                  <Text style={[styles.appointmentRecordsCell, styles.appointmentRecordsScheduleCell]}>
                    {formatDate(record?.attendanceDate)}
                  </Text>
                  <Text style={[styles.appointmentRecordsCell, styles.appointmentRecordsScheduleCell]}>
                    {formatTime(record?.checkInTime)}
                  </Text>
                  <Text style={[styles.appointmentRecordsCell, styles.appointmentRecordsScheduleCell]}>
                    {record?.checkOutTime ? formatTime(record.checkOutTime) : "-"}
                  </Text>
                  <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsStatusCell]}>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>{titleCase(record?.status || "Recorded")}</Text>
                    </View>
                  </View>
                  <Text style={[styles.appointmentRecordsCell, styles.appointmentRecordsOfficeCell]} numberOfLines={1}>
                    {record?.location || record?.checkpointIn || "Campus"}
                  </Text>
                  <Text style={[styles.appointmentRecordsCell, styles.appointmentRecordsContactCell]} numberOfLines={1}>
                    {record?.nfcCardId || "No UID"}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>{attendanceEmptyCopy.title}</Text>
            <Text style={styles.emptyStateSubtitle}>{attendanceEmptyCopy.subtitle}</Text>
            <TouchableOpacity
              style={styles.emptyRefreshButton}
              onPress={() => {
                setAttendanceScope("all");
                setAttendanceDateFilter("today");
                setAttendanceStatusFilter("all");
                setAttendanceSearch("");
                setAttendancePage(1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Reset attendance filters"
            >
              <Ionicons name="refresh-outline" size={15} color="#0A3D91" />
              <Text style={styles.emptyRefreshButtonText}>Reset filters</Text>
            </TouchableOpacity>
          </View>
        )}
        {attendanceRecords.length > 0 ||
        attendancePagination.total > 0 ||
        attendanceScope !== "all" ||
        attendanceDateFilter !== "today" ||
        attendanceStatusFilter !== "all" ||
        String(attendanceSearch || "").trim()
          ? renderSecurityTablePagination({
              currentPage: attendancePagination.page || attendancePage,
              totalPages: Math.max(1, attendancePagination.pages || 1),
              totalItems: attendancePagination.total || filteredAttendanceRecords.length,
              itemLabel: "attendance records",
              onPrevious: () => setAttendancePage((currentValue) => Math.max(1, currentValue - 1)),
              onNext: () =>
                setAttendancePage((currentValue) =>
                  Math.min(Math.max(1, attendancePagination.pages || 1), currentValue + 1),
                ),
            })
          : null}
      </View>
    </ScrollView>
  );

  // Render Access Logs Tab
  const renderLogsTab = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.logsContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="time-outline" size={20} color="#0A3D91" />
            <Text style={styles.sectionTitle}>Access Logs</Text>
          </View>
          <TouchableOpacity
            onPress={() => { setLogsPage(1); loadAccessLogs(); }}
            accessibilityRole="button"
            accessibilityLabel="Refresh access logs"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh-outline" size={20} color="#0A3D91" />
          </TouchableOpacity>
        </View>

        <View style={styles.logsList}>
          {accessLogs.map((log) => (
            <View key={log._id} style={styles.logItem}>
              <View style={[styles.logIcon, { 
                backgroundColor: log.status === 'granted' ? '#EEF5FF' : '#FEE2E2' 
              }]}>
                <Ionicons 
                  name={log.status === 'granted' ? "checkmark" : "close"} 
                  size={16} 
                  color={log.status === 'granted' ? '#0A3D91' : '#DC2626'} 
                />
              </View>
              <View style={styles.logContent}>
                <Text style={styles.logTitle}>{log.userName || 'Unknown User'}</Text>
                <Text style={styles.logDetail}>
                  <Ionicons name="location-outline" size={12} color="#9CA3AF" /> {log.location || 'Unknown Location'}
                </Text>
                {log.visitorId && (
                  <Text style={styles.logDetail}>
                    <Ionicons name="person-outline" size={12} color="#9CA3AF" /> {log.visitorId}
                  </Text>
                )}
              </View>
              <Text style={styles.logTime}>{formatDateTime(log.timestamp)}</Text>
            </View>
          ))}
        </View>

        {accessLogs.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No access logs</Text>
            <Text style={styles.emptyStateSubtitle}>Student, staff, visitor, and checkpoint activity will appear here.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  // Render Reports Tab
  const renderReportsTab = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.reportsContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Ionicons name="document-text-outline" size={20} color="#1C6DD0" />
            <View>
              <Text style={styles.sectionTitle}>File a Report</Text>
              <Text style={styles.securitySectionSubtitle}>Submit a guard report, then review the most recent filed incidents below.</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.generateButton}
            onPress={refreshData}
          >
            <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
            <Text style={styles.generateButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.reportFormCard}>
          <Text style={styles.reportFormTitle}>New Security Report</Text>
          <Text style={styles.reportFormSubtitle}>
            Select a checked-in visitor and describe the incident for admin follow-up.
          </Text>

          <View style={styles.reportFormLabelRow}>
            <Text style={styles.reportFormLabel}>Checked-In Visitor</Text>
            <Text style={styles.reportFormHint}>{visitors.active.length} inside facility</Text>
          </View>

          {visitors.active.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.reportVisitorTable}>
                <View style={[styles.reportVisitorTableRow, styles.reportVisitorTableHeader]}>
                  <Text style={[styles.reportVisitorHeaderCell, styles.reportVisitorNameCell]}>Visitor</Text>
                  <Text style={[styles.reportVisitorHeaderCell, styles.reportVisitorOfficeCell]}>Office</Text>
                  <Text style={[styles.reportVisitorHeaderCell, styles.reportVisitorCheckInCell]}>Checked In</Text>
                  <Text style={[styles.reportVisitorHeaderCell, styles.reportVisitorContactCell]}>Contact</Text>
                </View>

                {visitors.active.map((visitor) => {
                  const isSelected = String(reportForm.visitorId) === String(visitor._id);

                  return (
                    <TouchableOpacity
                      key={visitor._id}
                      style={[
                        styles.reportVisitorTableRow,
                        isSelected && styles.reportVisitorTableRowSelected,
                      ]}
                      onPress={() => setReportForm((currentValue) => ({ ...currentValue, visitorId: visitor._id }))}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.reportVisitorCell, styles.reportVisitorNameCell]}>
                        <View style={[styles.reportVisitorSelectDot, isSelected && styles.reportVisitorSelectDotActive]}>
                          {isSelected && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                        </View>
                        <View style={styles.reportVisitorInfo}>
                          <Text style={styles.reportVisitorPrimaryText} numberOfLines={1}>
                            {visitor.fullName || 'Unnamed Visitor'}
                          </Text>
                          <Text style={styles.reportVisitorMutedText} numberOfLines={1}>
                            ID: {visitor.idNumber || 'Not provided'}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.reportVisitorCell, styles.reportVisitorOfficeCell]}>
                        <Text style={styles.reportVisitorPrimaryText} numberOfLines={1}>
                          {visitor.assignedOffice || visitor.appointmentDepartment || 'Campus access'}
                        </Text>
                      </View>

                      <View style={[styles.reportVisitorCell, styles.reportVisitorCheckInCell]}>
                        <Text style={styles.reportVisitorMutedText} numberOfLines={1}>
                          {formatTime(visitor.checkedInAt)}
                        </Text>
                      </View>

                      <View style={[styles.reportVisitorCell, styles.reportVisitorContactCell]}>
                        <Text style={styles.reportVisitorPrimaryText} numberOfLines={1}>
                          {visitor.phoneNumber || 'No phone'}
                        </Text>
                        <Text style={styles.reportVisitorMutedText} numberOfLines={1}>
                          {visitor.email || 'No email'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.reportVisitorEmptyState}>
              <Ionicons name="log-in-outline" size={28} color="#94A3B8" />
              <Text style={styles.reportVisitorEmptyTitle}>No visitors inside</Text>
              <Text style={styles.reportVisitorEmptyText}>
                A visitor must be checked in before security can file a report for them.
              </Text>
            </View>
          )}

          <Text style={styles.reportFormLabel}>Category</Text>
          <View style={styles.reportCategoryRow}>
            {[
              { key: 'suspicious', label: 'Suspicious' },
              { key: 'overstayed', label: 'Overstayed' },
              { key: 'violation', label: 'Violation' },
              { key: 'other', label: 'Other' },
            ].map((option) => {
              const isActive = reportForm.category === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.reportCategoryChip, isActive && styles.reportCategoryChipActive]}
                  onPress={() => setReportForm((currentValue) => ({ ...currentValue, category: option.key }))}
                >
                  <Text style={[styles.reportCategoryChipText, isActive && styles.reportCategoryChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.reportFormLabel}>Details</Text>
          <TextInput
            style={styles.reportFormInput}
            placeholder="Describe what happened..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            value={reportForm.details}
            onChangeText={(text) => setReportForm((currentValue) => ({ ...currentValue, details: text }))}
          />

          <View style={styles.reportFormActions}>
            <TouchableOpacity
              style={styles.reportFormSecondaryButton}
              onPress={() => setReportForm({ visitorId: '', category: 'suspicious', details: '' })}
            >
              <Text style={styles.reportFormSecondaryButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportFormPrimaryButton}
              onPress={submitSecurityReportForm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.reportFormPrimaryButtonText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Report Stats Cards */}
        <View style={styles.reportStatsGrid}>
          <View style={styles.reportStatCard}>
            <Text style={styles.reportStatValue}>{visitorStats.totalToday}</Text>
            <Text style={styles.reportStatLabel}>Today's Visitors</Text>
          </View>
          <View style={styles.reportStatCard}>
            <Text style={styles.reportStatValue}>{visitorStats.totalThisWeek}</Text>
            <Text style={styles.reportStatLabel}>This Week</Text>
          </View>
          <View style={styles.reportStatCard}>
            <Text style={styles.reportStatValue}>{visitorStats.totalThisMonth}</Text>
            <Text style={styles.reportStatLabel}>This Month</Text>
          </View>
        </View>

        {/* Most Visited Offices */}
        {analytics.mostVisitedOffices.length > 0 && (
          <View style={styles.reportSection}>
            <Text style={styles.reportSectionTitle}>Most Visited Offices</Text>
            {analytics.mostVisitedOffices.map((office, index) => (
              <View key={index} style={styles.reportItem}>
                <Text style={styles.reportRank}>{index + 1}</Text>
                <Text style={styles.reportName}>{office.office}</Text>
                <Text style={styles.reportCount}>{office.count} visits</Text>
                <View style={styles.reportBar}>
                  <View style={[styles.reportBarFill, { width: `${office.percentage}%` }]} />
                </View>
                <Text style={styles.reportPercentage}>{office.percentage}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent Reports */}
        {reports.length > 0 && (
          <View style={styles.reportSection}>
            <Text style={styles.reportSectionTitle}>Recent Reports</Text>
            {renderRecordSearchFilterToolbar({
              searchTitle: "Search Reports",
              searchSubtitle: "Find by incident, visitor, status, or date.",
              searchValue: reportSearchQuery,
              onSearchChange: setReportSearchQuery,
              onClearSearch: () => setReportSearchQuery(''),
              searchPlaceholder: "Search incident, visitor, status, or date...",
              filterSubtitle: "Narrow security reports by review status.",
              hasFilters: reportStatusFilter !== 'all',
              onResetFilters: () => setReportStatusFilter('all'),
              filterGroups: [
                {
                  id: "security-report-status",
                  label: "Status",
                  value: reportStatusFilter,
                  icon: "shield-checkmark-outline",
                  options: [
                    { value: "all", label: "All" },
                    { value: "open", label: "Open" },
                    { value: "resolved", label: "Resolved" },
                  ],
                  onSelect: setReportStatusFilter,
                },
              ],
            })}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.securityReportsTable}>
                <View style={[styles.securityReportsTableRow, styles.securityReportsTableHeader]}>
                  <Text style={[styles.securityReportsHeaderCell, styles.securityReportsIncidentCell]}>Incident</Text>
                  <Text style={[styles.securityReportsHeaderCell, styles.securityReportsVisitorCell]}>Visitor</Text>
                  <Text style={[styles.securityReportsHeaderCell, styles.securityReportsDateCell]}>Filed Date</Text>
                  <Text style={[styles.securityReportsHeaderCell, styles.securityReportsStatusCell]}>Status</Text>
                </View>
                {paginatedReports.map((report) => {
                  const isResolved = String(report.status || '').toLowerCase() === 'resolved';

                  return (
                    <View key={report._id} style={styles.securityReportsTableRow}>
                      <View style={[styles.securityReportsCell, styles.securityReportsIncidentCell]}>
                        <View style={styles.securityReportsIncidentIcon}>
                          <Ionicons name="flag-outline" size={16} color="#DC2626" />
                        </View>
                        <Text style={styles.securityReportsPrimaryText} numberOfLines={2}>
                          {report.reason || 'Security incident'}
                        </Text>
                      </View>

                      <View style={[styles.securityReportsCell, styles.securityReportsVisitorCell]}>
                        <Text style={styles.securityReportsPrimaryText} numberOfLines={1}>
                          {report.visitorName || 'Unknown visitor'}
                        </Text>
                      </View>

                      <View style={[styles.securityReportsCell, styles.securityReportsDateCell]}>
                        <Text style={styles.securityReportsMutedText} numberOfLines={1}>
                          {formatDate(report.createdAt)}
                        </Text>
                      </View>

                      <View style={[styles.securityReportsCell, styles.securityReportsStatusCell]}>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: isResolved ? '#EEF5FF' : '#FEF3C7' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: isResolved ? '#0A3D91' : '#B45309' },
                            ]}
                          >
                            {report.status || 'Open'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            {renderSecurityTablePagination({
              currentPage: reportsPage,
              totalPages: reportsPageCount,
              totalItems: filteredReports.length,
              itemLabel: "reports",
              onPrevious: () => setReportsPage((currentValue) => Math.max(1, currentValue - 1)),
              onNext: () => setReportsPage((currentValue) => Math.min(reportsPageCount, currentValue + 1)),
            })}
          </View>
        )}

        {reports.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No Security Reports</Text>
            <Text style={styles.emptyStateSubtitle}>Reported visitor incidents will appear here</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const getTrackingSourceLabel = (source) => {
    const normalizedSource = String(source || '').toLowerCase();
    if (normalizedSource.includes('phone')) return 'Phone GPS';
    if (
      normalizedSource.includes('arduino') ||
      normalizedSource.includes('tap') ||
      normalizedSource.includes('nfc')
    ) {
      return 'Tap checkpoint';
    }
    if (normalizedSource.includes('manual')) return 'Manual update';
    if (normalizedSource.includes('estimate')) return 'Estimated location';
    return 'Tracking update';
  };

  const getFreshnessLabel = (dateValue) => {
    const timestamp = new Date(dateValue).getTime();
    if (!Number.isFinite(timestamp)) return 'No recent update';

    const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSeconds < 45) return 'Live now';
    if (diffSeconds < 180) return `${Math.max(1, Math.floor(diffSeconds / 60))}m ago`;
    if (diffSeconds < 900) return `${Math.floor(diffSeconds / 60)}m ago`;
    return 'Stale update';
  };

  const updateSecurityProfileField = (field, value) => {
    setSecurityProfileForm((currentValue) => ({
      ...currentValue,
      [field]: value,
    }));
  };

  const cancelSecurityProfileEdit = () => {
    setSecurityProfileForm(buildSecurityProfileForm(user));
    setSecurityProfileEditing(false);
  };

  const handleSecurityProfilePhotoPress = async () => {
    if (!securityProfileEditing || securityProfileSaving) return;

    try {
      const launchPicker = async (source) => {
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

        if (!result.canceled) {
          updateSecurityProfileField("profilePhoto", result.assets[0].uri);
        }
      };

      if (Platform.OS === "web") {
        await launchPicker("gallery");
        return;
      }

      Alert.alert("Update Photo", "Choose how you want to update your photo.", [
        { text: "Cancel", style: "cancel" },
        { text: "Take Photo", onPress: () => launchPicker("camera") },
        { text: "Choose from Gallery", onPress: () => launchPicker("gallery") },
      ]);
    } catch (error) {
      Alert.alert("Photo Update Failed", "Could not update your profile photo.");
    }
  };

  const saveSecurityProfile = async () => {
    const firstName = String(securityProfileForm.firstName || "").trim();
    const lastName = String(securityProfileForm.lastName || "").trim();
    const username = String(securityProfileForm.username || "").trim().toLowerCase();
    const email = String(securityProfileForm.email || "").trim().toLowerCase();
    const phone = String(securityProfileForm.phone || "").trim();

    if (!firstName || !lastName) {
      Alert.alert("Missing Name", "Please enter your first and last name.");
      return;
    }

    if (!username) {
      Alert.alert("Missing Username", "Please enter your username.");
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (phone && !isValidPhilippineMobileNumber(phone)) {
      Alert.alert("Invalid Contact Number", PHILIPPINE_MOBILE_NUMBER_MESSAGE);
      return;
    }

    setSecurityProfileSaving(true);
    try {
      const response = await ApiService.updateProfile({
        firstName,
        lastName,
        username,
        email,
        phone: phone ? normalizePhilippineMobileNumber(phone) : "",
        emergencyContact: String(securityProfileForm.emergencyContact || "").trim(),
        profilePhoto: securityProfileForm.profilePhoto || null,
      });

      const updatedUser = {
        ...user,
        ...(response?.user || {}),
        role: normalizeRole(response?.user?.role || user?.role),
      };
      setUser(updatedUser);
      setSecurityProfileForm(buildSecurityProfileForm(updatedUser));
      setSecurityProfileEditing(false);
      Alert.alert("Profile Updated", "Your security profile was updated successfully.");
    } catch (error) {
      Alert.alert("Unable To Save", error?.message || "Please try updating your profile again.");
    } finally {
      setSecurityProfileSaving(false);
    }
  };

  // Render Hover Card
  const renderHoverCard = (groupVisitors = null) => {
    const hoverVisitors = Array.isArray(groupVisitors) && groupVisitors.length > 0
      ? groupVisitors
      : hoveredVisitor
        ? [hoveredVisitor]
        : [];

    if (hoverVisitors.length === 0) return null;
    
    return (
      <View style={[styles.hoverCard, hoverVisitors.length > 1 && styles.hoverCardWide]}>
        <Text style={styles.hoverCardGroupTitle}>
          {hoverVisitors.length > 1 ? `${hoverVisitors.length} visitors here` : "Visitor details"}
        </Text>
        <View style={styles.hoverVisitorGrid}>
          {hoverVisitors.slice(0, 3).map((visitor) => {
            const stateMeta = getVisitorMapStateMeta(visitor);
            return (
            <TouchableOpacity
              key={visitor.id}
              style={styles.hoverVisitorTile}
              onPress={() => handleVisitorSelect(visitor)}
            >
              <View style={styles.hoverCardHeader}>
                {visitor.idPhoto ? (
                  <Image source={{ uri: visitor.idPhoto }} style={styles.hoverCardImage} />
                ) : (
                  <View style={styles.hoverCardImagePlaceholder}>
                    <Ionicons name="person" size={20} color="#9CA3AF" />
                  </View>
                )}
                <View style={styles.hoverCardInfo}>
                  <Text style={styles.hoverCardName} numberOfLines={1}>{visitor.name}</Text>
                  <Text style={styles.hoverCardPurpose} numberOfLines={1}>{visitor.purpose || "On-site visitor"}</Text>
                </View>
              </View>
              <View style={[styles.hoverCardBadge, { backgroundColor: `${stateMeta.color}18`, borderColor: `${stateMeta.color}55` }]}>
                <Ionicons name={stateMeta.icon} size={13} color={stateMeta.color} />
                <Text style={[styles.hoverCardBadgeText, { color: stateMeta.color }]}>{stateMeta.label}</Text>
              </View>
              <View style={styles.hoverCardDetails}>
                <View style={styles.hoverCardDetail}>
                  <Ionicons name="business-outline" size={13} color="#6B7280" />
                  <Text style={styles.hoverCardDetailText} numberOfLines={1}>
                    Current: {visitor.location?.office || "Campus checkpoint"}
                  </Text>
                </View>
                <View style={styles.hoverCardDetail}>
                  <Ionicons name="navigate-outline" size={13} color="#6B7280" />
                  <Text style={styles.hoverCardDetailText} numberOfLines={1}>
                    Expected: {visitor.expectedDestination || "Assigned destination"}
                  </Text>
                </View>
                <View style={styles.hoverCardDetail}>
                  <Ionicons name="alert-circle-outline" size={13} color="#6B7280" />
                  <Text style={styles.hoverCardDetailText} numberOfLines={1}>
                    {getMapAttentionReason(visitor)}
                  </Text>
                </View>
                <View style={styles.hoverCardDetail}>
                  <Ionicons name="time-outline" size={13} color="#6B7280" />
                  <Text style={styles.hoverCardDetailText} numberOfLines={1}>
                    {getFreshnessLabel(visitor.location.timestamp)}
                  </Text>
                </View>
              </View>
              <View style={styles.hoverCardButton}>
                <Text style={styles.hoverCardButtonText}>Open Details</Text>
              </View>
            </TouchableOpacity>
          );
          })}
        </View>
      </View>
    );
  };

  // Render Visitor Card
  const renderVisitorCard = (visitor) => {
    const statusBadge = getStatusBadge(visitor);
    const isCheckedIn = visitor.status === 'checked_in';
    const isProcessing = isVisitorProcessing(visitor._id);
    const historyDaysLeft = visitor.status === 'checked_out'
      ? getCompletedHistoryDaysLeft(visitor)
      : null;
    
    return (
      <TouchableOpacity
        key={visitor._id}
        style={styles.visitorCard}
        onPress={() => handleViewDetails(visitor)}
        activeOpacity={0.7}
      >
        <View style={styles.visitorCardHeader}>
          {visitor.idImage ? (
            <Image source={{ uri: visitor.idImage }} style={styles.visitorIdImage} />
          ) : (
            <View style={styles.visitorIdPlaceholder}>
              <Ionicons name="id-card-outline" size={30} color="#9CA3AF" />
            </View>
          )}
          <View style={styles.visitorCardInfo}>
            <Text style={styles.visitorCardName} numberOfLines={1}>
              {visitor.fullName}
            </Text>
            <Text style={styles.visitorCardPurpose} numberOfLines={1}>
              {visitor.purposeOfVisit}
            </Text>
            <View style={styles.visitorCardMeta}>
              <Ionicons name="call-outline" size={12} color="#6B7280" />
              <Text style={styles.visitorCardMetaText}>
                {visitor.phoneNumber}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>
              {statusBadge.label}
            </Text>
          </View>
        </View>

        <View style={styles.visitorCardFooter}>
          <View style={styles.visitorCardFooterItem}>
            <Ionicons name="person-outline" size={14} color="#6B7280" />
            <Text style={styles.visitorCardFooterText}>
              Host: {visitor.host || 'N/A'}
            </Text>
          </View>
          {visitor.assignedOffice && (
            <View style={styles.visitorCardFooterItem}>
              <Ionicons name="business-outline" size={14} color="#6B7280" />
              <Text style={styles.visitorCardFooterText}>
                {visitor.assignedOffice}
              </Text>
            </View>
          )}
          <View style={styles.visitorCardFooterItem}>
            <Ionicons name="calendar-outline" size={14} color="#6B7280" />
            <Text style={styles.visitorCardFooterText}>
              {formatDate(visitor.visitDate)}
            </Text>
          </View>
          {historyDaysLeft !== null && (
            <View style={[styles.visitorCardFooterItem, styles.visitorHistoryCountdown]}>
              <Ionicons name="time-outline" size={14} color="#D97706" />
              <Text style={styles.visitorHistoryCountdownText}>
                {historyDaysLeft} day{historyDaysLeft === 1 ? '' : 's'} left
              </Text>
            </View>
          )}
        </View>

        <View style={styles.visitorCardActions}>
          {hasApprovedVisitWindow(visitor) && (
            <TouchableOpacity 
              style={[
                styles.visitorCardAction,
                styles.visitorCardActionPrimary,
                isProcessing && styles.buttonDisabled,
              ]}
              onPress={() => isCheckedIn ? handleCheckOut(visitor) : handleCheckIn(visitor)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons 
                    name={isCheckedIn ? "log-out-outline" : "log-in-outline"} 
                    size={18} 
                    color="#FFFFFF" 
                  />
                  <Text style={styles.visitorCardActionText}>
                    {isCheckedIn ? 'Release' : 'Arrived'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.visitorCardAction, styles.visitorCardActionSecondary]}
            onPress={() => handleReportVisitor(visitor)}
          >
            <Ionicons name="flag-outline" size={18} color="#DC2626" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.visitorCardAction, styles.visitorCardActionSecondary]}
            onPress={() => handleViewDetails(visitor)}
          >
            <Ionicons name="information-circle-outline" size={18} color="#0A3D91" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Render Sidebar
  const renderSidebar = () => {
    const sidebarWidth = sidebarAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, sidebarTargetWidth],
    });
    
    return (
      <Animated.View style={[styles.sidebar, { width: sidebarWidth }]}>
        <View style={styles.sidebarHeader}>
          <View style={styles.sidebarLogo}>
            <Image source={Logo} style={styles.sidebarLogoImage} resizeMode="contain" />
            <View>
              <Text style={styles.sidebarLogoText}>Sapphire Security</Text>
              <Text style={styles.sidebarLogoSubtext}>Campus operations</Text>
            </View>
          </View>
          {!isDesktop && (
            <SidebarHoverPressable onPress={toggleSidebar} style={styles.sidebarClose} hoverScale={1.08}>
              <Ionicons name="close" size={22} color="#64748B" />
            </SidebarHoverPressable>
          )}
        </View>
        
        <ScrollView style={styles.sidebarContent} showsVerticalScrollIndicator={false}>
          {/* User Profile Section */}
          {user && (
            <View style={styles.sidebarUser}>
              <View style={styles.sidebarAvatar}>
                <Text style={styles.sidebarAvatarText}>
                  {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                </Text>
              </View>
              <View style={styles.sidebarUserInfo}>
                <Text style={styles.sidebarUserName}>
                  {user.firstName} {user.lastName}
                </Text>
                <Text style={styles.sidebarUserRole}>
                  {user.role?.toUpperCase()} - {user.badgeNumber || 'SEC-0000'}
                </Text>
              </View>
            </View>
          )}

          {/* Navigation Menu */}
          <View style={styles.sidebarNav}>
            {guardModules.map((module) => {
              const isExpanded = expandedModule === module.key;
              const hasSelectedChild = module.submodules.some((submodule) => submodule.key === selectedSubmodule);
              const isDirectHomeModule = module.key === 'home';

              return (
                <View key={module.key} style={styles.sidebarModuleCard}>
                  <SidebarHoverPressable
                    style={[
                      styles.sidebarNavItem,
                      hasSelectedChild && styles.sidebarNavItemActive,
                    ]}
                    onPress={() =>
                      isDirectHomeModule
                        ? selectGuardSubmodule('home-main')
                        : toggleGuardModule(module.key)
                    }
                    hoverScale={1.03}
                  >
                    <View style={[styles.sidebarNavIcon, hasSelectedChild && { backgroundColor: `${module.color}20` }]}>
                      <Ionicons
                        name={module.icon}
                        size={20}
                        color={hasSelectedChild ? module.color : '#6B7280'}
                      />
                    </View>
                    <Text
                      style={[
                        styles.sidebarNavLabel,
                        hasSelectedChild && styles.sidebarNavLabelActive,
                      ]}
                    >
                      {module.label}
                    </Text>
                    {!isDirectHomeModule ? (
                      <Ionicons
                        name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
                        size={18}
                        color={hasSelectedChild ? module.color : '#94A3B8'}
                      />
                    ) : null}
                    {hasSelectedChild && <View style={[styles.sidebarNavIndicator, { backgroundColor: module.color }]} />}
                  </SidebarHoverPressable>

                  {isExpanded && !isDirectHomeModule ? (
                    <View style={styles.sidebarSubmoduleList}>
                      {module.submodules.map((submodule) => {
                        const isActive = selectedSubmodule === submodule.key;
                        return (
                          <SidebarHoverPressable
                            key={submodule.key}
                            style={[
                              styles.sidebarSubmoduleButton,
                              isActive && styles.sidebarSubmoduleButtonActive,
                            ]}
                            onPress={() => selectGuardSubmodule(submodule.key)}
                            hoverScale={1.035}
                          >
                            <Text
                              style={[
                                styles.sidebarSubmoduleLabel,
                                isActive && styles.sidebarSubmoduleLabelActive,
                              ]}
                            >
                              {submodule.label}
                            </Text>
                            {submodule.badge > 0 ? (
                              <View style={styles.sidebarSubmoduleBadge}>
                                <Text style={styles.sidebarSubmoduleBadgeText}>{submodule.badge}</Text>
                              </View>
                            ) : null}
                          </SidebarHoverPressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Quick Stats */}
          <View style={styles.sidebarStatsSection}>
            <Text style={styles.sidebarStatsTitle}>Quick Stats</Text>
            <View style={styles.sidebarStatsGrid}>
              <View style={styles.sidebarStatItem}>
                <Text style={styles.sidebarStatValue}>{visitorStats.activeNow}</Text>
                <Text style={styles.sidebarStatLabel}>Active Now</Text>
              </View>
              <View style={styles.sidebarStatItem}>
                <Text style={styles.sidebarStatValue}>{visitorStats.pendingApproval}</Text>
                <Text style={styles.sidebarStatLabel}>Pending</Text>
              </View>
              <View style={styles.sidebarStatItem}>
                <Text style={styles.sidebarStatValue}>{visitorStats.totalToday}</Text>
                <Text style={styles.sidebarStatLabel}>Today</Text>
              </View>
            </View>
          </View>

          {/* Most Visited Offices */}
          {analytics.mostVisitedOffices.length > 0 && (
            <View style={styles.sidebarSection}>
              <Text style={styles.sidebarSectionTitle}>Most Visited Offices</Text>
              {analytics.mostVisitedOffices.slice(0, 5).map((office, index) => (
                <View key={index} style={styles.sidebarRankItem}>
                  <Text style={styles.sidebarRankNumber}>{index + 1}</Text>
                  <Text style={styles.sidebarRankName}>{office.office}</Text>
                  <Text style={styles.sidebarRankCount}>{office.count}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Logout Button */}
          <SidebarHoverPressable
            style={styles.sidebarLogout}
            onPress={handleLogoutPress}
            disabled={isLoggingOut}
            hoverScale={1.035}
          >
            {isLoggingOut ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={20} color="#DC2626" />
                <Text style={styles.sidebarLogoutText}>Sign Out</Text>
              </>
            )}
          </SidebarHoverPressable>

          {/* Version */}
          <Text style={styles.sidebarVersion}>SafePass v2.1.0</Text>
        </ScrollView>
      </Animated.View>
    );
  };

  const renderAppointmentRecordCard = (visitor) => {
    const statusBadge = getStatusBadge(visitor);

    return (
      <TouchableOpacity
        key={visitor._id}
        style={styles.visitorCard}
        onPress={() => handleViewDetails(visitor)}
        activeOpacity={0.75}
      >
        <View style={styles.visitorCardHeader}>
          {visitor.idImage ? (
            <Image source={{ uri: visitor.idImage }} style={styles.visitorIdImage} />
          ) : (
            <View style={styles.visitorIdPlaceholder}>
              <Ionicons name="document-text-outline" size={30} color="#9CA3AF" />
            </View>
          )}
          <View style={styles.visitorCardInfo}>
            <Text style={styles.visitorCardName} numberOfLines={1}>
              {visitor.fullName}
            </Text>
            <Text style={styles.visitorCardPurpose} numberOfLines={1}>
              {visitor.purposeOfVisit || 'No appointment purpose'}
            </Text>
            <View style={styles.visitorCardMeta}>
              <Ionicons name="business-outline" size={12} color="#6B7280" />
              <Text style={styles.visitorCardMetaText}>
                {visitor.assignedOffice || visitor.host || 'Campus access'}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>
              {statusBadge.label}
            </Text>
          </View>
        </View>

        <View style={styles.visitorCardFooter}>
          <View style={styles.visitorCardFooterItem}>
            <Ionicons name="mail-outline" size={14} color="#6B7280" />
            <Text style={styles.visitorCardFooterText}>
              {visitor.email || 'No email'}
            </Text>
          </View>
          <View style={styles.visitorCardFooterItem}>
            <Ionicons name="call-outline" size={14} color="#6B7280" />
            <Text style={styles.visitorCardFooterText}>
              {visitor.phoneNumber || 'No contact number'}
            </Text>
          </View>
          <View style={styles.visitorCardFooterItem}>
            <Ionicons name="calendar-outline" size={14} color="#6B7280" />
            <Text style={styles.visitorCardFooterText}>
              {formatDate(visitor.visitDate)}
            </Text>
          </View>
        </View>

        <View style={styles.readonlyRecordActions}>
          <TouchableOpacity
            style={[styles.visitorCardAction, styles.visitorCardActionSecondary]}
            onPress={() => handleViewDetails(visitor)}
          >
            <Ionicons name="eye-outline" size={18} color="#0A3D91" />
            <Text style={styles.readonlyRecordActionText}>View Record</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAppointmentRecordRow = (visitor) => {
    const statusBadge = getStatusBadge(visitor);
    const scheduleDate = formatDate(visitor.visitDate);
    const scheduleTime = visitor.visitTime ? formatTime(visitor.visitTime) : 'No time';
    const assignedDestination = getVisitorAssignedDestination(visitor);

    return (
      <TouchableOpacity
        key={visitor._id}
        style={styles.appointmentRecordsTableRow}
        onPress={() => handleViewDetails(visitor)}
        activeOpacity={0.75}
      >
        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsVisitorCell]}>
          <View style={styles.appointmentRecordsAvatar}>
            {visitor.idImage ? (
              <Image source={{ uri: visitor.idImage }} style={styles.appointmentRecordsAvatarImage} />
            ) : (
              <Ionicons name="person-outline" size={16} color="#64748B" />
            )}
          </View>
          <View style={styles.appointmentRecordsVisitorInfo}>
            <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
              {visitor.fullName || 'Unnamed Visitor'}
            </Text>
            <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
              ID: {visitor.idNumber || 'Not provided'}
            </Text>
          </View>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsPurposeCell]}>
          <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={2}>
            {visitor.purposeOfVisit || 'No purpose'}
          </Text>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsOfficeCell]}>
          <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
            {assignedDestination.officeName}
          </Text>
          <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
            Floor: {assignedDestination.floorLabel}
          </Text>
          <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
            Host: {visitor.host || visitor.assignedStaffName || 'N/A'}
          </Text>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsScheduleCell]}>
          <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
            {scheduleDate}
          </Text>
          <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
            {scheduleTime}
          </Text>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsContactCell]}>
          <Text style={styles.appointmentRecordsPrimaryText} numberOfLines={1}>
            {visitor.phoneNumber || 'No phone'}
          </Text>
          <Text style={styles.appointmentRecordsMutedText} numberOfLines={1}>
            {visitor.email || 'No email'}
          </Text>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsStatusCell]}>
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>
              {statusBadge.label}
            </Text>
          </View>
        </View>

        <View style={[styles.appointmentRecordsCell, styles.appointmentRecordsActionCell]}>
          <TouchableOpacity
            style={styles.appointmentRecordsViewButton}
            onPress={() => handleViewDetails(visitor)}
          >
            <Ionicons name="eye-outline" size={16} color="#0A3D91" />
            <Text style={styles.appointmentRecordsViewButtonText}>View</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMobileHeader = () => (
    <View style={securityMobileStyles.header}>
      <View style={securityMobileStyles.headerTop}>
        <View style={securityMobileStyles.headerCopy}>
          <Text style={securityMobileStyles.eyebrow}>Security Mobile</Text>
          <Text style={securityMobileStyles.headerTitle}>Live Command</Text>
          <View style={securityMobileStyles.headerStatusPill}>
            <View style={securityMobileStyles.headerStatusDot} />
            <Text style={securityMobileStyles.headerStatusText}>Checkpoint online</Text>
          </View>
        </View>
        <View style={securityMobileStyles.headerActions}>
          <TouchableOpacity style={securityMobileStyles.headerButton} onPress={() => setShowNotificationModal(true)}>
            <Ionicons name="notifications-outline" size={19} color={BRAND.blue} />
            {unreadCount > 0 ? <View style={securityMobileStyles.dotBadge} /> : null}
          </TouchableOpacity>
          <TouchableOpacity style={securityMobileStyles.headerButton} onPress={handleLogoutPress}>
            <Ionicons name="log-out-outline" size={19} color={BRAND.blue} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={securityMobileStyles.headerSubtitle}>
        Scan arrivals, open the map, or review items that need attention.
      </Text>
      <View style={securityMobileStyles.headerStats}>
        {[
          ["Inside", visitorStats.activeNow || 0],
          ["Expected", visitors.approved?.length || 0],
          ["Alerts", alerts.length || 0],
        ].map(([label, value]) => (
          <View key={label} style={securityMobileStyles.headerStatItem}>
            <Text style={securityMobileStyles.headerStatValue}>{value}</Text>
            <Text style={securityMobileStyles.headerStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderMobileStatusCard = () => (
    <View style={[securityMobileStyles.statusCard, mobileDarkModeEnabled && securityMobileStyles.darkCard]}>
      <View style={securityMobileStyles.statusCardIcon}>
        <Ionicons name="shield-checkmark-outline" size={22} color={BRAND.success} />
      </View>
      <View style={securityMobileStyles.statusCardCopy}>
        <Text style={[securityMobileStyles.statusCardTitle, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]}>Current Status</Text>
        <Text style={[securityMobileStyles.statusCardSubtitle, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>
          {visitorStats.activeNow} inside - {alerts.length} alert{alerts.length === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={securityMobileStyles.statusCardCount}>
        <Text style={securityMobileStyles.statusCardCountText}>{livePresenceSummary?.total || 0}</Text>
        <Text style={securityMobileStyles.statusCardCountLabel}>On site</Text>
      </View>
    </View>
  );

  function renderMobileMetrics() {
    return (
      <View style={securityMobileStyles.statusGrid}>
      {[
        {
          label: "On Site",
          value: livePresenceSummary?.total || visitorStats.activeNow || 0,
          helper: "Live presence",
          icon: "radio-outline",
          color: BRAND.success,
          bg: "#ECFDF5",
        },
        {
          label: "Queue",
          value: mobileNeedsAttentionVisitors.length,
          helper: "Needs action",
          icon: "people-outline",
          color: BRAND.blue,
          bg: "#EEF5FF",
        },
        {
          label: "Wrong Area",
          value: mobileWrongLocationCount,
          helper: "Location flags",
          icon: "navigate-outline",
          color: mobileWrongLocationCount ? BRAND.danger : "#64748B",
          bg: mobileWrongLocationCount ? "#FEF2F2" : "#F8FAFC",
        },
      ].map((item) => (
        <View key={item.label} style={[securityMobileStyles.statusMetricCard, mobileDarkModeEnabled && securityMobileStyles.darkCard]}>
          <View style={[securityMobileStyles.statusMetricIcon, { backgroundColor: item.bg }]}>
            <Ionicons name={item.icon} size={18} color={item.color} />
          </View>
          <Text style={[securityMobileStyles.statusMetricValue, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]}>{item.value}</Text>
          <Text style={[securityMobileStyles.statusMetricLabel, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>{item.label}</Text>
          <Text style={[securityMobileStyles.statusMetricHelper, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>{item.helper}</Text>
        </View>
      ))}
      </View>
    );
  }

  function renderMobileFocusPanel() {
    return (
      <View style={[securityMobileStyles.focusPanel, mobileDarkModeEnabled && securityMobileStyles.darkCard]}>
      <View style={securityMobileStyles.focusIcon}>
        <Ionicons
          name={alerts.length || mobileWrongLocationCount ? "warning-outline" : "shield-checkmark-outline"}
          size={19}
          color={alerts.length || mobileWrongLocationCount ? BRAND.warning : BRAND.success}
        />
      </View>
      <View style={securityMobileStyles.focusCopy}>
        <Text style={[securityMobileStyles.focusTitle, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]}>
          {alerts.length || mobileWrongLocationCount ? "Attention required" : "Operations normal"}
        </Text>
        <Text style={[securityMobileStyles.focusText, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>
          {alerts.length
            ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"} waiting for review.`
            : mobileWrongLocationCount
              ? `${mobileWrongLocationCount} visitor${mobileWrongLocationCount === 1 ? "" : "s"} may be in the wrong area.`
              : "No active alerts or wrong-area flags right now."}
        </Text>
      </View>
      <TouchableOpacity
        style={securityMobileStyles.focusAction}
        onPress={() => setSecurityMobileTab(alerts.length ? "alerts" : "map")}
      >
        <Text style={securityMobileStyles.focusActionText}>{alerts.length ? "Review" : "Map"}</Text>
      </TouchableOpacity>
      </View>
    );
  }

  const renderMobileQuickActions = () => (
    <View style={securityMobileStyles.quickActions}>
      <TouchableOpacity style={[securityMobileStyles.quickAction, securityMobileStyles.quickActionPrimary]} onPress={() => navigation.navigate("NFCScan")}>
        <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
        <Text style={securityMobileStyles.quickActionPrimaryText}>Scan Card</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[securityMobileStyles.quickAction, mobileDarkModeEnabled && securityMobileStyles.darkCard]} onPress={() => setSecurityMobileTab("map")}>
        <Ionicons name="map-outline" size={20} color={BRAND.blue} />
        <Text style={[securityMobileStyles.quickActionText, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]}>Track</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[securityMobileStyles.quickAction, mobileDarkModeEnabled && securityMobileStyles.darkCard]} onPress={() => setSecurityMobileTab("alerts")}>
        <Ionicons name="flag-outline" size={20} color={BRAND.danger} />
        <Text style={[securityMobileStyles.quickActionText, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]}>Report</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMobileVisitorCard = (visitor, compact = false) => {
    const statusBadge = getStatusBadge(visitor);
    const isCheckedIn = visitor.status === "checked_in";
    const isProcessing = isVisitorProcessing(visitor._id);
    const destination = getVisitorAssignedDestination(visitor);

    return (
      <TouchableOpacity
        key={visitor._id}
        style={[securityMobileStyles.visitorCard, mobileDarkModeEnabled && securityMobileStyles.darkCard]}
        onPress={() => handleViewDetails(visitor)}
        activeOpacity={0.82}
      >
        <View style={securityMobileStyles.visitorTop}>
          <View style={securityMobileStyles.visitorIcon}>
            <Ionicons name={isCheckedIn ? "walk-outline" : "person-outline"} size={20} color={BRAND.blue} />
          </View>
          <View style={securityMobileStyles.visitorCopy}>
            <Text style={[securityMobileStyles.visitorName, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]} numberOfLines={1}>{visitor.fullName || "Visitor"}</Text>
            <Text style={[securityMobileStyles.visitorMeta, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]} numberOfLines={1}>
              {destination.officeName} - {destination.floorLabel}
            </Text>
          </View>
          <MobileStatusBadge status={statusBadge.label.toLowerCase()} label={statusBadge.label} />
        </View>
        {!compact ? (
          <>
            <Text style={[securityMobileStyles.visitorPurpose, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]} numberOfLines={2}>
              {visitor.purposeOfVisit || "No purpose recorded"}
            </Text>
            <View style={securityMobileStyles.visitorChips}>
              <View style={[securityMobileStyles.metaChip, mobileDarkModeEnabled && securityMobileStyles.darkPill]}>
                <Ionicons name="calendar-outline" size={14} color="#64748B" />
                <Text style={[securityMobileStyles.metaChipText, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>{formatDate(visitor.visitDate)}</Text>
              </View>
              <View style={[securityMobileStyles.metaChip, mobileDarkModeEnabled && securityMobileStyles.darkPill]}>
                <Ionicons name="time-outline" size={14} color="#64748B" />
                <Text style={[securityMobileStyles.metaChipText, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>{formatTime(visitor.checkedInAt || visitor.visitTime)}</Text>
              </View>
            </View>
            <View style={securityMobileStyles.visitorActions}>
              {(isCheckedIn || isCheckInAllowedNow(visitor)) && visitor.status !== "checked_out" ? (
                <TouchableOpacity
                  style={[securityMobileStyles.visitorActionPrimary, isProcessing && securityMobileStyles.disabled]}
                  onPress={() => (isCheckedIn ? handleCheckOut(visitor) : handleCheckIn(visitor))}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={securityMobileStyles.visitorActionPrimaryText}>{isCheckedIn ? "Release" : "Arrived"}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={securityMobileStyles.visitorActionIcon} onPress={() => handleReportVisitor(visitor)}>
                <Ionicons name="flag-outline" size={18} color={BRAND.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={securityMobileStyles.visitorActionIcon} onPress={() => handleViewDetails(visitor)}>
                <Ionicons name="information-circle-outline" size={18} color={BRAND.blue} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={securityMobileStyles.compactVisitorActions}>
            {visitor.status === "checked_in" ? (
              <TouchableOpacity
                style={[securityMobileStyles.releaseButton, isProcessing && securityMobileStyles.disabled]}
                onPress={() => handleCheckOut(visitor)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
                    <Text style={securityMobileStyles.releaseButtonText}>Release</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : isCheckInAllowedNow(visitor) ? (
              <TouchableOpacity
                style={[securityMobileStyles.compactCheckInButton, isProcessing && securityMobileStyles.disabled]}
                onPress={() => handleCheckIn(visitor)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={BRAND.blue} />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={16} color={BRAND.blue} />
                    <Text style={securityMobileStyles.compactCheckInButtonText}>Arrived</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={securityMobileStyles.compactDetailsButton} onPress={() => handleViewDetails(visitor)}>
              <Text style={securityMobileStyles.compactDetailsButtonText}>Details</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderMobileToolbar = () => (
    <View style={securityMobileStyles.toolbar}>
      <MobileSearchField dark={mobileDarkModeEnabled}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name, status, location..."
      />
      <MobileFilterChips dark={mobileDarkModeEnabled} options={securityStatusFilters} value={visitorFilter} onChange={setVisitorFilter} />
      <MobileFilterChips dark={mobileDarkModeEnabled} options={securityDateFilters} value={mobileDateFilter} onChange={setMobileDateFilter} />
      <MobileFilterChips dark={mobileDarkModeEnabled} options={mobileLocationOptions} value={mobileLocationFilter} onChange={setMobileLocationFilter} />
    </View>
  );

  const renderMobileMonitor = () => (
    <>
      {renderMobileHeader()}
      {renderMobileMetrics()}
      {renderMobileFocusPanel()}
      {renderMobileQuickActions()}
      <View style={securityMobileStyles.sectionHeader}>
        <Text style={securityMobileStyles.sectionTitle}>Action Queue</Text>
        <Text style={securityMobileStyles.sectionCount}>{mobileNeedsAttentionVisitors.length}</Text>
      </View>
      {mobileNeedsAttentionVisitors.length ? (
        mobileNeedsAttentionVisitors.slice(0, 5).map((visitor) => renderMobileVisitorCard(visitor, true))
      ) : (
        <MobileEmptyState dark={mobileDarkModeEnabled} icon="person-add-outline" title="No incoming visitors" message="Approved arrivals and active visits will appear here." />
      )}
      {mobileNotReadyVisitors.length ? (
        <View style={securityMobileStyles.notReadySection}>
          <View style={securityMobileStyles.sectionHeader}>
            <Text style={securityMobileStyles.sectionTitle}>Not Ready</Text>
            <Text style={securityMobileStyles.sectionCount}>{mobileNotReadyVisitors.length}</Text>
          </View>
          {mobileNotReadyVisitors.slice(0, 3).map((visitor) => (
            <TouchableOpacity
              key={visitor._id}
              style={securityMobileStyles.notReadyCard}
              onPress={() => handleViewDetails(visitor)}
            >
              <View style={securityMobileStyles.notReadyIcon}>
                <Ionicons
                  name={getVisitDayRelation(visitor) === "past" ? "time-outline" : "calendar-outline"}
                  size={17}
                  color="#64748B"
                />
              </View>
              <View style={securityMobileStyles.notReadyCopy}>
                <Text style={securityMobileStyles.notReadyName} numberOfLines={1}>{visitor.fullName || "Visitor"}</Text>
                <Text style={securityMobileStyles.notReadyReason} numberOfLines={1}>{getCheckInBlockedLabel(visitor)}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={17} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <TouchableOpacity style={securityMobileStyles.viewAllButton} onPress={() => setSecurityMobileTab("map")}>
        <Text style={securityMobileStyles.viewAllButtonText}>Open full tracking map</Text>
        <Ionicons name="map-outline" size={18} color={BRAND.blue} />
      </TouchableOpacity>
    </>
  );

  const renderMobileLogs = () => (
    <>
      <View style={securityMobileStyles.compactHeader}>
        <Text style={securityMobileStyles.compactTitle}>Recent Activity</Text>
        <Text style={securityMobileStyles.compactSubtitle}>Arrivals, departures, and blocked access across campus.</Text>
      </View>
      <View style={securityMobileStyles.logToolbar}>
        <MobileFilterChips dark={mobileDarkModeEnabled} options={securityLogFilters} value={mobileLogFilter} onChange={setMobileLogFilter} />
        <MobileSearchField dark={mobileDarkModeEnabled} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search activity..." />
      </View>
      <View style={securityMobileStyles.feedList}>
        {mobileLogItems.length ? (
          mobileLogItems.slice(0, 12).map((log, index) => {
            const display = getMobileLogDisplay(log);
            return (
              <View key={log._id || `${log.timestamp}-${index}`} style={[securityMobileStyles.logCard, mobileDarkModeEnabled && securityMobileStyles.darkCard]}>
                <View style={[securityMobileStyles.logIcon, { backgroundColor: `${display.color}16` }]}>
                  <Ionicons name={display.icon} size={18} color={display.color} />
                </View>
                <View style={securityMobileStyles.logCopy}>
                  <Text style={[securityMobileStyles.logTitle, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]} numberOfLines={1}>{display.title}</Text>
                  <Text style={[securityMobileStyles.logMessage, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]} numberOfLines={1}>{display.message}</Text>
                  <Text style={[securityMobileStyles.logTime, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>{formatDateTime(log.timestamp || log.createdAt)}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <MobileEmptyState dark={mobileDarkModeEnabled} icon="list-outline" title="No activity found" message="Try another filter or search term." />
        )}
      </View>
      {mobileLogItems.length > 12 ? (
        <Text style={securityMobileStyles.logFooterNote}>Showing latest 12 items. Use search or filters to narrow the list.</Text>
      ) : null}
    </>
  );

  const renderMobileAlerts = () => (
    <>
      <View style={securityMobileStyles.compactHeader}>
        <Text style={securityMobileStyles.compactTitle}>Alerts & Reports</Text>
        <Text style={securityMobileStyles.compactSubtitle}>Review warnings and file reports for active visitors.</Text>
      </View>
      {alerts.length ? (
        alerts.map((alert) => (
          <View key={alert._id} style={[securityMobileStyles.alertCard, mobileDarkModeEnabled && securityMobileStyles.darkCard]}>
            <View style={securityMobileStyles.alertTop}>
              <Ionicons name="warning-outline" size={20} color={BRAND.danger} />
              <View style={securityMobileStyles.alertCopy}>
                <Text style={[securityMobileStyles.alertTitle, mobileDarkModeEnabled && securityMobileStyles.darkPrimaryText]}>{alert.title || "Security Alert"}</Text>
                <Text style={[securityMobileStyles.alertMessage, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>{alert.message || "No alert details provided."}</Text>
                <Text style={[securityMobileStyles.alertTime, mobileDarkModeEnabled && securityMobileStyles.darkMutedText]}>{formatDateTime(alert.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[securityMobileStyles.resolveButton, resolvingAlertId === alert._id && securityMobileStyles.disabled]}
              onPress={() => handleResolveAlert(alert)}
              disabled={resolvingAlertId === alert._id}
            >
              <Text style={securityMobileStyles.resolveButtonText}>Resolve Alert</Text>
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <MobileEmptyState dark={mobileDarkModeEnabled} icon="shield-checkmark-outline" title="No active alerts" message="Only wrong-room, overstay, overdue movement, and visitor report alerts appear here." />
      )}

      <View style={securityMobileStyles.sectionHeader}>
        <Text style={securityMobileStyles.sectionTitle}>Quick Report</Text>
      </View>
      {checkedInVisitors.length ? (
        checkedInVisitors.slice(0, 5).map((visitor) => (
          <TouchableOpacity
            key={visitor._id}
            style={[
              securityMobileStyles.reportPickCard,
              String(reportForm.visitorId) === String(visitor._id) && securityMobileStyles.reportPickCardActive,
            ]}
            onPress={() => setReportForm((current) => ({ ...current, visitorId: visitor._id }))}
          >
            <Text style={securityMobileStyles.reportPickName}>{visitor.fullName}</Text>
            <Text style={securityMobileStyles.reportPickMeta}>{visitor.assignedOffice || visitor.host || "Campus access"}</Text>
          </TouchableOpacity>
        ))
      ) : (
        <MobileEmptyState dark={mobileDarkModeEnabled} icon="person-remove-outline" title="No checked-in visitors" message="A visitor must be inside before filing a report." />
      )}
      <TextInput
        style={securityMobileStyles.reportInput}
        placeholder="Describe the warning or incident..."
        placeholderTextColor="#94A3B8"
        multiline
        value={reportForm.details}
        onChangeText={(text) => setReportForm((current) => ({ ...current, details: text }))}
      />
      <TouchableOpacity style={securityMobileStyles.submitReportButton} onPress={submitSecurityReportForm} disabled={isSubmitting}>
        {isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={securityMobileStyles.submitReportButtonText}>Submit Security Report</Text>}
      </TouchableOpacity>
    </>
  );

  const renderMobileMap = () => {
    const liveVisitors = getFilteredVisitorLocations();
    const priorityVisitors = liveVisitors.filter(isMapAttentionVisitor).sort((left, right) => {
      const leftAlertCount = hasActiveWrongLocationAlert(left) ? 1 : 0;
      const rightAlertCount = hasActiveWrongLocationAlert(right) ? 1 : 0;
      if (leftAlertCount !== rightAlertCount) return rightAlertCount - leftAlertCount;

      return (
        new Date(right?.location?.timestamp || 0).getTime() -
        new Date(left?.location?.timestamp || 0).getTime()
      );
    });

    return (
      <>
        <View style={securityMobileStyles.compactHeader}>
          <Text style={securityMobileStyles.compactTitle}>Monitoring Map</Text>
          <Text style={securityMobileStyles.compactSubtitle}>
            View active visitor positions by floor and open a full-screen map when you need more room.
          </Text>
        </View>
        <MobileFilterChips
          options={floors.map((floor) => ({ key: floor.id, label: floor.name }))}
          value={selectedFloor}
          onChange={(floorId) => {
            setSelectedFloor(floorId);
            setSelectedOffice("all");
          }}
        />
        <MobileFilterChips
          options={[
            { key: "all", label: "All" },
            { key: "attention", label: "Needs attention" },
            { key: "in_lobby", label: "In lobby" },
            { key: "inside_office", label: "Inside office" },
            { key: "left_office", label: "Left office" },
            { key: "wrong_office", label: "Wrong office" },
          ]}
          value={mapStatusFilter}
          onChange={setMapStatusFilter}
        />
        <Text style={securityMobileStyles.mapUpdatedText}>{getMapLastUpdatedLabel(visitorLocations)}</Text>
        <View style={securityMobileStyles.mobileMapCard}>
          <SharedMonitoringMap
            title="Live Visitor Map"
            iconName="map-outline"
            iconColor={BRAND.success}
            actionLabel="Full Screen"
            onActionPress={() => setShowMapModal(true)}
            visitors={liveVisitors}
            floors={floors}
            offices={offices}
            selectedFloor={selectedFloor}
            selectedOffice={selectedOffice}
            mapBlueprints={mapBlueprints}
            mapLabels={mapLabels}
            officePositions={officePositions}
            onFloorChange={(floorId) => {
              setSelectedFloor(floorId);
              setSelectedOffice("all");
            }}
            onVisitorHover={handleVisitorHover}
            onVisitorLeave={handleVisitorLeave}
            onVisitorSelect={handleVisitorSelect}
            hoveredVisitor={hoveredVisitor}
            renderHoverCard={renderHoverCard}
            initialScale={1.75}
            backgroundColor="#FFFFFF"
            borderColor="#E2E8F0"
            mapBackgroundColor="#F8FBFE"
            summaryItems={[
              { label: "Checked In", value: visitors.active.length || 0, color: BRAND.success, helper: "On campus" },
              {
                label: "Entered Office",
                value: liveVisitors.filter((visitor) =>
                  getVisitorMapState(visitor) === "inside_office",
                ).length,
                color: BRAND.blue,
                helper: "Latest tap inside",
              },
              {
                label: "Left Office",
                value: liveVisitors.filter((visitor) => getVisitorLocationAction(visitor) === "office_departure").length,
                color: BRAND.warning,
                helper: "Waiting for next tap",
              },
              { label: "Needs Attention", value: priorityVisitors.length, color: BRAND.danger, helper: "Verify now" },
            ]}
            statusLabel="Security map"
            showFloorNavigation={false}
            containerStyle={securityMobileStyles.mobileMapContainer}
            mapWrapperStyle={securityMobileStyles.mobileMapWrapper}
          />
        </View>
        <View style={securityMobileStyles.mapActionRow}>
          <TouchableOpacity
            style={securityMobileStyles.mapActionButtonPrimary}
            onPress={() => navigation.navigate("NFCScan")}
            accessibilityRole="button"
            accessibilityLabel="Open NFC scanner"
          >
            <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
            <Text style={securityMobileStyles.mapActionButtonPrimaryText}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={securityMobileStyles.mapActionButton}
            onPress={refreshData}
            accessibilityRole="button"
            accessibilityLabel="Refresh map"
          >
            <Ionicons name="refresh-outline" size={18} color={BRAND.blue} />
            <Text style={securityMobileStyles.mapActionButtonText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={securityMobileStyles.mapActionButton}
            onPress={() => setSecurityMobileTab("alerts")}
            accessibilityRole="button"
            accessibilityLabel="Open report form"
          >
            <Ionicons name="flag-outline" size={18} color={BRAND.danger} />
            <Text style={securityMobileStyles.mapActionButtonText}>Report</Text>
          </TouchableOpacity>
        </View>
        <View style={securityMobileStyles.sectionHeader}>
          <Text style={securityMobileStyles.sectionTitle}>Needs Attention</Text>
          <Text style={securityMobileStyles.sectionCount}>{priorityVisitors.length}</Text>
        </View>
        {priorityVisitors.length ? (
          priorityVisitors.slice(0, 8).map((visitor) => (
            <TouchableOpacity
              key={visitor.id}
              style={[
                securityMobileStyles.locationCard,
                isMapAttentionVisitor(visitor) && securityMobileStyles.locationCardAlert,
              ]}
              onPress={() => handleVisitorSelect(visitor)}
            >
              <View style={securityMobileStyles.locationPin}>
                <Ionicons
                  name={getVisitorMapStateMeta(visitor).icon}
                  size={18}
                  color="#FFFFFF"
                />
              </View>
              <View style={securityMobileStyles.locationCopy}>
                <Text style={securityMobileStyles.locationName}>{visitor.name}</Text>
                <Text style={securityMobileStyles.locationMeta}>{visitor.location?.office || "Campus checkpoint"}</Text>
                <Text style={[securityMobileStyles.locationFreshness, { color: BRAND.danger }]}>
                  {getMapAttentionReason(visitor)}
                </Text>
                <Text style={securityMobileStyles.locationFreshness}>{getFreshnessLabel(visitor.location?.timestamp)}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ))
        ) : (
          <MobileEmptyState dark={mobileDarkModeEnabled} icon="checkmark-circle-outline" title="No attention needed" message="Wrong-office and overdue left-office movement alerts will appear here." />
        )}
      </>
    );
  };

  const renderMobileTracking = () => (
    <>
      <View style={securityMobileStyles.compactHeader}>
        <Text style={securityMobileStyles.compactTitle}>Visitor Location Tracking</Text>
        <Text style={securityMobileStyles.compactSubtitle}>Live checkpoint updates grouped by floor and office.</Text>
      </View>
      <MobileFilterChips
        options={floors.map((floor) => ({ key: floor.id, label: floor.name }))}
        value={selectedFloor}
        onChange={(floorId) => {
          setSelectedFloor(floorId);
          setSelectedOffice("all");
        }}
      />
      <View style={securityMobileStyles.feedList}>
        {getFilteredVisitorLocations().length ? (
          getFilteredVisitorLocations().map((locationItem) => (
            <TouchableOpacity key={locationItem.id} style={securityMobileStyles.locationCard} onPress={() => handleVisitorSelect(locationItem)}>
              <View style={securityMobileStyles.locationPin}>
                <Ionicons name="location-outline" size={18} color="#FFFFFF" />
              </View>
              <View style={securityMobileStyles.locationCopy}>
                <Text style={securityMobileStyles.locationName}>{locationItem.name}</Text>
                <Text style={securityMobileStyles.locationMeta}>{locationItem.location?.office || "Campus checkpoint"}</Text>
                <Text style={securityMobileStyles.locationMeta}>
                  Expected: {locationItem.expectedDestination || "Assigned destination"}
                </Text>
                {hasActiveWrongLocationAlert(locationItem) ? (
                  <Text style={[securityMobileStyles.locationFreshness, { color: BRAND.danger }]}>
                    Wrong-office alert: {locationItem.wrongLocationAlerts[0]?.actualLocation || "Unknown office"}
                  </Text>
                ) : null}
                <Text style={securityMobileStyles.locationFreshness}>{getFreshnessLabel(locationItem.location?.timestamp)}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ))
        ) : (
          <MobileEmptyState dark={mobileDarkModeEnabled} icon="map-outline" title="No live locations" message="Visitor location updates will appear after NFC checkpoint taps." />
        )}
      </View>
    </>
  );

  const renderMobileProfile = () => {
    const renderProfileInput = (label, field, options = {}) => (
      <View style={securityMobileStyles.profileField} key={field}>
        <Text style={securityMobileStyles.profileLabel}>{label}</Text>
        <TextInput
          style={securityMobileStyles.profileInput}
          value={securityProfileForm[field]}
          onChangeText={(value) => updateSecurityProfileField(field, value)}
          placeholder={label}
          placeholderTextColor="#94A3B8"
          autoCapitalize={options.autoCapitalize || "words"}
          keyboardType={options.keyboardType || "default"}
          editable={!securityProfileSaving}
        />
      </View>
    );

    const profileRows = [
      ["Badge", user.badgeNumber || user.employeeId || "SEC-0000"],
      ["Shift", user.shift || "On duty"],
      ["Department", user.department || "Security Department"],
      ["Email", user.email],
      ["Phone", user.phone || "Not set"],
    ];

    return (
      <>
        <View style={securityMobileStyles.compactHeader}>
          <View style={securityMobileStyles.profileHeaderRow}>
            <View style={securityMobileStyles.profileHeaderCopy}>
              <Text style={securityMobileStyles.compactTitle}>Security Account</Text>
              <Text style={securityMobileStyles.compactSubtitle}>Manage your contact details and operational profile.</Text>
            </View>
            <TouchableOpacity
              style={securityMobileStyles.profileEditButton}
              onPress={() => {
                if (securityProfileEditing) {
                  cancelSecurityProfileEdit();
                } else {
                  setSecurityProfileForm(buildSecurityProfileForm(user));
                  setSecurityProfileEditing(true);
                }
              }}
              disabled={securityProfileSaving}
            >
              <Ionicons
                name={securityProfileEditing ? "close-outline" : "create-outline"}
                size={18}
                color={BRAND.blue}
              />
              <Text style={securityMobileStyles.profileEditButtonText}>
                {securityProfileEditing ? "Cancel" : "Edit"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={securityMobileStyles.profileCard}>
          <View style={securityMobileStyles.profileTop}>
            <TouchableOpacity
              style={securityMobileStyles.profileAvatar}
              onPress={handleSecurityProfilePhotoPress}
              activeOpacity={securityProfileEditing ? 0.82 : 1}
            >
              {(securityProfileEditing ? securityProfileForm.profilePhoto : user.profilePhoto) ? (
                <Image source={{ uri: securityProfileEditing ? securityProfileForm.profilePhoto : user.profilePhoto }} style={securityMobileStyles.profileAvatarImage} />
              ) : (
                <Text style={securityMobileStyles.profileAvatarText}>{user.firstName?.charAt(0)}{user.lastName?.charAt(0)}</Text>
              )}
              {securityProfileEditing ? (
                <View style={securityMobileStyles.profileCameraBadge}>
                  <Ionicons name="camera-outline" size={15} color="#FFFFFF" />
                </View>
              ) : null}
            </TouchableOpacity>
            <View style={securityMobileStyles.profileCopy}>
              <Text style={securityMobileStyles.profileName}>{user.firstName} {user.lastName}</Text>
              <Text style={securityMobileStyles.profileRole}>{String(user.role || "security").toUpperCase()}</Text>
            </View>
          </View>
          {securityProfileEditing ? (
            <>
              <View style={securityMobileStyles.profileFormGrid}>
                {renderProfileInput("First Name", "firstName")}
                {renderProfileInput("Last Name", "lastName")}
                {renderProfileInput("Username", "username", { autoCapitalize: "none" })}
                {renderProfileInput("Email", "email", { autoCapitalize: "none", keyboardType: "email-address" })}
                {renderProfileInput("Phone", "phone", { keyboardType: "phone-pad" })}
                {renderProfileInput("Emergency Contact", "emergencyContact", { keyboardType: "phone-pad" })}
              </View>
              <TouchableOpacity
                style={[securityMobileStyles.saveProfileButton, securityProfileSaving && securityMobileStyles.disabled]}
                onPress={saveSecurityProfile}
                disabled={securityProfileSaving}
              >
                {securityProfileSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={securityMobileStyles.saveProfileButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            profileRows.map(([label, value]) => (
              <View key={label} style={securityMobileStyles.profileRow}>
                <Text style={securityMobileStyles.profileLabel}>{label}</Text>
                <Text style={securityMobileStyles.profileValue}>{value}</Text>
              </View>
            ))
          )}
        </View>
        <TouchableOpacity style={securityMobileStyles.logoutButton} onPress={handleLogoutPress}>
          <Ionicons name="log-out-outline" size={18} color={BRAND.danger} />
          <Text style={securityMobileStyles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </>
    );
  };

  const renderMobileVisitorDetailModal = () => (
    <Modal visible={showDetailModal} transparent animationType="slide" onRequestClose={() => setShowDetailModal(false)}>
      <View style={securityMobileStyles.modalOverlay}>
        <View style={securityMobileStyles.detailSheet}>
          <View style={securityMobileStyles.detailHeader}>
            <View>
              <Text style={securityMobileStyles.detailTitle}>{selectedVisitor?.fullName || "Visitor Details"}</Text>
              <Text style={securityMobileStyles.detailSubtitle}>{selectedVisitor?.purposeOfVisit || "No purpose provided"}</Text>
            </View>
            <TouchableOpacity style={securityMobileStyles.closeButton} onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>
          {selectedVisitor ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={securityMobileStyles.detailBody}>
              <MobileStatusBadge status={getStatusBadge(selectedVisitor).label.toLowerCase()} label={getStatusBadge(selectedVisitor).label} />
              {[
                ["Phone", selectedVisitor.phoneNumber || "No phone"],
                ["Email", selectedVisitor.email || "No email"],
                ["Office", getVisitorAssignedDestination(selectedVisitor).officeName],
                ["Schedule", `${formatDate(selectedVisitor.visitDate)} at ${formatTime(selectedVisitor.visitTime)}`],
                ["Checked In", formatDateTime(selectedVisitor.checkedInAt)],
                ["Checked Out", formatDateTime(selectedVisitor.checkedOutAt)],
              ].map(([label, value]) => (
                <View key={label} style={securityMobileStyles.detailRow}>
                  <Text style={securityMobileStyles.detailLabel}>{label}</Text>
                  <Text style={securityMobileStyles.detailValue}>{value}</Text>
                </View>
              ))}
              <View style={securityMobileStyles.detailActions}>
                {(selectedVisitor.status === "checked_in" || isCheckInAllowedNow(selectedVisitor)) &&
                selectedVisitor.status !== "checked_out" ? (
                  <TouchableOpacity
                    style={securityMobileStyles.detailPrimaryButton}
                    onPress={() => {
                      setShowDetailModal(false);
                      selectedVisitor.status === "checked_in"
                        ? handleCheckOut(selectedVisitor)
                        : handleCheckIn(selectedVisitor);
                    }}
                  >
                    <Text style={securityMobileStyles.detailPrimaryButtonText}>
                      {selectedVisitor.status === "checked_in" ? "Release" : "Arrived"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={securityMobileStyles.detailDangerButton}
                  onPress={() => {
                    setShowDetailModal(false);
                    handleReportVisitor(selectedVisitor);
                  }}
                >
                  <Text style={securityMobileStyles.detailDangerButtonText}>Flag Visitor</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  const renderFullscreenMapModal = () => (
    <Modal
      visible={showMapModal}
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => setShowMapModal(false)}
    >
      <Animated.View
        style={[
          styles.fullscreenModal,
          {
            opacity: fullscreenMapAnim,
            transform: [
              {
                translateY: fullscreenMapAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
              {
                scale: fullscreenMapAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.fullscreenModalHeader}>
          <Text style={styles.fullscreenModalTitle}>Live Visitor Tracking</Text>
          <TouchableOpacity
            style={styles.fullscreenMinimizeButton}
            onPress={() => setShowMapModal(false)}
            activeOpacity={0.82}
          >
            <Ionicons name="contract-outline" size={20} color="#FFFFFF" />
            <Text style={styles.fullscreenMinimizeButtonText}>Minimize</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.fullscreenMapContainer}>
          <SharedMonitoringMap
            title="Live Visitor Tracking"
            subtitle="Monitor approved visitors, check-ins, and on-site movement from one shared monitoring map."
            iconName="map-outline"
            iconColor="#10B981"
            visitors={getFilteredVisitorLocations()}
            floors={floors}
            offices={offices}
            selectedFloor={selectedFloor}
            selectedOffice={selectedOffice}
            mapBlueprints={mapBlueprints}
            mapLabels={mapLabels}
            officePositions={officePositions}
            onFloorChange={(floorId) => {
              setSelectedFloor(floorId);
              setSelectedOffice("all");
            }}
            onVisitorHover={handleVisitorHover}
            onVisitorLeave={handleVisitorLeave}
            onVisitorSelect={handleVisitorSelect}
            hoveredVisitor={hoveredVisitor}
            renderHoverCard={renderHoverCard}
            fullscreen
            initialScale={1.35}
            backgroundColor="#111827"
            borderColor="#374151"
            mapBackgroundColor="#111827"
            textPrimary="#FFFFFF"
            textSecondary="#CBD5E1"
            summaryItems={[
              { label: "Checked In", value: visitors.active.length || 0, color: "#10B981", helper: "On campus" },
              {
                label: "Entered Office",
                value: getFilteredVisitorLocations().filter((visitor) =>
                  getVisitorMapState(visitor) === "inside_office",
                ).length,
                color: "#8EC5FF",
                helper: "Latest tap inside",
              },
              {
                label: "Left Office",
                value: getFilteredVisitorLocations().filter((visitor) => getVisitorLocationAction(visitor) === "office_departure").length,
                color: "#FBBF24",
                helper: "Waiting for next tap",
              },
              {
                label: "Needs Attention",
                value: getFilteredVisitorLocations().filter(isMapAttentionVisitor).length,
                color: "#F87171",
                helper: "Verify now",
              },
            ]}
            statusLabel="Security monitoring"
            showFloorNavigation={false}
          />
        </View>
      </Animated.View>
    </Modal>
  );

  const renderMobileSecurityScreen = () => {
    const handleMobileTabChange = (tabKey) => {
      if (tabKey === "profile") {
        navigation.navigate("Profile");
        return;
      }
      setSecurityMobileTab(tabKey);
    };

    const content =
      securityMobileTab === "logs"
        ? renderMobileLogs()
        : securityMobileTab === "alerts"
          ? renderMobileAlerts()
          : securityMobileTab === "map"
            ? renderMobileMap()
            : renderMobileMonitor();

    return (
      <SafeAreaView style={[securityMobileStyles.safeArea, mobileDarkModeEnabled && securityMobileStyles.darkSafeArea]}>
        <StatusBar barStyle={mobileDarkModeEnabled ? "light-content" : "dark-content"} backgroundColor={mobileDarkModeEnabled ? "#07111F" : BRAND.page} />
        <ScrollView
          style={[securityMobileStyles.scroll, mobileDarkModeEnabled && securityMobileStyles.darkSafeArea]}
          contentContainerStyle={securityMobileStyles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={BRAND.blue} />}
        >
          <MobileConnectionBanner
            dark={mobileDarkModeEnabled}
            visible={!!connectionIssue}
            title={connectionIssue?.title}
            message={connectionIssue?.message}
            onRetry={refreshData}
            style={{ marginBottom: 14 }}
          />
          {content}
        </ScrollView>
        <MobileBottomNav dark={mobileDarkModeEnabled} tabs={securityMobileTabs} activeTab={securityMobileTab} onChange={handleMobileTabChange} />
        {renderMobileVisitorDetailModal()}
        {renderFullscreenMapModal()}
      </SafeAreaView>
    );
  };

  // ============ LOADING STATE ============
  if (isLoading) {
    return isMobileLayout ? (
      <MobileLoadingState dark={mobileDarkModeEnabled} message="Loading security operations..." />
    ) : (
      <SafeAreaView style={styles.loadingContainer}>
        <Image source={Logo} resizeMode="contain" style={{ width: 116, height: 58, marginBottom: 18 }} />
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={styles.loadingText}>Loading security operations...</Text>
        <Text style={styles.loadingSubtext}>Restoring live visitors, alerts, and access logs.</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return null;
  }

  const selectedSubmoduleMeta = getSelectedSubmoduleMeta();

  if (isMobileLayout) {
    return renderMobileSecurityScreen();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8FC" />
      
      <View style={styles.mainContainer}>
        {/* Sidebar */}
        {renderSidebar()}
        
        {/* Main Content */}
        <Animated.View style={[styles.mainContent, { opacity: fadeAnim }]}>
          {/* Header with Burger Menu */}
          <View style={styles.pageHeaderWrap}>
            <View style={styles.pageHeaderCard}>
              <View style={styles.headerTop}>
              <View style={styles.headerLeft}>
                <TouchableOpacity 
                  style={styles.burgerButton}
                  onPress={toggleSidebar}
                >
                  <Ionicons name="menu-outline" size={24} color="#0A3D91" />
                </TouchableOpacity>
                <View>
                  <Text style={styles.pageEyebrow}>Security Module</Text>
                  <Text style={styles.headerTitle}>
                    {selectedSubmoduleMeta.title}
                  </Text>
                  <Text style={styles.headerSubtitle}>
                    {selectedSubmoduleMeta.subtitle}
                  </Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity 
                  style={styles.notificationBell}
                  onPress={() => setShowNotificationModal(true)}
                >
                  <Ionicons name="notifications-outline" size={22} color="#0A3D91" />
                  {unreadCount > 0 && (
                    <View style={styles.notificationBadge}>
                      <Text style={styles.notificationBadgeText}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.profileButton}
                  onPress={() => navigation.navigate("Profile")}
                >
                  <View style={styles.profileIcon}>
                    <Text style={styles.profileIconText}>
                      {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.headerInfo}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Badge</Text>
                <Text style={styles.infoValue}>
                  {user.badgeNumber || user.employeeId || "SEC-0000"}
                </Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Status</Text>
                <Text style={styles.statusValue}>On Duty</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Active Visitors</Text>
                <Text style={styles.visitorCount}>
                  {visitorStats.activeNow}
                </Text>
              </View>
            </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 24 }}>
            <MobileConnectionBanner
              visible={!!connectionIssue}
              title={connectionIssue?.title}
              message={connectionIssue?.message}
              onRetry={refreshData}
              style={{ marginBottom: 14 }}
            />
          </View>

          {/* Tab Content */}
          {selectedSubmodule === 'home-main' && renderDashboardTab()}
          {selectedSubmodule.startsWith('map-') && renderMapTab()}
          {selectedSubmodule === 'appointment-records' && renderVisitorsTab()}
          {selectedSubmodule === 'checked-in-visitors' && renderCampusActivityTab()}
          {selectedSubmodule === 'attendance-monitoring' && renderAttendanceMonitoringTab()}
          {selectedSubmodule === 'nfc-assign' && renderNfcAssignmentTab()}
          {selectedSubmodule === 'report-file' && renderReportsTab()}
          
        </Animated.View>
      </View>

      {/* LOGOUT MODAL */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelLogout}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="log-out-outline" size={40} color="#DC2626" />
            </View>
            <Text style={styles.modalTitle}>Sign Out</Text>
            <Text style={styles.modalMessage}>
              Would you like to sign out?
            </Text>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={cancelLogout}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Stay Signed In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={performLogout}
                activeOpacity={0.7}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full Screen Map Modal */}
      {renderFullscreenMapModal()}

      {/* Register Visitor Modal */}
      <Modal
        visible={showVisitorModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowVisitorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New Visitor</Text>
              <TouchableOpacity onPress={() => setShowVisitorModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* ID Photo Upload Section */}
              <View style={styles.photoUploadSection}>
                <Text style={styles.inputLabel}>Visitor ID Photo *</Text>
                <TouchableOpacity 
                  style={styles.idPhotoUploadContainer}
                  onPress={() => {
                    Alert.alert(
                      "Upload ID Photo",
                      "Choose an option",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Take Photo", onPress: takeIdPhoto },
                        { text: "Choose from Gallery", onPress: pickIdImage },
                      ]
                    );
                  }}
                >
                  {newVisitor.idPhotoUri ? (
                    <Image source={{ uri: newVisitor.idPhotoUri }} style={styles.uploadedIdPhoto} />
                  ) : (
                    <View style={styles.idPhotoPlaceholder}>
                      <Ionicons name="camera-outline" size={40} color="#9CA3AF" />
                      <Text style={styles.idPhotoPlaceholderText}>Tap to upload ID photo</Text>
                      <Text style={styles.idPhotoSubtext}>JPG, PNG (Max 5MB)</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter visitor's full name"
                  placeholderTextColor="#9CA3AF"
                  value={newVisitor.fullName}
                  onChangeText={(text) => setNewVisitor({...newVisitor, fullName: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="09123456789"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={newVisitor.phoneNumber}
                  onChangeText={(text) => setNewVisitor({...newVisitor, phoneNumber: text})}
                  maxLength={16}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="visitor@email.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={newVisitor.email}
                  onChangeText={(text) => setNewVisitor({...newVisitor, email: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>ID Number *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Driver's license, Passport, etc."
                  placeholderTextColor="#9CA3AF"
                  value={newVisitor.idNumber}
                  onChangeText={(text) => setNewVisitor({...newVisitor, idNumber: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Purpose of Visit *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Meeting, Maintenance, Tour"
                  placeholderTextColor="#9CA3AF"
                  value={newVisitor.purposeOfVisit}
                  onChangeText={(text) => setNewVisitor({...newVisitor, purposeOfVisit: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Host/Department *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Who are they meeting?"
                  placeholderTextColor="#9CA3AF"
                  value={newVisitor.host}
                  onChangeText={(text) => setNewVisitor({...newVisitor, host: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Assigned Office</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Which office are they visiting?"
                  placeholderTextColor="#9CA3AF"
                  value={newVisitor.assignedOffice}
                  onChangeText={(text) => setNewVisitor({...newVisitor, assignedOffice: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Visit Date</Text>
                <TouchableOpacity 
                  style={styles.input}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text>{formatDate(newVisitor.visitDate)}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={newVisitor.visitDate}
                    mode="date"
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(false);
                      if (selectedDate) {
                        setNewVisitor({...newVisitor, visitDate: selectedDate});
                      }
                    }}
                  />
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Visit Time</Text>
                <TouchableOpacity 
                  style={styles.input}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text>{formatTime(newVisitor.visitTime)}</Text>
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={newVisitor.visitTime}
                    mode="time"
                    onChange={(event, selectedTime) => {
                      setShowTimePicker(false);
                      if (selectedTime) {
                        setNewVisitor({...newVisitor, visitTime: selectedTime});
                      }
                    }}
                  />
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vehicle Number (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ABC-1234"
                  placeholderTextColor="#9CA3AF"
                  value={newVisitor.vehicleNumber}
                  onChangeText={(text) => setNewVisitor({...newVisitor, vehicleNumber: text})}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowVisitorModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, isSubmitting && styles.buttonDisabled]}
                onPress={submitVisitor}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Register Visitor</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Visitor Detail Modal */}
      <Modal
        visible={showDetailModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.visitorDetailModalContent]}>
            <View style={[styles.modalHeader, styles.visitorDetailHeader]}>
              <View>
                <Text style={styles.modalTitle}>Visitor Profile</Text>
                <Text style={styles.visitorDetailHeaderSubtitle}>Review identity, schedule, and access status before taking action.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {selectedVisitor && (
              <ScrollView style={styles.modalBody} contentContainerStyle={styles.visitorDetailBody} showsVerticalScrollIndicator={false}>
                {selectedVisitor.status === 'checked_out' && getCompletedHistoryDaysLeft(selectedVisitor) !== null ? (
                  <View style={styles.visitorHistoryNotice}>
                    <Ionicons name="archive-outline" size={18} color="#D97706" />
                    <Text style={styles.visitorHistoryNoticeText}>
                      This visit history will remain visible for {getCompletedHistoryDaysLeft(selectedVisitor)} more day{getCompletedHistoryDaysLeft(selectedVisitor) === 1 ? '' : 's'} before it rolls off Visitor Management. The visitor account will stay active in the system.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.visitorDetailHero}>
                  <View style={styles.detailPhotoSection}>
                    {selectedVisitor.idImage ? (
                      <Image 
                        source={{ uri: selectedVisitor.idImage }} 
                        style={styles.detailIdPhoto} 
                      />
                    ) : (
                      <View style={styles.detailIdPlaceholder}>
                        <Ionicons name="id-card-outline" size={60} color="#9CA3AF" />
                        <Text style={styles.detailIdPlaceholderText}>No ID photo available</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.visitorDetailHeroCopy}>
                    <View style={styles.visitorDetailBadgeRow}>
                      <View style={[styles.visitorDetailStatusPill, { backgroundColor: getStatusBadge(selectedVisitor).bg }]}>
                        <Text style={[styles.visitorDetailStatusPillText, { color: getStatusBadge(selectedVisitor).text }]}>
                          {getStatusBadge(selectedVisitor).label}
                        </Text>
                      </View>
                      <View style={styles.visitorDetailAccessPill}>
                        <Ionicons name="shield-checkmark-outline" size={12} color="#0A3D91" />
                        <Text style={styles.visitorDetailAccessPillText}>
                          {hasApprovedVisitWindow(selectedVisitor) ? 'Cleared for access' : 'Awaiting clearance'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.detailName}>{selectedVisitor.fullName}</Text>
                    <Text style={styles.visitorDetailPurpose}>{selectedVisitor.purposeOfVisit || 'No purpose recorded'}</Text>

                    <View style={styles.visitorDetailQuickInfo}>
                      <View style={styles.visitorDetailQuickInfoCard}>
                        <Text style={styles.visitorDetailQuickInfoLabel}>Visit Date</Text>
                        <Text style={styles.visitorDetailQuickInfoValue}>{formatDate(selectedVisitor.visitDate)}</Text>
                      </View>
                      <View style={styles.visitorDetailQuickInfoCard}>
                        <Text style={styles.visitorDetailQuickInfoLabel}>Visit Time</Text>
                        <Text style={styles.visitorDetailQuickInfoValue}>{formatTime(selectedVisitor.visitTime)}</Text>
                      </View>
                      <View style={styles.visitorDetailQuickInfoCard}>
                        <Text style={styles.visitorDetailQuickInfoLabel}>Host</Text>
                        <Text style={styles.visitorDetailQuickInfoValue}>{selectedVisitor.host || 'Not assigned'}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.visitorDetailSection}>
                  <Text style={styles.visitorDetailSectionTitle}>Identity & Contact</Text>
                  <View style={styles.visitorDetailInfoGrid}>
                    <View style={styles.visitorDetailInfoCard}>
                      <Text style={styles.visitorDetailInfoLabel}>Phone</Text>
                      <Text style={styles.visitorDetailInfoValue}>{selectedVisitor.phoneNumber || 'No phone number'}</Text>
                    </View>
                    <View style={styles.visitorDetailInfoCard}>
                      <Text style={styles.visitorDetailInfoLabel}>Email</Text>
                      <Text style={styles.visitorDetailInfoValue}>{selectedVisitor.email || 'No email address'}</Text>
                    </View>
                    <View style={styles.visitorDetailInfoCard}>
                      <Text style={styles.visitorDetailInfoLabel}>ID Number</Text>
                      <Text style={styles.visitorDetailInfoValue}>{selectedVisitor.idNumber || 'No ID recorded'}</Text>
                    </View>
                    <View style={styles.visitorDetailInfoCard}>
                      <Text style={styles.visitorDetailInfoLabel}>Vehicle</Text>
                      <Text style={styles.visitorDetailInfoValue}>{selectedVisitor.vehicleNumber || 'No vehicle listed'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.visitorDetailSection}>
                  <Text style={styles.visitorDetailSectionTitle}>Visit Assignment</Text>
                  <View style={styles.visitorDetailInfoGrid}>
                    <View style={styles.visitorDetailInfoCard}>
                      <Text style={styles.visitorDetailInfoLabel}>Host / Department</Text>
                      <Text style={styles.visitorDetailInfoValue}>{selectedVisitor.host || 'Not set'}</Text>
                    </View>
                    <View style={styles.visitorDetailInfoCard}>
                      <Text style={styles.visitorDetailInfoLabel}>Assigned Office</Text>
                      <Text style={styles.visitorDetailInfoValue}>{getVisitorAssignedDestination(selectedVisitor).officeName}</Text>
                    </View>
                    <View style={styles.visitorDetailInfoCard}>
                      <Text style={styles.visitorDetailInfoLabel}>Assigned Floor</Text>
                      <Text style={styles.visitorDetailInfoValue}>{getVisitorAssignedDestination(selectedVisitor).floorLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.visitorDetailSection}>
                  <Text style={styles.visitorDetailSectionTitle}>Access Timeline</Text>
                  <View style={styles.visitorDetailTimeline}>
                    <View style={styles.visitorDetailTimelineItem}>
                      <View style={[styles.visitorDetailTimelineDot, { backgroundColor: '#1C6DD0' }]} />
                      <View style={styles.visitorDetailTimelineCopy}>
                        <Text style={styles.visitorDetailTimelineTitle}>Scheduled Arrival</Text>
                        <Text style={styles.visitorDetailTimelineText}>
                          {formatDate(selectedVisitor.visitDate)} at {formatTime(selectedVisitor.visitTime)}
                        </Text>
                      </View>
                    </View>

                    {selectedVisitor.checkedInAt ? (
                      <View style={styles.visitorDetailTimelineItem}>
                        <View style={[styles.visitorDetailTimelineDot, { backgroundColor: '#10B981' }]} />
                        <View style={styles.visitorDetailTimelineCopy}>
                          <Text style={styles.visitorDetailTimelineTitle}>Checked In</Text>
                          <Text style={styles.visitorDetailTimelineText}>{formatDateTime(selectedVisitor.checkedInAt)}</Text>
                        </View>
                      </View>
                    ) : null}

                    {selectedVisitor.checkedOutAt ? (
                      <View style={styles.visitorDetailTimelineItem}>
                        <View style={[styles.visitorDetailTimelineDot, { backgroundColor: '#DC2626' }]} />
                        <View style={styles.visitorDetailTimelineCopy}>
                          <Text style={styles.visitorDetailTimelineTitle}>Checked Out</Text>
                          <Text style={styles.visitorDetailTimelineText}>{formatDateTime(selectedVisitor.checkedOutAt)}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.detailActions}>
                  {(selectedVisitor.status === 'checked_in' || isCheckInAllowedNow(selectedVisitor)) &&
                  selectedVisitor.status !== 'checked_out' && (
                    <TouchableOpacity 
                      style={[
                        styles.detailActionButton,
                        styles.detailActionPrimary,
                        isVisitorProcessing(selectedVisitor._id) && styles.buttonDisabled,
                      ]}
                      onPress={() => {
                        setShowDetailModal(false);
                        if (selectedVisitor.status === 'checked_in') {
                          handleCheckOut(selectedVisitor);
                        } else {
                          handleCheckIn(selectedVisitor);
                        }
                      }}
                      disabled={isVisitorProcessing(selectedVisitor._id)}
                    >
                      {isVisitorProcessing(selectedVisitor._id) ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons 
                            name={selectedVisitor.status === 'checked_in' ? "log-out-outline" : "log-in-outline"} 
                            size={20} 
                            color="#FFFFFF" 
                          />
                          <Text style={styles.detailActionText}>
                            {selectedVisitor.status === 'checked_in' ? 'Release' : 'Arrived'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity 
                    style={[styles.detailActionButton, styles.detailActionDanger]}
                    onPress={() => {
                      setShowDetailModal(false);
                      handleReportVisitor(selectedVisitor);
                    }}
                  >
                    <Ionicons name="flag-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.detailActionText}>Report</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        visible={showNotificationModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNotificationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.notificationHeaderTitle}>
                <Ionicons name="notifications-outline" size={24} color="#0A3D91" />
                <Text style={styles.modalTitle}>Notifications</Text>
              </View>
              <View style={styles.notificationHeaderActions}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
                    <Text style={styles.markAllText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowNotificationModal(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <TouchableOpacity
                    key={notification._id}
                    style={[
                      styles.notificationItem,
                      !notification.read && styles.notificationUnread
                    ]}
                    onPress={() => markAsRead(notification)}
                  >
                    <View style={[
                      styles.notificationIcon,
                      { 
                        backgroundColor: 
                          notification.type === 'alert' ? '#FEE2E2' :
                          notification.type === 'visitor' ? '#EEF5FF' :
                          '#EEF5FF'
                      }
                    ]}>
                      <Ionicons 
                        name={
                          notification.type === 'alert' ? "warning" :
                          notification.type === 'visitor' ? "person-add" :
                          "checkmark-circle"
                        }
                        size={20}
                        color={
                          notification.type === 'alert' ? "#DC2626" :
                          notification.type === 'visitor' ? "#0A3D91" :
                          "#0A3D91"
                        }
                      />
                    </View>
                    <View style={styles.notificationContent}>
                      <View style={styles.notificationHeader}>
                        <Text style={styles.notificationTitle}>
                          {notification.title}
                        </Text>
                        {!notification.read && (
                          <View style={styles.unreadDot} />
                        )}
                      </View>
                      <Text style={styles.notificationMessage}>
                        {notification.message}
                      </Text>
                      <Text style={styles.notificationTime}>
                        {formatTime(notification.createdAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyNotifications}>
                  <Ionicons name="notifications-off-outline" size={48} color="#E5E7EB" />
                  <Text style={styles.emptyText}>No notifications</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const securityMobileStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND.page,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 22,
  },
  header: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "#041E42",
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#BAE6FD",
    textTransform: "uppercase",
  },
  headerTitle: {
    marginTop: 6,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: "#DCEBFF",
  },
  headerStatusPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  headerStatusText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerStats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 15,
  },
  headerStatItem: {
    flex: 1,
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 9,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  headerStatValue: {
    fontSize: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerStatLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "900",
    color: "#BAE6FD",
    textTransform: "uppercase",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  dotBadge: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND.danger,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  statusCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
  },
  statusCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusCardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: BRAND.ink,
  },
  statusCardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: BRAND.muted,
  },
  statusCardCount: {
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 8,
    backgroundColor: "#F8FBFE",
  },
  statusCardCountText: {
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.blue,
  },
  statusCardCountLabel: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  statusGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statusMetricCard: {
    flex: 1,
    minHeight: 116,
    borderRadius: 18,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statusMetricIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  statusMetricValue: {
    fontSize: 22,
    fontWeight: "900",
    color: BRAND.ink,
  },
  statusMetricLabel: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.ink,
  },
  statusMetricHelper: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: BRAND.muted,
  },
  focusPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  focusIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  focusCopy: {
    flex: 1,
    minWidth: 0,
  },
  focusTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  focusText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: BRAND.muted,
  },
  focusAction: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#EEF5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  focusActionText: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.blue,
  },
  quickActions: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 12,
  },
  quickAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5F1",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  quickActionPrimary: {
    backgroundColor: BRAND.blue,
    borderColor: BRAND.blue,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.ink,
  },
  quickActionPrimaryText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  simpleAlertCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 17,
    backgroundColor: "#FFF7F7",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 12,
  },
  simpleAlertCopy: {
    flex: 1,
  },
  simpleAlertTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  simpleAlertText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
    color: BRAND.muted,
  },
  viewAllButton: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#DCE5F1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  viewAllButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.blue,
  },
  notReadySection: {
    marginTop: 12,
    marginBottom: 8,
  },
  notReadyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  notReadyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EEF2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  notReadyCopy: {
    flex: 1,
    minWidth: 0,
  },
  notReadyName: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  notReadyReason: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  toolbar: {
    gap: 10,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.ink,
  },
  sectionCount: {
    minWidth: 30,
    textAlign: "center",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#EEF5FF",
    color: BRAND.blue,
    fontSize: 12,
    fontWeight: "900",
  },
  compactHeader: {
    borderRadius: 22,
    padding: 17,
    backgroundColor: "#041E42",
    borderWidth: 1,
    borderColor: "#041E42",
    marginBottom: 12,
  },
  compactTitle: {
    fontSize: 23,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  compactSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#DCEBFF",
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  profileHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileEditButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  profileEditButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.blue,
  },
  visitorCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  visitorTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  visitorIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },
  visitorCopy: {
    flex: 1,
    minWidth: 0,
  },
  visitorName: {
    fontSize: 16,
    fontWeight: "900",
    color: BRAND.ink,
  },
  visitorMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: BRAND.muted,
  },
  visitorPurpose: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  visitorChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 11,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F8FBFE",
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  visitorActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  visitorActionPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: BRAND.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  visitorActionPrimaryText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  visitorActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  compactVisitorActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  releaseButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: BRAND.success,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  releaseButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  compactCheckInButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#DCE5F1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  compactCheckInButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.blue,
  },
  compactBlockedStatus: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    paddingHorizontal: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  compactBlockedStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  compactDetailsButton: {
    minWidth: 84,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FBFE",
  },
  compactDetailsButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#475569",
  },
  disabled: {
    opacity: 0.5,
  },
  feedList: {
    marginTop: 12,
  },
  logToolbar: {
    gap: 10,
  },
  mobileMapCard: {
    marginTop: 12,
    marginBottom: 14,
  },
  mobileMapContainer: {
    borderRadius: 18,
    padding: 12,
  },
  mobileMapWrapper: {
    borderRadius: 16,
    minHeight: 620,
  },
  mapUpdatedText: {
    marginTop: -2,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: BRAND.muted,
  },
  mapActionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  mapActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE5F1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  mapActionButtonPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: BRAND.blue,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  mapActionButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.ink,
  },
  mapActionButtonPrimaryText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  logCard: {
    flexDirection: "row",
    gap: 10,
    padding: 13,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  logIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FBFE",
  },
  logCopy: {
    flex: 1,
    minWidth: 0,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  logMessage: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  logTime: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
  },
  logFooterNote: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: BRAND.muted,
    textAlign: "center",
  },
  alertCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 10,
  },
  alertTop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  alertCopy: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: BRAND.ink,
  },
  alertMessage: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  alertTime: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
  },
  resolveButton: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  resolveButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.danger,
  },
  reportPickCard: {
    padding: 13,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  reportPickCardActive: {
    borderColor: BRAND.blue,
    backgroundColor: "#EEF5FF",
  },
  reportPickName: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  reportPickMeta: {
    marginTop: 4,
    fontSize: 12,
    color: BRAND.muted,
  },
  reportInput: {
    minHeight: 108,
    textAlignVertical: "top",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE5F1",
    backgroundColor: "#FFFFFF",
    padding: 13,
    fontSize: 14,
    color: BRAND.ink,
    marginTop: 6,
  },
  submitReportButton: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: BRAND.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  submitReportButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  locationCard: {
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  locationCardAlert: {
    borderColor: "#FECACA",
    backgroundColor: "#FFF7F7",
  },
  locationPin: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.blue,
  },
  locationCopy: {
    flex: 1,
  },
  locationName: {
    fontSize: 15,
    fontWeight: "900",
    color: BRAND.ink,
  },
  locationMeta: {
    marginTop: 4,
    fontSize: 12,
    color: BRAND.muted,
  },
  locationFreshness: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.success,
  },
  profileCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  profileAvatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#041E42",
    overflow: "visible",
  },
  profileAvatarImage: {
    width: 58,
    height: 58,
    borderRadius: 20,
  },
  profileAvatarText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  profileCameraBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileCopy: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.ink,
  },
  profileRole: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  profileRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
  },
  profileFormGrid: {
    gap: 12,
    paddingTop: 4,
  },
  profileField: {
    gap: 6,
  },
  profileLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  profileInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE5F1",
    backgroundColor: "#F8FBFE",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.ink,
  },
  profileValue: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "800",
    color: BRAND.ink,
  },
  saveProfileButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: BRAND.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveProfileButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  logoutButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.danger,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  detailSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: BRAND.ink,
  },
  detailSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: BRAND.muted,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  detailBody: {
    paddingBottom: 20,
  },
  detailRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  detailValue: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    color: BRAND.ink,
  },
  detailActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  detailPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: BRAND.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  detailPrimaryButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  detailDangerButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  detailDangerButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.danger,
  },
  darkSafeArea: {
    backgroundColor: "#07111F",
  },
  darkCard: {
    backgroundColor: "#0F172A",
    borderColor: "#243244",
  },
  darkPill: {
    backgroundColor: "#18243A",
    borderColor: "#334155",
  },
  darkPrimaryText: {
    color: "#F8FAFC",
  },
  darkMutedText: {
    color: "#CBD5E1",
  },
});
