import Alert from '../utils/Alert';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ApiService from "../utils/ApiService";
import {
  describeRfidReaderInput,
  normalizeRfidReaderInput,
  RfidKeystrokeBuffer,
  RfidOfflineQueue,
} from "../utils/rfidReaderUtils";
import {
  MONITORING_MAP_FLOORS,
  MONITORING_MAP_OFFICES,
} from "../utils/monitoringMapConfig";
import { normalizeMapSettingsPayload } from "../utils/mapSettingsUtils";

let NfcManager = null;
let NfcEvents = null;
let NfcTech = null;
let Ndef = null;

if (Platform.OS !== "web") {
  try {
    const nfcModule = require("react-native-nfc-manager");
    NfcManager = nfcModule.default || nfcModule;
    NfcEvents = nfcModule.NfcEvents;
    NfcTech = nfcModule.NfcTech;
    Ndef = nfcModule.Ndef;
  } catch (err) {
    console.log("react-native-nfc-manager not available in this environment:", err?.message);
  }
}

const ENTRY_CHECKPOINTS = [
  {
    key: "usb_rfid_reader",
    label: "USB RFID Lobby Reader",
    floor: "ground",
    office: "Entrance / Lobby",
    icon: "radio-outline",
    coordinates: { x: 6.8, y: 40 },
  },
  { key: "main-gate", label: "Main Gate", floor: "ground", office: "Main Gate", icon: "log-in-outline" },
];

const ACTION_OPTIONS = [
  { key: "auto", label: "Auto", subtitle: "Reader decides", icon: "sync-outline", color: "#0A3D91" },
  { key: "location", label: "Location", subtitle: "Track movement", icon: "location-outline", color: "#7C3AED" },
];

const ALLOWED_ROLES = new Set(["admin", "security", "guard", "staff"]);
const STATION_EVENTS_STORAGE_KEY = "safepass:nfc-scan:station-events:v1";
const STATION_FEED_CLEARED_AT_STORAGE_KEY = "safepass:nfc-scan:station-feed-cleared-at:v1";
const STATION_READER_CHECKPOINT_KEY = "safepass:nfc-scan:reader-checkpoint:v1";
const STATION_FEED_PAGE_SIZE = 6;
const MAX_STATION_EVENTS = 100;

const createClientTapId = () =>
  `tap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const isRetryableTapError = (error) => {
  const status = Number(error?.status);
  return !Number.isFinite(status) || status >= 500;
};

const playWebTapDing = (type = "success") => {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = type === "error" ? 240 : 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.17);
    window.setTimeout(() => context.close?.(), 260);
  } catch (error) {
    // Browsers can block sound outside user gestures. Vibration/result UI still confirms the tap.
  }
};

const triggerTapFeedback = async (type = "success") => {
  if (Platform.OS === "web") {
    playWebTapDing(type);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(type === "error" ? [80, 70, 140] : 90);
    }
    return;
  }

  if (type === "error") {
    Vibration.vibrate([0, 80, 70, 140]);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    return;
  }

  Vibration.vibrate(90);
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

const readStoredStationFeedClearedAt = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return "";
  try {
    const value = String(window.localStorage.getItem(STATION_FEED_CLEARED_AT_STORAGE_KEY) || "").trim();
    return Number.isNaN(new Date(value).getTime()) ? "" : value;
  } catch (error) {
    return "";
  }
};

const writeStoredStationFeedClearedAt = (value = "") => {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STATION_FEED_CLEARED_AT_STORAGE_KEY, value);
      return;
    }
    window.localStorage.removeItem(STATION_FEED_CLEARED_AT_STORAGE_KEY);
  } catch (error) {
    // The feed can still work during this browser session if storage is unavailable.
  }
};

const readStoredStationEvents = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STATION_EVENTS_STORAGE_KEY) || "[]");
    const clearedAt = new Date(readStoredStationFeedClearedAt()).getTime();
    return Array.isArray(parsed)
      ? parsed
          .filter((event) => !Number.isFinite(clearedAt) || new Date(event?.timestamp || 0).getTime() > clearedAt)
          .slice(0, MAX_STATION_EVENTS)
      : [];
  } catch (error) {
    return [];
  }
};

const writeStoredStationEvents = (events = []) => {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STATION_EVENTS_STORAGE_KEY,
      JSON.stringify(events.slice(0, MAX_STATION_EVENTS)),
    );
  } catch (error) {
    // Ignore device storage failures; the live station can still process taps.
  }
};

const readStoredReaderCheckpointKey = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(STATION_READER_CHECKPOINT_KEY) || "").trim();
  } catch (error) {
    return "";
  }
};

const writeStoredReaderCheckpointKey = (checkpointKey = "") => {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATION_READER_CHECKPOINT_KEY, String(checkpointKey || "").trim());
  } catch (error) {
    // The reader can still work; it will just fall back to the default office next load.
  }
};

const getStationEventSignature = (event = {}) =>
  [
    event.success ? "ok" : "blocked",
    String(event.nfcCardId || "").trim().toUpperCase(),
    String(event.action || "").trim().toLowerCase(),
    String(event.checkpoint || "").trim().toLowerCase(),
    String(event.message || "").trim().toLowerCase(),
  ].join("|");

const CARD_SHADOW = Platform.select({
  web: { boxShadow: "0px 14px 34px rgba(15, 23, 42, 0.08)" },
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  android: { elevation: 3 },
  default: {},
});

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateOnly = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTimeOnly = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" ? value.trim() : "";
  }
  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRoleLabel = (role = "") =>
  String(role || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase()) || "User";

const getActionMeta = (actionKey = "auto") =>
  ACTION_OPTIONS.find((item) => item.key === actionKey) || ACTION_OPTIONS[0];

const getCredentialType = ({ cardId = "", physicalNfcUid = "", phoneNfcUid = "", virtualNfcToken = "", credentialType = "" } = {}) => {
  const explicitType = String(credentialType || "").trim().toLowerCase();
  if (explicitType) return explicitType;
  const normalizedCardId = normalizeRfidReaderInput(cardId);
  if (!normalizedCardId) return "";
  if (normalizeRfidReaderInput(virtualNfcToken) === normalizedCardId || normalizedCardId.startsWith("5AFE")) {
    return "virtual_card";
  }
  if (normalizeRfidReaderInput(phoneNfcUid) === normalizedCardId) return "phone_uid";
  if (normalizeRfidReaderInput(physicalNfcUid) === normalizedCardId) return "physical_uid";
  return "nfc_uid";
};

const getCredentialLabel = (event = {}) => {
  const credentialType = getCredentialType({
    cardId: event.nfcCardId,
    physicalNfcUid: event.physicalNfcUid,
    phoneNfcUid: event.phoneNfcUid,
    virtualNfcToken: event.virtualNfcToken,
    credentialType: event.credentialType,
  });
  if (credentialType === "virtual_card") return "Virtual Card ID";
  if (credentialType === "phone_uid") return "Phone NFC UID";
  if (credentialType === "physical_uid") return "Physical Card UID";
  return "NFC UID";
};

const getFloorName = (floorId = "") =>
  MONITORING_MAP_FLOORS.find((floor) => floor.id === floorId)?.name || formatRoleLabel(floorId || "Floor");

const formatRoomCheckpointLabel = (room, duplicateIndexByKey) => {
  const baseName = String(room?.name || "Checkpoint").trim();
  const duplicateKey = `${room?.floor || "floor"}::${baseName.toLowerCase()}`;
  const duplicateIndex = duplicateIndexByKey.get(room?.id);
  return duplicateIndex ? `${baseName} ${duplicateIndex}` : baseName;
};

const buildCheckpointOptions = (rooms = MONITORING_MAP_OFFICES, roomPositions = {}) => {
  const duplicateCounts = rooms.reduce((counts, room) => {
    const duplicateKey = `${room?.floor || "floor"}::${String(room?.name || "").trim().toLowerCase()}`;
    counts.set(duplicateKey, (counts.get(duplicateKey) || 0) + 1);
    return counts;
  }, new Map());

  const duplicateRunningCount = new Map();
  const duplicateIndexByKey = new Map();
  rooms.forEach((room) => {
    const duplicateKey = `${room?.floor || "floor"}::${String(room?.name || "").trim().toLowerCase()}`;
    if ((duplicateCounts.get(duplicateKey) || 0) <= 1) return;
    const nextIndex = (duplicateRunningCount.get(duplicateKey) || 0) + 1;
    duplicateRunningCount.set(duplicateKey, nextIndex);
    duplicateIndexByKey.set(room.id, nextIndex);
  });

  const roomCheckpoints = rooms.map((room) => ({
    key: room.id,
    label: formatRoomCheckpointLabel(room, duplicateIndexByKey),
    floor: room.floor,
    office: room.name,
    icon: room.icon || "business-outline",
    coordinates: roomPositions?.[room.id] || null,
  }));

  return [...ENTRY_CHECKPOINTS, ...roomCheckpoints].filter((checkpoint) => checkpoint.key && checkpoint.floor && checkpoint.office);
};

const getResultTone = (result) => {
  if (!result) return { background: "#EFF6FF", border: "#BFDBFE", icon: "#0A3D91", label: "Ready" };
  if (!result.success) return { background: "#FEF2F2", border: "#FCA5A5", icon: "#B91C1C", label: "Blocked" };
  if (String(result.action || "").includes("office_departure")) {
    return { background: "#FFF7ED", border: "#FDBA74", icon: "#C2410C", label: "Left Office" };
  }
  if (String(result.action || "").includes("check_out")) {
    return { background: "#FFF7ED", border: "#FDBA74", icon: "#C2410C", label: "Checked Out" };
  }
  if (String(result.action || "").includes("location")) {
    return { background: "#F5F3FF", border: "#C4B5FD", icon: "#7C3AED", label: "Location Updated" };
  }
  return { background: "#F0FDF4", border: "#86EFAC", icon: "#166534", label: "Checked In" };
};

const getPersonDetails = (response = {}) => {
  const person = response.visitor || response.user || {};
  const role = response.userType || person.role || person.userType || "visitor";
  const normalizedRole = String(role || "").toLowerCase();
  const isVisitor = normalizedRole === "visitor";
  const name =
    person.name ||
    person.fullName ||
    response.attendance?.name ||
    "Campus user";
  const program =
    isVisitor
      ? person.appointmentDepartment || person.assignedOffice || person.host || person.currentLocation?.office || ""
      : person.course || person.program || person.department || response.attendance?.destination || "";
  const yearSection =
    isVisitor
      ? person.purposeOfVisit || person.purpose || ""
      : [person.yearLevel, person.section].filter(Boolean).join(" - ") || person.position || "";
  const campusId =
    person.studentId ||
    person.teacherId ||
    person.employeeId ||
    "";
  const visitDate = person.visitDate || response.visitDate || "";
  const visitTime = person.visitTime || response.visitTime || "";

  return {
    name,
    role: normalizedRole,
    program,
    yearSection,
    campusId,
    visitDate,
    visitTime,
    visitSchedule: person.visitSchedule || [formatDateOnly(visitDate), formatTimeOnly(visitTime)].filter(Boolean).join(" "),
    purpose: person.purposeOfVisit || person.purpose || "",
    attendanceScope: person.attendanceScope || "",
    safePassId: person.safePassId || response.safePassId || "",
    nfcCardId: response.nfcCardId || response.attendance?.nfcCardId || person.nfcCardId || person.physicalNfcUid || person.virtualNfcToken || "",
    physicalNfcUid: person.physicalNfcUid || "",
    phoneNfcUid: person.phoneNfcUid || "",
    virtualNfcToken: person.virtualNfcToken || response.virtualNfcToken || "",
    credentialType: person.nfcCredentialType || response.nfcCredentialType || "",
  };
};

const getCheckpointDeviceId = (checkpoint = {}) =>
  checkpoint.key === "usb_rfid_reader" ? "usb-rfid-reader-01" : "mobile-checkpoint-station";

const isStationAccessLog = (log = {}, readerDeviceId = "") => {
  const metadata = log.metadata || {};
  const deviceId = String(metadata.deviceId || "").toLowerCase();
  const checkpointId = String(metadata.tapLocation?.checkpointId || "").toLowerCase();
  const activityType = String(log.activityType || "").toLowerCase();
  const normalizedReaderDeviceId = String(readerDeviceId || "").toLowerCase();
  return (
    (normalizedReaderDeviceId && deviceId === normalizedReaderDeviceId) ||
    (!normalizedReaderDeviceId && activityType.startsWith("station_")) ||
    checkpointId === "usb_rfid_reader"
  );
};

const buildStationEventFromLog = (log = {}) => {
  const metadata = log.metadata || {};
  const tapLocation = metadata.tapLocation || {};
  const success = String(log.status || "").toLowerCase() === "granted";
  const action = metadata.action || log.activityType || "station_tap";
  const nfcCardId = log.nfcCardId || metadata.targetCardId || "";
  const relatedUser = log.relatedUser || {};
  const relatedVisitor = log.relatedVisitor || {};
  const virtualNfcToken = metadata.virtualNfcToken || relatedUser.virtualNfcToken || relatedVisitor.virtualNfcToken || "";
  const physicalNfcUid = metadata.physicalNfcUid || relatedUser.physicalNfcUid || relatedVisitor.physicalNfcUid || "";
  const phoneNfcUid = metadata.phoneNfcUid || relatedUser.phoneNfcUid || relatedVisitor.phoneNfcUid || "";
  const checkpoint =
    tapLocation.office ||
    log.location ||
    tapLocation.checkpointId ||
    metadata.deviceId ||
    "USB RFID reader";

  return {
    success,
    message:
      log.notes ||
      (success ? "RFID tap processed." : "RFID tap was blocked."),
    timestamp: log.timestamp || new Date().toISOString(),
    checkpoint,
    action,
    userType: metadata.userType || log.actorRole || "visitor",
    name: log.userName || relatedVisitor.fullName || relatedUser.name || (success ? "SafePass user" : "Unknown NFC card"),
    program: checkpoint,
    yearSection: success ? "" : "Not assigned or blocked",
    campusId: "",
    visitDate: "",
    visitTime: "",
    visitSchedule: "",
    purpose: "",
    attendanceScope: "RFID reader tap",
    nfcCardId,
    physicalNfcUid,
    phoneNfcUid,
    virtualNfcToken,
    credentialType: metadata.credentialType || getCredentialType({ cardId: nfcCardId, physicalNfcUid, phoneNfcUid, virtualNfcToken }),
    status: log.status || "processed",
    source: "rfid_reader",
    raw: log,
  };
};

export default function NFCScanScreen({ navigation }) {
  const { width: viewportWidth } = useWindowDimensions();
  const cardInputRef = useRef(null);
  const readerBufferRef = useRef("");
  const readerBufferTimerRef = useRef(null);
  const lastReaderInputAtRef = useRef(0);
  const isSubmittingTapRef = useRef(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mapRooms, setMapRooms] = useState(MONITORING_MAP_OFFICES);
  const [mapRoomPositions, setMapRoomPositions] = useState({});
  const [selectedFloorKey, setSelectedFloorKey] = useState(MONITORING_MAP_FLOORS[0].id);
  const [selectedCheckpointKey, setSelectedCheckpointKey] = useState(
    () => readStoredReaderCheckpointKey() || ENTRY_CHECKPOINTS[0].key,
  );
  const [checkpointSearch, setCheckpointSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState("auto");
  const [cardId, setCardId] = useState("");
  const [stationEvents, setStationEvents] = useState(() => readStoredStationEvents());
  const [stationFeedClearedAt, setStationFeedClearedAt] = useState(() => readStoredStationFeedClearedAt());
  const [stationFeedRefreshing, setStationFeedRefreshing] = useState(false);
  const [stationFeedPage, setStationFeedPage] = useState(1);
  const [latestResult, setLatestResult] = useState(null);
  const [mobileNfcStatus, setMobileNfcStatus] = useState({
    supported: false,
    enabled: false,
    active: false,
    checked: false,
  });
  const [isScanningMobile, setIsScanningMobile] = useState(false);
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const radarPulseAnim = useRef(new Animated.Value(1)).current;

  const checkpointOptions = useMemo(
    () => buildCheckpointOptions(mapRooms, mapRoomPositions),
    [mapRooms, mapRoomPositions],
  );
  const floorCheckpointCounts = useMemo(
    () =>
      checkpointOptions.reduce((counts, checkpoint) => ({
        ...counts,
        [checkpoint.floor]: (counts[checkpoint.floor] || 0) + 1,
      }), {}),
    [checkpointOptions],
  );
  const visibleCheckpoints = useMemo(() => {
    const normalizedSearch = String(checkpointSearch || "").trim().toLowerCase();
    return checkpointOptions.filter((checkpoint) => {
      const matchesFloor = checkpoint.floor === selectedFloorKey;
      if (!normalizedSearch) return matchesFloor;
      return (
        matchesFloor &&
        [checkpoint.label, checkpoint.office, checkpoint.floor, getFloorName(checkpoint.floor)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch))
      );
    });
  }, [checkpointOptions, selectedFloorKey, checkpointSearch]);
  const selectedCheckpoint = useMemo(
    () => checkpointOptions.find((checkpoint) => checkpoint.key === selectedCheckpointKey) || checkpointOptions[0],
    [checkpointOptions, selectedCheckpointKey],
  );
  const isOperatorAllowed = useMemo(
    () => ALLOWED_ROLES.has(String(user?.role || "").toLowerCase()),
    [user?.role],
  );
  const selectedActionMeta = useMemo(() => getActionMeta(selectedAction), [selectedAction]);
  const latestTone = useMemo(() => getResultTone(latestResult), [latestResult]);
  const isCompactStation = viewportWidth < 820;
  const isNarrowStation = viewportWidth < 520;
  const isMobileNfcStation = Platform.OS !== "web";
  const scannerLabel = isMobileNfcStation ? "Phone NFC" : "USB Reader";
  const stationFeedTotalPages = useMemo(
    () => Math.max(1, Math.ceil(stationEvents.length / STATION_FEED_PAGE_SIZE)),
    [stationEvents.length],
  );
  const paginatedStationEvents = useMemo(() => {
    const safePage = Math.min(stationFeedPage, stationFeedTotalPages);
    const startIndex = (safePage - 1) * STATION_FEED_PAGE_SIZE;
    return stationEvents.slice(startIndex, startIndex + STATION_FEED_PAGE_SIZE);
  }, [stationEvents, stationFeedPage, stationFeedTotalPages]);
  const stationAlertCount = useMemo(
    () => offlinePendingCount + stationEvents.filter((event) => event?.success === false).length,
    [offlinePendingCount, stationEvents],
  );

  const stationIssues = useMemo(
    () => stationEvents.filter((event) => event?.success === false).slice(0, 5),
    [stationEvents],
  );

  useEffect(() => {
    if (stationFeedPage > stationFeedTotalPages) {
      setStationFeedPage(stationFeedTotalPages);
    }
  }, [stationFeedPage, stationFeedTotalPages]);

  const loadUser = async () => {
    try {
      const currentUser =
        (await ApiService.getCurrentUser()) ||
        (await ApiService.restoreCurrentUserFromToken());
      if (!currentUser) {
        navigation.replace("Login");
        return;
      }
      setUser(currentUser);
      try {
        const mapResponse = await ApiService.getMapSettings();
        if (mapResponse?.success) {
          const normalizedMapSettings = normalizeMapSettingsPayload(mapResponse.mapSettings);
          setMapRooms(normalizedMapSettings.rooms);
          setMapRoomPositions(normalizedMapSettings.roomPositions);
        }
      } catch (mapError) {
        console.log("Checkpoint map settings fallback:", mapError?.message || mapError);
        setMapRooms(MONITORING_MAP_OFFICES);
        setMapRoomPositions({});
      }
    } catch (error) {
      console.error("Load checkpoint user error:", error);
      Alert.alert("Error", "Failed to load checkpoint station user.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    checkOfflineQueue();
  }, []);

  const checkOfflineQueue = async () => {
    const pending = await RfidOfflineQueue.getPendingTaps();
    setOfflinePendingCount(pending.length);
  };

  const syncOfflineQueue = async () => {
    const pending = await RfidOfflineQueue.getPendingTaps();
    if (!pending.length) {
      Alert.alert("Offline Queue", "No queued offline taps to sync.");
      return;
    }
    setBusy(true);
    let syncedCount = 0;
    for (const tap of pending) {
      try {
        await ApiService.submitCheckpointTap(tap);
        await RfidOfflineQueue.removeTap(tap.id);
        syncedCount++;
      } catch (e) {
        console.warn("Failed to sync queued tap:", e);
        if (!isRetryableTapError(e)) {
          await RfidOfflineQueue.removeTap(tap.id);
        }
      }
    }
    setBusy(false);
    await checkOfflineQueue();
    Alert.alert("Sync Complete", `Successfully synced ${syncedCount} queued tap(s) to server.`);
  };

  // Mobile Native NFC Management
  const initMobileNfc = async () => {
    if (Platform.OS === "web" || !NfcManager) {
      setMobileNfcStatus({ supported: false, enabled: false, active: false, checked: true });
      return;
    }
    try {
      const supported = Boolean(await NfcManager.isSupported());
      if (!supported) {
        setMobileNfcStatus({ supported: false, enabled: false, active: false, checked: true });
        return;
      }
      await NfcManager.start();
      const enabled = Boolean(await NfcManager.isEnabled());
      setMobileNfcStatus({ supported: true, enabled, active: enabled, checked: true });
      if (enabled) {
        startMobileNfcListening();
      }
    } catch (error) {
      console.warn("NFC init error:", error);
      setMobileNfcStatus({ supported: false, enabled: false, active: false, checked: true });
    }
  };

  const startMobileNfcListening = async () => {
    if (Platform.OS === "web" || !NfcManager || !NfcEvents) return;
    try {
      setIsScanningMobile(true);
      NfcManager.setEventListener(NfcEvents.DiscoverTag, async (tag) => {
        let rawUid = tag?.id || tag?.uid || "";
        if (!rawUid && tag?.ndefMessage && tag.ndefMessage[0]) {
          try {
            rawUid = Ndef.text.decodePayload(tag.ndefMessage[0].payload);
          } catch (e) {}
        }
        const normalized = normalizeRfidReaderInput(rawUid);
        if (normalized) {
          await triggerTapFeedback("success");
          await handleSubmitTap(normalized);
        }
      });
      await NfcManager.registerTagEvent();
    } catch (err) {
      console.warn("startMobileNfcListening error:", err);
    }
  };

  const stopMobileNfcListening = async () => {
    if (Platform.OS === "web" || !NfcManager || !NfcEvents) return;
    try {
      setIsScanningMobile(false);
      await NfcManager.unregisterTagEvent();
      NfcManager.setEventListener(NfcEvents.DiscoverTag, () => {});
    } catch (err) {}
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      initMobileNfc();
      return () => {
        stopMobileNfcListening();
      };
    }
  }, []);

  // Radar Pulse Animation
  useEffect(() => {
    if (isScanningMobile) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(radarPulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(radarPulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isScanningMobile]);

  // Web USB Wedge Scanner Keystroke Buffer
  useEffect(() => {
    if (loading || Platform.OS !== "web" || !isOperatorAllowed) return undefined;
    const wedgeScanner = new RfidKeystrokeBuffer({
      onScan: (scannedUid) => {
        handleSubmitTap(scannedUid);
      },
    });
    wedgeScanner.start();
    return () => wedgeScanner.stop();
  }, [loading, isOperatorAllowed, selectedAction, selectedCheckpointKey]);

  useEffect(() => {
    if (loading) return undefined;
    const timer = setTimeout(() => cardInputRef.current?.focus?.(), 350);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!checkpointOptions.length) return;
    const currentCheckpoint = checkpointOptions.find((checkpoint) => checkpoint.key === selectedCheckpointKey);
    if (currentCheckpoint) {
      setSelectedFloorKey(currentCheckpoint.floor);
      return;
    }
    const fallbackCheckpoint =
      checkpointOptions.find((checkpoint) => checkpoint.floor === selectedFloorKey) ||
      checkpointOptions[0];
    setSelectedCheckpointKey(fallbackCheckpoint.key);
    setSelectedFloorKey(fallbackCheckpoint.floor);
  }, [checkpointOptions, selectedCheckpointKey, selectedFloorKey]);

  useEffect(() => {
    if (loading || Platform.OS !== "web") return undefined;

    const armReader = () => {
      if (document.activeElement !== cardInputRef.current) {
        cardInputRef.current?.focus?.();
      }
    };

    const handleDocumentPointer = () => {
      window.setTimeout(armReader, 50);
    };

    const handleDocumentKeyDown = (event) => {
      const activeElement = document.activeElement;
      const isTypingTarget =
        activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) &&
        activeElement !== cardInputRef.current;

      if (isTypingTarget || event.ctrlKey || event.metaKey || event.altKey || busy) return;

      if (event.key === "Enter") {
        const bufferedUid = readerBufferRef.current;
        readerBufferRef.current = "";
        if (bufferedUid) {
          event.preventDefault();
          handleSubmitTap(bufferedUid);
        }
        return;
      }

      if (event.key?.length === 1) {
        readerBufferRef.current += event.key;
        window.clearTimeout(readerBufferTimerRef.current);
        readerBufferTimerRef.current = window.setTimeout(() => {
          readerBufferRef.current = "";
        }, 350);
      }
    };

    armReader();
    window.addEventListener("focus", armReader);
    document.addEventListener("pointerdown", handleDocumentPointer);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      window.removeEventListener("focus", armReader);
      document.removeEventListener("pointerdown", handleDocumentPointer);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.clearTimeout(readerBufferTimerRef.current);
    };
  }, [loading, busy, selectedAction, selectedCheckpointKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUser();
      await checkOfflineQueue();
    } finally {
      setRefreshing(false);
    }
  };

  const recordLocalEvent = (event) => {
    setStationEvents((currentEvents) => {
      const eventSignature = getStationEventSignature(event);
      const recentDuplicate = currentEvents.find((existingEvent) => {
        const existingTime = new Date(existingEvent?.timestamp || 0).getTime();
        const eventTime = new Date(event?.timestamp || 0).getTime();
        return (
          getStationEventSignature(existingEvent) === eventSignature &&
          Number.isFinite(existingTime) &&
          Number.isFinite(eventTime) &&
          Math.abs(eventTime - existingTime) < 60000
        );
      });

      if (recentDuplicate) {
        return currentEvents;
      }

      const nextEvents = [event, ...currentEvents].slice(0, MAX_STATION_EVENTS);
      writeStoredStationEvents(nextEvents);
      return nextEvents;
    });
    setStationFeedPage(1);
  };

  const clearStationFeed = () => {
    const clearedAt = new Date().toISOString();
    writeStoredStationEvents([]);
    writeStoredStationFeedClearedAt(clearedAt);
    setStationEvents([]);
    setStationFeedClearedAt(clearedAt);
    setStationFeedPage(1);
    setLatestResult(null);
  };

  const refreshStationFeed = async () => {
    if (!isOperatorAllowed) return;
    setStationFeedRefreshing(true);
    try {
      const response = await ApiService.getAccessLogs(1, MAX_STATION_EVENTS, { all: true });
      const clearedAt = new Date(stationFeedClearedAt).getTime();
      const serverEvents = (Array.isArray(response?.accessLogs) ? response.accessLogs : [])
        .filter((log) => isStationAccessLog(log, getCheckpointDeviceId(selectedCheckpoint)))
        .map(buildStationEventFromLog)
        .filter((event) => !Number.isFinite(clearedAt) || new Date(event?.timestamp || 0).getTime() > clearedAt);

      if (!serverEvents.length) return;

      setStationEvents((currentEvents) => {
        const existingEvents = [...currentEvents];
        serverEvents.forEach((event) => {
          const isAlreadyStored = existingEvents.some((storedEvent) => {
            const sameSignature = getStationEventSignature(storedEvent) === getStationEventSignature(event);
            const storedTime = new Date(storedEvent?.timestamp || 0).getTime();
            const eventTime = new Date(event?.timestamp || 0).getTime();
            return sameSignature && Math.abs(storedTime - eventTime) < 60000;
          });
          if (!isAlreadyStored) existingEvents.push(event);
        });
        const nextEvents = existingEvents
          .sort((first, second) => new Date(second?.timestamp || 0) - new Date(first?.timestamp || 0))
          .slice(0, MAX_STATION_EVENTS);
        writeStoredStationEvents(nextEvents);
        return nextEvents;
      });
    } finally {
      setStationFeedRefreshing(false);
    }
  };

  useEffect(() => {
    if (loading || !isOperatorAllowed) return;
    refreshStationFeed().catch(() => {
      // The current device feed remains available from local storage when offline.
    });
  }, [loading, isOperatorAllowed, selectedCheckpointKey, stationFeedClearedAt]);

  const focusReader = () => {
    globalThis.requestAnimationFrame?.(() => cardInputRef.current?.focus?.());
    setTimeout(() => cardInputRef.current?.focus?.(), 50);
  };

  const handleCardInputChange = (value) => {
    const normalizedValue = normalizeRfidReaderInput(value);
    const now = Date.now();
    const previousValue = cardId;
    const shouldStartFreshScan =
      previousValue &&
      normalizedValue.length > previousValue.length &&
      normalizedValue.startsWith(previousValue) &&
      now - lastReaderInputAtRef.current > 250;
    const nextValue = shouldStartFreshScan
      ? normalizedValue.slice(previousValue.length)
      : normalizedValue;

    lastReaderInputAtRef.current = now;
    setCardId(nextValue);
  };

  const handleSelectFloor = (floorKey) => {
    const firstCheckpointForFloor =
      checkpointOptions.find((checkpoint) => checkpoint.floor === floorKey) ||
      checkpointOptions[0];
    setSelectedFloorKey(floorKey);
    setCheckpointSearch("");
    if (firstCheckpointForFloor) {
      handleSelectCheckpoint(firstCheckpointForFloor.key);
      return;
    }
    setTimeout(focusReader, 80);
  };

  const handleSelectCheckpoint = (checkpointKey) => {
    setSelectedCheckpointKey(checkpointKey);
    writeStoredReaderCheckpointKey(checkpointKey);
    setTimeout(focusReader, 80);
  };

  const handleSubmitTap = async (scannedValue = cardId) => {
    const normalizedCardId = normalizeRfidReaderInput(scannedValue);
    if (!normalizedCardId) {
      Alert.alert("Card Required", "Enter or scan the NFC card UID first.");
      return;
    }

    if (isSubmittingTapRef.current) return;

    readerBufferRef.current = "";
    setCardId("");
    isSubmittingTapRef.current = true;
    setBusy(true);
    const tapData = {
      nfcCardId: normalizedCardId,
      uid: normalizedCardId,
      cardUid: normalizedCardId,
      pn532Uid: normalizedCardId,
      action: selectedAction,
      floor: selectedCheckpoint.floor,
      office: selectedCheckpoint.office,
      checkpointId: selectedCheckpoint.key,
      checkpointName: selectedCheckpoint.label,
      coordinates: selectedCheckpoint.coordinates || undefined,
      readerId: selectedCheckpoint.key,
      deviceId: selectedCheckpoint.key === "usb_rfid_reader" ? "usb-rfid-reader-01" : "mobile-checkpoint-station",
      source: selectedCheckpoint.key === "usb_rfid_reader" ? "usb_rfid_reader" : "mobile-checkpoint-station",
      clientTapId: createClientTapId(),
    };
    try {
      const response = await ApiService.submitCheckpointTap(tapData);
      const personDetails = getPersonDetails(response);

      const event = {
        success: true,
        message: response?.message || "Checkpoint tap processed.",
        timestamp: new Date().toISOString(),
        checkpoint: selectedCheckpoint.label,
        action: response?.action || selectedAction,
        userType: personDetails.role,
        name: personDetails.name,
        program: personDetails.program,
        yearSection: personDetails.yearSection,
        campusId: personDetails.campusId,
        visitDate: personDetails.visitDate,
        visitTime: personDetails.visitTime,
        visitSchedule: personDetails.visitSchedule,
        purpose: personDetails.purpose,
        attendanceScope: personDetails.attendanceScope,
        nfcCardId: personDetails.nfcCardId || normalizedCardId,
        physicalNfcUid: personDetails.physicalNfcUid,
        phoneNfcUid: personDetails.phoneNfcUid,
        virtualNfcToken: personDetails.virtualNfcToken,
        credentialType: personDetails.credentialType || getCredentialType({
          cardId: personDetails.nfcCardId || normalizedCardId,
          physicalNfcUid: personDetails.physicalNfcUid,
          phoneNfcUid: personDetails.phoneNfcUid,
          virtualNfcToken: personDetails.virtualNfcToken,
        }),
        status:
          response?.attendance?.status ||
          response?.visitor?.status ||
          response?.currentLocation?.statusLabel ||
          "processed",
        raw: response,
      };

      setLatestResult(event);
      recordLocalEvent(event);
      await triggerTapFeedback("success");
      focusReader();
    } catch (error) {
      if (isRetryableTapError(error)) {
        await RfidOfflineQueue.queueTap(tapData);
        await checkOfflineQueue();
        const queuedEvent = {
          success: false,
          message: "Connection unavailable. This tap was saved locally and can be synced when the checkpoint is online.",
          timestamp: new Date().toISOString(),
          checkpoint: selectedCheckpoint.label,
          action: selectedAction,
          userType: "unknown",
          name: normalizedCardId,
          nfcCardId: normalizedCardId,
          status: "queued_offline",
          raw: error?.data || {},
        };
        setLatestResult(queuedEvent);
        recordLocalEvent(queuedEvent);
        await triggerTapFeedback("error");
        Alert.alert("Tap Saved Offline", queuedEvent.message);
        return;
      }

      const errorData = error?.data || {};
      const personDetails = getPersonDetails({
        ...errorData,
        nfcCardId: errorData.nfcCardId || normalizedCardId,
      });
      const failedEvent = {
        success: false,
        message: error?.message || "Checkpoint tap failed.",
        timestamp: new Date().toISOString(),
        checkpoint: selectedCheckpoint.label,
        action: errorData?.action || selectedAction,
        userType: personDetails.role || "unknown",
        name: personDetails.name || normalizedCardId,
        program: personDetails.program,
        yearSection: personDetails.yearSection,
        campusId: personDetails.campusId,
        visitDate: personDetails.visitDate,
        visitTime: personDetails.visitTime,
        visitSchedule: personDetails.visitSchedule,
        purpose: personDetails.purpose,
        attendanceScope: personDetails.attendanceScope,
        nfcCardId: personDetails.nfcCardId || normalizedCardId,
        physicalNfcUid: personDetails.physicalNfcUid,
        phoneNfcUid: personDetails.phoneNfcUid,
        virtualNfcToken: personDetails.virtualNfcToken,
        credentialType: personDetails.credentialType || getCredentialType({
          cardId: personDetails.nfcCardId || normalizedCardId,
          physicalNfcUid: personDetails.physicalNfcUid,
          phoneNfcUid: personDetails.phoneNfcUid,
          virtualNfcToken: personDetails.virtualNfcToken,
        }),
        status: "denied",
        raw: errorData,
      };
      setLatestResult(failedEvent);
      recordLocalEvent(failedEvent);
      await triggerTapFeedback("error");
      Alert.alert("Tap Failed", failedEvent.message);
    } finally {
      isSubmittingTapRef.current = false;
      setBusy(false);
      setCardId("");
      focusReader();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={styles.loadingText}>Loading checkpoint station...</Text>
      </SafeAreaView>
    );
  }

  if (!user) return null;

  const isAllowed = ALLOWED_ROLES.has(String(user.role || "").toLowerCase());

  if (!isAllowed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.accessDeniedWrap}>
          <View style={styles.accessDeniedCard}>
            <View style={styles.accessDeniedIcon}>
              <Ionicons name="shield-outline" size={34} color="#DC2626" />
            </View>
            <Text style={styles.accessDeniedTitle}>Checkpoint Access Required</Text>
            <Text style={styles.accessDeniedText}>
              NFC Tap Console is only available for admin, staff, security, and guard accounts.
              Please sign in with an authorized checkpoint operator account.
            </Text>
            <View style={styles.accessDeniedRolePill}>
              <Ionicons name="person-circle-outline" size={16} color="#64748B" />
              <Text style={styles.accessDeniedRoleText}>Current role: {formatRoleLabel(user.role)}</Text>
            </View>
            <TouchableOpacity
              style={styles.accessDeniedButton}
              onPress={() => navigation.replace("Login")}
              activeOpacity={0.86}
            >
              <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
              <Text style={styles.accessDeniedButtonText}>Sign In As Operator</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.content, isCompactStation && styles.contentCompact]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.headerCard, isCompactStation && styles.headerCardCompact]}>
          <View style={[styles.headerMainRow, isCompactStation && styles.headerMainRowCompact]}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color="#0A3D91" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>Checkpoint Station</Text>
              <Text style={[styles.headerTitle, isCompactStation && styles.headerTitleCompact]}>
                NFC Tap Console
              </Text>
              <Text style={styles.headerSubtitle}>
                {isMobileNfcStation
                  ? "Process campus attendance, visitor arrival, departure, and location taps with this phone's NFC reader."
                  : "Process campus attendance, visitor arrival, departure, and location taps from one dedicated reader station."}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={() => setShowNotifications(true)}
                accessibilityRole="button"
                accessibilityLabel={stationAlertCount ? `${stationAlertCount} NFC notifications` : "NFC notifications"}
              >
                <Ionicons name="notifications-outline" size={21} color="#FFFFFF" />
                {stationAlertCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{stationAlertCount > 99 ? "99+" : stationAlertCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <View style={[styles.headerBadge, !isAllowed && styles.headerBadgeWarning]}>
                <Ionicons
                  name={isAllowed ? "shield-checkmark-outline" : "alert-circle-outline"}
                  size={17}
                  color={isAllowed ? "#BBF7D0" : "#FDE68A"}
                />
                <Text style={[styles.headerBadgeText, !isAllowed && styles.headerBadgeTextWarning]}>
                  {isAllowed ? "Authorized" : "Read Only"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerMetricRow}>
            <View style={styles.headerMetric}>
              <Text style={styles.headerMetricLabel}>Mode</Text>
              <Text style={styles.headerMetricValue}>{selectedActionMeta.label}</Text>
            </View>
            <View style={styles.headerMetric}>
              <Text style={styles.headerMetricLabel}>Checkpoint</Text>
              <Text style={styles.headerMetricValue}>{selectedCheckpoint.label}</Text>
            </View>
            <View style={styles.headerMetric}>
              <Text style={styles.headerMetricLabel}>Session Events</Text>
              <Text style={styles.headerMetricValue}>{stationEvents.length}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.operatorCard, isCompactStation && styles.operatorCardCompact]}>
          <View style={styles.operatorIdentity}>
            <View style={styles.operatorAvatar}>
              <Text style={styles.operatorAvatarText}>
                {`${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.trim() || "SO"}
              </Text>
            </View>
            <View>
            <Text style={styles.operatorLabel}>Operator</Text>
            <Text style={styles.operatorName}>
              {user.firstName} {user.lastName}
            </Text>
            <Text style={styles.operatorMeta}>{formatRoleLabel(user.role)}</Text>
            </View>
          </View>
          <View style={[styles.operatorStatusBadge, !isAllowed && styles.operatorStatusBadgeWarning]}>
            <Text style={[styles.operatorStatusText, !isAllowed && styles.operatorStatusTextWarning]}>
              {isAllowed ? "Authorized" : "Read Only"}
            </Text>
          </View>
        </View>

        {!isAllowed ? (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={20} color="#B45309" />
            <Text style={styles.warningText}>
              This screen is meant for admin, staff, and security checkpoint operators. Your account
              can open it, but station taps will be blocked by the backend.
            </Text>
          </View>
        ) : null}

        {/* Hardware Status & Multi-Channel Scanner Bar */}
        <View style={styles.hardwareBar}>
          {Platform.OS !== "web" ? (
            <View style={styles.hardwareChannelRow}>
              <View
                style={[
                  styles.hardwareBadge,
                  mobileNfcStatus.enabled ? styles.hardwareBadgeActive : styles.hardwareBadgeWarning,
                ]}
              >
                <Animated.View
                  style={[
                    styles.hardwareBadgeDot,
                    mobileNfcStatus.enabled && {
                      transform: [{ scale: radarPulseAnim }],
                      backgroundColor: "#10B981",
                    },
                  ]}
                />
                <Text style={styles.hardwareBadgeText}>
                  {mobileNfcStatus.enabled
                    ? "Phone NFC Active - Tap Card to Back of Phone"
                    : mobileNfcStatus.supported
                    ? "NFC Disabled on Device"
                    : "NFC Is Not Available on This Phone"}
                </Text>
              </View>
              {mobileNfcStatus.supported && !mobileNfcStatus.enabled ? (
                <TouchableOpacity
                  style={styles.hardwareSettingsBtn}
                  onPress={() => {
                    try {
                      NfcManager?.goToNfcSetting?.();
                    } catch (e) {}
                  }}
                >
                  <Ionicons name="settings-outline" size={14} color="#0A3D91" />
                  <Text style={styles.hardwareSettingsBtnText}>Open NFC Settings</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.hardwareChannelRow}>
              <View style={styles.hardwareBadgeGroup}>
                <View style={[styles.hardwareBadge, styles.hardwareBadgeActive]}>
                  <View style={[styles.hardwareBadgeDot, { backgroundColor: "#10B981" }]} />
                  <Text style={styles.hardwareBadgeText}>USB RFID Reader Ready</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Offline Queue Sync Banner */}
        {offlinePendingCount > 0 ? (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineBannerCopy}>
              <Ionicons name="cloud-offline-outline" size={20} color="#B45309" />
              <Text style={styles.offlineBannerText}>
                {offlinePendingCount} offline checkpoint tap{offlinePendingCount === 1 ? "" : "s"} stored locally.
              </Text>
            </View>
            <TouchableOpacity style={styles.offlineSyncButton} onPress={syncOfflineQueue} disabled={busy}>
              <Ionicons name="sync-outline" size={15} color="#FFFFFF" />
              <Text style={styles.offlineSyncButtonText}>Sync Now</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.stationLayout, isCompactStation && styles.stationLayoutCompact]}>
          <View style={[styles.stationPrimary, isCompactStation && styles.stationPrimaryCompact]}>
            <View
              style={[
                styles.tapPad,
                isCompactStation && styles.tapPadCompact,
                { backgroundColor: latestTone.background, borderColor: latestTone.border },
                busy && styles.tapPadBusy,
              ]}
            >
              <View style={[styles.tapPadStatusRow, isNarrowStation && styles.tapPadStatusRowCompact]}>
                <View style={[styles.tapPadStatusPill, { borderColor: latestTone.border }]}>
                  <View style={[styles.tapPadStatusDot, { backgroundColor: latestTone.icon }]} />
                  <Text style={[styles.tapPadStatusText, { color: latestTone.icon }]}>
                    {busy ? "Processing Tap" : isScanningMobile ? "Phone NFC Scanning" : "Ready to Scan"}
                  </Text>
                </View>
                <Text style={[styles.tapPadTimestamp, isNarrowStation && styles.tapPadTimestampCompact]}>
                  {latestResult ? formatDateTime(latestResult.timestamp) : "No taps yet"}
                </Text>
              </View>
              <Animated.View
                style={[
                  styles.tapPadIcon,
                  isCompactStation && styles.tapPadIconCompact,
                  { backgroundColor: `${latestTone.icon}18` },
                  isScanningMobile && { transform: [{ scale: radarPulseAnim }] },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="large" color={latestTone.icon} />
                ) : (
                  <Ionicons
                    name={latestResult?.success === false ? "alert-circle-outline" : "radio-outline"}
                    size={44}
                    color={latestTone.icon}
                  />
                )}
              </Animated.View>
              <Text style={[styles.tapPadTitle, isCompactStation && styles.tapPadTitleCompact, { color: latestTone.icon }]}>
                {busy ? "Processing Tap" : latestResult ? latestTone.label : "Ready To Tap"}
              </Text>
              <Text style={styles.tapPadSubtitle}>
                {latestResult?.message ||
                  (Platform.OS === "web"
                    ? "Tap a card on the USB RFID reader. The station captures the card ID automatically."
                    : "Hold a physical card near this device, or enter its UID and process the tap.")}
              </Text>
              <View style={[styles.tapPadMetaRow, isNarrowStation && styles.tapPadMetaRowCompact]}>
                <View style={styles.tapPadMetaCard}>
                  <Text style={styles.tapPadMetaLabel}>Mode</Text>
                  <Text style={styles.tapPadMetaValue}>{selectedActionMeta.label}</Text>
                </View>
                <View style={styles.tapPadMetaCard}>
                  <Text style={styles.tapPadMetaLabel}>Checkpoint</Text>
                  <Text style={styles.tapPadMetaValue}>{selectedCheckpoint.label}</Text>
                </View>
              </View>
            </View>

            <View style={styles.readerPanel}>
              <View style={[styles.readerPanelHeader, isNarrowStation && styles.readerPanelHeaderCompact]}>
                <View>
                  <Text style={styles.readerPanelLabel}>{scannerLabel}</Text>
                  <Text style={styles.readerPanelTitle}>{describeRfidReaderInput(cardId)}</Text>
                </View>
                <TouchableOpacity style={styles.focusButton} onPress={focusReader}>
                  <Ionicons name="locate-outline" size={16} color="#0A3D91" />
                  <Text style={styles.focusButtonText}>{isMobileNfcStation ? "Enter UID" : "Arm"}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                ref={cardInputRef}
                style={[styles.cardInput, busy && styles.cardInputBusy]}
                placeholder={isMobileNfcStation ? "Enter NFC card UID" : "Tap card on USB reader"}
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                autoCorrect={false}
                value={cardId}
                onChangeText={handleCardInputChange}
                onSubmitEditing={(event) => handleSubmitTap(event?.nativeEvent?.text)}
                returnKeyType="done"
                blurOnSubmit={false}
                showSoftInputOnFocus={Platform.OS === "web" ? false : true}
              />
              <View style={styles.readerHintCard}>
                <Ionicons name="information-circle-outline" size={16} color="#0A3D91" />
                <Text style={styles.readerHintText}>
                  {Platform.OS === "web"
                    ? "This station auto-arms the reader. Tap a card anywhere on this screen."
                    : "Hold a 13.56 MHz NFC card near the back of this phone. If needed, enter the card UID manually and process the tap."}
                </Text>
              </View>
              <View style={[styles.inlineActions, isNarrowStation && styles.inlineActionsCompact]}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setCardId(String(user.physicalNfcUid || user.phoneNfcUid || user.nfcCardId || user.safePassId || "").toUpperCase());
                    setTimeout(focusReader, 80);
                  }}
                >
                  <Ionicons name="card-outline" size={16} color="#0A3D91" />
                  <Text style={styles.secondaryButtonText}>Use My Card</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.buttonDisabled]}
                  onPress={() => handleSubmitTap()}
                  disabled={busy || !isAllowed}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="radio-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Process Tap</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.resultCard, styles.readerResultCard, { backgroundColor: latestTone.background, borderColor: latestTone.border }]}>
              <View style={styles.resultHeader}>
                <View style={styles.resultIconWrap}>
                  <Ionicons
                    name={latestResult?.success === false ? "close-circle" : "checkmark-circle"}
                    size={26}
                    color={latestTone.icon}
                  />
                </View>
                <View style={styles.resultCopy}>
                  <Text style={styles.resultTitle}>{latestResult?.name || "No tap recorded"}</Text>
                  {latestResult?.program || latestResult?.yearSection || latestResult?.campusId ? (
                    <Text style={styles.resultPersonMeta}>
                      {[latestResult.program, latestResult.yearSection, latestResult.campusId]
                        .filter(Boolean)
                        .join(" | ")}
                    </Text>
                  ) : null}
                  <Text style={styles.resultSubtitle}>
                    {latestResult?.message || "The next check-in or check-out result will appear here."}
                  </Text>
                </View>
              </View>
              <View style={styles.resultMetaGrid}>
                <View style={styles.resultMetaCard}>
                  <Text style={styles.resultMetaLabel}>User Type</Text>
                  <Text style={styles.resultMetaValue}>
                    {latestResult ? formatRoleLabel(latestResult.userType) : "Waiting"}
                  </Text>
                </View>
                <View style={styles.resultMetaCard}>
                  <Text style={styles.resultMetaLabel}>Action</Text>
                  <Text style={styles.resultMetaValue}>
                    {latestResult ? formatRoleLabel(latestResult.action) : selectedActionMeta.label}
                  </Text>
                </View>
                <View style={styles.resultMetaCard}>
                  <Text style={styles.resultMetaLabel}>Status</Text>
                  <Text style={styles.resultMetaValue}>
                    {latestResult ? formatRoleLabel(latestResult.status) : "Ready"}
                  </Text>
                </View>
                <View style={styles.resultMetaCard}>
                  <Text style={styles.resultMetaLabel}>Time</Text>
                  <Text style={styles.resultMetaValue}>
                    {latestResult ? formatDateTime(latestResult.timestamp) : "N/A"}
                  </Text>
                </View>
                <View style={styles.resultMetaCard}>
                  <Text style={styles.resultMetaLabel}>
                    {latestResult?.userType === "visitor" ? "Office / Area" : "Program / Area"}
                  </Text>
                  <Text style={styles.resultMetaValue}>
                    {latestResult?.program || "N/A"}
                  </Text>
                </View>
                <View style={styles.resultMetaCard}>
                  <Text style={styles.resultMetaLabel}>
                    {latestResult?.userType === "visitor" ? "Purpose" : "Year / Section"}
                  </Text>
                  <Text style={styles.resultMetaValue}>
                    {latestResult?.yearSection || "N/A"}
                  </Text>
                </View>
                {latestResult?.userType === "visitor" ? (
                  <View style={styles.resultMetaCard}>
                    <Text style={styles.resultMetaLabel}>Visit Schedule</Text>
                    <Text style={styles.resultMetaValue}>
                      {latestResult.visitSchedule || "N/A"}
                    </Text>
                  </View>
                ) : null}
                {latestResult && latestResult.userType !== "visitor" ? (
                  <View style={styles.resultMetaCard}>
                    <Text style={styles.resultMetaLabel}>Record Type</Text>
                    <Text style={styles.resultMetaValue}>
                      {latestResult.attendanceScope || "Attendance"}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.resultMetaCard, styles.resultMetaCardWide]}>
                  <Text style={styles.resultMetaLabel}>
                    {latestResult ? getCredentialLabel(latestResult) : "NFC UID"}
                  </Text>
                  <Text style={styles.resultMetaValue}>
                    {latestResult?.nfcCardId || "N/A"}
                  </Text>
                </View>
                {latestResult?.virtualNfcToken && latestResult.virtualNfcToken !== latestResult.nfcCardId ? (
                  <View style={[styles.resultMetaCard, styles.resultMetaCardWide]}>
                    <Text style={styles.resultMetaLabel}>Stored Virtual Card ID</Text>
                    <Text style={styles.resultMetaValue}>
                      {latestResult.virtualNfcToken}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={[styles.stationSide, isCompactStation && styles.stationSideCompact]}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Check Flow</Text>
              <View style={styles.actionGrid}>
                {ACTION_OPTIONS.map((option) => {
                  const selected = option.key === selectedAction;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.actionCard,
                        selected && styles.actionCardActive,
                        selected && { borderColor: option.color },
                      ]}
                      onPress={() => {
                        setSelectedAction(option.key);
                        setTimeout(focusReader, 80);
                      }}
                    >
                      <View
                        style={[
                          styles.actionIcon,
                          { backgroundColor: selected ? option.color : "#E2E8F0" },
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={18}
                          color={selected ? "#FFFFFF" : "#475569"}
                        />
                      </View>
                      <View style={styles.actionCopy}>
                        <Text style={[styles.actionLabel, selected && { color: option.color }]}>
                          {option.label}
                        </Text>
                        <Text style={styles.actionMeta}>{option.subtitle}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Checkpoint</Text>
                  <Text style={styles.sectionSubtitle}>
                    {isMobileNfcStation
                      ? "Use this phone at the selected checkpoint."
                      : "Assign this physical reader to one office."}
                  </Text>
                </View>
                <View style={styles.floorCountBadge}>
                  <Text style={styles.floorCountText}>{isMobileNfcStation ? "This phone" : "1 reader"}</Text>
                </View>
              </View>

              <View style={styles.selectedCheckpointBanner}>
                <View style={styles.selectedCheckpointIcon}>
                  <Ionicons name={selectedCheckpoint.icon} size={18} color="#FFFFFF" />
                </View>
                <View style={styles.selectedCheckpointCopy}>
                  <Text style={styles.selectedCheckpointLabel}>{selectedCheckpoint.label}</Text>
                  <Text style={styles.selectedCheckpointMeta}>{getFloorName(selectedCheckpoint.floor)}</Text>
                </View>
              </View>

              <View style={styles.floorTabRow}>
                {MONITORING_MAP_FLOORS.map((floor) => {
                  const selected = floor.id === selectedFloorKey;
                  const count = floorCheckpointCounts[floor.id] || 0;
                  return (
                    <TouchableOpacity
                      key={floor.id}
                      style={[styles.floorTab, selected && styles.floorTabActive]}
                      onPress={() => handleSelectFloor(floor.id)}
                    >
                      <Ionicons
                        name={floor.icon}
                        size={16}
                        color={selected ? "#FFFFFF" : "#0A3D91"}
                      />
                      <Text style={[styles.floorTabText, selected && styles.floorTabTextActive]}>
                        {floor.name}
                      </Text>
                      <View style={[styles.floorTabBadge, selected && styles.floorTabBadgeActive]}>
                        <Text style={[styles.floorTabBadgeText, selected && styles.floorTabBadgeTextActive]}>
                          {count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.checkpointSearchWrap}>
                <Ionicons name="search-outline" size={17} color="#64748B" />
                <TextInput
                  style={styles.checkpointSearchInput}
                  value={checkpointSearch}
                  onChangeText={setCheckpointSearch}
                  placeholder={`Search ${getFloorName(selectedFloorKey)} offices`}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {checkpointSearch ? (
                  <TouchableOpacity
                    style={styles.checkpointSearchClear}
                    onPress={() => {
                      setCheckpointSearch("");
                      setTimeout(focusReader, 80);
                    }}
                  >
                    <Ionicons name="close" size={16} color="#64748B" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView style={styles.checkpointListScroll} showsVerticalScrollIndicator={false}>
                <View style={[styles.checkpointGrid, isNarrowStation && styles.checkpointGridCompact]}>
                  {visibleCheckpoints.map((checkpoint) => {
                    const selected = checkpoint.key === selectedCheckpointKey;
                    return (
                      <TouchableOpacity
                        key={checkpoint.key}
                        style={[styles.checkpointCard, selected && styles.checkpointCardActive]}
                        onPress={() => handleSelectCheckpoint(checkpoint.key)}
                      >
                        <View style={[styles.checkpointIcon, selected && styles.checkpointIconActive]}>
                          <Ionicons
                            name={checkpoint.icon}
                            size={17}
                            color={selected ? "#0A3D91" : "#0A3D91"}
                          />
                        </View>
                        <View style={styles.checkpointCopy}>
                          <Text
                            style={[styles.checkpointLabel, selected && styles.checkpointLabelActive]}
                            numberOfLines={1}
                          >
                            {checkpoint.label}
                          </Text>
                          <Text
                            style={[styles.checkpointMeta, selected && styles.checkpointMetaActive]}
                            numberOfLines={1}
                          >
                            {getFloorName(checkpoint.floor)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {!visibleCheckpoints.length ? (
                    <View style={styles.checkpointEmpty}>
                      <Ionicons name="search-outline" size={20} color="#94A3B8" />
                      <Text style={styles.checkpointEmptyText}>No office matches this search.</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </View>

          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Station Feed</Text>
              <Text style={styles.sectionHint}>
                This device | Page {Math.min(stationFeedPage, stationFeedTotalPages)} of {stationFeedTotalPages}
              </Text>
            </View>
            <View style={styles.stationFeedActions}>
              <TouchableOpacity
                style={styles.refreshFeedButton}
                onPress={() => refreshStationFeed().catch(() => {})}
                disabled={stationFeedRefreshing}
                accessibilityRole="button"
                accessibilityLabel="Refresh station feed"
              >
                {stationFeedRefreshing ? (
                  <ActivityIndicator size="small" color="#0A3D91" />
                ) : (
                  <Ionicons name="refresh-outline" size={15} color="#0A3D91" />
                )}
                <Text style={styles.refreshFeedButtonText}>
                  {stationFeedRefreshing ? "Refreshing" : "Refresh"}
                </Text>
              </TouchableOpacity>
              {stationEvents.length ? (
                <TouchableOpacity style={styles.clearFeedButton} onPress={clearStationFeed}>
                  <Ionicons name="trash-outline" size={15} color="#B91C1C" />
                  <Text style={styles.clearFeedButtonText}>Clear Feed</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          {stationEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="pulse-outline" size={34} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No checkpoint events yet</Text>
              <Text style={styles.emptyText}>
                Process a card tap to see check-in, check-out, or movement results here.
              </Text>
            </View>
          ) : (
            <>
              {paginatedStationEvents.map((event, index) => (
                <View
                  key={`${event.timestamp}-${index}`}
                  style={[
                    styles.feedRow,
                    isNarrowStation && styles.feedRowCompact,
                    index > 0 && styles.feedRowBorder,
                  ]}
                >
                  <View
                    style={[
                      styles.feedIconWrap,
                      event.success ? styles.feedIconWrapSuccess : styles.feedIconWrapError,
                    ]}
                  >
                    <Ionicons
                      name={event.success ? "checkmark" : "close"}
                      size={16}
                      color={event.success ? "#166534" : "#B91C1C"}
                    />
                  </View>
                  <View style={styles.feedCopy}>
                    <Text style={styles.feedTitle}>{event.name}</Text>
                    <Text style={styles.feedSubtitle}>
                      {[formatRoleLabel(event.userType), getCredentialLabel(event), event.program, event.yearSection, formatRoleLabel(event.action), event.checkpoint]
                        .filter(Boolean)
                        .join(" | ")}
                    </Text>
                    <Text style={styles.feedTimestamp}>{formatDateTime(event.timestamp)}</Text>
                  </View>
                  <View style={[styles.feedStatusBadge, isNarrowStation && styles.feedStatusBadgeCompact]}>
                    <Text style={styles.feedStatusText}>
                      {event.success ? "OK" : "BLOCKED"}
                    </Text>
                  </View>
                </View>
              ))}
              <View style={styles.feedPager}>
                <TouchableOpacity
                  style={[styles.feedPagerButton, stationFeedPage <= 1 && styles.feedPagerButtonDisabled]}
                  onPress={() => setStationFeedPage((page) => Math.max(1, page - 1))}
                  disabled={stationFeedPage <= 1}
                >
                  <Ionicons name="chevron-back-outline" size={16} color={stationFeedPage <= 1 ? "#94A3B8" : "#0A3D91"} />
                  <Text style={[styles.feedPagerButtonText, stationFeedPage <= 1 && styles.feedPagerButtonTextDisabled]}>
                    Previous
                  </Text>
                </TouchableOpacity>
                <Text style={styles.feedPagerText}>
                  {stationEvents.length} saved event{stationEvents.length === 1 ? "" : "s"}
                </Text>
                <TouchableOpacity
                  style={[styles.feedPagerButton, stationFeedPage >= stationFeedTotalPages && styles.feedPagerButtonDisabled]}
                  onPress={() => setStationFeedPage((page) => Math.min(stationFeedTotalPages, page + 1))}
                  disabled={stationFeedPage >= stationFeedTotalPages}
                >
                  <Text style={[styles.feedPagerButtonText, stationFeedPage >= stationFeedTotalPages && styles.feedPagerButtonTextDisabled]}>
                    Next
                  </Text>
                  <Ionicons name="chevron-forward-outline" size={16} color={stationFeedPage >= stationFeedTotalPages ? "#94A3B8" : "#0A3D91"} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showNotifications}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.notificationPanel}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="notifications-outline" size={22} color="#0A3D91" />
                <Text style={styles.modalTitle}>NFC Notifications</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowNotifications(false)}
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.notificationPanelContent}>
              {offlinePendingCount > 0 ? (
                <View style={styles.notificationIssueCard}>
                  <Ionicons name="cloud-offline-outline" size={20} color="#B45309" />
                  <View style={styles.notificationIssueCopy}>
                    <Text style={styles.notificationIssueTitle}>Offline taps waiting to sync</Text>
                    <Text style={styles.notificationIssueText}>
                      {offlinePendingCount} tap{offlinePendingCount === 1 ? " is" : "s are"} stored on this device. Use “Sync Now” when the connection returns.
                    </Text>
                  </View>
                </View>
              ) : null}
              {stationIssues.map((issue, index) => (
                <View key={`${issue.timestamp}-${index}`} style={styles.notificationIssueCard}>
                  <Ionicons name="alert-circle-outline" size={20} color="#B91C1C" />
                  <View style={styles.notificationIssueCopy}>
                    <Text style={styles.notificationIssueTitle}>{issue.checkpoint || "NFC tap needs attention"}</Text>
                    <Text style={styles.notificationIssueText}>{issue.message || "The NFC tap could not be processed."}</Text>
                    <Text style={styles.notificationIssueTime}>{formatDateTime(issue.timestamp)}</Text>
                  </View>
                </View>
              ))}
              {!offlinePendingCount && !stationIssues.length ? (
                <View style={styles.notificationEmptyState}>
                  <Ionicons name="checkmark-circle-outline" size={34} color="#16A34A" />
                  <Text style={styles.notificationEmptyTitle}>All clear</Text>
                  <Text style={styles.notificationIssueText}>There are no failed or queued NFC taps.</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F3F6FA",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FB",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
  },
  accessDeniedWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  accessDeniedCard: {
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 24,
    ...CARD_SHADOW,
  },
  accessDeniedIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    marginBottom: 16,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  accessDeniedText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
  },
  accessDeniedRolePill: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accessDeniedRoleText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#64748B",
  },
  accessDeniedButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
  },
  accessDeniedButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  content: {
    width: "100%",
    maxWidth: 1480,
    alignSelf: "center",
    padding: 22,
    paddingBottom: 34,
  },
  contentCompact: {
    padding: 12,
    paddingBottom: 24,
  },
  headerCard: {
    backgroundColor: "#071D3A",
    borderRadius: 24,
    padding: 22,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#123C74",
    ...CARD_SHADOW,
  },
  headerCardCompact: {
    borderRadius: 18,
    padding: 16,
  },
  headerMainRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  headerMainRowCompact: {
    gap: 12,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 260,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#93C5FD",
    textTransform: "uppercase",
  },
  headerTitle: {
    marginTop: 4,
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerTitleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  headerSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#D8E8FF",
    maxWidth: 760,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notificationButton: {
    position: "relative",
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1451A6",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.42)",
  },
  notificationBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC2626",
    borderWidth: 2,
    borderColor: "#082A63",
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "rgba(22, 163, 74, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.34)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  headerBadgeWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    borderColor: "rgba(253, 230, 138, 0.36)",
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#DCFCE7",
  },
  headerBadgeTextWarning: {
    color: "#FEF3C7",
  },
  headerMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  headerMetric: {
    flex: 1,
    minWidth: 160,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(216, 232, 255, 0.18)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerMetricLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#93C5FD",
    textTransform: "uppercase",
  },
  headerMetricValue: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  operatorCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...CARD_SHADOW,
  },
  operatorIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  operatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#0A3D91",
    alignItems: "center",
    justifyContent: "center",
  },
  operatorAvatarText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  operatorLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  operatorName: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  operatorMeta: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
  },
  operatorStatusBadge: {
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  operatorStatusBadgeWarning: {
    backgroundColor: "#FEF3C7",
  },
  operatorStatusText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166534",
  },
  operatorStatusTextWarning: {
    color: "#92400E",
  },
  warningCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#92400E",
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...CARD_SHADOW,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 12,
  },
  sectionSubtitle: {
    marginTop: -6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: "#64748B",
  },
  floorCountBadge: {
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  floorCountText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0A3D91",
  },
  floorTabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  floorTab: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2EE",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexGrow: 1,
    flexBasis: 148,
  },
  floorTabActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },
  floorTabText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },
  floorTabTextActive: {
    color: "#FFFFFF",
  },
  floorTabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 6,
  },
  floorTabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  floorTabBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
  },
  floorTabBadgeTextActive: {
    color: "#FFFFFF",
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  stationFeedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refreshFeedButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshFeedButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0A3D91",
  },
  clearFeedButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearFeedButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#B91C1C",
  },
  selectedCheckpointBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#0A3D91",
    padding: 12,
    marginBottom: 12,
  },
  selectedCheckpointIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  selectedCheckpointCopy: {
    flex: 1,
    minWidth: 0,
  },
  selectedCheckpointLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  selectedCheckpointMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
    color: "#D8E8FF",
  },
  checkpointSearchWrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D9E2EE",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  checkpointSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    paddingVertical: 10,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  checkpointSearchClear: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
  },
  optionRow: {
    gap: 10,
    paddingBottom: 4,
  },
  optionCard: {
    minWidth: 128,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE5F0",
    padding: 12,
    backgroundColor: "#F8FAFC",
    gap: 8,
  },
  optionCardActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  optionLabelActive: {
    color: "#FFFFFF",
  },
  optionMeta: {
    fontSize: 12,
    color: "#64748B",
  },
  optionMetaActive: {
    color: "#D8E8FF",
  },
  actionGrid: {
    gap: 10,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D9E2EE",
    padding: 12,
    backgroundColor: "#FBFCFE",
  },
  actionCardActive: {
    borderColor: "#0A3D91",
    backgroundColor: "#EEF5FF",
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCopy: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  actionLabelActive: {
    color: "#0A3D91",
  },
  actionMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  actionMetaActive: {
    color: "#1E40AF",
  },
  cardInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  cardInputBusy: {
    opacity: 0.7,
  },
  readerHintCard: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readerHintText: {
    flex: 1,
    minWidth: 180,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#0A3D91",
  },
  readerHintMeta: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
  },
  inlineActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  inlineActionsCompact: {
    flexDirection: "column",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C7DAF8",
    backgroundColor: "#F0F7FF",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0A3D91",
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: "#0A3D91",
    paddingVertical: 12,
    ...Platform.select({
      web: { boxShadow: "0px 10px 20px rgba(10, 61, 145, 0.22)" },
      android: { elevation: 2 },
      default: {},
    }),
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  resultCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    ...CARD_SHADOW,
  },
  readerResultCard: {
    marginBottom: 0,
  },
  resultCardSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  resultCardError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  resultHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  resultIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  resultCopy: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  resultPersonMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    color: "#0A3D91",
  },
  resultSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
  },
  resultMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  resultMetaCard: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
  },
  resultMetaCardWide: {
    flexBasis: 230,
  },
  resultMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  resultMetaValue: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 18,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    textAlign: "center",
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  feedRowCompact: {
    alignItems: "flex-start",
  },
  feedRowBorder: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  feedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  feedIconWrapSuccess: {
    backgroundColor: "#DCFCE7",
  },
  feedIconWrapError: {
    backgroundColor: "#FEE2E2",
  },
  feedCopy: {
    flex: 1,
  },
  feedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  feedSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  feedTimestamp: {
    marginTop: 4,
    fontSize: 12,
    color: "#94A3B8",
  },
  feedStatusBadge: {
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  feedStatusBadgeCompact: {
    alignSelf: "flex-start",
  },
  feedStatusText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
  },
  feedPager: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  feedPagerButton: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C7DAF8",
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  feedPagerButtonDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  feedPagerButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0A3D91",
  },
  feedPagerButtonTextDisabled: {
    color: "#94A3B8",
  },
  feedPagerText: {
    flex: 1,
    minWidth: 120,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  stationLayout: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginBottom: 16,
  },
  stationLayoutCompact: {
    gap: 14,
  },
  stationPrimary: {
    flex: 1.15,
    flexBasis: 520,
    gap: 16,
  },
  stationPrimaryCompact: {
    flexBasis: "100%",
    gap: 12,
  },
  stationSide: {
    flex: 0.85,
    flexBasis: 360,
  },
  stationSideCompact: {
    flexBasis: "100%",
  },
  tapPad: {
    minHeight: 310,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },
  tapPadCompact: {
    minHeight: 250,
    borderRadius: 18,
    padding: 16,
    paddingTop: 78,
  },
  tapPadBusy: {
    opacity: 0.88,
  },
  tapPadIcon: {
    width: 88,
    height: 88,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
  },
  tapPadIconCompact: {
    width: 72,
    height: 72,
    borderRadius: 24,
    marginBottom: 12,
  },
  tapPadTitle: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  tapPadTitleCompact: {
    fontSize: 23,
    lineHeight: 29,
  },
  tapPadSubtitle: {
    marginTop: 10,
    maxWidth: 420,
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
  },
  tapPadStatusRow: {
    position: "absolute",
    top: 18,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tapPadStatusRowCompact: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 8,
  },
  tapPadStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.74)",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  tapPadStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  tapPadStatusText: {
    fontSize: 12,
    fontWeight: "900",
  },
  tapPadTimestamp: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  tapPadTimestampCompact: {
    maxWidth: "100%",
  },
  tapPadMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 20,
    alignSelf: "stretch",
  },
  tapPadMetaRowCompact: {
    flexDirection: "column",
  },
  tapPadMetaCard: {
    flex: 1,
    minWidth: 130,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 12,
  },
  tapPadMetaLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
  },
  tapPadMetaValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  readerPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...CARD_SHADOW,
  },
  readerPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  readerPanelLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
  },
  readerPanelTitle: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
  },
  pn532Panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#BBD7FF",
    ...CARD_SHADOW,
  },
  operatorCardCompact: {
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
  },
  pn532PanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  readerPanelHeaderCompact: {
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  pn532PanelTitle: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: "900",
    color: "#0A3D91",
  },
  pn532StatusCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 14,
  },
  pn532StatusCardSuccess: {
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },
  pn532StatusCardError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  pn532StatusIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DBEAFE",
  },
  pn532StatusIconSuccess: {
    backgroundColor: "#DCFCE7",
  },
  pn532StatusIconError: {
    backgroundColor: "#FEE2E2",
  },
  pn532StatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  pn532StatusTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
  pn532StatusText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    color: "#334155",
  },
  pn532StatusMeta: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    color: "#64748B",
  },
  focusButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  focusButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0A3D91",
  },
  checkpointGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  checkpointGridCompact: {
    flexDirection: "column",
  },
  checkpointListScroll: {
    maxHeight: 330,
  },
  checkpointCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E2EE",
    backgroundColor: "#FBFCFE",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 145,
  },
  checkpointCardActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },
  checkpointIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },
  checkpointIconActive: {
    backgroundColor: "#FFFFFF",
  },
  checkpointCopy: {
    flex: 1,
    minWidth: 0,
  },
  checkpointLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },
  checkpointLabelActive: {
    color: "#FFFFFF",
  },
  checkpointMeta: {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B",
  },
  checkpointMetaActive: {
    color: "#D8E8FF",
  },
  checkpointEmpty: {
    flexGrow: 1,
    flexBasis: "100%",
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  checkpointEmptyText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  flowStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...CARD_SHADOW,
  },
  flowStep: {
    flex: 1,
    minWidth: 110,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  flowText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },
  hardwareBar: {
    marginBottom: 16,
  },
  hardwareChannelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  hardwareBadgeGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  hardwareBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  hardwareBadgeActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  hardwareBadgeWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  hardwareBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#94A3B8",
  },
  hardwareBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  hardwareSettingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  hardwareSettingsBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
  },
  hardwareActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    ...Platform.select({ web: { cursor: "pointer" } }),
  },
  hardwareActionChipActive: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  hardwareActionChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0A3D91",
  },
  hardwareActionChipTextActive: {
    color: "#166534",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 10,
  },
  offlineBannerCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  offlineBannerText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#92400E",
  },
  offlineSyncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#B45309",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  offlineSyncButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 620,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    overflow: "hidden",
    ...CARD_SHADOW,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#F8FAFC",
  },
  modalHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  modalContent: {
    padding: 18,
  },
  notificationPanel: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "78%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    overflow: "hidden",
    ...CARD_SHADOW,
  },
  notificationPanelContent: {
    padding: 16,
  },
  notificationIssueCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  notificationIssueCopy: {
    flex: 1,
  },
  notificationIssueTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  notificationIssueText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
  },
  notificationIssueTime: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  notificationEmptyState: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  notificationEmptyTitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: "900",
    color: "#166534",
  },
  consoleStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  consoleStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  consoleStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  consoleStatusText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  consoleActionsRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  consoleBtn: {
    backgroundColor: "#0A3D91",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  consoleBtnDanger: {
    backgroundColor: "#DC2626",
  },
  consoleBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  consoleBtnOutline: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  consoleBtnOutlineText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  consoleUnavailableText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },
  terminalContainer: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    minHeight: 220,
    maxHeight: 320,
  },
  terminalHeader: {
    fontSize: 10,
    fontWeight: "900",
    color: "#38BDF8",
    letterSpacing: 1,
    marginBottom: 8,
  },
  terminalScroll: {
    flex: 1,
  },
  terminalEmptyText: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 8,
  },
  terminalLine: {
    fontSize: 11,
    color: "#4ADE80",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 4,
  },
  simSubtitle: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 14,
  },
  simPresetList: {
    gap: 10,
  },
  simPresetCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    borderRadius: 14,
    ...Platform.select({ web: { cursor: "pointer" } }),
  },
  simPresetTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  simPresetMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginTop: 3,
  },
});
