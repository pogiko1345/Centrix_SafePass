import { subscribeNotificationUpdates } from "../utils/notificationEvents";
﻿import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
  Modal,
  Vibration,
  TextInput,
  useWindowDimensions,
  Animated,
  Easing,
  AppState,
  NativeModules,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from 'expo-haptics';
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ApiService from "../utils/ApiService";
import IDScannerService from "../utils/IDScannerService";
import {
  formatSafePassDate,
  formatSafePassDateTime,
  formatSafePassTime,
} from "../utils/dateTimeUtils";
import CampusMap from "../components/CampusMap";
import visitorDashboardStyles from "../styles/VisitorDashboardStyles";
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
import {
  MobileConnectionBanner,
} from "../components/mobile/MobileRoleComponents";

const visitorBrandLogo = require("../assets/LogoSapphireAppIcon.png");
const visitorSchoolLogo = require("../assets/LogoSapphire.jpg");
const Storage =
  Platform.OS === "web" ? require("../utils/webStorage").default : AsyncStorage;
const SafePassHce = NativeModules.SafePassHce;

const isSafePassConnectionError = (error) =>
  Boolean(error?.isSafePassConnectionError) ||
  String(error?.code || "") === "SAFEPASS_CONNECTION_ERROR" ||
  String(error?.message || "").includes("Cannot connect to the SafePass server") ||
  String(error?.message || "").includes("Network request failed");

let DateTimePickerComponent = null;
if (Platform.OS !== "web") {
  try {
    const DateTimePickerModule = require("@react-native-community/datetimepicker");
    DateTimePickerComponent = DateTimePickerModule.default;
  } catch (error) {
    console.warn("DateTimePicker not available:", error);
  }
}

const APPOINTMENT_PURPOSE_OPTIONS = [
  "Enrollment",
  "Payment",
  "Inquiry",
  "Document Request",
  "Other",
];

const APPOINTMENT_DEPARTMENT_OPTIONS = [
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
for (let hour = 7; hour <= 18; hour += 1) {
  for (const minute of [0, 30]) {
    DEFAULT_APPOINTMENT_TIME_SLOTS.push({
      id: `slot-${String(hour).padStart(2, "0")}-${String(minute).padStart(2, "0")}`,
      label: "",
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      hour,
      minute,
      enabled: true,
    });
  }
}

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

const VISITOR_MODULES = [
  {
    id: "home",
    label: "Home",
    description: "Overview and quick actions",
    icon: "home-outline",
  },
  {
    id: "appointment",
    label: "Appointment",
    description: "Request and track visits",
    icon: "calendar-outline",
  },
  {
    id: "map",
    label: "Campus Map",
    description: "Ground, mezzanine, second, and third floor guide",
    icon: "map-outline",
  },
  {
    id: "account",
    label: "Account",
    description: "Profile details and account tools",
    icon: "person-circle-outline",
  },
];

  const getDefaultDepartmentForPurpose = (purpose = "") => {
  switch (purpose) {
    case "Enrollment":
    case "Document Request":
      return "Registrar";
    case "Payment":
      return "Accounting";
    case "Inquiry":
      return "Information Desk";
    default:
      return "";
  }
};

const getStoredVisitorIdType = (visitorRecord = {}) => {
  const explicitType = String(visitorRecord?.idType || "").trim();
  if (APPOINTMENT_ID_TYPE_OPTIONS.includes(explicitType)) {
    return explicitType;
  }

  const legacyValue = String(visitorRecord?.idNumber || "").trim();
  if (APPOINTMENT_ID_TYPE_OPTIONS.includes(legacyValue)) {
    return legacyValue;
  }

  return "";
};

const PHONE_TRACKING_INTERVAL_MS = 15000;
const PHONE_TRACKING_DISTANCE_METERS = 8;
const SMART_REFRESH_MIN_INTERVAL_MS = 30000;
const VISITOR_CONNECTIVITY_REMINDER_KEY = "visitorConnectivityReminderShown";
const VISITOR_SELECTED_SECTION_KEY = "visitorDashboardSelectedSection";
const VISITOR_APPOINTMENT_SCREEN_KEY = "visitorDashboardAppointmentScreen";
const VISITOR_MAP_FLOOR_KEY = "visitorDashboardMapFloor";
const VISITOR_APPOINTMENT_SCREENS = ["menu", "request", "history"];
const SCHOOL_OFFICE_HOURS = {
  openHour: 8,
  openMinute: 0,
  closeHour: 18,
  closeMinute: 0,
};
const AFTER_HOURS_APPOINTMENT_NOTICE = {
  title: "Appointment Request Received",
  message:
    "Your appointment request has been submitted successfully. Since it was sent after school hours, it will be reviewed once the office reopens on the next school day.",
};
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const AnimatedPressable = ({
  children,
  style,
  onPress,
  disabled = false,
  activeOpacity = 0.9,
  pressScale = 0.97,
  ...props
}) => {
  const pressAnim = useRef(new Animated.Value(1)).current;

  const animatePress = (toValue, duration = 120) => {
    Animated.timing(pressAnim, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  return (
    <AnimatedTouchableOpacity
      {...props}
      disabled={disabled}
      activeOpacity={activeOpacity}
      style={[style, { transform: [{ scale: pressAnim }] }]}
      onPress={onPress}
      onPressIn={() => !disabled && animatePress(pressScale, 90)}
      onPressOut={() => !disabled && animatePress(1, 140)}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
};

const ScrollReveal = ({
  children,
  scrollY,
  viewportHeight,
  delay = 0,
  threshold = 70,
  style,
}) => {
  const [layoutY, setLayoutY] = useState(null);
  const [hasRevealed, setHasRevealed] = useState(false);
  const revealAnim = useRef(new Animated.Value(Platform.OS === "web" ? 0 : 1)).current;

  useEffect(() => {
    if (Platform.OS !== "web") {
      setHasRevealed(true);
      revealAnim.setValue(1);
      return;
    }

    if (hasRevealed || layoutY === null) return;

    const revealPoint = Number(scrollY || 0) + Number(viewportHeight || 0) - threshold;
    if (layoutY > revealPoint) return;

    setHasRevealed(true);
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: 380,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [delay, hasRevealed, layoutY, revealAnim, scrollY, threshold, viewportHeight]);

  return (
    <Animated.View
      onLayout={(event) => setLayoutY(event.nativeEvent.layout.y)}
      style={[
        style,
        {
          opacity: revealAnim,
          transform: [
            {
              translateY: revealAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
            {
              scale: revealAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.985, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const getEnabledAppointmentOptionLabels = (items = [], fallback = []) => {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  const labels = items
    .filter((item) => item?.enabled !== false)
    .map((item) => String(item?.label || item?.value || "").trim())
    .filter(Boolean);
  return labels;
};

const getDateFromTimeSlot = (slot = {}) => {
  const option = new Date();
  option.setHours(Number(slot.hour), Number(slot.minute), 0, 0);
  return option;
};

const VISITOR_OFFICE_MAP_ALIASES = {
  Registrar: "ground-registrar",
  "Registrar's Office": "ground-registrar",
  Accounting: "ground-accounting",
  "Accounting Office": "ground-accounting",
  Cashier: "ground-cashier",
  "Information Desk": "ground-lobby",
  Lobby: "ground-lobby",
  Guidance: "ground-offices",
  Administration: "ground-offices",
  Admissions: "ground-offices",
  "File Room": "ground-file-room",
  Storage: "ground-storage",
  Clinic: "ground-clinic",
  "Conference Room": "ground-conference-room",
  Chairman: "ground-chairman",
  "Flight Operations": "flight-operations",
  Training: "head-of-training-room",
  "Head Of Training Room": "head-of-training-room",
  "I.T Room": "it-room",
  "Faculty Room": "faculty-room",
  "Academy Director": "academy-director",
  "Mock Up": "second-mock-up",
  Laboratory: "second-laboratory",
  TESDA: "second-tesda",
  Workshop: "third-workshop",
  "Tools Room": "third-tools-room",
  Library: "third-library",
  "Student Services": "ground-staff",
  "Students Lounge": "third-students-lounge",
  STO: "sto",
  "Classroom 1": "second-classroom-1",
  "Classroom 2": "second-classroom-2",
  "Classroom 3": "second-classroom-3",
  "Classroom 4": "second-classroom-4",
  "Classroom 5": "second-classroom-5",
  "Classroom 6": "second-classroom-6",
  "Classroom 7": "second-classroom-7",
  "Classroom 8": "second-classroom-8",
};

const getVisitorDestinationInfo = (
  visitorRecord = {},
  mapRooms = MONITORING_MAP_OFFICES,
  mapRoomPositions = MONITORING_MAP_OFFICE_POSITIONS,
) => {
  const requestedOffice = String(
    visitorRecord?.currentDestination?.office ||
      visitorRecord?.appointmentDepartment ||
      visitorRecord?.assignedOffice ||
      visitorRecord?.host ||
      "",
  ).trim();
  const officeId =
    VISITOR_OFFICE_MAP_ALIASES[requestedOffice] ||
    mapRooms.find(
      (office) => office.name.toLowerCase() === requestedOffice.toLowerCase(),
    )?.id ||
    "ground-lobby";
  const office = mapRooms.find((item) => item.id === officeId) || mapRooms[0] || MONITORING_MAP_OFFICES[0];
  const floor = MONITORING_MAP_FLOORS.find((item) => item.id === office?.floor) || MONITORING_MAP_FLOORS[0];

  return {
    officeId,
    officeName: requestedOffice || office?.name || "Lobby",
    floorId: floor?.id || "ground",
    floorName: floor?.name || "Ground Floor",
    icon: office?.icon || "navigate-outline",
    position: mapRoomPositions[officeId] || MONITORING_MAP_OFFICE_POSITIONS[officeId],
  };
};

const getVisitorSelfLocationMarker = (
  visitorRecord = {},
  mapRooms = MONITORING_MAP_OFFICES,
  mapRoomPositions = MONITORING_MAP_OFFICE_POSITIONS,
) => {
  const currentLocation = visitorRecord?.currentLocation || {};
  const normalizedStatus = String(visitorRecord?.status || "").toLowerCase();
  const isOnCampus =
    normalizedStatus === "checked_in" &&
    currentLocation?.isActive !== false &&
    !visitorRecord?.checkedOutAt;

  if (!isOnCampus) return null;

  const officeName = String(
    currentLocation.office ||
      visitorRecord?.currentDestination?.office ||
      visitorRecord?.appointmentDepartment ||
      visitorRecord?.assignedOffice ||
      visitorRecord?.host ||
      "",
  ).trim();
  const matchedRoom =
    mapRooms.find((room) => room.name.toLowerCase() === officeName.toLowerCase()) ||
    mapRooms.find((room) => officeName.toLowerCase().includes(room.name.toLowerCase())) ||
    mapRooms.find((room) => room.name.toLowerCase().includes(officeName.toLowerCase()));
  const coordinates = currentLocation.coordinates || currentLocation || {};
  const numericX = Number(coordinates.x);
  const numericY = Number(coordinates.y);
  const matchedPosition = matchedRoom ? mapRoomPositions[matchedRoom.id] : null;
  const position =
    matchedPosition ||
    (Number.isFinite(numericX) && Number.isFinite(numericY)
      ? { x: numericX, y: numericY }
      : null);

  if (!position) return null;

  return {
    id: `visitor-self-${visitorRecord._id || visitorRecord.id || "current"}`,
    name: "You are here",
    status: "checked_in",
    isSelfMarker: true,
    purpose: officeName || "Your current campus location",
    trackingSource: currentLocation.source || "visitor_self",
    lastUpdate: currentLocation.lastSeenAt || visitorRecord.updatedAt || visitorRecord.checkedInAt,
    location: {
      floor: currentLocation.floor || matchedRoom?.floor || "ground",
      office: officeName || matchedRoom?.name || "Campus",
      coordinates: position,
      timestamp: currentLocation.lastSeenAt || visitorRecord.updatedAt || visitorRecord.checkedInAt,
      source: currentLocation.source || "visitor_self",
    },
  };
};

const isSchoolOfficeServiceDay = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date.getDay() !== 0;
};

const isAfterSchoolOfficeHours = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  if (!isSchoolOfficeServiceDay(date)) return true;

  const openAt = new Date(date);
  openAt.setHours(SCHOOL_OFFICE_HOURS.openHour, SCHOOL_OFFICE_HOURS.openMinute, 0, 0);

  const closedAt = new Date(date);
  closedAt.setHours(SCHOOL_OFFICE_HOURS.closeHour, SCHOOL_OFFICE_HOURS.closeMinute, 0, 0);

  return date < openAt || date >= closedAt;
};

const getAppointmentAfterHoursNotice = (response = {}, submittedAt = new Date()) => {
  if (response?.afterHoursNotice?.title && response?.afterHoursNotice?.message) {
    return response.afterHoursNotice;
  }

  if (response?.afterHours === true || isAfterSchoolOfficeHours(submittedAt)) {
    return AFTER_HOURS_APPOINTMENT_NOTICE;
  }

  return null;
};

const buildVisitorRouteSteps = (destination = {}) => {
  const officeName = destination.officeName || "your assigned office";
  const floorName = destination.floorName || "Ground Floor";
  const steps = [
    "Enter through the main gate and present your SafePass approval with your selected valid ID.",
    "Proceed to the security or information point for confirmation before entering the office area.",
  ];

  if (destination.floorId === "ground") {
    steps.push(`Stay on the ground floor and follow the office labels toward ${officeName}.`);
  } else if (destination.floorId === "first") {
    steps.push(`Use the stairs to reach the mezzanine, then follow the room labels toward ${officeName}.`);
  } else {
    steps.push(`Use the approved stair route to reach the ${floorName}, then follow the room labels toward ${officeName}.`);
  }

  steps.push("Wait at the office reception or doorway until staff confirms your appointment.");
  return steps;
};

// NFC Configuration
// For web: Use Web NFC API
// For mobile: Use react-native-nfc-manager
let NfcManager = null;
let NfcEvents = null;
if (Platform.OS !== 'web') {
  try {
    const nfcModule = require('react-native-nfc-manager');
    NfcManager = nfcModule.default || nfcModule;
    NfcEvents = nfcModule.NfcEvents;
  } catch (e) {
    console.log('NFC module not available:', e);
  }
}

const isNullNativeNfcError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("cannot convert null value to object") || message.includes("null value");
};

const getValidDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getAppointmentHolidayInfo = (dateValue) => {
  const date = getValidDate(dateValue);
  if (!date) return null;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const fixedHolidayMap = {
    "1-1": "New Year's Day",
    "4-9": "Araw ng Kagitingan",
    "5-1": "Labor Day",
    "6-12": "Independence Day",
    "8-21": "Ninoy Aquino Day",
    "11-1": "All Saints' Day",
    "11-2": "All Souls' Day",
    "11-30": "Bonifacio Day",
    "12-8": "Feast of the Immaculate Conception",
    "12-24": "Christmas Eve",
    "12-25": "Christmas Day",
    "12-30": "Rizal Day",
    "12-31": "New Year's Eve",
  };

  const name = fixedHolidayMap[`${month}-${day}`];
  return name ? { name } : null;
};

const isAppointmentDateUnavailable = (dateValue) => {
  const date = getValidDate(dateValue);
  if (!date) return true;
  return date.getDay() === 0 || Boolean(getAppointmentHolidayInfo(date));
};

const getNextAvailableAppointmentDate = (inputDate = new Date()) => {
  const nextDate = new Date(inputDate);
  nextDate.setHours(12, 0, 0, 0);

  while (isAppointmentDateUnavailable(nextDate)) {
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(12, 0, 0, 0);
  }

  return nextDate;
};

export default function VisitorDashboardScreen({ navigation, onLogout }) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const isWideVisitorDashboard = viewportWidth >= 960;
  const isTabletVisitorDashboard = viewportWidth >= 680;
  const isCompactVisitorDashboard = viewportWidth <= 420;
  const dashboardHorizontalGutter = isCompactVisitorDashboard ? 12 : viewportWidth <= 680 ? 16 : 20;
  const dashboardCardPadding = isCompactVisitorDashboard ? 16 : 22;
  const [visitor, setVisitor] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedVisitorSection, setSelectedVisitorSection] = useState("home");
  const [selectedAppointmentScreen, setSelectedAppointmentScreen] = useState("menu");
  const [selectedVisitorMapFloor, setSelectedVisitorMapFloor] = useState("ground");
  const [visitorMapResetKey, setVisitorMapResetKey] = useState(0);
  const [visitorMapRooms, setVisitorMapRooms] = useState(MONITORING_MAP_OFFICES);
  const [visitorMapRoomPositions, setVisitorMapRoomPositions] = useState(MONITORING_MAP_OFFICE_POSITIONS);
  const visitorScreenRestoreReadyRef = useRef(false);
  const [appointmentFeedback, setAppointmentFeedback] = useState(null);
  const [appointmentHistory, setAppointmentHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showVisitorMapFullscreen, setShowVisitorMapFullscreen] = useState(false);
  const [showAppointmentDatePicker, setShowAppointmentDatePicker] = useState(false);
  const [showAppointmentTimePicker, setShowAppointmentTimePicker] = useState(false);
  const [showEditAppointmentModal, setShowEditAppointmentModal] = useState(false);
  const [showEditAppointmentDatePicker, setShowEditAppointmentDatePicker] = useState(false);
  const [showEditAppointmentTimePicker, setShowEditAppointmentTimePicker] = useState(false);
  const [showCancelAppointmentModal, setShowCancelAppointmentModal] = useState(false);
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [profileEditForm, setProfileEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    emergencyContact: ''
  });
  const [showPurposeDropdown, setShowPurposeDropdown] = useState(false);
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [showIdTypeDropdown, setShowIdTypeDropdown] = useState(false);
  const [showVirtualNfcModal, setShowVirtualNfcModal] = useState(false);
  const [showVirtualNfcSuccessModal, setShowVirtualNfcSuccessModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckInSuccessModal, setShowCheckInSuccessModal] = useState(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [showCheckOutSuccessModal, setShowCheckOutSuccessModal] = useState(false);
  const [checkOutTargetVisitor, setCheckOutTargetVisitor] = useState(null);
  const [visitorPushNotice, setVisitorPushNotice] = useState(null);
  const [visitorWarningNotice, setVisitorWarningNotice] = useState(null);
  const [visitorAlert, setVisitorAlert] = useState(null);
  const [isVisitorDarkMode, setIsVisitorDarkMode] = useState(false);
  const [dashboardScrollY, setDashboardScrollY] = useState(0);
  const [isSubmittingAppointment, setIsSubmittingAppointment] = useState(false);
  const [isUpdatingAppointment, setIsUpdatingAppointment] = useState(false);
  const [isVerifyingAppointmentId, setIsVerifyingAppointmentId] = useState(false);
  const appointmentIdRevisionRef = useRef(0);
  const [isSendingLateNotice, setIsSendingLateNotice] = useState(false);
  const [isVirtualTapLoading, setIsVirtualTapLoading] = useState(false);
  const [isCheckInLoading, setIsCheckInLoading] = useState(false);
  const [isCheckOutLoading, setIsCheckOutLoading] = useState(false);
  const [appointmentAvailability, setAppointmentAvailability] = useState(null);
  const availabilityRequestRef = useRef(0);
  const visitorDataRequestRef = useRef(0);
  const visitorForegroundLoadRef = useRef(false);
  const [isLoadingAppointmentSlots, setIsLoadingAppointmentSlots] = useState(false);
  const [staffDirectoryError, setStaffDirectoryError] = useState("");
  const [appointmentOptions, setAppointmentOptions] = useState({
    offices: [],
    staff: [],
    purposes: APPOINTMENT_PURPOSE_OPTIONS.map((label) => ({ label, enabled: true })),
    timeSlots: DEFAULT_APPOINTMENT_TIME_SLOTS,
  });
  const [appointmentForm, setAppointmentForm] = useState({
    preferredDate: null,
    preferredTime: null,
    department: "",
    departments: [],
    staffAssignments: {},
    purposeSelection: "",
    customPurpose: "",
    idType: "",
    idImage: null,
    backIdImage: null,
    idVerification: null,
    verificationProof: null,
    privacyAccepted: false,
  });
  const [appointmentEditForm, setAppointmentEditForm] = useState({
    appointment: null,
    preferredDate: null,
    preferredTime: null,
    reason: "",
  });
  const [appointmentCancellationForm, setAppointmentCancellationForm] = useState({
    appointment: null,
    reason: "",
  });
  const [hasAppointmentDraft, setHasAppointmentDraft] = useState(false);
  const [isAppointmentScreenTransitioning, setIsAppointmentScreenTransitioning] = useState(false);
  const [appointmentTransitionLabel, setAppointmentTransitionLabel] = useState("Loading appointment module...");
  const [visitorTransitionDirection, setVisitorTransitionDirection] = useState(1);
  const [webAppointmentCalendarMonth, setWebAppointmentCalendarMonth] = useState(() => getNextAvailableAppointmentDate(new Date()));
  const [greeting, setGreeting] = useState("");
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isNfcEnabled, setIsNfcEnabled] = useState(false);
  const [isNfcReading, setIsNfcReading] = useState(false);
  const [nfcStatus, setNfcStatus] = useState(null);
  const [phoneTrackingStatus, setPhoneTrackingStatus] = useState({
    active: false,
    permission: "unknown",
    message: "Phone GPS tracking starts after check-in.",
    lastSentAt: null,
  });
  const [tapCount, setTapCount] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);
  const isVisitorHomeSection = selectedVisitorSection === "home";
  const isVisitorAccountSection = selectedVisitorSection === "account";
  const isVisitorMapSection = selectedVisitorSection === "map";
  const shouldShowVisitorCommandDeck = isVisitorHomeSection;
  const nfcListenerRef = useRef(null);
  const nfcTapProcessingRef = useRef(false);
  const nativeNfcUnavailableRef = useRef(false);
  const nativeNfcUnavailableLoggedRef = useRef(false);
  const lastVisitorStatusRef = useRef(null);
  const hasLoadedVisitorRef = useRef(false);
  const smartRefreshAtRef = useRef(0);
  const visitorProfileSignatureRef = useRef("");
  const currentUserSignatureRef = useRef("");
  const dashboardScrollRef = useRef(null);
  const phoneLocationSubscriptionRef = useRef(null);
  const appointmentTransitionTimeoutRef = useRef(null);
  const appointmentSubmitInFlightRef = useRef(false);
  const visitorTabTransitionTimeoutRef = useRef(null);
  const visitorPushNoticeTimeoutRef = useRef(null);
  const appointmentWebDateInputRef = useRef(null);
  const shownVisitorWarningIdsRef = useRef(new Set());
  const visitorWarningCheckInFlightRef = useRef(false);
  const syncedVirtualNfcTokenRef = useRef("");
  const dashboardHeroAnim = useRef(new Animated.Value(0)).current;
  const dashboardContentAnim = useRef(new Animated.Value(0)).current;
  const visitorTransitionAnim = useRef(new Animated.Value(1)).current;
  const isCompactVirtualCardView = viewportWidth <= 540;
  const isWideAppointmentView = viewportWidth >= 780;
  const commandMetricCardWidth = isWideVisitorDashboard
    ? "31.8%"
    : isTabletVisitorDashboard
      ? "48.5%"
      : "100%";
  const compactCommandMetricCardWidth = viewportWidth <= 560 ? "31%" : commandMetricCardWidth;
  const approvedFactCardWidth = isWideVisitorDashboard
    ? "31.8%"
    : isTabletVisitorDashboard
      ? "48.5%"
      : "100%";
  const approvedActionCardWidth = isTabletVisitorDashboard ? "48.5%" : "100%";
  const compactApprovedActionCardWidth = viewportWidth <= 560 ? "100%" : approvedActionCardWidth;

  useEffect(() => subscribeNotificationUpdates(() => {
    loadVisitorData({ silent: true, force: true });
  }), []);

  const loadManagedAppointmentOptions = async () => {
    try {
      const response = await ApiService.getAppointmentOptions();
      if (response?.success && response?.options) {
        setAppointmentOptions(response.options);
        setStaffDirectoryError("");
      }
    } catch (error) {
      setStaffDirectoryError("Cannot load available staff. Tap to retry.");
    }
  };

  useEffect(() => {
    if (!currentUser?._id) return;

    let isMounted = true;

    ApiService.getAppointmentOptions()
      .then((response) => {
        if (isMounted && response?.success && response?.options) {
          setAppointmentOptions(response.options);
        }
      })
      .catch((error) => {
        console.log("Load appointment options error:", error);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?._id]);

  useEffect(() => {
    let isMounted = true;

    const restoreVisitorScreen = async () => {
      try {
        const [savedSection, savedAppointmentScreen, savedMapFloor] = await Promise.all([
          Storage.getItem(VISITOR_SELECTED_SECTION_KEY),
          Storage.getItem(VISITOR_APPOINTMENT_SCREEN_KEY),
          Storage.getItem(VISITOR_MAP_FLOOR_KEY),
        ]);

        if (!isMounted) return;

        if (VISITOR_MODULES.some((module) => module.id === savedSection)) {
          setSelectedVisitorSection(savedSection);
        }

        if (VISITOR_APPOINTMENT_SCREENS.includes(savedAppointmentScreen)) {
          setSelectedAppointmentScreen(savedAppointmentScreen);
        }

        if (MONITORING_MAP_FLOORS.some((floor) => floor.id === savedMapFloor)) {
          setSelectedVisitorMapFloor(savedMapFloor);
        }
      } finally {
        if (isMounted) {
          visitorScreenRestoreReadyRef.current = true;
        }
      }
    };

    restoreVisitorScreen();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadVisitorMapSettings = async () => {
      try {
        const response = await ApiService.getMapSettings();
        if (isMounted && response?.success) {
          const nextMapSettings = normalizeMapSettingsPayload(response.mapSettings);
          setVisitorMapRooms(nextMapSettings.rooms);
          setVisitorMapRoomPositions(nextMapSettings.roomPositions);
        }
      } catch (error) {
        console.log("Visitor map settings load skipped:", error?.message || error);
      }
    };

    loadVisitorMapSettings();
    const unsubscribe = navigation?.addListener?.("focus", loadVisitorMapSettings);

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [navigation]);

  useEffect(() => {
    if (!visitorScreenRestoreReadyRef.current) return;

    Storage.multiSet([
      [VISITOR_SELECTED_SECTION_KEY, selectedVisitorSection],
      [VISITOR_APPOINTMENT_SCREEN_KEY, selectedAppointmentScreen],
      [VISITOR_MAP_FLOOR_KEY, selectedVisitorMapFloor],
    ]).catch((error) => {
      console.log("Save visitor screen state error:", error);
    });
  }, [selectedVisitorSection, selectedAppointmentScreen, selectedVisitorMapFloor]);

  const isVisitorAccessApproved = (visitorRecord = visitor) => {
    const approvalPending =
      visitorRecord?.status === "pending" || visitorRecord?.approvalStatus === "pending";
    const normalizedStatus = String(visitorRecord?.status || "").toLowerCase();
    const visitPassed = hasVisitorSchedulePassed(visitorRecord);
    const pendingStaffReview =
      !approvalPending &&
      visitorRecord?.approvalFlow === "staff" &&
      visitorRecord?.appointmentStatus === "pending";

    return (
      !approvalPending &&
      !visitPassed &&
      !pendingStaffReview &&
      (normalizedStatus === "approved" || normalizedStatus === "checked_in")
    );
  };

  const isSafePassCardActive = (visitorRecord = visitor, accountRecord = currentUser) => {
    const safePassId = String(
      visitorRecord?.nfcCardId ||
        accountRecord?.nfcCardId ||
        "",
    ).trim();
    const accountStatus = String(accountRecord?.status || "").toLowerCase();
    const cardActive =
      accountRecord?.cardActive ??
      accountRecord?.accessPermissions?.cardActive ??
      true;

    return Boolean(safePassId) && accountStatus === "active" && cardActive !== false;
  };

  const getVisitorAccessBlockedMessage = (visitorRecord = visitor, accountRecord = currentUser) => {
    if (!isSafePassCardActive(visitorRecord, accountRecord)) {
      return "Your SafePass card is not active yet. Please contact admin or security.";
    }

    const visitStatus = String(visitorRecord?.status || "").toLowerCase();
    if (visitStatus === "checked_out" || visitorRecord?.checkedOutAt) {
      return "This visit has already been completed.";
    }

    if (visitStatus === "no_show" || visitorRecord?.noShowMarkedAt) {
      return "This appointment date has passed and was marked as no-show. Please request a new appointment.";
    }

    if (visitStatus === "expired" || visitorRecord?.visitExpiredAt) {
      return "This appointment has expired. Please request a new appointment.";
    }

    if (!isVisitorAccessApproved(visitorRecord)) {
      return "This visit must be approved before check-in and check-out are available.";
    }

    const scheduledDate = getValidDate(visitorRecord?.visitDate);
    if (scheduledDate) {
      const visitDay = new Date(scheduledDate);
      visitDay.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (visitDay.getTime() < today.getTime()) {
        return "This appointment date has passed. Please request a new appointment.";
      }
      if (visitDay.getTime() > today.getTime()) {
        const scheduledDateLabel = scheduledDate.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        return `Your visit is approved for ${scheduledDateLabel}. Check-in is only available on that appointment date.`;
      }
    }

    return "";
  };

  const getVisitorAccessBlockedTitle = (message = "") => {
    const normalizedMessage = String(message || "").toLowerCase();
    if (normalizedMessage.includes("card")) return "Card Not Active";
    if (normalizedMessage.includes("already been completed")) return "Visit Completed";
    if (normalizedMessage.includes("no-show") || normalizedMessage.includes("expired")) return "Visit Expired";
    if (normalizedMessage.includes("still waiting") || normalizedMessage.includes("approved before")) {
      return "Approval Required";
    }
    if (normalizedMessage.includes("appointment date") || normalizedMessage.includes("check-in opens")) {
      return "Check-In Not Open";
    }
    return "Check-In Unavailable";
  };
  const activeAppointmentPurposeOptions = useMemo(
    () => getEnabledAppointmentOptionLabels(appointmentOptions.purposes, APPOINTMENT_PURPOSE_OPTIONS),
    [appointmentOptions.purposes],
  );
  const activeAppointmentDepartmentOptions = useMemo(
    () => getEnabledAppointmentOptionLabels(appointmentOptions.offices, []),
    [appointmentOptions.offices],
  );
  const activeAppointmentStaffOptions = Array.isArray(appointmentOptions.staff) ? appointmentOptions.staff : [];
  const appointmentTimeOptions = useMemo(() => {
    const configuredSlots = Array.isArray(appointmentOptions.timeSlots) ? appointmentOptions.timeSlots : [];
    const activeSlots = configuredSlots.filter((slot) => slot?.enabled !== false);
    const slots = configuredSlots.length ? activeSlots : DEFAULT_APPOINTMENT_TIME_SLOTS;
    return slots.map(getDateFromTimeSlot).filter((option) => !Number.isNaN(option.getTime()));
  }, [appointmentOptions.timeSlots]);

  useEffect(() => {
    setAppointmentForm((prev) => {
      const selectedTime = getValidDate(prev.preferredTime);
      const timeStillEnabled =
        !selectedTime ||
        appointmentTimeOptions.some(
          (option) =>
            option.getHours() === selectedTime.getHours() &&
            option.getMinutes() === selectedTime.getMinutes(),
        );
      const selectedDepartments = Array.isArray(prev.departments)
        ? prev.departments
        : prev.department
          ? [prev.department]
          : [];
      const nextDepartments = selectedDepartments.filter((department) =>
        activeAppointmentDepartmentOptions.includes(department) &&
          activeAppointmentStaffOptions.some((staff) => staff.department === department && staff.id === prev.staffAssignments?.[department]),
      );
      const nextDepartment = nextDepartments[0] || "";
      const nextPurpose = activeAppointmentPurposeOptions.includes(prev.purposeSelection)
        ? prev.purposeSelection
        : "";

      if (
        nextDepartment === prev.department &&
        nextDepartments.join("|") === selectedDepartments.join("|") &&
        nextPurpose === prev.purposeSelection &&
        timeStillEnabled
      ) {
        return prev;
      }

      return {
        ...prev,
        department: nextDepartment,
        departments: nextDepartments,
        staffAssignments: Object.fromEntries(nextDepartments.map((office) => [office, prev.staffAssignments[office]])),
        purposeSelection: nextPurpose,
        customPurpose: nextPurpose === "Other" ? prev.customPurpose : "",
        preferredTime: timeStillEnabled ? prev.preferredTime : appointmentTimeOptions[0] || null,
      };
    });
  }, [activeAppointmentDepartmentOptions, activeAppointmentPurposeOptions, appointmentTimeOptions]);

  useEffect(() => {
    const isAppointmentSection = selectedVisitorSection === "appointment";
    const heroDuration = isVisitorHomeSection ? 190 : isAppointmentSection ? 220 : 180;
    const contentDuration = isVisitorHomeSection ? 210 : isAppointmentSection ? 240 : 200;

    dashboardHeroAnim.setValue(0);
    dashboardContentAnim.setValue(0);
    visitorTransitionAnim.setValue(0);

    Animated.parallel([
      Animated.timing(dashboardHeroAnim, {
        toValue: 1,
        duration: heroDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(dashboardContentAnim, {
        toValue: 1,
        duration: contentDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(visitorTransitionAnim, {
        toValue: 1,
        duration: contentDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [
    selectedVisitorSection,
    selectedAppointmentScreen,
    isVisitorHomeSection,
    dashboardHeroAnim,
    dashboardContentAnim,
    visitorTransitionAnim,
  ]);
  const dashboardShellResponsiveStyle = {
    paddingHorizontal: dashboardHorizontalGutter,
    paddingBottom: isCompactVisitorDashboard ? 10 : 16,
  };
  const dashboardCardResponsiveStyle = {
    marginHorizontal: 0,
    padding: isCompactVisitorDashboard && isVisitorHomeSection ? 14 : dashboardCardPadding,
  };
  const dashboardHeroCardResponsiveStyle = {
    marginHorizontal: 0,
  };
  const dashboardSectionResponsiveStyle = {
    marginHorizontal: 0,
  };
  const commandActionRowResponsiveStyle = viewportWidth <= 560 ? { gap: 10 } : null;
  const commandActionButtonResponsiveStyle = viewportWidth <= 560 ? { width: "100%" } : null;
  const compactHomeHeaderStyle = isCompactVisitorDashboard && isVisitorHomeSection
    ? visitorDashboardStyles.headerCompactHome
    : null;
  const compactHomeSupportStyle = isCompactVisitorDashboard && isVisitorHomeSection
    ? visitorDashboardStyles.headerSupportTextCompact
    : null;
  const compactCommandDeckStyle = isCompactVisitorDashboard && isVisitorHomeSection
    ? visitorDashboardStyles.commandDeckCardCompactHome
    : null;
  const compactApprovedHeroStyle = isCompactVisitorDashboard
    ? visitorDashboardStyles.approvedHeroCardCompact
    : null;
  const compactApprovedGradientStyle = isCompactVisitorDashboard
    ? visitorDashboardStyles.approvedHeroGradientCompact
    : null;
  const approvedSectionHeaderResponsiveStyle = viewportWidth <= 560
    ? { marginBottom: 12 }
    : null;
  const appointmentFormRowResponsiveStyle = isWideAppointmentView
    ? visitorDashboardStyles.appointmentFormRowWide
    : visitorDashboardStyles.appointmentFormRowStacked;
  const appointmentFormColumnResponsiveStyle = isWideAppointmentView
    ? visitorDashboardStyles.appointmentFormColumnWide
    : null;

  const loadVisitorPreferences = async () => {
    try {
      const savedDarkMode = await Storage.getItem("darkModeEnabled");
      setIsVisitorDarkMode(savedDarkMode === "true");
    } catch (error) {
      console.log("Load visitor preferences error:", error);
    }
  };

  useEffect(() => {
    loadVisitorPreferences();
    const unsubscribe = navigation?.addListener?.("focus", loadVisitorPreferences);
    return unsubscribe || undefined;
  }, [navigation]);

  const scrollDashboardToTop = (animated = true) => {
    setDashboardScrollY(0);
    requestAnimationFrame(() => {
      dashboardScrollRef.current?.scrollTo?.({ y: 0, animated });
    });
  };

  const closeAppointmentPopovers = () => {
    setShowAppointmentDatePicker(false);
    setShowAppointmentTimePicker(false);
    setShowPurposeDropdown(false);
    setShowDepartmentDropdown(false);
    setShowIdTypeDropdown(false);
  };

  const dismissVisitorPushNotice = () => {
    if (visitorPushNoticeTimeoutRef.current) {
      clearTimeout(visitorPushNoticeTimeoutRef.current);
      visitorPushNoticeTimeoutRef.current = null;
    }
    setVisitorPushNotice(null);
  };

  const handleAppointmentScreenNavigation = (targetScreen, loadingLabel = "Loading appointment module...") => {
    if (!VISITOR_APPOINTMENT_SCREENS.includes(targetScreen)) return;

    const currentAppointmentIndex = VISITOR_APPOINTMENT_SCREENS.indexOf(selectedAppointmentScreen);
    const nextAppointmentIndex = VISITOR_APPOINTMENT_SCREENS.indexOf(targetScreen);
    if (
      currentAppointmentIndex !== -1 &&
      nextAppointmentIndex !== -1 &&
      currentAppointmentIndex !== nextAppointmentIndex
    ) {
      setVisitorTransitionDirection(nextAppointmentIndex > currentAppointmentIndex ? 1 : -1);
    }

    if (
      selectedVisitorSection === "appointment" &&
      selectedAppointmentScreen === targetScreen &&
      !isAppointmentScreenTransitioning
    ) {
      scrollDashboardToTop(true);
      return;
    }

    if (appointmentTransitionTimeoutRef.current) {
      clearTimeout(appointmentTransitionTimeoutRef.current);
      appointmentTransitionTimeoutRef.current = null;
    }

    scrollDashboardToTop(false);
    setAppointmentTransitionLabel(loadingLabel);
    setIsAppointmentScreenTransitioning(true);
    closeAppointmentPopovers();

    appointmentTransitionTimeoutRef.current = setTimeout(() => {
      setSelectedAppointmentScreen(targetScreen);
      setIsAppointmentScreenTransitioning(false);
      appointmentTransitionTimeoutRef.current = null;
      scrollDashboardToTop(false);
    }, 420);
  };

  const handleVisitorSectionChange = (sectionId) => {
    if (!VISITOR_MODULES.some((module) => module.id === sectionId)) return;

    if (
      selectedVisitorSection === "appointment" &&
      sectionId === "appointment" &&
      selectedAppointmentScreen === "menu"
    ) {
      if (appointmentTransitionTimeoutRef.current) {
        clearTimeout(appointmentTransitionTimeoutRef.current);
        appointmentTransitionTimeoutRef.current = null;
      }
      setIsAppointmentScreenTransitioning(false);
      closeAppointmentPopovers();
      scrollDashboardToTop(true);
      return;
    }

    const currentIndex = VISITOR_MODULES.findIndex((module) => module.id === selectedVisitorSection);
    const nextIndex = VISITOR_MODULES.findIndex((module) => module.id === sectionId);
    if (currentIndex !== -1 && nextIndex !== -1 && currentIndex !== nextIndex) {
      setVisitorTransitionDirection(nextIndex > currentIndex ? 1 : -1);
    }

    if (selectedVisitorSection === sectionId && sectionId !== "appointment") {
      scrollDashboardToTop(true);
      return;
    }

    const switchSection = () => {
      scrollDashboardToTop(false);

      if (sectionId === "appointment") {
        if (selectedVisitorSection === "appointment") {
          if (selectedAppointmentScreen !== "menu") {
            handleAppointmentScreenNavigation("menu", "Opening appointment center...");
          }
          return;
        }

        setSelectedVisitorSection("appointment");
        handleAppointmentScreenNavigation("menu", "Opening appointment center...");
        return;
      }

      if (appointmentTransitionTimeoutRef.current) {
        clearTimeout(appointmentTransitionTimeoutRef.current);
        appointmentTransitionTimeoutRef.current = null;
      }
      setIsAppointmentScreenTransitioning(false);
      setSelectedVisitorSection(sectionId);
    };

    if (visitorTabTransitionTimeoutRef.current) {
      clearTimeout(visitorTabTransitionTimeoutRef.current);
      visitorTabTransitionTimeoutRef.current = null;
    }

    Animated.parallel([
      Animated.timing(dashboardContentAnim, {
        toValue: 0,
        duration: 115,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(visitorTransitionAnim, {
        toValue: 0,
        duration: 115,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      visitorTabTransitionTimeoutRef.current = setTimeout(() => {
        switchSection();
        visitorTabTransitionTimeoutRef.current = null;
      }, 20);
    });
  };

  const handleVisitorRouteNavigation = (routeName, params) => {
    Animated.sequence([
      Animated.timing(visitorTransitionAnim, {
        toValue: 0.94,
        duration: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(visitorTransitionAnim, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(() => {
      navigation.navigate(routeName, params);
    });
  };

  useEffect(() => {
    if (!isAppointmentScreenTransitioning) {
      scrollDashboardToTop(false);
    }
  }, [selectedVisitorSection, selectedAppointmentScreen, isAppointmentScreenTransitioning]);

  useEffect(() => {
    loadVisitorData();
    setGreetingMessage();
    checkNfcSupport();
    
    return () => {
      if (visitorTabTransitionTimeoutRef.current) {
        clearTimeout(visitorTabTransitionTimeoutRef.current);
        visitorTabTransitionTimeoutRef.current = null;
      }
      stopNfcReading();
      stopPhoneLocationTracking();
    };
  }, []);

  const smartRefreshVisitorData = () => {
    const now = Date.now();
    if (now - smartRefreshAtRef.current < SMART_REFRESH_MIN_INTERVAL_MS) return;
    smartRefreshAtRef.current = now;
    loadVisitorData({ silent: true });
    checkNfcSupport();
  };

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        smartRefreshVisitorData();
      }
    });
    const unsubscribeNavigationFocus = navigation?.addListener?.("focus", smartRefreshVisitorData);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("focus", smartRefreshVisitorData);
      return () => {
        appStateSubscription?.remove?.();
        unsubscribeNavigationFocus?.();
        window.removeEventListener("focus", smartRefreshVisitorData);
      };
    }

    return () => {
      appStateSubscription?.remove?.();
      unsubscribeNavigationFocus?.();
    };
  }, [navigation, visitor?._id, visitor?.status, visitor?.approvalStatus, visitor?.appointmentStatus]);

  useEffect(() => {
    // Keep an open visitor dashboard current while an admin processes the visit.
    // This is in-app live refresh; native background push requires a separately
    // configured Expo/FCM notification service.
    const activeVisitorId = currentUser?._id;
    if (!activeVisitorId) return undefined;

    const refreshTimer = setInterval(() => {
      loadVisitorData({ silent: true, force: true });
    }, 15000);

    return () => clearInterval(refreshTimer);
  }, [currentUser?._id, visitor?._id, visitor?.status, visitor?.approvalStatus, visitor?.appointmentStatus]);

  useEffect(() => () => {
    if (appointmentTransitionTimeoutRef.current) {
      clearTimeout(appointmentTransitionTimeoutRef.current);
    }
    if (visitorPushNoticeTimeoutRef.current) {
      clearTimeout(visitorPushNoticeTimeoutRef.current);
    }
  }, []);

  const showVisitorPushNotice = ({ title, message, type = "info" }) => {
    if (visitorPushNoticeTimeoutRef.current) {
      clearTimeout(visitorPushNoticeTimeoutRef.current);
    }

    setVisitorPushNotice({
      id: `${type}-${Date.now()}`,
      title,
      message,
      type,
      createdAt: new Date(),
    });

    visitorPushNoticeTimeoutRef.current = setTimeout(() => {
      setVisitorPushNotice(null);
      visitorPushNoticeTimeoutRef.current = null;
    }, 6000);
  };

  const getVisitorAlertType = (title = "", message = "") => {
    const text = `${title} ${message}`.toLowerCase();
    if (text.includes("success") || text.includes("submitted") || text.includes("approved") || text.includes("granted")) {
      return "success";
    }
    if (text.includes("failed") || text.includes("error") || text.includes("invalid")) {
      return "error";
    }
    if (text.includes("missing") || text.includes("unavailable") || text.includes("denied") || text.includes("warning")) {
      return "warning";
    }
    return "info";
  };

  const showVisitorAlert = (title, message, buttons = [{ text: "OK" }]) => {
    const normalizedButtons = Array.isArray(buttons) && buttons.length > 0
      ? buttons
      : [{ text: "OK" }];

    setVisitorAlert({
      id: `visitor-alert-${Date.now()}`,
      title: String(title || "Notice"),
      message: String(message || ""),
      type: getVisitorAlertType(title, message),
      buttons: normalizedButtons.map((button, index) => ({
        text: button?.text || (index === 0 ? "OK" : "Confirm"),
        style: button?.style || "default",
        onPress: button?.onPress,
      })),
    });
  };

  const dismissVisitorAlert = (button) => {
    setVisitorAlert(null);
    if (typeof button?.onPress === "function") {
      setTimeout(() => button.onPress(), 80);
    }
  };

  useEffect(() => {
    if (visitor?.status === "checked_in") {
      startPhoneLocationTracking(visitor);
    } else {
      stopPhoneLocationTracking();
    }
  }, [visitor?._id, visitor?.status]);

  useEffect(() => {
    const maybeShowConnectivityReminder = async () => {
      const appointmentStatus = String(visitor?.appointmentStatus || "").toLowerCase();
      const isStaffApprovedVisit =
        String(visitor?.approvalFlow || "").toLowerCase() === "staff" &&
        ["approved", "adjusted"].includes(appointmentStatus);

      if (!isStaffApprovedVisit || !visitor?._id || !visitor?.visitTime) {
        return;
      }

      const reminderToken = `${visitor._id}:${appointmentStatus}:${new Date(visitor.visitTime).toISOString()}`;
      const shownReminderToken = await Storage.getItem(VISITOR_CONNECTIVITY_REMINDER_KEY);

      if (shownReminderToken === reminderToken) {
        return;
      }

      await Storage.setItem(VISITOR_CONNECTIVITY_REMINDER_KEY, reminderToken);

      showVisitorPushNotice({
        type: "success",
        title: "Appointment Approved",
        message:
          "Before visiting, please turn on Wi-Fi or cellular data so check-in, notifications, and live visitor tracking can work properly.",
      });
    };

    maybeShowConnectivityReminder();
  }, [visitor?._id, visitor?.appointmentStatus, visitor?.approvalFlow, visitor?.visitTime]);

  useEffect(() => {
    if (isVisitorAccessApproved(visitor)) {
      return;
    }

    setShowVirtualNfcModal(false);
    setShowVirtualNfcSuccessModal(false);
    setShowCheckInModal(false);
    setShowCheckInSuccessModal(false);
    setShowCheckOutModal(false);
  }, [visitor?.status, visitor?.approvalStatus, visitor?.approvalFlow, visitor?.appointmentStatus]);

  const stopPhoneLocationTracking = async () => {
    if (phoneLocationSubscriptionRef.current) {
      phoneLocationSubscriptionRef.current.remove();
      phoneLocationSubscriptionRef.current = null;
    }

    setPhoneTrackingStatus((current) => ({
      ...current,
      active: false,
      message:
        current.permission === "denied"
          ? "Location permission is disabled."
          : "Phone GPS tracking is off.",
    }));
  };

  const sendPhoneLocationUpdate = async (visitorRecord, location) => {
    const coords = location?.coords;
    if (!visitorRecord?._id || !coords) return;

    await ApiService.updateVisitorPhoneLocation(visitorRecord._id, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      heading: coords.heading,
      speed: coords.speed,
      floor: visitorRecord.currentLocation?.floor || "ground",
      office: visitorRecord.currentLocation?.office || "Phone GPS",
      deviceId: `visitor-phone-${visitorRecord._id}`,
    });

    setPhoneTrackingStatus({
      active: true,
      permission: "granted",
      message: `Last phone GPS update sent at ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}.`,
      lastSentAt: new Date().toISOString(),
    });
  };

  const startPhoneLocationTracking = async (visitorRecord = visitor) => {
    if (Platform.OS === "web" || !visitorRecord?._id || phoneLocationSubscriptionRef.current) {
      return;
    }

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setPhoneTrackingStatus({
          active: false,
          permission: "disabled",
          message: "Turn on Location Services to allow live visitor tracking.",
          lastSentAt: null,
        });
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setPhoneTrackingStatus({
          active: false,
          permission: "denied",
          message: "Location permission is required for live visitor tracking.",
          lastSentAt: null,
        });
        return;
      }

      setPhoneTrackingStatus({
        active: true,
        permission: "granted",
        message: "Phone GPS tracking is active while you are checked in.",
        lastSentAt: null,
      });

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await sendPhoneLocationUpdate(visitorRecord, currentPosition);

      phoneLocationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: PHONE_TRACKING_INTERVAL_MS,
          distanceInterval: PHONE_TRACKING_DISTANCE_METERS,
        },
        async (position) => {
          try {
            await sendPhoneLocationUpdate(visitorRecord, position);
          } catch (error) {
            console.error("Phone GPS tracking update error:", error);
            setPhoneTrackingStatus((current) => ({
              ...current,
              active: false,
              message: "Unable to send phone GPS update. It will retry while this screen is open.",
            }));
          }
        },
      );
    } catch (error) {
      console.error("Start phone GPS tracking error:", error);
      setPhoneTrackingStatus({
        active: false,
        permission: "error",
        message: "Phone GPS tracking could not start.",
        lastSentAt: null,
      });
    }
  };

  const setGreetingMessage = () => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning");
    else if (hour < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");
  };

  const maybeShowVisitorWarning = async (activeUser = currentUser) => {
    if (!activeUser?._id || visitorWarningCheckInFlightRef.current) return;
    visitorWarningCheckInFlightRef.current = true;
    try {
      const response = await ApiService.getNotifications({ read: "false", limit: 100 });
      const notice = (response.notifications || []).find((item) =>
        !shownVisitorWarningIdsRef.current.has(String(item._id)) &&
        (["warning", "alert"].includes(item.type) || item.severity === "high"),
      );
      if (!notice || String((await ApiService.getCurrentUser())?._id) !== String(activeUser._id)) return;
      shownVisitorWarningIdsRef.current.add(String(notice._id));
      setVisitorWarningNotice({ ...notice, id: String(notice._id) });
      if (Platform.OS !== "web") Vibration.vibrate([0, 120, 80, 120]);
    } catch { /* The shared inbox and the next refresh can retry. */ }
    finally { visitorWarningCheckInFlightRef.current = false; }
  };
  const dismissVisitorWarningNotice = async () => {
    const warningId = visitorWarningNotice?.id;
    setVisitorWarningNotice(null);

    if (!warningId) {
      return;
    }

    try {
      await ApiService.markNotificationAsRead(warningId);
    } catch (error) {
      console.error("Mark visitor warning as read error:", error);
    }
  };

  const buildVisitorProfileSignature = (profileResponse = {}, accountSafePassId = "") => {
    const visitorRecord = profileResponse?.visitor || null;
    const accountRecord = profileResponse?.account || null;
    const currentLocation = visitorRecord?.currentLocation || {};
    const coordinates = currentLocation?.coordinates || {};
    const appointments = Array.isArray(profileResponse?.appointments)
      ? profileResponse.appointments
      : [];

    return JSON.stringify({
      account: accountRecord
        ? {
            id: accountRecord._id,
            email: accountRecord.email,
            nfcCardId: accountRecord.nfcCardId,
            status: accountRecord.status,
            updatedAt: accountRecord.updatedAt,
          }
        : null,
      visitor: visitorRecord
        ? {
            id: visitorRecord._id,
            status: visitorRecord.status,
            approvalStatus: visitorRecord.approvalStatus,
            appointmentStatus: visitorRecord.appointmentStatus,
            requestCategory: visitorRecord.requestCategory,
            approvalFlow: visitorRecord.approvalFlow,
            purposeOfVisit: visitorRecord.purposeOfVisit,
            assignedOffice: visitorRecord.assignedOffice,
            appointmentDepartment: visitorRecord.appointmentDepartment,
            visitDate: visitorRecord.visitDate,
            visitTime: visitorRecord.visitTime,
            appointmentRequestedAt: visitorRecord.appointmentRequestedAt,
            appointmentRescheduledAt: visitorRecord.appointmentRescheduledAt,
            staffActionAt: visitorRecord.staffActionAt,
            nfcCardId: accountSafePassId || visitorRecord.nfcCardId,
            checkedInAt: visitorRecord.checkedInAt,
            checkedOutAt: visitorRecord.checkedOutAt,
            updatedAt: visitorRecord.updatedAt,
            currentLocation: {
              floor: currentLocation.floor,
              office: currentLocation.office,
              checkpointId: currentLocation.checkpointId,
              isActive: currentLocation.isActive,
              lastSeenAt: currentLocation.lastSeenAt,
              x: coordinates.x,
              y: coordinates.y,
            },
          }
        : null,
      appointments: appointments.map((appointment) => ({
        id: appointment?._id,
        status: appointment?.status,
        approvalStatus: appointment?.approvalStatus,
        appointmentStatus: appointment?.appointmentStatus,
        requestCategory: appointment?.requestCategory,
        approvalFlow: appointment?.approvalFlow,
        purposeOfVisit: appointment?.purposeOfVisit,
        assignedOffice: appointment?.assignedOffice,
        appointmentDepartment: appointment?.appointmentDepartment,
        visitDate: appointment?.visitDate,
        visitTime: appointment?.visitTime,
        appointmentRequestedAt: appointment?.appointmentRequestedAt,
        appointmentRescheduledAt: appointment?.appointmentRescheduledAt,
        staffActionAt: appointment?.staffActionAt,
        checkedInAt: appointment?.checkedInAt,
        checkedOutAt: appointment?.checkedOutAt,
        updatedAt: appointment?.updatedAt,
      })),
    });
  };

  const syncAndroidVirtualNfcToken = async (profileResponse = {}) => {
    if (Platform.OS !== "android" || !SafePassHce?.setVirtualCardToken) return;

    try {
      let token =
        profileResponse?.account?.virtualNfcToken ||
        profileResponse?.visitor?.virtualNfcToken ||
        "";

      if (!token) {
        const tokenResponse = await ApiService.ensureVisitorVirtualNfcToken();
        token = tokenResponse?.virtualNfcToken || "";
      }

      const normalizedToken = String(token || "").trim().toUpperCase();
      if (!normalizedToken || syncedVirtualNfcTokenRef.current === normalizedToken) return;

      await SafePassHce.setVirtualCardToken(normalizedToken);
      syncedVirtualNfcTokenRef.current = normalizedToken;
    } catch (error) {
      console.log("Virtual NFC token sync skipped:", error?.message || error);
    }
  };

  const loadVisitorData = async ({ silent = false, force = false } = {}) => {
    if (silent && visitorForegroundLoadRef.current) return;
    const requestId = ++visitorDataRequestRef.current;
    if (!silent) {
      visitorForegroundLoadRef.current = true;
      setIsLoading(true);
    }
    try {
      const currentUser = await ApiService.getCurrentUser();
      if (requestId !== visitorDataRequestRef.current) return;
      if (!currentUser) {
        navigation.replace("Login");
        return;
      }
      const currentUserSignature = JSON.stringify({
        id: currentUser?._id,
        email: currentUser?.email,
        role: currentUser?.role,
        status: currentUser?.status,
        nfcCardId: currentUser?.nfcCardId,
        profilePhoto: currentUser?.profilePhoto,
        updatedAt: currentUser?.updatedAt,
      });

      if (force || !silent || currentUserSignatureRef.current !== currentUserSignature) {
        currentUserSignatureRef.current = currentUserSignature;
        setCurrentUser(currentUser);
      }

      const profileResponse = await ApiService.getVisitorProfileCached();
      if (requestId !== visitorDataRequestRef.current) return;
      await syncAndroidVirtualNfcToken(profileResponse);
      if (requestId !== visitorDataRequestRef.current) return;
      const accountSafePassId =
        profileResponse?.account?.nfcCardId ||
        currentUser?.nfcCardId ||
        profileResponse?.visitor?.nfcCardId ||
        "";
      const nextProfileSignature = buildVisitorProfileSignature(profileResponse, accountSafePassId);
      const profileChanged = visitorProfileSignatureRef.current !== nextProfileSignature;

      if (!force && silent && !profileChanged) {
        void maybeShowVisitorWarning(currentUser);
        return;
      }

      visitorProfileSignatureRef.current = nextProfileSignature;

      if (profileResponse?.account) {
        setCurrentUser((previousUser) => ({
          ...(previousUser || currentUser || {}),
          ...profileResponse.account,
          accessPermissions: {
            ...((previousUser || currentUser || {}).accessPermissions || {}),
            ...(profileResponse.account.accessPermissions || {}),
          },
        }));
      }
      if (profileResponse.success && profileResponse.visitor) {
        const nextVisitor = {
          ...profileResponse.visitor,
          nfcCardId: accountSafePassId || profileResponse.visitor?.nfcCardId,
        };
        const previousStatus = lastVisitorStatusRef.current;
        const nextStatus = String(nextVisitor.status || "").toLowerCase();

        setVisitor(nextVisitor);
        setAppointmentHistory(Array.isArray(profileResponse.appointments) ? profileResponse.appointments : []);

        if (hasLoadedVisitorRef.current && previousStatus && previousStatus !== nextStatus) {
          if (nextStatus === "checked_in") {
            setSelectedVisitorSection("home");
            showVisitorPushNotice({
              title: "Checked In",
              message: "Your NFC card tap was approved. Your visitor pass is now active.",
              type: "success",
            });
          } else if (nextStatus === "checked_out") {
            setSelectedVisitorSection("home");
            showVisitorPushNotice({
              title: "Checked Out",
              message: "Your NFC card tap closed this visit.",
              type: "success",
            });
          }
        }

        lastVisitorStatusRef.current = nextStatus;
        hasLoadedVisitorRef.current = true;
      } else {
        setVisitor(null);
        setAppointmentHistory(Array.isArray(profileResponse.appointments) ? profileResponse.appointments : []);
        lastVisitorStatusRef.current = null;
        hasLoadedVisitorRef.current = true;
      }

      void maybeShowVisitorWarning(currentUser);
      setConnectionIssue(null);
    } catch (error) {
      if (requestId !== visitorDataRequestRef.current) return;
      if (!isSafePassConnectionError(error)) {
        console.error("Load visitor data error:", error);
      }
      const isProfileMissing =
        error?.status === 404 ||
        String(error?.message || "").includes("404") ||
        String(error?.message || "").toLowerCase().includes("profile not found") ||
        String(error?.message || "").toLowerCase().includes("visitor not found");

      if (isProfileMissing) {
        setVisitor(null);
      } else if (isSafePassConnectionError(error)) {
        setConnectionIssue({
          title: "SafePass server unavailable",
          message: error?.message || "Check your internet connection or try again.",
          updatedAt: Date.now(),
        });
      } else {
        showVisitorAlert("Error", "Failed to load visitor data");
      }
    } finally {
      if (!silent && requestId === visitorDataRequestRef.current) {
        visitorForegroundLoadRef.current = false;
        setIsLoading(false);
      }
    }
  };

  const refreshNfcAvailability = async ({ showDisabledAlert = false } = {}) => {
    if (Platform.OS === 'web') {
      const webSupported =
        typeof window !== "undefined" && ("NDEFReader" in window || "nfc" in navigator);
      setIsNfcSupported(webSupported);
      setIsNfcEnabled(webSupported);
      return {
        moduleAvailable: webSupported,
        supported: webSupported,
        enabled: webSupported,
      };
    }

    if (nativeNfcUnavailableRef.current) {
      setIsNfcSupported(false);
      setIsNfcEnabled(false);
      return {
        moduleAvailable: false,
        supported: false,
        enabled: false,
      };
    }

    const hasNativeNfcApi =
      NfcManager &&
      typeof NfcManager.isSupported === "function" &&
      typeof NfcManager.isEnabled === "function" &&
      typeof NfcManager.start === "function";

    if (!hasNativeNfcApi) {
      setIsNfcSupported(false);
      setIsNfcEnabled(false);
      return {
        moduleAvailable: false,
        supported: false,
        enabled: false,
      };
    }

    try {
      const isSupported = Boolean(await NfcManager.isSupported());
      setIsNfcSupported(isSupported);

      if (!isSupported) {
        setIsNfcEnabled(false);
        return {
          moduleAvailable: true,
          supported: false,
          enabled: false,
        };
      }

      await NfcManager.start();
      const isEnabled = Boolean(await NfcManager.isEnabled());
      setIsNfcEnabled(isEnabled);

      if (showDisabledAlert && !isEnabled) {
        showVisitorAlert(
          "NFC Disabled",
          "Please enable NFC in your device settings.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                if (Platform.OS === 'android') {
                  NfcManager?.goToNfcSetting?.();
                }
              },
            },
          ],
        );
      }

      return {
        moduleAvailable: true,
        supported: true,
        enabled: isEnabled,
      };
    } catch (error) {
      const errorMessage = String(error?.message || error || "");
      if (isNullNativeNfcError(error)) {
        nativeNfcUnavailableRef.current = true;
        if (!nativeNfcUnavailableLoggedRef.current) {
          console.log("NFC native module unavailable in this build. Falling back to virtual card flow.");
          nativeNfcUnavailableLoggedRef.current = true;
        }
      } else {
        console.log("NFC check unavailable:", errorMessage);
      }
      setIsNfcSupported(false);
      setIsNfcEnabled(false);
      return {
        moduleAvailable: false,
        supported: false,
        enabled: false,
        error,
      };
    }
  };

  // NFC Support Check
  const checkNfcSupport = async () => {
    await refreshNfcAvailability();
  };

  // Start NFC Reading
  const startNfcReading = async () => {
    const blockedMessage = getVisitorAccessBlockedMessage(visitor, currentUser);
    if (blockedMessage) {
      showVisitorAlert(
        getVisitorAccessBlockedTitle(blockedMessage),
        blockedMessage,
      );
      return false;
    }

    const nfcAvailability = await refreshNfcAvailability({ showDisabledAlert: true });

    if (!nfcAvailability.moduleAvailable) {
      showVisitorAlert(
        "NFC Module Unavailable",
        "This app build does not include the native NFC module. Install the SafePass development or release APK, then try again.",
      );
      return false;
    }

    if (!nfcAvailability.supported) {
      showVisitorAlert(
        "NFC Not Supported",
        "Your device doesn't support NFC. Please use the digital access card or manual check-in."
      );
      return false;
    }

    if (Platform.OS !== 'web' && !nfcAvailability.enabled) {
      return false;
    }

    setIsNfcReading(true);
    setNfcStatus({ type: 'info', message: 'Tap your device to the NFC reader...' });

    try {
      if (Platform.OS === 'web') {
        return await startWebNfc();
      } else {
        return await startMobileNfc();
      }
    } catch (error) {
      console.error("NFC start error:", error);
      setNfcStatus({ type: 'error', message: 'Failed to start NFC. Please try again.' });
      setIsNfcReading(false);
      return false;
    }
  };

  // Web NFC Implementation
  const startWebNfc = async () => {
    try {
      // @ts-ignore
      if (!('NDEFReader' in window)) {
        throw new Error('Web NFC not supported');
      }

      // @ts-ignore
      const ndef = new window.NDEFReader();
      
      nfcListenerRef.current = ndef;
      
      await ndef.scan();
      
      ndef.addEventListener("reading", ({ message, serialNumber }) => {
        handleNfcTagRead(message, serialNumber);
      });
      
      ndef.addEventListener("readingerror", (err) => {
        console.error("NFC read error:", err);
        setNfcStatus({ type: 'error', message: 'Failed to read NFC tag. Please try again.' });
      });
      
      return true;
    } catch (error) {
      console.error("Web NFC error:", error);
      setNfcStatus({ type: 'error', message: 'Web NFC not available or permission denied.' });
      return false;
    }
  };

  // Mobile NFC Implementation
  const startMobileNfc = async () => {
    if (!NfcManager || !NfcEvents) {
      setNfcStatus({
        type: "error",
        message: "Native NFC is not available in this app build.",
      });
      return false;
    }

    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag) => {
        handleNfcTagRead(tag);
      });
      
      NfcManager.setEventListener(NfcEvents.SessionClosed, () => {
        console.log('NFC session closed');
        setIsNfcReading(false);
        setNfcStatus(null);
      });
      
      await NfcManager.registerTagEvent();
      
      return true;
    } catch (error) {
      console.error("Mobile NFC error:", error);
      return false;
    }
  };

  // Handle NFC Tag Read
  const handleNfcTagRead = async (tagData, serialNumber = null) => {
    if (nfcTapProcessingRef.current) {
      return;
    }

    nfcTapProcessingRef.current = true;

    // Provide haptic feedback
    if (Platform.OS !== 'web') {
      Vibration.vibrate(100);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
    }
    
    setTapCount(prev => prev + 1);
    setLastTapTime(Date.now());
    
    // Extract data from NFC tag
    let readerId = null;
    let gateId = null;
    
    if (Platform.OS === 'web' && tagData) {
      // Parse NDEF message
      for (const record of tagData.records) {
        if (record.recordType === "text") {
          const textDecoder = new TextDecoder(record.encoding);
          const text = textDecoder.decode(record.data);
          try {
            const data = JSON.parse(text);
            readerId = data.readerId;
            gateId = data.gateId;
          } catch (e) {
            readerId = text;
          }
        }
      }
    } else if (tagData) {
      // Parse mobile NFC tag data
      const payload = tagData.ndefMessage?.[0]?.payload;
      if (payload) {
        const text = String.fromCharCode.apply(null, new Uint8Array(payload));
        try {
          const data = JSON.parse(text);
          readerId = data.readerId;
          gateId = data.gateId;
        } catch (e) {
          readerId = text;
        }
      }
    }
    
    try {
      // Process the tap - send to server
      await processNfcTap(readerId, gateId);
    } finally {
      setTimeout(() => {
        nfcTapProcessingRef.current = false;
      }, 1200);
    }
  };

  // Process NFC Tap (Send to Arduino via API)
  const processNfcTap = async (readerId, gateId) => {
    if (!visitor) {
      setNfcStatus({ type: 'error', message: 'No visitor data found. Please refresh.' });
      stopNfcReading();
      return;
    }

    setNfcStatus({ type: 'processing', message: 'Processing tap...' });

    try {
      // Send tap data to your backend
      const response = await ApiService.processNfcTap({
        visitorId: visitor._id,
        visitorName: visitor.fullName,
        visitorEmail: visitor.email,
        timestamp: new Date().toISOString(),
        readerId: readerId,
        gateId: gateId,
        status: visitor.status,
        source: "virtual_nfc_card",
      });

      if (response.success) {
        // Provide success feedback
        setNfcStatus({ type: 'success', message: 'Access granted! Gate opening...' });
        
        // Play success sound/feedback
        if (Platform.OS !== 'web') {
          Vibration.vibrate(90);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        
        // Check if this is a check-in or check-out
        if (response.action === 'check_in') {
          showVisitorAlert(
            "Checked In Successfully",
            `Welcome ${visitor.fullName}! Gate is opening.`,
            [{ text: "OK", onPress: () => loadVisitorData() }]
          );
        } else if (response.action === 'check_out') {
          setShowVirtualNfcModal(false);
          setShowVirtualNfcSuccessModal(false);
          setSelectedVisitorSection("home");
          showVisitorAlert(
            "Checked Out Successfully",
            `Goodbye ${visitor.fullName}! Thank you for visiting.`,
            [{ text: "OK", onPress: () => loadVisitorData() }]
          );
        } else {
          showVisitorAlert(
            "Access Granted",
            `Welcome ${visitor.fullName}! Gate is opening.`,
            [{ text: "OK" }]
          );
        }
        
        // Refresh visitor data to update status
        loadVisitorData();
        
        // Auto stop reading after successful tap
        setTimeout(() => {
          stopNfcReading();
        }, 2000);
      } else {
        // Access denied
        setNfcStatus({ type: 'error', message: response.message || 'Access denied' });
        
        if (Platform.OS !== 'web') {
          Vibration.vibrate([0, 80, 70, 140]);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        
        showVisitorAlert(
          "Access Denied",
          response.message || "Your visit request has not been approved yet.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("NFC tap processing error:", error);
      setNfcStatus({ type: 'error', message: 'Failed to process tap. Please try again.' });
      if (Platform.OS !== "web") {
        Vibration.vibrate([0, 80, 70, 140]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      
      showVisitorAlert(
        "Error",
        "Failed to process NFC tap. Please check your connection and try again.",
        [{ text: "OK" }]
      );
    }
  };

  // Stop NFC Reading
  const stopNfcReading = async () => {
    setIsNfcReading(false);
    setNfcStatus(null);
    
    try {
      if (Platform.OS === 'web' && nfcListenerRef.current) {
        // @ts-ignore
        nfcListenerRef.current.removeEventListener?.('reading', handleNfcTagRead);
        nfcListenerRef.current = null;
      } else if (NfcManager && NfcEvents) {
        try {
          await NfcManager.unregisterTagEvent();
        } catch (error) {
          if (isNullNativeNfcError(error)) {
            nativeNfcUnavailableRef.current = true;
          } else {
            console.log("NFC unregister skipped:", error?.message || error);
          }
        }

        if (!nativeNfcUnavailableRef.current) {
          NfcManager.setEventListener(NfcEvents.DiscoverTag, () => {});
          NfcManager.setEventListener(NfcEvents.SessionClosed, () => {});
        }
      }
    } catch (error) {
      console.error("Stop NFC error:", error);
    }
  };

  const getVisitorScheduleDateTime = (record = visitor) => {
    const visitDate = getValidDate(record?.visitDate);
    if (!visitDate) return null;

    const scheduledAt = new Date(visitDate);
    const visitTime = getValidDate(record?.visitTime);
    if (visitTime) {
      scheduledAt.setHours(visitTime.getHours(), visitTime.getMinutes(), 0, 0);
    }

    return scheduledAt;
  };

  const hasVisitorSchedulePassed = (record = visitor) => {
    const visitStatus = String(record?.status || "").toLowerCase();
    if (["checked_in", "checked_out", "expired", "no_show", "rejected", "cancelled"].includes(visitStatus)) {
      return false;
    }

    const scheduledAt = getVisitorScheduleDateTime(record);
    return Boolean(scheduledAt && scheduledAt.getTime() < Date.now());
  };

  const formatAppointmentTimeValue = (dateValue) => {
    const date = getValidDate(dateValue);
    if (!date) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  // Appointment slots are wall-clock choices, not absolute timestamps. Formatting
  // them with the app-wide Manila timezone shifts their labels on devices whose
  // local timezone differs (for example, 7:00 AM appeared as 3:00 PM in UTC).
  const formatAppointmentSlotTime = (dateValue) => {
    const date = getValidDate(dateValue);
    if (!date) return "N/A";
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getDefaultAppointmentDate = () => {
    const visitorDate = getValidDate(visitor?.visitDate);
    if (visitorDate) return getNextAvailableAppointmentDate(visitorDate);
    const nextVisitDate = new Date();
    nextVisitDate.setDate(nextVisitDate.getDate() + 1);
    nextVisitDate.setHours(9, 0, 0, 0);
    return getNextAvailableAppointmentDate(nextVisitDate);
  };

  const getDefaultAppointmentTime = () => {
    const visitorTime = getValidDate(visitor?.visitTime);
    if (visitorTime) return visitorTime;
    const nextVisitTime = new Date();
    nextVisitTime.setHours(9, 0, 0, 0);
    return nextVisitTime;
  };

  const formatAppointmentPickerDate = (dateValue) => {
    const date = getValidDate(dateValue);
    if (!date) return "Select preferred date";
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  };

  const getAppointmentMinDateValue = () => {
    const today = getNextAvailableAppointmentDate(new Date());
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getAppointmentWebDateValue = () => {
    const date = getValidDate(appointmentForm.preferredDate) || getDefaultAppointmentDate();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getAppointmentSlotInfo = (timeOption) => {
    const optionDate = getValidDate(timeOption);
    if (!optionDate || !appointmentAvailability?.slots?.length) return null;

    return appointmentAvailability.slots.find(
      (slot) =>
        Number(slot.hour) === optionDate.getHours() &&
        Number(slot.minute) === optionDate.getMinutes(),
    );
  };

  const getAppointmentSlotDateTime = (timeOption, dateValue = appointmentForm.preferredDate) => {
    const date = getValidDate(dateValue);
    const time = getValidDate(timeOption);
    if (!date || !time) return null;
    const combinedDateTime = new Date(date);
    combinedDateTime.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return Number.isNaN(combinedDateTime.getTime()) ? null : combinedDateTime;
  };

  const isAppointmentTimeSlotPassed = (timeOption, dateValue = appointmentForm.preferredDate) => {
    const slotDateTime = getAppointmentSlotDateTime(timeOption, dateValue);
    if (!slotDateTime) return false;
    return slotDateTime < new Date(Date.now() - 60 * 1000);
  };

  const isAppointmentTimeSlotFull = (timeOption) =>
    Boolean(getAppointmentSlotInfo(timeOption)?.isFull);

  const getAppointmentSlotStatusText = (timeOption) => {
    if (isAppointmentTimeSlotPassed(timeOption)) {
      return "Time has passed";
    }

    const slot = getAppointmentSlotInfo(timeOption);
    if (!slot) {
      return isLoadingAppointmentSlots ? "Checking slots..." : "Select office to view slots";
    }

    const totalSlots = Number(slot.limit || slot.capacity || 0);
    const availableSlots = Number(
      slot.available ?? Math.max(totalSlots - Number(slot.count || 0), 0),
    );

    if (slot.isFull || availableSlots <= 0) return "Slots are full";

    const slotLabel = availableSlots === 1 ? "slot" : "slots";
    return `${availableSlots} ${slotLabel} available${totalSlots ? ` of ${totalSlots}` : ""}`;
  };

  const getSelectedAppointmentDepartments = () => {
    const selectedDepartments = Array.isArray(appointmentForm.departments)
      ? appointmentForm.departments
      : [];
    if (selectedDepartments.length) return selectedDepartments;
    return appointmentForm.department ? [appointmentForm.department] : [];
  };

  const getSelectedAppointmentDepartmentsLabel = () => {
    const selectedDepartments = getSelectedAppointmentDepartments();
    if (!selectedDepartments.length) return "Select staff to visit";
    if (selectedDepartments.length === 1) {
      const staff = activeAppointmentStaffOptions.find((item) => item.id === appointmentForm.staffAssignments?.[selectedDepartments[0]]);
      return staff ? `${staff.name} — ${staff.department}` : "Select staff to visit";
    }
    return `${selectedDepartments.length} offices selected`;
  };

  const toggleAppointmentDepartment = (staff) => {
    setHasAppointmentDraft(true);
    setAppointmentForm((prev) => {
      const staffAssignments = { ...prev.staffAssignments };
      if (staffAssignments[staff.department] === staff.id) delete staffAssignments[staff.department];
      else staffAssignments[staff.department] = staff.id;
      const departments = Object.keys(staffAssignments);
      return { ...prev, staffAssignments, departments, department: departments[0] || "", preferredTime: null };
    });
  };

  const loadAppointmentAvailability = async () => {
    const requestId = ++availabilityRequestRef.current;
    const date = getValidDate(appointmentForm.preferredDate);
    const selectedDepartments = getSelectedAppointmentDepartments();
    const isViewingAppointmentRequest =
      selectedVisitorSection === "appointment" && selectedAppointmentScreen === "request";

    if (!isViewingAppointmentRequest || !date || !selectedDepartments.length) {
      setAppointmentAvailability(null);
      setIsLoadingAppointmentSlots(false);
      return;
    }

    setIsLoadingAppointmentSlots(true);
    setAppointmentAvailability(null);
    try {
      const response = await ApiService.getAppointmentAvailability({
        date: date.toISOString(),
        departments: selectedDepartments,
        staffAssignments: appointmentForm.staffAssignments || {},
      });
      if (requestId !== availabilityRequestRef.current) return;
      if (response?.success) {
        setAppointmentAvailability(response);
      } else {
        setAppointmentAvailability(null);
      }
    } catch (error) {
      if (requestId === availabilityRequestRef.current) setAppointmentAvailability(null);
    } finally {
      if (requestId === availabilityRequestRef.current) setIsLoadingAppointmentSlots(false);
    }
  };

  const applyAppointmentDateSelection = (selectedValue) => {
    const selectedDate = getValidDate(selectedValue);
    if (!selectedDate) return;

    selectedDate.setHours(12, 0, 0, 0);
    if (selectedDate.getDay() === 0) {
      const adjustedDate = getNextAvailableAppointmentDate(selectedDate);
      showVisitorAlert(
        "Sunday Unavailable",
        `Appointments are only available from Monday to Saturday. We moved your date to ${formatDate(adjustedDate)}.`,
      );
      selectedDate.setTime(adjustedDate.getTime());
    }

    setHasAppointmentDraft(true);
    setAppointmentForm((prev) => ({
      ...prev,
      preferredDate: selectedDate,
    }));
  };

  const handleAppointmentDatePress = () => {
    closeAppointmentPopovers();

    if (Platform.OS === "web") {
      const input = appointmentWebDateInputRef.current;
      if (input?.showPicker) {
        input.showPicker();
        return;
      }
      input?.click?.();
      return;
    }

    setShowAppointmentDatePicker(true);
  };

  const handleAppointmentDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowAppointmentDatePicker(false);
    }

    if (event?.type === "dismissed" || !selectedDate) {
      return;
    }

    applyAppointmentDateSelection(selectedDate);
  };

  const handleAppointmentWebDateChange = (event) => {
    const nextValue = event?.target?.value;
    if (!nextValue) return;

    const [year, month, day] = nextValue.split("-").map(Number);
    if (!year || !month || !day) return;

    applyAppointmentDateSelection(new Date(year, month - 1, day));
  };

  const isSameAppointmentDay = (leftValue, rightValue) => {
    const left = getValidDate(leftValue);
    const right = getValidDate(rightValue);
    if (!left || !right) return false;
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  };

  const getMobileAppointmentDateOptions = () => {
    const options = [];
    const cursor = getNextAvailableAppointmentDate(new Date());

    while (options.length < 7) {
      if (cursor.getDay() !== 0) {
        options.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(12, 0, 0, 0);
    }

    return options;
  };

  const getWebAppointmentCalendarDays = () => {
    const selectedDate = getValidDate(appointmentForm.preferredDate) || getDefaultAppointmentDate();
    const monthDate = getValidDate(webAppointmentCalendarMonth) || selectedDate;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());
    start.setHours(12, 0, 0, 0);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      date.setHours(12, 0, 0, 0);
      return {
        date,
        isCurrentMonth: date.getMonth() === month,
        isSelected: isSameAppointmentDay(date, selectedDate),
        isPast: date < getNextAvailableAppointmentDate(new Date()),
        isSunday: date.getDay() === 0,
        holiday: getAppointmentHolidayInfo(date),
      };
    });
  };

  const moveWebAppointmentCalendarMonth = (direction) => {
    setWebAppointmentCalendarMonth((currentValue) => {
      const current = getValidDate(currentValue) || getDefaultAppointmentDate();
      const next = new Date(current);
      next.setMonth(current.getMonth() + direction, 1);
      next.setHours(12, 0, 0, 0);
      return next;
    });
  };

  const getAppointmentTimeGroups = () => [
    {
      label: "Morning",
      options: appointmentTimeOptions.filter((option) => option.getHours() < 12),
    },
    {
      label: "Afternoon",
      options: appointmentTimeOptions.filter((option) => option.getHours() >= 12 && option.getHours() < 17),
    },
    {
      label: "Evening",
      options: appointmentTimeOptions.filter((option) => option.getHours() >= 17),
    },
  ].filter((group) => group.options.length);

  const isSameAppointmentTime = (leftValue, rightValue) => {
    const left = getValidDate(leftValue);
    const right = getValidDate(rightValue);
    if (!left || !right) return false;
    return left.getHours() === right.getHours() && left.getMinutes() === right.getMinutes();
  };

  const isConfiguredAppointmentTime = (timeValue) => {
    const time = getValidDate(timeValue);
    if (!time) return false;
    return appointmentTimeOptions.some((option) => isSameAppointmentTime(option, time));
  };

  const handleAppointmentSlotTimeSelect = (timeOption) => {
    if (
      isLoadingAppointmentSlots ||
      isAppointmentTimeSlotFull(timeOption) ||
      isAppointmentTimeSlotPassed(timeOption)
    ) {
      return;
    }
    setHasAppointmentDraft(true);
    setAppointmentForm((prev) => ({ ...prev, preferredTime: timeOption }));
  };

  const renderMobileAppointmentSlotPicker = () => {
    const selectedDate = getValidDate(appointmentForm.preferredDate) || getDefaultAppointmentDate();
    const selectedTime = getValidDate(appointmentForm.preferredTime);
    const selectedTimeLabel = selectedTime ? formatAppointmentSlotTime(selectedTime) : "Select a time";
    const selectedDateLabel = selectedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const hasDepartments = getSelectedAppointmentDepartments().length > 0;

    return (
      <View style={visitorDashboardStyles.mobileSlotPickerCard}>
        <View style={visitorDashboardStyles.mobileSlotPickerHeader}>
          <View>
            <Text style={visitorDashboardStyles.appointmentFieldLabel}>Available Time Slots</Text>
            <Text style={visitorDashboardStyles.mobileSlotPickerHint}>
              {hasDepartments
                ? "Full slots are disabled for the selected day."
                : "Choose office(s) first to check slot limits."}
            </Text>
          </View>
          {isLoadingAppointmentSlots ? <ActivityIndicator size="small" color="#0A3D91" /> : null}
        </View>

        <View style={visitorDashboardStyles.mobileCalendarCard}>
          <View style={visitorDashboardStyles.mobileCalendarHeader}>
            <Text style={visitorDashboardStyles.mobileCalendarMonth}>
              {(getValidDate(webAppointmentCalendarMonth) || selectedDate).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </Text>
            <View style={visitorDashboardStyles.mobileCalendarNav}>
              <TouchableOpacity style={visitorDashboardStyles.mobileCalendarNavButton} onPress={() => moveWebAppointmentCalendarMonth(-1)}>
                <Ionicons name="chevron-back" size={16} color="#0A3D91" />
              </TouchableOpacity>
              <TouchableOpacity style={visitorDashboardStyles.mobileCalendarNavButton} onPress={() => moveWebAppointmentCalendarMonth(1)}>
                <Ionicons name="chevron-forward" size={16} color="#0A3D91" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={visitorDashboardStyles.mobileWeekdayRow}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <Text key={day} style={visitorDashboardStyles.mobileWeekdayText}>{day}</Text>
            ))}
          </View>
          <View style={visitorDashboardStyles.mobileCalendarGrid}>
            {getWebAppointmentCalendarDays().map(({ date, isCurrentMonth, isSelected, isPast, isSunday, holiday }) => {
              const isDisabled = !isCurrentMonth || isPast || isSunday || Boolean(holiday);
              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  style={[
                    visitorDashboardStyles.mobileCalendarDay,
                    isSelected && visitorDashboardStyles.mobileCalendarDaySelected,
                    isDisabled && visitorDashboardStyles.mobileCalendarDayDisabled,
                  ]}
                  disabled={isDisabled}
                  onPress={() => applyAppointmentDateSelection(date)}
                  activeOpacity={0.86}
                >
                  <Text
                    style={[
                      visitorDashboardStyles.mobileCalendarDayText,
                      isSelected && visitorDashboardStyles.mobileCalendarDayTextSelected,
                      isDisabled && visitorDashboardStyles.mobileCalendarDayTextDisabled,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {holiday ? <View style={visitorDashboardStyles.mobileCalendarHolidayDot} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={visitorDashboardStyles.mobileTimeGroupList}>
          {getAppointmentTimeGroups().map((group) => (
            <View key={group.label} style={visitorDashboardStyles.mobileTimeGroup}>
              <Text style={visitorDashboardStyles.mobileTimeGroupLabel}>{group.label}</Text>
              <View style={visitorDashboardStyles.mobileTimeSlotGrid}>
                {group.options.map((option) => {
                  const isSelected = isSameAppointmentTime(option, selectedTime);
                  const isFull = isAppointmentTimeSlotFull(option);
                  const isPassed = isAppointmentTimeSlotPassed(option);
                  const isUnavailable = isFull || isPassed;
                  const isDisabled = isLoadingAppointmentSlots || isUnavailable;
                  return (
                    <TouchableOpacity
                      key={`${group.label}-${option.getHours()}-${option.getMinutes()}`}
                      style={[
                        visitorDashboardStyles.mobileTimeSlotButton,
                        isUnavailable && visitorDashboardStyles.mobileTimeSlotButtonUnavailable,
                        isSelected && visitorDashboardStyles.mobileTimeSlotButtonSelected,
                      ]}
                      disabled={isDisabled}
                      onPress={() => handleAppointmentSlotTimeSelect(option)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          visitorDashboardStyles.mobileTimeSlotText,
                          isUnavailable && visitorDashboardStyles.mobileTimeSlotTextUnavailable,
                          isSelected && visitorDashboardStyles.mobileTimeSlotTextSelected,
                        ]}
                      >
                      {formatAppointmentSlotTime(option)}
                      </Text>
                      <Text
                        style={[
                          visitorDashboardStyles.mobileTimeSlotMeta,
                          isUnavailable && visitorDashboardStyles.mobileTimeSlotMetaUnavailable,
                          isSelected && visitorDashboardStyles.mobileTimeSlotMetaSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {getAppointmentSlotStatusText(option)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <View style={visitorDashboardStyles.mobileSlotLegendRow}>
          <View style={visitorDashboardStyles.mobileSlotLegendItem}>
            <View style={[visitorDashboardStyles.mobileSlotLegendDot, visitorDashboardStyles.mobileSlotLegendUnavailable]} />
            <Text style={visitorDashboardStyles.mobileSlotLegendText}>Not available</Text>
          </View>
          <View style={visitorDashboardStyles.mobileSlotLegendItem}>
            <View style={visitorDashboardStyles.mobileSlotLegendDot} />
            <Text style={visitorDashboardStyles.mobileSlotLegendText}>Available</Text>
          </View>
          <View style={visitorDashboardStyles.mobileSlotLegendItem}>
            <View style={[visitorDashboardStyles.mobileSlotLegendDot, visitorDashboardStyles.mobileSlotLegendSelected]} />
            <Text style={visitorDashboardStyles.mobileSlotLegendText}>Selected</Text>
          </View>
        </View>

        <View style={visitorDashboardStyles.mobileSelectedSlotRow}>
          <Text style={visitorDashboardStyles.mobileSelectedSlotLabel}>Appointment Time</Text>
          <Text style={visitorDashboardStyles.mobileSelectedSlotValue}>
            {selectedTimeLabel} - {selectedDateLabel}
          </Text>
        </View>
      </View>
    );
  };

  const renderWebAppointmentDateTimePicker = () => {
    const selectedDate = getValidDate(appointmentForm.preferredDate) || getDefaultAppointmentDate();
    const selectedTime = getValidDate(appointmentForm.preferredTime);
    const monthDate = getValidDate(webAppointmentCalendarMonth) || selectedDate;
    const selectedLabel = selectedTime
      ? `${formatAppointmentSlotTime(selectedTime)}, ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "Select a time";
    const hasDepartments = getSelectedAppointmentDepartments().length > 0;

    return (
      <View style={visitorDashboardStyles.webDateTimePanel}>
        <View style={visitorDashboardStyles.webCalendarPane}>
          <View style={visitorDashboardStyles.webCalendarHeader}>
            <Text style={visitorDashboardStyles.webCalendarMonth}>
              {monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
            <View style={visitorDashboardStyles.webCalendarNav}>
              <TouchableOpacity style={visitorDashboardStyles.webCalendarNavButton} onPress={() => moveWebAppointmentCalendarMonth(-1)}>
                <Ionicons name="chevron-back" size={16} color="#DBEAFE" />
              </TouchableOpacity>
              <TouchableOpacity style={visitorDashboardStyles.webCalendarNavButton} onPress={() => moveWebAppointmentCalendarMonth(1)}>
                <Ionicons name="chevron-forward" size={16} color="#DBEAFE" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={visitorDashboardStyles.webWeekdayRow}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <Text key={day} style={visitorDashboardStyles.webWeekdayText}>{day}</Text>
            ))}
          </View>

          <View style={visitorDashboardStyles.webCalendarGrid}>
            {getWebAppointmentCalendarDays().map(({ date, isCurrentMonth, isSelected, isPast, isSunday, holiday }) => {
              const isDisabled = !isCurrentMonth || isPast || isSunday || Boolean(holiday);
              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  style={[
                    visitorDashboardStyles.webCalendarDay,
                    isSelected && visitorDashboardStyles.webCalendarDaySelected,
                    isDisabled && visitorDashboardStyles.webCalendarDayDisabled,
                  ]}
                  disabled={isDisabled}
                  onPress={() => applyAppointmentDateSelection(date)}
                >
                  <Text
                    style={[
                      visitorDashboardStyles.webCalendarDayText,
                      isSelected && visitorDashboardStyles.webCalendarDayTextSelected,
                      isDisabled && visitorDashboardStyles.webCalendarDayTextDisabled,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={visitorDashboardStyles.webTimePane}>
          <View style={visitorDashboardStyles.webTimeHeader}>
            <View>
              <Text style={visitorDashboardStyles.webTimeTitle}>
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              <Text style={visitorDashboardStyles.webTimeSubtitle}>
                {hasDepartments ? "Choose an available slot." : "Choose office(s) first to check slot limits."}
              </Text>
            </View>
            {isLoadingAppointmentSlots ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
          </View>

          <View style={visitorDashboardStyles.webTimeGroups}>
            {getAppointmentTimeGroups().map((group) => (
              <View key={group.label} style={visitorDashboardStyles.webTimeGroup}>
                <View style={visitorDashboardStyles.webTimeGroupHeader}>
                  <Ionicons
                    name={group.label === "Morning" ? "sunny-outline" : group.label === "Afternoon" ? "partly-sunny-outline" : "moon-outline"}
                    size={16}
                    color="#BFDBFE"
                  />
                  <Text style={visitorDashboardStyles.webTimeGroupTitle}>{group.label}</Text>
                </View>
                <View style={visitorDashboardStyles.webTimeSlotGrid}>
                  {group.options.map((option) => {
                    const isSelected = isSameAppointmentTime(option, selectedTime);
                    const isFull = isAppointmentTimeSlotFull(option);
                    const isPassed = isAppointmentTimeSlotPassed(option);
                    const isUnavailable = isFull || isPassed;
                    const isDisabled = isLoadingAppointmentSlots || isUnavailable;
                    return (
                      <TouchableOpacity
                        key={`${group.label}-${option.getHours()}-${option.getMinutes()}`}
                        style={[
                          visitorDashboardStyles.webTimeSlotButton,
                          isUnavailable && visitorDashboardStyles.webTimeSlotButtonUnavailable,
                          isSelected && visitorDashboardStyles.webTimeSlotButtonSelected,
                        ]}
                        disabled={isDisabled}
                        onPress={() => handleAppointmentSlotTimeSelect(option)}
                      >
                        <Text
                          style={[
                            visitorDashboardStyles.webTimeSlotText,
                            isUnavailable && visitorDashboardStyles.webTimeSlotTextUnavailable,
                            isSelected && visitorDashboardStyles.webTimeSlotTextSelected,
                          ]}
                        >
                        {formatAppointmentSlotTime(option)}
                        </Text>
                        <Text
                          style={[
                            visitorDashboardStyles.webTimeSlotMeta,
                            isUnavailable && visitorDashboardStyles.webTimeSlotMetaUnavailable,
                            isSelected && visitorDashboardStyles.webTimeSlotMetaSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {getAppointmentSlotStatusText(option)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          <View style={visitorDashboardStyles.webSelectedSlotBar}>
            <Text style={visitorDashboardStyles.webSelectedSlotLabel}>Selected</Text>
            <Text style={visitorDashboardStyles.webSelectedSlotValue}>{selectedLabel}</Text>
          </View>
        </View>
      </View>
    );
  };

  const isAppointmentManageable = (record = visitor) => {
    const appointmentStatus = String(record?.appointmentStatus || "").toLowerCase();
    const visitStatus = String(record?.status || "").toLowerCase();
    if (record?.requestCategory !== "appointment" || record?.approvalFlow !== "staff") return false;
    if (["rejected", "cancelled", "completed"].includes(appointmentStatus)) return false;
    if (["checked_in", "checked_out", "expired", "no_show", "rejected", "cancelled"].includes(visitStatus)) return false;
    if (record?.checkedOutAt || record?.visitExpiredAt || record?.noShowMarkedAt) return false;
    if (record?.appointmentCompletedAt) return false;
    if (currentAppointmentRecord?._id && record?._id && String(record._id) !== String(currentAppointmentRecord._id)) {
      return false;
    }
    return ["pending", "approved", "adjusted", "adjustment_pending", "rescheduled"].includes(appointmentStatus);
  };

  const isStaffAdjustmentPending = (record = visitor) =>
    record?.approvalFlow === "staff" &&
    String(record?.appointmentStatus || "").toLowerCase() === "adjustment_pending";

  const getAppointmentManageDisabledReason = (record = visitor) => {
    const appointmentStatus = String(record?.appointmentStatus || "").toLowerCase();
    if (appointmentStatus === "rejected") return "Rejected appointments can no longer be changed.";
    if (appointmentStatus === "cancelled") return "This appointment is already cancelled.";
    if (record?.appointmentCompletedAt || String(record?.status || "").toLowerCase() === "checked_out") {
      return "Completed appointments can no longer be changed.";
    }
    if (String(record?.status || "").toLowerCase() === "no_show" || record?.noShowMarkedAt) {
      return "Missed appointments can no longer be changed. Please request a new appointment.";
    }
    if (String(record?.status || "").toLowerCase() === "expired" || record?.visitExpiredAt) {
      return "Expired appointments can no longer be changed. Please request a new appointment.";
    }
    if (String(record?.status || "").toLowerCase() === "checked_in") {
      return "Checked-in appointments can no longer be changed.";
    }
    if (currentAppointmentRecord?._id && record?._id && String(record._id) !== String(currentAppointmentRecord._id)) {
      return "Older appointments are read-only history.";
    }
    return "This appointment can no longer be changed.";
  };

  const openEditAppointmentModal = (record = visitor) => {
    if (!isAppointmentManageable(record)) {
      showVisitorAlert("Appointment Locked", getAppointmentManageDisabledReason(record));
      return;
    }

    const dateValue = getValidDate(record?.visitDate) || getDefaultAppointmentDate();
    const timeValue = getValidDate(record?.visitTime) || getDefaultAppointmentTime();
    setAppointmentEditForm({
      appointment: record,
      preferredDate: dateValue,
      preferredTime: timeValue,
      reason: "",
    });
    setShowEditAppointmentDatePicker(false);
    setShowEditAppointmentTimePicker(false);
    setShowEditAppointmentModal(true);
  };

  const closeEditAppointmentModal = () => {
    setShowEditAppointmentDatePicker(false);
    setShowEditAppointmentTimePicker(false);
    setShowEditAppointmentModal(false);
  };

  const openCancelAppointmentModal = (record = visitor) => {
    if (!isAppointmentManageable(record)) {
      showVisitorAlert("Appointment Locked", getAppointmentManageDisabledReason(record));
      return;
    }

    setAppointmentCancellationForm({
      appointment: record,
      reason: "",
    });
    setShowCancelAppointmentModal(true);
  };

  const closeCancelAppointmentModal = () => {
    setShowCancelAppointmentModal(false);
  };

  const applyEditAppointmentDateSelection = (selectedValue) => {
    const selectedDate = getValidDate(selectedValue);
    if (!selectedDate) return;
    selectedDate.setHours(12, 0, 0, 0);
    if (isAppointmentDateUnavailable(selectedDate)) {
      const holiday = getAppointmentHolidayInfo(selectedDate);
      showVisitorAlert(
        holiday ? "Holiday Unavailable" : "Sunday Unavailable",
        holiday
          ? `${holiday.name} is unavailable for appointments. Please choose another date.`
          : "Appointments are only available from Monday to Saturday. Please choose another date.",
      );
      return;
    }
    setAppointmentEditForm((prev) => ({ ...prev, preferredDate: selectedDate }));
  };

  const handleEditAppointmentWebDateChange = (event) => {
    const nextValue = event?.target?.value;
    if (!nextValue) return;
    const [year, month, day] = nextValue.split("-").map(Number);
    if (!year || !month || !day) return;
    applyEditAppointmentDateSelection(new Date(year, month - 1, day));
  };

  const handleEditAppointmentDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowEditAppointmentDatePicker(false);
    }
    if (event?.type === "dismissed" || !selectedDate) return;
    applyEditAppointmentDateSelection(selectedDate);
  };

  const buildAppointmentForm = (visitorRecord = visitor) => {
    return {
      preferredDate: getDefaultAppointmentDate(),
      // Every new request must make an explicit time choice. Reusing the prior
      // visit time caused confusing second requests, especially on another device.
      preferredTime: null,
      department: "",
      departments: [],
      staffAssignments: {},
      purposeSelection: "",
      customPurpose: "",
      idType: getStoredVisitorIdType(visitorRecord),
      idImage: null,
      backIdImage: null,
      idVerification: null,
      verificationProof: null,
      privacyAccepted: false,
    };
  };

  const populateAppointmentForm = (visitorRecord = visitor) => {
    appointmentIdRevisionRef.current += 1;
    setAppointmentForm(buildAppointmentForm(visitorRecord));
    setHasAppointmentDraft(false);
  };

  const verifyAppointmentIdImages = async ({ idType, idImage, backIdImage = "", revision }) => {
    if (!idType || !idImage) return;
    setIsVerifyingAppointmentId(true);
    setAppointmentForm((prev) => ({ ...prev, idVerification: {
      status: "scanning", verificationStatus: "scanning", message: "Checking your ID image...",
    }, verificationProof: null }));
    try {
      const verification = await IDScannerService.verifyIDImage({
        idType, imageUri: idImage, backImageUri: backIdImage,
      });
      if (appointmentIdRevisionRef.current !== revision) return;
      setAppointmentForm((prev) => ({
        ...prev,
        idVerification: verification,
        verificationProof: verification.verificationStatus === "precheck_passed"
          ? verification.verificationProof || null : null,
      }));
    } finally {
      if (appointmentIdRevisionRef.current === revision) setIsVerifyingAppointmentId(false);
    }
  };

  const processAppointmentIdImageAsset = async (asset, side = "front", selectionRevision) => {
    if (!asset?.uri) {
      showVisitorAlert("Upload Failed", "Could not read this image. Please try another photo.");
      return;
    }

    // Normalize gallery formats (including HEIC) and keep the request below the server's 4 MB limit.
    const prepared = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!prepared.base64 || prepared.base64.length > Math.ceil((4 * 1024 * 1024) / 3) * 4) {
      showVisitorAlert("Photo Too Large", "Choose a smaller or clearer ID photo and try again.");
      return;
    }
    if (appointmentIdRevisionRef.current !== selectionRevision) return;
    const imageValue = `data:image/jpeg;base64,${prepared.base64}`;
    const revision = ++appointmentIdRevisionRef.current;
    const idType = appointmentForm.idType;
    const idImage = side === "front" ? imageValue : appointmentForm.idImage;
    const backIdImage = side === "back" ? imageValue : null;

    setHasAppointmentDraft(true);
    setAppointmentForm((prev) => ({
      ...prev,
      idImage,
      backIdImage,
      idVerification: null,
      verificationProof: null,
    }));
    await verifyAppointmentIdImages({ idType, idImage, backIdImage, revision });
  };

  const selectAppointmentIdImage = async (source = "gallery", side = "front") => {
    try {
      const selectionRevision = appointmentIdRevisionRef.current;
      if (!appointmentForm.idType) {
        showVisitorAlert(
          "Choose ID Type First",
          "Please choose which valid ID you will present before uploading its picture.",
        );
        return;
      }
      if (side === "back" && !appointmentForm.idImage) {
        showVisitorAlert("Front Photo Needed", "Add the front of your ID first.");
        return;
      }

      const isCameraSource = source === "camera";
      const permission = isCameraSource
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showVisitorAlert(
          "Permission Needed",
          isCameraSource
            ? "Please allow camera access so you can take a valid ID picture."
            : "Please allow photo access so you can upload a valid ID picture.",
        );
        return;
      }

      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.75,
      };
      const result = isCameraSource
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled) return;

      const asset = result.assets?.[0];
      await processAppointmentIdImageAsset(asset, side, selectionRevision);
    } catch (error) {
      console.error("Pick appointment ID image error.");
      showVisitorAlert("Upload Failed", "Unable to prepare the ID image. Please try again.");
    }
  };

  const handleVerifyAppointmentIdAgain = async () => {
    if (!appointmentForm.idType || !appointmentForm.idImage || isVerifyingAppointmentId) return;
    const revision = ++appointmentIdRevisionRef.current;
    await verifyAppointmentIdImages({
      idType: appointmentForm.idType,
      idImage: appointmentForm.idImage,
      backIdImage: appointmentForm.backIdImage,
      revision,
    });
  };

  const openAppointmentRequestScreen = () => {
    loadManagedAppointmentOptions();
    if (!hasAppointmentDraft) {
      populateAppointmentForm();
    }
    closeAppointmentPopovers();
    setSelectedVisitorSection("appointment");
    handleAppointmentScreenNavigation(
      "request",
      hasAppointmentDraft ? "Opening your appointment draft..." : "Preparing appointment request...",
    );
  };

  const openAppointmentHistoryScreen = () => {
    closeAppointmentPopovers();
    setSelectedVisitorSection("appointment");
    handleAppointmentScreenNavigation("history", "Loading appointment history...");
  };

  const closeAppointmentRequestScreen = () => {
    closeAppointmentPopovers();
    handleAppointmentScreenNavigation("menu", "Returning to appointment menu...");
  };

  useEffect(() => {
    loadAppointmentAvailability();
  }, [
    selectedVisitorSection,
    selectedAppointmentScreen,
    appointmentForm.preferredDate,
    appointmentForm.department,
    appointmentForm.departments,
    appointmentForm.staffAssignments,
  ]);

  const handleRequestAppointment = async () => {
    if (appointmentSubmitInFlightRef.current) return;

    const preferredDate = appointmentForm.preferredDate;
    const preferredTime = appointmentForm.preferredTime;
    const isOtherPurpose = appointmentForm.purposeSelection === "Other";
    const purposeCategory = String(appointmentForm.purposeSelection || "").trim();
    const customPurposeOfVisit = String(appointmentForm.customPurpose || "").trim();
    const purposeOfVisit = isOtherPurpose ? customPurposeOfVisit : purposeCategory;
    const selectedDepartments = getSelectedAppointmentDepartments();
    const department = selectedDepartments[0] || "";
    const idType = String(appointmentForm.idType || "").trim();

    if (!currentUser?._id) {
      showVisitorAlert("Login Required", "Please sign in again before requesting a new appointment.");
      return;
    }

    if (!purposeCategory) {
      showVisitorAlert("Missing Details", "Please select a purpose of visit.");
      return;
    }

    if (isOtherPurpose && !customPurposeOfVisit) {
      showVisitorAlert("Missing Details", "Please enter your purpose of visit.");
      return;
    }

    if (!preferredDate || !preferredTime) {
      showVisitorAlert("Missing Details", "Please select the preferred date and time.");
      return;
    }

    if (isAppointmentDateUnavailable(preferredDate)) {
      const holiday = getAppointmentHolidayInfo(preferredDate);
      showVisitorAlert(
        holiday ? "Holiday Unavailable" : "Sunday Unavailable",
        holiday
          ? `${holiday.name} is unavailable for appointments. Please choose another date.`
          : "Appointments are only available from Monday to Saturday. Please choose another date.",
      );
      return;
    }

    if (isLoadingAppointmentSlots) {
      showVisitorAlert("Checking Slots", "Please wait while we confirm available appointment slots.");
      return;
    }

    if (appointmentAvailability && appointmentAvailability.assignedStaff === null) {
      showVisitorAlert(
        "No Staff Available",
        appointmentAvailability.message ||
          "No active staff account is assigned to this office yet. Please choose another office or contact admin.",
      );
      return;
    }

    if (isAppointmentTimeSlotFull(preferredTime)) {
      showVisitorAlert(
        "Time Slot Full",
        "Slots are full please select another time or date.",
      );
      return;
    }

    if (isAppointmentTimeSlotPassed(preferredTime, preferredDate)) {
      showVisitorAlert(
        "Time Slot Passed",
        "That appointment time has already passed. Please choose another available time slot.",
      );
      return;
    }

    if (!selectedDepartments.length) {
      showVisitorAlert("Missing Details", "Please choose at least one office to visit.");
      return;
    }

    if (!idType) {
      showVisitorAlert("Missing Valid ID", "Please choose the valid ID type you will present on campus.");
      return;
    }

    if (!appointmentForm.privacyAccepted) {
      showVisitorAlert(
        "Data Privacy Confirmation",
        "Please confirm that your appointment information is accurate and that you will present the selected ID at campus entry.",
      );
      return;
    }

    const combinedDateTime = new Date(preferredDate);
    combinedDateTime.setHours(preferredTime.getHours(), preferredTime.getMinutes(), 0, 0);
    if (Number.isNaN(combinedDateTime.getTime())) {
      showVisitorAlert("Invalid Schedule", "Please choose a valid preferred date and time.");
      return;
    }

    if (combinedDateTime < new Date(Date.now() - 60 * 1000)) {
      showVisitorAlert("Invalid Schedule", "Appointment schedule cannot be in the past.");
      return;
    }

    appointmentSubmitInFlightRef.current = true;
    setIsSubmittingAppointment(true);
    const submittedAt = new Date();
    const hasFreshPrecheck = Boolean(
      appointmentForm.verificationProof &&
      appointmentForm.idVerification?.verificationStatus === "precheck_passed" &&
      Date.now() - Date.parse(appointmentForm.idVerification.checkedAt || "") < 10 * 60 * 1000,
    );
    try {
      const response = await ApiService.requestVisitorAppointment(currentUser._id, {
        preferredDate: new Date(preferredDate).toISOString(),
        preferredTime: formatAppointmentTimeValue(preferredTime),
        purposeCategory,
        customPurposeOfVisit: isOtherPurpose ? customPurposeOfVisit : "",
        department,
        departments: selectedDepartments,
        staffAssignments: appointmentForm.staffAssignments || {},
        officeToVisit: department,
        assignedOffice: department,
        appointmentDepartment: department,
        purposeOfVisit,
        idType,
        idImage: "",
        verificationProof: hasFreshPrecheck ? appointmentForm.verificationProof : null,
        idVerification: hasFreshPrecheck ? {
          status: "ai_precheck_passed",
          isValid: true,
          message: "ID pre-check passed. The ID will still be checked at campus entry.",
        } : {
          status: "physical_id_required",
          isValid: true,
          message: `${idType} will be presented at campus entry for manual verification.`,
        },
        dataPrivacyAccepted: true,
        dataPrivacyAcceptedAt: new Date().toISOString(),
      });

      if (response?.success) {
        appointmentIdRevisionRef.current += 1;
        const afterHoursNotice = getAppointmentAfterHoursNotice(response, submittedAt);
        const feedbackMessage = afterHoursNotice?.message ||
          "Your new visit request has been sent to staff for review. You can track approval, time adjustments, or rejection updates from this dashboard.";

        setHasAppointmentDraft(false);
        setAppointmentForm(buildAppointmentForm({
          ...visitor,
          visitDate: preferredDate,
          visitTime: combinedDateTime,
          purposeOfVisit,
          purposeCategory,
          customPurposeOfVisit: isOtherPurpose ? customPurposeOfVisit : "",
          appointmentDepartment: department,
          departments: selectedDepartments,
          assignedOffice: department,
          host: department,
          idType,
          idImage: "",
          idVerification: {
            status: "physical_id_required",
            isValid: true,
            message: `${idType} will be presented at campus entry for manual verification.`,
          },
        }));
        setAppointmentFeedback({
          title: afterHoursNotice?.title || "Appointment Submitted Successfully",
          message: feedbackMessage,
          date: formatDate(preferredDate),
          time: formatAppointmentSlotTime(preferredTime),
          department: selectedDepartments.join(", "),
          purpose: purposeOfVisit,
        });
        showVisitorAlert(
          afterHoursNotice?.title || "Appointment Submitted",
          afterHoursNotice?.message || "Your request was sent to staff for review.",
        );
        await loadVisitorData();
        handleAppointmentScreenNavigation("history", "Opening appointment history...");
        return;
      }

      showVisitorAlert("Request Failed", response?.message || "Failed to send your appointment request.");
    } catch (error) {
      console.error("Request appointment error:", error);
      showVisitorAlert("Request Failed", error?.message || "Failed to send your appointment request.");
    } finally {
      appointmentSubmitInFlightRef.current = false;
      setIsSubmittingAppointment(false);
    }
  };

  const submitAppointmentReschedule = async () => {
    const targetAppointment = appointmentEditForm.appointment;
    if (!targetAppointment?._id) {
      showVisitorAlert("Missing Appointment", "Please select an appointment to edit.");
      return;
    }

    if (!isAppointmentManageable(targetAppointment)) {
      showVisitorAlert("Appointment Locked", getAppointmentManageDisabledReason(targetAppointment));
      return;
    }

    const preferredDate = appointmentEditForm.preferredDate;
    const preferredTime = appointmentEditForm.preferredTime;
    if (!preferredDate || !preferredTime) {
      showVisitorAlert("Missing Schedule", "Please choose the new appointment date and time.");
      return;
    }

    if (!isConfiguredAppointmentTime(preferredTime)) {
      showVisitorAlert(
        "Choose An Available Time",
        "Please choose one of the available appointment time slots. Custom times like 2:45 PM are not available.",
      );
      return;
    }

    if (isAppointmentTimeSlotPassed(preferredTime, preferredDate)) {
      showVisitorAlert(
        "Time Slot Passed",
        "That appointment time has already passed. Please choose another available time slot.",
      );
      return;
    }

    const combinedDateTime = new Date(preferredDate);
    combinedDateTime.setHours(preferredTime.getHours(), preferredTime.getMinutes(), 0, 0);
    if (Number.isNaN(combinedDateTime.getTime())) {
      showVisitorAlert("Invalid Schedule", "Please choose a valid appointment date and time.");
      return;
    }

    if (combinedDateTime < new Date(Date.now() - 60 * 1000)) {
      showVisitorAlert("Invalid Schedule", "Appointment schedule cannot be in the past.");
      return;
    }

    if (new Date(preferredDate).getDay() === 0) {
      showVisitorAlert("Sunday Unavailable", "Appointments are only available from Monday to Saturday.");
      return;
    }

    setIsUpdatingAppointment(true);
    try {
      const response = await ApiService.rescheduleVisitorAppointment(targetAppointment._id, {
        preferredDate: new Date(preferredDate).toISOString(),
        preferredTime: formatAppointmentTimeValue(preferredTime),
        reason: String(appointmentEditForm.reason || "").trim(),
      });

      if (response?.success) {
        closeEditAppointmentModal();
        showVisitorPushNotice({
          title: "Appointment Updated",
          message: response.message || "Your appointment schedule was updated and sent to staff.",
          type: "success",
        });
        showVisitorAlert("Appointment Updated", response.message || "Your appointment schedule was updated.");
        await loadVisitorData();
        handleAppointmentScreenNavigation("history", "Refreshing appointment history...");
        return;
      }

      showVisitorAlert("Update Failed", response?.message || "Failed to update appointment.");
    } catch (error) {
      console.error("Reschedule appointment error:", error);
      showVisitorAlert("Update Failed", error?.message || "Failed to update appointment.");
    } finally {
      setIsUpdatingAppointment(false);
    }
  };

  const confirmAppointmentReschedule = () => {
    showVisitorAlert(
      "Confirm Appointment Update",
      "This will send the new date and time to staff for review. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Update", onPress: submitAppointmentReschedule },
      ],
    );
  };

  const canSendRunningLateNotice = (record = visitor) => {
    if (!record?._id || record.runningLateNotifiedAt) return false;
    const appointmentStatus = String(record.appointmentStatus || "").toLowerCase();
    const visitStatus = String(record.status || "").toLowerCase();
    const isStaffAppointment =
      record.approvalFlow === "staff" || Boolean(record.assignedStaff || record.appointmentDepartment);
    return (
      isStaffAppointment &&
      ["approved", "adjusted"].includes(appointmentStatus) &&
      !["checked_in", "checked_out", "cancelled", "rejected", "expired", "no_show"].includes(visitStatus)
    );
  };

  const notifyRunningLate = async (target = visitor) => {
    if (!target?._id || isSendingLateNotice) return;

    setIsSendingLateNotice(true);
    try {
      const response = await ApiService.notifyVisitorRunningLate(target._id, {
        reason: "Visitor reported they may arrive late.",
      });
      const message =
        response?.message ||
        "The office has been notified. Please arrive within the 15-minute grace period if possible.";

      showVisitorPushNotice({
        title: "Office Notified",
        message,
        type: "warning",
      });
      showVisitorAlert("Office Notified", message);
      await loadVisitorData();
    } catch (error) {
      console.error("Notify running late error:", error);
      showVisitorAlert("Notice Failed", error?.message || "Unable to notify the office right now.");
    } finally {
      setIsSendingLateNotice(false);
    }
  };

  const submitAppointmentCancellation = async () => {
    const targetAppointment = appointmentCancellationForm.appointment;
    const reason = String(appointmentCancellationForm.reason || "").trim();

    if (!targetAppointment?._id) {
      showVisitorAlert("Missing Appointment", "Please select an appointment to cancel.");
      return;
    }

    if (!isAppointmentManageable(targetAppointment)) {
      showVisitorAlert("Appointment Locked", getAppointmentManageDisabledReason(targetAppointment));
      return;
    }

    if (!reason) {
      showVisitorAlert("Reason Required", "Please enter a reason for cancellation.");
      return;
    }

    setIsUpdatingAppointment(true);
    try {
      const response = await ApiService.cancelVisitorAppointment(targetAppointment._id, { reason });

      if (response?.success) {
        closeCancelAppointmentModal();
        showVisitorPushNotice({
          title: "Appointment Cancelled",
          message: response.message || "Your appointment has been cancelled.",
          type: "success",
        });
        showVisitorAlert("Appointment Cancelled", response.message || "Your appointment has been cancelled.");
        await loadVisitorData();
        handleAppointmentScreenNavigation("history", "Refreshing appointment history...");
        return;
      }

      showVisitorAlert("Cancellation Failed", response?.message || "Failed to cancel appointment.");
    } catch (error) {
      console.error("Cancel appointment error:", error);
      showVisitorAlert("Cancellation Failed", error?.message || "Failed to cancel appointment.");
    } finally {
      setIsUpdatingAppointment(false);
    }
  };

  const confirmAppointmentCancellation = () => {
    showVisitorAlert(
      "Confirm Cancellation",
      "This will cancel your appointment and notify staff and admin. Continue?",
      [
        { text: "Back", style: "cancel" },
        { text: "Cancel Appointment", style: "destructive", onPress: submitAppointmentCancellation },
      ],
    );
  };

  const handleVirtualNfcCardTap = async () => {
    if (!visitor || isVirtualTapLoading) return;

    if (isNfcReading) {
      await stopNfcReading();
      return;
    }

    const blockedMessage = getVisitorAccessBlockedMessage(visitor, currentUser);
    if (blockedMessage) {
      showVisitorAlert(
        getVisitorAccessBlockedTitle(blockedMessage),
        blockedMessage,
      );
      return;
    }

    if (String(visitor?.status || "").toLowerCase() === "checked_out") {
      showVisitorAlert(
        "Visit Completed",
        "This SafePass card has already been checked out and can no longer be used.",
      );
      return;
    }

    setIsVirtualTapLoading(true);

    try {
      const nfcAvailability = await refreshNfcAvailability();
      if (!nfcAvailability.moduleAvailable || !nfcAvailability.supported) {
        setNfcStatus({
          type: "processing",
          message: "Confirming your virtual SafePass card...",
        });
        await processNfcTap("virtual-card", "visitor-app");
        return;
      }

      const started = await startNfcReading();
      if (!started) {
        return;
      }

      setNfcStatus({
        type: "info",
        message:
          visitor?.status === "checked_in"
            ? "Confirm departure from this phone to check out."
            : "Confirm arrival from this phone to check in.",
      });
    } catch (error) {
      console.error("Virtual NFC card tap error:", error);
      setNfcStatus({
        type: "error",
        message: error?.message || "Unable to start the NFC tap flow. Please try again.",
      });
      showVisitorAlert("NFC Unavailable", error?.message || "Unable to start the NFC tap flow right now.");
    } finally {
      setIsVirtualTapLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!visitor) return;
    
    showVisitorAlert(
      "Check In",
      "Are you ready to check in for your visit?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check In",
          onPress: async () => {
            try {
              const response = await ApiService.visitorCheckIn(visitor._id);
              if (response.success) {
                showVisitorAlert("Success", "You have been checked in!");
                loadVisitorData();
              } else {
                showVisitorAlert("Error", response.message || "Failed to check in");
              }
            } catch (error) {
              showVisitorAlert("Error", "Failed to check in");
            }
          }
        }
      ]
    );
  };

  const handleCheckOut = async () => {
    if (!visitor) return;
    
    showVisitorAlert(
      "Check Out",
      "Are you sure you want to check out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check Out",
          onPress: async () => {
            try {
              const response = await ApiService.visitorCheckOut(visitor._id);
              if (response.success) {
                showVisitorAlert("Success", "You have been checked out. Thank you for visiting!");
                loadVisitorData();
              } else {
                showVisitorAlert("Error", response.message || "Failed to check out");
              }
            } catch (error) {
              showVisitorAlert("Error", "Failed to check out");
            }
          }
        }
      ]
    );
  };

  const handleCheckInAction = () => {
    const blockedMessage = getVisitorAccessBlockedMessage(visitor, currentUser);
    if (blockedMessage) {
      showVisitorAlert(
        getVisitorAccessBlockedTitle(blockedMessage),
        blockedMessage,
      );
      return;
    }

    if (!visitor || isCheckInLoading) return;
    setShowCheckInModal(true);
  };

  const confirmCheckIn = async () => {
    if (!visitor || isCheckInLoading) return;

    setIsCheckInLoading(true);
    try {
      const response = await ApiService.visitorCheckIn(visitor._id, {
        source: "visitor_dashboard",
      });

      if (response?.success) {
        setShowCheckInModal(false);
        setShowCheckInSuccessModal(true);
        await loadVisitorData();
        return;
      }

      showVisitorAlert("Check-In Failed", response?.message || "Failed to check in.");
    } catch (error) {
      console.error("Visitor check-in error:", error);
      showVisitorAlert("Check-In Failed", error?.message || "Failed to check in.");
    } finally {
      setIsCheckInLoading(false);
    }
  };

  const handleCheckOutAction = (targetVisitor = visitor) => {
    const blockedMessage = getVisitorAccessBlockedMessage(targetVisitor, currentUser);
    if (blockedMessage) {
      showVisitorAlert(
        getVisitorAccessBlockedTitle(blockedMessage),
        blockedMessage,
      );
      return;
    }

    if (String(targetVisitor?.status || "").toLowerCase() !== "checked_in") {
      showVisitorAlert("Check-Out Unavailable", "Only a checked-in visit can be checked out.");
      return;
    }

    if (!targetVisitor || isCheckOutLoading) return;
    setCheckOutTargetVisitor(targetVisitor);
    setShowCheckOutModal(true);
  };

  const confirmCheckOut = async () => {
    const targetVisitor = checkOutTargetVisitor || visitor;
    if (!targetVisitor || isCheckOutLoading) return;

    setIsCheckOutLoading(true);
    try {
      const response = await ApiService.visitorCheckOut(targetVisitor._id, {
        source: "visitor_dashboard",
      });

      if (response?.success) {
        setShowCheckOutModal(false);
        setCheckOutTargetVisitor(null);
        setShowVirtualNfcModal(false);
        setShowVirtualNfcSuccessModal(false);
        setShowCheckOutSuccessModal(true);
        setSelectedVisitorSection("home");
        await loadVisitorData();
        return;
      }

      showVisitorAlert("Check-Out Failed", response?.message || "Failed to check out.");
    } catch (error) {
      console.error("Visitor check-out error:", error);
      showVisitorAlert("Check-Out Failed", error?.message || "Failed to check out.");
    } finally {
      setIsCheckOutLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return formatSafePassDate(dateString, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString) => {
    return formatSafePassTime(dateString, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDateTime = (dateString) => {
    return formatSafePassDateTime(dateString, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeRemaining = () => {
    const scheduledAt = getVisitorScheduleDateTime(visitor);
    if (!scheduledAt) return null;
    
    const now = new Date();
    const diffMs = scheduledAt - now;
    
    if (diffMs < 0) {
      return null;
    }
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 24) {
      const days = Math.floor(diffHours / 24);
      return { text: `${days} day${days > 1 ? 's' : ''} until visit`, color: '#10B981', icon: 'calendar' };
    } else if (diffHours > 0) {
      return { text: `${diffHours}h ${diffMins}m until visit`, color: '#10B981', icon: 'time' };
    } else if (diffMins > 0) {
      return { text: `${diffMins} minutes until visit`, color: '#F59E0B', icon: 'hourglass' };
    } else {
      return { text: 'Visit time now!', color: '#10B981', icon: 'checkmark-circle' };
    }
  };

  const getStatusColor = () => {
    if (hasVisitorSchedulePassed(visitor)) return "#EF4444";
    if (visitor?.approvalStatus === "pending") return "#F59E0B";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "pending") return "#F59E0B";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "rescheduled") return "#D97706";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "adjustment_pending") return "#7C3AED";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "adjusted") return "#0A3D91";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "cancelled") return "#6B7280";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "rejected") return "#DC2626";
    switch(visitor?.status) {
      case 'checked_in': return '#10B981';
      case 'approved': return '#0A3D91';
      case 'pending': return '#F59E0B';
      case 'checked_out': return '#6B7280';
      case 'expired': return '#EF4444';
      case 'no_show': return '#B45309';
      case 'rejected': return '#DC2626';
      default: return '#0A3D91';
    }
  };

  const getStatusText = () => {
    if (hasVisitorSchedulePassed(visitor)) return "Visit Time Passed";
    if (visitor?.approvalStatus === "pending") return "Waiting for admin review";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "pending") return "Waiting for staff review";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "rescheduled") return "Reschedule sent to staff";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "adjustment_pending") return "Confirm new schedule";
    if (visitor?.approvalFlow === "staff" && ["approved", "adjusted"].includes(visitor?.appointmentStatus)) return "Approved, ready for NFC";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "cancelled") return "Appointment cancelled";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "rejected") return "Appointment declined";
    switch(visitor?.status) {
      case 'checked_in': return 'Checked in';
      case 'approved': return 'Approved, ready for NFC';
      case 'pending': return 'Waiting for review';
      case 'checked_out': return 'Visit completed';
      case 'expired': return 'Expired';
      case 'no_show': return 'No Show';
      case 'rejected': return 'Rejected';
      default: return 'Active';
    }
  };

  const getStatusIcon = () => {
    if (hasVisitorSchedulePassed(visitor)) return "time-outline";
    if (visitor?.approvalStatus === "pending") return "time-outline";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "pending") return "briefcase-outline";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "rescheduled") return "refresh-circle-outline";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "adjustment_pending") return "help-circle-outline";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "adjusted") return "swap-horizontal-outline";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "cancelled") return "ban-outline";
    if (visitor?.approvalFlow === "staff" && visitor?.appointmentStatus === "rejected") return "close-circle";
    switch(visitor?.status) {
      case 'checked_in': return 'checkmark-circle';
      case 'approved': return 'checkmark-circle';
      case 'pending': return 'time-outline';
      case 'checked_out': return 'log-out';
      case 'expired': return 'alert-circle';
      case 'no_show': return 'time-outline';
      case 'rejected': return 'close-circle';
      default: return 'id-card';
    }
  };

  const getAppointmentStatusText = (record = {}) => {
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "pending") return "Waiting for staff review";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "rescheduled") return "Reschedule sent to staff";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "adjustment_pending") return "Needs your confirmation";
    if (record?.approvalFlow === "staff" && ["approved", "adjusted"].includes(record?.appointmentStatus)) return "Approved, ready for NFC";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "cancelled") return "Cancelled";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "rejected") return "Declined";
    if (record?.approvalStatus === "pending") return "Waiting for review";
    switch (record?.status) {
      case "checked_in": return "Checked in";
      case "approved": return "Approved, ready for NFC";
      case "pending": return "Waiting for review";
      case "checked_out": return "Visit completed";
      case "expired": return "Expired";
      case "no_show": return "No-Show";
      case "rejected": return "Rejected";
      default: return "Active";
    }
  };

  const getAppointmentStatusColor = (record = {}) => {
    if (record?.approvalStatus === "pending") return "#F59E0B";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "pending") return "#F59E0B";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "rescheduled") return "#D97706";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "adjustment_pending") return "#7C3AED";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "adjusted") return "#0A3D91";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "cancelled") return "#6B7280";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "rejected") return "#DC2626";
    switch (record?.status) {
      case "checked_in": return "#10B981";
      case "approved": return "#0A3D91";
      case "pending": return "#F59E0B";
      case "checked_out": return "#6B7280";
      case "expired": return "#EF4444";
      case "no_show": return "#B45309";
      case "rejected": return "#DC2626";
      default: return "#0A3D91";
    }
  };

  const getAppointmentStatusIcon = (record = {}) => {
    if (record?.approvalStatus === "pending") return "time-outline";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "pending") return "briefcase-outline";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "rescheduled") return "refresh-circle-outline";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "adjustment_pending") return "help-circle-outline";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "adjusted") return "swap-horizontal-outline";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "cancelled") return "ban-outline";
    if (record?.approvalFlow === "staff" && record?.appointmentStatus === "rejected") return "close-circle";
    switch (record?.status) {
      case "checked_in": return "checkmark-circle";
      case "approved": return "checkmark-circle";
      case "pending": return "time-outline";
      case "checked_out": return "log-out";
      case "expired": return "alert-circle";
      case "no_show": return "time-outline";
      case "rejected": return "close-circle";
      default: return "id-card";
    }
  };

  const visitorMapLabels = useMemo(
    () => buildManagedMapLabels(visitorMapRooms, visitorMapRoomPositions),
    [visitorMapRooms, visitorMapRoomPositions],
  );

  const handleLogout = async () => {
    await stopNfcReading();
    showVisitorAlert(
      "Sign Out",
      "Would you like to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await ApiService.logout();
            } catch (error) {
              console.log("Visitor logout API error ignored:", error);
              await ApiService.clearAuth();
            } finally {
              await Storage.multiRemove([
                VISITOR_SELECTED_SECTION_KEY,
                VISITOR_APPOINTMENT_SCREEN_KEY,
                VISITOR_MAP_FLOOR_KEY,
              ]);
              if (onLogout) onLogout();
              navigation.reset({
                index: 0,
                routes: [{ name: "RoleSelect" }],
              });
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={visitorDashboardStyles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
        <Image
          source={visitorSchoolLogo}
          resizeMode="contain"
          style={{ width: 116, height: 58, marginBottom: 18 }}
        />
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={visitorDashboardStyles.loadingText}>Loading your visitor dashboard...</Text>
        <Text style={visitorDashboardStyles.loadingSubtext}>Restoring your pass, appointment, and campus map.</Text>
      </SafeAreaView>
    );
  }

  const timeRemaining = getTimeRemaining();
  const statusColor = getStatusColor();
  const statusText = getStatusText();
  const statusIcon = getStatusIcon();
  const isPendingApproval =
    visitor?.status === "pending" || visitor?.approvalStatus === "pending";
  const isPendingStaffReview =
    !isPendingApproval &&
    visitor?.approvalFlow === "staff" &&
    ["pending", "rescheduled", "adjustment_pending"].includes(String(visitor?.appointmentStatus || "").toLowerCase());
  const isAdjustedAppointment =
    visitor?.approvalFlow === "staff" &&
    visitor?.appointmentStatus === "adjusted" &&
    visitor?.status === "approved";
  const isApprovedVisitor =
    isVisitorAccessApproved(visitor);
  const isCheckedOutVisitor = String(visitor?.status || "").toLowerCase() === "checked_out";
  const canRequestNewAppointment =
    visitor?.approvalStatus === "approved" &&
    !isApprovedVisitor &&
    !isPendingStaffReview &&
    visitor?.status !== "checked_in";
  const canCreateFreshAppointment =
    !visitor &&
    String(currentUser?.role || "").toLowerCase() === "visitor" &&
    String(currentUser?.status || "").toLowerCase() === "active";
  const isCompactHistoryLayout = viewportWidth <= 760;
  const approvedActionLabel = isNfcReading ? "Stop NFC" : "Start NFC";
  const approvedActionIcon = isNfcReading ? "pause-circle" : "radio";
  const getAppointmentActivityTime = (record = {}) => {
    const values = [
      record?.appointmentRescheduledAt,
      record?.appointmentRequestedAt,
      record?.registeredAt,
      record?.createdAt,
      record?.visitTime,
      record?.visitDate,
    ];

    return values.reduce((latest, value) => {
      const timestamp = new Date(value || 0).getTime();
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
  };
  const getAppointmentRecordKey = (record = {}, index = 0) =>
    record?._id
      ? String(record._id)
      : `appointment-${index}-${record?.visitDate || "date"}-${record?.visitTime || "time"}-${record?.purposeOfVisit || "purpose"}-${record?.appointmentDepartment || record?.assignedOffice || record?.host || "office"}`;
  const getAppointmentDateGroupKey = (record = {}) => {
    const date = new Date(record?.visitDate || record?.visitTime || 0);
    if (Number.isNaN(date.getTime())) return "unscheduled";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const getAppointmentDateSortValue = (record = {}) => {
    const date = new Date(record?.visitDate || record?.visitTime || 0);
    if (Number.isNaN(date.getTime())) return 0;
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const getAppointmentTimeSortValue = (record = {}) => {
    const time = new Date(record?.visitTime || record?.visitDate || 0);
    if (Number.isNaN(time.getTime())) return Number.MAX_SAFE_INTEGER;
    return time.getHours() * 60 + time.getMinutes();
  };
  const compareAppointmentScheduleAscending = (left, right) => {
    const leftDate = left?.dateSortValue ?? getAppointmentDateSortValue(left?.record);
    const rightDate = right?.dateSortValue ?? getAppointmentDateSortValue(right?.record);
    if (leftDate !== rightDate) return leftDate - rightDate;

    const leftTime = left?.timeSortValue ?? getAppointmentTimeSortValue(left?.record);
    const rightTime = right?.timeSortValue ?? getAppointmentTimeSortValue(right?.record);
    if (leftTime !== rightTime) return leftTime - rightTime;

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  };
  const buildAppointmentEntry = (record, index = 0) => {
    const recordStatusText = getAppointmentStatusText(record);
    const recordStatusColor = getAppointmentStatusColor(record);
    const dateGroupKey = getAppointmentDateGroupKey(record);
    return {
      id: getAppointmentRecordKey(record, index),
      record,
      rawStatus: String(record?.status || "").toLowerCase(),
      title: record?.purposeOfVisit || "Campus Appointment",
      office:
        record?.appointmentDepartment ||
        record?.assignedOffice ||
        record?.host ||
        "Not assigned",
      dateLabel: record?.visitDate ? formatDate(record.visitDate) : "Not scheduled",
      timeLabel: record?.visitTime ? formatTime(record.visitTime) : "Not scheduled",
      statusLabel: recordStatusText,
      statusIcon: getAppointmentStatusIcon(record),
      statusColor: recordStatusColor,
      dateGroupKey,
      dateGroupLabel: dateGroupKey === "unscheduled" ? "Unscheduled" : formatDate(record?.visitDate || record?.visitTime),
      dateSortValue: getAppointmentDateSortValue(record),
      timeSortValue: getAppointmentTimeSortValue(record),
      description:
        String(record?.appointmentStatus || "").toLowerCase() === "pending"
          ? "Your request is with the selected office. Staff will approve, adjust, redirect, or decline it."
          : String(record?.appointmentStatus || "").toLowerCase() === "rescheduled"
            ? "Your reschedule request was sent to staff. Wait for their confirmation before visiting."
            : String(record?.appointmentStatus || "").toLowerCase() === "adjustment_pending"
              ? "Staff proposed this schedule. Confirm it if you are available, or choose another date and time."
              : ["approved", "adjusted"].includes(String(record?.appointmentStatus || "").toLowerCase())
                ? "You are approved. Bring your NFC card or assigned UID and proceed to security at your scheduled time."
                : String(record?.appointmentStatus || "").toLowerCase() === "cancelled"
                  ? (record?.appointmentCancellationReason || "This appointment was cancelled and can no longer be used for entry.")
                  : String(record?.appointmentStatus || "").toLowerCase() === "rejected"
                    ? (record?.staffRejectionReason || record?.approvalNotes || "This request was declined by the office.")
                    : record?.appointmentCancellationReason ||
                      record?.appointmentRescheduleReason ||
                      record?.staffAdjustmentNote ||
                      record?.staffApprovalNote ||
                      record?.staffRejectionReason ||
                      record?.approvalNotes ||
                      "Track the latest status of your submitted visit request here.",
    };
  };
  const appointmentSourceRecords = [
    ...appointmentHistory,
    ...(visitor ? [visitor] : []),
  ].filter(Boolean);
  const uniqueAppointmentRecords = Array.from(
    new Map(
      appointmentSourceRecords.map((record, index) => [
        getAppointmentRecordKey(record, index),
        record,
      ]),
    ).values(),
  ).sort((left, right) => {
    return getAppointmentActivityTime(right) - getAppointmentActivityTime(left);
  });
  const currentAppointmentRecord = uniqueAppointmentRecords[0] || visitor || null;
  const getAppointmentFeedbackSchedule = () => {
    if (!appointmentFeedback?.date) {
      return {
        dateGroupKey: "unscheduled",
        dateGroupLabel: "Unscheduled",
        dateSortValue: 0,
        timeSortValue: Number.MAX_SAFE_INTEGER,
      };
    }

    const feedbackDate = new Date(appointmentFeedback.date);
    if (Number.isNaN(feedbackDate.getTime())) {
      return {
        dateGroupKey: "unscheduled",
        dateGroupLabel: "Unscheduled",
        dateSortValue: 0,
        timeSortValue: Number.MAX_SAFE_INTEGER,
      };
    }

    const dateOnly = new Date(feedbackDate);
    dateOnly.setHours(0, 0, 0, 0);
    const year = feedbackDate.getFullYear();
    const month = String(feedbackDate.getMonth() + 1).padStart(2, "0");
    const day = String(feedbackDate.getDate()).padStart(2, "0");
    const parsedFeedbackTime = new Date(`${appointmentFeedback.date} ${appointmentFeedback.time || ""}`);
    const hasFeedbackTime = !Number.isNaN(parsedFeedbackTime.getTime());

    return {
      dateGroupKey: `${year}-${month}-${day}`,
      dateGroupLabel: appointmentFeedback.date,
      dateSortValue: dateOnly.getTime(),
      timeSortValue: hasFeedbackTime
        ? parsedFeedbackTime.getHours() * 60 + parsedFeedbackTime.getMinutes()
        : Number.MAX_SAFE_INTEGER,
    };
  };
  const appointmentFeedbackSchedule = getAppointmentFeedbackSchedule();
  const currentAppointmentEntry = appointmentFeedback
    ? {
      id: `feedback-${appointmentFeedback.date || "latest"}-${appointmentFeedback.time || "latest"}`,
      title: appointmentFeedback?.purpose || "Appointment Request",
      office: appointmentFeedback?.department || "Pending assignment",
      dateLabel: appointmentFeedback?.date || "Pending schedule",
      timeLabel: appointmentFeedback?.time || "Pending schedule",
      statusLabel: "Pending",
      statusIcon: "paper-plane-outline",
      statusColor: "#0A3D91",
      dateGroupKey: appointmentFeedbackSchedule.dateGroupKey,
      dateGroupLabel: appointmentFeedbackSchedule.dateGroupLabel,
      dateSortValue: appointmentFeedbackSchedule.dateSortValue,
      timeSortValue: appointmentFeedbackSchedule.timeSortValue,
      description: appointmentFeedback?.message || "Your latest request was sent to staff for review.",
    }
    : currentAppointmentRecord
      ? buildAppointmentEntry(currentAppointmentRecord)
      : null;
  const currentAppointmentKey = currentAppointmentRecord ? getAppointmentRecordKey(currentAppointmentRecord) : "";
  const appointmentHistoryEntries = uniqueAppointmentRecords
    .filter((record) => record !== currentAppointmentRecord && getAppointmentRecordKey(record) !== currentAppointmentKey)
    .map((record, index) => buildAppointmentEntry(record, index));
  const appointmentDisplayEntries = [
    currentAppointmentEntry,
    ...appointmentHistoryEntries,
  ].filter(Boolean);
  const appointmentHistoryGroups = Object.values(
    appointmentDisplayEntries.reduce((groups, entry) => {
      const groupKey = entry.dateGroupKey || "unscheduled";
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          label: entry.dateGroupLabel || "Unscheduled",
          dateSortValue: entry.dateSortValue || 0,
          entries: [],
        };
      }
      groups[groupKey].entries.push(entry);
      return groups;
    }, {}),
  )
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort(compareAppointmentScheduleAscending),
    }))
    .sort((left, right) => {
      if (left.dateSortValue !== right.dateSortValue) {
        return right.dateSortValue - left.dateSortValue;
      }
      return String(left.label).localeCompare(String(right.label));
    });
  const visitorDestinationInfo = getVisitorDestinationInfo(visitor, visitorMapRooms, visitorMapRoomPositions);
  const visitorRouteSteps = buildVisitorRouteSteps(visitorDestinationInfo);
  const visitorDestinationMarker = {
    id: "visitor-appointment-destination",
    officeId: visitorDestinationInfo.officeId,
    floor: visitorDestinationInfo.floorId,
    label: visitorDestinationInfo.officeName,
    icon: "navigate",
    position: visitorDestinationInfo.position,
  };
  const visitorSelfLocationMarker = getVisitorSelfLocationMarker(
    visitor,
    visitorMapRooms,
    visitorMapRoomPositions,
  );
  const activeVisitorMapFloor =
    MONITORING_MAP_FLOORS.find((floor) => floor.id === selectedVisitorMapFloor)?.id ||
    visitorSelfLocationMarker?.location?.floor ||
    visitorDestinationInfo.floorId ||
    "ground";
  const recentAppointmentEntries = appointmentDisplayEntries.slice(0, 3);
  const approvedAppointmentCount = appointmentDisplayEntries.filter((entry) =>
    String(entry.statusLabel || "").toLowerCase().includes("approved"),
  ).length;
  const pendingAppointmentCount = appointmentDisplayEntries.filter((entry) => {
    const normalizedStatus = String(entry.statusLabel || "").toLowerCase();
    return normalizedStatus.includes("pending") || normalizedStatus.includes("review") || normalizedStatus.includes("reschedule");
  }).length;
  const displayName =
    visitor?.fullName ||
    [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") ||
    "Visitor";
  const visitorAvatarUri =
    currentUser?.profilePhoto ||
    currentUser?.avatar ||
    currentUser?.photoURL ||
    visitor?.profilePhoto ||
    visitor?.avatar ||
    null;
  const visitorInitials = (visitor?.fullName || displayName || "Visitor")
    .split(" ")
    .filter(Boolean)
    .map((name) => name[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "V";
  const journeyTitle = isPendingApproval
    ? "Registration Review In Progress"
    : isPendingStaffReview
      ? "Staff Review In Progress"
      : isApprovedVisitor
        ? "Access Ready"
        : isCheckedOutVisitor
          ? "Visit Completed"
          : canRequestNewAppointment
            ? "Schedule Your Next Visit"
            : canCreateFreshAppointment
              ? "Visitor Account Active"
              : "Start Your SafePass";
  const journeySubtitle = isPendingApproval
    ? "An admin is reviewing your first visitor request."
    : isPendingStaffReview
      ? "Staff is evaluating your preferred schedule."
      : isApprovedVisitor
        ? "Your pass and NFC tools are active."
        : isCheckedOutVisitor
          ? "Your last pass is closed. Review approval history or request your next visit from the appointment module."
          : canRequestNewAppointment
            ? "Use this site to request another appointment without registering again."
            : canCreateFreshAppointment
              ? "Submit a new preferred date, time, and purpose from this dashboard."
              : "Create your first visitor registration to unlock access tools.";
  const commandMetrics = visitor
    ? [
        {
          label: "Visit Date",
          value: formatDate(visitor.visitDate),
          icon: "calendar-outline",
          target: "appointment",
        },
        {
          label: "Visit Time",
          value: formatTime(visitor.visitTime),
          icon: "time-outline",
          target: "appointment",
        },
        {
          label: "Purpose",
          value: visitor.purposeOfVisit || "Pending details",
          icon: "document-text-outline",
          target: "appointment",
        },
      ]
    : [
        {
          label: "Account",
          value: String(currentUser?.status || "Active").toUpperCase(),
          icon: "person-circle-outline",
          target: "account",
        },
        {
          label: "Role",
          value: "Visitor",
          icon: "id-card-outline",
          target: "account",
        },
        {
          label: "Next Step",
          value: canCreateFreshAppointment ? "Request Visit" : "Register",
          icon: "arrow-forward-circle-outline",
          target: canCreateFreshAppointment ? "appointment" : "home",
        },
      ];
  const homeQuickCategories = [
    {
      label: "Appointment",
      icon: "calendar-outline",
      accent: "#EAF3FF",
      iconColor: "#0A3D91",
      target: "appointment",
    },
    {
      label: "Campus Map",
      icon: "map-outline",
      accent: "#DCEBFF",
      iconColor: "#0B4EA2",
      target: "map",
    },
    {
      label: "Account",
      icon: "person-outline",
      accent: "#EEF5FF",
      iconColor: "#174EA6",
      target: "account",
    },
    {
      label: "Visit Pass",
      icon: "card-outline",
      accent: "#E4EAFE",
      iconColor: "#0A3D91",
      target: "home",
    },
  ];
  const appointmentScreenTabs = [
    { id: "menu", label: "Overview", icon: "apps-outline" },
    { id: "request", label: "Request", icon: "create-outline" },
    { id: "history", label: "History", icon: "time-outline" },
  ];
  const dashboardHeroAnimatedStyle = {
    opacity: dashboardHeroAnim,
    transform: [
      {
        translateY: dashboardHeroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [5, 0],
        }),
      },
    ],
  };
  const dashboardContentAnimatedStyle = {
    opacity: dashboardContentAnim,
    transform: [
      {
        translateX: visitorTransitionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [visitorTransitionDirection * 14, 0],
        }),
      },
      {
        translateY: dashboardContentAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [selectedVisitorSection === "appointment" ? 16 : 7, 0],
        }),
      },
      {
        scale: dashboardContentAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [selectedVisitorSection === "appointment" ? 0.985 : 0.995, 1],
        }),
      },
    ],
  };

  const renderHomeDiscoveryStrip = () => (
    <ScrollReveal
      scrollY={dashboardScrollY}
      viewportHeight={viewportHeight}
      delay={80}
    >
      <Animated.View
        style={[
          visitorDashboardStyles.homeDiscoveryShell,
          dashboardSectionResponsiveStyle,
          dashboardContentAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={["#041E42", "#0A3D91", "#1B5FC1"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={visitorDashboardStyles.homeDiscoveryCard}
        >
        <View style={visitorDashboardStyles.homeDiscoverySearchRow}>
          <View style={visitorDashboardStyles.homeDiscoverySearchBar}>
            <Ionicons name="search-outline" size={18} color="#0A3D91" />
            <Text style={visitorDashboardStyles.homeDiscoverySearchText}>
              Search your visit, office, or request
            </Text>
          </View>
          <TouchableOpacity
            style={visitorDashboardStyles.homeDiscoveryAction}
            activeOpacity={0.88}
            onPress={() => handleVisitorSectionChange("appointment")}
          >
            <Ionicons name="options-outline" size={18} color="#041E42" />
          </TouchableOpacity>
        </View>

        <View style={visitorDashboardStyles.homeDiscoveryLocationWrap}>
          <Text style={visitorDashboardStyles.homeDiscoveryLocationLabel}>Current Visitor View</Text>
          <Text style={visitorDashboardStyles.homeDiscoveryLocationValue}>
            {visitor?.appointmentDepartment || visitor?.assignedOffice || "SafePass Visitor Portal"}
          </Text>
        </View>

        <View style={visitorDashboardStyles.homeDiscoveryCategoryRow}>
          {homeQuickCategories.map((item) => (
            <AnimatedPressable
              key={item.label}
              style={visitorDashboardStyles.homeDiscoveryCategoryItem}
              activeOpacity={0.86}
              onPress={() => handleVisitorSectionChange(item.target)}
            >
              <View
                style={[
                  visitorDashboardStyles.homeDiscoveryCategoryCapsule,
                  { backgroundColor: item.accent },
                ]}
              >
                <View style={visitorDashboardStyles.homeDiscoveryCategoryIcon}>
                  <Ionicons name={item.icon} size={18} color={item.iconColor} />
                </View>
              </View>
              <Text style={visitorDashboardStyles.homeDiscoveryCategoryLabel}>{item.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
        </LinearGradient>
      </Animated.View>
    </ScrollReveal>
  );

  const renderAppointmentSegmentBar = (activeScreen) => (
    <View style={[visitorDashboardStyles.appointmentSegmentBar, isVisitorDarkMode && visitorDashboardStyles.darkSegmentBar]}>
      {appointmentScreenTabs.map((tab) => {
        const isActive = tab.id === activeScreen;
        const onPress =
          tab.id === "menu"
            ? () => handleAppointmentScreenNavigation("menu", "Loading appointment menu...")
            : tab.id === "request"
              ? openAppointmentRequestScreen
              : () => handleAppointmentScreenNavigation("history", "Loading appointment history...");

        return (
          <AnimatedPressable
            key={tab.id}
            style={[
              visitorDashboardStyles.appointmentSegmentButton,
              isVisitorDarkMode && visitorDashboardStyles.darkSegmentButton,
              isActive && visitorDashboardStyles.appointmentSegmentButtonActive,
            ]}
            activeOpacity={0.88}
            onPress={onPress}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={isActive ? "#FFFFFF" : isVisitorDarkMode ? "#CBD5E1" : "#475569"}
            />
            <Text
              style={[
                visitorDashboardStyles.appointmentSegmentText,
                isVisitorDarkMode && visitorDashboardStyles.darkMutedText,
                isActive && visitorDashboardStyles.appointmentSegmentTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );

  const renderAppointmentInsightsCard = () => (
    <ScrollReveal
      scrollY={dashboardScrollY}
      viewportHeight={viewportHeight}
      delay={70}
    >
      <View
        style={[
          visitorDashboardStyles.appointmentInsightsCard,
          dashboardSectionResponsiveStyle,
          isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard,
        ]}
      >
      <View style={visitorDashboardStyles.appointmentInsightsHeader}>
        <View>
          <Text style={visitorDashboardStyles.appointmentInsightsEyebrow}>Visitor Summary</Text>
          <Text style={[visitorDashboardStyles.appointmentInsightsTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            Appointment Snapshot
          </Text>
        </View>
        <AnimatedPressable
          style={visitorDashboardStyles.appointmentInsightsAction}
          activeOpacity={0.86}
          onPress={() => handleVisitorSectionChange("appointment")}
        >
          <Text style={visitorDashboardStyles.appointmentInsightsActionText}>Open Module</Text>
          <Ionicons name="arrow-forward-outline" size={16} color="#0A3D91" />
        </AnimatedPressable>
      </View>

      <View style={visitorDashboardStyles.appointmentInsightsGrid}>
        <View style={[visitorDashboardStyles.appointmentInsightsMetricCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
          <Text style={visitorDashboardStyles.appointmentInsightsMetricLabel}>Requests</Text>
          <Text style={[visitorDashboardStyles.appointmentInsightsMetricValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {appointmentDisplayEntries.length || 0}
          </Text>
        </View>
        <View style={[visitorDashboardStyles.appointmentInsightsMetricCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
          <Text style={visitorDashboardStyles.appointmentInsightsMetricLabel}>Approved</Text>
          <Text style={[visitorDashboardStyles.appointmentInsightsMetricValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {approvedAppointmentCount}
          </Text>
        </View>
        <View style={[visitorDashboardStyles.appointmentInsightsMetricCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
          <Text style={visitorDashboardStyles.appointmentInsightsMetricLabel}>In Review</Text>
          <Text style={[visitorDashboardStyles.appointmentInsightsMetricValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {pendingAppointmentCount}
          </Text>
        </View>
      </View>

      <View style={[visitorDashboardStyles.appointmentInsightsStatusCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
        <View style={visitorDashboardStyles.appointmentInsightsStatusIcon}>
          <Ionicons name="sparkles-outline" size={18} color="#0A3D91" />
        </View>
        <View style={visitorDashboardStyles.appointmentInsightsStatusCopy}>
          <Text style={[visitorDashboardStyles.appointmentInsightsStatusTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {recentAppointmentEntries[0]?.statusLabel || journeyTitle}
          </Text>
          <Text style={[visitorDashboardStyles.appointmentInsightsStatusText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            {recentAppointmentEntries[0]?.description || journeySubtitle}
          </Text>
        </View>
      </View>
      </View>
    </ScrollReveal>
  );

  const renderRecentAppointmentRail = () => {
    if (!recentAppointmentEntries.length) {
      return null;
    }

    return (
      <View
        style={[
          visitorDashboardStyles.recentActivityCard,
          dashboardSectionResponsiveStyle,
          isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard,
        ]}
      >
        <View style={visitorDashboardStyles.recentActivityHeader}>
          <View>
            <Text style={visitorDashboardStyles.recentActivityEyebrow}>Recent Activity</Text>
            <Text style={[visitorDashboardStyles.recentActivityTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
              Latest Appointment Trail
            </Text>
          </View>
          <TouchableOpacity
            style={visitorDashboardStyles.recentActivityAction}
            activeOpacity={0.86}
            onPress={openAppointmentHistoryScreen}
          >
            <Text style={visitorDashboardStyles.recentActivityActionText}>View all</Text>
            <Ionicons name="arrow-forward-outline" size={16} color="#0A3D91" />
          </TouchableOpacity>
        </View>

        <View style={visitorDashboardStyles.recentActivityList}>
          {recentAppointmentEntries.map((entry) => (
            <View key={entry.id} style={[visitorDashboardStyles.recentActivityItem, isVisitorDarkMode && visitorDashboardStyles.darkDividerBorder]}>
              <View
                style={[
                  visitorDashboardStyles.recentActivityStatusDot,
                  { backgroundColor: entry.statusColor },
                ]}
              />
              <View style={visitorDashboardStyles.recentActivityCopy}>
                <Text
                  style={[visitorDashboardStyles.recentActivityItemTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}
                  numberOfLines={1}
                >
                  {entry.title}
                </Text>
                <Text
                  style={[visitorDashboardStyles.recentActivityItemMeta, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}
                  numberOfLines={2}
                >
                  {entry.office} - {entry.dateLabel} - {entry.timeLabel}
                </Text>
              </View>
              <View
                style={[
                  visitorDashboardStyles.recentActivityPill,
                  { backgroundColor: `${entry.statusColor}14` },
                ]}
              >
                <Text
                  style={[
                    visitorDashboardStyles.recentActivityPillText,
                    { color: entry.statusColor },
                  ]}
                  numberOfLines={1}
                >
                  {entry.statusLabel}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderVisitorModuleNavigation = () => (
    <View
      style={[
        visitorDashboardStyles.visitorModuleCard,
        dashboardSectionResponsiveStyle,
        isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard,
      ]}
    >
      <View style={visitorDashboardStyles.visitorModuleHeader}>
        <View>
          <Text style={visitorDashboardStyles.visitorModuleEyebrow}>About the School</Text>
          <Text style={[visitorDashboardStyles.visitorModuleTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            Plan Your Campus Visit
          </Text>
        </View>
        <View style={visitorDashboardStyles.visitorModuleHeaderBadge}>
          <Ionicons name="school-outline" size={14} color="#0A3D91" />
          <Text style={visitorDashboardStyles.visitorModuleHeaderBadgeText}>Visitor Guide</Text>
        </View>
      </View>

      <Text style={[visitorDashboardStyles.visitorModuleIntroText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
        SafePass helps visitors coordinate appointments, access campus directions, and prepare requirements before arrival.
      </Text>

      <View style={visitorDashboardStyles.visitorAboutGrid}>
        <View style={[visitorDashboardStyles.visitorAboutCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
          <View style={[visitorDashboardStyles.visitorAboutIconWrap, { backgroundColor: "#EEF5FF" }]}>
            <Ionicons name="calendar-clear-outline" size={18} color="#0A3D91" />
          </View>
          <Text style={[visitorDashboardStyles.visitorAboutTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Appointments</Text>
          <Text style={[visitorDashboardStyles.visitorAboutText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            Request a schedule, wait for staff review, and track approval updates here.
          </Text>
        </View>

        <View style={[visitorDashboardStyles.visitorAboutCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
          <View style={[visitorDashboardStyles.visitorAboutIconWrap, { backgroundColor: "#EAF3FF" }]}>
            <Ionicons name="map-outline" size={18} color="#0B4EA2" />
          </View>
          <Text style={[visitorDashboardStyles.visitorAboutTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Campus Guide</Text>
          <Text style={[visitorDashboardStyles.visitorAboutText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            Review the floors and offices first so you can head directly to the right destination.
          </Text>
        </View>

        <View style={[visitorDashboardStyles.visitorAboutCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
          <View style={[visitorDashboardStyles.visitorAboutIconWrap, { backgroundColor: "#DCEBFF" }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#174EA6" />
          </View>
          <Text style={[visitorDashboardStyles.visitorAboutTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Visit Reminders</Text>
          <Text style={[visitorDashboardStyles.visitorAboutText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            Bring a valid ID and keep Wi-Fi or mobile data on when visiting the campus.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={visitorDashboardStyles.visitorAboutAction}
        onPress={() => handleVisitorSectionChange("map")}
        activeOpacity={0.86}
      >
        <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
        <Text style={visitorDashboardStyles.visitorAboutActionText}>Open Campus Map</Text>
      </TouchableOpacity>
    </View>
  );

  const accountDisplayName = visitor?.fullName || displayName || "Visitor";
  const accountFirstName = accountDisplayName.split(" ")[0] || accountDisplayName;



  const handleEditProfilePress = () => {
    if (visitor) {
      const fullNameParts = String(visitor.fullName || "").trim().split(/\s+/).filter(Boolean);
      setProfileEditForm({
        firstName: currentUser?.firstName || visitor.firstName || fullNameParts[0] || '',
        lastName: currentUser?.lastName || visitor.lastName || fullNameParts.slice(1).join(' ') || '',
        email: currentUser?.email || visitor.email || '',
        phoneNumber: currentUser?.phone || visitor.phoneNumber || '',
        emergencyContact: currentUser?.emergencyContact || visitor.emergencyContact || ''
      });
      setShowProfileEditModal(true);
    }
  };

  const handleProfileEditCancel = () => {
    setShowProfileEditModal(false);
    // Reset form to current visitor data
    if (visitor) {
      setProfileEditForm({
        firstName: visitor.firstName || '',
        lastName: visitor.lastName || '',
        email: visitor.email || '',
        phoneNumber: visitor.phoneNumber || '',
        emergencyContact: visitor.emergencyContact || ''
      });
    }
  };

  const handleProfileEditSave = async () => {
    // Basic validation
    if (!profileEditForm.firstName.trim() || !profileEditForm.lastName.trim()) {
      showVisitorAlert("Validation Error", "First name and last name are required");
      return;
    }

    if (!profileEditForm.email.trim() || !/\S+@\S+\.\S+/.test(profileEditForm.email)) {
      showVisitorAlert("Validation Error", "Please enter a valid email address");
      return;
    }

    try {
      const response = await ApiService.updateProfile({
        firstName: profileEditForm.firstName.trim(),
        lastName: profileEditForm.lastName.trim(),
        email: profileEditForm.email.trim().toLowerCase(),
        phone: profileEditForm.phoneNumber.trim(),
        emergencyContact: profileEditForm.emergencyContact.trim()
      });

      if (response.success) {
        // Update local state
        setVisitor(prev => ({
          ...prev,
          firstName: profileEditForm.firstName.trim(),
          lastName: profileEditForm.lastName.trim(),
          fullName: `${profileEditForm.firstName.trim()} ${profileEditForm.lastName.trim()}`,
          email: profileEditForm.email.trim().toLowerCase(),
          phoneNumber: profileEditForm.phoneNumber.trim(),
          emergencyContact: profileEditForm.emergencyContact.trim()
        }));

        const updatedUser = response.user || {
          ...(currentUser || {}),
          firstName: profileEditForm.firstName.trim(),
          lastName: profileEditForm.lastName.trim(),
          email: profileEditForm.email.trim().toLowerCase(),
          phone: profileEditForm.phoneNumber.trim(),
          emergencyContact: profileEditForm.emergencyContact.trim()
        };
        setCurrentUser(updatedUser);
        await Storage.setItem("currentUser", JSON.stringify(updatedUser));

        setShowProfileEditModal(false);
        showVisitorAlert("Profile Updated", "Your profile has been updated successfully.");

        // Refresh visitor data to ensure consistency
        await loadVisitorData();
      } else {
        showVisitorAlert("Update Failed", response.message || "Failed to update profile");
      }
    } catch (error) {
      console.error("Profile edit error:", error);
      showVisitorAlert("Update Failed", error.message || "An unexpected error occurred");
    }
  };

  const renderProfileEditModal = () => (
    <Modal
      transparent={true}
      visible={showProfileEditModal}
      onRequestClose={handleProfileEditCancel}
      animationType="fade"
    >
      <View style={visitorDashboardStyles.modalOverlay}>
        <View style={[
          visitorDashboardStyles.modalContainer,
          isVisitorDarkMode && visitorDashboardStyles.darkModalContainer
        ]}>
          <View style={visitorDashboardStyles.modalHeader}>
            <Ionicons
              name="person-outline"
              size={24}
              color={isVisitorDarkMode ? "#FFFFFF" : "#0A3D91"}
            />
            <Text style={[
              visitorDashboardStyles.modalTitle,
              isVisitorDarkMode && visitorDashboardStyles.darkModalTitle
            ]}>
              Edit Profile
            </Text>
            <TouchableOpacity
              style={visitorDashboardStyles.modalCloseButton}
              onPress={handleProfileEditCancel}
            >
              <Ionicons name="close-outline" size={20} color={isVisitorDarkMode ? "#FFFFFF" : "#6B7280"} />
            </TouchableOpacity>
          </View>

          <View style={visitorDashboardStyles.modalContent}>
            <View style={visitorDashboardStyles.modalFormGroup}>
              <Text style={visitorDashboardStyles.modalFormLabel}>First Name</Text>
              <TextInput
                style={visitorDashboardStyles.modalFormInput}
                value={profileEditForm.firstName}
                onChangeText={(text) => setProfileEditForm(prev => ({ ...prev, firstName: text }))}
                placeholder="Enter your first name"
                autoCapitalize="words"
              />
            </View>

            <View style={visitorDashboardStyles.modalFormGroup}>
              <Text style={visitorDashboardStyles.modalFormLabel}>Last Name</Text>
              <TextInput
                style={visitorDashboardStyles.modalFormInput}
                value={profileEditForm.lastName}
                onChangeText={(text) => setProfileEditForm(prev => ({ ...prev, lastName: text }))}
                placeholder="Enter your last name"
                autoCapitalize="words"
              />
            </View>

            <View style={visitorDashboardStyles.modalFormGroup}>
              <Text style={visitorDashboardStyles.modalFormLabel}>Email</Text>
              <TextInput
                style={visitorDashboardStyles.modalFormInput}
                value={profileEditForm.email}
                onChangeText={(text) => setProfileEditForm(prev => ({ ...prev, email: text }))}
                placeholder="Enter your email address"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={visitorDashboardStyles.modalFormGroup}>
              <Text style={visitorDashboardStyles.modalFormLabel}>Phone Number</Text>
              <TextInput
                style={visitorDashboardStyles.modalFormInput}
                value={profileEditForm.phoneNumber}
                onChangeText={(text) => setProfileEditForm(prev => ({ ...prev, phoneNumber: text }))}
                placeholder="Enter your phone number"
                keyboardType="phone-pad"
              />
            </View>

            <View style={visitorDashboardStyles.modalFormGroup}>
              <Text style={visitorDashboardStyles.modalFormLabel}>Emergency Contact</Text>
              <TextInput
                style={visitorDashboardStyles.modalFormInput}
                value={profileEditForm.emergencyContact}
                onChangeText={(text) => setProfileEditForm(prev => ({ ...prev, emergencyContact: text }))}
                placeholder="Enter emergency contact name"
              />
            </View>

            <View style={visitorDashboardStyles.modalActions}>
              <TouchableOpacity
                style={[
                  visitorDashboardStyles.modalButtonSecondary,
                  isVisitorDarkMode && visitorDashboardStyles.darkModalButtonSecondary
                ]}
                onPress={handleProfileEditCancel}
              >
                <Text style={[
                  visitorDashboardStyles.modalButtonText,
                  isVisitorDarkMode && visitorDashboardStyles.darkModalButtonText
                ]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  visitorDashboardStyles.modalButtonPrimary,
                  isVisitorDarkMode && visitorDashboardStyles.darkModalButtonPrimary
                ]}
                onPress={handleProfileEditSave}
                activeOpacity={0.9}
              >
                <Text style={[
                  visitorDashboardStyles.modalButtonText,
                  isVisitorDarkMode && visitorDashboardStyles.darkModalButtonText
                ]}>
                  Save Changes
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderAccountPanel = () => (
    <View
      style={[
        visitorDashboardStyles.visitorFlowPanel,
        dashboardSectionResponsiveStyle,
        isCompactVisitorDashboard && visitorDashboardStyles.accountMobilePanel,
        isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard,
      ]}
    >
      <View
        style={[
          visitorDashboardStyles.visitorFlowPanelHeader,
          isCompactVisitorDashboard && visitorDashboardStyles.accountMobileHeader,
        ]}
      >
        <View style={[visitorDashboardStyles.visitorFlowPanelIcon, isCompactVisitorDashboard && visitorDashboardStyles.accountMobileHeaderIcon]}>
          <Ionicons name="person-circle-outline" size={24} color="#0A3D91" />
        </View>
        <View style={visitorDashboardStyles.visitorFlowPanelTitleWrap}>
          <Text style={visitorDashboardStyles.visitorFlowPanelEyebrow}>Account Management</Text>
          <Text
            style={[
              visitorDashboardStyles.visitorFlowPanelTitle,
              isCompactVisitorDashboard && visitorDashboardStyles.accountMobileTitle,
              isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText,
            ]}
          >
            {`${accountFirstName}'s Account`}
          </Text>
        </View>
      </View>

      <LinearGradient
        colors={["#0F172A", "#1E3A8A", "#0A3D91"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          visitorDashboardStyles.accountHeroCard,
          isCompactVisitorDashboard && visitorDashboardStyles.accountHeroCardMobile,
        ]}
      >
        <View style={[visitorDashboardStyles.accountHeroTopRow, isCompactVisitorDashboard && visitorDashboardStyles.accountHeroTopRowMobile]}>
          <View style={visitorDashboardStyles.accountHeroIdentity}>
            <View style={[visitorDashboardStyles.accountHeroAvatar, isCompactVisitorDashboard && visitorDashboardStyles.accountHeroAvatarMobile]}>
              {visitorAvatarUri ? (
                <Image source={{ uri: visitorAvatarUri }} style={visitorDashboardStyles.accountHeroAvatarImage} />
              ) : (
                <Text style={visitorDashboardStyles.accountHeroInitials}>{visitorInitials}</Text>
              )}
            </View>
            <View style={visitorDashboardStyles.accountHeroCopy}>
              <Text style={[visitorDashboardStyles.accountHeroName, isCompactVisitorDashboard && visitorDashboardStyles.accountHeroNameMobile]}>
                {accountDisplayName}
              </Text>
              <Text style={[visitorDashboardStyles.accountHeroSubtext, isCompactVisitorDashboard && visitorDashboardStyles.accountHeroSubtextMobile]}>
                SafePass ID, account status, and profile access in one place.
              </Text>
            </View>
          </View>
          <View style={visitorDashboardStyles.accountHeroBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#0F172A" />
            <Text style={visitorDashboardStyles.accountHeroBadgeText}>{statusText}</Text>
          </View>
        </View>

        <View style={visitorDashboardStyles.accountStatGrid}>
          <View style={[visitorDashboardStyles.accountStatCard, isCompactVisitorDashboard && visitorDashboardStyles.accountStatCardMobile]}>
            <Text style={visitorDashboardStyles.accountStatLabel}>Role</Text>
            <Text style={visitorDashboardStyles.accountStatValue}>Visitor</Text>
          </View>
          <View style={[visitorDashboardStyles.accountStatCard, isCompactVisitorDashboard && visitorDashboardStyles.accountStatCardMobile]}>
            <Text style={visitorDashboardStyles.accountStatLabel}>Access State</Text>
            <Text style={visitorDashboardStyles.accountStatValue}>
              {visitor?.status === "checked_in" ? "On Site" : "Off Site"}
            </Text>
          </View>
          <View style={[visitorDashboardStyles.accountStatCard, isCompactVisitorDashboard && visitorDashboardStyles.accountStatCardWideMobile]}>
            <Text style={visitorDashboardStyles.accountStatLabel}>SafePass ID</Text>
            <Text style={visitorDashboardStyles.accountStatValue} numberOfLines={1}>
              {visitorSafePassId}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[visitorDashboardStyles.accountPanelCard, isCompactVisitorDashboard && visitorDashboardStyles.accountMobileCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
        <Text style={[visitorDashboardStyles.accountSectionTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
          Account Details
        </Text>
        <View style={[visitorDashboardStyles.accountPanelRow, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelRowMobile, isVisitorDarkMode && visitorDashboardStyles.darkDividerBorder]}>
          <Text style={visitorDashboardStyles.accountPanelLabel}>Full Name</Text>
          <Text style={[visitorDashboardStyles.accountPanelValue, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelValueMobile, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {accountDisplayName}
          </Text>
        </View>
        <View style={[visitorDashboardStyles.accountPanelRow, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelRowMobile, isVisitorDarkMode && visitorDashboardStyles.darkDividerBorder]}>
          <Text style={visitorDashboardStyles.accountPanelLabel}>Email</Text>
          <Text style={[visitorDashboardStyles.accountPanelValue, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelValueMobile, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {currentUser?.email || visitor?.email || "Not available"}
          </Text>
        </View>
        <View style={[visitorDashboardStyles.accountPanelRow, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelRowMobile, isVisitorDarkMode && visitorDashboardStyles.darkDividerBorder]}>
          <Text style={visitorDashboardStyles.accountPanelLabel}>Role</Text>
          <Text style={[visitorDashboardStyles.accountPanelValue, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelValueMobile, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Visitor</Text>
        </View>
        <View style={[visitorDashboardStyles.accountPanelRow, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelRowMobile, isVisitorDarkMode && visitorDashboardStyles.darkDividerBorder]}>
          <Text style={visitorDashboardStyles.accountPanelLabel}>Status</Text>
          <Text style={[visitorDashboardStyles.accountPanelValue, isCompactVisitorDashboard && visitorDashboardStyles.accountPanelValueMobile, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {statusText}
          </Text>
        </View>
      </View>

      <View style={visitorDashboardStyles.accountButtonDock}>
        <AnimatedPressable
          style={[visitorDashboardStyles.visitorFlowPrimaryButton, visitorDashboardStyles.accountDockPrimaryButton]}
          onPress={handleEditProfilePress}
          activeOpacity={0.88}
        >
          <Ionicons name="create-outline" size={18} color="#FFFFFF" />
          <Text style={visitorDashboardStyles.visitorFlowPrimaryButtonText}>
            Edit Profile
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[visitorDashboardStyles.accountLogoutButton, visitorDashboardStyles.accountDockLogoutButton]}
          onPress={handleLogout}
          activeOpacity={0.88}
        >
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={visitorDashboardStyles.accountLogoutButtonText}>
            Logout
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );

  const renderBottomNavigation = () => (
    <View style={visitorDashboardStyles.bottomNavShell}>
      <View
        style={[
          visitorDashboardStyles.bottomNavBar,
          isCompactVisitorDashboard && visitorDashboardStyles.bottomNavBarCompact,
          isVisitorDarkMode && visitorDashboardStyles.darkBottomNavBar,
        ]}
      >
        {VISITOR_MODULES.map((module) => {
          const isActive = selectedVisitorSection === module.id;

          return (
            <AnimatedPressable
              key={module.id}
              style={[
                visitorDashboardStyles.bottomNavItem,
                isCompactVisitorDashboard && visitorDashboardStyles.bottomNavItemCompact,
                isActive && visitorDashboardStyles.bottomNavItemActive,
                isActive && visitorDashboardStyles.bottomNavItemExpanded,
                isVisitorDarkMode && visitorDashboardStyles.darkBottomNavItem,
                isVisitorDarkMode && isActive && visitorDashboardStyles.darkBottomNavItemActive,
              ]}
              onPress={() => handleVisitorSectionChange(module.id)}
              activeOpacity={0.9}
              pressScale={0.94}
              accessibilityRole="tab"
              accessibilityLabel={module.label}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={module.icon}
                size={20}
                color={isActive ? "#FFFFFF" : isVisitorDarkMode ? "#CBD5E1" : "#64748B"}
              />
              {isActive ? (
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    visitorDashboardStyles.bottomNavLabel,
                    isVisitorDarkMode && visitorDashboardStyles.darkBottomNavLabel,
                    visitorDashboardStyles.bottomNavLabelActive,
                  ]}
                >
                  {module.label}
                </Animated.Text>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );

  const sectionIntro = {
    home: {
      eyebrow: "Visitor Workspace",
      title: "Home",
      subtitle:
        "Check your approval progress, prepare your next visit, and access your active pass in one place.",
      icon: "grid-outline",
      accent: "#0A3D91",
      accentSoft: "#EAF3FF",
      badge: "Overview",
      highlights: ["Live status", "Quick actions"],
    },
    map: {
      eyebrow: "Visitor Workspace",
      title: "Campus Map",
      subtitle:
        "Review the floor layout before arrival so you know exactly where to go on site.",
      icon: "map-outline",
      accent: "#0B4EA2",
      accentSoft: "#EAF3FF",
      badge: "Guide",
      highlights: ["Floor views", "Office guide"],
    },
    appointment: {
      eyebrow: "Visitor Workspace",
      title: "Appointment",
      subtitle:
        "Create a visit request and track whether it is pending, approved, or rejected.",
      icon: "calendar-outline",
      accent: "#0A3D91",
      accentSoft: "#EEF5FF",
      badge: "Schedule",
      highlights: ["Request visit", "Track progress"],
    },
    account: {
      eyebrow: "Visitor Workspace",
      title: "Account Management",
      subtitle:
        "Review your visitor account details, open your profile, and manage your sign-in session securely.",
      icon: "person-circle-outline",
      accent: "#174EA6",
      accentSoft: "#EAF3FF",
      badge: "Profile",
      highlights: ["Visitor info", "Access tools"],
    },
  }[selectedVisitorSection];

  const visitorPresentedIdLabel = visitor?.idType || visitor?.idNumber || "Not provided";
  const visitorSafePassId =
    visitor?.nfcCardId ||
    currentUser?.nfcCardId ||
    visitor?.safePassId ||
    currentUser?.safePassId ||
    "Assigned on account creation";
  const visitorVirtualNfcToken =
    visitor?.virtualNfcToken ||
    currentUser?.virtualNfcToken ||
    "";
  const visitorVirtualNfcDisplay = visitorVirtualNfcToken
    ? visitorVirtualNfcToken
    : Platform.OS === "android"
      ? "Syncing to this phone"
      : "Physical card required";

  const renderSectionIntro = () => (
    <ScrollReveal
      scrollY={dashboardScrollY}
      viewportHeight={viewportHeight}
      delay={50}
    >
      <View
        style={[
          visitorDashboardStyles.sectionIntroCard,
          dashboardSectionResponsiveStyle,
          isVisitorDarkMode
            ? visitorDashboardStyles.darkSurfaceCard
            : { backgroundColor: sectionIntro.accentSoft },
        ]}
      >
        <View style={visitorDashboardStyles.sectionIntroTopRow}>
          <View
            style={[
              visitorDashboardStyles.sectionIntroIconWrap,
              { backgroundColor: `${sectionIntro.accent}18` },
            ]}
          >
            <Ionicons name={sectionIntro.icon} size={20} color={sectionIntro.accent} />
          </View>
          <View
            style={[
              visitorDashboardStyles.sectionIntroBadge,
              { backgroundColor: `${sectionIntro.accent}12` },
            ]}
          >
            <Text style={[visitorDashboardStyles.sectionIntroBadgeText, { color: sectionIntro.accent }]}>
              {sectionIntro.badge}
            </Text>
          </View>
        </View>

        <View style={visitorDashboardStyles.sectionIntroCopy}>
          <Text style={[visitorDashboardStyles.sectionIntroEyebrow, { color: sectionIntro.accent }]}>
            {sectionIntro.eyebrow}
          </Text>
          <Text style={[visitorDashboardStyles.sectionIntroTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
            {sectionIntro.title}
          </Text>
          <Text style={[visitorDashboardStyles.sectionIntroSubtitle, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            {sectionIntro.subtitle}
          </Text>
        </View>

        <View style={visitorDashboardStyles.sectionIntroHighlightRow}>
          {sectionIntro.highlights.map((item) => (
            <View
              key={item}
              style={[
                visitorDashboardStyles.sectionIntroHighlightPill,
                isVisitorDarkMode && visitorDashboardStyles.darkReadablePill,
              ]}
            >
              <View
                style={[
                  visitorDashboardStyles.sectionIntroHighlightDot,
                  { backgroundColor: sectionIntro.accent },
                ]}
              />
              <Text style={[visitorDashboardStyles.sectionIntroHighlightText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollReveal>
  );

  const renderVisitorEmptyState = () => {
    if (isCheckedOutVisitor) return null;

    return (
    <View style={visitorDashboardStyles.emptyState}>
      <View style={visitorDashboardStyles.emptyIconContainer}>
        <Ionicons name="id-card-outline" size={80} color="#9CA3AF" />
      </View>
      {appointmentFeedback ? (
        <View style={visitorDashboardStyles.appointmentSuccessCard}>
          <View style={visitorDashboardStyles.appointmentSuccessHeader}>
            <View style={visitorDashboardStyles.appointmentSuccessIconWrap}>
              <Ionicons name="checkmark-circle" size={22} color="#0A3D91" />
            </View>
            <View style={visitorDashboardStyles.appointmentSuccessTextWrap}>
              <Text style={visitorDashboardStyles.appointmentSuccessTitle}>
                {appointmentFeedback.title}
              </Text>
              <Text style={visitorDashboardStyles.appointmentSuccessText}>
                {appointmentFeedback.message}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
      <Text style={visitorDashboardStyles.emptyTitle}>
        {canCreateFreshAppointment ? "Request Your Next Visit" : "No Active Visit Yet"}
      </Text>
      <Text style={visitorDashboardStyles.emptyText}>
        {canCreateFreshAppointment
          ? "Your visitor account is already active. Submit a new preferred date, time, and purpose here instead of registering again."
          : "Your visitor account is active. Submit an appointment request so your approved pass can appear here."}
      </Text>
      <AnimatedPressable
        style={visitorDashboardStyles.registerButton}
        onPress={
          canRequestNewAppointment || canCreateFreshAppointment
            ? openAppointmentRequestScreen
            : () => handleVisitorRouteNavigation("VisitorRegister")
        }
      >
        <LinearGradient
          colors={["#0A3D91", "#1C6DD0"]}
          style={visitorDashboardStyles.registerGradient}
        >
          <Ionicons
            name={canRequestNewAppointment || canCreateFreshAppointment ? "calendar-outline" : "person-add"}
            size={20}
            color="#FFFFFF"
          />
          <Text style={visitorDashboardStyles.registerButtonText}>
            {canRequestNewAppointment || canCreateFreshAppointment ? "Request Appointment" : "Register as Visitor"}
          </Text>
        </LinearGradient>
      </AnimatedPressable>
    </View>
    );
  };

  const submitStaffAdjustmentAcceptance = async (record = visitor) => {
    if (!record?._id || isUpdatingAppointment) return;

    if (!isStaffAdjustmentPending(record)) {
      showVisitorAlert("No Proposal", "There is no staff proposed schedule waiting for confirmation.");
      return;
    }

    setIsUpdatingAppointment(true);
    try {
      const response = await ApiService.acceptVisitorAppointmentAdjustment(record._id);
      if (response?.success) {
        showVisitorPushNotice({
          title: "Appointment Confirmed",
          message: response.message || "Your adjusted appointment has been confirmed.",
          type: "success",
        });
        showVisitorAlert("Appointment Confirmed", response.message || "Your adjusted appointment has been confirmed.");
        await loadVisitorData();
        handleAppointmentScreenNavigation("history", "Refreshing appointment history...");
        return;
      }

      showVisitorAlert("Confirm Failed", response?.message || "Failed to confirm the proposed appointment.");
    } catch (error) {
      console.error("Accept staff adjustment error:", error);
      showVisitorAlert("Confirm Failed", error?.message || "Failed to confirm the proposed appointment.");
    } finally {
      setIsUpdatingAppointment(false);
    }
  };

  const confirmStaffAdjustmentAcceptance = (record = visitor) => {
    showVisitorAlert(
      "Confirm Staff Schedule",
      "Tap confirm if the proposed date and time works for you. Your virtual card will be scheduled for that visit window.",
      [
        { text: "Back", style: "cancel" },
        { text: "Confirm", onPress: () => submitStaffAdjustmentAcceptance(record) },
      ],
    );
  };

  const renderApprovedVisitorDashboard = () => (
    <>
      <ScrollReveal
        scrollY={dashboardScrollY}
        viewportHeight={viewportHeight}
        delay={40}
      >
        <View
          style={[
            visitorDashboardStyles.approvedHeroCard,
            compactApprovedHeroStyle,
            dashboardSectionResponsiveStyle,
            dashboardHeroCardResponsiveStyle,
          ]}
        >
          <LinearGradient
            colors={["#0A3D91", "#1C6DD0", "#0A3D91"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[visitorDashboardStyles.approvedHeroGradient, compactApprovedGradientStyle]}
          >
          <View style={visitorDashboardStyles.approvedHeroBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#0A3D91" />
            <Text style={visitorDashboardStyles.approvedHeroBadgeText}>Approved Access</Text>
          </View>

          <View style={visitorDashboardStyles.approvedHeroHeader}>
            <View style={visitorDashboardStyles.approvedHeroAvatar}>
              <Text style={visitorDashboardStyles.approvedHeroInitials}>
                {visitor?.fullName
                  ?.split(" ")
                  .map((name) => name[0])
                  .join("")
                  .substring(0, 2)
                  .toUpperCase() || "VP"}
              </Text>
            </View>
            <View style={visitorDashboardStyles.approvedHeroTextWrap}>
              <Text style={visitorDashboardStyles.approvedHeroTitle}>SafePass Ready</Text>
              <Text style={visitorDashboardStyles.approvedHeroSubtitle}>
                Review your schedule and open your pass when you arrive.
              </Text>
            </View>
          </View>

          <View style={visitorDashboardStyles.approvedHeroFacts}>
            <View style={[visitorDashboardStyles.approvedHeroFactCard, { width: approvedFactCardWidth }]}>
              <Text style={visitorDashboardStyles.approvedHeroFactLabel}>Visit Date</Text>
              <Text style={visitorDashboardStyles.approvedHeroFactValue}>
                {formatDate(visitor?.visitDate)}
              </Text>
            </View>
            <View style={[visitorDashboardStyles.approvedHeroFactCard, { width: approvedFactCardWidth }]}>
              <Text style={visitorDashboardStyles.approvedHeroFactLabel}>Arrival Time</Text>
              <Text style={visitorDashboardStyles.approvedHeroFactValue}>
                {formatTime(visitor?.visitTime)}
              </Text>
            </View>
            <View style={[visitorDashboardStyles.approvedHeroFactCard, { width: approvedFactCardWidth }]}>
              <Text style={visitorDashboardStyles.approvedHeroFactLabel}>Assigned Office</Text>
              <Text style={visitorDashboardStyles.approvedHeroFactValue}>
                {visitor?.appointmentDepartment || visitor?.assignedOffice || visitor?.host || "Front Office"}
              </Text>
            </View>
          </View>
          </LinearGradient>
        </View>
      </ScrollReveal>

      <ScrollReveal
        scrollY={dashboardScrollY}
        viewportHeight={viewportHeight}
        delay={100}
      >
        <View style={[visitorDashboardStyles.approvedActionSection, dashboardSectionResponsiveStyle]}>
          <View
            style={[
              visitorDashboardStyles.approvedSectionHeader,
              approvedSectionHeaderResponsiveStyle,
            ]}
          >
            <Text style={visitorDashboardStyles.approvedSectionTitle}>Quick Actions</Text>
            <Text style={visitorDashboardStyles.approvedSectionSubtitle}>
              Keep the visit flow simple from arrival to checkout.
            </Text>
          </View>

        <View style={visitorDashboardStyles.approvedActionGrid}>
          <AnimatedPressable
            style={[
              visitorDashboardStyles.approvedVirtualNfcCard,
              { width: compactApprovedActionCardWidth },
            ]}
            onPress={() => setShowVirtualNfcModal(true)}
            activeOpacity={0.9}
            disabled={isVirtualTapLoading}
          >
            <LinearGradient
              colors={["#0F172A", "#041E42", "#0A3D91"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={visitorDashboardStyles.approvedVirtualNfcCardGradient}
            >
              <View style={visitorDashboardStyles.approvedVirtualNfcHeader}>
                <View style={visitorDashboardStyles.approvedVirtualNfcCopy}>
                  <View style={visitorDashboardStyles.approvedVirtualNfcBadge}>
                    <Ionicons name="radio" size={14} color="#EEF5FF" />
                    <Text style={visitorDashboardStyles.approvedVirtualNfcBadgeText}>
                      Virtual NFC Card
                    </Text>
                  </View>
                  <Text style={visitorDashboardStyles.approvedVirtualNfcTitle}>Access Card</Text>
                  <Text style={visitorDashboardStyles.approvedVirtualNfcSubtitle}>
                    Open your digital card for campus verification.
                  </Text>
                </View>
                <View style={visitorDashboardStyles.approvedVirtualNfcIconWrap}>
                  {isVirtualTapLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="card-outline" size={28} color="#FFFFFF" />
                  )}
                </View>
              </View>

              <View style={visitorDashboardStyles.approvedVirtualNfcCardNumberRow}>
                <Text style={visitorDashboardStyles.approvedVirtualNfcCardLabel}>
                  {visitorVirtualNfcToken ? "Virtual Card ID" : "SafePass ID"}
                </Text>
                <Text style={visitorDashboardStyles.approvedVirtualNfcCardNumber}>
                  {visitorVirtualNfcToken || visitorSafePassId}
                </Text>
              </View>
            </LinearGradient>
          </AnimatedPressable>

          <View style={visitorDashboardStyles.approvedCompactActionsColumn}>
            <AnimatedPressable
              style={[
                visitorDashboardStyles.approvedCompactActionCard,
                { width: compactApprovedActionCardWidth },
                !isAppointmentManageable(visitor) && visitorDashboardStyles.appointmentManageButtonDisabled,
              ]}
              onPress={() => openEditAppointmentModal(visitor)}
              activeOpacity={0.9}
              disabled={!isAppointmentManageable(visitor) || isUpdatingAppointment}
            >
              <View style={[visitorDashboardStyles.approvedCompactActionIcon, { backgroundColor: "#EAF3FF" }]}>
                <Ionicons name="calendar-outline" size={18} color="#0A3D91" />
              </View>
              <View style={visitorDashboardStyles.approvedCompactActionCopy}>
                <Text style={visitorDashboardStyles.approvedCompactActionTitle}>Request Change</Text>
                <Text style={visitorDashboardStyles.approvedCompactActionText}>
                  Move the date or time.
                </Text>
              </View>
            </AnimatedPressable>

            <AnimatedPressable
              style={[visitorDashboardStyles.approvedCompactActionCard, { width: compactApprovedActionCardWidth }]}
              activeOpacity={1}
            >
              <View style={[visitorDashboardStyles.approvedCompactActionIcon, { backgroundColor: "#DCFCE7" }]}>
                <Ionicons name="radio-outline" size={18} color="#166534" />
              </View>
              <View style={visitorDashboardStyles.approvedCompactActionCopy}>
                <Text style={visitorDashboardStyles.approvedCompactActionTitle}>Tap At Lobby</Text>
                <Text style={visitorDashboardStyles.approvedCompactActionText}>
                  Use your phone or assigned card at the reader.
                </Text>
              </View>
            </AnimatedPressable>

            <AnimatedPressable
              style={[visitorDashboardStyles.approvedCompactActionCard, { width: compactApprovedActionCardWidth }]}
              activeOpacity={1}
            >
              <View style={[visitorDashboardStyles.approvedCompactActionIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="log-out-outline" size={18} color="#B91C1C" />
              </View>
              <View style={visitorDashboardStyles.approvedCompactActionCopy}>
                <Text style={visitorDashboardStyles.approvedCompactActionTitle}>Exit By Reader</Text>
                <Text style={visitorDashboardStyles.approvedCompactActionText}>
                  Tap again when leaving campus.
                </Text>
              </View>
            </AnimatedPressable>
          </View>
          </View>
        </View>
      </ScrollReveal>

      <ScrollReveal
        scrollY={dashboardScrollY}
        viewportHeight={viewportHeight}
        delay={160}
      >
        <View style={[visitorDashboardStyles.approvedTimelineSection, dashboardSectionResponsiveStyle]}>
          <View
            style={[
              visitorDashboardStyles.approvedSectionHeader,
              approvedSectionHeaderResponsiveStyle,
            ]}
          >
            <Text style={visitorDashboardStyles.approvedSectionTitle}>Visit Details</Text>
            <Text style={visitorDashboardStyles.approvedSectionSubtitle}>
              The key information for today’s visit.
            </Text>
          </View>

        <View style={visitorDashboardStyles.approvedSnapshotGrid}>
          <View style={visitorDashboardStyles.approvedSnapshotCard}>
            <Text style={visitorDashboardStyles.approvedSnapshotLabel}>Purpose</Text>
            <Text style={visitorDashboardStyles.approvedSnapshotValue}>
              {visitor?.purposeOfVisit || "Campus visit"}
            </Text>
          </View>
          <View style={visitorDashboardStyles.approvedSnapshotCard}>
            <Text style={visitorDashboardStyles.approvedSnapshotLabel}>ID Presented</Text>
            <Text style={visitorDashboardStyles.approvedSnapshotValue}>
              {visitorPresentedIdLabel}
            </Text>
          </View>
          <View style={visitorDashboardStyles.approvedSnapshotCard}>
            <Text style={visitorDashboardStyles.approvedSnapshotLabel}>Connectivity</Text>
            <Text style={visitorDashboardStyles.approvedSnapshotValue}>Wi-Fi or data on</Text>
          </View>
          </View>
        </View>
      </ScrollReveal>

      {renderRecentAppointmentRail()}
    </>
  );

  const renderActiveVisitorPanel = () => {
    if (selectedVisitorSection === "home") {
      return (
        <Animated.View style={dashboardContentAnimatedStyle}>
          {visitor ? (
            isPendingApproval ? (
              <>
                <View
                  style={[
                    visitorDashboardStyles.pendingApprovalCard,
                    dashboardSectionResponsiveStyle,
                    dashboardHeroCardResponsiveStyle,
                  ]}
                >
                  <Text style={visitorDashboardStyles.pendingApprovalEyebrow}>Visitor Pass</Text>
                  <Text style={visitorDashboardStyles.pendingApprovalTitle}>{journeyTitle}</Text>
                  <Text style={visitorDashboardStyles.pendingApprovalSubtitle}>{journeySubtitle}</Text>
                  <View style={[visitorDashboardStyles.pendingApprovalBadge, { backgroundColor: `${statusColor}16` }]}>
                    <View style={[visitorDashboardStyles.pendingApprovalBadgeDot, { backgroundColor: statusColor }]} />
                    <Text style={[visitorDashboardStyles.pendingApprovalBadgeText, { color: statusColor }]}>
                      {statusText}
                    </Text>
                  </View>
                  <View style={visitorDashboardStyles.pendingApprovalGrid}>
                    <View style={visitorDashboardStyles.pendingApprovalInfoCard}>
                      <Ionicons name="calendar-clear-outline" size={18} color="#0A3D91" />
                      <Text style={visitorDashboardStyles.pendingApprovalInfoLabel}>Visit Date</Text>
                      <Text style={visitorDashboardStyles.pendingApprovalInfoValue}>
                        {visitor?.visitDate ? formatDate(visitor.visitDate) : "Pending"}
                      </Text>
                    </View>
                    <View style={visitorDashboardStyles.pendingApprovalInfoCard}>
                      <Ionicons name="time-outline" size={18} color="#0A3D91" />
                      <Text style={visitorDashboardStyles.pendingApprovalInfoLabel}>Visit Time</Text>
                      <Text style={visitorDashboardStyles.pendingApprovalInfoValue}>
                        {visitor?.visitTime ? formatTime(visitor.visitTime) : "Pending"}
                      </Text>
                    </View>
                    <View style={visitorDashboardStyles.pendingApprovalInfoCard}>
                      <Ionicons name="document-text-outline" size={18} color="#0A3D91" />
                      <Text style={visitorDashboardStyles.pendingApprovalInfoLabel}>Purpose</Text>
                      <Text style={visitorDashboardStyles.pendingApprovalInfoValue}>
                        {visitor?.purposeOfVisit || "Pending"}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={visitorDashboardStyles.pendingApprovalPrimaryButton}
                    onPress={openAppointmentRequestScreen}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
                    <Text style={visitorDashboardStyles.pendingApprovalPrimaryButtonText}>
                      Register Appointment
                    </Text>
                  </TouchableOpacity>
                </View>
                {renderAppointmentInsightsCard()}
              </>
            ) : isApprovedVisitor ? (
              renderApprovedVisitorDashboard()
            ) : (
              <>
                {renderAppointmentInsightsCard()}
                {renderRecentAppointmentRail()}
                {renderVisitorEmptyState()}
              </>
            )
          ) : (
            <>
              {renderAppointmentInsightsCard()}
              {renderVisitorEmptyState()}
            </>
          )}
        </Animated.View>
      );
    }

    return (
      <Animated.View style={dashboardContentAnimatedStyle}>
        {selectedVisitorSection === "appointment" ? (
          isAppointmentScreenTransitioning ? renderAppointmentNavigationSplash() : (
            selectedAppointmentScreen === "request"
              ? renderAppointmentRequestPanel()
              : selectedAppointmentScreen === "history"
                ? renderAppointmentHistoryPanel()
                : renderAppointmentMenuPanel()
          )
        ) : selectedVisitorSection === "map" ? (
          renderVisitorMapPanel()
        ) : (
          renderAccountPanel()
        )}
      </Animated.View>
    );
  };

  const renderAppointmentNavigationSplash = () => (
    <View style={[visitorDashboardStyles.appointmentScreenShell, dashboardSectionResponsiveStyle]}>
      <View style={[visitorDashboardStyles.appointmentLoadingCard, isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard]}>
        <View style={visitorDashboardStyles.appointmentLoadingIconWrap}>
          <ActivityIndicator size="small" color="#0A3D91" />
        </View>
        <Text style={[visitorDashboardStyles.appointmentLoadingTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Preparing Appointment Module</Text>
        <Text style={[visitorDashboardStyles.appointmentLoadingText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>{appointmentTransitionLabel}</Text>
      </View>
    </View>
  );

  const renderAppointmentMenuPanel = () => (
    <View style={[visitorDashboardStyles.appointmentScreenShell, dashboardSectionResponsiveStyle]}>
      <View style={[visitorDashboardStyles.appointmentMenuHero, isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard]}>
        <View style={visitorDashboardStyles.appointmentMenuHeroTop}>
          <View style={visitorDashboardStyles.appointmentMenuHeroCopy}>
            <Text style={visitorDashboardStyles.visitorFlowPanelEyebrow}>Appointment Module</Text>
            <Text style={[visitorDashboardStyles.visitorFlowPanelTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Manage Your Visit</Text>
            <Text style={[visitorDashboardStyles.visitorFlowPanelSubtitle, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
              Use a cleaner flow for new requests and keep your latest appointment progress in one place.
            </Text>
          </View>
          <View style={visitorDashboardStyles.appointmentMenuHeroBadge}>
            <Text style={visitorDashboardStyles.appointmentMenuHeroBadgeText}>
              {currentAppointmentEntry ? "Current" : "Ready"}
            </Text>
          </View>
        </View>
        {renderAppointmentSegmentBar("menu")}
      </View>

      {renderCurrentAppointmentCard()}

      <View style={visitorDashboardStyles.appointmentMenuGrid}>
        <TouchableOpacity
          style={[visitorDashboardStyles.appointmentMenuCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}
          activeOpacity={0.9}
          onPress={openAppointmentRequestScreen}
        >
          <View style={visitorDashboardStyles.appointmentMenuCardIcon}>
            <Ionicons name="create-outline" size={22} color="#0A3D91" />
          </View>
          <View style={visitorDashboardStyles.appointmentMenuCardChip}>
            <Text style={visitorDashboardStyles.appointmentMenuCardChipText}>Start here</Text>
          </View>
          <Text style={[visitorDashboardStyles.appointmentMenuCardTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Appointment Request</Text>
          <Text style={[visitorDashboardStyles.appointmentMenuCardText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            Open the full appointment form and submit a new campus visit request.
          </Text>
          <View style={visitorDashboardStyles.appointmentMenuCardFooter}>
            <Text style={[visitorDashboardStyles.appointmentMenuCardFooterText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>Purpose, office, date, time</Text>
            <Ionicons name="arrow-forward-outline" size={18} color="#0A3D91" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[visitorDashboardStyles.appointmentMenuCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}
          activeOpacity={0.9}
          onPress={() =>
            handleAppointmentScreenNavigation("history", "Loading appointment history...")
          }
        >
          <View style={visitorDashboardStyles.appointmentMenuCardIcon}>
            <Ionicons name="time-outline" size={22} color="#0A3D91" />
          </View>
          <View
            style={[
              visitorDashboardStyles.appointmentMenuCardChip,
              visitorDashboardStyles.appointmentMenuCardChipMuted,
            ]}
          >
            <Text style={visitorDashboardStyles.appointmentMenuCardChipText}>
              Latest trail
            </Text>
          </View>
          <Text style={[visitorDashboardStyles.appointmentMenuCardTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Appointment History</Text>
          <Text style={[visitorDashboardStyles.appointmentMenuCardText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            Review older appointment records. History is read-only and cannot be edited or deleted.
          </Text>
          <View style={visitorDashboardStyles.appointmentMenuCardFooter}>
            <Text style={[visitorDashboardStyles.appointmentMenuCardFooterText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>Older records only</Text>
            <Ionicons name="arrow-forward-outline" size={18} color="#0A3D91" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAppointmentRequestPanel = () => (
    <View style={[visitorDashboardStyles.appointmentScreenShell, dashboardSectionResponsiveStyle]}>
      <View style={[visitorDashboardStyles.appointmentScreenCard, isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard]}>
        <LinearGradient
          colors={isVisitorDarkMode ? ["#0F172A", "#111C2E"] : ["#EAF3FF", "#FFFFFF"]}
          style={visitorDashboardStyles.appointmentModalHeader}
        >
          <View style={visitorDashboardStyles.appointmentModalHeaderContent}>
            <View style={visitorDashboardStyles.appointmentModalHeaderCopy}>
              <Text style={[visitorDashboardStyles.appointmentModalTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Appointment Request</Text>
              <Text style={[visitorDashboardStyles.appointmentModalSubtitle, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                Choose a schedule, office, and ID for staff review.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={closeAppointmentRequestScreen}
            style={visitorDashboardStyles.appointmentHeaderBackButton}
          >
            <Ionicons name="arrow-back-outline" size={20} color={isVisitorDarkMode ? "#F8FAFC" : "#0F172A"} />
          </TouchableOpacity>
        </LinearGradient>

        <View style={visitorDashboardStyles.appointmentInlineBody}>
          {renderAppointmentSegmentBar("request")}

          {appointmentFeedback ? (
            <View style={[visitorDashboardStyles.appointmentSuccessCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
              <View style={visitorDashboardStyles.appointmentSuccessHeader}>
                <View style={visitorDashboardStyles.appointmentSuccessIconWrap}>
                  <Ionicons name="checkmark-circle" size={22} color="#0A3D91" />
                </View>
                <View style={visitorDashboardStyles.appointmentSuccessTextWrap}>
                  <Text style={[visitorDashboardStyles.appointmentSuccessTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                    {appointmentFeedback.title}
                  </Text>
                  <Text style={[visitorDashboardStyles.appointmentSuccessText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                    {appointmentFeedback.message}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={visitorDashboardStyles.appointmentQuickInfoRow}>
            <View style={[visitorDashboardStyles.appointmentQuickInfoCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
              <Ionicons name="calendar-clear-outline" size={17} color="#0A3D91" />
              <Text style={[visitorDashboardStyles.appointmentQuickInfoLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Availability</Text>
              <Text style={[visitorDashboardStyles.appointmentQuickInfoValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Per time slot</Text>
            </View>
            <View style={[visitorDashboardStyles.appointmentQuickInfoCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
              <Ionicons name="briefcase-outline" size={17} color="#0A3D91" />
              <Text style={[visitorDashboardStyles.appointmentQuickInfoLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Days</Text>
              <Text style={[visitorDashboardStyles.appointmentQuickInfoValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Mon - Sat</Text>
            </View>
            <View style={[visitorDashboardStyles.appointmentQuickInfoCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
              <Ionicons name="shield-checkmark-outline" size={17} color="#0A3D91" />
              <Text style={[visitorDashboardStyles.appointmentQuickInfoLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Review</Text>
              <Text style={[visitorDashboardStyles.appointmentQuickInfoValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Staff approval</Text>
            </View>
          </View>

          <View style={[visitorDashboardStyles.appointmentStepStrip, isVisitorDarkMode && visitorDashboardStyles.darkInsetCard]}>
            {[
              ["Schedule", "Date and time"],
              ["Office", "Destination"],
              ["ID", "Present at gate"],
            ].map(([title, text], index) => (
              <View key={title} style={[visitorDashboardStyles.appointmentStepPill, isVisitorDarkMode && visitorDashboardStyles.darkReadablePill]}>
                <View style={visitorDashboardStyles.appointmentStepNumber}>
                  <Text style={visitorDashboardStyles.appointmentStepNumberText}>{index + 1}</Text>
                </View>
                <View style={visitorDashboardStyles.appointmentStepCopy}>
                  <Text style={[visitorDashboardStyles.appointmentStepTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>{title}</Text>
                  <Text style={[visitorDashboardStyles.appointmentStepText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>{text}</Text>
                </View>
              </View>
            ))}
          </View>

          {Platform.OS === "web" ? (
            renderWebAppointmentDateTimePicker()
          ) : isCompactVisitorDashboard ? (
            renderMobileAppointmentSlotPicker()
          ) : (
            <View style={appointmentFormRowResponsiveStyle}>
              <View style={[visitorDashboardStyles.appointmentField, appointmentFormColumnResponsiveStyle]}>
                <Text style={[visitorDashboardStyles.appointmentFieldLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Preferred Date</Text>
                <TouchableOpacity
                  style={[visitorDashboardStyles.appointmentPickerField, isVisitorDarkMode && visitorDashboardStyles.darkFormControl]}
                  onPress={handleAppointmentDatePress}
                  activeOpacity={0.85}
                >
                  <View style={visitorDashboardStyles.appointmentPickerFieldLeft}>
                    <View style={visitorDashboardStyles.appointmentPickerIconWrap}>
                      <Ionicons name="calendar-outline" size={18} color="#0A3D91" />
                    </View>
                    <View>
                      <Text style={[visitorDashboardStyles.appointmentPickerLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Choose a date</Text>
                      <Text style={[visitorDashboardStyles.appointmentPickerValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                        {formatAppointmentPickerDate(appointmentForm.preferredDate)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={Platform.OS === "web" ? "calendar-clear-outline" : showAppointmentDatePicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#94A3B8"
                  />
                </TouchableOpacity>

                {Platform.OS === "web" ? (
                  <input
                    ref={appointmentWebDateInputRef}
                    type="date"
                    value={getAppointmentWebDateValue()}
                    min={getAppointmentMinDateValue()}
                    onChange={handleAppointmentWebDateChange}
                    style={{
                      position: "absolute",
                      width: 1,
                      height: 1,
                      opacity: 0,
                      pointerEvents: "none",
                    }}
                    aria-label="Preferred appointment date"
                  />
                ) : null}

                {Platform.OS !== "web" && showAppointmentDatePicker && DateTimePickerComponent ? (
                  <DateTimePickerComponent
                    value={getValidDate(appointmentForm.preferredDate) || getDefaultAppointmentDate()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={handleAppointmentDateChange}
                    minimumDate={getNextAvailableAppointmentDate(new Date())}
                  />
                ) : null}
              </View>

              <View style={[visitorDashboardStyles.appointmentField, appointmentFormColumnResponsiveStyle]}>
                <Text style={[visitorDashboardStyles.appointmentFieldLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Preferred Time</Text>
                <TouchableOpacity
                  style={[visitorDashboardStyles.appointmentPickerField, isVisitorDarkMode && visitorDashboardStyles.darkFormControl]}
                  onPress={() => {
                    const shouldOpenTimePicker = !showAppointmentTimePicker;
                    closeAppointmentPopovers();
                    setShowAppointmentTimePicker(shouldOpenTimePicker);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={visitorDashboardStyles.appointmentPickerFieldLeft}>
                    <View style={visitorDashboardStyles.appointmentPickerIconWrap}>
                      <Ionicons name="time-outline" size={18} color="#0A3D91" />
                    </View>
                    <View>
                      <Text style={[visitorDashboardStyles.appointmentPickerLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Choose a time</Text>
                      <Text style={[visitorDashboardStyles.appointmentPickerValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                        {appointmentForm.preferredTime ? formatTime(appointmentForm.preferredTime) : "Select preferred time"}
                      </Text>
                      {appointmentForm.preferredTime ? (
                        <Text
                          style={[
                            visitorDashboardStyles.appointmentPickerSubValue,
                            isAppointmentTimeSlotFull(appointmentForm.preferredTime) &&
                              visitorDashboardStyles.appointmentPickerSubValueError,
                          ]}
                        >
                          {getAppointmentSlotStatusText(appointmentForm.preferredTime)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons
                    name={showAppointmentTimePicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#94A3B8"
                  />
                </TouchableOpacity>

                {showAppointmentTimePicker ? (
                  <View style={[visitorDashboardStyles.pickerDropdownMenu, isVisitorDarkMode && visitorDashboardStyles.darkDropdownMenu]}>
                    <ScrollView
                      style={visitorDashboardStyles.pickerDropdownScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {appointmentTimeOptions.map((option) => {
                        const isSelected = isSameAppointmentTime(appointmentForm.preferredTime, option);
                        const isFull = isAppointmentTimeSlotFull(option);
                        const isPassed = isAppointmentTimeSlotPassed(option);
                        const isUnavailable = isFull || isPassed;
                        return (
                          <TouchableOpacity
                            key={`${option.getHours()}-${option.getMinutes()}`}
                            style={[
                              visitorDashboardStyles.pickerOptionItem,
                              isVisitorDarkMode && visitorDashboardStyles.darkOptionItem,
                              isSelected && visitorDashboardStyles.pickerOptionItemActive,
                              isUnavailable && visitorDashboardStyles.pickerOptionItemDisabled,
                            ]}
                            disabled={isUnavailable}
                            onPress={() => {
                              setHasAppointmentDraft(true);
                              setAppointmentForm((prev) => ({ ...prev, preferredTime: option }));
                              setShowAppointmentTimePicker(false);
                            }}
                          >
                            <View>
                              <Text
                                style={[
                                  visitorDashboardStyles.pickerOptionText,
                                  isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText,
                                  isSelected && visitorDashboardStyles.pickerOptionTextActive,
                                  isUnavailable && visitorDashboardStyles.pickerOptionTextDisabled,
                                ]}
                              >
                                {formatTime(option)}
                              </Text>
                              <Text
                                style={[
                                 visitorDashboardStyles.pickerOptionMeta,
                                  isVisitorDarkMode && visitorDashboardStyles.darkMutedText,
                                  isUnavailable && visitorDashboardStyles.pickerOptionMetaFull,
                                ]}
                              >
                                {getAppointmentSlotStatusText(option)}
                              </Text>
                            </View>
                            {isSelected ? (
                              <Ionicons name="checkmark-circle" size={18} color="#0A3D91" />
                            ) : isUnavailable ? (
                              <Ionicons name="lock-closed-outline" size={18} color="#DC2626" />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                <Text
                  style={[
                    visitorDashboardStyles.appointmentAutoHint,
                    isVisitorDarkMode && visitorDashboardStyles.darkMutedText,
                    isAppointmentTimeSlotFull(appointmentForm.preferredTime) &&
                      visitorDashboardStyles.appointmentAutoHintError,
                  ]}
                >
                  {isAppointmentTimeSlotFull(appointmentForm.preferredTime)
                    ? "Slots are full please select another time or date."
                    : isLoadingAppointmentSlots
                      ? "Checking staff slot availability..."
                      : appointmentAvailability?.assignedStaff
                        ? `Slots are limited by the selected time for ${appointmentAvailability.assignedStaff.name}.`
                        : "Choose office(s) first so we can check available staff slots."}
                </Text>
              </View>
            </View>
          )}

          <View style={appointmentFormRowResponsiveStyle}>
          <View style={[visitorDashboardStyles.appointmentField, appointmentFormColumnResponsiveStyle]}>
            <Text style={[visitorDashboardStyles.appointmentFieldLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Staff to Visit</Text>
            <TouchableOpacity
              style={[visitorDashboardStyles.appointmentPickerField, isVisitorDarkMode && visitorDashboardStyles.darkFormControl]}
              onPress={() => {
                const shouldOpenDepartmentDropdown = !showDepartmentDropdown;
                closeAppointmentPopovers();
                setShowDepartmentDropdown(shouldOpenDepartmentDropdown);
                if (shouldOpenDepartmentDropdown) loadManagedAppointmentOptions();
              }}
              activeOpacity={0.85}
            >
              <View style={visitorDashboardStyles.appointmentPickerFieldLeft}>
                <View style={visitorDashboardStyles.appointmentPickerIconWrap}>
                  <Ionicons name="business-outline" size={18} color="#0A3D91" />
                </View>
                <View>
                  <Text style={[visitorDashboardStyles.appointmentPickerLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Choose a staff member</Text>
                  <Text style={[visitorDashboardStyles.appointmentPickerValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                    {getSelectedAppointmentDepartmentsLabel()}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={showDepartmentDropdown ? "chevron-up" : "chevron-down"}
                size={18}
                color="#94A3B8"
              />
            </TouchableOpacity>

            {showDepartmentDropdown ? (
              <View style={[visitorDashboardStyles.purposeDropdownMenu, isVisitorDarkMode && visitorDashboardStyles.darkDropdownMenu]}>
                {!activeAppointmentStaffOptions.length && <TouchableOpacity onPress={loadManagedAppointmentOptions} style={{ padding: 16 }}><Text>{staffDirectoryError || "No active staff available. Tap to refresh."}</Text></TouchableOpacity>}
                {activeAppointmentStaffOptions.map((option) => {
                  const isSelected = appointmentForm.staffAssignments?.[option.department] === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        visitorDashboardStyles.purposeOptionItem,
                        isVisitorDarkMode && visitorDashboardStyles.darkOptionItem,
                        isSelected && visitorDashboardStyles.purposeOptionItemActive,
                      ]}
                      onPress={() => {
                        toggleAppointmentDepartment(option);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={visitorDashboardStyles.checkboxOptionLeft}>
                        <View
                          style={[
                            visitorDashboardStyles.appointmentCheckboxBox,
                            isSelected && visitorDashboardStyles.appointmentCheckboxBoxChecked,
                          ]}
                        >
                          {isSelected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                        </View>
                        <Text
                          style={[
                            visitorDashboardStyles.purposeOptionText,
                            isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText,
                            isSelected && visitorDashboardStyles.purposeOptionTextActive,
                          ]}
                        >
                          {option.name} — {option.department}{option.position ? ` (${option.position})` : ""}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <Text style={[visitorDashboardStyles.appointmentAutoHint, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
              Choose one active staff member per office. Each request goes to the person you select.
            </Text>
          </View>

          <View style={[visitorDashboardStyles.appointmentField, appointmentFormColumnResponsiveStyle]}>
            <Text style={[visitorDashboardStyles.appointmentFieldLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Purpose Of Visit</Text>
            <TouchableOpacity
              style={[visitorDashboardStyles.appointmentPickerField, isVisitorDarkMode && visitorDashboardStyles.darkFormControl]}
              onPress={() => {
                const shouldOpenPurposeDropdown = !showPurposeDropdown;
                closeAppointmentPopovers();
                setShowPurposeDropdown(shouldOpenPurposeDropdown);
              }}
              activeOpacity={0.85}
            >
              <View style={visitorDashboardStyles.appointmentPickerFieldLeft}>
                <View style={visitorDashboardStyles.appointmentPickerIconWrap}>
                  <Ionicons name="list-outline" size={18} color="#0A3D91" />
                </View>
                <View>
                  <Text style={[visitorDashboardStyles.appointmentPickerLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Choose a purpose</Text>
                  <Text style={[visitorDashboardStyles.appointmentPickerValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                    {appointmentForm.purposeSelection || "Select purpose of visit"}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={showPurposeDropdown ? "chevron-up" : "chevron-down"}
                size={18}
                color="#94A3B8"
              />
            </TouchableOpacity>

            {showPurposeDropdown ? (
              <View style={[visitorDashboardStyles.purposeDropdownMenu, isVisitorDarkMode && visitorDashboardStyles.darkDropdownMenu]}>
                {activeAppointmentPurposeOptions.map((option) => {
                  const isSelected = appointmentForm.purposeSelection === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[
                        visitorDashboardStyles.purposeOptionItem,
                        isVisitorDarkMode && visitorDashboardStyles.darkOptionItem,
                        isSelected && visitorDashboardStyles.purposeOptionItemActive,
                      ]}
                      onPress={() => {
                        setHasAppointmentDraft(true);
                        setAppointmentForm((prev) => ({
                          ...prev,
                          purposeSelection: option,
                          customPurpose: option === "Other" ? prev.customPurpose : "",
                        }));
                        setShowPurposeDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          visitorDashboardStyles.purposeOptionText,
                          isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText,
                          isSelected && visitorDashboardStyles.purposeOptionTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={18} color="#0A3D91" />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {appointmentForm.purposeSelection === "Other" ? (
              <TextInput
                style={[visitorDashboardStyles.appointmentFieldInput, visitorDashboardStyles.appointmentFieldTextarea, isVisitorDarkMode && visitorDashboardStyles.darkFormControl, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}
                placeholder="Type your purpose of visit"
                placeholderTextColor="#94A3B8"
                value={appointmentForm.customPurpose}
                onChangeText={(text) => {
                  setHasAppointmentDraft(true);
                  setAppointmentForm((prev) => ({ ...prev, customPurpose: text }));
                }}
                multiline
                textAlignVertical="top"
              />
            ) : null}
          </View>
          </View>

          <View style={appointmentFormRowResponsiveStyle}>
          <View style={[visitorDashboardStyles.appointmentField, appointmentFormColumnResponsiveStyle]}>
            <Text style={[visitorDashboardStyles.appointmentFieldLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Valid ID To Present</Text>
            <TouchableOpacity
              style={[visitorDashboardStyles.appointmentPickerField, isVisitorDarkMode && visitorDashboardStyles.darkFormControl]}
              onPress={() => {
                const shouldOpenIdTypeDropdown = !showIdTypeDropdown;
                closeAppointmentPopovers();
                setShowIdTypeDropdown(shouldOpenIdTypeDropdown);
              }}
              activeOpacity={0.85}
            >
              <View style={visitorDashboardStyles.appointmentPickerFieldLeft}>
                <View style={visitorDashboardStyles.appointmentPickerIconWrap}>
                  <Ionicons name="card-outline" size={18} color="#0A3D91" />
                </View>
                <View>
                  <Text style={[visitorDashboardStyles.appointmentPickerLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Choose your ID type</Text>
                  <Text style={[visitorDashboardStyles.appointmentPickerValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                    {appointmentForm.idType || "Select the ID you will use"}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={showIdTypeDropdown ? "chevron-up" : "chevron-down"}
                size={18}
                color="#94A3B8"
              />
            </TouchableOpacity>

            {showIdTypeDropdown ? (
              <View style={[visitorDashboardStyles.purposeDropdownMenu, isVisitorDarkMode && visitorDashboardStyles.darkDropdownMenu]}>
                {APPOINTMENT_ID_TYPE_OPTIONS.map((option) => {
                  const isSelected = appointmentForm.idType === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[
                        visitorDashboardStyles.purposeOptionItem,
                        isVisitorDarkMode && visitorDashboardStyles.darkOptionItem,
                        isSelected && visitorDashboardStyles.purposeOptionItemActive,
                      ]}
                      onPress={() => {
                        setHasAppointmentDraft(true);
                        appointmentIdRevisionRef.current += 1;
                        setIsVerifyingAppointmentId(false);
                        setAppointmentForm((prev) => ({
                          ...prev,
                          idType: option,
                          idImage: null,
                          backIdImage: null,
                          idVerification: null,
                          verificationProof: null,
                        }));
                        setShowIdTypeDropdown(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          visitorDashboardStyles.purposeOptionText,
                          isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText,
                          isSelected && visitorDashboardStyles.purposeOptionTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={18} color="#0A3D91" />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <Text style={[visitorDashboardStyles.appointmentAutoHint, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
              Select the physical ID you will bring. Security will compare it with your approved appointment before allowing entry.
            </Text>
          </View>

          <View style={[visitorDashboardStyles.appointmentField, appointmentFormColumnResponsiveStyle]}>
            <Text style={[visitorDashboardStyles.appointmentFieldLabel, isVisitorDarkMode && visitorDashboardStyles.darkKickerText]}>Identity Verification</Text>
            <View style={[visitorDashboardStyles.appointmentIdUploadCard, isVisitorDarkMode && visitorDashboardStyles.darkUploadCard]}>
              <View style={visitorDashboardStyles.appointmentIdPlaceholder}>
                <Ionicons name="shield-checkmark-outline" size={28} color="#0A3D91" />
                <Text style={[visitorDashboardStyles.appointmentIdPlaceholderTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                  {appointmentForm.idVerification?.verificationStatus === "precheck_passed"
                    ? "ID pre-check passed"
                    : appointmentForm.idVerification?.verificationStatus === "needs_review"
                    ? "ID requires manual review"
                    : appointmentForm.idVerification?.verificationStatus === "rejected"
                    ? "ID could not be verified"
                    : isVerifyingAppointmentId ? "Checking your ID..." : "Optional ID pre-check"}
                </Text>
                <Text style={[visitorDashboardStyles.appointmentIdPlaceholderText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                  {appointmentForm.idVerification?.message || "Take a photo or choose one from your gallery. You can also bring your selected ID to the gate for manual review."}
                </Text>
                {isVerifyingAppointmentId ? <ActivityIndicator color="#0A3D91" /> : null}
                <TouchableOpacity style={visitorDashboardStyles.appointmentChangeIdButton} accessibilityRole="button" onPress={() => selectAppointmentIdImage("camera", "front")} disabled={isVerifyingAppointmentId}>
                  <Text style={visitorDashboardStyles.appointmentChangeIdText}>Take Photo (Front)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={visitorDashboardStyles.appointmentChangeIdButton} accessibilityRole="button" onPress={() => selectAppointmentIdImage("gallery", "front")} disabled={isVerifyingAppointmentId}>
                  <Text style={visitorDashboardStyles.appointmentChangeIdText}>{appointmentForm.idImage ? "Replace Front From Gallery" : "Choose From Gallery"}</Text>
                </TouchableOpacity>
                {appointmentForm.idImage ? (
                  <>
                    <TouchableOpacity style={visitorDashboardStyles.appointmentChangeIdButton} accessibilityRole="button" onPress={() => selectAppointmentIdImage("camera", "back")} disabled={isVerifyingAppointmentId}>
                      <Text style={visitorDashboardStyles.appointmentChangeIdText}>Take Photo (Back, Optional)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={visitorDashboardStyles.appointmentChangeIdButton} accessibilityRole="button" onPress={() => selectAppointmentIdImage("gallery", "back")} disabled={isVerifyingAppointmentId}>
                      <Text style={visitorDashboardStyles.appointmentChangeIdText}>{appointmentForm.backIdImage ? "Replace Back From Gallery" : "Choose Back From Gallery (Optional)"}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                {appointmentForm.idImage && !isVerifyingAppointmentId ? (
                  <TouchableOpacity style={visitorDashboardStyles.appointmentChangeIdButton} accessibilityRole="button" onPress={handleVerifyAppointmentIdAgain}>
                    <Text style={visitorDashboardStyles.appointmentChangeIdText}>Retry ID pre-check</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <Text style={[visitorDashboardStyles.appointmentAutoHint, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
              Present physical ID at gate. Upload is optional; bring the selected ID to campus for security to check. Your ID photo is not sent with the appointment request.
            </Text>
          </View>
          </View>

          <TouchableOpacity
            style={[
              visitorDashboardStyles.appointmentPrivacyCard,
              appointmentForm.privacyAccepted &&
                visitorDashboardStyles.appointmentPrivacyCardAccepted,
            ]}
            onPress={() => {
              setHasAppointmentDraft(true);
              setAppointmentForm((prev) => ({
                ...prev,
                privacyAccepted: !prev.privacyAccepted,
              }));
            }}
            activeOpacity={0.85}
          >
            <View
              style={[
                visitorDashboardStyles.appointmentPrivacyCheckbox,
                appointmentForm.privacyAccepted &&
                  visitorDashboardStyles.appointmentPrivacyCheckboxChecked,
              ]}
            >
              {appointmentForm.privacyAccepted ? (
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              ) : null}
            </View>
            <Text style={visitorDashboardStyles.appointmentPrivacyText}>
              I confirm that my appointment information is accurate and I will present the selected valid ID for campus entry verification.
            </Text>
          </TouchableOpacity>

          <View style={visitorDashboardStyles.appointmentModalFooter}>
            <TouchableOpacity
              style={visitorDashboardStyles.appointmentSecondaryButton}
              onPress={closeAppointmentRequestScreen}
              disabled={isSubmittingAppointment}
            >
              <Text style={visitorDashboardStyles.appointmentSecondaryButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={visitorDashboardStyles.appointmentPrimaryButton}
              onPress={handleRequestAppointment}
              disabled={isSubmittingAppointment}
            >
              {isSubmittingAppointment ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                  <Text style={visitorDashboardStyles.appointmentPrimaryButtonText}>Send Request</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  const renderAppointmentManageActions = (record) => {
    if (!record?._id) return null;
    const canManage = isAppointmentManageable(record);
    const normalizedAppointmentStatus = String(record?.appointmentStatus || "").toLowerCase();
    const needsVisitorConfirmation = isStaffAdjustmentPending(record);
    const editLabel = ["approved", "adjusted"].includes(normalizedAppointmentStatus)
      ? "Request Changes"
      : needsVisitorConfirmation
        ? "Choose Another"
      : "Edit";

    if (needsVisitorConfirmation) {
      return (
        <View style={visitorDashboardStyles.appointmentManageActionRow}>
          <TouchableOpacity
            style={[
              visitorDashboardStyles.appointmentManageButton,
              isVisitorDarkMode && visitorDashboardStyles.darkReadablePill,
              !canManage && visitorDashboardStyles.appointmentManageButtonDisabled,
              isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledPill,
            ]}
            activeOpacity={0.86}
            disabled={!canManage || isUpdatingAppointment}
            onPress={() => confirmStaffAdjustmentAcceptance(record)}
          >
            <Ionicons name="checkmark-circle-outline" size={15} color={canManage ? "#059669" : isVisitorDarkMode ? "#CBD5E1" : "#94A3B8"} />
            <Text
              style={[
                visitorDashboardStyles.appointmentManageButtonText,
                !canManage && visitorDashboardStyles.appointmentManageButtonTextDisabled,
                isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledText,
              ]}
            >
              Works For Me
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              visitorDashboardStyles.appointmentManageButton,
              visitorDashboardStyles.appointmentManageDangerButton,
              isVisitorDarkMode && visitorDashboardStyles.darkReadablePill,
              !canManage && visitorDashboardStyles.appointmentManageButtonDisabled,
              isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledPill,
            ]}
            activeOpacity={0.86}
            disabled={!canManage || isUpdatingAppointment}
            onPress={() => openEditAppointmentModal(record)}
          >
            <Ionicons name="close-circle-outline" size={15} color={canManage ? "#DC2626" : isVisitorDarkMode ? "#CBD5E1" : "#94A3B8"} />
            <Text
              style={[
                visitorDashboardStyles.appointmentManageButtonText,
                visitorDashboardStyles.appointmentManageDangerText,
                !canManage && visitorDashboardStyles.appointmentManageButtonTextDisabled,
                isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledText,
              ]}
            >
              Choose Another
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={visitorDashboardStyles.appointmentManageActionRow}>
        <TouchableOpacity
          style={[
            visitorDashboardStyles.appointmentManageButton,
            isVisitorDarkMode && visitorDashboardStyles.darkReadablePill,
            !canManage && visitorDashboardStyles.appointmentManageButtonDisabled,
            isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledPill,
          ]}
          activeOpacity={0.86}
          disabled={!canManage || isUpdatingAppointment}
          onPress={() => openEditAppointmentModal(record)}
        >
          <Ionicons name="create-outline" size={15} color={canManage ? "#0A3D91" : isVisitorDarkMode ? "#CBD5E1" : "#94A3B8"} />
          <Text
            style={[
              visitorDashboardStyles.appointmentManageButtonText,
              isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledText,
              !canManage && visitorDashboardStyles.appointmentManageButtonTextDisabled,
            ]}
          >
            {editLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            visitorDashboardStyles.appointmentManageButton,
            visitorDashboardStyles.appointmentManageDangerButton,
            isVisitorDarkMode && visitorDashboardStyles.darkReadablePill,
            !canManage && visitorDashboardStyles.appointmentManageButtonDisabled,
            isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledPill,
          ]}
          activeOpacity={0.86}
          disabled={!canManage || isUpdatingAppointment}
          onPress={() => openCancelAppointmentModal(record)}
        >
          <Ionicons name="close-circle-outline" size={15} color={canManage ? "#DC2626" : isVisitorDarkMode ? "#CBD5E1" : "#94A3B8"} />
          <Text
            style={[
              visitorDashboardStyles.appointmentManageButtonText,
              visitorDashboardStyles.appointmentManageDangerText,
              isVisitorDarkMode && !canManage && visitorDashboardStyles.darkDisabledText,
              !canManage && visitorDashboardStyles.appointmentManageButtonTextDisabled,
            ]}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const getEditAppointmentModalTitle = () => {
    const appointmentStatus = String(appointmentEditForm.appointment?.appointmentStatus || "").toLowerCase();
    if (["approved", "adjusted"].includes(appointmentStatus)) {
      return "Request Appointment Change";
    }
    return "Edit Appointment";
  };

  const getEditAppointmentModalSubtitle = () => {
    const appointmentStatus = String(appointmentEditForm.appointment?.appointmentStatus || "").toLowerCase();
    if (["approved", "adjusted"].includes(appointmentStatus)) {
      return "Choose a new date or time. Staff will review the updated schedule before entry.";
    }
    return "Update the date or time for staff review.";
  };

  const renderCurrentAppointmentCard = () => {
    if (!currentAppointmentEntry) {
      return (
        <View style={[visitorDashboardStyles.appointmentHistoryEmpty, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
          <Ionicons name="calendar-clear-outline" size={34} color="#94A3B8" />
          <Text style={[visitorDashboardStyles.appointmentHistoryEmptyTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>No current appointment</Text>
          <Text style={[visitorDashboardStyles.appointmentHistoryEmptyText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            Submit a new appointment request to start staff review.
          </Text>
        </View>
      );
    }

    const entry = currentAppointmentEntry;
    return (
      <View style={[visitorDashboardStyles.appointmentHistoryCardItem, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
        <View style={visitorDashboardStyles.appointmentHistoryCardTop}>
          <View style={visitorDashboardStyles.appointmentHistoryCardCopy}>
            <Text style={visitorDashboardStyles.visitorFlowPanelEyebrow}>Current / Latest Appointment</Text>
            <Text style={[visitorDashboardStyles.appointmentHistoryCardTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]} numberOfLines={2}>
              {entry.title}
            </Text>
            <Text style={[visitorDashboardStyles.appointmentHistoryCardOffice, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={2}>
              {entry.office}
            </Text>
          </View>
          <View
            style={[
              visitorDashboardStyles.appointmentHistoryCardPill,
              { backgroundColor: `${entry.statusColor}14` },
            ]}
          >
            <View style={[visitorDashboardStyles.appointmentHistoryStatusDot, { backgroundColor: entry.statusColor }]} />
            <Text
              style={[visitorDashboardStyles.appointmentHistoryCardPillText, { color: entry.statusColor }]}
              numberOfLines={1}
            >
              {entry.statusLabel}
            </Text>
          </View>
        </View>

        <View style={visitorDashboardStyles.appointmentHistoryCardMetaRow}>
          <View style={[visitorDashboardStyles.appointmentHistoryCardMetaItem, isVisitorDarkMode && visitorDashboardStyles.darkReadablePill]}>
            <Ionicons name="calendar-outline" size={15} color="#0A3D91" />
            <Text style={[visitorDashboardStyles.appointmentHistoryCardMetaText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>{entry.dateLabel}</Text>
          </View>
          <View style={[visitorDashboardStyles.appointmentHistoryCardMetaItem, isVisitorDarkMode && visitorDashboardStyles.darkReadablePill]}>
            <Ionicons name="time-outline" size={15} color="#0A3D91" />
            <Text style={[visitorDashboardStyles.appointmentHistoryCardMetaText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>{entry.timeLabel}</Text>
          </View>
        </View>

        <Text style={[visitorDashboardStyles.appointmentHistoryCardDescription, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={3}>
          {entry.description}
        </Text>
        {renderAppointmentManageActions(entry.record)}
      </View>
    );
  };

  const renderAppointmentHistoryPanel = () => (
    <View style={[visitorDashboardStyles.appointmentScreenShell, dashboardSectionResponsiveStyle]}>
      <View style={[visitorDashboardStyles.appointmentScreenCard, isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard]}>
        <View style={[visitorDashboardStyles.appointmentHistoryHeader, isVisitorDarkMode && visitorDashboardStyles.darkDividerBorder]}>
          <View style={visitorDashboardStyles.appointmentHistoryHeaderCopy}>
            <Text style={visitorDashboardStyles.visitorFlowPanelEyebrow}>Appointment Module</Text>
            <Text style={[visitorDashboardStyles.visitorFlowPanelTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Appointment Records</Text>
            <Text style={[visitorDashboardStyles.visitorFlowPanelSubtitle, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
              All submitted appointments are grouped by date. Current appointment actions stay in Overview.
            </Text>
          </View>
          <TouchableOpacity
            style={visitorDashboardStyles.appointmentHistoryAction}
            activeOpacity={0.88}
            onPress={openAppointmentRequestScreen}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
            <Text style={visitorDashboardStyles.appointmentHistoryActionText}>New Appointment</Text>
          </TouchableOpacity>
        </View>

        <View style={visitorDashboardStyles.appointmentHistoryBody}>
          {renderAppointmentSegmentBar("history")}

          <View style={visitorDashboardStyles.appointmentHistorySummaryRow}>
            {[
              ["Total", appointmentDisplayEntries.length],
              ["Pending", pendingAppointmentCount],
              ["Approved", approvedAppointmentCount],
            ].map(([label, value]) => (
              <View key={label} style={[visitorDashboardStyles.appointmentHistorySummaryCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
                <Text style={[visitorDashboardStyles.appointmentHistorySummaryValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>{value}</Text>
                <Text style={visitorDashboardStyles.appointmentHistorySummaryLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {appointmentDisplayEntries.length ? (
            isCompactHistoryLayout ? (
              <View style={visitorDashboardStyles.appointmentHistoryCards}>
                {appointmentHistoryGroups.map((group) => (
                  <View key={group.key} style={visitorDashboardStyles.appointmentHistoryDateGroup}>
                    <View style={visitorDashboardStyles.appointmentHistoryDateGroupHeader}>
                      <Ionicons name="calendar-outline" size={15} color="#0A3D91" />
                      <Text style={visitorDashboardStyles.appointmentHistoryDateGroupTitle}>{group.label}</Text>
                    </View>
                    {group.entries.map((entry) => (
                      <View key={entry.id} style={[visitorDashboardStyles.appointmentHistoryCardItem, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
                        <View style={visitorDashboardStyles.appointmentHistoryCardTop}>
                          <View style={visitorDashboardStyles.appointmentHistoryCardCopy}>
                            <Text style={[visitorDashboardStyles.appointmentHistoryCardTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]} numberOfLines={2}>
                              {entry.title}
                            </Text>
                            <Text style={[visitorDashboardStyles.appointmentHistoryCardOffice, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={2}>
                              {entry.office}
                            </Text>
                          </View>
                          <View
                            style={[
                              visitorDashboardStyles.appointmentHistoryCardPill,
                              { backgroundColor: `${entry.statusColor}14` },
                            ]}
                          >
                            <View style={[visitorDashboardStyles.appointmentHistoryStatusDot, { backgroundColor: entry.statusColor }]} />
                            <Text
                              style={[visitorDashboardStyles.appointmentHistoryCardPillText, { color: entry.statusColor }]}
                              numberOfLines={1}
                            >
                              {entry.statusLabel}
                            </Text>
                          </View>
                        </View>

                        <View style={visitorDashboardStyles.appointmentHistoryCardMetaRow}>
                          <View style={[visitorDashboardStyles.appointmentHistoryCardMetaItem, isVisitorDarkMode && visitorDashboardStyles.darkReadablePill]}>
                            <Ionicons name="calendar-outline" size={15} color="#0A3D91" />
                            <Text style={[visitorDashboardStyles.appointmentHistoryCardMetaText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                              {entry.dateLabel}
                            </Text>
                          </View>
                          <View style={[visitorDashboardStyles.appointmentHistoryCardMetaItem, isVisitorDarkMode && visitorDashboardStyles.darkReadablePill]}>
                            <Ionicons name="time-outline" size={15} color="#0A3D91" />
                            <Text style={[visitorDashboardStyles.appointmentHistoryCardMetaText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                              {entry.timeLabel}
                            </Text>
                          </View>
                        </View>

                        <Text style={[visitorDashboardStyles.appointmentHistoryCardDescription, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={3}>
                          {entry.description}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={[visitorDashboardStyles.appointmentHistoryTable, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
                <View style={[visitorDashboardStyles.appointmentHistoryTableHeader, isVisitorDarkMode && visitorDashboardStyles.darkInsetCard]}>
                  <Text style={[visitorDashboardStyles.appointmentHistoryTableHeadText, visitorDashboardStyles.appointmentHistoryPurposeCell]}>Purpose</Text>
                  <Text style={[visitorDashboardStyles.appointmentHistoryTableHeadText, visitorDashboardStyles.appointmentHistoryOfficeCell]}>Office</Text>
                  <Text style={[visitorDashboardStyles.appointmentHistoryTableHeadText, visitorDashboardStyles.appointmentHistoryDateCell]}>Date</Text>
                  <Text style={[visitorDashboardStyles.appointmentHistoryTableHeadText, visitorDashboardStyles.appointmentHistoryTimeCell]}>Time</Text>
                  <Text style={[visitorDashboardStyles.appointmentHistoryTableHeadText, visitorDashboardStyles.appointmentHistoryStatusCell]}>Status</Text>
                </View>
                {appointmentHistoryGroups.map((group) => (
                  <React.Fragment key={group.key}>
                    <View style={visitorDashboardStyles.appointmentHistoryTableDateRow}>
                      <Ionicons name="calendar-outline" size={14} color="#0A3D91" />
                      <Text style={[visitorDashboardStyles.appointmentHistoryTableDateText, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>{group.label}</Text>
                    </View>
                    {group.entries.map((entry) => (
                      <View key={entry.id} style={[visitorDashboardStyles.appointmentHistoryTableRow, isVisitorDarkMode && visitorDashboardStyles.darkDividerBorder]}>
                        <Text style={[visitorDashboardStyles.appointmentHistoryTableText, visitorDashboardStyles.appointmentHistoryPurposeCell, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]} numberOfLines={2}>
                          {entry.title}
                        </Text>
                        <Text style={[visitorDashboardStyles.appointmentHistoryTableText, visitorDashboardStyles.appointmentHistoryOfficeCell, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={2}>
                          {entry.office}
                        </Text>
                        <Text style={[visitorDashboardStyles.appointmentHistoryTableText, visitorDashboardStyles.appointmentHistoryDateCell, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={2}>
                          {entry.dateLabel}
                        </Text>
                        <Text style={[visitorDashboardStyles.appointmentHistoryTableText, visitorDashboardStyles.appointmentHistoryTimeCell, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={1}>
                          {entry.timeLabel}
                        </Text>
                        <View style={[visitorDashboardStyles.appointmentHistoryStatusCell, visitorDashboardStyles.appointmentHistoryStatusPillWrap]}>
                          <View style={[visitorDashboardStyles.appointmentHistoryStatusDot, { backgroundColor: entry.statusColor }]} />
                          <Text style={[visitorDashboardStyles.appointmentHistoryStatusPillText, { color: entry.statusColor }]} numberOfLines={2}>
                            {entry.statusLabel}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </React.Fragment>
                ))}
              </View>
            )
          ) : (
            <View style={[visitorDashboardStyles.appointmentHistoryEmpty, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
              <Ionicons name="calendar-clear-outline" size={34} color="#94A3B8" />
              <Text style={[visitorDashboardStyles.appointmentHistoryEmptyTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>No appointments yet</Text>
              <Text style={[visitorDashboardStyles.appointmentHistoryEmptyText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                Your submitted appointment records will appear here grouped by date.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const renderVisitorCampusMap = ({ fullscreen = false } = {}) => (
    <CampusMap
      key={`visitor-map-${visitorMapResetKey}-${fullscreen ? "fullscreen" : "inline"}`}
      visitors={visitorSelfLocationMarker ? [visitorSelfLocationMarker] : []}
      floors={MONITORING_MAP_FLOORS}
      offices={visitorMapRooms}
      selectedFloor={activeVisitorMapFloor}
      selectedOffice="all"
      destinationMarkers={isCheckedOutVisitor ? [] : [visitorDestinationMarker]}
      showVisitorMarkers={Boolean(visitorSelfLocationMarker)}
      showActiveVisitorsBadge={false}
      mapBlueprints={MONITORING_MAP_BLUEPRINTS}
      mapLabels={visitorMapLabels}
      officePositions={visitorMapRoomPositions}
      onFloorChange={setSelectedVisitorMapFloor}
      showFloorNavigation={false}
      routeStartLabel={visitorSelfLocationMarker ? "Current spot" : "Main Gate"}
      initialScale={fullscreen ? 1 : 1.25}
      fullscreen={fullscreen}
    />
  );

  const renderVisitorMapPanel = () => (
    <View style={[visitorDashboardStyles.visitorMapPanel, dashboardSectionResponsiveStyle, isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard]}>
      <View style={visitorDashboardStyles.visitorFlowPanelHeader}>
        <View style={visitorDashboardStyles.visitorFlowPanelIcon}>
          <Ionicons name="map-outline" size={22} color="#0A3D91" />
        </View>
        <View style={visitorDashboardStyles.visitorFlowPanelTitleWrap}>
          <Text style={visitorDashboardStyles.visitorFlowPanelEyebrow}>Map Module</Text>
          <Text style={[visitorDashboardStyles.visitorFlowPanelTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Campus Map And Directions</Text>
          <Text style={[visitorDashboardStyles.visitorFlowPanelSubtitle, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
            Follow your in-app route to the office assigned for your appointment.
          </Text>
        </View>
      </View>

      <View style={[visitorDashboardStyles.mapSummaryCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
        <View style={visitorDashboardStyles.mapSummaryHeader}>
          <View style={visitorDashboardStyles.mapSummaryIconWrap}>
            <Ionicons name="compass-outline" size={18} color="#041E42" />
          </View>
          <View style={visitorDashboardStyles.mapSummaryCopy}>
            <Text style={[visitorDashboardStyles.mapSummaryTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Arrival Guide</Text>
            <Text style={[visitorDashboardStyles.mapSummaryText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
              {isCheckedOutVisitor
                ? "Your completed visit is no longer shown on the live map. Request another appointment to see a new route."
                : "Review your assigned floor and route steps before arrival so you know exactly where to go."}
            </Text>
          </View>
        </View>

        <View style={visitorDashboardStyles.mapSummaryMetricRow}>
          <View style={[visitorDashboardStyles.mapSummaryMetricCard, isVisitorDarkMode && visitorDashboardStyles.darkInsetCard]}>
            <Text style={visitorDashboardStyles.mapSummaryMetricLabel}>Current Floor</Text>
            <Text style={[visitorDashboardStyles.mapSummaryMetricValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
              {visitorDestinationInfo.floorName}
            </Text>
          </View>
          <View style={[visitorDashboardStyles.mapSummaryMetricCard, isVisitorDarkMode && visitorDashboardStyles.darkInsetCard]}>
            <Text style={visitorDashboardStyles.mapSummaryMetricLabel}>Assigned Office</Text>
            <Text style={[visitorDashboardStyles.mapSummaryMetricValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
              {visitorDestinationInfo.officeName}
            </Text>
          </View>
        </View>
      </View>

      <View style={[visitorDashboardStyles.visitorRouteCard, isVisitorDarkMode && visitorDashboardStyles.darkNestedCard]}>
        <View style={visitorDashboardStyles.visitorRouteHeader}>
          <View style={visitorDashboardStyles.visitorRouteIconWrap}>
            <Ionicons name="navigate" size={18} color="#FFFFFF" />
          </View>
          <View style={visitorDashboardStyles.visitorRouteHeaderCopy}>
            <Text style={[visitorDashboardStyles.visitorRouteTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Directions To {visitorDestinationInfo.officeName}</Text>
            <Text style={[visitorDashboardStyles.visitorRouteSubtitle, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
              {visitorDestinationInfo.floorName} route based on your latest appointment.
            </Text>
          </View>
        </View>
        <View style={visitorDashboardStyles.visitorRouteSteps}>
          {(isCheckedOutVisitor
            ? ["Thank you for visiting. Your previous route has been closed after checkout."]
            : visitorRouteSteps
          ).map((step, index) => (
            <View key={`visitor-route-${index}`} style={visitorDashboardStyles.visitorRouteStepRow}>
              <View style={visitorDashboardStyles.visitorRouteStepIndex}>
                <Text style={visitorDashboardStyles.visitorRouteStepIndexText}>{index + 1}</Text>
              </View>
              <Text style={[visitorDashboardStyles.visitorRouteStepText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={visitorDashboardStyles.visitorFloorTabsScroll}
        contentContainerStyle={visitorDashboardStyles.visitorFloorTabsContent}
        nestedScrollEnabled
      >
        <View style={visitorDashboardStyles.visitorFloorTabs}>
          {MONITORING_MAP_FLOORS.map((floor) => {
            const isActive = selectedVisitorMapFloor === floor.id;

            return (
              <AnimatedPressable
                key={floor.id}
                style={[
                  visitorDashboardStyles.visitorFloorTab,
                  isVisitorDarkMode && visitorDashboardStyles.darkSegmentButton,
                  isActive && visitorDashboardStyles.visitorFloorTabActive,
                ]}
                onPress={() => setSelectedVisitorMapFloor(floor.id)}
                activeOpacity={0.86}
              >
                <Ionicons
                  name={floor.icon}
                  size={15}
                  color={isActive ? "#FFFFFF" : isVisitorDarkMode ? "#CBD5E1" : "#64748B"}
                />
                <Text
                  style={[
                    visitorDashboardStyles.visitorFloorTabText,
                    isVisitorDarkMode && visitorDashboardStyles.darkMutedText,
                    isActive && visitorDashboardStyles.visitorFloorTabTextActive,
                  ]}
                >
                  {floor.name}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={visitorDashboardStyles.visitorMapToolbar}>
        <View style={visitorDashboardStyles.visitorMapToolbarCopy}>
          <Text style={[visitorDashboardStyles.visitorMapToolbarTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Floor Plan</Text>
          <Text style={[visitorDashboardStyles.visitorMapToolbarText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>Zoom, drag, or open full screen for a clearer route.</Text>
        </View>
        <AnimatedPressable
          style={visitorDashboardStyles.visitorMapFullscreenButton}
          onPress={() => setShowVisitorMapFullscreen(true)}
          activeOpacity={0.88}
        >
          <Ionicons name="expand-outline" size={17} color="#FFFFFF" />
          <Text style={visitorDashboardStyles.visitorMapFullscreenButtonText}>Full Screen</Text>
        </AnimatedPressable>
      </View>

      {renderVisitorCampusMap()}

      <View style={[visitorDashboardStyles.visitorMapNote, isVisitorDarkMode && visitorDashboardStyles.darkInsetCard]}>
        <Ionicons name="information-circle-outline" size={18} color="#0A3D91" />
        <Text style={[visitorDashboardStyles.visitorMapNoteText, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
          Use pinch/zoom controls and drag the map to inspect the floor. The blue pin marks the office you should go to.
        </Text>
      </View>

      <View style={visitorDashboardStyles.visitorMapActionRow}>
        <AnimatedPressable
          style={visitorDashboardStyles.visitorMapPrimaryAction}
          onPress={() => setSelectedVisitorMapFloor(visitorDestinationInfo.floorId || "ground")}
          activeOpacity={0.88}
        >
          <Ionicons name="navigate" size={17} color="#FFFFFF" />
          <Text style={visitorDashboardStyles.visitorMapPrimaryActionText}>Start Navigation</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[visitorDashboardStyles.visitorMapActionButton, isVisitorDarkMode && visitorDashboardStyles.darkActionButton]}
          onPress={() => {
            setSelectedVisitorMapFloor(visitorDestinationInfo.floorId || "ground");
            setVisitorMapResetKey((current) => current + 1);
          }}
          activeOpacity={0.88}
        >
          <Ionicons name="refresh-outline" size={17} color="#0A3D91" />
          <Text style={[visitorDashboardStyles.visitorMapActionButtonText, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Reset Route</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[visitorDashboardStyles.visitorMapActionButton, isVisitorDarkMode && visitorDashboardStyles.darkActionButton]}
          onPress={() => handleVisitorRouteNavigation("WebMapScreen", {
            destinationOffice: visitorDestinationInfo.officeName,
          })}
          activeOpacity={0.88}
        >
          <Ionicons name="swap-horizontal-outline" size={17} color="#0A3D91" />
          <Text style={[visitorDashboardStyles.visitorMapActionButtonText, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Change Destination</Text>
        </AnimatedPressable>
      </View>

      <AnimatedPressable
        style={[visitorDashboardStyles.visitorFlowSecondaryButton, isVisitorDarkMode && visitorDashboardStyles.darkActionButton]}
        onPress={() => handleVisitorRouteNavigation("WebMapScreen", { destinationOffice: visitorDestinationInfo.officeName })}
        activeOpacity={0.86}
      >
        <Ionicons name="navigate-outline" size={18} color="#0A3D91" />
        <Text style={[visitorDashboardStyles.visitorFlowSecondaryButtonText, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>View Full In-App Directions</Text>
      </AnimatedPressable>
    </View>
  );

  return (
    <SafeAreaView style={[visitorDashboardStyles.safeArea, isVisitorDarkMode && visitorDashboardStyles.darkSafeArea]}>
      <StatusBar barStyle="light-content" backgroundColor="#061A2E" />
      <MobileConnectionBanner
        dark={isVisitorDarkMode}
        visible={!!connectionIssue}
        title={connectionIssue?.title}
        message={connectionIssue?.message}
        onRetry={() => loadVisitorData({ force: true })}
        style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}
      />

      {isVisitorHomeSection ? (
        <LinearGradient
          colors={["#061A2E", "#0F3A5F", "#0A3D91"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[visitorDashboardStyles.header, compactHomeHeaderStyle]}
        >
          <View style={visitorDashboardStyles.headerTop}>
            <View>
              <View style={visitorDashboardStyles.homeBrandRow}>
                <View style={visitorDashboardStyles.homeBrandLogoWrap}>
                  <Image
                    source={visitorBrandLogo}
                    style={visitorDashboardStyles.homeBrandLogo}
                    resizeMode="contain"
                  />
                </View>
                <View style={visitorDashboardStyles.homeBrandCopy}>
                  <Text style={visitorDashboardStyles.homeBrandTitle}>SafePass</Text>
                  <Text style={visitorDashboardStyles.homeBrandSubtitle}>Visitor Portal</Text>
                </View>
              </View>
              <Text style={visitorDashboardStyles.greeting}>{greeting},</Text>
              <Text style={visitorDashboardStyles.userName}>
                {displayName.split(' ')[0] || 'Visitor'}!
              </Text>
              <Text style={[visitorDashboardStyles.headerSupportText, compactHomeSupportStyle]}>
                Visitor access, appointments, and campus guidance
              </Text>
            </View>
            <View style={visitorDashboardStyles.headerActions}>
              <AnimatedPressable
                onPress={handleEditProfilePress}
                style={visitorDashboardStyles.profileButton}
                activeOpacity={0.86}
              >
                <LinearGradient
                  colors={["rgba(255,255,255,0.24)", "rgba(255,255,255,0.1)"]}
                  style={visitorDashboardStyles.profileGradient}
                >
                  {visitorAvatarUri ? (
                    <Image source={{ uri: visitorAvatarUri }} style={visitorDashboardStyles.profileImage} />
                  ) : (
                    <Text style={visitorDashboardStyles.profileInitials}>{visitorInitials}</Text>
                  )}
                </LinearGradient>
              </AnimatedPressable>
            </View>
          </View>

          <View style={visitorDashboardStyles.headerStatsRow}>
            {[
              ["Approved", approvedAppointmentCount],
              ["Pending", pendingAppointmentCount],
              ["SafePass", visitorSafePassId ? "Ready" : "Setup"],
            ].map(([label, value]) => (
              <View key={label} style={visitorDashboardStyles.headerStatPill}>
                <Text style={visitorDashboardStyles.headerStatValue} numberOfLines={1}>{value}</Text>
                <Text style={visitorDashboardStyles.headerStatLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={[visitorDashboardStyles.statusCard, { backgroundColor: `${statusColor}15` }]}>
            <View style={visitorDashboardStyles.statusRow}>
              <View style={[visitorDashboardStyles.statusIcon, { backgroundColor: statusColor }]}>
                <Ionicons name={statusIcon} size={20} color="#FFFFFF" />
              </View>
              <Text style={[visitorDashboardStyles.statusValue, { color: statusColor }]}>
                {statusText}
              </Text>
            </View>
            {timeRemaining && (
              <View style={visitorDashboardStyles.timerRow}>
                <Ionicons name={timeRemaining.icon} size={16} color={timeRemaining.color} />
                <Text style={[visitorDashboardStyles.timerText, { color: timeRemaining.color }]}>
                  {timeRemaining.text}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>
      ) : null}

      {!isVisitorHomeSection ? (
          <View style={[visitorDashboardStyles.miniBrandHeaderWrap, isVisitorDarkMode && visitorDashboardStyles.darkMiniBrandHeaderWrap]}>
          <View
            style={[
              visitorDashboardStyles.miniBrandHeader,
              {
                backgroundColor: isVisitorDarkMode ? "#0F172A" : "#0A3D91",
                borderColor: isVisitorDarkMode ? "#1E293B" : "rgba(255,255,255,0.16)",
              },
              isVisitorDarkMode && visitorDashboardStyles.darkMiniBrandHeader,
            ]}
          >
            <View style={visitorDashboardStyles.miniBrandIdentity}>
              <View
                style={[
                  visitorDashboardStyles.miniBrandLogoWrap,
                  { backgroundColor: "rgba(255,255,255,0.14)" },
                ]}
              >
                <Image
                  source={visitorBrandLogo}
                  style={visitorDashboardStyles.miniBrandLogo}
                  resizeMode="contain"
                />
              </View>
              <View style={visitorDashboardStyles.miniBrandCopy}>
                <Text style={[visitorDashboardStyles.miniBrandTitle, !isVisitorDarkMode && visitorDashboardStyles.miniBrandTitleOnDark, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>SafePass</Text>
                <Text style={[visitorDashboardStyles.miniBrandSubtitle, !isVisitorDarkMode && visitorDashboardStyles.miniBrandSubtitleOnDark, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                  {sectionIntro.title}
                </Text>
              </View>
            </View>
            <View style={visitorDashboardStyles.miniBrandHeaderRight}>
              <View
                style={[
                  visitorDashboardStyles.miniBrandSectionPill,
                  { backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.2)" },
                ]}
              >
                <Ionicons name={sectionIntro.icon} size={14} color="#DBEAFE" />
                <Text
                  style={[
                    visitorDashboardStyles.miniBrandSectionPillText,
                    { color: "#FFFFFF" },
                  ]}
                >
                  {sectionIntro.badge}
                </Text>
              </View>
              <AnimatedPressable
                onPress={handleEditProfilePress}
                style={[
                  visitorDashboardStyles.miniBrandProfileButton,
                  { backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.22)" },
                ]}
                activeOpacity={0.86}
              >
                {visitorAvatarUri ? (
                  <Image source={{ uri: visitorAvatarUri }} style={visitorDashboardStyles.miniBrandProfileImage} />
                ) : (
                  <Text
                    style={[
                    visitorDashboardStyles.miniBrandProfileText,
                    { color: "#FFFFFF" },
                  ]}
                  >
                    {visitorInitials.substring(0, 1)}
                  </Text>
                )}
              </AnimatedPressable>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={dashboardScrollRef}
        style={[visitorDashboardStyles.mainScrollView, isVisitorDarkMode && visitorDashboardStyles.darkMainScrollView]}
        showsVerticalScrollIndicator
        contentContainerStyle={[
          visitorDashboardStyles.scrollContent,
          { paddingBottom: isCompactVisitorDashboard ? 230 : 190 },
        ]}
        onScroll={(event) => setDashboardScrollY(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        overScrollMode="always"
        persistentScrollbar={Platform.OS === "android"}
      >
        <View
          style={[
            visitorDashboardStyles.dashboardShell,
            isWideVisitorDashboard && visitorDashboardStyles.dashboardShellWide,
            dashboardShellResponsiveStyle,
          ]}
        >
          {shouldShowVisitorCommandDeck ? (
            <ScrollReveal
              scrollY={dashboardScrollY}
              viewportHeight={viewportHeight}
              delay={0}
            >
              <Animated.View
                style={[
                  visitorDashboardStyles.commandDeckAnimatedWrap,
                  dashboardHeroAnimatedStyle,
                ]}
              >
          <View
            style={[
              visitorDashboardStyles.commandDeckCard,
              !isVisitorHomeSection && visitorDashboardStyles.commandDeckCardInline,
              compactCommandDeckStyle,
              dashboardCardResponsiveStyle,
              isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard,
            ]}
          >
            <View style={[visitorDashboardStyles.commandDeckHeader, isWideVisitorDashboard && visitorDashboardStyles.commandDeckHeaderWide]}>
              <View style={visitorDashboardStyles.commandDeckTitleWrap}>
                <Text style={[visitorDashboardStyles.commandDeckTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                  {journeyTitle}
                </Text>
                <Text style={[visitorDashboardStyles.commandDeckSubtitle, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]}>
                  {journeySubtitle}
                </Text>
              </View>
              <View style={[visitorDashboardStyles.commandDeckBadge, { backgroundColor: `${statusColor}18` }]}>
                <View style={[visitorDashboardStyles.commandDeckBadgeDot, { backgroundColor: statusColor }]} />
                <Text style={[visitorDashboardStyles.commandDeckBadgeText, { color: statusColor }]}>
                  {statusText}
                </Text>
              </View>
            </View>

            {isVisitorHomeSection ? (
              <View style={visitorDashboardStyles.mobileQuickActionStrip}>
                {homeQuickCategories.slice(0, 3).map((item) => (
                  <AnimatedPressable
                    key={item.label}
                    style={visitorDashboardStyles.mobileQuickActionItem}
                    onPress={() => handleVisitorSectionChange(item.target)}
                    activeOpacity={0.86}
                  >
                    <View style={[visitorDashboardStyles.mobileQuickActionIcon, { backgroundColor: item.accent }]}>
                      <Ionicons name={item.icon} size={17} color={item.iconColor} />
                    </View>
                    <Text style={visitorDashboardStyles.mobileQuickActionLabel} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            ) : null}

            <View style={visitorDashboardStyles.commandMetricsGrid}>
              {commandMetrics.map((item) => (
                <AnimatedPressable
                  key={item.label}
                  style={[
                    visitorDashboardStyles.commandMetricCard,
                    { width: compactCommandMetricCardWidth },
                    isVisitorDarkMode && visitorDashboardStyles.darkNestedCard,
                  ]}
                  onPress={() => item.target && handleVisitorSectionChange(item.target)}
                  activeOpacity={0.86}
                >
                  <View style={visitorDashboardStyles.commandMetricIcon}>
                    <Ionicons name={item.icon} size={16} color="#0A3D91" />
                  </View>
                  <Text style={[visitorDashboardStyles.commandMetricLabel, isVisitorDarkMode && visitorDashboardStyles.darkMutedText]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[visitorDashboardStyles.commandMetricValue, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]} numberOfLines={1}>
                    {item.value}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>

            {visitor?.status === "checked_in" ? (
              <View
                style={[
                  visitorDashboardStyles.phoneTrackingCard,
                  phoneTrackingStatus.active
                    ? visitorDashboardStyles.phoneTrackingCardActive
                    : visitorDashboardStyles.phoneTrackingCardInactive,
                ]}
              >
                <View style={visitorDashboardStyles.phoneTrackingIconWrap}>
                  <Ionicons
                    name={phoneTrackingStatus.active ? "location" : "location-outline"}
                    size={18}
                    color={phoneTrackingStatus.active ? "#0A3D91" : "#B45309"}
                  />
                </View>
                <View style={visitorDashboardStyles.phoneTrackingCopy}>
                  <Text style={visitorDashboardStyles.phoneTrackingTitle}>
                    Phone GPS Tracking
                  </Text>
                  <Text style={visitorDashboardStyles.phoneTrackingText}>
                    {phoneTrackingStatus.message}
                  </Text>
                </View>
              </View>
            ) : null}

            {(isApprovedVisitor || canRequestNewAppointment || canCreateFreshAppointment) ? (
              <View
                style={[
                  visitorDashboardStyles.commandActionRow,
                  commandActionRowResponsiveStyle,
                ]}
              >
                <AnimatedPressable
                  style={[
                    visitorDashboardStyles.commandPrimaryButton,
                    commandActionButtonResponsiveStyle,
                  ]}
                  onPress={openAppointmentRequestScreen}
                  activeOpacity={0.9}
                >
                  <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
                  <Text style={visitorDashboardStyles.commandPrimaryButtonText}>
                    {isApprovedVisitor ? "Register Another Appointment" : "Register Appointment"}
                  </Text>
                </AnimatedPressable>

              </View>
            ) : null}
          </View>
            </Animated.View>
            </ScrollReveal>
          ) : null}

          {!isVisitorHomeSection && !isVisitorAccountSection && !isVisitorMapSection ? (
            <Animated.View style={dashboardContentAnimatedStyle}>
              {renderSectionIntro()}
            </Animated.View>
          ) : null}
          {renderActiveVisitorPanel()}
        </View>
      </ScrollView>

      {visitorPushNotice ? (
        <TouchableOpacity
          style={[
            visitorDashboardStyles.visitorPushNotice,
            visitorPushNotice.type === "success" && visitorDashboardStyles.visitorPushNoticeSuccess,
            visitorPushNotice.type === "warning" && visitorDashboardStyles.visitorPushNoticeWarning,
            visitorPushNotice.type === "error" && visitorDashboardStyles.visitorPushNoticeError,
          ]}
          activeOpacity={0.92}
          onPress={dismissVisitorPushNotice}
        >
          <View style={visitorDashboardStyles.visitorPushNoticeIcon}>
            <Ionicons
              name={
                visitorPushNotice.type === "success"
                  ? "checkmark-circle"
                  : visitorPushNotice.type === "error"
                    ? "close-circle-outline"
                    : visitorPushNotice.type === "warning"
                      ? "alert-circle-outline"
                      : "notifications-outline"
              }
              size={18}
              color="#0A3D91"
            />
          </View>
          <View style={visitorDashboardStyles.visitorPushNoticeCopy}>
            <Text style={visitorDashboardStyles.visitorPushNoticeTitle}>
              {visitorPushNotice.title}
            </Text>
            <Text style={visitorDashboardStyles.visitorPushNoticeText}>
              {visitorPushNotice.message}
            </Text>
            <Text style={visitorDashboardStyles.visitorPushNoticeTime}>Just now</Text>
          </View>
          <Ionicons name="close" size={16} color="#64748B" />
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={showVisitorMapFullscreen}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowVisitorMapFullscreen(false)}
      >
        <SafeAreaView style={[visitorDashboardStyles.visitorMapFullscreenModal, isVisitorDarkMode && visitorDashboardStyles.darkSafeArea]}>
          <View style={[visitorDashboardStyles.visitorMapFullscreenHeader, isVisitorDarkMode && visitorDashboardStyles.darkSurfaceCard]}>
            <View style={visitorDashboardStyles.visitorMapFullscreenTitleWrap}>
              <Text style={visitorDashboardStyles.visitorMapFullscreenEyebrow}>
                Campus Map
              </Text>
              <Text style={[visitorDashboardStyles.visitorMapFullscreenTitle, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>
                {visitorDestinationInfo.floorName}
              </Text>
            </View>
            <TouchableOpacity
              style={[visitorDashboardStyles.visitorMapMinimizeButton, isVisitorDarkMode && visitorDashboardStyles.darkActionButton]}
              onPress={() => setShowVisitorMapFullscreen(false)}
              activeOpacity={0.86}
            >
              <Ionicons name="contract-outline" size={18} color="#0A3D91" />
              <Text style={[visitorDashboardStyles.visitorMapMinimizeButtonText, isVisitorDarkMode && visitorDashboardStyles.darkPrimaryText]}>Minimize</Text>
            </TouchableOpacity>
          </View>

          <View style={visitorDashboardStyles.visitorMapFullscreenBody}>
            {renderVisitorCampusMap({ fullscreen: true })}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showEditAppointmentModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeEditAppointmentModal}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.appointmentManageModal}>
            <View style={visitorDashboardStyles.appointmentManageModalHeader}>
              <View style={visitorDashboardStyles.appointmentManageModalIcon}>
                <Ionicons name="create-outline" size={22} color="#0A3D91" />
              </View>
              <View style={visitorDashboardStyles.appointmentManageModalCopy}>
                <Text style={visitorDashboardStyles.appointmentManageModalTitle}>
                  {getEditAppointmentModalTitle()}
                </Text>
                <Text style={visitorDashboardStyles.appointmentManageModalSubtitle}>
                  {getEditAppointmentModalSubtitle()}
                </Text>
              </View>
              <TouchableOpacity
                style={visitorDashboardStyles.appointmentManageModalClose}
                onPress={closeEditAppointmentModal}
                disabled={isUpdatingAppointment}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={visitorDashboardStyles.appointmentManageModalBody}>
              <View style={visitorDashboardStyles.appointmentManageOriginalCard}>
                <Text style={visitorDashboardStyles.appointmentManageOriginalLabel}>Current schedule</Text>
                <Text style={visitorDashboardStyles.appointmentManageOriginalValue}>
                  {appointmentEditForm.appointment?.visitDate ? formatDate(appointmentEditForm.appointment.visitDate) : "Not scheduled"} at {appointmentEditForm.appointment?.visitTime ? formatTime(appointmentEditForm.appointment.visitTime) : "Not scheduled"}
                </Text>
              </View>

              <View style={visitorDashboardStyles.appointmentManageFieldGrid}>
                <View style={visitorDashboardStyles.appointmentManageField}>
                  <Text style={visitorDashboardStyles.appointmentFieldLabel}>New Date</Text>
                  {Platform.OS === "web" ? (
                    <input
                      type="date"
                      value={
                        appointmentEditForm.preferredDate
                          ? new Date(appointmentEditForm.preferredDate).toISOString().slice(0, 10)
                          : ""
                      }
                      min={getAppointmentMinDateValue()}
                      onChange={handleEditAppointmentWebDateChange}
                      style={{
                        minHeight: 44,
                        borderRadius: 12,
                        border: "1px solid #D9E4F2",
                        padding: "0 12px",
                        fontWeight: 700,
                        color: "#0F172A",
                      }}
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={visitorDashboardStyles.appointmentPickerField}
                        onPress={() => {
                          const shouldOpenDatePicker = !showEditAppointmentDatePicker;
                          setShowEditAppointmentTimePicker(false);
                          setShowEditAppointmentDatePicker(shouldOpenDatePicker);
                        }}
                      >
                        <Text style={visitorDashboardStyles.appointmentPickerValue}>
                          {formatAppointmentPickerDate(appointmentEditForm.preferredDate)}
                        </Text>
                        <Ionicons name="calendar-outline" size={18} color="#0A3D91" />
                      </TouchableOpacity>
                      {showEditAppointmentDatePicker && DateTimePickerComponent ? (
                        <DateTimePickerComponent
                          value={getValidDate(appointmentEditForm.preferredDate) || getDefaultAppointmentDate()}
                          mode="date"
                          display={Platform.OS === "ios" ? "spinner" : "default"}
                          onChange={handleEditAppointmentDateChange}
                          minimumDate={getNextAvailableAppointmentDate(new Date())}
                        />
                      ) : null}
                    </>
                  )}
                </View>

                <View style={visitorDashboardStyles.appointmentManageField}>
                  <Text style={visitorDashboardStyles.appointmentFieldLabel}>New Time</Text>
                  <TouchableOpacity
                    style={visitorDashboardStyles.appointmentPickerField}
                    onPress={() => {
                      const shouldOpenTimePicker = !showEditAppointmentTimePicker;
                      setShowEditAppointmentDatePicker(false);
                      setShowEditAppointmentTimePicker(shouldOpenTimePicker);
                    }}
                  >
                    <Text style={visitorDashboardStyles.appointmentPickerValue}>
                      {appointmentEditForm.preferredTime ? formatTime(appointmentEditForm.preferredTime) : "Select time"}
                    </Text>
                    <Ionicons name={showEditAppointmentTimePicker ? "chevron-up" : "chevron-down"} size={18} color="#94A3B8" />
                  </TouchableOpacity>
                  {showEditAppointmentTimePicker ? (
                    <View style={visitorDashboardStyles.appointmentManageTimeList}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {appointmentTimeOptions.map((option) => {
                          const isSelected =
                            appointmentEditForm.preferredTime &&
                            new Date(appointmentEditForm.preferredTime).getHours() === option.getHours() &&
                            new Date(appointmentEditForm.preferredTime).getMinutes() === option.getMinutes();
                          const isPassed = isAppointmentTimeSlotPassed(option, appointmentEditForm.preferredDate);
                          return (
                            <TouchableOpacity
                              key={`edit-${option.getHours()}-${option.getMinutes()}`}
                              style={[
                                visitorDashboardStyles.pickerOptionItem,
                                isSelected && visitorDashboardStyles.pickerOptionItemActive,
                                isPassed && visitorDashboardStyles.pickerOptionItemDisabled,
                              ]}
                              disabled={isPassed}
                              onPress={() => {
                                setAppointmentEditForm((prev) => ({ ...prev, preferredTime: option }));
                                setShowEditAppointmentTimePicker(false);
                              }}
                            >
                              <Text
                                style={[
                                  visitorDashboardStyles.pickerOptionText,
                                  isSelected && visitorDashboardStyles.pickerOptionTextActive,
                                  isPassed && visitorDashboardStyles.pickerOptionTextDisabled,
                                ]}
                              >
                                {formatTime(option)}
                              </Text>
                              {isPassed ? (
                                <Text style={[visitorDashboardStyles.pickerOptionMeta, visitorDashboardStyles.pickerOptionMetaFull]}>
                                  Time has passed
                                </Text>
                              ) : isSelected ? (
                                <Ionicons name="checkmark-circle" size={18} color="#0A3D91" />
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              </View>

              <TextInput
                style={[visitorDashboardStyles.appointmentFieldInput, visitorDashboardStyles.appointmentFieldTextarea]}
                value={appointmentEditForm.reason}
                onChangeText={(text) => setAppointmentEditForm((prev) => ({ ...prev, reason: text }))}
                placeholder="Reason for reschedule (optional)"
                placeholderTextColor="#94A3B8"
                multiline
              />
            </View>

            <View style={visitorDashboardStyles.appointmentManageModalActions}>
              <TouchableOpacity
                style={visitorDashboardStyles.appointmentSecondaryButton}
                onPress={closeEditAppointmentModal}
                disabled={isUpdatingAppointment}
              >
                <Text style={visitorDashboardStyles.appointmentSecondaryButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={visitorDashboardStyles.appointmentPrimaryButton}
                onPress={confirmAppointmentReschedule}
                disabled={isUpdatingAppointment}
              >
                {isUpdatingAppointment ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
                    <Text style={visitorDashboardStyles.appointmentPrimaryButtonText}>Update</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCancelAppointmentModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeCancelAppointmentModal}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.appointmentManageModal}>
            <View style={visitorDashboardStyles.appointmentManageModalHeader}>
              <View style={[visitorDashboardStyles.appointmentManageModalIcon, visitorDashboardStyles.appointmentManageModalDangerIcon]}>
                <Ionicons name="close-circle-outline" size={22} color="#DC2626" />
              </View>
              <View style={visitorDashboardStyles.appointmentManageModalCopy}>
                <Text style={visitorDashboardStyles.appointmentManageModalTitle}>Cancel Appointment</Text>
                <Text style={visitorDashboardStyles.appointmentManageModalSubtitle}>
                  Tell staff why you need to cancel this appointment.
                </Text>
              </View>
              <TouchableOpacity
                style={visitorDashboardStyles.appointmentManageModalClose}
                onPress={closeCancelAppointmentModal}
                disabled={isUpdatingAppointment}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={visitorDashboardStyles.appointmentManageModalBody}>
              <View style={visitorDashboardStyles.appointmentManageOriginalCard}>
                <Text style={visitorDashboardStyles.appointmentManageOriginalLabel}>Appointment</Text>
                <Text style={visitorDashboardStyles.appointmentManageOriginalValue}>
                  {appointmentCancellationForm.appointment?.visitDate ? formatDate(appointmentCancellationForm.appointment.visitDate) : "Not scheduled"} at {appointmentCancellationForm.appointment?.visitTime ? formatTime(appointmentCancellationForm.appointment.visitTime) : "Not scheduled"}
                </Text>
              </View>
              <TextInput
                style={[visitorDashboardStyles.appointmentFieldInput, visitorDashboardStyles.appointmentFieldTextarea]}
                value={appointmentCancellationForm.reason}
                onChangeText={(text) => setAppointmentCancellationForm((prev) => ({ ...prev, reason: text }))}
                placeholder="Reason for cancellation"
                placeholderTextColor="#94A3B8"
                multiline
              />
            </View>

            <View style={visitorDashboardStyles.appointmentManageModalActions}>
              <TouchableOpacity
                style={visitorDashboardStyles.appointmentSecondaryButton}
                onPress={closeCancelAppointmentModal}
                disabled={isUpdatingAppointment}
              >
                <Text style={visitorDashboardStyles.appointmentSecondaryButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[visitorDashboardStyles.appointmentPrimaryButton, visitorDashboardStyles.appointmentManageCancelSubmit]}
                onPress={confirmAppointmentCancellation}
                disabled={isUpdatingAppointment}
              >
                {isUpdatingAppointment ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={visitorDashboardStyles.appointmentPrimaryButtonText}>Cancel Appointment</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!visitorAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setVisitorAlert(null)}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.visitorAlertModalContent}>
            <View
              style={[
                visitorDashboardStyles.visitorAlertIconWrap,
                visitorAlert?.type === "success" && visitorDashboardStyles.visitorAlertIconSuccess,
                visitorAlert?.type === "error" && visitorDashboardStyles.visitorAlertIconError,
                visitorAlert?.type === "warning" && visitorDashboardStyles.visitorAlertIconWarning,
              ]}
            >
              <Ionicons
                name={
                  visitorAlert?.type === "success"
                    ? "checkmark-circle-outline"
                    : visitorAlert?.type === "error"
                      ? "close-circle-outline"
                      : visitorAlert?.type === "warning"
                        ? "alert-circle-outline"
                        : "information-circle-outline"
                }
                size={26}
                color={
                  visitorAlert?.type === "success"
                    ? "#047857"
                    : visitorAlert?.type === "error"
                      ? "#DC2626"
                      : visitorAlert?.type === "warning"
                        ? "#D97706"
                        : "#0A3D91"
                }
              />
            </View>
            <View style={visitorDashboardStyles.visitorAlertTextBlock}>
              <Text style={visitorDashboardStyles.visitorAlertTitle}>
                {visitorAlert?.title || "Notice"}
              </Text>
              {visitorAlert?.message ? (
                <Text style={visitorDashboardStyles.visitorAlertMessage}>
                  {visitorAlert.message}
                </Text>
              ) : null}
            </View>
            <View style={visitorDashboardStyles.visitorAlertActionRow}>
              {(visitorAlert?.buttons || [{ text: "OK" }]).map((button, index) => {
                const isCancel = button.style === "cancel";
                const isDestructive = button.style === "destructive";
                const isPrimary = !isCancel && index === (visitorAlert?.buttons || []).length - 1;
                return (
                  <TouchableOpacity
                    key={`${button.text}-${index}`}
                    style={[
                      visitorDashboardStyles.visitorAlertButton,
                      isCancel && visitorDashboardStyles.visitorAlertButtonSecondary,
                      isPrimary && visitorDashboardStyles.visitorAlertButtonPrimary,
                      isDestructive && visitorDashboardStyles.visitorAlertButtonDanger,
                    ]}
                    onPress={() => dismissVisitorAlert(button)}
                    activeOpacity={0.88}
                  >
                    <Text
                      style={[
                        visitorDashboardStyles.visitorAlertButtonText,
                        isCancel && visitorDashboardStyles.visitorAlertButtonSecondaryText,
                        isPrimary && visitorDashboardStyles.visitorAlertButtonPrimaryText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!visitorWarningNotice}
        transparent={true}
        animationType="fade"
        onRequestClose={dismissVisitorWarningNotice}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.visitorWarningModalContent}>
            <LinearGradient
              colors={["#7F1D1D", "#B91C1C", "#DC2626"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={visitorDashboardStyles.visitorWarningModalHeader}
            >
              <View style={visitorDashboardStyles.visitorWarningModalTopRow}>
                <View style={visitorDashboardStyles.visitorWarningModalIcon}>
                  <Ionicons name="shield-checkmark-outline" size={24} color="#FFFFFF" />
                </View>
                <TouchableOpacity
                  style={visitorDashboardStyles.visitorWarningModalClose}
                  onPress={dismissVisitorWarningNotice}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <Text style={visitorDashboardStyles.visitorWarningModalEyebrow}>
                Security Notice
              </Text>
              <Text style={visitorDashboardStyles.visitorWarningModalTitle}>
                {visitorWarningNotice?.title || "Security Report Warning"}
              </Text>
              <Text style={visitorDashboardStyles.visitorWarningModalSubtitle}>
                Please review this notice before continuing your visit.
              </Text>
            </LinearGradient>

            <View style={visitorDashboardStyles.visitorWarningModalBody}>
              <View style={visitorDashboardStyles.visitorWarningSeverityRow}>
                <View style={visitorDashboardStyles.visitorWarningSeverityPill}>
                  <View style={visitorDashboardStyles.visitorWarningSeverityDot} />
                  <Text style={visitorDashboardStyles.visitorWarningSeverityText}>
                    {(visitorWarningNotice?.severity || "warning").toUpperCase()}
                  </Text>
                </View>
                <Text style={visitorDashboardStyles.visitorWarningTimeText}>
                  {visitorWarningNotice?.createdAt
                    ? formatDateTime(visitorWarningNotice.createdAt)
                    : "Just now"}
                </Text>
              </View>

              <Text style={visitorDashboardStyles.visitorWarningMessage}>
                {visitorWarningNotice?.message || "A new notice has been added to your visitor account."}
              </Text>

              <View style={visitorDashboardStyles.visitorWarningInfoStrip}>
                <Ionicons name="information-circle-outline" size={18} color="#0A3D91" />
                <Text style={visitorDashboardStyles.visitorWarningInfoText}>
                  This notice will be marked as read after you acknowledge it.
                </Text>
              </View>
            </View>

            <View style={visitorDashboardStyles.visitorWarningModalFooter}>
              <TouchableOpacity
                style={visitorDashboardStyles.visitorWarningPrimaryButton}
                onPress={dismissVisitorWarningNotice}
                activeOpacity={0.9}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={visitorDashboardStyles.visitorWarningPrimaryButtonText}>
                  I Understand
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {renderBottomNavigation()}

      <Modal
        visible={showVirtualNfcModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVirtualNfcModal(false)}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View
            style={[
              visitorDashboardStyles.virtualNfcModalContent,
              isCompactVirtualCardView && visitorDashboardStyles.virtualNfcModalContentCompact,
            ]}
          >
            <LinearGradient
              colors={["#0F172A", "#041E42", "#0A3D91"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                visitorDashboardStyles.virtualNfcModalHeader,
                isCompactVirtualCardView && visitorDashboardStyles.virtualNfcModalHeaderCompact,
              ]}
            >
              <View>
                <Text style={visitorDashboardStyles.virtualNfcModalTitle}>Virtual NFC Card</Text>
                <Text style={visitorDashboardStyles.virtualNfcModalSubtitle}>
                  Show this card and tap your assigned NFC card at the campus reader.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowVirtualNfcModal(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView
              style={visitorDashboardStyles.virtualNfcModalScroll}
              contentContainerStyle={[
                visitorDashboardStyles.virtualNfcModalBody,
                isCompactVirtualCardView && visitorDashboardStyles.virtualNfcModalBodyCompact,
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={[
                  visitorDashboardStyles.virtualNfcDisplayRow,
                  isCompactVirtualCardView && visitorDashboardStyles.virtualNfcDisplayRowCompact,
                ]}
              >
                <View
                  style={[
                    visitorDashboardStyles.virtualNfcPreviewCard,
                    isCompactVirtualCardView && visitorDashboardStyles.virtualNfcPreviewCardCompact,
                  ]}
                >
                  <LinearGradient
                    colors={["#0F172A", "#041E42", "#0A3D91"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={visitorDashboardStyles.virtualNfcCardGradient}
                  >
                    <View style={visitorDashboardStyles.virtualNfcCardTopBar}>
                      <View>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewBrand}>
                          SafePass
                        </Text>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewSchool}>
                          Sapphire International Aviation Academy
                        </Text>
                      </View>
                      <View style={visitorDashboardStyles.virtualNfcPreviewChip}>
                        <Ionicons name="radio" size={16} color="#EEF5FF" />
                      </View>
                    </View>

                    <View style={visitorDashboardStyles.virtualNfcCardIdentity}>
                      <Text style={visitorDashboardStyles.virtualNfcPreviewLabel}>Visitor Name</Text>
                      <Text style={visitorDashboardStyles.virtualNfcPreviewName}>
                        {visitor?.fullName || "Visitor"}
                      </Text>
                    </View>

                    <View style={visitorDashboardStyles.virtualNfcIdBand}>
                      <Text style={visitorDashboardStyles.virtualNfcPreviewLabel}>Virtual Card ID</Text>
                      <Text style={visitorDashboardStyles.virtualNfcPreviewId}>
                        {visitorVirtualNfcDisplay}
                      </Text>
                    </View>

                    <View style={visitorDashboardStyles.virtualNfcDetailsGrid}>
                      <View style={visitorDashboardStyles.virtualNfcDetailCard}>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaLabel}>SafePass ID</Text>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaValue}>
                          {visitorSafePassId}
                        </Text>
                      </View>
                      <View style={visitorDashboardStyles.virtualNfcDetailCard}>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaLabel}>Purpose</Text>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaValue}>
                          {visitor?.purposeOfVisit || "Approved visit"}
                        </Text>
                      </View>
                      <View style={visitorDashboardStyles.virtualNfcDetailCard}>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaLabel}>Status</Text>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaValue}>
                          Approved
                        </Text>
                      </View>
                      <View style={visitorDashboardStyles.virtualNfcDetailCard}>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaLabel}>Visit Date</Text>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaValue}>
                          {formatDate(visitor?.visitDate)}
                        </Text>
                      </View>
                      <View style={visitorDashboardStyles.virtualNfcDetailCard}>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaLabel}>Arrival Time</Text>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaValue}>
                          {formatTime(visitor?.visitTime)}
                        </Text>
                      </View>
                      <View style={visitorDashboardStyles.virtualNfcDetailCardWide}>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaLabel}>Assigned Staff</Text>
                        <Text style={visitorDashboardStyles.virtualNfcPreviewMetaValue}>
                          {visitor?.assignedStaffName || visitor?.appointmentDepartment || visitor?.assignedOffice || visitor?.host || "Front Office"}
                        </Text>
                      </View>
                    </View>

                    <View style={visitorDashboardStyles.virtualNfcTapHint}>
                      <View style={visitorDashboardStyles.virtualNfcTapHintIcon}>
                        <Ionicons name="finger-print-outline" size={18} color="#0F172A" />
                      </View>
                      <View style={visitorDashboardStyles.virtualNfcTapHintCopy}>
                        <Text style={visitorDashboardStyles.virtualNfcTapHintTitle}>
                          Ready To Tap
                        </Text>
                        <Text style={visitorDashboardStyles.virtualNfcTapHintText}>
                          Tap this phone on Android, or tap your assigned physical NFC card at the USB RFID reader.
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </View>
              </View>

              <View
                style={[
                  visitorDashboardStyles.virtualNfcInfoCard,
                  isCompactVirtualCardView && visitorDashboardStyles.virtualNfcInfoCardCompact,
                ]}
              >
                {[
                  "Use the card view above to confirm your approved visitor details.",
                  "On Android, the SafePass APK can present this virtual card to the USB RFID reader.",
                  "You can still tap your assigned physical NFC card at the lobby reader.",
                  "Security and admin monitoring will record the reader tap automatically.",
                ].map((item) => (
                  <View key={item} style={visitorDashboardStyles.virtualNfcInfoRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#0A3D91" />
                    <Text style={visitorDashboardStyles.virtualNfcInfoText}>{item}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View
              style={[
                visitorDashboardStyles.virtualNfcModalFooter,
                isCompactVirtualCardView && visitorDashboardStyles.virtualNfcModalFooterCompact,
              ]}
            >
              <TouchableOpacity
                style={visitorDashboardStyles.virtualNfcPrimaryButton}
                onPress={() => setShowVirtualNfcModal(false)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={visitorDashboardStyles.virtualNfcPrimaryButtonText}>
                  Got It
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCheckInModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCheckInModal(false)}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.accessFlowModalContent}>
            <LinearGradient
              colors={["#0A3D91", "#1C6DD0", "#0A3D91"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={visitorDashboardStyles.accessFlowHero}
            >
              <View style={visitorDashboardStyles.accessFlowHeroTop}>
                <View style={visitorDashboardStyles.accessFlowHeroBadge}>
                  <Ionicons name="log-in-outline" size={15} color="#0A3D91" />
                  <Text style={visitorDashboardStyles.accessFlowHeroBadgeText}>Arrival Flow</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCheckInModal(false)}>
                  <Ionicons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <Text style={visitorDashboardStyles.accessFlowTitle}>Ready To Check In?</Text>
              <Text style={visitorDashboardStyles.accessFlowSubtitle}>
                Confirm your arrival to activate your visit and notify the monitoring team.
              </Text>
            </LinearGradient>

            <ScrollView
              style={visitorDashboardStyles.accessFlowScroll}
              contentContainerStyle={visitorDashboardStyles.accessFlowBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={visitorDashboardStyles.checkInArrivalCard}>
                <View style={visitorDashboardStyles.checkInArrivalTopRow}>
                  <View style={visitorDashboardStyles.checkInArrivalIdentity}>
                    <View style={visitorDashboardStyles.checkInArrivalAvatar}>
                      <Text style={visitorDashboardStyles.checkInArrivalInitials}>
                        {visitor?.fullName
                          ?.split(" ")
                          .map((name) => name[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase() || "VP"}
                      </Text>
                    </View>
                    <View style={visitorDashboardStyles.checkInArrivalCopy}>
                      <Text style={visitorDashboardStyles.checkInArrivalName}>
                        {visitor?.fullName || "Visitor"}
                      </Text>
                      <Text style={visitorDashboardStyles.checkInArrivalPurpose}>
                        {visitor?.purposeOfVisit || "Approved visit"}
                      </Text>
                    </View>
                  </View>
                  <View style={visitorDashboardStyles.checkInArrivalStatusPill}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#0A3D91" />
                    <Text style={visitorDashboardStyles.checkInArrivalStatusText}>Approved</Text>
                  </View>
                </View>

                <View style={visitorDashboardStyles.checkInArrivalMetaGrid}>
                  <View style={visitorDashboardStyles.checkInArrivalMetaCard}>
                    <Text style={visitorDashboardStyles.checkInArrivalMetaLabel}>Visit Date</Text>
                    <Text style={visitorDashboardStyles.checkInArrivalMetaValue}>{formatDate(visitor?.visitDate)}</Text>
                  </View>
                  <View style={visitorDashboardStyles.checkInArrivalMetaCard}>
                    <Text style={visitorDashboardStyles.checkInArrivalMetaLabel}>Arrival Time</Text>
                    <Text style={visitorDashboardStyles.checkInArrivalMetaValue}>{formatTime(visitor?.visitTime)}</Text>
                  </View>
                  <View style={visitorDashboardStyles.checkInArrivalMetaCardWide}>
                    <Text style={visitorDashboardStyles.checkInArrivalMetaLabel}>Assigned Staff</Text>
                    <Text style={visitorDashboardStyles.checkInArrivalMetaValue}>
                      {visitor?.assignedStaffName || visitor?.appointmentDepartment || visitor?.assignedOffice || visitor?.host || "Front Office"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={visitorDashboardStyles.checkInArrivalGuideCard}>
                <Text style={visitorDashboardStyles.checkInArrivalGuideTitle}>What happens after check-in?</Text>
                {[
                  "You may check in up to 20 minutes early and wait in the lobby.",
                  "Please enter the office only when your appointment time starts.",
                  "You have a 15-minute grace period if you are running late.",
                ].map((item) => (
                  <View key={item} style={visitorDashboardStyles.checkInArrivalGuideRow}>
                    <View style={visitorDashboardStyles.checkInArrivalGuideIcon}>
                      <Ionicons name="checkmark" size={12} color="#0A3D91" />
                    </View>
                    <Text style={visitorDashboardStyles.checkInArrivalGuideText}>{item}</Text>
                  </View>
                ))}
              </View>

              {canSendRunningLateNotice(visitor) ? (
                <TouchableOpacity
                  style={visitorDashboardStyles.accessFlowLateNoticeButton}
                  onPress={() => notifyRunningLate(visitor)}
                  disabled={isSendingLateNotice}
                >
                  {isSendingLateNotice ? (
                    <ActivityIndicator size="small" color="#0A3D91" />
                  ) : (
                    <>
                      <Ionicons name="time-outline" size={18} color="#0A3D91" />
                      <Text style={visitorDashboardStyles.accessFlowLateNoticeButtonText}>
                        Tell Office I May Be Late
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              <View style={visitorDashboardStyles.accessFlowFooter}>
                <TouchableOpacity
                  style={visitorDashboardStyles.accessFlowSecondaryButton}
                  onPress={() => setShowCheckInModal(false)}
                  disabled={isCheckInLoading}
                >
                  <Text style={visitorDashboardStyles.accessFlowSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={visitorDashboardStyles.accessFlowPrimaryButton}
                  onPress={confirmCheckIn}
                  disabled={isCheckInLoading}
                >
                  {isCheckInLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                      <Text style={visitorDashboardStyles.accessFlowPrimaryButtonText}>Confirm Check In</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showVirtualNfcSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVirtualNfcSuccessModal(false)}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.accessFlowSuccessContent}>
            <View style={visitorDashboardStyles.accessFlowSuccessIconWrap}>
              <Ionicons name="checkmark-circle" size={54} color="#0A3D91" />
            </View>
            <Text style={visitorDashboardStyles.accessFlowSuccessTitle}>Checked In Successfully</Text>
            <Text style={visitorDashboardStyles.accessFlowSuccessText}>
              Your virtual NFC card was accepted. Security and admin have been notified of your arrival.
            </Text>

            <View style={visitorDashboardStyles.accessFlowSuccessMetaCard}>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Visitor</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>
                  {visitor?.fullName || "Visitor"}
                </Text>
              </View>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Checked In Via</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>Virtual NFC Card</Text>
              </View>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Visit Time</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>
                  {formatTime(visitor?.visitTime)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={visitorDashboardStyles.accessFlowPrimaryButton}
              onPress={() => setShowVirtualNfcSuccessModal(false)}
            >
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              <Text style={visitorDashboardStyles.accessFlowPrimaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCheckInSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCheckInSuccessModal(false)}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.accessFlowSuccessContent}>
            <View style={visitorDashboardStyles.accessFlowSuccessIconWrap}>
              <Ionicons name="checkmark-circle" size={54} color="#0A3D91" />
            </View>
            <Text style={visitorDashboardStyles.accessFlowSuccessTitle}>Arrival Confirmed</Text>
            <Text style={visitorDashboardStyles.accessFlowSuccessText}>
              Your visitor access is now active and the system has recorded your check-in.
            </Text>

            <View style={visitorDashboardStyles.checkInSuccessStamp}>
              <View style={visitorDashboardStyles.checkInSuccessStampHeader}>
                <Text style={visitorDashboardStyles.checkInSuccessStampLabel}>Campus Access Active</Text>
                <Text style={visitorDashboardStyles.checkInSuccessStampStatus}>Checked In</Text>
              </View>
              <Text style={visitorDashboardStyles.checkInSuccessStampName}>
                {visitor?.fullName || "Visitor"}
              </Text>
              <Text style={visitorDashboardStyles.checkInSuccessStampSubtext}>
                Proceed to your destination and keep your SafePass ready if requested by staff or security.
              </Text>
            </View>

            <View style={visitorDashboardStyles.accessFlowSuccessMetaCard}>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Arrival Time</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>{formatTime(visitor?.visitTime)}</Text>
              </View>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Visit Date</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>{formatDate(visitor?.visitDate)}</Text>
              </View>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Assigned Staff</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>
                  {visitor?.assignedStaffName || visitor?.appointmentDepartment || visitor?.assignedOffice || visitor?.host || "Front Office"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={visitorDashboardStyles.accessFlowPrimaryButton}
              onPress={() => setShowCheckInSuccessModal(false)}
            >
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              <Text style={visitorDashboardStyles.accessFlowPrimaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {renderProfileEditModal()}

      <Modal
        visible={showCheckOutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowCheckOutModal(false);
          setCheckOutTargetVisitor(null);
        }}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.accessFlowModalContent}>
            <LinearGradient
              colors={["#7F1D1D", "#DC2626", "#EF4444"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={visitorDashboardStyles.accessFlowHero}
            >
              <View style={visitorDashboardStyles.accessFlowHeroTop}>
                <View style={[visitorDashboardStyles.accessFlowHeroBadge, visitorDashboardStyles.accessFlowHeroBadgeDanger]}>
                  <Ionicons name="log-out-outline" size={15} color="#991B1B" />
                  <Text style={[visitorDashboardStyles.accessFlowHeroBadgeText, visitorDashboardStyles.accessFlowHeroBadgeTextDanger]}>
                    Departure Flow
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowCheckOutModal(false);
                    setCheckOutTargetVisitor(null);
                  }}
                >
                  <Ionicons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <Text style={visitorDashboardStyles.accessFlowTitle}>Check Out</Text>
              <Text style={visitorDashboardStyles.accessFlowSubtitle}>
                  Confirm that you are leaving campus so your visit can be completed properly.
              </Text>
            </LinearGradient>

            <View style={visitorDashboardStyles.accessFlowBody}>
              <View style={visitorDashboardStyles.accessFlowSummaryCard}>
                <View style={visitorDashboardStyles.accessFlowSummaryRow}>
                  <Text style={visitorDashboardStyles.accessFlowSummaryLabel}>Visitor</Text>
                  <Text style={visitorDashboardStyles.accessFlowSummaryValue}>
                    {(checkOutTargetVisitor || visitor)?.fullName || "Visitor"}
                  </Text>
                </View>
                <View style={visitorDashboardStyles.accessFlowSummaryRow}>
                  <Text style={visitorDashboardStyles.accessFlowSummaryLabel}>Status</Text>
                  <Text style={visitorDashboardStyles.accessFlowSummaryValue}>Checked In</Text>
                </View>
                <View style={visitorDashboardStyles.accessFlowSummaryRow}>
                  <Text style={visitorDashboardStyles.accessFlowSummaryLabel}>Visit Schedule</Text>
                  <Text style={visitorDashboardStyles.accessFlowSummaryValue}>
                    {formatDate((checkOutTargetVisitor || visitor)?.visitDate)} at {formatTime((checkOutTargetVisitor || visitor)?.visitTime)}
                  </Text>
                </View>
              </View>

              <View style={visitorDashboardStyles.accessFlowTimelineCard}>
                {[
                  "This will mark your visit as completed in the system.",
                  "Security and admin monitoring can track that you have checked out.",
                  "Your account will remain active for future appointments.",
                ].map((item) => (
                  <View key={item} style={visitorDashboardStyles.accessFlowTimelineRow}>
                    <View style={[visitorDashboardStyles.accessFlowTimelineDot, visitorDashboardStyles.accessFlowTimelineDotDanger]} />
                    <Text style={visitorDashboardStyles.accessFlowTimelineText}>{item}</Text>
                  </View>
                ))}
              </View>

              <View style={visitorDashboardStyles.accessFlowFooter}>
                <TouchableOpacity
                  style={visitorDashboardStyles.accessFlowSecondaryButton}
                  onPress={() => {
                    setShowCheckOutModal(false);
                    setCheckOutTargetVisitor(null);
                  }}
                  disabled={isCheckOutLoading}
                >
                  <Text style={visitorDashboardStyles.accessFlowSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={visitorDashboardStyles.accessFlowDangerButton}
                  onPress={confirmCheckOut}
                  disabled={isCheckOutLoading}
                >
                  {isCheckOutLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                      <Text style={visitorDashboardStyles.accessFlowPrimaryButtonText}>
                        Confirm Check Out
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCheckOutSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCheckOutSuccessModal(false)}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.accessFlowSuccessContent}>
            <View style={[visitorDashboardStyles.accessFlowSuccessIconWrap, visitorDashboardStyles.accessFlowSuccessIconWrapDanger]}>
              <Ionicons name="log-out-outline" size={46} color="#DC2626" />
            </View>
            <Text style={visitorDashboardStyles.accessFlowSuccessTitle}>Checked Out Successfully</Text>
            <Text style={visitorDashboardStyles.accessFlowSuccessText}>
              Thank you for visiting. Your visit has been completed and you have been removed from active monitoring.
            </Text>

            <View style={visitorDashboardStyles.accessFlowSuccessMetaCard}>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Visitor</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>
                  {visitor?.fullName || "Visitor"}
                </Text>
              </View>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Status</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>Checked Out</Text>
              </View>
              <View style={visitorDashboardStyles.accessFlowSuccessMetaRow}>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaLabel}>Account</Text>
                <Text style={visitorDashboardStyles.accessFlowSuccessMetaValue}>Still active for reappointment</Text>
              </View>
            </View>

            <TouchableOpacity
              style={visitorDashboardStyles.accessFlowDangerButton}
              onPress={() => setShowCheckOutSuccessModal(false)}
            >
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              <Text style={visitorDashboardStyles.accessFlowPrimaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={visitorDashboardStyles.modalOverlay}>
          <View style={visitorDashboardStyles.qrModalContent}>
            <LinearGradient
              colors={['#0A3D91', '#1C6DD0']}
              style={visitorDashboardStyles.qrModalHeader}
            >
              <Text style={visitorDashboardStyles.qrModalTitle}>Your Visitor Pass</Text>
              <TouchableOpacity onPress={() => setShowQRModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            <View style={visitorDashboardStyles.qrContainer}>
              <View style={visitorDashboardStyles.qrPlaceholder}>
                <Ionicons name="qr-code" size={180} color="#0A3D91" />
              </View>
              <Text style={visitorDashboardStyles.qrVisitorName}>{visitor?.fullName}</Text>
              <Text style={visitorDashboardStyles.qrVisitorId}>ID Used: {visitorPresentedIdLabel}</Text>
              
              <View style={visitorDashboardStyles.qrDivider} />
              
              <View style={visitorDashboardStyles.qrDetails}>
                <View style={visitorDashboardStyles.qrDetailRow}>
                  <Ionicons name="calendar" size={14} color="#6B7280" />
                  <Text style={visitorDashboardStyles.qrDetailText}>
                    {formatDate(visitor?.visitDate)}
                  </Text>
                </View>
                <View style={visitorDashboardStyles.qrDetailRow}>
                  <Ionicons name="time" size={14} color="#6B7280" />
                  <Text style={visitorDashboardStyles.qrDetailText}>
                    {formatTime(visitor?.visitTime)}
                  </Text>
                </View>
              </View>
              
              <View style={visitorDashboardStyles.qrFooter}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={visitorDashboardStyles.qrNote}>
                  Show this visitor pass at the security gate
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
