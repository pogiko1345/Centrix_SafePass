import Alert from '../utils/Alert';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ApiService from "../utils/ApiService";
import {
  BRAND,
  MobileBottomNav,
  MobileEmptyState,
  MobileLoadingState,
  MobileStatusBadge,
} from "../components/mobile/MobileRoleComponents";

let NfcManager = null;
let NfcEvents = null;
if (Platform.OS !== "web") {
  try {
    const nfcModule = require("react-native-nfc-manager");
    NfcManager = nfcModule.default || nfcModule;
    NfcEvents = nfcModule.NfcEvents;
  } catch (error) {
    console.log("NFC module not available:", error?.message || error);
  }
}

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";

const formatTime = (value, fallback = "N/A") => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getPhilippineDateKey = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
};

const isSameCalendarDay = (value, referenceDate = new Date()) => {
  return Boolean(value && getPhilippineDateKey(value) === getPhilippineDateKey(referenceDate));
};

const formatDuration = (minutes, fallback = "0 min") => {
  const totalMinutes = Number(minutes || 0);
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return fallback;
  if (totalMinutes > 0 && totalMinutes < 1) return "< 1 min";
  if (totalMinutes === 0) return fallback;

  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;

  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
};

const formatProfileDetail = (...values) => values.filter(Boolean).join(" | ") || "Not configured";

const maskEmail = (value) => {
  const email = String(value || "").trim();
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "";

  const visiblePrefix = localPart.slice(0, 1);
  const visibleSuffix = localPart.length > 2 ? localPart.slice(-1) : "";
  const maskLength = Math.max(4, localPart.length - visiblePrefix.length - visibleSuffix.length);
  return `${visiblePrefix}${"*".repeat(maskLength)}${visibleSuffix}@${domain}`;
};

const studentTabs = [
  { key: "home", label: "Pass", icon: "id-card-outline", activeIcon: "id-card" },
  { key: "history", label: "History", icon: "time-outline", activeIcon: "time" },
  { key: "profile", label: "Profile", icon: "person-outline", activeIcon: "person" },
];

const getStudentName = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
  user?.fullName ||
  user?.email ||
  "Student";

const getStatusLabel = (record, isCurrentDay = false) => {
  if (!record && isCurrentDay) return "Not In";
  const latestAction = getLatestAttendanceAction(record);
  if (latestAction === "check_in") return "Inside";
  if (latestAction === "check_out") return "Outside";
  if (record?.status) return String(record.status).replace(/_/g, " ");
  return "Not In";
};

const getLatestAttendanceAction = (record) => {
  const history = Array.isArray(record?.checkpointHistory) ? record.checkpointHistory : [];
  const latest = [...history]
    .filter((item) => item?.action === "check_in" || item?.action === "check_out")
    .sort((left, right) => new Date(right.tappedAt || 0) - new Date(left.tappedAt || 0))[0];
  return latest?.action || "";
};

const getLatestAttendanceTime = (record, action) => {
  const history = Array.isArray(record?.checkpointHistory) ? record.checkpointHistory : [];
  const latest = [...history]
    .filter((item) => item?.action === action)
    .sort((left, right) => new Date(right.tappedAt || 0) - new Date(left.tappedAt || 0))[0];
  return latest?.tappedAt || (action === "check_in" ? record?.checkInTime : record?.checkOutTime);
};

const getDurationMinutesBetween = (startValue, endValue) => {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
};

const getAttendanceEventMeta = (action = "") => {
  if (action === "check_out") {
    return {
      label: "Checked Out",
      icon: "log-out-outline",
      color: BRAND.danger,
      status: "checked_out",
    };
  }

  return {
    label: "Checked In",
    icon: "log-in-outline",
    color: BRAND.success,
    status: "inside",
  };
};

const isNullNativeNfcError = (error) =>
  String(error?.message || error || "").toLowerCase().includes("cannot convert null value to object");

const extractStudentNfcReaderPayload = (tagData) => {
  const fallbackId = String(tagData?.id || tagData?.tagId || tagData?.serialNumber || "").trim();
  const payload = tagData?.ndefMessage?.[0]?.payload;
  if (!payload) {
    return {
      checkpointId: fallbackId || "student-phone-nfc",
      office: "Campus NFC Reader",
      floor: "Campus",
    };
  }

  let text = "";
  try {
    const bytes = Array.from(payload);
    const languageCodeLength = bytes[0] || 0;
    text = String.fromCharCode(...bytes.slice(1 + languageCodeLength));
  } catch (error) {
    text = "";
  }

  try {
    const data = JSON.parse(text);
    return {
      checkpointId: String(data.checkpointId || data.readerId || data.gateId || fallbackId || "student-phone-nfc"),
      office: String(data.office || data.location || data.readerName || "Campus NFC Reader"),
      floor: String(data.floor || "Campus"),
    };
  } catch (error) {
    return {
      checkpointId: text || fallbackId || "student-phone-nfc",
      office: text || "Campus NFC Reader",
      floor: "Campus",
    };
  }
};

export default function StudentDashboardScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tapActionLoading, setTapActionLoading] = useState("");
  const [isNfcReading, setIsNfcReading] = useState(false);
  const [nfcStatus, setNfcStatus] = useState(null);
  const [nfcAvailability, setNfcAvailability] = useState({
    moduleAvailable: false,
    supported: false,
    enabled: false,
    checked: false,
  });
  const nfcTapProcessingRef = useRef(false);
  const nativeNfcUnavailableRef = useRef(false);
  const [accountMode, setAccountMode] = useState("view");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    phone: "",
    emergencyContact: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [nowTick, setNowTick] = useState(Date.now());

  const loadAttendanceRecords = useCallback(async () => {
    const attendanceResponse = await ApiService.getMyAttendance({ limit: 30 });
    setAttendance(Array.isArray(attendanceResponse?.attendance) ? attendanceResponse.attendance : []);
  }, []);

  const loadData = useCallback(async () => {
    const [profileResponse, attendanceResponse] = await Promise.all([
      ApiService.getProfile(),
      ApiService.getMyAttendance({ limit: 30 }),
    ]);

    const profileUser = profileResponse?.user || null;
    if (!profileUser) {
      navigation.replace("Login");
      return;
    }

    setUser(profileUser);
    setAttendance(Array.isArray(attendanceResponse?.attendance) ? attendanceResponse.attendance : []);
  }, [navigation]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoadError("");
        await loadData();
      } catch (error) {
        console.error("Load student dashboard error:", error);
        setLoadError(error?.message || "Unable to load your student dashboard.");
        Alert.alert("Dashboard Error", error?.message || "Unable to load your student dashboard.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [loadData]);

  useEffect(() => {
    if (!user) return;

    setProfileForm({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      username: user?.username || "",
      phone: user?.phone || "",
      emergencyContact: user?.emergencyContact || "",
    });
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    const refreshAttendance = () => {
      loadAttendanceRecords().catch((error) => {
        console.log("Student attendance auto-refresh skipped:", error?.message || error);
      });
    };

    const unsubscribeFocus = navigation?.addListener?.("focus", refreshAttendance);
    const refreshTimer = setInterval(refreshAttendance, 5000);

    return () => {
      clearInterval(refreshTimer);
      unsubscribeFocus?.();
    };
  }, [loadAttendanceRecords, navigation, user]);

  const refreshNfcAvailability = useCallback(async ({ showDisabledAlert = false } = {}) => {
    if (Platform.OS === "web" || nativeNfcUnavailableRef.current || !NfcManager) {
      const unavailable = {
        moduleAvailable: false,
        supported: false,
        enabled: false,
        checked: true,
      };
      setNfcAvailability(unavailable);
      return unavailable;
    }

    try {
      const moduleReady =
        typeof NfcManager.isSupported === "function" &&
        typeof NfcManager.isEnabled === "function" &&
        typeof NfcManager.start === "function";
      if (!moduleReady) {
        nativeNfcUnavailableRef.current = true;
        const unavailable = {
          moduleAvailable: false,
          supported: false,
          enabled: false,
          checked: true,
        };
        setNfcAvailability(unavailable);
        return unavailable;
      }

      const supported = Boolean(await NfcManager.isSupported());
      if (!supported) {
        const unsupported = {
          moduleAvailable: true,
          supported: false,
          enabled: false,
          checked: true,
        };
        setNfcAvailability(unsupported);
        return unsupported;
      }

      await NfcManager.start();
      const enabled = Boolean(await NfcManager.isEnabled());
      const available = {
        moduleAvailable: true,
        supported: true,
        enabled,
        checked: true,
      };
      setNfcAvailability(available);

      if (!enabled && showDisabledAlert) {
        Alert.alert(
          "NFC Disabled",
          "Please enable NFC in your device settings to use phone NFC attendance.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                try {
                  NfcManager?.goToNfcSetting?.();
                } catch (error) {}
              },
            },
          ],
        );
      }

      return available;
    } catch (error) {
      if (isNullNativeNfcError(error)) {
        nativeNfcUnavailableRef.current = true;
      } else {
        console.log("Student NFC check unavailable:", error?.message || error);
      }
      const unavailable = {
        moduleAvailable: false,
        supported: false,
        enabled: false,
        checked: true,
      };
      setNfcAvailability(unavailable);
      return unavailable;
    }
  }, []);

  useEffect(() => {
    refreshNfcAvailability();
    return () => {
      stopStudentNfcReading();
    };
  }, [refreshNfcAvailability]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const openSharedProfile = () => {
    navigation.navigate("Profile");
  };

  const handleTabChange = (tabKey) => {
    if (tabKey === "profile") {
      openSharedProfile();
      return;
    }

    setActiveTab(tabKey);
  };

  const performLogout = async () => {
    try {
      await ApiService.logout();
    } catch (error) {
      console.error("Student logout error:", error);
    } finally {
      await ApiService.clearAuth();
      navigation.replace("RoleSelect");
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Would you like to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: performLogout },
      ],
    );
  };

  const todayRecord = useMemo(
    () => attendance.find((record) => isSameCalendarDay(record?.attendanceDate || record?.checkInTime)) || null,
    [attendance],
  );
  const latestTodayAction = getLatestAttendanceAction(todayRecord);
  const isCheckedIn = latestTodayAction === "check_in" || Boolean(todayRecord?.checkInTime && !todayRecord?.checkOutTime);
  const latestEntryTime = getLatestAttendanceTime(todayRecord, "check_in");
  const latestExitTime = getLatestAttendanceTime(todayRecord, "check_out");
  const roleLabel = String(user?.role || "").toLowerCase() === "teacher" ? "Teacher" : "Student";
  const studentName = getStudentName(user);
  const todayStatus = isCheckedIn
    ? "inside"
    : todayRecord?.checkOutTime
      ? "checked_out"
      : todayRecord?.status || "not_checked_in";
  const passState = isCheckedIn
    ? "inside"
    : "ready";
  const passStateLabel =
    passState === "inside"
      ? "Inside Campus"
      : latestTodayAction === "check_out"
        ? "Outside Campus"
        : "Ready To Tap";
  const passStateColor =
    passState === "inside"
      ? BRAND.success
      : BRAND.blue;
  const nextTapAction = isCheckedIn ? "check_out" : "check_in";
  const nextTapDisabled = Boolean(tapActionLoading);
  const nextTapLabel =
    passState === "inside"
      ? "Tap To Check Out"
      : "Tap Phone At Reader";
  const readerInstruction =
    passState === "inside"
      ? "Tap again at the gate reader when leaving campus."
      : latestTodayAction === "check_out"
        ? "Tap again when you return to campus. SafePass will add another entry."
        : "Use this pass at the main gate reader to record your campus entry.";
  const canUseNativeNfc = nfcAvailability.supported && nfcAvailability.enabled;
  const nfcModeLabel = canUseNativeNfc ? "NFC Ready" : "App Fallback";

  useEffect(() => {
    if (!isCheckedIn) return undefined;
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [isCheckedIn]);

  const monthStats = useMemo(() => {
    const now = new Date();
    const currentMonthKey = getPhilippineDateKey(now).slice(0, 7);
    const monthRecords = attendance.filter((item) => {
      const value = item?.attendanceDate || item?.checkInTime || item?.createdAt;
      return getPhilippineDateKey(value).slice(0, 7) === currentMonthKey;
    });
    const present = monthRecords.filter((item) =>
      ["present", "inside", "checked_out", "completed"].includes(String(item.status || "").toLowerCase()),
    ).length;
    const late = monthRecords.filter((item) => Number(item.lateMinutes || 0) > 0 || String(item.status || "").toLowerCase() === "late").length;
    const completed = monthRecords.filter((item) => item.checkInTime && item.checkOutTime).length;
    return { present, late, completed, total: monthRecords.length };
  }, [attendance]);

  const attendanceEvents = useMemo(() => {
    const events = attendance.flatMap((record) => {
      const history = Array.isArray(record?.checkpointHistory) ? record.checkpointHistory : [];
      const tapEvents = history
        .filter((item) => item?.action === "check_in" || item?.action === "check_out")
        .map((item, index) => ({
          id: `${record?._id || "attendance"}-${item.action}-${item.tappedAt || index}-${index}`,
          recordId: record?._id,
          action: item.action,
          tappedAt: item.tappedAt || (item.action === "check_in" ? record?.checkInTime : record?.checkOutTime),
          attendanceDate: record?.attendanceDate,
          location: item.office || item.checkpointName || record?.location || record?.checkpointIn || record?.checkpointOut || "Campus checkpoint",
          checkpointId: item.checkpointId || "",
          floor: item.floor || "",
          lateMinutes: record?.lateMinutes || 0,
          sessionDurationMinutes: record?.sessionDurationMinutes || 0,
        }));

      if (tapEvents.length) return tapEvents;

      return [
        record?.checkInTime
          ? {
              id: `${record?._id || "attendance"}-check-in`,
              recordId: record?._id,
              action: "check_in",
              tappedAt: record.checkInTime,
              attendanceDate: record.attendanceDate,
              location: record.location || record.checkpointIn || "Campus checkpoint",
              lateMinutes: record.lateMinutes || 0,
              sessionDurationMinutes: record.sessionDurationMinutes || 0,
            }
          : null,
        record?.checkOutTime
          ? {
              id: `${record?._id || "attendance"}-check-out`,
              recordId: record?._id,
              action: "check_out",
              tappedAt: record.checkOutTime,
              attendanceDate: record.attendanceDate,
              location: record.location || record.checkpointOut || "Campus checkpoint",
              lateMinutes: record.lateMinutes || 0,
              sessionDurationMinutes: record.sessionDurationMinutes || 0,
            }
          : null,
      ].filter(Boolean);
    });

    return events.sort((left, right) => new Date(right.tappedAt || 0) - new Date(left.tappedAt || 0));
  }, [attendance]);

  const historyStats = useMemo(() => {
    const checkIns = attendanceEvents.filter((event) => event.action === "check_in").length;
    const checkOuts = attendanceEvents.filter((event) => event.action === "check_out").length;
    return {
      checkIns,
      checkOuts,
      total: attendanceEvents.length,
    };
  }, [attendanceEvents]);

  const currentSessionDuration = useMemo(() => {
    if (!latestEntryTime) return "0 min";
    if (isCheckedIn) {
      return formatDuration(getDurationMinutesBetween(latestEntryTime, nowTick));
    }

    const savedDuration = Number(todayRecord?.sessionDurationMinutes || 0);
    if (savedDuration > 0) return formatDuration(savedDuration);
    return formatDuration(getDurationMinutesBetween(latestEntryTime, latestExitTime));
  }, [isCheckedIn, latestEntryTime, latestExitTime, nowTick, todayRecord?.sessionDurationMinutes]);

  const handleAttendanceTap = async (action, tapLocation = {}) => {
    if (tapActionLoading) return;

    setTapActionLoading(action);
    try {
      const response = await ApiService.submitMyAttendanceTap({
        action,
        source: tapLocation.source || "mobile_app",
        office: tapLocation.office || "Student Mobile Checkpoint",
        floor: tapLocation.floor || "Mobile",
        checkpointId: tapLocation.checkpointId || "student-mobile-self-check",
      });

      if (response?.attendance) {
        setAttendance((currentRecords) => [
          response.attendance,
          ...currentRecords.filter((record) => String(record._id) !== String(response.attendance._id)),
        ]);
      }

      await loadData();
      Alert.alert(
        action === "check_in" ? "Checked In" : "Checked Out",
        response?.message || "Your attendance was recorded.",
      );
    } catch (error) {
      Alert.alert("Attendance Error", error?.message || "Unable to record your attendance.");
    } finally {
      setTapActionLoading("");
    }
  };

  const processStudentNfcTap = async (tagData) => {
    if (nfcTapProcessingRef.current) return;

    nfcTapProcessingRef.current = true;
    try {
      Vibration.vibrate(80);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const tapLocation = extractStudentNfcReaderPayload(tagData);
      await handleAttendanceTap(nextTapAction, {
        ...tapLocation,
        source: "phone_nfc",
      });
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("NFC Tap Failed", error?.message || "Unable to record NFC attendance.");
    } finally {
      setTimeout(() => {
        nfcTapProcessingRef.current = false;
      }, 1000);
      stopStudentNfcReading();
    }
  };

  const startStudentNfcReading = async () => {
    if (isNfcReading) {
      await stopStudentNfcReading();
      return;
    }

    const availability = await refreshNfcAvailability({ showDisabledAlert: true });
    if (!availability.moduleAvailable) {
      Alert.alert(
        "NFC Build Required",
        "This app build does not include native NFC. Install the SafePass Android build, or use the fallback tap button.",
      );
      return;
    }

    if (!availability.supported) {
      Alert.alert("NFC Not Supported", "This phone does not support NFC. Use the fallback tap button instead.");
      return;
    }

    if (!availability.enabled) return;

    try {
      setIsNfcReading(true);
      setNfcStatus("Hold your phone near the SafePass reader tag.");
      NfcManager.setEventListener(NfcEvents.DiscoverTag, processStudentNfcTap);
      NfcManager.setEventListener(NfcEvents.SessionClosed, () => {
        setIsNfcReading(false);
        setNfcStatus(null);
      });
      await NfcManager.registerTagEvent();
    } catch (error) {
      setIsNfcReading(false);
      setNfcStatus(null);
      Alert.alert("NFC Error", error?.message || "Unable to start NFC.");
    }
  };

  const stopStudentNfcReading = async () => {
    setIsNfcReading(false);
    setNfcStatus(null);

    if (!NfcManager || !NfcEvents || nativeNfcUnavailableRef.current) return;

    try {
      await NfcManager.unregisterTagEvent();
      NfcManager.setEventListener(NfcEvents.DiscoverTag, () => {});
      NfcManager.setEventListener(NfcEvents.SessionClosed, () => {});
    } catch (error) {
      if (isNullNativeNfcError(error)) {
        nativeNfcUnavailableRef.current = true;
      } else {
        console.log("Student NFC unregister skipped:", error?.message || error);
      }
    }
  };

  const handleProfileInputChange = (field, value) => {
    setProfileForm((currentValue) => ({ ...currentValue, [field]: value }));
  };

  const handlePasswordInputChange = (field, value) => {
    setPasswordForm((currentValue) => ({ ...currentValue, [field]: value }));
  };

  const handleCancelProfileEdit = () => {
    setProfileForm({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      username: user?.username || "",
      phone: user?.phone || "",
      emergencyContact: user?.emergencyContact || "",
    });
    setAccountMode("view");
  };

  const handleSaveProfile = async () => {
    const firstName = profileForm.firstName.trim();
    const lastName = profileForm.lastName.trim();
    const email = profileForm.email.trim().toLowerCase();
    const username = profileForm.username.trim().toLowerCase();
    const phone = String(profileForm.phone || "").replace(/[^\d+]/g, "");
    const emergencyContact = profileForm.emergencyContact.trim();

    if (!firstName || !lastName) {
      Alert.alert("Missing Details", "First name and last name are required.");
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!username) {
      Alert.alert("Missing Username", "Username is required.");
      return;
    }

    if (phone && !/^(?:\+63|0)\d{10}$/.test(phone)) {
      Alert.alert(
        "Invalid Contact Number",
        "Please enter a valid Philippine mobile number like 09XXXXXXXXX or +639XXXXXXXXX.",
      );
      return;
    }

    setProfileSaving(true);
    try {
      const response = await ApiService.updateProfile({
        firstName,
        lastName,
        email,
        username,
        phone,
        emergencyContact,
      });

      if (response?.user) {
        setUser(response.user);
      }

      setAccountMode("view");
      Alert.alert("Profile Updated", "Your account details were updated successfully.");
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
      setAccountMode("view");
      Alert.alert("Password Updated", "Your password was changed successfully.");
    } catch (error) {
      Alert.alert("Password Update Failed", error?.message || "Could not change password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.brandLockup}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{studentName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.eyebrow}>{roleLabel} Pass</Text>
            <Text style={styles.headerName} numberOfLines={1}>{studentName}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={19} color={BRAND.blue} />
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Digital Campus ID</Text>
      <Text style={styles.subtitle}>Open this pass when tapping at school readers. SafePass records entry, exit, and notifications.</Text>
    </View>
  );

  const renderAttendanceCard = () => (
    <View style={styles.passCard}>
      <View style={styles.passGlow} />
      <View style={styles.passTop}>
        <View style={styles.passAvatar}>
          <Text style={styles.passAvatarText}>{studentName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.passIdentity}>
          <Text style={styles.passName} numberOfLines={1}>{studentName}</Text>
          <Text style={styles.passRole}>{roleLabel} Virtual Card</Text>
        </View>
        <View style={[styles.passStatusPill, { backgroundColor: passStateColor }]}>
          <Text style={styles.passStatusPillText}>{passStateLabel}</Text>
        </View>
      </View>

      <View style={styles.passCodePanel}>
        <View>
          <Text style={styles.passCodeLabel}>{roleLabel} ID</Text>
          <Text style={styles.passCodeValue}>{user?.studentId || user?.teacherId || "Not assigned"}</Text>
        </View>
        <View style={styles.nfcMiniBadge}>
          <Ionicons name="radio-outline" size={16} color="#FFFFFF" />
          <Text style={styles.nfcMiniBadgeText}>{canUseNativeNfc ? "NFC Ready" : user?.nfcCardId ? "Linked" : "Mobile"}</Text>
        </View>
      </View>

      <View style={styles.readerPanel}>
        <View style={styles.readerIcon}>
          <Ionicons name={passState === "inside" ? "exit-outline" : "scan-outline"} size={24} color={passStateColor} />
        </View>
        <View style={styles.readerCopy}>
          <Text style={styles.readerTitle}>{nextTapLabel}</Text>
          <Text style={styles.readerText}>
            {canUseNativeNfc
              ? `${readerInstruction} NFC is available on this phone.`
              : `${readerInstruction} ${nfcAvailability.checked ? "NFC fallback is active on this build/device." : "Checking NFC..."}`}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.tapButton,
          { backgroundColor: passStateColor },
          nextTapDisabled && styles.disabledButton,
        ]}
        onPress={() => {
          if (canUseNativeNfc) {
            startStudentNfcReading();
            return;
          }
          handleAttendanceTap(nextTapAction);
        }}
        disabled={nextTapDisabled}
      >
        {tapActionLoading || isNfcReading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name={canUseNativeNfc ? "radio-outline" : "phone-portrait-outline"} size={20} color="#FFFFFF" />
            <Text style={styles.tapButtonText}>{canUseNativeNfc ? "Start Phone NFC" : nextTapLabel}</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.nfcModeText}>
        {isNfcReading ? nfcStatus || "Listening for NFC..." : nfcModeLabel}
      </Text>
    </View>
  );

  const renderTodayTimeline = () => (
    <View style={styles.timelineCard}>
      <View style={styles.timelineHeader}>
        <Text style={styles.sectionTitle}>Today</Text>
        <MobileStatusBadge status={todayStatus} label={getStatusLabel(todayRecord, true)} />
      </View>
      {[
        ["Latest Entry", latestEntryTime, "log-in-outline", BRAND.success, "Not checked in"],
        ["Latest Exit", latestExitTime, "log-out-outline", BRAND.danger, isCheckedIn ? "Still inside" : "Not checked out"],
        ["Total Inside", currentSessionDuration, "hourglass-outline", BRAND.blue],
      ].map(([label, value, icon, color, fallback]) => (
        <View key={label} style={styles.timelineRow}>
          <View style={[styles.timelineIcon, { backgroundColor: `${color}16` }]}>
            <Ionicons name={icon} size={17} color={color} />
          </View>
          <Text style={styles.timelineLabel}>{label}</Text>
          <Text style={styles.timelineValue}>
            {label === "Total Inside" ? value : formatTime(value, fallback)}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderNotificationCard = () => (
    <View style={styles.notificationCard}>
      <View style={styles.notificationIcon}>
        <Ionicons name="shield-checkmark-outline" size={21} color={BRAND.success} />
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationTitle}>Campus monitoring is active</Text>
        <Text style={styles.notificationText}>
          SafePass records each gate tap for attendance, campus security, and school admin review.
        </Text>
      </View>
    </View>
  );

  const renderHome = () => (
    <>
      {renderHeader()}
      {renderAttendanceCard()}
      {renderTodayTimeline()}
      {renderNotificationCard()}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Taps</Text>
        <TouchableOpacity onPress={() => setActiveTab("history")}>
          <Text style={styles.sectionAction}>View all</Text>
        </TouchableOpacity>
      </View>
      {attendanceEvents.length ? (
        attendanceEvents.slice(0, 3).map((event) => renderAttendanceEvent(event))
      ) : (
        <MobileEmptyState
          icon="calendar-outline"
          title="No records yet"
          message="Your attendance history will appear after your first check-in."
        />
      )}
    </>
  );

  const renderAttendanceEvent = (event) => {
    const meta = getAttendanceEventMeta(event.action);
    const isCheckOut = event.action === "check_out";
    const dateValue = event.tappedAt || event.attendanceDate;
    const durationMinutes =
      Number(event.sessionDurationMinutes || 0) ||
      (isCheckOut
        ? getDurationMinutesBetween(
            getLatestAttendanceTime(
              attendance.find((record) => record?._id === event.recordId),
              "check_in",
            ),
            event.tappedAt,
          )
        : 0);

    return (
      <View key={event.id} style={styles.recordCard}>
      <View style={styles.recordTop}>
        <View>
            <Text style={styles.recordDate}>{meta.label}</Text>
            <Text style={styles.recordLocation}>
              {formatDate(dateValue)} • {event.location || "Campus checkpoint"}
            </Text>
        </View>
          <MobileStatusBadge status={meta.status} label={isCheckOut ? "Outside" : "Inside"} />
      </View>
      <View style={styles.recordTimes}>
        <View style={styles.recordTimeItem}>
            <Ionicons name={meta.icon} size={16} color={meta.color} />
            <Text style={styles.recordTimeText}>{formatTime(event.tappedAt)}</Text>
        </View>
          {!isCheckOut && Number(event.lateMinutes || 0) > 0 ? (
            <View style={styles.recordTimeItem}>
              <Ionicons name="alarm-outline" size={16} color={BRAND.warning} />
              <Text style={styles.recordTimeText}>{event.lateMinutes} late min</Text>
            </View>
          ) : null}
          {isCheckOut ? (
            <View style={styles.recordTimeItem}>
              <Ionicons name="hourglass-outline" size={16} color={BRAND.blue} />
              <Text style={styles.recordTimeText}>{formatDuration(durationMinutes)}</Text>
            </View>
          ) : null}
      </View>
    </View>
    );
  };

  const renderHistory = () => (
    <>
      <View style={styles.compactHeader}>
        <Text style={styles.compactTitle}>Attendance History</Text>
        <Text style={styles.compactSubtitle}>{historyStats.total} latest tap events from SafePass NFC attendance.</Text>
      </View>
      <View style={styles.statStrip}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{historyStats.checkIns}</Text>
          <Text style={styles.statLabel}>Check Ins</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{historyStats.checkOuts}</Text>
          <Text style={styles.statLabel}>Check Outs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{historyStats.total}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
      </View>
      {attendanceEvents.length ? (
        attendanceEvents.map((event) => renderAttendanceEvent(event))
      ) : (
        <MobileEmptyState icon="time-outline" title="No attendance history" message="Attendance records will show here." />
      )}
    </>
  );

  const renderProfile = () => (
    <>
      <View style={styles.compactHeader}>
        <Text style={styles.compactTitle}>My Profile</Text>
        <Text style={styles.compactSubtitle}>Manage your campus account, contact details, and password.</Text>
      </View>
      <View style={styles.profileCard}>
        <View style={styles.profileHero}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{studentName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>{studentName}</Text>
            <Text style={styles.profileRole}>{roleLabel} Access</Text>
          </View>
        </View>

        <View style={styles.accountTabs}>
          {[
            ["view", "Overview", "id-card-outline"],
            ["edit", "Edit", "create-outline"],
            ["password", "Password", "lock-closed-outline"],
          ].map(([key, label, icon]) => (
            <TouchableOpacity
              key={key}
              style={[styles.accountTab, accountMode === key && styles.accountTabActive]}
              onPress={() => setAccountMode(key)}
            >
              <Ionicons name={icon} size={15} color={accountMode === key ? "#FFFFFF" : BRAND.blue} />
              <Text style={[styles.accountTabText, accountMode === key && styles.accountTabTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {accountMode === "view" ? (
          <>
            {[
              ["Email", user?.email],
              ["Username", user?.username || "Not assigned"],
              ["Contact Number", user?.phone || "Not configured"],
              ["Emergency Contact", user?.emergencyContact || "Not configured"],
              ["Parent / Guardian", user?.parentName || user?.guardianName || "Not configured"],
              ["Parent Email", maskEmail(user?.parentEmail || user?.guardianEmail) || "Not configured"],
              ["Student ID", user?.studentId || user?.teacherId || "Not assigned"],
              ["Course / Section", formatProfileDetail(user?.course, user?.yearLevel, user?.section)],
              ["Physical NFC UID", user?.physicalNfcUid || user?.nfcCardId || "Virtual mobile check only"],
            ].map(([label, value]) => (
              <View key={label} style={styles.profileRow}>
                <Text style={styles.profileLabel}>{label}</Text>
                <Text style={styles.profileValue}>{value}</Text>
              </View>
            ))}
            <View style={styles.accountNotice}>
              <Ionicons name="information-circle-outline" size={18} color={BRAND.blue} />
              <Text style={styles.accountNoticeText}>
                Student ID, course, NFC card, and parent contact are managed from official school enrollment records.
              </Text>
            </View>
          </>
        ) : null}

        {accountMode === "edit" ? (
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>Personal Details</Text>
            <Text style={styles.formSubtitle}>Update the contact details used for your SafePass account.</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>First Name</Text>
              <TextInput
                value={profileForm.firstName}
                onChangeText={(value) => handleProfileInputChange("firstName", value)}
                placeholder="First name"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Last Name</Text>
              <TextInput
                value={profileForm.lastName}
                onChangeText={(value) => handleProfileInputChange("lastName", value)}
                placeholder="Last name"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={profileForm.email}
                onChangeText={(value) => handleProfileInputChange("email", value)}
                placeholder="Email address"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                value={profileForm.username}
                onChangeText={(value) => handleProfileInputChange("username", value)}
                placeholder="Username"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Contact Number</Text>
              <TextInput
                value={profileForm.phone}
                onChangeText={(value) => handleProfileInputChange("phone", value)}
                placeholder="09XXXXXXXXX"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Emergency Contact</Text>
              <TextInput
                value={profileForm.emergencyContact}
                onChangeText={(value) => handleProfileInputChange("emergencyContact", value)}
                placeholder="Emergency contact"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
              />
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleCancelProfileEdit}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, profileSaving && styles.disabledButton]}
                onPress={handleSaveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {accountMode === "password" ? (
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>Password & Security</Text>
            <Text style={styles.formSubtitle}>Change your password to keep your campus account secure.</Text>

            <View style={styles.securityTip}>
              <Ionicons name="shield-checkmark-outline" size={18} color={BRAND.blue} />
              <Text style={styles.securityTipText}>
                Use at least 6 characters. Avoid passwords used on shared devices.
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Current Password</Text>
              <TextInput
                value={passwordForm.currentPassword}
                onChangeText={(value) => handlePasswordInputChange("currentPassword", value)}
                placeholder="Current password"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                secureTextEntry
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <TextInput
                value={passwordForm.newPassword}
                onChangeText={(value) => handlePasswordInputChange("newPassword", value)}
                placeholder="New password"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                secureTextEntry
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm Password</Text>
              <TextInput
                value={passwordForm.confirmPassword}
                onChangeText={(value) => handlePasswordInputChange("confirmPassword", value)}
                placeholder="Confirm password"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, styles.fullWidthButton, passwordSaving && styles.disabledButton]}
              onPress={handleChangePassword}
              disabled={passwordSaving}
            >
              {passwordSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <TouchableOpacity style={styles.logoutFullButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        <Text style={styles.logoutFullButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </>
  );

  if (loading) {
    return <MobileLoadingState message="Loading your student attendance..." />;
  }

  if (loadError && !user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.stateWrap}>
          <MobileEmptyState
            icon="cloud-offline-outline"
            title="Dashboard unavailable"
            message={loadError}
            actionLabel="Try again"
            onAction={async () => {
              setLoading(true);
              setLoadError("");
              try {
                await loadData();
              } catch (error) {
                setLoadError(error?.message || "Unable to load your student dashboard.");
              } finally {
                setLoading(false);
              }
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND.blue} />}
      >
        {activeTab === "history" ? renderHistory() : renderHome()}
      </ScrollView>
      <MobileBottomNav tabs={studentTabs} activeTab={activeTab} onChange={handleTabChange} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 22,
    padding: 18,
    backgroundColor: BRAND.blue,
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  brandLockup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#DCEBFF",
    textTransform: "uppercase",
  },
  headerName: {
    marginTop: 3,
    maxWidth: 210,
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  title: {
    marginTop: 2,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#DCEBFF",
  },
  passCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#071B3D",
    borderRadius: 24,
    padding: 17,
    marginBottom: 12,
  },
  passGlow: {
    position: "absolute",
    right: -60,
    top: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37,99,235,0.44)",
  },
  passTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  passAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  passAvatarText: {
    fontSize: 24,
    fontWeight: "900",
    color: BRAND.blue,
  },
  passIdentity: {
    flex: 1,
  },
  passName: {
    fontSize: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  passRole: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
    color: "#BFDBFE",
  },
  passStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  passStatusPillText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
  passCodePanel: {
    marginTop: 18,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  passCodeLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#BFDBFE",
    textTransform: "uppercase",
  },
  passCodeValue: {
    marginTop: 5,
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  nfcMiniBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  nfcMiniBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  readerPanel: {
    marginTop: 14,
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  readerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },
  readerCopy: {
    flex: 1,
  },
  readerTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: BRAND.ink,
  },
  readerText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  tapButton: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  tapButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  nfcModeText: {
    marginTop: 9,
    fontSize: 11,
    fontWeight: "900",
    color: "#BFDBFE",
    textAlign: "center",
    textTransform: "uppercase",
  },
  timelineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    gap: 10,
  },
  timelineIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.ink,
  },
  timelineValue: {
    fontSize: 13,
    fontWeight: "900",
    color: BRAND.muted,
  },
  notificationCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    backgroundColor: "#EEF5FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  notificationCopy: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  notificationText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  primaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  primaryCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  statusTitle: {
    marginTop: 5,
    fontSize: 20,
    fontWeight: "900",
    color: BRAND.ink,
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  timeTile: {
    flex: 1,
    minWidth: 92,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  timeValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "900",
    color: BRAND.ink,
  },
  nfcCard: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#EEF5FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nfcIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.blue,
  },
  nfcCopy: {
    flex: 1,
  },
  nfcTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: BRAND.ink,
  },
  nfcText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  attendanceButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: BRAND.blue,
  },
  checkoutButton: {
    backgroundColor: BRAND.danger,
  },
  disabledButton: {
    opacity: 0.45,
  },
  attendanceButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  summaryStrip: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    minHeight: 94,
    borderRadius: 17,
    padding: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "900",
    color: BRAND.ink,
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  infoCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    minHeight: 118,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  infoTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.ink,
  },
  infoText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.ink,
  },
  sectionAction: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.blue,
  },
  recordCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  recordTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  recordDate: {
    fontSize: 15,
    fontWeight: "900",
    color: BRAND.ink,
  },
  recordLocation: {
    marginTop: 4,
    fontSize: 12,
    color: BRAND.muted,
  },
  recordTimes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  recordTimeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#F8FBFE",
  },
  recordTimeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  compactHeader: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  compactTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: BRAND.ink,
  },
  compactSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: BRAND.muted,
  },
  statStrip: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: BRAND.blue,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
  },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  profileAvatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.blue,
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  profileCopy: {
    flex: 1,
  },
  profileName: {
    fontSize: 19,
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
  accountTabs: {
    flexDirection: "row",
    gap: 8,
    padding: 5,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    marginBottom: 12,
  },
  accountTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  accountTabActive: {
    backgroundColor: BRAND.blue,
  },
  accountTabText: {
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.blue,
  },
  accountTabTextActive: {
    color: "#FFFFFF",
  },
  profileRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
  },
  profileLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  profileValue: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "800",
    color: BRAND.ink,
  },
  accountNotice: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#EEF5FF",
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
  },
  accountNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#475569",
    fontWeight: "700",
  },
  formSection: {
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
    paddingTop: 14,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: BRAND.ink,
  },
  formSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 17,
    color: BRAND.muted,
  },
  fieldGroup: {
    marginBottom: 11,
  },
  fieldLabel: {
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.muted,
    textTransform: "uppercase",
  },
  fieldInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8E4F2",
    backgroundColor: "#F8FBFE",
    paddingHorizontal: 13,
    fontSize: 14,
    fontWeight: "800",
    color: BRAND.ink,
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.blue,
  },
  fullWidthButton: {
    width: "100%",
    marginTop: 4,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBD3F3",
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.blue,
  },
  securityTip: {
    marginBottom: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#EEF5FF",
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
  },
  securityTipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#475569",
    fontWeight: "700",
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
    color: "#DC2626",
  },
});
