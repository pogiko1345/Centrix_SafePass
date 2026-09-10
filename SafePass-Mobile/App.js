import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AppState, View, Text, Platform, Image } from "react-native";
import {
  CommonActions,
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { brandColors } from "./styles/brandColors";
import AviationSplash from "./components/AviationSplash";
import NotificationInbox from "./components/NotificationInbox";
import WebAlertHost from "./components/WebAlertHost";
import { AviationTransitionContext } from "./utils/AviationTransitionContext";

import ApiService from "./utils/ApiService";
import {
  getDashboardRoute,
  isRecognizedRole,
  normalizeRole,
} from "./utils/authFlow";
import {
  APP_DISPLAY_NAME,
  APP_ORGANIZATION_NAME,
  IS_VISITOR_ONLY_APP,
  getVariantBlockedRoleMessage,
  getVariantInitialRoute,
  getVisitorBuildNavigationParams,
  isRoleAllowedInCurrentVariant,
} from "./utils/appVariant";

const Storage =
  Platform.OS === "web"
    ? require("./utils/webStorage").default
    : require("@react-native-async-storage/async-storage").default;

const Stack = createNativeStackNavigator();
const SCHOOL_LOGO = require("./assets/LogoSapphire.jpg");
const APP_DEBUG_ENABLED = process.env.EXPO_PUBLIC_APP_DEBUG === "true";
const logAppDebug = (...args) => {
  if (APP_DEBUG_ENABLED) {
    console.log(...args);
  }
};
const LoginScreen = lazy(() => import("./screens/LoginScreen"));
const RoleSelectScreen = lazy(() => import("./screens/RoleSelectScreen"));
const AdminDashboardScreen = lazy(() => import("./screens/AdminDashboardScreen"));
const SecurityDashboardScreen = lazy(() => import("./screens/SecurityDashboardScreen"));
const VisitorDashboardScreen = lazy(() => import("./screens/VisitorDashboardScreen"));
const StaffDashboardScreen = lazy(() => import("./screens/StaffDashboardScreen"));
const StudentDashboardScreen = lazy(() => import("./screens/StudentDashboardScreen"));
const ProfileScreen = lazy(() => import("./screens/ProfileScreenV2"));
const AccessLogScreen = lazy(() => import("./screens/AccessLogScreen"));
const NFCScanScreen = lazy(() => import("./screens/NFCScanScreen"));
const VisitorRegisterScreen = lazy(() => import("./screens/VisitorRegisterScreen"));
const HelpScreen = lazy(() => import("./screens/HelpScreen"));
const VerificationScreen = lazy(() => import("./screens/VerificationScreen"));
const VisitorPassScreen = lazy(() => import("./screens/VisitorPassScreen"));
const WebMapScreen = lazy(() => import("./screens/WebMapScreen"));
const VisitorManagementScreen = lazy(() => import("./screens/VisitorManagementScreen"));
const NFCManagementScreen = lazy(() => import("./screens/NFCManagementScreen"));
const AttendanceRecordsScreen = lazy(() => import("./screens/AttendanceRecordsScreen"));
const ReportsScreen = lazy(() => import("./screens/ReportsScreen"));
const SecurityLogsScreen = lazy(() => import("./screens/SecurityLogsScreen"));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen"));
const APP_NAME = APP_DISPLAY_NAME;
const APP_ORGANIZATION = APP_ORGANIZATION_NAME;
const MOBILE_IDLE_LOGOUT_MS = 30 * 60 * 1000;
const WEB_SESSION_LOGOUT_MS = 7 * 24 * 60 * 60 * 1000;
const IDLE_LOGOUT_MS =
  Platform.OS === "web" ? WEB_SESSION_LOGOUT_MS : MOBILE_IDLE_LOGOUT_MS;
const LAST_ACTIVITY_AT_KEY = "lastActivityAt";
const AUTH_NOTICE_KEY = "authNotice";
const SESSION_EXPIRED_MESSAGE =
  Platform.OS === "web"
    ? "Your web session has expired after 7 days. Please login again."
    : "You were inactive for 30 minutes. Please login again.";
const WEB_ROUTE_TITLES = {
  RoleSelect: `Access Portal | ${APP_ORGANIZATION}`,
  Login: `Login | ${APP_ORGANIZATION}`,
  VisitorRegister: `Visitor Registration | ${APP_ORGANIZATION}`,
  Verification: `Account Verification | ${APP_ORGANIZATION}`,
  Help: `Help Center | ${APP_ORGANIZATION}`,
  AdminDashboard: `Admin Dashboard | ${APP_ORGANIZATION}`,
  StaffDashboard: `Staff Dashboard | ${APP_ORGANIZATION}`,
  SecurityDashboard: `Security Operations | ${APP_ORGANIZATION}`,
  StudentDashboard: `Student Dashboard | ${APP_ORGANIZATION}`,
  VisitorDashboard: `Visitor Dashboard | ${APP_ORGANIZATION}`,
  VisitorPass: `Visitor Pass | ${APP_ORGANIZATION}`,
  WebMapScreen: `Campus Map | ${APP_ORGANIZATION}`,
  Profile: `Profile | ${APP_ORGANIZATION}`,
  AccessLog: `Access Logs | ${APP_ORGANIZATION}`,
  NFCScan: `NFC Scanner | ${APP_ORGANIZATION}`,
  VisitorManagement: `Visitor Management | ${APP_ORGANIZATION}`,
  NFCManagement: `NFC Management | ${APP_ORGANIZATION}`,
  AttendanceRecords: `Attendance Records | ${APP_ORGANIZATION}`,
  Reports: `Reports | ${APP_ORGANIZATION}`,
  SecurityLogs: `Security Logs | ${APP_ORGANIZATION}`,
  Settings: `Settings | ${APP_ORGANIZATION}`,
};
const SAFE_PASS_NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: brandColors.background,
    card: brandColors.background,
  },
};
const WEB_LINKING = {
  prefixes:
    Platform.OS === "web" && typeof window !== "undefined"
      ? [window.location.origin]
      : [],
  config: {
    initialRouteName: IS_VISITOR_ONLY_APP ? "Login" : "RoleSelect",
    screens: {
      ...(!IS_VISITOR_ONLY_APP ? { RoleSelect: "" } : {}),
      Login: IS_VISITOR_ONLY_APP ? "" : "login",
      VisitorRegister: "visitor-register",
      Verification: "verification",
      Help: "help",
      AdminDashboard: "admin",
      StaffDashboard: "staff",
      SecurityDashboard: "security",
      StudentDashboard: "student",
      VisitorDashboard: "visitor",
      VisitorPass: "visitor-pass",
      WebMapScreen: "campus-map",
      Profile: "profile",
      AccessLog: "access-log",
      NFCScan: "nfc-scan",
      VisitorManagement: "visitor-management",
      NFCManagement: "nfc-management",
      AttendanceRecords: "attendance-records",
      Reports: "reports",
      SecurityLogs: "security-logs",
      Settings: "settings",
    },
  },
};

const CHUNK_RELOAD_STORAGE_KEY = "safepass:lastChunkReloadAt";
const CHUNK_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;

const isChunkLoadFailure = (error) => {
  const message = `${error?.name || ""} ${error?.message || ""}`;
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk \d+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message)
  );
};

const reloadForChunkUpdate = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;

  const lastReloadAt = Number(
    window.sessionStorage?.getItem(CHUNK_RELOAD_STORAGE_KEY) || 0,
  );
  const canReload =
    !Number.isFinite(lastReloadAt) ||
    Date.now() - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS;

  if (!canReload) return false;

  window.sessionStorage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(Date.now()));
  window.location.reload();
  return true;
};

class ChunkLoadRecoveryBoundary extends React.Component {
  state = { error: null, hasChunkError: false };

  static getDerivedStateFromError(error) {
    return {
      error,
      hasChunkError: isChunkLoadFailure(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    // Keep the detailed error in the developer console, but never replace the
    // whole visitor site with a blank white page for an end user.
    console.error("SafePass screen failed to render.", error, errorInfo);

    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      isChunkLoadFailure(error)
    ) {
      reloadForChunkUpdate();
    }
  }

  recover = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
      return;
    }

    this.setState({ error: null, hasChunkError: false });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const title = this.state.hasChunkError
      ? "SafePass was updated"
      : "SafePass could not open this page";
    const message = this.state.hasChunkError
      ? "Refresh this page to load the latest visitor portal."
      : "Please refresh and try again. If the problem continues, return to the visitor sign-in page.";

    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: brandColors.background,
          paddingHorizontal: 24,
        }}
      >
        <Image
          source={SCHOOL_LOGO}
          resizeMode="contain"
          style={{ width: 116, height: 54, marginBottom: 18 }}
        />
        <Text
          style={{
            color: brandColors.text,
            fontSize: 16,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: brandColors.textMuted,
            fontSize: 14,
            textAlign: "center",
            marginBottom: 18,
          }}
        >
          {message}
        </Text>
        <Text
          accessibilityRole="button"
          onPress={this.recover}
          style={{
            color: brandColors.blue,
            fontSize: 14,
            fontWeight: "700",
            paddingHorizontal: 18,
            paddingVertical: 10,
          }}
        >
          Try again
        </Text>
      </View>
    );
  }
}

const ScreenFallback = () => (
  <View style={{ flex: 1, backgroundColor: brandColors.navy }}>
    <AviationSplash mode="landing" message="Landing campus access..." duration={1600} />
  </View>
);

const SCREEN_TRANSITION_DURATION = Platform.OS === "web" ? 280 : 300;

const DEFAULT_STACK_TRANSITION = {
  animation: "fade",
  animationDuration: SCREEN_TRANSITION_DURATION,
  animationTypeForReplace: "push",
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: brandColors.background },
};

const VISITOR_STACK_TRANSITION = {
  ...DEFAULT_STACK_TRANSITION,
  animationDuration: SCREEN_TRANSITION_DURATION,
};

const AUTH_STACK_TRANSITION = {
  ...DEFAULT_STACK_TRANSITION,
  animation: "fade",
  animationDuration: Platform.OS === "web" ? 260 : 280,
  animationTypeForReplace: "push",
  gestureDirection: "horizontal",
};

let logoutCallback = null;

const ProtectedScreen = ({
  currentUser,
  allowedRoles = [],
  navigation,
  children,
}) => {
  const [resolvedUser, setResolvedUser] = useState(currentUser || null);
  const [isVerifying, setIsVerifying] = useState(!currentUser);

  useEffect(() => {
    if (currentUser) {
      setResolvedUser(currentUser);
      setIsVerifying(false);
      return;
    }

    let isMounted = true;
    const restoreSession = async () => {
      try {
        const token = await ApiService.getToken();
        const cachedUser = await ApiService.getCurrentUser();
        const user = token ? (cachedUser || await ApiService.restoreCurrentUserFromToken()) : null;
        if (isMounted) {
          if (user) {
            const normalized = { ...user, role: normalizeRole(user.role) };
            setResolvedUser(normalized);
          } else {
            setResolvedUser(null);
            navigation.replace("Login");
          }
          setIsVerifying(false);
        }
      } catch {
        if (isMounted) {
          setResolvedUser(null);
          setIsVerifying(false);
          navigation.replace("Login");
        }
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [currentUser, navigation]);

  if (isVerifying) {
    return <ScreenFallback />;
  }

  const normalizedRole = normalizeRole(resolvedUser?.role);
  const isLoggedIn = Boolean(resolvedUser);
  const isAllowed =
    isLoggedIn &&
    (!allowedRoles.length || allowedRoles.includes(normalizedRole));

  if (!isLoggedIn) {
    return <ScreenFallback />;
  }

  if (!isAllowed) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: brandColors.background,
          padding: 24,
        }}
      >
        <Text
          style={{
            color: brandColors.text,
            fontSize: 20,
            fontWeight: "800",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Access unavailable
        </Text>
        <Text
          style={{
            color: brandColors.textMuted,
            fontSize: 14,
            textAlign: "center",
          }}
        >
          Your account does not have permission to open this page.
        </Text>
      </View>
    );
  }

  return children;
};

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const idleTimerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewRegistration, setIsNewRegistration] = useState(false);
  const [aviationTransition, setAviationTransition] = useState(null);
  const transitionActionRef = useRef(null);
  const transitionDoneRef = useRef(null);

  const startAviationTransition = useCallback((options = {}) => {
    transitionActionRef.current = options.onBeforeFade || null;
    transitionDoneRef.current = options.onDone || null;
    setAviationTransition({
      mode: options.mode || "journey",
      message: options.message || "Preparing for departure...",
      arrivalMessage: options.arrivalMessage || "Arriving at destination...",
      duration: options.duration || 2500,
    });
  }, []);

  const handleAviationTransitionBeforeFade = useCallback(() => {
    const action = transitionActionRef.current;
    transitionActionRef.current = null;
    action?.();
  }, []);

  const handleAviationTransitionDone = useCallback(() => {
    const done = transitionDoneRef.current;
    transitionDoneRef.current = null;
    setAviationTransition(null);
    done?.();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;

    const handleChunkFailure = (event) => {
      const error = event?.reason || event?.error || event;
      if (isChunkLoadFailure(error) && reloadForChunkUpdate()) {
        event?.preventDefault?.();
      }
    };

    window.addEventListener("error", handleChunkFailure);
    window.addEventListener("unhandledrejection", handleChunkFailure);

    return () => {
      window.removeEventListener("error", handleChunkFailure);
      window.removeEventListener("unhandledrejection", handleChunkFailure);
    };
  }, []);

  const resetToAuthRoute = useCallback(() => {
    const routeName = IS_VISITOR_ONLY_APP ? "Login" : "RoleSelect";
    if (navigationRef.isReady()) {
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: routeName }],
        }),
      );
    }
  }, [navigationRef]);

  const getStoredIdleState = useCallback(async () => {
    const lastActivityRaw = await Storage.getItem(LAST_ACTIVITY_AT_KEY);
    const lastActivityAt = Number(lastActivityRaw);

    if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) {
      return {
        expired: false,
        lastActivityAt: Date.now(),
        remainingMs: IDLE_LOGOUT_MS,
      };
    }

    const elapsedMs = Date.now() - lastActivityAt;
    return {
      expired: elapsedMs >= IDLE_LOGOUT_MS,
      lastActivityAt,
      remainingMs: Math.max(IDLE_LOGOUT_MS - elapsedMs, 0),
    };
  }, []);

  const performAppLogout = useCallback(async ({
    resetNavigation = true,
    notice = "",
  } = {}) => {
    try {
      await ApiService.logout();
    } catch (error) {
      logAppDebug("App logout API error ignored:", error);
      await ApiService.clearAuth();
    } finally {
      await Storage.removeItem(LAST_ACTIVITY_AT_KEY);
      if (notice) {
        await Storage.setItem(AUTH_NOTICE_KEY, notice);
      }
      setCurrentUser(null);
      setIsLoading(false);
      if (resetNavigation) {
        resetToAuthRoute();
      }
    }
  }, [resetToAuthRoute]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (!currentUser) return;

    Storage.setItem(LAST_ACTIVITY_AT_KEY, String(Date.now())).catch((error) => {
      logAppDebug("Persist last activity error:", error);
    });

    idleTimerRef.current = setTimeout(() => {
      performAppLogout({
        resetNavigation: true,
        notice: SESSION_EXPIRED_MESSAGE,
      });
    }, IDLE_LOGOUT_MS);
  }, [currentUser, performAppLogout]);

  const scheduleIdleTimerFromStoredActivity = useCallback(async () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (!currentUser) return;

    const idleState = await getStoredIdleState();
    if (idleState.expired) {
      await performAppLogout({
        resetNavigation: true,
        notice: SESSION_EXPIRED_MESSAGE,
      });
      return;
    }

    idleTimerRef.current = setTimeout(() => {
      performAppLogout({
        resetNavigation: true,
        notice: SESSION_EXPIRED_MESSAGE,
      });
    }, idleState.remainingMs || IDLE_LOGOUT_MS);
  }, [currentUser, getStoredIdleState, performAppLogout]);

  useEffect(() => {
    checkAuthStatus();

    logoutCallback = () => {
      logAppDebug("Global logout triggered from App.js");
      performAppLogout({ resetNavigation: true });
    };

    return () => {
      logoutCallback = null;
    };
  }, [performAppLogout]);

  useEffect(() => {
    if (!currentUser) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return undefined;
    }

    resetIdleTimer();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = /inactive|background/.test(appStateRef.current);
      appStateRef.current = nextState;
      if (nextState === "active" && wasBackground) {
        scheduleIdleTimerFromStoredActivity();
      }
    });

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
      activityEvents.forEach((eventName) => {
        window.addEventListener(eventName, resetIdleTimer, { passive: true });
      });

      return () => {
        appStateSubscription.remove();
        activityEvents.forEach((eventName) => {
          window.removeEventListener(eventName, resetIdleTimer);
        });
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
      };
    }

    return () => {
      appStateSubscription.remove();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [currentUser, resetIdleTimer, scheduleIdleTimerFromStoredActivity]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined" && isLoading) {
      document.title = `${APP_NAME} Portal | ${APP_ORGANIZATION}`;
    }
  }, [isLoading]);

  const checkAuthStatus = async () => {
    try {
      const registrationFlag = await Storage.getItem("isNewRegistration");

      if (registrationFlag === "true") {
        logAppDebug("New registration flow detected - staying on auth screens");
        setIsNewRegistration(true);
        setCurrentUser(null);
        await Storage.removeItem("isNewRegistration");
        setIsLoading(false);
        return;
      }

      const token = await ApiService.getToken();
      const user = token ? await ApiService.restoreCurrentUserFromToken() : null;
      logAppDebug("App.js checkAuthStatus - User found:", user ? "Yes" : "No");

      if (user) {
        const rememberedSessionActive = await ApiService.isRememberedSessionActive();
        if (!rememberedSessionActive) {
          logAppDebug("Remembered login expired. Asking user to sign in again.");
          await ApiService.clearAuth();
          await Storage.setItem(AUTH_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }

        const idleState = await getStoredIdleState();
        if (idleState.expired) {
          logAppDebug("Idle session expired. Asking user to sign in again.");
          await ApiService.clearAuth();
          await Storage.setItem(AUTH_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }

        const normalizedRole = normalizeRole(user.role);
        const normalizedUser = { ...user, role: normalizedRole };
        if (
          isRecognizedRole(normalizedRole) &&
          isRoleAllowedInCurrentVariant(normalizedRole)
        ) {
          await Storage.setItem(LAST_ACTIVITY_AT_KEY, String(Date.now()));
          setCurrentUser(normalizedUser);
        } else {
          logAppDebug(
            "User role is not available in this app build:",
            user.role,
          );
          if (
            normalizedRole &&
            !isRoleAllowedInCurrentVariant(normalizedRole)
          ) {
            logAppDebug(getVariantBlockedRoleMessage(normalizedRole));
          }
          await ApiService.clearAuth();
          setCurrentUser(null);
        }
      } else {
        const cachedUser = await ApiService.getCurrentUser();
        if (cachedUser && !token) {
          logAppDebug(
            "User cache exists but auth token is missing. Clearing stale auth state.",
          );
          await ApiService.clearAuth();
        }
        setCurrentUser(null);
      }
    } catch (error) {
      console.error("Auth check error:", error);
      const message = String(error?.message || "").toLowerCase();
      if (
        error?.status === 401 ||
        message.includes("401") ||
        message.includes("authenticate")
      ) {
        await ApiService.clearAuth();
        await Storage.setItem(AUTH_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
      }
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: brandColors.navy }}>
        <AviationSplash
          mode="landing"
          message="Restoring your campus session..."
          duration={1900}
        />
      </View>
    );
  }

  let initialRoute = getVariantInitialRoute({
    currentUser: null,
    isNewRegistration,
  });
  const passwordResetLinkParams =
    Platform.OS === "web" && typeof window !== "undefined"
      ? {
          resetEmail: new URLSearchParams(window.location.search || "").get("resetEmail") || "",
          resetToken: new URLSearchParams(window.location.search || "").get("resetToken") || "",
        }
      : { resetEmail: "", resetToken: "" };
  const hasPasswordResetLink =
    passwordResetLinkParams.resetEmail && passwordResetLinkParams.resetToken;
  if (!isNewRegistration && currentUser) {
    initialRoute = IS_VISITOR_ONLY_APP
      ? "VisitorDashboard"
      : getDashboardRoute(currentUser);
  } else if (hasPasswordResetLink) {
    initialRoute = "Login";
  }

  logAppDebug("App.js initialRoute:", initialRoute);
  logAppDebug("Current user:", currentUser ? `${currentUser.role}` : "None");

  return (
    <View style={{ flex: 1, backgroundColor: brandColors.background }} onTouchStart={resetIdleTimer}>
      <AviationTransitionContext.Provider value={startAviationTransition}>
        <NavigationContainer
          ref={navigationRef}
          theme={SAFE_PASS_NAV_THEME}
          linking={Platform.OS === "web" ? WEB_LINKING : undefined}
          documentTitle={{
            enabled: Platform.OS === "web",
            formatter: (_options, route) =>
              WEB_ROUTE_TITLES[route?.name] || `${APP_NAME} | ${APP_ORGANIZATION}`,
          }}
        >
        <ChunkLoadRecoveryBoundary>
        <Suspense fallback={<ScreenFallback />}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerShown: false,
              ...DEFAULT_STACK_TRANSITION,
            }}
          >
        {/* Auth & Role Selection */}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen
            name="RoleSelect"
            component={RoleSelectScreen}
            options={AUTH_STACK_TRANSITION}
          />
        )}
        <Stack.Screen
          name="Login"
          initialParams={passwordResetLinkParams}
          options={AUTH_STACK_TRANSITION}
        >
          {(props) => (
            <LoginScreen
              {...props}
              onLoginSuccess={(u) => setCurrentUser(u)}
              route={{
                ...props.route,
                params: {
                  ...(props.route?.params || {}),
                  ...(hasPasswordResetLink ? passwordResetLinkParams : {}),
                  ...(IS_VISITOR_ONLY_APP
                    ? getVisitorBuildNavigationParams()
                    : {}),
                },
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="VisitorRegister"
          component={VisitorRegisterScreen}
          options={VISITOR_STACK_TRANSITION}
        />
        <Stack.Screen
          name="Verification"
          component={VerificationScreen}
          options={VISITOR_STACK_TRANSITION}
        />

        {/* Help Screen */}
        <Stack.Screen
          name="Help"
          component={HelpScreen}
          options={VISITOR_STACK_TRANSITION}
        />

        {/* Dashboard Screens */}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="AdminDashboard">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin"]} navigation={props.navigation}>
                <AdminDashboardScreen
                  {...props}
                  onLogout={() => setCurrentUser(null)}
                />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="StaffDashboard">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["staff"]} navigation={props.navigation}>
                <StaffDashboardScreen
                  {...props}
                  onLogout={() => setCurrentUser(null)}
                />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="SecurityDashboard">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin", "security"]} navigation={props.navigation}>
                <SecurityDashboardScreen
                  {...props}
                  onLogout={() => setCurrentUser(null)}
                />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="StudentDashboard">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["student", "teacher"]} navigation={props.navigation}>
                <StudentDashboardScreen
                  {...props}
                />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        <Stack.Screen name="VisitorDashboard" options={VISITOR_STACK_TRANSITION}>
          {(props) => (
            <ProtectedScreen currentUser={currentUser} allowedRoles={["visitor"]} navigation={props.navigation}>
              <VisitorDashboardScreen
                {...props}
                onLogout={() => setCurrentUser(null)}
              />
            </ProtectedScreen>
          )}
        </Stack.Screen>

        {/* Visitor Screens */}
        <Stack.Screen
          name="VisitorPass"
          component={VisitorPassScreen}
          options={VISITOR_STACK_TRANSITION}
        />
        <Stack.Screen
          name="WebMapScreen"
          component={WebMapScreen}
          options={VISITOR_STACK_TRANSITION}
        />

        {/* Common Screens */}
        <Stack.Screen name="Profile" options={VISITOR_STACK_TRANSITION}>
          {(props) => (
            <ProtectedScreen currentUser={currentUser} navigation={props.navigation}>
              <ProfileScreen {...props} onLogout={() => setCurrentUser(null)} />
            </ProtectedScreen>
          )}
        </Stack.Screen>
        <Stack.Screen name="AccessLog" options={VISITOR_STACK_TRANSITION}>
          {(props) => (
            <ProtectedScreen currentUser={currentUser} allowedRoles={["admin", "security"]} navigation={props.navigation}>
              <AccessLogScreen {...props} />
            </ProtectedScreen>
          )}
        </Stack.Screen>
        <Stack.Screen name="NFCScan" options={VISITOR_STACK_TRANSITION}>
          {(props) => (
            <ProtectedScreen currentUser={currentUser} allowedRoles={["admin", "security", "staff"]} navigation={props.navigation}>
              <NFCScanScreen {...props} />
            </ProtectedScreen>
          )}
        </Stack.Screen>

        {/* Admin Management Screens */}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="VisitorManagement">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin"]} navigation={props.navigation}>
                <VisitorManagementScreen {...props} />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="NFCManagement">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin"]} navigation={props.navigation}>
                <NFCManagementScreen {...props} />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="AttendanceRecords">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin", "staff"]} navigation={props.navigation}>
                <AttendanceRecordsScreen {...props} />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="Reports">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin", "staff"]} navigation={props.navigation}>
                <ReportsScreen {...props} />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="SecurityLogs">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin", "security"]} navigation={props.navigation}>
                <SecurityLogsScreen {...props} />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
        {!IS_VISITOR_ONLY_APP && (
          <Stack.Screen name="Settings">
            {(props) => (
              <ProtectedScreen currentUser={currentUser} allowedRoles={["admin"]} navigation={props.navigation}>
                <SettingsScreen {...props} />
              </ProtectedScreen>
            )}
          </Stack.Screen>
        )}
          </Stack.Navigator>
        </Suspense>
        </ChunkLoadRecoveryBoundary>
        </NavigationContainer>
        <NotificationInbox currentUser={currentUser} />
        <WebAlertHost />
        {aviationTransition ? (
          <AviationSplash
            {...aviationTransition}
            onBeforeFade={handleAviationTransitionBeforeFade}
            onDone={handleAviationTransitionDone}
          />
        ) : null}
      </AviationTransitionContext.Provider>
    </View>
  );
}

export const triggerGlobalLogout = () => {
  if (logoutCallback) {
    logoutCallback();
  }
};
