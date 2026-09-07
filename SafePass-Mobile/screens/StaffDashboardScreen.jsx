import Alert from '../utils/Alert';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Platform,
  AppState,
  StatusBar,
  LayoutAnimation,
  UIManager,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import ApiService from "../utils/ApiService";
import {
  formatSafePassDate,
  formatSafePassDateTime,
  formatSafePassTime,
} from "../utils/dateTimeUtils";
import { printRecordsTable } from "../utils/printUtils";
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
import ToastNotice from "../components/shared/ToastNotice";
import styles from "../styles/StaffDashboardStyles";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SMART_REFRESH_MIN_INTERVAL_MS = 30000;

const isSafePassConnectionError = (error) =>
  Boolean(error?.isSafePassConnectionError) ||
  String(error?.code || "") === "SAFEPASS_CONNECTION_ERROR" ||
  String(error?.message || "").includes("Cannot connect to the SafePass server") ||
  String(error?.message || "").includes("Network request failed");

const SidebarHoverPressable = ({
  children,
  style,
  hoverScale = 1.035,
  hoverLift = 0,
  onPress,
  disabled,
  ...props
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;

  const animateHover = useCallback((scaleValue, liftValue) => {
    if (Platform.OS !== "web") return;
    Animated.parallel([
      Animated.spring(scale, {
        toValue: scaleValue,
        useNativeDriver: false,
        tension: 180,
        friction: 12,
      }),
      Animated.spring(lift, {
        toValue: liftValue,
        useNativeDriver: false,
        tension: 180,
        friction: 12,
      }),
    ]).start();
  }, [lift, scale]);

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => animateHover(hoverScale, hoverLift)}
      onHoverOut={() => animateHover(1, 0)}
      onMouseEnter={() => animateHover(hoverScale, hoverLift)}
      onMouseLeave={() => animateHover(1, 0)}
      style={[
        style,
        Platform.OS === "web" && styles.sidebarHoverSurface,
        Platform.OS === "web" && !onPress && styles.passiveHoverSurface,
        { transform: [{ translateY: lift }, { scale }] },
        disabled && { opacity: 0.7 },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
};

const HomeHoverPressable = ({ children, style, hoverScale = 1.018, hoverLift = -4, ...props }) => (
  <SidebarHoverPressable
    {...props}
    style={style}
    hoverScale={hoverScale}
    hoverLift={hoverLift}
  >
    {children}
  </SidebarHoverPressable>
);

const formatDate = (value) =>
  formatSafePassDate(value);

const formatTime = (value) =>
  formatSafePassTime(value);

const formatDateTime = (value) =>
  formatSafePassDateTime(value);

const formatRelativeTime = (value) => {
  if (!value) return "No timestamp";

  const now = new Date();
  const target = new Date(value);
  const diffMs = now.getTime() - target.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} min ago`;
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))} hr ago`;
  if (diffMs < day * 7) return `${Math.max(1, Math.floor(diffMs / day))} day${Math.floor(diffMs / day) > 1 ? "s" : ""} ago`;
  return formatDate(value);
};

const getNotificationMeta = (notification) => {
  const activityType = String(notification?.metadata?.activityType || "").toLowerCase();

  if (activityType.includes("appointment_request")) {
    return { label: "New Request", icon: "mail-unread-outline", accent: "#0A3D91" };
  }
  if (activityType.includes("approved_appointment")) {
    return { label: "Approved", icon: "checkmark-circle-outline", accent: "#047857" };
  }
  if (activityType.includes("adjusted_appointment")) {
    return { label: "Adjusted", icon: "create-outline", accent: "#D97706" };
  }
  if (activityType.includes("rejected_appointment")) {
    return { label: "Rejected", icon: "close-circle-outline", accent: "#DC2626" };
  }
  if (activityType.includes("appointment_no_show") || activityType.includes("no_show")) {
    return { label: "No Show", icon: "alert-circle-outline", accent: "#B45309" };
  }
  if (activityType.includes("completed_appointment")) {
    return { label: "Completed", icon: "flag-outline", accent: "#475569" };
  }

  return { label: "Update", icon: "notifications-outline", accent: "#7C3AED" };
};

const getStatusMeta = (status) => {
  switch (status) {
    case "approved":
      return { color: "#0A3D91", background: "#EEF5FF", label: "Approved" };
    case "adjusted":
      return { color: "#D97706", background: "#FEF3C7", label: "Adjusted" };
    case "adjustment_pending":
      return { color: "#7C3AED", background: "#F3E8FF", label: "Waiting Visitor" };
    case "rescheduled":
      return { color: "#D97706", background: "#FEF3C7", label: "Rescheduled" };
    case "cancelled":
      return { color: "#64748B", background: "#F1F5F9", label: "Cancelled" };
    case "expired":
      return { color: "#DC2626", background: "#FEE2E2", label: "Expired" };
    case "no_show":
      return { color: "#B45309", background: "#FEF3C7", label: "No Show" };
    case "rejected":
      return { color: "#DC2626", background: "#FEE2E2", label: "Rejected" };
    case "completed":
      return { color: "#475569", background: "#E2E8F0", label: "Completed" };
    default:
      return { color: "#0A3D91", background: "#EEF5FF", label: "Pending" };
  }
};

const getAppointmentStatus = (appointment) => {
  if (!appointment) return "pending";
  if (appointment.appointmentCompletedAt) return "completed";
  if (appointment.status === "checked_out") return "completed";
  if (appointment.status === "expired") return "expired";
  if (appointment.status === "no_show") return "no_show";
  return String(appointment.appointmentStatus || "pending").toLowerCase();
};

const getStaffActionHint = (appointment) => {
  const status = getAppointmentStatus(appointment);
  if (isActiveStaffVisit(appointment)) return "Manage the active visit: mark done or redirect";
  if (status === "pending") return "Appointment request needs approval, adjustment, redirect, or rejection";
  if (status === "rescheduled") return "Visitor requested a new schedule. Review before approval";
  if (status === "adjustment_pending") return "Waiting for visitor confirmation";
  if (status === "approved" || status === "adjusted") return "Approved and ready for security check-in";
  if (status === "completed") return "Visit completed by staff";
  if (status === "rejected") return "Request declined with reason";
  if (status === "no_show") return "Visitor did not arrive";
  return getStatusMeta(status).label;
};

const isActionableAppointmentRequest = (appointment) =>
  ["pending", "rescheduled"].includes(getAppointmentStatus(appointment)) &&
  !appointment?.checkedInAt &&
  !appointment?.checkedOutAt;

const isActiveStaffVisit = (appointment) =>
  appointment?.status === "checked_in" &&
  !appointment?.checkedOutAt &&
  !appointment?.appointmentCompletedAt;

const getStaffVisitPhase = (appointment) => {
  if (isActiveStaffVisit(appointment)) {
    const currentOffice = appointment?.currentLocation?.office;
    const expectedOffice =
      appointment?.currentDestination?.office ||
      appointment?.appointmentDepartment ||
      appointment?.assignedOffice ||
      "assigned office";
    return {
      label: currentOffice ? "Visitor in office" : "Visitor checked in",
      detail: currentOffice
        ? `${currentOffice} is the latest checkpoint. Expected destination: ${expectedOffice}.`
        : `Security checked this visitor in. Wait for the office tap, then mark Done or Redirect if needed.`,
      icon: currentOffice ? "business-outline" : "log-in-outline",
      color: "#047857",
    };
  }

  const status = getAppointmentStatus(appointment);
  if (["pending", "rescheduled"].includes(status)) {
    return {
      label: "Appointment request",
      detail: "Use Approve, Adjust, Redirect, or Reject before the visitor can enter.",
      icon: "mail-unread-outline",
      color: "#D97706",
    };
  }
  if (["approved", "adjusted"].includes(status)) {
    return {
      label: "Ready for security",
      detail: "The visitor is approved. Security will check them in when they arrive.",
      icon: "shield-checkmark-outline",
      color: "#0A3D91",
    };
  }
  if (status === "adjustment_pending") {
    return {
      label: "Waiting for visitor",
      detail: "The visitor must confirm the adjusted schedule before entry.",
      icon: "help-circle-outline",
      color: "#7C3AED",
    };
  }
  if (status === "completed") {
    return {
      label: "Visit completed",
      detail: "This appointment is closed and kept for records.",
      icon: "checkmark-done-outline",
      color: "#475569",
    };
  }
  return {
    label: getStatusMeta(status).label,
    detail: getStaffActionHint(appointment),
    icon: "information-circle-outline",
    color: getStatusMeta(status).color,
  };
};

const matchesAppointmentSearch = (appointment, searchTerm) => {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
  if (!normalizedSearch) return true;

  const searchableParts = [
    appointment?.fullName,
    appointment?.email,
    appointment?.purposeOfVisit,
    appointment?.appointmentDepartment,
    appointment?.assignedOffice,
    appointment?.assignedStaffName,
    formatDate(appointment?.visitDate),
    formatTime(appointment?.visitTime),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return searchableParts.some((value) => value.includes(normalizedSearch));
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

const compareAppointmentsBySchedule = (left, right) => {
  const dateDifference = getAppointmentDateSortValue(left) - getAppointmentDateSortValue(right);
  if (dateDifference !== 0) return dateDifference;

  const timeDifference = getAppointmentTimeSortValue(left) - getAppointmentTimeSortValue(right);
  if (timeDifference !== 0) return timeDifference;

  return String(left?._id || "").localeCompare(String(right?._id || ""));
};

const isOverdueAppointmentRequest = (appointment, referenceDate = new Date()) => {
  if (!isActionableAppointmentRequest(appointment) || !appointment?.visitDate) return false;

  const scheduledAt = new Date(appointment.visitDate);
  if (Number.isNaN(scheduledAt.getTime())) return false;

  const visitTime = appointment?.visitTime ? new Date(appointment.visitTime) : null;
  if (visitTime && !Number.isNaN(visitTime.getTime())) {
    scheduledAt.setHours(visitTime.getHours(), visitTime.getMinutes(), 0, 0);
  } else {
    scheduledAt.setHours(23, 59, 59, 999);
  }

  return scheduledAt.getTime() < referenceDate.getTime();
};

const compareRequestsByPriority = (left, right) => {
  const leftOverdue = isOverdueAppointmentRequest(left);
  const rightOverdue = isOverdueAppointmentRequest(right);
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

  const leftRescheduled = getAppointmentStatus(left) === "rescheduled";
  const rightRescheduled = getAppointmentStatus(right) === "rescheduled";
  if (leftRescheduled !== rightRescheduled) return leftRescheduled ? -1 : 1;

  return compareAppointmentsBySchedule(left, right);
};

const getAppointmentLatestSortValue = (appointment) => {
  const scheduleValue =
    appointment?.visitTime ||
    appointment?.visitDate ||
    appointment?.appointmentRequestedAt ||
    appointment?.updatedAt ||
    appointment?.createdAt;
  const date = scheduleValue ? new Date(scheduleValue) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const compareAppointmentsByLatestSchedule = (left, right) => {
  const dateDifference = getAppointmentLatestSortValue(right) - getAppointmentLatestSortValue(left);
  if (dateDifference !== 0) return dateDifference;

  return String(right?._id || "").localeCompare(String(left?._id || ""));
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
    .sort(([leftKey], [rightKey]) => rightKey.localeCompare(leftKey))
    .map(([dateKey, entries]) => ({
      dateKey,
      label:
        dateKey === "unscheduled"
          ? "Schedule pending"
          : formatDate(entries[0]?.visitDate || entries[0]?.visitTime),
      entries: [...entries].sort(compareAppointmentsByLatestSchedule),
    }));
};

const isSameCalendarDay = (value, referenceDate = new Date()) => {
  if (!value) return false;
  const target = new Date(value);
  return (
    target.getFullYear() === referenceDate.getFullYear() &&
    target.getMonth() === referenceDate.getMonth() &&
    target.getDate() === referenceDate.getDate()
  );
};

const isWithinCurrentWeek = (value, referenceDate = new Date()) => {
  if (!value) return false;
  const target = new Date(value);
  const startOfWeek = new Date(referenceDate);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return target >= startOfWeek && target < endOfWeek;
};

const staffMobileTabs = [
  { key: "dashboard", label: "Home", icon: "briefcase-outline", activeIcon: "briefcase" },
  { key: "requests", label: "Requests", icon: "mail-unread-outline", activeIcon: "mail-unread" },
  { key: "visitors", label: "Visitors", icon: "people-outline", activeIcon: "people" },
  { key: "history", label: "History", icon: "archive-outline", activeIcon: "archive" },
  { key: "profile", label: "Profile", icon: "person-outline", activeIcon: "person" },
];

const requestFilterOptions = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "this-week", label: "This Week" },
];

const historyFilterOptions = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "adjusted", label: "Adjusted" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
  { key: "no_show", label: "No Show" },
  { key: "expired", label: "Expired" },
];

const staffRedirectDestinations = [
  "Registrar",
  "Accounting",
  "Cashier",
  "Administration",
  "Information Desk",
  "Guidance",
  "Faculty Room",
  "I.T Room",
  "Laboratory",
  "Library",
];

export default function StaffDashboardScreen({ navigation, onLogout }) {
  const { width: viewportWidth } = useWindowDimensions();
  const isPhoneLayout = viewportWidth < 768;
  const [user, setUser] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [mobileTab, setMobileTab] = useState("dashboard");
  const [mobileDarkModeEnabled, setMobileDarkModeEnabled] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [expandedModule, setExpandedModule] = useState("home");
  const [selectedSubmodule, setSelectedSubmodule] = useState("home");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [accountMode, setAccountMode] = useState("view");
  const [requestFilter, setRequestFilter] = useState("all");
  const [requestSort, setRequestSort] = useState("priority");
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const [recordSearchTerm, setRecordSearchTerm] = useState("");
  const [recordFilterDropdownOpen, setRecordFilterDropdownOpen] = useState(null);
  const [requestPage, setRequestPage] = useState(1);
  const [recordPage, setRecordPage] = useState(1);
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    phone: "",
    profilePhoto: null,
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [attendanceTapLoading, setAttendanceTapLoading] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [detailAppointment, setDetailAppointment] = useState(null);
  const [toast, setToast] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });
  const smartRefreshAtRef = useRef(0);

  const loadStaffThemePreference = useCallback(async () => {
    try {
      const savedDarkMode =
        Platform.OS === "web" && typeof window !== "undefined" && window.localStorage
          ? window.localStorage.getItem("darkModeEnabled")
          : typeof AsyncStorage?.getItem === "function"
            ? await AsyncStorage.getItem("darkModeEnabled")
            : null;
      setMobileDarkModeEnabled(savedDarkMode === "true");
    } catch (error) {
      console.log("Staff dark mode preference unavailable:", error?.message || error);
    }
  }, []);

  useEffect(() => {
    loadStaffThemePreference();

    const unsubscribeNavigationFocus = navigation?.addListener?.("focus", loadStaffThemePreference);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const handleWindowFocus = () => loadStaffThemePreference();
      const handleStorageChange = (event) => {
        if (!event?.key || event.key === "darkModeEnabled") {
          loadStaffThemePreference();
        }
      };
      window.addEventListener("focus", handleWindowFocus);
      window.addEventListener("storage", handleStorageChange);
      return () => {
        unsubscribeNavigationFocus?.();
        window.removeEventListener("focus", handleWindowFocus);
        window.removeEventListener("storage", handleStorageChange);
      };
    }

    return () => unsubscribeNavigationFocus?.();
  }, [loadStaffThemePreference, navigation]);
  const itemsPerPage = 5;

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRedirectAppointmentModal, setShowRedirectAppointmentModal] = useState(false);
  const [showVisitManagementModal, setShowVisitManagementModal] = useState(false);
  const [adjustedDate, setAdjustedDate] = useState(new Date());
  const [adjustedTime, setAdjustedTime] = useState(new Date());
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [redirectAppointmentOffice, setRedirectAppointmentOffice] = useState("");
  const [redirectAppointmentNote, setRedirectAppointmentNote] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const contentScrollRef = useRef(null);
  const webDateInputRef = useRef(null);
  const webTimeInputRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      setLoadError("");
      const cachedUser = await ApiService.getCurrentUser();
      const cachedRole = String(cachedUser?.role || "").toLowerCase();
      if (cachedUser && cachedRole === "staff") {
        setUser(cachedUser);
        setLoading(false);
      }

      const profilePromise = ApiService.getProfile();
      const appointmentPromise = ApiService.getStaffAppointments({ status: "all", limit: 200 });

      const appointmentResponse = await appointmentPromise;
      setAppointments(appointmentResponse?.appointments || []);
      setLoading(false);

      const profile = await profilePromise;
      const currentUser = profile?.user || cachedUser;
      const currentRole = String(currentUser?.role || "").toLowerCase();
      if (!currentUser || currentRole !== "staff") {
        Alert.alert("Access Denied", "This screen is for staff accounts only.");
        navigation.replace("Login");
        return;
      }

      setUser(currentUser);

      const [notificationResponse, attendanceResponse] = await Promise.allSettled([
        ApiService.getNotifications({ limit: 20 }),
        ApiService.getMyAttendance({ limit: 10 }),
      ]);

      if (notificationResponse.status === "fulfilled") {
        setNotifications(notificationResponse.value?.notifications || []);
      } else {
        if (!isSafePassConnectionError(notificationResponse.reason)) {
          console.error("Staff notifications error:", notificationResponse.reason);
        }
        setNotifications([]);
      }

      if (attendanceResponse.status === "fulfilled") {
        setAttendance(Array.isArray(attendanceResponse.value?.attendance) ? attendanceResponse.value.attendance : []);
      } else {
        if (!isSafePassConnectionError(attendanceResponse.reason)) {
          console.error("Staff attendance error:", attendanceResponse.reason);
        }
        setAttendance([]);
      }
      setLoadError("");
    } catch (error) {
      if (!isSafePassConnectionError(error)) {
        console.error("Load staff dashboard error:", error);
      }
      setLoadError(error?.message || "Failed to load staff dashboard.");
      if (isSafePassConnectionError(error)) {
        return;
      } else {
        Alert.alert("Error", error?.message || "Failed to load staff dashboard.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const smartRefreshStaffData = useCallback(() => {
    const now = Date.now();
    if (now - smartRefreshAtRef.current < SMART_REFRESH_MIN_INTERVAL_MS) return;
    smartRefreshAtRef.current = now;
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubscribeNavigationFocus = navigation?.addListener?.("focus", smartRefreshStaffData);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        smartRefreshStaffData();
      }
    });

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("focus", smartRefreshStaffData);
      return () => {
        unsubscribeNavigationFocus?.();
        appStateSubscription?.remove?.();
        window.removeEventListener("focus", smartRefreshStaffData);
      };
    }

    return () => {
      unsubscribeNavigationFocus?.();
      appStateSubscription?.remove?.();
    };
  }, [navigation, smartRefreshStaffData]);

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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const showStaffToast = useCallback((nextToast) => {
    setToast({
      visible: true,
      type: nextToast.type || "info",
      title: nextToast.title || "SafePass",
      message: nextToast.message || "",
    });
  }, []);

  const closeStaffToast = useCallback(() => {
    setToast((currentToast) => ({ ...currentToast, visible: false }));
  }, []);

  const handleStaffAttendanceTap = async (action) => {
    if (attendanceTapLoading) return;

    setAttendanceTapLoading(action);
    try {
      const response = await ApiService.submitMyAttendanceTap({
        action,
        source: "virtual_nfc_card",
        nfcCardId: user?.phoneNfcUid || user?.safePassId || user?.physicalNfcUid || user?.nfcCardId,
        office: "Staff Virtual NFC Card",
        floor: "Mobile",
        checkpointId: "staff-virtual-nfc",
      });

      if (response?.attendance) {
        setAttendance((currentRecords) => [
          response.attendance,
          ...currentRecords.filter((record) => String(record._id) !== String(response.attendance._id)),
        ]);
      }

      await loadData();
      showStaffToast({
        type: "success",
        title: action === "check_in" ? "Checked In" : "Checked Out",
        message: response?.message || "Your staff attendance was recorded.",
      });
    } catch (error) {
      Alert.alert("NFC Card Error", error?.message || "Unable to record your staff attendance.");
    } finally {
      setAttendanceTapLoading("");
    }
  };

  const isNotificationRead = useCallback(
    (notification) =>
      Array.isArray(notification?.readBy) &&
      notification.readBy.some((entry) => String(entry?.user) === String(user?._id)),
    [user?._id],
  );

  const appointmentRequests = useMemo(
    () => appointments.filter((item) => isActionableAppointmentRequest(item)),
    [appointments],
  );

  const filteredRequestSource = useMemo(() => {
    let nextAppointments = appointmentRequests;

    if (requestFilter === "today") {
      nextAppointments = appointmentRequests.filter((item) => isSameCalendarDay(item.visitDate));
    } else if (requestFilter === "this-week") {
      nextAppointments = appointmentRequests.filter((item) => isWithinCurrentWeek(item.visitDate));
    } else if (requestFilter === "overdue") {
      nextAppointments = appointmentRequests.filter((item) => isOverdueAppointmentRequest(item));
    }

    return nextAppointments;
  }, [appointmentRequests, requestFilter]);

  const filteredRequestAppointments = useMemo(
    () => filteredRequestSource.filter((item) => matchesAppointmentSearch(item, requestSearchTerm)),
    [filteredRequestSource, requestSearchTerm],
  );

  const appointmentRecords = useMemo(
    () =>
      appointments
        .filter((item) =>
          ["approved", "adjusted", "adjustment_pending", "completed", "rejected", "cancelled", "expired", "no_show"].includes(getAppointmentStatus(item)),
        )
        .sort(compareAppointmentsByLatestSchedule),
    [appointments],
  );

  const filteredAppointments = useMemo(() => {
    let nextAppointments = appointmentRecords;

    if (filter === "completed") {
      nextAppointments = appointmentRecords.filter((item) => getAppointmentStatus(item) === "completed");
    } else if (filter === "approved") {
      nextAppointments = appointmentRecords.filter((item) =>
        getAppointmentStatus(item) === "approved",
      );
    } else if (filter === "adjusted") {
      nextAppointments = appointmentRecords.filter((item) =>
        getAppointmentStatus(item) === "adjusted",
      );
    } else if (filter === "rejected") {
      nextAppointments = appointmentRecords.filter((item) =>
        getAppointmentStatus(item) === "rejected",
      );
    } else if (filter !== "all") {
      nextAppointments = appointmentRecords.filter((item) => getAppointmentStatus(item) === filter);
    }

    return nextAppointments
      .filter((item) => matchesAppointmentSearch(item, recordSearchTerm))
      .sort(compareAppointmentsByLatestSchedule);
  }, [appointmentRecords, filter, recordSearchTerm]);

  const mobileHistoryAppointments = useMemo(
    () => [...filteredAppointments].sort(compareAppointmentsByLatestSchedule),
    [filteredAppointments],
  );

  const stats = useMemo(
    () => ({
      pending: appointmentRequests.length,
      approved: appointmentRecords.filter((item) => getAppointmentStatus(item) === "approved").length,
      adjusted: appointmentRecords.filter((item) => getAppointmentStatus(item) === "adjusted").length,
      rejected: appointmentRecords.filter((item) => getAppointmentStatus(item) === "rejected").length,
      completed: appointmentRecords.filter((item) => getAppointmentStatus(item) === "completed").length,
    }),
    [appointmentRecords, appointmentRequests.length],
  );

  const profileName = useMemo(() => {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return fullName || user?.fullName || user?.username || "Staff User";
  }, [user]);

  const profileInitials = useMemo(() => {
    const nameParts = profileName.split(" ").filter(Boolean);
    return (
      (nameParts[0]?.[0] || user?.firstName?.[0] || "S") +
      (nameParts[1]?.[0] || user?.lastName?.[0] || "T")
    ).toUpperCase();
  }, [profileName, user]);

  const unreadNotificationsCount = useMemo(
    () => (notifications || []).filter((item) => !isNotificationRead(item)).length,
    [notifications, isNotificationRead],
  );

  const staffMobileNavTabs = useMemo(
    () =>
      staffMobileTabs.map((tab) => {
        if (tab.key === "requests") return { ...tab, badge: stats.pending };
        return tab;
      }),
    [stats.pending],
  );

  const latestAttendanceRecord = attendance[0] || null;
  const isStaffCheckedIn = Boolean(
    latestAttendanceRecord?.checkInTime && !latestAttendanceRecord?.checkOutTime,
  );

  const checkedInNowCount = useMemo(
    () =>
      appointments.filter((item) => item?.checkedInAt && !item?.checkedOutAt).length,
    [appointments],
  );

  const activeStaffVisits = useMemo(
    () =>
      appointments
        .filter((item) => isActiveStaffVisit(item))
        .sort(
          (firstItem, secondItem) =>
            new Date(secondItem.checkedInAt || secondItem.updatedAt || 0) -
            new Date(firstItem.checkedInAt || firstItem.updatedAt || 0),
        ),
    [appointments],
  );

  const nextUpcomingAppointment = useMemo(() => {
    const now = new Date();

    return appointments
      .filter((item) => {
        const status = getAppointmentStatus(item);
        if (!["approved", "adjusted"].includes(status)) return false;
        if (!item?.visitDate) return false;
        const appointmentDate = new Date(item.visitDate);
        return appointmentDate >= now;
      })
      .sort((firstItem, secondItem) => new Date(firstItem.visitDate) - new Date(secondItem.visitDate))[0] || null;
  }, [appointments]);

  const todaysSchedule = useMemo(
    () =>
      appointments
        .filter((item) => {
          const status = getAppointmentStatus(item);
          return ["approved", "adjusted"].includes(status) && isSameCalendarDay(item.visitDate);
        })
        .sort((firstItem, secondItem) => new Date(firstItem.visitDate) - new Date(secondItem.visitDate))
        .slice(0, 4),
    [appointments],
  );

  const staffMobileFocusState = useMemo(() => {
    if (stats.pending > 0) {
      return {
        title: "Requests need review",
        message: `${stats.pending} appointment request${stats.pending === 1 ? "" : "s"} waiting for action.`,
        icon: "mail-unread-outline",
        color: BRAND.warning,
        actionLabel: "Review",
        targetTab: "requests",
      };
    }

    if (checkedInNowCount > 0) {
      return {
        title: "Visitors currently inside",
        message: `${checkedInNowCount} visitor${checkedInNowCount === 1 ? "" : "s"} checked in for your office.`,
        icon: "walk-outline",
        color: BRAND.success,
        actionLabel: "View",
        targetTab: "visitors",
      };
    }

    return {
      title: "Office queue is clear",
      message: nextUpcomingAppointment
        ? `Next visitor: ${nextUpcomingAppointment.fullName || "Visitor"} at ${formatTime(nextUpcomingAppointment.visitTime || nextUpcomingAppointment.visitDate)}.`
        : "No urgent staff actions right now.",
      icon: "checkmark-circle-outline",
      color: BRAND.success,
      actionLabel: "Schedule",
      targetTab: "visitors",
    };
  }, [checkedInNowCount, nextUpcomingAppointment, stats.pending]);

  useEffect(() => {
    setProfileForm({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      username: user?.username || "",
      phone: user?.phone || user?.phoneNumber || user?.contactNumber || "",
      profilePhoto: user?.profilePhoto || null,
    });
  }, [user]);

  useEffect(() => {
    setRequestPage(1);
  }, [requestFilter, requestSearchTerm, requestSort]);

  useEffect(() => {
    setRecordPage(1);
  }, [filter, recordSearchTerm]);

  const paginatedRequestAppointments = useMemo(() => {
    const startIndex = (requestPage - 1) * itemsPerPage;
    return [...filteredRequestAppointments]
      .sort(requestSort === "priority" ? compareRequestsByPriority : compareAppointmentsBySchedule)
      .slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRequestAppointments, requestPage, requestSort]);

  const paginatedRecordAppointments = useMemo(() => {
    const startIndex = (recordPage - 1) * itemsPerPage;
    return [...filteredAppointments]
      .sort(compareAppointmentsBySchedule)
      .slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAppointments, recordPage]);

  const requestPageCount = Math.max(1, Math.ceil(filteredRequestAppointments.length / itemsPerPage));
  const recordPageCount = Math.max(1, Math.ceil(filteredAppointments.length / itemsPerPage));

  const staffModules = useMemo(
    () => [
      {
        key: "home",
        label: "Home",
        icon: "home-outline",
        color: "#0A3D91",
        submodules: [],
      },
      {
        key: "appointment",
        label: "Appointment",
        icon: "calendar-outline",
        color: "#0A3D91",
        submodules: [
          { key: "appointment-request", label: "Appointment Request", badge: stats.pending },
          { key: "active-visits", label: "Active Visits", badge: activeStaffVisits.length },
          { key: "appointment-record", label: "Appointment Record", badge: appointmentRecords.length },
        ],
      },
      {
        key: "account",
        label: "Account Management",
        icon: "person-circle-outline",
        color: "#1C6DD0",
        submodules: [{ key: "account-info", label: "My Profile", badge: 0 }],
      },
    ],
    [activeStaffVisits.length, appointmentRecords.length, stats.pending],
  );

  const getSelectedSubmoduleMeta = () => {
    switch (selectedSubmodule) {
      case "appointment-request":
        return {
          title: "Appointment Request",
          subtitle: "Review and act on new visitor appointment requests assigned to your office in a cleaner table view.",
        };
      case "appointment-record":
        return {
          title: "Appointment Record",
          subtitle: "Browse appointment history, statuses, and visitor scheduling details in one organized table.",
        };
      case "active-visits":
        return {
          title: "Active Visits",
          subtitle: "Manage checked-in visitors assigned to your office, then mark them done or redirect them.",
        };
      case "account-info":
        return {
          title: "My Profile",
          subtitle: "View or update your own staff profile details and account security settings.",
        };
      case "home":
      default:
        return {
          title: "Staff Home",
          subtitle: "Track pending requests, recent updates, and your office activity in one place.",
        };
    }
  };

  const getParentModule = (submoduleKey) =>
    staffModules.find((module) =>
      module.submodules.some((submodule) => submodule.key === submoduleKey),
    )?.key || "home";

  const toggleModule = (moduleKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (moduleKey === "home") {
      setExpandedModule("home");
      setSelectedSubmodule("home");
      return;
    }
    setExpandedModule((currentValue) => (currentValue === moduleKey ? null : moduleKey));
  };

  const selectSubmodule = (submoduleKey) => {
    if (submoduleKey === "account-info") {
      navigation.navigate("Profile");
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const parentModule = getParentModule(submoduleKey);
    setExpandedModule(parentModule);
    setSelectedSubmodule(submoduleKey);

    if (submoduleKey === "appointment-request") {
      setFilter("pending");
    }

    if (submoduleKey === "appointment-record") {
      setFilter("all");
    }

    if (submoduleKey === "active-visits") {
      setFilter("approved");
    }
  };

  const handleNextArrivalPress = () => {
    selectSubmodule("appointment-record");

    if (nextUpcomingAppointment) {
      setDetailAppointment(nextUpcomingAppointment);
    }
  };

  const handleAssignedOfficePress = () => {
    navigation.navigate("Profile");
  };

  const openSharedProfile = useCallback(() => {
    navigation.navigate("Profile");
  }, [navigation]);

  const handleNotificationCenterPress = () => {
    if (isPhoneLayout) {
      setMobileTab("notifications");
      return;
    }

    setSelectedSubmodule("home");
    setExpandedModule("home");
    requestAnimationFrame(() => {
      contentScrollRef.current?.scrollToEnd?.({ animated: true });
    });
  };

  const handleProfileInputChange = (field, value) => {
    setProfileForm((currentValue) => ({ ...currentValue, [field]: value }));
  };

  const handlePasswordInputChange = (field, value) => {
    setPasswordForm((currentValue) => ({ ...currentValue, [field]: value }));
  };

  const handleStaffProfilePhotoPress = async () => {
    if (accountMode !== "edit" || profileSaving) return;

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
          handleProfileInputChange("profilePhoto", result.assets[0].uri);
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

  const handleSaveProfile = async () => {
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      Alert.alert("Missing Details", "First name and last name are required.");
      return;
    }

    if (!profileForm.email.trim() || !profileForm.username.trim()) {
      Alert.alert("Missing Details", "Email and username are required.");
      return;
    }

    const cleanedPhone = String(profileForm.phone || "").replace(/[^\d+]/g, "");
    if (cleanedPhone && !/^(?:\+63|0)\d{10}$/.test(cleanedPhone)) {
      Alert.alert(
        "Invalid Contact Number",
        "Please enter a valid Philippine mobile number like 09XXXXXXXXX or +639XXXXXXXXX.",
      );
      return;
    }

    setProfileSaving(true);
    try {
      const response = await ApiService.updateProfile({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        email: profileForm.email.trim(),
        username: profileForm.username.trim(),
        phone: cleanedPhone,
        profilePhoto: profileForm.profilePhoto || null,
      });

      if (response?.user) {
        setUser(response.user);
      }

      setAccountMode("view");
      Alert.alert("Profile Updated", "Your profile was updated successfully.");
    } catch (error) {
      Alert.alert("Update Failed", error?.message || "Could not update your profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      Alert.alert("Missing Details", "Please complete all password fields.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert("Password Mismatch", "New password and confirm password do not match.");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      Alert.alert("Weak Password", "New password must be at least 6 characters.");
      return;
    }

    setPasswordSaving(true);
    try {
      await ApiService.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      Alert.alert("Password Updated", "Your password was changed successfully.");
    } catch (error) {
      Alert.alert("Password Update Failed", error?.message || "Could not change password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const mergeAppointment = (updatedVisitor) => {
    if (!updatedVisitor?._id) return;
    setAppointments((current) =>
      current.map((item) =>
        String(item._id) === String(updatedVisitor._id) ? { ...item, ...updatedVisitor } : item,
      ),
    );
  };

  const handleNotificationPress = async (notification) => {
    if (!notification) return;

    try {
      if (!isNotificationRead(notification)) {
        await ApiService.markNotificationAsRead(notification._id);
        setNotifications((currentValue) =>
          currentValue.map((item) =>
            String(item._id) === String(notification._id)
              ? {
                  ...item,
                  readBy: [
                    ...(Array.isArray(item.readBy) ? item.readBy : []),
                    { user: user?._id, readAt: new Date().toISOString() },
                  ],
                }
              : item,
          ),
        );
      }
    } catch (error) {
      console.error("Notification action error:", error);
    }

    const activityType = String(notification?.metadata?.activityType || "").toLowerCase();
    const relatedVisitorId =
      notification?.relatedVisitor?._id || notification?.relatedVisitor || null;

    const matchedAppointment = appointments.find(
      (item) => String(item?._id) === String(relatedVisitorId),
    );

    if (
      activityType.includes("appointment_request") ||
      activityType.includes("rejected_appointment")
    ) {
      selectSubmodule("appointment-request");
      if (matchedAppointment) {
        setDetailAppointment(matchedAppointment);
      }
      return;
    }

    if (
      activityType.includes("approved_appointment") ||
      activityType.includes("adjusted_appointment") ||
      activityType.includes("completed_appointment") ||
      activityType.includes("appointment_no_show") ||
      activityType.includes("no_show")
    ) {
      selectSubmodule("appointment-record");
      if (matchedAppointment) {
        setDetailAppointment(matchedAppointment);
      }
      return;
    }

    if (matchedAppointment) {
      setDetailAppointment(matchedAppointment);
      return;
    }

    Alert.alert(notification.title || "Notification", notification.message || "No details available.");
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!unreadNotificationsCount) return;

    try {
      await ApiService.markAllNotificationsAsRead();
      setNotifications((currentValue) =>
        currentValue.map((item) =>
          isNotificationRead(item)
            ? item
            : {
                ...item,
                readBy: [
                  ...(Array.isArray(item.readBy) ? item.readBy : []),
                  { user: user?._id, readAt: new Date().toISOString() },
                ],
              },
        ),
      );
      showStaffToast({
        type: "success",
        title: "Notifications Cleared",
        message: "All staff notifications are marked as read.",
      });
    } catch (error) {
      Alert.alert("Notification Update Failed", error?.message || "Could not mark notifications as read.");
    }
  };

  const closeAdjustModal = () => {
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowAdjustModal(false);
    setSelectedAppointment(null);
    setAdjustmentNote("");
  };

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setSelectedAppointment(null);
    setRejectionReason("");
  };

  const closeRedirectAppointmentModal = () => {
    setShowRedirectAppointmentModal(false);
    setSelectedAppointment(null);
    setRedirectAppointmentOffice("");
    setRedirectAppointmentNote("");
  };

  const closeVisitManagementModal = () => {
    setShowVisitManagementModal(false);
    setSelectedAppointment(null);
  };

  const openVisitManagementModal = (appointment) => {
    setSelectedAppointment(appointment);
    setDetailAppointment(appointment);
    setShowVisitManagementModal(true);
  };

  const handleApprove = async (appointment) => {
    if (!appointment?._id) return;
    setProcessingId(appointment._id);
    try {
      const response = await ApiService.approveStaffAppointment(appointment._id);
      if (response?.visitor) {
        mergeAppointment(response.visitor);
      }
      await loadData();
      showStaffToast({
        type: "success",
        title: "Request Approved",
        message: `${appointment.fullName || "Visitor"} is now scheduled for your office.`,
      });
    } catch (error) {
      Alert.alert("Approval Failed", error?.message || "Could not approve appointment.");
    } finally {
      setProcessingId(null);
    }
  };

  const toggleRequestSelection = (appointmentId) => {
    setSelectedRequestIds((currentIds) =>
      currentIds.includes(appointmentId)
        ? currentIds.filter((id) => id !== appointmentId)
        : [...currentIds, appointmentId],
    );
  };

  const handleBulkApproveRequests = () => {
    const selectedRequests = appointmentRequests.filter((item) => selectedRequestIds.includes(item._id));
    if (!selectedRequests.length) return;

    Alert.alert(
      "Approve selected requests?",
      `Approve ${selectedRequests.length} selected appointment request${selectedRequests.length === 1 ? "" : "s"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setProcessingId("bulk-approval");
            try {
              const results = await Promise.allSettled(
                selectedRequests.map((appointment) => ApiService.approveStaffAppointment(appointment._id)),
              );
              const approvedCount = results.filter((result) => result.status === "fulfilled").length;
              setSelectedRequestIds([]);
              await loadData();
              showStaffToast({
                type: approvedCount === selectedRequests.length ? "success" : "warning",
                title: "Bulk approval complete",
                message: `${approvedCount} of ${selectedRequests.length} request${selectedRequests.length === 1 ? "" : "s"} approved.`,
              });
            } catch (error) {
              Alert.alert("Bulk Approval Failed", error?.message || "Could not approve the selected requests.");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const openAdjustModal = (appointment) => {
    setSelectedAppointment(appointment);
    setAdjustedDate(new Date(appointment.visitDate || new Date()));
    setAdjustedTime(new Date(appointment.visitTime || new Date()));
    setAdjustmentNote(appointment.staffAdjustmentNote || "");
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowAdjustModal(true);
  };

  const getWebDateInputValue = () => {
    const value = new Date(adjustedDate || new Date());
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getWebTimeInputValue = () => {
    const value = new Date(adjustedTime || new Date());
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const handleAdjustDatePress = () => {
    setShowTimePicker(false);

    if (Platform.OS === "web") {
      const input = webDateInputRef.current;
      if (input?.showPicker) {
        input.showPicker();
        return;
      }
      input?.click?.();
      return;
    }

    setShowDatePicker(true);
  };

  const handleAdjustTimePress = () => {
    setShowDatePicker(false);

    if (Platform.OS === "web") {
      const input = webTimeInputRef.current;
      if (input?.showPicker) {
        input.showPicker();
        return;
      }
      input?.click?.();
      return;
    }

    setShowTimePicker(true);
  };

  const handleAdjustDateChange = (event, value) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (event?.type === "dismissed" || !value) {
      return;
    }

    setAdjustedDate(value);
  };

  const handleAdjustTimeChange = (event, value) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }

    if (event?.type === "dismissed" || !value) {
      return;
    }

    setAdjustedTime(value);
  };

  const handleWebDateChange = (event) => {
    const nextValue = event?.target?.value;
    if (!nextValue) return;

    const [year, month, day] = nextValue.split("-").map(Number);
    if (!year || !month || !day) return;

    setAdjustedDate(new Date(year, month - 1, day));
  };

  const handleWebTimeChange = (event) => {
    const nextValue = event?.target?.value;
    if (!nextValue) return;

    const [hours, minutes] = nextValue.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

    const nextTime = new Date(adjustedTime || new Date());
    nextTime.setHours(hours, minutes, 0, 0);
    setAdjustedTime(nextTime);
  };

  const submitAdjustment = async () => {
    if (!selectedAppointment) return;
    try {
      const mergedDateTime = new Date(adjustedDate);
      const timeValue = new Date(adjustedTime);
      mergedDateTime.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);

      if (Number.isNaN(mergedDateTime.getTime())) {
        Alert.alert("Invalid Schedule", "Please choose a valid appointment date and time.");
        return;
      }

      if (mergedDateTime < new Date(Date.now() - 60 * 1000)) {
        Alert.alert("Invalid Schedule", "Adjusted appointment time cannot be in the past.");
        return;
      }

      setProcessingId(selectedAppointment._id);
      const response = await ApiService.adjustStaffAppointment(selectedAppointment._id, {
        visitDate: adjustedDate.toISOString(),
        preferredDate: adjustedDate.toISOString(),
        visitTime: mergedDateTime.toISOString(),
        preferredTime: mergedDateTime.toISOString(),
        note: adjustmentNote,
      });
      if (response?.visitor) {
        mergeAppointment(response.visitor);
      }
      closeAdjustModal();
      await loadData();
      showStaffToast({
        type: "success",
        title: "Schedule Adjusted",
        message: `${selectedAppointment.fullName || "Visitor"} will receive the updated time.`,
      });
    } catch (error) {
      Alert.alert("Update Failed", error?.message || "Could not adjust appointment.");
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (appointment) => {
    setSelectedAppointment(appointment);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const openRedirectAppointmentModal = (appointment) => {
    const currentOffice = appointment?.appointmentDepartment || appointment?.assignedOffice || user?.department || "";
    const nextOffice =
      staffRedirectDestinations.find(
        (office) => office.toLowerCase() !== String(currentOffice).trim().toLowerCase(),
      ) || "";
    setSelectedAppointment(appointment);
    setRedirectAppointmentOffice(nextOffice);
    setRedirectAppointmentNote(
      currentOffice
        ? `Please review this request. Visitor should be assisted by ${nextOffice || "the selected office"} instead of ${currentOffice}.`
        : "",
    );
    setShowRedirectAppointmentModal(true);
  };

  const submitRejection = async () => {
    if (!selectedAppointment) return;
    if (!rejectionReason.trim()) {
      Alert.alert("Reason Required", "Please add a reason before rejecting.");
      return;
    }
    setProcessingId(selectedAppointment._id);
    try {
      const response = await ApiService.rejectStaffAppointment(
        selectedAppointment._id,
        rejectionReason,
      );
      if (response?.visitor) {
        mergeAppointment(response.visitor);
      }
      closeRejectModal();
      await loadData();
      showStaffToast({
        type: "info",
        title: "Request Rejected",
        message: `${selectedAppointment.fullName || "Visitor"} will see your reason for declining.`,
      });
    } catch (error) {
      Alert.alert("Rejection Failed", error?.message || "Could not reject appointment.");
    } finally {
      setProcessingId(null);
    }
  };

  const submitAppointmentRedirect = async () => {
    if (!selectedAppointment) return;
    if (!redirectAppointmentOffice.trim()) {
      Alert.alert("Office Required", "Please choose the office that should review this appointment.");
      return;
    }

    setProcessingId(selectedAppointment._id);
    try {
      const response = await ApiService.redirectStaffAppointment(selectedAppointment._id, {
        office: redirectAppointmentOffice,
        note: redirectAppointmentNote,
      });
      if (response?.visitor) {
        mergeAppointment(response.visitor);
      }
      closeRedirectAppointmentModal();
      await loadData();
      showStaffToast({
        type: "success",
        title: "Appointment Redirected",
        message: response?.message || `${selectedAppointment.fullName || "Visitor"} was sent to ${redirectAppointmentOffice}.`,
      });
    } catch (error) {
      Alert.alert("Redirect Failed", error?.message || "Could not redirect appointment.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleComplete = async (appointment, { skipConfirmation = false } = {}) => {
    if (!appointment?._id || processingId) return;

    const performComplete = async () => {
      setProcessingId(appointment._id);
      try {
        const response = await ApiService.completeStaffAppointment(appointment._id);
        if (response?.visitor) {
          mergeAppointment(response.visitor);
        }
        closeVisitManagementModal();
        await loadData();
        showStaffToast({
          type: "success",
          title: "Appointment Completed",
          message: "Security, admin, and the visitor have been notified for checkout follow-up.",
        });
      } catch (error) {
        Alert.alert("Complete Failed", error?.message || "Could not complete appointment.");
      } finally {
        setProcessingId(null);
      }
    };

    if (skipConfirmation) {
      await performComplete();
      return;
    }

    if (Platform.OS === "web") {
      const confirmed = globalThis?.window?.confirm?.(
        "Mark this appointment as complete and notify security for checkout?",
      );
      if (confirmed) {
        await performComplete();
      }
      return;
    }

    Alert.alert(
      "Complete Appointment",
      "Mark this appointment as complete and notify security for checkout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Complete", onPress: performComplete },
      ],
    );
  };

  const submitVisitorDestinationUpdate = async (appointment, office) => {
    if (!appointment?._id || !office || processingId) return;

    setProcessingId(appointment._id);
    try {
      const response = await ApiService.updateVisitorDestination(appointment._id, {
        office,
        reason: `Redirected by ${profileName || "staff"} during appointment handling.`,
      });

      if (response?.visitor) {
        mergeAppointment(response.visitor);
        setDetailAppointment(response.visitor);
      }

      setShowVisitManagementModal(false);
      setSelectedAppointment(null);
      await loadData();
      showStaffToast({
        type: "success",
        title: "Destination Updated",
        message: response?.message || `Visitor was redirected to ${office}.`,
      });
    } catch (error) {
      Alert.alert("Redirect Failed", error?.message || "Could not update the visitor destination.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRedirectVisitor = (appointment) => {
    if (!appointment?._id) return;

    if (Platform.OS === "web") {
      const office = globalThis?.window?.prompt?.(
        "Enter the visitor's next destination office:",
        appointment.currentDestination?.office ||
          appointment.appointmentDepartment ||
          appointment.assignedOffice ||
          "Cashier",
      );
      if (office && office.trim()) {
        submitVisitorDestinationUpdate(appointment, office.trim());
      }
      return;
    }

    Alert.alert(
      "Redirect Visitor",
      "Choose the visitor's next destination. The visitor and security will be notified.",
      [
        { text: "Cancel", style: "cancel" },
        ...staffRedirectDestinations.slice(0, 5).map((office) => ({
          text: office,
          onPress: () => submitVisitorDestinationUpdate(appointment, office),
        })),
      ],
    );
  };

  const handleLogout = useCallback(() => {
    if (isSigningOut) return;
    setShowLogoutModal(true);
  }, [isSigningOut]);

  const closeLogoutModal = useCallback(() => {
    if (isSigningOut) return;
    setShowLogoutModal(false);
  }, [isSigningOut]);

  const confirmLogout = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setShowLogoutModal(false);

    try {
      await ApiService.logout();
      await ApiService.clearAuth();
    } catch (error) {
      console.log("Staff logout API error ignored:", error);
      await ApiService.clearAuth();
    }

    if (typeof onLogout === "function") {
      onLogout();
    }

    try {
      navigation.reset({ index: 0, routes: [{ name: "RoleSelect" }] });
    } catch (error) {
      console.error("Staff logout navigation error:", error);
      setShowLogoutModal(false);
      setIsSigningOut(false);
      Alert.alert("Signed Out", "You have been signed out. Please return to the login screen.");
    }
  }, [isSigningOut, navigation, onLogout]);

  const buildAppointmentPrintRows = (records) =>
    (records || []).map((appointment) => ({
      visitor: appointment?.fullName || "Visitor",
      email: appointment?.email || "-",
      purpose: appointment?.purposeOfVisit || "No visit purpose provided",
      schedule: `${formatDate(appointment?.visitDate)} ${formatTime(appointment?.visitTime)}`,
      office: appointment?.appointmentDepartment || appointment?.assignedOffice || "Assigned department",
      staff: appointment?.assignedStaffName || profileName,
      status: getStatusMeta(getAppointmentStatus(appointment)).label,
      submitted: formatDateTime(appointment?.createdAt || appointment?.registeredAt || appointment?.updatedAt),
    }));

  const handlePrintAppointmentTable = async ({
    title,
    subtitle,
    records,
    emptyMessage,
    totalLabel = "appointments",
  }) => {
    const rows = buildAppointmentPrintRows(records);
    if (rows.length === 0) {
      Alert.alert("No Data", emptyMessage || "There are no appointment records to print.");
      return;
    }

    try {
      const printedBy =
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.email ||
        profileName ||
        "Staff User";

      await printRecordsTable({
        title,
        subtitle,
        columns: [
          { key: "visitor", label: "Visitor" },
          { key: "email", label: "Email" },
          { key: "purpose", label: "Purpose" },
          { key: "schedule", label: "Schedule" },
          { key: "office", label: "Office" },
          { key: "staff", label: "Staff" },
          { key: "status", label: "Status" },
          { key: "submitted", label: "Submitted" },
        ],
        rows,
        totalLabel,
        dialogTitle: title,
        printedBy,
        generatedAt: new Date(),
      });
    } catch (error) {
      console.error("Print staff appointment table error:", error);
      Alert.alert("Error", "Failed to generate the printable table.");
    }
  };

  const renderTablePrintButton = ({ label = "Print Table", records, title, subtitle, emptyMessage, totalLabel }) => (
    <TouchableOpacity
      style={styles.sectionActionButton}
      onPress={() => handlePrintAppointmentTable({ title, subtitle, records, emptyMessage, totalLabel })}
    >
      <Ionicons name="print-outline" size={16} color="#0A3D91" />
      <Text style={styles.sectionActionButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  const renderAppointmentTable = (
    appointmentsToRender,
    { mode = "requests", emptyTitle, emptySubtitle },
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={Platform.OS === "web"}
      contentContainerStyle={styles.tableScrollContent}
      style={styles.tableScroll}
    >
      <View style={[styles.tableCard, mobileDarkModeEnabled && styles.darkTableCard]}>
        <View style={[styles.tableHeaderRow, mobileDarkModeEnabled && styles.darkTableHeaderRow]}>
          <View style={[styles.tableHeaderColumnWide, styles.tableColumnVisitor]}>
            <Text style={[styles.tableHeaderCellWide, mobileDarkModeEnabled && styles.darkMutedText]}>Visitor</Text>
          </View>
          <View style={[styles.tableHeaderColumn, styles.tableColumnSchedule]}>
            <Text style={[styles.tableHeaderCell, mobileDarkModeEnabled && styles.darkMutedText]}>Schedule</Text>
          </View>
          <View style={[styles.tableHeaderColumn, styles.tableColumnOffice]}>
            <Text style={[styles.tableHeaderCell, mobileDarkModeEnabled && styles.darkMutedText]}>Office</Text>
          </View>
          <View style={[styles.tableHeaderColumn, styles.tableColumnStatus]}>
            <Text style={[styles.tableHeaderCell, mobileDarkModeEnabled && styles.darkMutedText]}>Status</Text>
          </View>
          <View style={styles.tableHeaderColumnActions}>
            <Text style={[styles.tableHeaderCellActions, mobileDarkModeEnabled && styles.darkMutedText]}>Actions</Text>
          </View>
        </View>

        {appointmentsToRender.length === 0 ? (
          <View style={styles.tableEmptyState}>
            <Ionicons name="documents-outline" size={42} color="#94A3B8" />
            <Text style={[styles.emptyTitle, mobileDarkModeEnabled && styles.darkText]}>{emptyTitle}</Text>
            <Text style={[styles.emptySubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>{emptySubtitle}</Text>
          </View>
        ) : (
          groupAppointmentsByDate(appointmentsToRender).flatMap((group) => [
            <View key={`${mode}-${group.dateKey}`} style={[styles.tableDateGroupRow, mobileDarkModeEnabled && styles.darkTableHeaderRow]}>
              <Text style={[styles.tableDateGroupText, mobileDarkModeEnabled && styles.darkText]}>{group.label}</Text>
            </View>,
            ...group.entries.map((appointment) => {
            const appointmentStatus = getAppointmentStatus(appointment);
            const statusMeta = getStatusMeta(appointmentStatus);
            const canActOnRequest = isActionableAppointmentRequest(appointment);
            const canManageVisit = isActiveStaffVisit(appointment);
            const isProcessing = processingId === appointment._id;

            return (
              <View key={appointment._id} style={[styles.tableBodyRow, mobileDarkModeEnabled && styles.darkTableBodyRow]}>
                <View style={[styles.tableCellWide, styles.tableColumnVisitor]}>
                  <Text style={[styles.tablePrimaryText, mobileDarkModeEnabled && styles.darkText]}>{appointment.fullName}</Text>
                  <Text style={[styles.tableSecondaryText, mobileDarkModeEnabled && styles.darkMutedText]}>{appointment.email || "No email address"}</Text>
                  <Text style={[styles.tableHelperText, mobileDarkModeEnabled && styles.darkMutedText]}>
                    {appointment.purposeOfVisit || "No visit purpose provided"}
                  </Text>
                </View>

                <View style={[styles.tableCell, styles.tableColumnSchedule]}>
                  <Text style={[styles.tablePrimaryText, mobileDarkModeEnabled && styles.darkText]}>{formatDate(appointment.visitDate)}</Text>
                  <Text style={[styles.tableSecondaryText, mobileDarkModeEnabled && styles.darkMutedText]}>{formatTime(appointment.visitTime)}</Text>
                  {isOverdueAppointmentRequest(appointment) ? (
                    <View style={styles.overdueBadge}>
                      <Ionicons name="warning-outline" size={12} color="#B45309" />
                      <Text style={styles.overdueBadgeText}>Needs review</Text>
                    </View>
                  ) : null}
                </View>

                <View style={[styles.tableCell, styles.tableColumnOffice]}>
                  <Text style={[styles.tablePrimaryText, mobileDarkModeEnabled && styles.darkText]}>
                    {appointment.appointmentDepartment || appointment.assignedOffice || "Assigned department"}
                  </Text>
                  <Text style={[styles.tableSecondaryText, mobileDarkModeEnabled && styles.darkMutedText]}>
                    {appointment.assignedStaffName || profileName}
                  </Text>
                </View>

                <View style={[styles.tableCell, styles.tableColumnStatus]}>
                  <View style={[styles.statusBadge, { backgroundColor: statusMeta.background }]}>
                    <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                  </View>
                </View>

                <View style={styles.tableCellActions}>
                  <TouchableOpacity
                    style={styles.tableActionButton}
                    onPress={() => setDetailAppointment(appointment)}
                  >
                    <Text style={styles.tableActionButtonText}>View</Text>
                  </TouchableOpacity>

                  {mode === "requests" ? (
                    <TouchableOpacity
                      style={[
                        styles.tableActionButton,
                        selectedRequestIds.includes(appointment._id) && styles.tableActionButtonSelected,
                      ]}
                      onPress={() => toggleRequestSelection(appointment._id)}
                      disabled={processingId === "bulk-approval"}
                    >
                      <Text style={styles.tableActionButtonText}>
                        {selectedRequestIds.includes(appointment._id) ? "Selected" : "Select"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {mode === "requests" && canActOnRequest ? (
                    <>
                      <TouchableOpacity
                        style={[styles.tableActionButton, styles.tableActionButtonPrimary, isProcessing && styles.disabledAction]}
                        onPress={() => handleApprove(appointment)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.tableActionButtonPrimaryText}>Approve</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.tableActionButton}
                        onPress={() => openAdjustModal(appointment)}
                        disabled={isProcessing}
                      >
                        <Text style={styles.tableActionButtonText}>Adjust</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.tableActionButton}
                        onPress={() => openRedirectAppointmentModal(appointment)}
                        disabled={isProcessing}
                      >
                        <Text style={styles.tableActionButtonText}>Redirect</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tableActionButton, styles.tableActionButtonDanger]}
                        onPress={() => openRejectModal(appointment)}
                        disabled={isProcessing}
                      >
                        <Text style={styles.tableActionButtonDangerText}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}

                  {mode === "records" && canManageVisit ? (
                    <TouchableOpacity
                      style={[styles.tableActionButton, styles.tableActionButtonPrimary, isProcessing && styles.disabledAction]}
                      onPress={() => openVisitManagementModal(appointment)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.tableActionButtonPrimaryText}>Manage</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }),
          ])
        )}
      </View>
    </ScrollView>
  );

  const renderPagination = ({
    currentPage,
    totalPages,
    totalItems,
    onPrevious,
    onNext,
    label,
  }) => (
    <View style={styles.paginationRow}>
      <Text style={styles.paginationInfo}>
        {totalItems === 0
          ? `No ${label.toLowerCase()} to show`
          : `Page ${currentPage} of ${totalPages} • ${totalItems} ${label.toLowerCase()}`}
      </Text>
      <View style={styles.paginationActions}>
        <TouchableOpacity
          style={[styles.paginationButton, currentPage <= 1 && styles.paginationButtonDisabled]}
          onPress={onPrevious}
          disabled={currentPage <= 1}
        >
          <Text style={[styles.paginationButtonText, currentPage <= 1 && styles.paginationButtonTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.paginationButton, currentPage >= totalPages && styles.paginationButtonDisabled]}
          onPress={onNext}
          disabled={currentPage >= totalPages}
        >
          <Text
            style={[
              styles.paginationButtonText,
              currentPage >= totalPages && styles.paginationButtonTextDisabled,
            ]}
          >
            Next
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAppointmentDetailPanel = () => {
    if (!detailAppointment) return null;
    const detailVisitPhase = getStaffVisitPhase(detailAppointment);

    return (
      <View style={styles.detailPanelCard}>
        <View style={styles.detailPanelHeader}>
          <View>
            <Text style={styles.detailPanelTitle}>Appointment Details</Text>
            <Text style={styles.detailPanelSubtitle}>
              Review the full visitor context without leaving the table.
            </Text>
          </View>
          <TouchableOpacity style={styles.detailPanelCloseButton} onPress={() => setDetailAppointment(null)}>
            <Ionicons name="close-outline" size={18} color="#475569" />
          </TouchableOpacity>
        </View>

        <View style={styles.detailScrollContent}>
          <View style={styles.detailGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Visitor</Text>
              <Text style={styles.detailValue}>{detailAppointment.fullName}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailValue}>{detailAppointment.email || "N/A"}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Purpose</Text>
              <Text style={styles.detailValue}>
                {detailAppointment.purposeOfVisit || "No visit purpose provided"}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Office</Text>
              <Text style={styles.detailValue}>
                {detailAppointment.appointmentDepartment || detailAppointment.assignedOffice || "Assigned department"}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Next Destination</Text>
              <Text style={styles.detailValue}>
                {detailAppointment.currentDestination?.office ||
                  detailAppointment.appointmentDepartment ||
                  detailAppointment.assignedOffice ||
                  "Assigned department"}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Current Location</Text>
              <Text style={styles.detailValue}>
                {detailAppointment.currentLocation?.office || "Not tapped inside campus yet"}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Schedule</Text>
              <Text style={styles.detailValue}>
                {formatDate(detailAppointment.visitDate)} at {formatTime(detailAppointment.visitTime)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>
                {getStatusMeta(getAppointmentStatus(detailAppointment)).label}
              </Text>
            </View>
          </View>

          <View style={[styles.detailNoteCard, { borderLeftWidth: 4, borderLeftColor: detailVisitPhase.color }]}>
            <Text style={styles.detailLabel}>{detailVisitPhase.label}</Text>
            <Text style={styles.detailNoteText}>{detailVisitPhase.detail}</Text>
          </View>

          <View style={styles.detailTimelineSection}>
            <Text style={styles.detailSectionTitle}>Appointment Timeline</Text>
            <View style={styles.detailTimelineList}>
              <View style={styles.detailTimelineItem}>
                <View style={styles.detailTimelineDot} />
                <View style={styles.detailTimelineContent}>
                  <Text style={styles.detailTimelineLabel}>Request Submitted</Text>
                  <Text style={styles.detailTimelineValue}>
                    {formatDateTime(detailAppointment.createdAt || detailAppointment.registeredAt)}
                  </Text>
                </View>
              </View>

              {detailAppointment.approvedAt ? (
                <View style={styles.detailTimelineItem}>
                  <View style={[styles.detailTimelineDot, styles.detailTimelineDotApproved]} />
                  <View style={styles.detailTimelineContent}>
                    <Text style={styles.detailTimelineLabel}>Approved</Text>
                    <Text style={styles.detailTimelineValue}>
                      {formatDateTime(detailAppointment.approvedAt)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {detailAppointment.checkedInAt ? (
                <View style={styles.detailTimelineItem}>
                  <View style={[styles.detailTimelineDot, styles.detailTimelineDotCheckedIn]} />
                  <View style={styles.detailTimelineContent}>
                    <Text style={styles.detailTimelineLabel}>Checked In</Text>
                    <Text style={styles.detailTimelineValue}>
                      {formatDateTime(detailAppointment.checkedInAt)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {detailAppointment.appointmentCompletedAt ? (
                <View style={styles.detailTimelineItem}>
                  <View style={[styles.detailTimelineDot, styles.detailTimelineDotCompleted]} />
                  <View style={styles.detailTimelineContent}>
                    <Text style={styles.detailTimelineLabel}>Marked Complete</Text>
                    <Text style={styles.detailTimelineValue}>
                      {formatDateTime(detailAppointment.appointmentCompletedAt)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {detailAppointment.checkedOutAt ? (
                <View style={styles.detailTimelineItem}>
                  <View style={[styles.detailTimelineDot, styles.detailTimelineDotCheckedOut]} />
                  <View style={styles.detailTimelineContent}>
                    <Text style={styles.detailTimelineLabel}>Checked Out</Text>
                    <Text style={styles.detailTimelineValue}>
                      {formatDateTime(detailAppointment.checkedOutAt)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {detailAppointment.staffAdjustmentNote && !detailAppointment.appointmentRedirectedAt ? (
            <View style={styles.detailNoteCard}>
              <Text style={styles.detailLabel}>Adjustment Note</Text>
              <Text style={styles.detailNoteText}>{detailAppointment.staffAdjustmentNote}</Text>
            </View>
          ) : null}

          {detailAppointment.appointmentRedirectedAt ? (
            <View style={styles.detailNoteCard}>
              <Text style={styles.detailLabel}>Office Redirect</Text>
              <Text style={styles.detailNoteText}>
                {detailAppointment.appointmentRedirectFrom || "Previous office"} to {detailAppointment.appointmentRedirectTo || "new office"}
              </Text>
              {detailAppointment.appointmentRedirectNote ? (
                <Text style={styles.detailNoteText}>{detailAppointment.appointmentRedirectNote}</Text>
              ) : null}
            </View>
          ) : null}

          {detailAppointment.staffRejectionReason ? (
            <View style={styles.detailNoteCard}>
              <Text style={styles.detailLabel}>Rejection Reason</Text>
              <Text style={styles.detailNoteText}>{detailAppointment.staffRejectionReason}</Text>
            </View>
          ) : null}

          {detailAppointment.appointmentCompletionNote ? (
            <View style={styles.detailNoteCard}>
              <Text style={styles.detailLabel}>Completion Note</Text>
              <Text style={styles.detailNoteText}>{detailAppointment.appointmentCompletionNote}</Text>
            </View>
          ) : null}

          {isActiveStaffVisit(detailAppointment) ? (
            <View style={styles.visitManagementActions}>
              <TouchableOpacity
                style={[styles.sectionActionButton, styles.visitManagementDoneButton, processingId === detailAppointment._id && styles.disabledAction]}
                onPress={() => handleComplete(detailAppointment, { skipConfirmation: true })}
                disabled={processingId === detailAppointment._id}
              >
                {processingId === detailAppointment._id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="checkmark-done-outline" size={16} color="#FFFFFF" />
                )}
                <Text style={[styles.sectionActionButtonText, styles.visitManagementDoneButtonText]}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sectionActionButton, processingId === detailAppointment._id && styles.disabledAction]}
                onPress={() => handleRedirectVisitor(detailAppointment)}
                disabled={processingId === detailAppointment._id}
              >
                <Ionicons name="navigate-outline" size={16} color="#0A3D91" />
                <Text style={styles.sectionActionButtonText}>Redirect</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderHomeContent = () => (
    <>
      <LinearGradient colors={["#0A3D91", "#1E4A8C"]} style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>Staff Dashboard</Text>
            <Text style={styles.heroTitle}>Staff Workspace</Text>
            <Text style={styles.heroSubtitle}>
              Review visitor requests, schedules, and office updates from one focused view.
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.pending}</Text>
            <Text style={styles.heroStatLabel}>Pending</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{checkedInNowCount}</Text>
            <Text style={styles.heroStatLabel}>Checked In</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{unreadNotificationsCount}</Text>
            <Text style={styles.heroStatLabel}>Unread Alerts</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={staffVirtualStyles.webNotice}>
        <Ionicons name="phone-portrait-outline" size={20} color="#0A3D91" />
        <View style={staffVirtualStyles.webNoticeCopy}>
          <Text style={staffVirtualStyles.webNoticeTitle}>Attendance is on mobile</Text>
          <Text style={staffVirtualStyles.webNoticeText}>
            Use the mobile app for staff check-in and check-out.
          </Text>
        </View>
      </View>

      <View style={styles.homeInsightsGrid}>
        <HomeHoverPressable style={styles.homeInsightCard} onPress={handleNextArrivalPress}>
          <View style={styles.homeInsightIconWrap}>
            <Ionicons name="time-outline" size={18} color="#0A3D91" />
          </View>
          <Text style={styles.homeInsightLabel}>Next Arrival</Text>
          <Text style={styles.homeInsightValue}>
            {nextUpcomingAppointment?.fullName || "No upcoming visitor"}
          </Text>
          <Text style={styles.homeInsightMeta}>
            {nextUpcomingAppointment
              ? `${formatDate(nextUpcomingAppointment.visitDate)} at ${formatTime(nextUpcomingAppointment.visitTime)}`
              : "Your next approved appointment will appear here."}
          </Text>
        </HomeHoverPressable>

        <HomeHoverPressable style={styles.homeInsightCard} onPress={handleAssignedOfficePress}>
          <View style={styles.homeInsightIconWrap}>
            <Ionicons name="business-outline" size={18} color="#047857" />
          </View>
          <Text style={styles.homeInsightLabel}>Assigned Office</Text>
          <Text style={styles.homeInsightValue}>{user?.department || "Not assigned"}</Text>
          <Text style={styles.homeInsightMeta}>
            Manage requests and records routed to your office assignment.
          </Text>
        </HomeHoverPressable>

        <HomeHoverPressable style={styles.homeInsightCard} onPress={handleNotificationCenterPress}>
          <View style={styles.homeInsightHeader}>
            <View style={styles.homeInsightIconWrap}>
              <Ionicons name="notifications-outline" size={18} color="#7C3AED" />
            </View>
            {unreadNotificationsCount ? (
              <TouchableOpacity style={styles.homeInsightAction} onPress={handleMarkAllNotificationsRead}>
                <Text style={styles.homeInsightActionText}>Mark all read</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.homeInsightLabel}>Notification Center</Text>
          <Text style={styles.homeInsightValue}>
            {unreadNotificationsCount ? `${unreadNotificationsCount} new update${unreadNotificationsCount > 1 ? "s" : ""}` : "All caught up"}
          </Text>
          <Text style={styles.homeInsightMeta}>
            Open recent alerts and jump straight into related appointments.
          </Text>
        </HomeHoverPressable>
      </View>

      <View style={styles.homeWorkspaceGrid}>
        <View style={styles.homeWorkspaceMain}>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <Text style={styles.sectionTitle}>Today's Schedule</Text>
            <Text style={styles.sectionSubtitle}>
              Approved and adjusted visitors for your office today.
            </Text>
          </View>
          <TouchableOpacity style={styles.sectionActionIconButton} onPress={() => selectSubmodule("appointment-record")}>
            <Ionicons name="calendar-outline" size={18} color="#1C6DD0" />
          </TouchableOpacity>
        </View>

        {todaysSchedule.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={42} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No scheduled visitors today</Text>
            <Text style={styles.emptySubtitle}>
              Approved or adjusted appointments for today will appear here automatically.
            </Text>
            <TouchableOpacity style={styles.emptyRefreshButton} onPress={onRefresh}>
              <Ionicons name="refresh-outline" size={15} color="#0A3D91" />
              <Text style={styles.emptyRefreshButtonText}>Refresh dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.todayScheduleList}>
            {todaysSchedule.map((appointment) => {
              const statusMeta = getStatusMeta(getAppointmentStatus(appointment));
              return (
                <HomeHoverPressable
                  key={appointment._id}
                  style={styles.todayScheduleCard}
                  onPress={() => {
                    selectSubmodule("appointment-record");
                    setDetailAppointment(appointment);
                    if (isActiveStaffVisit(appointment)) {
                      openVisitManagementModal(appointment);
                    }
                  }}
                >
                  <View style={styles.todayScheduleTopRow}>
                    <Text style={styles.todayScheduleName}>{appointment.fullName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusMeta.background }]}>
                      <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.todayScheduleMeta}>
                    {formatTime(appointment.visitTime)} • {appointment.appointmentDepartment || appointment.assignedOffice || "Assigned department"}
                  </Text>
                  <Text style={styles.todaySchedulePurpose}>
                    {appointment.purposeOfVisit || "No visit purpose provided"}
                  </Text>
                </HomeHoverPressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.quickActionsGrid}>
        <HomeHoverPressable style={styles.quickActionCard} onPress={() => selectSubmodule("appointment-request")}>
          <View style={styles.quickActionMetaRow}>
            <View style={styles.quickActionBadge}>
              <Text style={styles.quickActionBadgeText}>{stats.pending} Pending</Text>
            </View>
            <Ionicons name="arrow-forward-outline" size={16} color="#94A3B8" />
          </View>
          <View style={[styles.quickActionIcon, styles.quickActionIconBlue]}>
            <Ionicons name="calendar-clear-outline" size={22} color="#0A3D91" />
          </View>
          <Text style={styles.quickActionTitle}>Appointment Request</Text>
          <Text style={styles.quickActionSubtitle}>
            Review and respond to visitor schedule requests.
          </Text>
          <Text style={styles.quickActionFooterText}>Open request table</Text>
        </HomeHoverPressable>

        <HomeHoverPressable style={styles.quickActionCard} onPress={() => selectSubmodule("appointment-record")}>
          <View style={styles.quickActionMetaRow}>
            <View style={styles.quickActionBadge}>
              <Text style={styles.quickActionBadgeText}>{appointmentRecords.length} Records</Text>
            </View>
            <Ionicons name="arrow-forward-outline" size={16} color="#94A3B8" />
          </View>
          <View style={[styles.quickActionIcon, styles.quickActionIconGreen]}>
            <Ionicons name="documents-outline" size={22} color="#047857" />
          </View>
          <Text style={styles.quickActionTitle}>Appointment Record</Text>
          <Text style={styles.quickActionSubtitle}>
            Review records and track status changes.
          </Text>
          <Text style={styles.quickActionFooterText}>Open record history</Text>
        </HomeHoverPressable>

        <HomeHoverPressable style={styles.quickActionCard} onPress={openSharedProfile}>
          <View style={styles.quickActionMetaRow}>
            <View style={styles.quickActionBadge}>
              <Text style={styles.quickActionBadgeText}>{user?.department || "Profile"}</Text>
            </View>
            <Ionicons name="arrow-forward-outline" size={16} color="#94A3B8" />
          </View>
          <View style={[styles.quickActionIcon, styles.quickActionIconPurple]}>
            <Ionicons name="person-outline" size={22} color="#6D28D9" />
          </View>
          <Text style={styles.quickActionTitle}>View Account Info</Text>
          <Text style={styles.quickActionSubtitle}>
            Check your assigned office and account details.
          </Text>
          <Text style={styles.quickActionFooterText}>Open my profile</Text>
        </HomeHoverPressable>

        <HomeHoverPressable style={styles.quickActionCard} onPress={() => navigation.navigate("Reports")}>
          <View style={styles.quickActionMetaRow}>
            <View style={styles.quickActionBadge}>
              <Text style={styles.quickActionBadgeText}>Reports</Text>
            </View>
            <Ionicons name="arrow-forward-outline" size={16} color="#94A3B8" />
          </View>
          <View style={[styles.quickActionIcon, styles.quickActionIconOrange]}>
            <Ionicons name="document-text-outline" size={22} color="#B45309" />
          </View>
          <Text style={styles.quickActionTitle}>Reports</Text>
          <Text style={styles.quickActionSubtitle}>
            View visitor summaries, KPI metrics, and export data.
          </Text>
          <Text style={styles.quickActionFooterText}>Open reports</Text>
        </HomeHoverPressable>
      </View>

        </View>

        <View style={styles.homeWorkspaceSide}>
      <View style={[styles.sectionCard, styles.activeVisitsCard]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <Text style={styles.sectionTitle}>Active Visits</Text>
            <Text style={styles.sectionSubtitle}>
              Checked-in visitors currently assigned to your office.
            </Text>
          </View>
          <View style={styles.activeVisitCountBadge}>
            <Text style={styles.activeVisitCountText}>{activeStaffVisits.length}</Text>
          </View>
        </View>

        {activeStaffVisits.length === 0 ? (
          <View style={styles.compactEmptyState}>
            <Ionicons name="walk-outline" size={34} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No active visits</Text>
            <Text style={styles.emptySubtitle}>
              When security checks in a visitor for your office, they will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.activeVisitList}>
            {activeStaffVisits.slice(0, 6).map((appointment) => (
              <HomeHoverPressable
                key={appointment._id}
                style={styles.activeVisitItem}
                onPress={() => openVisitManagementModal(appointment)}
              >
                <View style={styles.activeVisitTopRow}>
                  <View style={styles.activeVisitAvatar}>
                    <Ionicons name="person-outline" size={18} color="#047857" />
                  </View>
                  <View style={styles.activeVisitCopy}>
                    <Text style={styles.activeVisitName} numberOfLines={1}>
                      {appointment.fullName || "Visitor"}
                    </Text>
                    <Text style={styles.activeVisitMeta} numberOfLines={1}>
                      {appointment.currentLocation?.office ||
                        appointment.currentDestination?.office ||
                        appointment.appointmentDepartment ||
                        "Inside campus"}
                    </Text>
                  </View>
                </View>
                <View style={styles.activeVisitFooter}>
                  <Text style={styles.activeVisitTime}>
                    Checked in {formatRelativeTime(appointment.checkedInAt)}
                  </Text>
                  <TouchableOpacity
                    style={styles.activeVisitManageButton}
                    onPress={() => openVisitManagementModal(appointment)}
                  >
                    <Text style={styles.activeVisitManageText}>Manage</Text>
                  </TouchableOpacity>
                </View>
              </HomeHoverPressable>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.sectionCard, styles.notificationsCard]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <Text style={styles.sectionTitle}>Recent Notifications</Text>
            <Text style={styles.sectionSubtitle}>
              Stay updated with visitor activity, approvals, and schedule changes.
            </Text>
          </View>
          <View style={styles.sectionActionRow}>
            {unreadNotificationsCount ? (
              <TouchableOpacity style={styles.sectionActionButton} onPress={handleMarkAllNotificationsRead}>
                <Ionicons name="checkmark-done-outline" size={16} color="#0A3D91" />
                <Text style={styles.sectionActionButtonText}>Mark all read</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.sectionActionIconButton} onPress={loadData}>
              <Ionicons name="refresh-outline" size={18} color="#1C6DD0" />
            </TouchableOpacity>
          </View>
        </View>

        {(notifications || []).length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={42} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySubtitle}>Updates from admin and visitor appointment activity will appear here.</Text>
            <TouchableOpacity style={styles.emptyRefreshButton} onPress={loadData}>
              <Ionicons name="refresh-outline" size={15} color="#0A3D91" />
              <Text style={styles.emptyRefreshButtonText}>Check again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.notificationList}>
          {(notifications || []).slice(0, 5).map((notification) => (
            (() => {
              const notificationMeta = getNotificationMeta(notification);
              return (
                <HomeHoverPressable
                        key={notification._id}
                        style={[
                          styles.notificationItem,
                    !isNotificationRead(notification) && styles.notificationItemUnread,
                        ]}
                        onPress={() => handleNotificationPress(notification)}
                      >
                  <View style={[styles.notificationDot, !isNotificationRead(notification) && styles.notificationDotUnread]} />
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationTitleRow}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      <View style={styles.notificationBadgeRow}>
                        <View style={[styles.notificationTypeBadge, { backgroundColor: `${notificationMeta.accent}14` }]}>
                          <Ionicons name={notificationMeta.icon} size={12} color={notificationMeta.accent} />
                          <Text style={[styles.notificationTypeBadgeText, { color: notificationMeta.accent }]}>
                            {notificationMeta.label}
                          </Text>
                        </View>
                        {!isNotificationRead(notification) ? (
                          <View style={styles.notificationUnreadBadge}>
                            <Text style={styles.notificationUnreadBadgeText}>New</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <View style={styles.notificationFooterRow}>
                      <Text style={styles.notificationTimestamp}>
                        {formatRelativeTime(notification.createdAt || notification.updatedAt)}
                      </Text>
                      <Text style={styles.notificationActionHint}>Tap to open related appointment</Text>
                    </View>
                  </View>
                </HomeHoverPressable>
              );
            })()
          ))}
          </View>
        )}
      </View>
        </View>
      </View>
    </>
  );

  const renderRecordFilterDropdown = ({ id, label, value, options, onSelect, icon = "filter-outline" }) => {
    const isOpen = recordFilterDropdownOpen === id;
    const selectedOption = options.find((option) => option.value === value);

    return (
      <View style={styles.recordToolbarField}>
        <Text style={[styles.recordToolbarLabel, mobileDarkModeEnabled && styles.darkMutedText]}>{label}</Text>
        {isOpen ? (
          <View style={[styles.recordToolbarDropdownMenu, mobileDarkModeEnabled && styles.darkDropdownMenu]}>
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
                    <Text
                      style={[
                        styles.recordToolbarDropdownText,
                        mobileDarkModeEnabled && styles.darkMutedText,
                        selected && styles.recordToolbarDropdownTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.recordToolbarSelect, mobileDarkModeEnabled && styles.darkInputSurface]}
          onPress={() => setRecordFilterDropdownOpen(isOpen ? null : id)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${label} filter`}
        >
          <View style={styles.recordToolbarSelectValue}>
            <Ionicons name={icon} size={15} color="#64748B" />
            <Text style={[styles.recordToolbarSelectText, mobileDarkModeEnabled && styles.darkText]} numberOfLines={1}>
              {selectedOption?.label || "All"}
            </Text>
          </View>
          <Ionicons name={isOpen ? "chevron-up-outline" : "chevron-down-outline"} size={16} color="#64748B" />
        </TouchableOpacity>
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
      <View style={[styles.recordToolbarCard, mobileDarkModeEnabled && styles.darkNestedCard]}>
        <View style={styles.recordToolbarHeader}>
          <View style={styles.recordToolbarHeaderCopy}>
            <Text style={[styles.recordToolbarTitle, mobileDarkModeEnabled && styles.darkText]}>{searchTitle}</Text>
            <Text style={[styles.recordToolbarSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>{searchSubtitle}</Text>
          </View>
          {searchValue ? (
            <TouchableOpacity onPress={onClearSearch} style={styles.recordToolbarClear}>
              <Text style={styles.recordToolbarClearText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={[styles.searchBar, mobileDarkModeEnabled && styles.darkInputSurface]}>
          <Ionicons name="search-outline" size={18} color="#64748B" />
          <TextInput
            value={searchValue}
            onChangeText={onSearchChange}
            placeholder={searchPlaceholder}
            placeholderTextColor="#94A3B8"
            style={[styles.searchBarInput, mobileDarkModeEnabled && styles.darkText]}
            returnKeyType="search"
          />
        </View>
      </View>

      <View style={[styles.recordToolbarCard, mobileDarkModeEnabled && styles.darkNestedCard]}>
        <View style={styles.recordToolbarHeader}>
          <View style={styles.recordToolbarHeaderCopy}>
            <Text style={[styles.recordToolbarTitle, mobileDarkModeEnabled && styles.darkText]}>Filters</Text>
            <Text style={[styles.recordToolbarSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>{filterSubtitle}</Text>
          </View>
          {hasFilters ? (
            <TouchableOpacity onPress={onResetFilters} style={styles.recordToolbarClear}>
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

  const renderAppointmentRequestContent = () => (
    <View style={[styles.sectionCard, mobileDarkModeEnabled && styles.darkSectionCard]}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, mobileDarkModeEnabled && styles.darkText]}>Pending Appointment Requests</Text>
          <Text style={[styles.sectionSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>
            Review new and rescheduled requests assigned to your office.
          </Text>
        </View>
        <View style={styles.sectionActionRow}>
          <TouchableOpacity style={styles.sectionActionIconButton} onPress={loadData}>
            <Ionicons name="refresh-outline" size={20} color="#1C6DD0" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.queueSummaryGrid}>
        {[
          ["Actionable", appointmentRequests.length, "mail-unread-outline"],
          ["Overdue", appointmentRequests.filter((item) => isOverdueAppointmentRequest(item)).length, "warning-outline"],
          ["Today", appointmentRequests.filter((item) => isSameCalendarDay(item.visitDate)).length, "today-outline"],
          ["This Week", appointmentRequests.filter((item) => isWithinCurrentWeek(item.visitDate)).length, "calendar-outline"],
        ].map(([label, value, icon]) => (
          <View key={label} style={[styles.queueSummaryCard, mobileDarkModeEnabled && styles.darkNestedCard]}>
            <View style={styles.queueSummaryIcon}>
              <Ionicons name={icon} size={17} color="#0A3D91" />
            </View>
            <View>
              <Text style={[styles.queueSummaryValue, mobileDarkModeEnabled && styles.darkText]}>{value}</Text>
              <Text style={[styles.queueSummaryLabel, mobileDarkModeEnabled && styles.darkMutedText]}>{label}</Text>
            </View>
          </View>
        ))}
      </View>

      {selectedRequestIds.length ? (
        <View style={styles.bulkActionBar}>
          <Text style={styles.bulkActionText}>{selectedRequestIds.length} request{selectedRequestIds.length === 1 ? "" : "s"} selected</Text>
          <View style={styles.sectionActionRow}>
            <TouchableOpacity style={styles.bulkClearButton} onPress={() => setSelectedRequestIds([])}>
              <Text style={styles.bulkClearButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkApproveButton, processingId === "bulk-approval" && styles.disabledAction]}
              onPress={handleBulkApproveRequests}
              disabled={processingId === "bulk-approval"}
            >
              <Ionicons name="checkmark-done-outline" size={16} color="#FFFFFF" />
              <Text style={styles.bulkApproveButtonText}>Approve selected</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {renderRecordSearchFilterToolbar({
        searchTitle: "Search Requests",
        searchSubtitle: "Find by visitor, email, purpose, date, or office.",
        searchValue: requestSearchTerm,
        onSearchChange: setRequestSearchTerm,
        onClearSearch: () => setRequestSearchTerm(""),
        searchPlaceholder: "Search visitor, email, purpose, date, or office...",
        filterSubtitle: "Prioritize overdue requests or sort by the appointment schedule.",
        hasFilters: requestFilter !== "all" || requestSort !== "priority",
        onResetFilters: () => {
          setRequestFilter("all");
          setRequestSort("priority");
        },
        filterGroups: [
          {
            id: "staff-request-schedule",
            label: "Schedule",
            value: requestFilter,
            icon: "calendar-outline",
            options: [
              { value: "all", label: `All (${appointmentRequests.length})` },
              { value: "overdue", label: `Overdue (${appointmentRequests.filter((item) => isOverdueAppointmentRequest(item)).length})` },
              { value: "today", label: `Today (${appointmentRequests.filter((item) => isSameCalendarDay(item.visitDate)).length})` },
              { value: "this-week", label: `This Week (${appointmentRequests.filter((item) => isWithinCurrentWeek(item.visitDate)).length})` },
            ],
            onSelect: setRequestFilter,
          },
          {
            id: "staff-request-sort",
            label: "Sort",
            value: requestSort,
            icon: "swap-vertical-outline",
            options: [
              { value: "priority", label: "Urgent first" },
              { value: "schedule", label: "Earliest schedule" },
            ],
            onSelect: setRequestSort,
          },
        ],
      })}

      {renderAppointmentTable(paginatedRequestAppointments, {
        mode: "requests",
        emptyTitle: "No pending requests",
        emptySubtitle: requestSearchTerm || requestFilter !== "all"
          ? "No request matched your search."
          : "New visitor appointment requests will appear here for approval.",
      })}

      {renderPagination({
        currentPage: requestPage,
        totalPages: requestPageCount,
        totalItems: filteredRequestAppointments.length,
        onPrevious: () => setRequestPage((currentValue) => Math.max(1, currentValue - 1)),
        onNext: () => setRequestPage((currentValue) => Math.min(requestPageCount, currentValue + 1)),
        label: "Requests",
      })}

      {detailAppointment ? renderAppointmentDetailPanel() : null}
    </View>
  );

  const renderAppointmentRecordContent = () => (
    <>
      <View style={[styles.sectionCard, mobileDarkModeEnabled && styles.darkSectionCard]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, mobileDarkModeEnabled && styles.darkText]}>Appointment Records</Text>
          <View style={styles.sectionActionRow}>
            {renderTablePrintButton({
              label: "Print Records",
              records: filteredAppointments,
              title: "Appointment Records",
              subtitle: "Generated from the staff dashboard appointment records table.",
              emptyMessage: "There are no appointment records to print.",
              totalLabel: "appointments",
            })}
            <TouchableOpacity style={styles.sectionActionIconButton} onPress={loadData}>
              <Ionicons name="refresh-outline" size={20} color="#1C6DD0" />
            </TouchableOpacity>
          </View>
        </View>

        {renderRecordSearchFilterToolbar({
          searchTitle: "Search Records",
          searchSubtitle: "Find by visitor, office, date, purpose, or status.",
          searchValue: recordSearchTerm,
          onSearchChange: setRecordSearchTerm,
          onClearSearch: () => setRecordSearchTerm(""),
          searchPlaceholder: "Search visitor, office, date, or purpose...",
          filterSubtitle: "Narrow appointment records by status.",
          hasFilters: filter !== "all",
          onResetFilters: () => setFilter("all"),
          filterGroups: [
            {
              id: "staff-record-status",
              label: "Status",
              value: filter,
              icon: "layers-outline",
              options: [
                { value: "all", label: `All (${appointmentRecords.length})` },
                { value: "approved", label: `Approved (${stats.approved})` },
                { value: "adjusted", label: `Adjusted (${stats.adjusted})` },
                { value: "rejected", label: `Rejected (${stats.rejected})` },
                { value: "completed", label: `Completed (${stats.completed})` },
                { value: "no_show", label: "No Show" },
                { value: "expired", label: "Expired" },
                { value: "cancelled", label: "Cancelled" },
              ],
              onSelect: setFilter,
            },
          ],
        })}

        {renderAppointmentTable(paginatedRecordAppointments, {
          mode: "records",
          emptyTitle: "No appointment records found",
          emptySubtitle: recordSearchTerm
            ? "No appointment record matched your search."
            : "Approved appointments will appear here after staff approval.",
        })}

        {renderPagination({
          currentPage: recordPage,
          totalPages: recordPageCount,
          totalItems: filteredAppointments.length,
          onPrevious: () => setRecordPage((currentValue) => Math.max(1, currentValue - 1)),
          onNext: () => setRecordPage((currentValue) => Math.min(recordPageCount, currentValue + 1)),
          label: "Records",
        })}

        {detailAppointment ? renderAppointmentDetailPanel() : null}
      </View>
    </>
  );

  const renderActiveVisitsContent = () => (
    <View style={[styles.sectionCard, mobileDarkModeEnabled && styles.darkSectionCard]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={[styles.sectionTitle, mobileDarkModeEnabled && styles.darkText]}>Active Visits</Text>
          <Text style={[styles.sectionSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>
            Visitors checked in by security and currently assigned to your office.
          </Text>
        </View>
        <View style={styles.sectionActionRow}>
          <View style={styles.activeVisitCountBadge}>
            <Text style={styles.activeVisitCountText}>{activeStaffVisits.length}</Text>
          </View>
          <TouchableOpacity style={styles.sectionActionIconButton} onPress={loadData}>
            <Ionicons name="refresh-outline" size={20} color="#1C6DD0" />
          </TouchableOpacity>
        </View>
      </View>

      {activeStaffVisits.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="walk-outline" size={42} color="#94A3B8" />
          <Text style={[styles.emptyTitle, mobileDarkModeEnabled && styles.darkText]}>No active visits yet</Text>
          <Text style={[styles.emptySubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>
            Ask security to tap Arrived/check in an approved visitor. They will show here and on the campus map.
          </Text>
          <TouchableOpacity style={styles.emptyRefreshButton} onPress={loadData}>
            <Ionicons name="refresh-outline" size={15} color="#0A3D91" />
            <Text style={styles.emptyRefreshButtonText}>Refresh active visits</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.activeVisitPageGrid}>
          {activeStaffVisits.map((appointment) => (
            <HomeHoverPressable
              key={appointment._id}
              style={[styles.activeVisitItem, styles.activeVisitPageItem]}
              onPress={() => openVisitManagementModal(appointment)}
            >
              <View style={styles.activeVisitTopRow}>
                <View style={styles.activeVisitAvatar}>
                  <Ionicons name="person-outline" size={18} color="#047857" />
                </View>
                <View style={styles.activeVisitCopy}>
                  <Text style={styles.activeVisitName} numberOfLines={1}>
                    {appointment.fullName || "Visitor"}
                  </Text>
                  <Text style={styles.activeVisitMeta} numberOfLines={1}>
                    {appointment.currentLocation?.office ||
                      appointment.currentDestination?.office ||
                      appointment.appointmentDepartment ||
                      "Inside campus"}
                  </Text>
                </View>
              </View>
              <Text style={styles.todaySchedulePurpose} numberOfLines={2}>
                {appointment.purposeOfVisit || "No visit purpose provided"}
              </Text>
              <View style={styles.activeVisitFooter}>
                <Text style={styles.activeVisitTime}>
                  Checked in {formatRelativeTime(appointment.checkedInAt)}
                </Text>
                <TouchableOpacity
                  style={styles.activeVisitManageButton}
                  onPress={() => openVisitManagementModal(appointment)}
                >
                  <Text style={styles.activeVisitManageText}>Manage</Text>
                </TouchableOpacity>
              </View>
            </HomeHoverPressable>
          ))}
        </View>
      )}

      {detailAppointment ? renderAppointmentDetailPanel() : null}
    </View>
  );

  const renderAccountInfoContent = () => (
    <>
      <View style={[styles.sectionCard, mobileDarkModeEnabled && styles.darkSectionCard]}>
        <View style={styles.accountProfileTopRow}>
          <View style={styles.accountProfileHeader}>
            <View style={styles.accountProfileAvatar}>
              <Text style={styles.accountProfileAvatarText}>{profileInitials}</Text>
            </View>
            <View style={styles.accountProfileCopy}>
              <Text style={[styles.accountProfileName, mobileDarkModeEnabled && styles.darkText]}>{profileName}</Text>
              <Text style={[styles.accountProfileRole, mobileDarkModeEnabled && styles.darkMutedText]}>
                {String(user?.role || "staff").toUpperCase()} ACCESS
              </Text>
            </View>
          </View>
          <View style={styles.accountProfileActions}>
            <TouchableOpacity
              style={[styles.accountTabButton, accountMode === "view" && styles.accountTabButtonActive]}
              onPress={() => setAccountMode("view")}
            >
              <Text style={[styles.accountTabButtonText, accountMode === "view" && styles.accountTabButtonTextActive]}>
                Overview
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.accountTabButton, accountMode === "edit" && styles.accountTabButtonActive]}
              onPress={() => setAccountMode("edit")}
            >
              <Text style={[styles.accountTabButtonText, accountMode === "edit" && styles.accountTabButtonTextActive]}>
                Edit Details
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.accountTabButton, accountMode === "password" && styles.accountTabButtonActive]}
              onPress={() => setAccountMode("password")}
            >
              <Text style={[styles.accountTabButtonText, accountMode === "password" && styles.accountTabButtonTextActive]}>
                Password
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.accountHeroStrip, mobileDarkModeEnabled && styles.darkNestedCard]}>
          <View style={[styles.accountHeroMetric, mobileDarkModeEnabled && styles.darkInputSurface]}>
            <Text style={[styles.accountHeroMetricLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Assigned Office</Text>
            <Text style={[styles.accountHeroMetricValue, mobileDarkModeEnabled && styles.darkText]}>{user?.department || "Not assigned"}</Text>
          </View>
          <View style={[styles.accountHeroMetric, mobileDarkModeEnabled && styles.darkInputSurface]}>
            <Text style={[styles.accountHeroMetricLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Staff ID</Text>
            <Text style={[styles.accountHeroMetricValue, mobileDarkModeEnabled && styles.darkText]}>
              {user?.staffId || user?.employeeId || "Pending"}
            </Text>
          </View>
          <View style={[styles.accountHeroMetric, mobileDarkModeEnabled && styles.darkInputSurface]}>
            <Text style={[styles.accountHeroMetricLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Account Status</Text>
            <Text style={[styles.accountHeroMetricValue, mobileDarkModeEnabled && styles.darkText]}>
              {String(user?.status || "active").toUpperCase()}
            </Text>
          </View>
        </View>

        {accountMode === "view" ? (
          <>
            <View style={styles.accountSectionHeader}>
              <Text style={[styles.accountSectionTitle, mobileDarkModeEnabled && styles.darkText]}>Profile Overview</Text>
              <Text style={[styles.accountSectionSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>
                Your core staff account details and current office assignment.
              </Text>
            </View>

            <View style={styles.accountInfoGrid}>
              <View style={[styles.accountInfoItem, mobileDarkModeEnabled && styles.darkNestedCard]}>
                <Text style={[styles.accountInfoLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Email</Text>
                <Text style={[styles.accountInfoValue, mobileDarkModeEnabled && styles.darkText]}>{user?.email || "N/A"}</Text>
              </View>
              <View style={[styles.accountInfoItem, mobileDarkModeEnabled && styles.darkNestedCard]}>
                <Text style={[styles.accountInfoLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Username</Text>
                <Text style={[styles.accountInfoValue, mobileDarkModeEnabled && styles.darkText]}>{user?.username || "N/A"}</Text>
              </View>
              <View style={[styles.accountInfoItem, mobileDarkModeEnabled && styles.darkNestedCard]}>
                <Text style={[styles.accountInfoLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Staff ID</Text>
                <Text style={[styles.accountInfoValue, mobileDarkModeEnabled && styles.darkText]}>
                  {user?.staffId || user?.employeeId || "Not assigned"}
                </Text>
              </View>
              <View style={[styles.accountInfoItem, mobileDarkModeEnabled && styles.darkNestedCard]}>
                <Text style={[styles.accountInfoLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Department</Text>
                <Text style={[styles.accountInfoValue, mobileDarkModeEnabled && styles.darkText]}>{user?.department || "Not assigned"}</Text>
              </View>
              <View style={[styles.accountInfoItem, mobileDarkModeEnabled && styles.darkNestedCard]}>
                <Text style={[styles.accountInfoLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Contact Number</Text>
                <Text style={[styles.accountInfoValue, mobileDarkModeEnabled && styles.darkText]}>
                  {user?.phone || user?.phoneNumber || user?.contactNumber || "N/A"}
                </Text>
              </View>
              <View style={[styles.accountInfoItem, mobileDarkModeEnabled && styles.darkNestedCard]}>
                <Text style={[styles.accountInfoLabel, mobileDarkModeEnabled && styles.darkMutedText]}>Status</Text>
                <Text style={[styles.accountInfoValue, mobileDarkModeEnabled && styles.darkText]}>{user?.status || "active"}</Text>
              </View>
            </View>

            <View style={[styles.accountNoticeCard, mobileDarkModeEnabled && styles.darkNestedCard]}>
              <Ionicons name="information-circle-outline" size={18} color="#1C6DD0" />
              <Text style={[styles.accountNoticeText, mobileDarkModeEnabled && styles.darkMutedText]}>
                Your department and staff ID are managed by admin. Personal details and password can be updated here anytime.
              </Text>
            </View>
          </>
        ) : null}

        {accountMode === "edit" ? (
          <View style={styles.accountEditForm}>
            <View style={styles.accountSectionHeader}>
              <Text style={[styles.accountSectionTitle, mobileDarkModeEnabled && styles.darkText]}>Edit Personal Details</Text>
              <Text style={[styles.accountSectionSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>
                Keep your contact information and login details accurate.
              </Text>
            </View>

            <View style={styles.accountEditGrid}>
              <View style={styles.accountField}>
                <Text style={styles.accountFieldLabel}>First Name</Text>
                <TextInput
                  value={profileForm.firstName}
                  onChangeText={(value) => handleProfileInputChange("firstName", value)}
                  placeholder="First name"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                />
              </View>
              <View style={styles.accountField}>
                <Text style={styles.accountFieldLabel}>Last Name</Text>
                <TextInput
                  value={profileForm.lastName}
                  onChangeText={(value) => handleProfileInputChange("lastName", value)}
                  placeholder="Last name"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                />
              </View>
              <View style={styles.accountField}>
                <Text style={styles.accountFieldLabel}>Email</Text>
                <TextInput
                  value={profileForm.email}
                  onChangeText={(value) => handleProfileInputChange("email", value)}
                  placeholder="Email address"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
              <View style={styles.accountField}>
                <Text style={styles.accountFieldLabel}>Username</Text>
                <TextInput
                  value={profileForm.username}
                  onChangeText={(value) => handleProfileInputChange("username", value)}
                  placeholder="Username"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.accountFieldFull}>
                <Text style={styles.accountFieldLabel}>Contact Number</Text>
                <TextInput
                  value={profileForm.phone}
                  onChangeText={(value) => handleProfileInputChange("phone", value)}
                  placeholder="Contact number"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.accountReadOnlyCard}>
                <Text style={styles.accountReadOnlyLabel}>Department</Text>
                <Text style={styles.accountReadOnlyValue}>{user?.department || "Not assigned"}</Text>
              </View>
              <View style={styles.accountReadOnlyCard}>
                <Text style={styles.accountReadOnlyLabel}>Staff ID</Text>
                <Text style={styles.accountReadOnlyValue}>
                  {user?.staffId || user?.employeeId || "Not assigned"}
                </Text>
              </View>
            </View>

            <View style={styles.accountFormActions}>
              <TouchableOpacity style={styles.accountSecondaryButton} onPress={() => setAccountMode("view")}>
                <Text style={styles.accountSecondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.accountPrimaryButton, profileSaving && styles.disabledAction]}
                onPress={handleSaveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.accountPrimaryButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {accountMode === "password" ? (
          <View style={styles.accountEditForm}>
            <View style={styles.accountSectionHeader}>
              <Text style={[styles.accountSectionTitle, mobileDarkModeEnabled && styles.darkText]}>Password & Security</Text>
              <Text style={[styles.accountSectionSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>
                Update your password regularly to keep your staff account secure.
              </Text>
            </View>

            <View style={styles.accountSecurityTipCard}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#0A3D91" />
              <Text style={styles.accountSecurityTipText}>
                Use at least 6 characters and avoid reusing old passwords from shared devices.
              </Text>
            </View>

            <View style={styles.accountEditGrid}>
              <View style={styles.accountFieldFull}>
                <Text style={styles.accountFieldLabel}>Current Password</Text>
                <TextInput
                  value={passwordForm.currentPassword}
                  onChangeText={(value) => handlePasswordInputChange("currentPassword", value)}
                  placeholder="Current password"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                  secureTextEntry
                />
              </View>
              <View style={styles.accountField}>
                <Text style={styles.accountFieldLabel}>New Password</Text>
                <TextInput
                  value={passwordForm.newPassword}
                  onChangeText={(value) => handlePasswordInputChange("newPassword", value)}
                  placeholder="New password"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                  secureTextEntry
                />
              </View>
              <View style={styles.accountField}>
                <Text style={styles.accountFieldLabel}>Confirm Password</Text>
                <TextInput
                  value={passwordForm.confirmPassword}
                  onChangeText={(value) => handlePasswordInputChange("confirmPassword", value)}
                  placeholder="Confirm password"
                  placeholderTextColor="#94A3B8"
                  style={styles.accountFieldInput}
                  secureTextEntry
                />
              </View>
            </View>

            <View style={styles.accountFormActions}>
              <TouchableOpacity
                style={[styles.accountPrimaryButton, passwordSaving && styles.disabledAction]}
                onPress={handleChangePassword}
                disabled={passwordSaving}
              >
                {passwordSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.accountPrimaryButtonText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );

  const renderSidebar = () => (
    <View style={[styles.sidebar, mobileDarkModeEnabled && styles.darkSidebar]}>
        <SidebarHoverPressable
          style={[styles.sidebarHeader, mobileDarkModeEnabled && styles.darkSidebarHeader]}
          onPress={() => selectSubmodule("account-info")}
          hoverScale={1.012}
        >
          <View style={styles.sidebarAvatar}>
            <Text style={styles.sidebarAvatarText}>{profileInitials}</Text>
          </View>
          <View style={styles.sidebarUserCopy}>
            <Text style={[styles.sidebarUserName, mobileDarkModeEnabled && styles.darkText]}>{profileName}</Text>
            <Text style={[styles.sidebarUserRole, mobileDarkModeEnabled && styles.darkMutedText]}>Staff Panel</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={18} color="#64748B" />
        </SidebarHoverPressable>

      <ScrollView style={styles.sidebarScroll} showsVerticalScrollIndicator={false}>
        {staffModules.map((module) => {
          const isHomeModule = module.key === "home";
          const isExpanded = isHomeModule ? true : expandedModule === module.key;
          const hasSelectedChild = isHomeModule
            ? selectedSubmodule === "home"
            : module.submodules.some((submodule) => submodule.key === selectedSubmodule);

          return (
            <View key={module.key} style={styles.sidebarModuleCard}>
              <SidebarHoverPressable
                style={[
                  styles.sidebarModuleButton,
                  mobileDarkModeEnabled && styles.darkSidebarModuleButton,
                  hasSelectedChild && styles.sidebarModuleButtonActive,
                  mobileDarkModeEnabled && hasSelectedChild && styles.darkSidebarModuleButtonActive,
                ]}
                onPress={() => toggleModule(module.key)}
                hoverScale={1.012}
              >
                <View style={[styles.sidebarModuleIcon, { backgroundColor: `${module.color}18` }]}>
                  <Ionicons name={module.icon} size={20} color={module.color} />
                </View>
                <Text
                  style={[
                    styles.sidebarModuleLabel,
                    mobileDarkModeEnabled && styles.darkMutedText,
                    hasSelectedChild && styles.sidebarModuleLabelActive,
                    mobileDarkModeEnabled && hasSelectedChild && styles.darkText,
                  ]}
                >
                  {module.label}
                </Text>
                <Ionicons
                  name={
                    isHomeModule
                      ? "chevron-forward-outline"
                      : isExpanded
                        ? "chevron-up-outline"
                        : "chevron-down-outline"
                  }
                  size={18}
                  color={hasSelectedChild ? module.color : "#64748B"}
                />
              </SidebarHoverPressable>

              {!isHomeModule && isExpanded ? (
                <View style={[styles.sidebarSubmoduleList, mobileDarkModeEnabled && styles.darkSidebarSubmoduleList]}>
                  {module.submodules.map((submodule) => {
                    const isActive = selectedSubmodule === submodule.key;
                    return (
                      <SidebarHoverPressable
                        key={submodule.key}
                        style={[
                          styles.sidebarSubmoduleButton,
                          mobileDarkModeEnabled && styles.darkSidebarSubmoduleButton,
                          isActive && styles.sidebarSubmoduleButtonActive,
                          mobileDarkModeEnabled && isActive && styles.darkSidebarSubmoduleButtonActive,
                        ]}
                        onPress={() => selectSubmodule(submodule.key)}
                        hoverScale={1.012}
                      >
                        <Text
                          style={[
                            styles.sidebarSubmoduleLabel,
                            mobileDarkModeEnabled && styles.darkMutedText,
                            isActive && styles.sidebarSubmoduleLabelActive,
                            mobileDarkModeEnabled && isActive && styles.darkText,
                          ]}
                        >
                          {submodule.label}
                        </Text>
                        {submodule.badge ? (
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
      </ScrollView>

      <SidebarHoverPressable
        style={styles.logoutButton}
        onPress={handleLogout}
        hoverScale={1.012}
        disabled={isSigningOut}
      >
        {isSigningOut ? (
          <ActivityIndicator size="small" color="#DC2626" />
        ) : (
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        )}
        <Text style={styles.logoutButtonText}>
          {isSigningOut ? "Signing Out..." : "Sign Out"}
        </Text>
      </SidebarHoverPressable>
    </View>
  );

  const renderActiveContent = () => {
    if (selectedSubmodule === "appointment-request") {
      return renderAppointmentRequestContent();
    }

    if (selectedSubmodule === "appointment-record") {
      return renderAppointmentRecordContent();
    }

    if (selectedSubmodule === "active-visits") {
      return renderActiveVisitsContent();
    }

    if (selectedSubmodule === "account-info") {
      return renderAccountInfoContent();
    }

    return renderHomeContent();
  };

  const renderMobileHeader = () => (
    <View style={staffMobileStyles.header}>
      <View style={staffMobileStyles.headerTop}>
        <View style={staffMobileStyles.avatar}>
          <Text style={staffMobileStyles.avatarText}>{profileInitials}</Text>
        </View>
        <View style={staffMobileStyles.headerActions}>
          <TouchableOpacity
            style={staffMobileStyles.headerIconButton}
            onPress={() => setMobileTab("notifications")}
          >
            <Ionicons name="notifications-outline" size={19} color={BRAND.blue} />
            {unreadNotificationsCount ? <View style={staffMobileStyles.dotBadge} /> : null}
          </TouchableOpacity>
          <TouchableOpacity style={staffMobileStyles.headerIconButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={19} color={BRAND.blue} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={staffMobileStyles.eyebrow}>Staff Mobile</Text>
      <Text style={staffMobileStyles.headerTitle}>Appointment Desk</Text>
      <Text style={staffMobileStyles.headerSubtitle}>
        Review requests, track today&apos;s visitors, and keep your office queue moving.
      </Text>
      <View style={staffMobileStyles.headerStats}>
        {[
          ["Pending", stats.pending],
          ["Today", todaysSchedule.length],
          ["Inside", checkedInNowCount],
        ].map(([label, value]) => (
          <View key={label} style={staffMobileStyles.headerStatItem}>
            <Text style={staffMobileStyles.headerStatValue}>{value}</Text>
            <Text style={staffMobileStyles.headerStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderMobileStats = () => (
    <View style={staffMobileStyles.statsGrid}>
      {[
        { label: "Pending", value: stats.pending, icon: "mail-unread-outline", color: BRAND.warning },
        { label: "Today", value: todaysSchedule.length, icon: "today-outline", color: BRAND.blue },
        { label: "Inside", value: checkedInNowCount, icon: "walk-outline", color: BRAND.success },
      ].map((item) => (
        <View key={item.label} style={[staffMobileStyles.statCard, mobileDarkModeEnabled && staffMobileStyles.darkCard]}>
          <Ionicons name={item.icon} size={18} color={item.color} />
          <Text style={[staffMobileStyles.statValue, mobileDarkModeEnabled && staffMobileStyles.darkPrimaryText]}>{item.value}</Text>
          <Text style={[staffMobileStyles.statLabel, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );

  const renderMobileFocusPanel = () => (
    <View style={[staffMobileStyles.focusPanel, mobileDarkModeEnabled && staffMobileStyles.darkCard]}>
      <View style={[staffMobileStyles.focusIcon, { backgroundColor: `${staffMobileFocusState.color}16` }]}>
        <Ionicons name={staffMobileFocusState.icon} size={19} color={staffMobileFocusState.color} />
      </View>
      <View style={staffMobileStyles.focusCopy}>
        <Text style={[staffMobileStyles.focusTitle, mobileDarkModeEnabled && staffMobileStyles.darkPrimaryText]}>{staffMobileFocusState.title}</Text>
        <Text style={[staffMobileStyles.focusText, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]}>{staffMobileFocusState.message}</Text>
      </View>
      <TouchableOpacity
        style={staffMobileStyles.focusAction}
        onPress={() => setMobileTab(staffMobileFocusState.targetTab)}
      >
        <Text style={staffMobileStyles.focusActionText}>{staffMobileFocusState.actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMobileAppointmentCard = (appointment, mode = "request") => {
    const appointmentStatus = getAppointmentStatus(appointment);
    const canActOnRequest = isActionableAppointmentRequest(appointment);
    const isProcessing = processingId === appointment._id;
    const canManageVisit = isActiveStaffVisit(appointment);
    const actionHint = getStaffActionHint(appointment);
    const visitPhase = getStaffVisitPhase(appointment);

    return (
      <TouchableOpacity
        key={appointment._id}
        style={[staffMobileStyles.appointmentCard, mobileDarkModeEnabled && staffMobileStyles.darkCard]}
        onPress={() => setDetailAppointment(appointment)}
        activeOpacity={0.82}
      >
        <View style={staffMobileStyles.appointmentTop}>
          <View style={staffMobileStyles.appointmentAvatar}>
            <Ionicons name="person-outline" size={20} color={BRAND.blue} />
          </View>
          <View style={staffMobileStyles.appointmentMain}>
            <Text style={[staffMobileStyles.appointmentName, mobileDarkModeEnabled && staffMobileStyles.darkPrimaryText]} numberOfLines={1}>
              {appointment.fullName || "Visitor"}
            </Text>
            <Text style={[staffMobileStyles.appointmentPurpose, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]} numberOfLines={2}>
              {appointment.purposeOfVisit || "No visit purpose provided"}
            </Text>
            <View style={staffMobileStyles.appointmentHintRow}>
              <Ionicons
                name={canActOnRequest ? "alert-circle-outline" : "information-circle-outline"}
                size={13}
                color={canActOnRequest ? BRAND.warning : BRAND.blue}
              />
              <Text style={[staffMobileStyles.appointmentHintText, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]} numberOfLines={1}>
                {actionHint}
              </Text>
            </View>
          </View>
          <MobileStatusBadge status={appointmentStatus} label={getStatusMeta(appointmentStatus).label} />
        </View>

        <View style={staffMobileStyles.metaRow}>
          <View style={[staffMobileStyles.metaPill, mobileDarkModeEnabled && staffMobileStyles.darkPill]}>
            <Ionicons name="calendar-outline" size={14} color="#64748B" />
            <Text style={[staffMobileStyles.metaPillText, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]}>{formatDate(appointment.visitDate)}</Text>
          </View>
          <View style={[staffMobileStyles.metaPill, mobileDarkModeEnabled && staffMobileStyles.darkPill]}>
            <Ionicons name="time-outline" size={14} color="#64748B" />
            <Text style={[staffMobileStyles.metaPillText, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]}>{formatTime(appointment.visitTime)}</Text>
          </View>
          <View style={[staffMobileStyles.metaPill, mobileDarkModeEnabled && staffMobileStyles.darkPill]}>
            <Ionicons name="business-outline" size={14} color="#64748B" />
            <Text style={[staffMobileStyles.metaPillText, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]} numberOfLines={1}>
              {appointment.appointmentDepartment || appointment.assignedOffice || user?.department || "Office"}
            </Text>
          </View>
        </View>

        <View style={[staffMobileStyles.visitPhasePanel, mobileDarkModeEnabled && staffMobileStyles.darkPill]}>
          <Ionicons name={visitPhase.icon} size={16} color={visitPhase.color} />
          <View style={staffMobileStyles.visitPhaseCopy}>
            <Text style={[staffMobileStyles.visitPhaseTitle, { color: visitPhase.color }]}>{visitPhase.label}</Text>
            <Text style={[staffMobileStyles.visitPhaseText, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]}>{visitPhase.detail}</Text>
          </View>
        </View>

        {mode === "request" && canActOnRequest ? (
          <View style={staffMobileStyles.cardActions}>
            <TouchableOpacity
              style={[staffMobileStyles.actionButton, staffMobileStyles.approveButton, isProcessing && staffMobileStyles.disabledButton]}
              onPress={() => handleApprove(appointment)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                  <Text style={staffMobileStyles.approveButtonText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={staffMobileStyles.actionButton} onPress={() => openAdjustModal(appointment)} disabled={isProcessing}>
              <Ionicons name="calendar-outline" size={15} color="#334155" />
              <Text style={staffMobileStyles.actionButtonText}>Adjust</Text>
            </TouchableOpacity>
            <TouchableOpacity style={staffMobileStyles.actionButton} onPress={() => openRedirectAppointmentModal(appointment)} disabled={isProcessing}>
              <Ionicons name="swap-horizontal-outline" size={15} color="#334155" />
              <Text style={staffMobileStyles.actionButtonText}>Redirect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[staffMobileStyles.actionButton, staffMobileStyles.rejectButton]}
              onPress={() => openRejectModal(appointment)}
              disabled={isProcessing}
            >
              <Ionicons name="close-circle-outline" size={15} color={BRAND.danger} />
              <Text style={staffMobileStyles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {canManageVisit ? (
          <TouchableOpacity
            style={[staffMobileStyles.fullActionButton, isProcessing && staffMobileStyles.disabledButton]}
            onPress={() => openVisitManagementModal(appointment)}
            disabled={isProcessing}
          >
            <Ionicons name="clipboard-outline" size={17} color="#FFFFFF" />
            <Text style={staffMobileStyles.fullActionButtonText}>Manage Visit</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderMobileDashboard = () => (
    <>
      {renderMobileHeader()}
      {renderMobileStats()}
      {renderMobileFocusPanel()}
      <View style={staffVirtualStyles.card}>
        <View style={staffVirtualStyles.cardTopRow}>
          <View style={staffVirtualStyles.nfcIcon}>
            <Ionicons name="radio-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={staffVirtualStyles.cardCopy}>
            <Text style={staffVirtualStyles.eyebrow}>Staff Virtual NFC Card</Text>
            <Text style={staffVirtualStyles.title}>
              {isStaffCheckedIn ? "Currently Checked In" : "Ready for Check In"}
            </Text>
            <Text style={staffVirtualStyles.meta}>
              SafePass ID: {user?.safePassId || user?.phoneNfcUid || user?.nfcCardId || "Not assigned"}
            </Text>
          </View>
        </View>
        <View style={staffVirtualStyles.actionRow}>
          <TouchableOpacity
            style={[staffVirtualStyles.actionButton, isStaffCheckedIn && staffVirtualStyles.disabledButton]}
            onPress={() => handleStaffAttendanceTap("check_in")}
            disabled={isStaffCheckedIn || Boolean(attendanceTapLoading)}
          >
            {attendanceTapLoading === "check_in" ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={staffVirtualStyles.actionText}>Check In</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[staffVirtualStyles.actionButton, staffVirtualStyles.exitButton, !isStaffCheckedIn && staffVirtualStyles.disabledButton]}
            onPress={() => handleStaffAttendanceTap("check_out")}
            disabled={!isStaffCheckedIn || Boolean(attendanceTapLoading)}
          >
            {attendanceTapLoading === "check_out" ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={staffVirtualStyles.actionText}>Check Out</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={staffMobileStyles.sectionHeader}>
        <Text style={[staffMobileStyles.sectionTitle, mobileDarkModeEnabled && staffMobileStyles.darkPrimaryText]}>Today&apos;s Visitors</Text>
        <TouchableOpacity onPress={() => setMobileTab("visitors")}>
          <Text style={staffMobileStyles.sectionLink}>View all</Text>
        </TouchableOpacity>
      </View>
      {todaysSchedule.length ? (
        todaysSchedule.slice(0, 3).map((appointment) => renderMobileAppointmentCard(appointment, "visitor"))
      ) : (
        <MobileEmptyState dark={mobileDarkModeEnabled} icon="calendar-outline" title="No visitors today" message="Approved or adjusted visitors for your office will appear here." />
      )}
    </>
  );

  const renderMobileRequests = () => (
    <>
      <View style={staffMobileStyles.compactHeader}>
        <Text style={staffMobileStyles.compactTitle}>Appointment Requests</Text>
        <Text style={staffMobileStyles.compactSubtitle}>Approve, reject, or adjust incoming visitor requests.</Text>
      </View>
      <View style={staffMobileStyles.toolbar}>
        <MobileSearchField dark={mobileDarkModeEnabled}
          value={requestSearchTerm}
          onChangeText={setRequestSearchTerm}
          placeholder="Search visitor, office, purpose..."
        />
        <MobileFilterChips dark={mobileDarkModeEnabled} options={requestFilterOptions} value={requestFilter} onChange={setRequestFilter} />
      </View>
      {filteredRequestAppointments.length ? (
        filteredRequestAppointments.slice(0, 30).map((appointment) => renderMobileAppointmentCard(appointment, "request"))
      ) : (
        <MobileEmptyState
          dark={mobileDarkModeEnabled}
          icon="mail-open-outline"
          title={requestSearchTerm || requestFilter !== "all" ? "No matching requests" : "No pending requests"}
          message={requestSearchTerm || requestFilter !== "all" ? "Try clearing the search or choosing All." : "New appointment requests assigned to your office will show here."}
          actionLabel={requestSearchTerm || requestFilter !== "all" ? "Clear filters" : undefined}
          onAction={requestSearchTerm || requestFilter !== "all" ? () => {
            setRequestSearchTerm("");
            setRequestFilter("all");
          } : undefined}
        />
      )}
    </>
  );

  const renderMobileVisitors = () => (
    <>
      <View style={staffMobileStyles.compactHeader}>
        <Text style={staffMobileStyles.compactTitle}>Today&apos;s Visitors</Text>
        <Text style={staffMobileStyles.compactSubtitle}>Scheduled and active visitor appointments for your office.</Text>
      </View>
      {todaysSchedule.length ? (
        todaysSchedule.map((appointment) => renderMobileAppointmentCard(appointment, "visitor"))
      ) : (
        <MobileEmptyState dark={mobileDarkModeEnabled} icon="people-outline" title="No scheduled visitors" message="Approved and adjusted visitors scheduled for today will appear here." />
      )}
    </>
  );

  const renderMobileHistory = () => (
    <>
      <View style={staffMobileStyles.compactHeader}>
        <Text style={staffMobileStyles.compactTitle}>Appointment History</Text>
        <Text style={staffMobileStyles.compactSubtitle}>
          Latest registrar and office appointments from the database, sorted by appointment date.
        </Text>
      </View>
      <View style={staffMobileStyles.toolbar}>
        <MobileSearchField dark={mobileDarkModeEnabled}
          value={recordSearchTerm}
          onChangeText={setRecordSearchTerm}
          placeholder="Search appointment history..."
        />
        <MobileFilterChips dark={mobileDarkModeEnabled} options={historyFilterOptions} value={filter} onChange={setFilter} />
      </View>
      {mobileHistoryAppointments.length ? (
        <>
          <View style={staffMobileStyles.sectionHeader}>
            <Text style={staffMobileStyles.sectionTitle}>Latest by Date</Text>
            <Text style={staffMobileStyles.sectionLink}>{mobileHistoryAppointments.length} records</Text>
          </View>
          {mobileHistoryAppointments
            .slice(0, 40)
            .map((appointment) => renderMobileAppointmentCard(appointment, "history"))}
        </>
      ) : (
        <MobileEmptyState
          dark={mobileDarkModeEnabled}
          icon="archive-outline"
          title="No history found"
          message="Try a different search or status filter."
          actionLabel="Clear filters"
          onAction={() => {
            setRecordSearchTerm("");
            setFilter("all");
          }}
        />
      )}
    </>
  );

  const renderMobileNotifications = () => (
    <>
      <View style={staffMobileStyles.compactHeader}>
        <Text style={staffMobileStyles.compactTitle}>Notifications</Text>
        <Text style={staffMobileStyles.compactSubtitle}>Latest request and appointment updates.</Text>
      </View>
      {notifications.length ? (
        notifications.slice(0, 40).map((notification) => {
          const meta = getNotificationMeta(notification);
          return (
            <TouchableOpacity
              key={notification._id}
              style={[staffMobileStyles.notificationCard, mobileDarkModeEnabled && staffMobileStyles.darkCard]}
              onPress={() => handleNotificationPress(notification)}
            >
              <View style={[staffMobileStyles.notificationIcon, { backgroundColor: `${meta.accent}16` }]}>
                <Ionicons name={meta.icon} size={18} color={meta.accent} />
              </View>
              <View style={staffMobileStyles.notificationCopy}>
                <Text style={[staffMobileStyles.notificationTitle, mobileDarkModeEnabled && staffMobileStyles.darkPrimaryText]}>{notification.title || meta.label}</Text>
                <Text style={[staffMobileStyles.notificationMessage, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]} numberOfLines={2}>{notification.message || "No message provided."}</Text>
                <Text style={[staffMobileStyles.notificationTime, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]}>{formatRelativeTime(notification.createdAt)}</Text>
              </View>
              {!isNotificationRead(notification) ? <View style={staffMobileStyles.notificationUnreadDot} /> : null}
            </TouchableOpacity>
          );
        })
      ) : (
        <MobileEmptyState dark={mobileDarkModeEnabled} icon="notifications-off-outline" title="No notifications" message="Staff notifications will appear here." />
      )}
    </>
  );

  const renderMobileProfile = () => {
    const isEditingProfile = accountMode === "edit";
    const renderProfileInput = (label, field, options = {}) => (
      <View style={staffMobileStyles.profileField} key={field}>
        <Text style={staffMobileStyles.profileLabel}>{label}</Text>
        <TextInput
          style={staffMobileStyles.profileInput}
          value={profileForm[field] || ""}
          onChangeText={(value) => handleProfileInputChange(field, value)}
          placeholder={label}
          placeholderTextColor="#94A3B8"
          autoCapitalize={options.autoCapitalize || "words"}
          keyboardType={options.keyboardType || "default"}
          editable={!profileSaving}
        />
      </View>
    );

    return (
      <>
        <View style={staffMobileStyles.compactHeader}>
          <View style={staffMobileStyles.profileHeaderRow}>
            <View style={staffMobileStyles.profileHeaderCopy}>
              <Text style={staffMobileStyles.compactTitle}>Staff Profile</Text>
              <Text style={staffMobileStyles.compactSubtitle}>Update your photo, contact details, and staff account.</Text>
            </View>
            <TouchableOpacity
              style={staffMobileStyles.profileEditButton}
              onPress={() => {
                if (isEditingProfile) {
                  setProfileForm({
                    firstName: user?.firstName || "",
                    lastName: user?.lastName || "",
                    email: user?.email || "",
                    username: user?.username || "",
                    phone: user?.phone || user?.phoneNumber || user?.contactNumber || "",
                    profilePhoto: user?.profilePhoto || null,
                  });
                  setAccountMode("view");
                } else {
                  setAccountMode("edit");
                }
              }}
              disabled={profileSaving}
            >
              <Ionicons name={isEditingProfile ? "close-outline" : "create-outline"} size={18} color={BRAND.blue} />
              <Text style={staffMobileStyles.profileEditButtonText}>{isEditingProfile ? "Cancel" : "Edit"}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[staffMobileStyles.profileCard, mobileDarkModeEnabled && staffMobileStyles.darkCard]}>
          <View style={staffMobileStyles.profileTop}>
            <TouchableOpacity
              style={staffMobileStyles.profileAvatar}
              onPress={handleStaffProfilePhotoPress}
              activeOpacity={isEditingProfile ? 0.82 : 1}
            >
              {(isEditingProfile ? profileForm.profilePhoto : user?.profilePhoto) ? (
                <Image source={{ uri: isEditingProfile ? profileForm.profilePhoto : user?.profilePhoto }} style={staffMobileStyles.profileAvatarImage} />
              ) : (
                <Text style={staffMobileStyles.profileAvatarText}>{profileInitials}</Text>
              )}
              {isEditingProfile ? (
                <View style={staffMobileStyles.profileCameraBadge}>
                  <Ionicons name="camera-outline" size={15} color="#FFFFFF" />
                </View>
              ) : null}
            </TouchableOpacity>
            <View style={staffMobileStyles.profileCopy}>
              <Text style={[staffMobileStyles.profileName, mobileDarkModeEnabled && staffMobileStyles.darkPrimaryText]}>{profileName}</Text>
              <Text style={[staffMobileStyles.profileRole, mobileDarkModeEnabled && staffMobileStyles.darkMutedText]}>Staff Panel</Text>
            </View>
          </View>
          {isEditingProfile ? (
            <>
              <View style={staffMobileStyles.profileFormGrid}>
                {renderProfileInput("First Name", "firstName")}
                {renderProfileInput("Last Name", "lastName")}
                {renderProfileInput("Username", "username", { autoCapitalize: "none" })}
                {renderProfileInput("Email", "email", { autoCapitalize: "none", keyboardType: "email-address" })}
                {renderProfileInput("Contact", "phone", { keyboardType: "phone-pad" })}
              </View>
              <TouchableOpacity
                style={[staffMobileStyles.saveProfileButton, profileSaving && staffMobileStyles.disabledButton]}
                onPress={handleSaveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={staffMobileStyles.saveProfileButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            [
              ["Email", user?.email],
              ["Department", user?.department || "Not assigned"],
              ["Staff ID", user?.staffId || user?.employeeId || "Not assigned"],
              ["Contact", user?.phone || user?.phoneNumber || "Not configured"],
            ].map(([label, value]) => (
              <View key={label} style={staffMobileStyles.profileRow}>
                <Text style={staffMobileStyles.profileLabel}>{label}</Text>
                <Text style={staffMobileStyles.profileValue}>{value}</Text>
              </View>
            ))
          )}
        </View>
        <TouchableOpacity style={[staffMobileStyles.logoutFullButton, mobileDarkModeEnabled && staffMobileStyles.darkDangerButton]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={staffMobileStyles.logoutFullButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </>
    );
  };

  const renderMobileDetailModal = () => (
    <Modal visible={Boolean(detailAppointment)} transparent animationType="slide" onRequestClose={() => setDetailAppointment(null)}>
      <View style={staffMobileStyles.modalOverlay}>
        <View style={staffMobileStyles.detailSheet}>
          <View style={staffMobileStyles.detailHeader}>
            <View>
              <Text style={staffMobileStyles.detailTitle}>{detailAppointment?.fullName || "Visitor Details"}</Text>
              <Text style={staffMobileStyles.detailSubtitle}>{detailAppointment?.purposeOfVisit || "No purpose provided"}</Text>
            </View>
            <TouchableOpacity style={staffMobileStyles.closeButton} onPress={() => setDetailAppointment(null)}>
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>
          {detailAppointment ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={staffMobileStyles.detailBody}>
              <MobileStatusBadge status={getAppointmentStatus(detailAppointment)} label={getStatusMeta(getAppointmentStatus(detailAppointment)).label} />
              {[
                ["Email", detailAppointment.email || "No email"],
                ["Phone", detailAppointment.phoneNumber || detailAppointment.phone || "No phone"],
                ["Schedule", `${formatDate(detailAppointment.visitDate)} at ${formatTime(detailAppointment.visitTime)}`],
                ["Office", detailAppointment.appointmentDepartment || detailAppointment.assignedOffice || "Assigned department"],
                ["Next Destination", detailAppointment.currentDestination?.office || detailAppointment.appointmentDepartment || detailAppointment.assignedOffice || "Assigned department"],
                ["Current Location", detailAppointment.currentLocation?.office || "Not tapped inside campus yet"],
                ["Checked In", formatDateTime(detailAppointment.checkedInAt)],
                ["Checked Out", formatDateTime(detailAppointment.checkedOutAt)],
              ].map(([label, value]) => (
                <View key={label} style={staffMobileStyles.detailRow}>
                  <Text style={staffMobileStyles.detailLabel}>{label}</Text>
                  <Text style={staffMobileStyles.detailValue}>{value}</Text>
                </View>
              ))}
              {isActiveStaffVisit(detailAppointment) ? (
                <View style={staffMobileStyles.visitManageActions}>
                  <TouchableOpacity
                    style={[staffMobileStyles.fullActionButton, processingId === detailAppointment._id && staffMobileStyles.disabledButton]}
                    onPress={() => handleComplete(detailAppointment, { skipConfirmation: true })}
                    disabled={processingId === detailAppointment._id}
                  >
                    {processingId === detailAppointment._id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="checkmark-done-outline" size={17} color="#FFFFFF" />
                    )}
                    <Text style={staffMobileStyles.fullActionButtonText}>Done</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[staffMobileStyles.fullActionButton, staffMobileStyles.redirectVisitButton]}
                    onPress={() => handleRedirectVisitor(detailAppointment)}
                    disabled={processingId === detailAppointment._id}
                  >
                    <Ionicons name="navigate-outline" size={17} color="#FFFFFF" />
                    <Text style={staffMobileStyles.fullActionButtonText}>Redirect</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  const renderMobileLogoutModal = () => (
    <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={closeLogoutModal}>
      <View style={staffMobileStyles.modalOverlay}>
        <View style={staffMobileStyles.logoutSheet}>
          <View style={staffMobileStyles.logoutSheetIcon}>
            <Ionicons name="log-out-outline" size={24} color={BRAND.danger} />
          </View>
          <Text style={staffMobileStyles.logoutSheetTitle}>Sign out?</Text>
          <Text style={staffMobileStyles.logoutSheetText}>
            You will return to the role selection screen and need to sign in again.
          </Text>
          <View style={staffMobileStyles.logoutSheetActions}>
            <TouchableOpacity
              style={staffMobileStyles.logoutSheetCancel}
              onPress={closeLogoutModal}
              disabled={isSigningOut}
            >
              <Text style={staffMobileStyles.logoutSheetCancelText}>Stay Signed In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[staffMobileStyles.logoutSheetConfirm, isSigningOut && staffMobileStyles.disabledButton]}
              onPress={confirmLogout}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="log-out-outline" size={17} color="#FFFFFF" />
              )}
              <Text style={staffMobileStyles.logoutSheetConfirmText}>
                {isSigningOut ? "Signing Out..." : "Sign Out"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderMobileStaffScreen = () => {
    const content =
      mobileTab === "requests"
        ? renderMobileRequests()
        : mobileTab === "visitors"
          ? renderMobileVisitors()
          : mobileTab === "history"
            ? renderMobileHistory()
            : mobileTab === "profile"
              ? renderMobileProfile()
              : mobileTab === "notifications"
                ? renderMobileNotifications()
                : renderMobileDashboard();

    return (
      <SafeAreaView style={[staffMobileStyles.safeArea, mobileDarkModeEnabled && staffMobileStyles.darkSafeArea]}>
        <StatusBar barStyle={mobileDarkModeEnabled ? "light-content" : "dark-content"} backgroundColor={mobileDarkModeEnabled ? "#07111F" : BRAND.page} />
        <ScrollView
          style={[staffMobileStyles.scroll, mobileDarkModeEnabled && staffMobileStyles.darkSafeArea]}
          contentContainerStyle={staffMobileStyles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND.blue} />}
        >
          <MobileConnectionBanner
            dark={mobileDarkModeEnabled}
            visible={!!loadError && !!user}
            title="SafePass server unavailable"
            message={loadError}
            onRetry={() => {
              setRefreshing(true);
              loadData();
            }}
            style={{ marginBottom: 14 }}
          />
          {content}
        </ScrollView>
        <MobileBottomNav
          dark={mobileDarkModeEnabled}
          tabs={staffMobileNavTabs}
          activeTab={mobileTab}
          onChange={(tabKey) => {
            if (tabKey === "profile") {
              openSharedProfile();
              return;
            }
            setMobileTab(tabKey);
          }}
        />
        {renderMobileDetailModal()}
        {renderMobileLogoutModal()}
        <ToastNotice
          visible={toast.visible}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={closeStaffToast}
          style={staffMobileStyles.toast}
        />
      </SafeAreaView>
    );
  };

  if (loading) {
    return isPhoneLayout ? (
      <MobileLoadingState dark={mobileDarkModeEnabled} message="Loading staff appointments..." />
    ) : (
      <SafeAreaView style={styles.loadingContainer}>
        <Image
          source={require("../assets/LogoSapphire.jpg")}
          resizeMode="contain"
          style={{ width: 116, height: 58, marginBottom: 18 }}
        />
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={styles.loadingText}>Loading staff appointments...</Text>
        <Text style={styles.loadingSubtext}>Restoring requests, records, and notifications.</Text>
      </SafeAreaView>
    );
  }

  if (loadError && !user) {
    return isPhoneLayout ? (
      <SafeAreaView style={[staffMobileStyles.safeArea, mobileDarkModeEnabled && staffMobileStyles.darkSafeArea]}>
        <View style={staffMobileStyles.stateWrap}>
          <MobileEmptyState
            dark={mobileDarkModeEnabled}
            icon="cloud-offline-outline"
            title="Staff dashboard unavailable"
            message={loadError}
            actionLabel="Try again"
            onAction={() => {
              setLoading(true);
              loadData();
            }}
          />
        </View>
      </SafeAreaView>
    ) : (
      <SafeAreaView style={styles.loadingContainer}>
        <MobileEmptyState
          icon="cloud-offline-outline"
          title="Staff dashboard unavailable"
          message={loadError}
          actionLabel="Try again"
          onAction={() => {
            setLoading(true);
            loadData();
          }}
        />
      </SafeAreaView>
    );
  }

  const selectedSubmoduleMeta = getSelectedSubmoduleMeta();

  if (isPhoneLayout) {
    return renderMobileStaffScreen();
  }

  return (
    <SafeAreaView style={[styles.safeArea, mobileDarkModeEnabled && styles.darkSafeArea]}>
      <View style={[styles.dashboardLayout, mobileDarkModeEnabled && styles.darkDashboardLayout]}>
        {renderSidebar()}

        <View style={styles.contentArea}>
          <ScrollView
            ref={contentScrollRef}
            style={styles.contentScroll}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0A3D91"
                colors={["#0A3D91"]}
                title="Refreshing dashboard..."
                titleColor="#0A3D91"
              />
            }
            contentContainerStyle={styles.scrollContent}
          >
            <MobileConnectionBanner
              dark={mobileDarkModeEnabled}
              visible={!!loadError && !!user}
              title="SafePass server unavailable"
              message={loadError}
              onRetry={() => {
                setRefreshing(true);
                loadData();
              }}
              style={{ marginBottom: 16 }}
            />
            <View style={[styles.pageHeaderCard, mobileDarkModeEnabled && styles.darkPageHeaderCard]}>
              <Text style={[styles.pageEyebrow, mobileDarkModeEnabled && styles.darkMutedText]}>Staff Module</Text>
              <Text style={[styles.pageTitle, mobileDarkModeEnabled && styles.darkText]}>{selectedSubmoduleMeta.title}</Text>
              <Text style={[styles.pageSubtitle, mobileDarkModeEnabled && styles.darkMutedText]}>{selectedSubmoduleMeta.subtitle}</Text>
            </View>

            {renderActiveContent()}
          </ScrollView>
        </View>
      </View>

      <ToastNotice
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={closeStaffToast}
      />

      <Modal visible={showAdjustModal} transparent animationType="fade" onRequestClose={closeAdjustModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adjust Appointment Time</Text>
            <Text style={styles.modalSubtitle}>
              Update the visitor's preferred schedule before approving the appointment.
            </Text>

            <TouchableOpacity style={styles.modalField} onPress={handleAdjustDatePress}>
              <View style={styles.modalFieldTop}>
                <View style={styles.modalFieldIcon}>
                  <Ionicons name="calendar-outline" size={18} color="#041E42" />
                </View>
                <View style={styles.modalFieldBody}>
                  <Text style={styles.modalFieldLabel}>Preferred Date</Text>
                  <Text style={styles.modalFieldValue}>{formatDate(adjustedDate)}</Text>
                  <Text style={styles.modalFieldHint}>Tap to choose a calendar date</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalField} onPress={handleAdjustTimePress}>
              <View style={styles.modalFieldTop}>
                <View style={[styles.modalFieldIcon, styles.modalFieldIconWarm]}>
                  <Ionicons name="time-outline" size={18} color="#D97706" />
                </View>
                <View style={styles.modalFieldBody}>
                  <Text style={styles.modalFieldLabel}>Preferred Time</Text>
                  <Text style={styles.modalFieldValue}>{formatTime(adjustedTime)}</Text>
                  <Text style={styles.modalFieldHint}>Tap to choose an updated time slot</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            <TextInput
              value={adjustmentNote}
              onChangeText={setAdjustmentNote}
              placeholder="Add a note for the visitor"
              placeholderTextColor="#94A3B8"
              style={[styles.modalInput, styles.modalTextarea]}
              multiline
            />

            {Platform.OS === "web" ? (
              <input
                ref={webDateInputRef}
                type="date"
                value={getWebDateInputValue()}
                onChange={handleWebDateChange}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  opacity: 0,
                  pointerEvents: "none",
                }}
                aria-label="Adjust appointment date"
              />
            ) : null}

            {Platform.OS === "web" ? (
              <input
                ref={webTimeInputRef}
                type="time"
                value={getWebTimeInputValue()}
                onChange={handleWebTimeChange}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  opacity: 0,
                  pointerEvents: "none",
                }}
                aria-label="Adjust appointment time"
              />
            ) : null}

            {Platform.OS !== "web" && showDatePicker ? (
              <DateTimePicker
                value={adjustedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleAdjustDateChange}
              />
            ) : null}

            {Platform.OS !== "web" && showTimePicker ? (
              <DateTimePicker
                value={adjustedTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleAdjustTimeChange}
              />
            ) : null}

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeAdjustModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={submitAdjustment}>
                <Text style={styles.modalSubmitText}>Save Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRedirectAppointmentModal} transparent animationType="fade" onRequestClose={closeRedirectAppointmentModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Redirect Appointment</Text>
            <Text style={styles.modalSubtitle}>
              Send this request to the correct office. The visitor and receiving staff will be notified.
            </Text>

            <View style={styles.redirectOfficeGrid}>
              {staffRedirectDestinations.map((office) => {
                const isCurrentOffice =
                  String(office).trim().toLowerCase() ===
                  String(selectedAppointment?.appointmentDepartment || selectedAppointment?.assignedOffice || "").trim().toLowerCase();
                const isSelected = redirectAppointmentOffice === office;
                return (
                  <TouchableOpacity
                    key={office}
                    style={[
                      styles.redirectOfficeChip,
                      isSelected && styles.redirectOfficeChipSelected,
                      isCurrentOffice && styles.redirectOfficeChipDisabled,
                    ]}
                    onPress={() => !isCurrentOffice && setRedirectAppointmentOffice(office)}
                    disabled={isCurrentOffice}
                  >
                    <Text
                      style={[
                        styles.redirectOfficeChipText,
                        isSelected && styles.redirectOfficeChipTextSelected,
                        isCurrentOffice && styles.redirectOfficeChipTextDisabled,
                      ]}
                    >
                      {office}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              value={redirectAppointmentNote}
              onChangeText={setRedirectAppointmentNote}
              placeholder="Add a short note for the receiving office and visitor"
              placeholderTextColor="#94A3B8"
              style={[styles.modalInput, styles.modalTextarea]}
              multiline
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeRedirectAppointmentModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, processingId === selectedAppointment?._id && styles.disabledAction]}
                onPress={submitAppointmentRedirect}
                disabled={processingId === selectedAppointment?._id}
              >
                {processingId === selectedAppointment?._id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showVisitManagementModal} transparent animationType="fade" onRequestClose={closeVisitManagementModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Manage Visitor Visit</Text>
            <Text style={styles.modalSubtitle}>
              Use this after security has checked the visitor in. Mark the visit done or redirect the visitor to another office.
            </Text>

            <View style={styles.visitManagementSummary}>
              <View style={styles.visitManagementSummaryRow}>
                <Text style={styles.detailLabel}>Visitor</Text>
                <Text style={styles.detailValue}>{selectedAppointment?.fullName || "Visitor"}</Text>
              </View>
              <View style={styles.visitManagementSummaryRow}>
                <Text style={styles.detailLabel}>Office</Text>
                <Text style={styles.detailValue}>
                  {selectedAppointment?.currentDestination?.office ||
                    selectedAppointment?.appointmentDepartment ||
                    selectedAppointment?.assignedOffice ||
                    "Assigned department"}
                </Text>
              </View>
              <View style={styles.visitManagementSummaryRow}>
                <Text style={styles.detailLabel}>Schedule</Text>
                <Text style={styles.detailValue}>
                  {formatDate(selectedAppointment?.visitDate)} at {formatTime(selectedAppointment?.visitTime)}
                </Text>
              </View>
              <View style={styles.visitManagementSummaryRow}>
                <Text style={styles.detailLabel}>Current Location</Text>
                <Text style={styles.detailValue}>
                  {selectedAppointment?.currentLocation?.office || "Not tapped inside an office yet"}
                </Text>
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeVisitManagementModal}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSecondaryAction, processingId === selectedAppointment?._id && styles.disabledAction]}
                onPress={() => selectedAppointment && handleRedirectVisitor(selectedAppointment)}
                disabled={!selectedAppointment || processingId === selectedAppointment?._id}
              >
                <Text style={styles.modalSecondaryActionText}>Redirect</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, processingId === selectedAppointment?._id && styles.disabledAction]}
                onPress={() => selectedAppointment && handleComplete(selectedAppointment, { skipConfirmation: true })}
                disabled={!selectedAppointment || processingId === selectedAppointment?._id}
              >
                {processingId === selectedAppointment?._id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Done</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRejectModal} transparent animationType="fade" onRequestClose={closeRejectModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Appointment</Text>
            <Text style={styles.modalSubtitle}>
              Add a reason so the visitor understands why the request was declined.
            </Text>
            <TextInput
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Reason for rejection"
              placeholderTextColor="#94A3B8"
              style={[styles.modalInput, styles.modalTextarea]}
              multiline
            />
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeRejectModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalReject} onPress={submitRejection}>
                <Text style={styles.modalRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={closeLogoutModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.logoutModalCard]}>
            <View style={styles.logoutModalIcon}>
              <Ionicons name="log-out-outline" size={24} color="#DC2626" />
            </View>
            <Text style={styles.logoutModalTitle}>Sign out?</Text>
            <Text style={styles.logoutModalSubtitle}>
              Would you like to sign out?
            </Text>
            <View style={styles.logoutModalActionRow}>
              <TouchableOpacity
                style={styles.logoutModalCancel}
                onPress={closeLogoutModal}
                disabled={isSigningOut}
              >
                <Text style={styles.logoutModalCancelText}>Stay Signed In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutModalConfirm}
                onPress={confirmLogout}
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
                )}
                <Text style={styles.logoutModalConfirmText}>
                  {isSigningOut ? "Signing Out..." : "Sign Out"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const staffVirtualStyles = StyleSheet.create({
  webNotice: {
    backgroundColor: "#F8FBFE",
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D8E8FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  webNoticeCopy: {
    flex: 1,
  },
  webNoticeTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },
  webNoticeText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  nfcIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A3D91",
  },
  cardCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: "#475569",
  },
  statusRow: {
    marginTop: 16,
    gap: 8,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
  },
  timeText: {
    fontSize: 13,
    color: "#64748B",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  exitButton: {
    backgroundColor: "#DC2626",
  },
  disabledButton: {
    opacity: 0.45,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

const staffMobileStyles = StyleSheet.create({
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
  stateWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  header: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "#123B6D",
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
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
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#BFDBFE",
    textTransform: "uppercase",
  },
  headerTitle: {
    marginTop: 6,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#DBEAFE",
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
    color: "#BFDBFE",
    textTransform: "uppercase",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 17,
    padding: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "900",
    color: BRAND.ink,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.ink,
  },
  sectionLink: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.blue,
  },
  compactHeader: {
    borderRadius: 21,
    padding: 17,
    backgroundColor: "#123B6D",
    borderWidth: 1,
    borderColor: "#123B6D",
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
    color: "#DBEAFE",
  },
  toolbar: {
    gap: 10,
    marginBottom: 12,
  },
  appointmentCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  appointmentTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  appointmentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },
  appointmentMain: {
    flex: 1,
    minWidth: 0,
  },
  appointmentName: {
    fontSize: 16,
    fontWeight: "900",
    color: BRAND.ink,
  },
  appointmentPurpose: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  appointmentHintRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  appointmentHintText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: "#475569",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 12,
  },
  metaPill: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F8FBFE",
  },
  metaPillText: {
    maxWidth: 190,
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  visitPhasePanel: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  visitPhaseCopy: {
    flex: 1,
    minWidth: 0,
  },
  visitPhaseTitle: {
    fontSize: 12,
    fontWeight: "900",
  },
  visitPhaseText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F7",
  },
  approveButton: {
    backgroundColor: BRAND.blue,
  },
  rejectButton: {
    backgroundColor: "#FEE2E2",
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#334155",
  },
  approveButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  rejectButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.danger,
  },
  disabledButton: {
    opacity: 0.5,
  },
  fullActionButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: BRAND.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fullActionButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  visitManageActions: {
    gap: 10,
    marginTop: 4,
  },
  redirectVisitButton: {
    backgroundColor: "#0F766E",
  },
  notificationCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  notificationMessage: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  notificationTime: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
  },
  notificationUnreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: BRAND.blue,
    marginTop: 4,
  },
  profileCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    backgroundColor: "#123B6D",
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
  logoutFullButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutFullButtonText: {
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
  logoutSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
    alignItems: "center",
  },
  logoutSheetIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoutSheetTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: BRAND.ink,
  },
  logoutSheetText: {
    marginTop: 8,
    maxWidth: 290,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: BRAND.muted,
    textAlign: "center",
  },
  logoutSheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    width: "100%",
  },
  logoutSheetCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  logoutSheetCancelText: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.ink,
    textAlign: "center",
  },
  logoutSheetConfirm: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: BRAND.danger,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
  },
  logoutSheetConfirmText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
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
  darkDangerButton: {
    backgroundColor: "#1E1118",
    borderColor: "#7F1D1D",
  },
  toast: {
    top: 12,
    left: 12,
    right: 12,
    width: undefined,
    maxWidth: undefined,
  },
});
