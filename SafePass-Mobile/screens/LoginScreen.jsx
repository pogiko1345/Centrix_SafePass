import { WEB_VERSION_LABEL } from "../utils/webBranding";
import Alert from '../utils/Alert';
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Animated,
  Easing,
  Image,
  Linking,
  LogBox,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import loginStyles from "../styles/LoginStyles";
import { brandColors } from "../styles/brandColors";
import { Ionicons } from "@expo/vector-icons";
import SocialDock from "../components/SocialDock";
import AviationSplash from "../components/AviationSplash";
import { useAviationTransition } from "../utils/AviationTransitionContext";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import ApiService from "../utils/ApiService";
import useServerConnection from "../utils/useServerConnection";
import useGoogleSignIn from "../utils/useGoogleSignIn";
import { getDashboardRoute, normalizeRole } from "../utils/authFlow";
import {
  APP_ORGANIZATION_NAME,
  IS_VISITOR_ONLY_APP,
  getVariantBlockedRoleMessage,
  isRoleAllowedInCurrentVariant,
} from "../utils/appVariant";
import Logo from "../assets/LogoSapphire.jpg";

// Temporarily keep unfinished authentication options out of the production UI.
const GOOGLE_SIGN_IN_ENABLED = false;
const TRUST_DEVICE_ENABLED = false;

const isWeb = Platform.OS === "web";
const Storage = Platform.OS === "web"
  ? require("../utils/webStorage").default
  : require("@react-native-async-storage/async-storage").default;
const BIOMETRIC_LOGIN_EMAIL_KEY = "biometricLoginEmail";
const BIOMETRIC_LOGIN_PASSWORD_KEY = "biometricLoginPassword";
const getBiometricCredential = async (key) => {
  if (Platform.OS === "web") return Storage.getItem(key);
  return (await SecureStore.getItemAsync(key)) || Storage.getItem(key);
};
const setBiometricCredential = async (key, value) => {
  if (Platform.OS === "web") return Storage.setItem(key, value);
  await SecureStore.setItemAsync(key, value);
  await Storage.removeItem(key);
};
const LAST_ACTIVITY_AT_KEY = "lastActivityAt";
const AUTH_NOTICE_KEY = "authNotice";
const MOBILE_IDLE_SESSION_MS = 30 * 60 * 1000;
const WEB_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_RESTORE_TIMEOUT_MS =
  Platform.OS === "web" ? WEB_SESSION_MS : MOBILE_IDLE_SESSION_MS;
const SESSION_EXPIRED_MESSAGE =
  Platform.OS === "web"
    ? "Your web session has expired after 7 days. Please sign in again."
    : "You were inactive for 30 minutes. Please sign in again.";
const ACADEMY_LINKS = {
  facebook: "https://www.facebook.com/search/top/?q=Sapphire%20International%20Aviation%20Academy",
  youtube: "https://www.youtube.com/results?search_query=Sapphire+International+Aviation+Academy",
  website: "https://siaacentrixsafepass.com",
};

if (__DEV__) {
  LogBox.ignoreLogs([
    "Animated: `useNativeDriver` is not supported",
  ]);
}

export default function LoginScreen({ navigation, route, onLoginSuccess }) {
  const startAviationTransition = useAviationTransition();
  // Get role from navigation params
  const {
    role = IS_VISITOR_ONLY_APP ? "visitor" : "campus",
    initialEmail = "",
    initialPassword = "",
    skipArrivalSplash = false,
  } = route?.params || {};
  const effectiveRole = IS_VISITOR_ONLY_APP ? "visitor" : normalizeRole(role) || "campus";
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const showDesktopLoginDesign = isWeb && viewportWidth >= 1080;
  const shouldLockDesktopScroll = false;
  const isCompactLogin = viewportWidth <= 420;
  const isTabletLogin = viewportWidth >= 768;
  const loginHorizontalPadding = isCompactLogin ? 12 : 20;
  const loginMaxContentWidth = Math.min(
    520,
    Math.max(viewportWidth - loginHorizontalPadding * 2, 280)
  );
  const headerResponsiveStyle = {
    paddingHorizontal: isCompactLogin ? 16 : isTabletLogin ? 28 : 24,
    paddingTop: isCompactLogin ? 30 : undefined,
    paddingBottom: isCompactLogin ? 22 : isTabletLogin ? 68 : 58,
  };
  const logoResponsiveStyle = {
    width: isCompactLogin ? 52 : isTabletLogin ? 92 : 82,
    height: isCompactLogin ? 52 : isTabletLogin ? 92 : 82,
    borderRadius: isCompactLogin ? 26 : isTabletLogin ? 46 : 41,
  };
  const appNameResponsiveStyle = {
    fontSize: isCompactLogin ? 20 : isTabletLogin ? 28 : 26,
    lineHeight: isCompactLogin ? 25 : isTabletLogin ? 34 : 32,
  };
  const cardResponsiveStyle = {
    marginHorizontal: loginHorizontalPadding,
    marginTop: isCompactLogin ? 2 : -30,
    padding: isCompactLogin ? 14 : 24,
    ...(isWeb ? { maxWidth: loginMaxContentWidth } : null),
  };
  const roleHeroResponsiveStyle = isCompactLogin
    ? { display: "none" }
    : null;
  const roleIconResponsiveStyle = isCompactLogin
    ? { width: 42, height: 42, borderRadius: 8, marginRight: 10 }
    : null;
  const welcomeTitleResponsiveStyle = {
    fontSize: isCompactLogin ? 22 : isTabletLogin ? 30 : 28,
    lineHeight: isCompactLogin ? 28 : 34,
  };
  const welcomeSubtitleResponsiveStyle = {
    marginBottom: isCompactLogin ? 12 : 24,
    ...(isCompactLogin ? { fontSize: 13, lineHeight: 18 } : null),
  };
  const authRowResponsiveStyle = isCompactLogin
    ? { flexDirection: "column", alignItems: "flex-start", gap: 12, marginBottom: 20 }
    : null;
  const footerResponsiveStyle = {
    paddingHorizontal: loginHorizontalPadding,
    paddingBottom: isCompactLogin ? 28 : 22,
  };
  const footerContactCardResponsiveStyle = {
    padding: isCompactLogin ? 14 : 16,
    ...(isWeb ? { maxWidth: loginMaxContentWidth } : null),
  };
  const forgotModalContentResponsiveStyle = {
    maxHeight: viewportHeight <= 760 ? "96%" : "92%",
    borderRadius: isCompactLogin ? 18 : 24,
  };
  const forgotModalHeroResponsiveStyle = {
    paddingHorizontal: isCompactLogin ? 16 : 24,
    paddingTop: isCompactLogin ? 16 : 22,
    paddingBottom: isCompactLogin ? 14 : 22,
  };
  const forgotModalHeroTopRowResponsiveStyle = isCompactLogin
    ? { alignItems: "flex-start", gap: 10 }
    : null;
  const forgotModalBrandBadgeResponsiveStyle = isCompactLogin
    ? { paddingVertical: 7, paddingHorizontal: 10 }
    : null;
  const forgotModalStepRowResponsiveStyle = isCompactLogin
    ? { gap: 6, marginTop: 12 }
    : null;
  const forgotModalBodyContentResponsiveStyle = {
    padding: isCompactLogin ? 16 : 24,
    paddingBottom: isCompactLogin ? 24 : 28,
  };
  
  // ============ STATE MANAGEMENT ============
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginSplashMessage, setLoginSplashMessage] = useState("Signing you in...");
  const apiConnected = useServerConnection();
  const [errors, setErrors] = useState({});
  const [loginError, setLoginError] = useState("");
  const [loginSuccessMessage, setLoginSuccessMessage] = useState("");
  const [biometricLoginReady, setBiometricLoginReady] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [pendingVisitorOtpEmail, setPendingVisitorOtpEmail] = useState("");
  const [loginOtpCode, setLoginOtpCode] = useState("");
  const [loginOtpError, setLoginOtpError] = useState("");
  const [isLoginOtpBusy, setIsLoginOtpBusy] = useState(false);
  const [loginOtpResendAvailableAt, setLoginOtpResendAvailableAt] = useState(null);
  const [loginOtpResendSecondsLeft, setLoginOtpResendSecondsLeft] = useState(0);
  const [characterLook, setCharacterLook] = useState({ x: 0, y: 0 });
  const [arrivalVisible, setArrivalVisible] = useState(!skipArrivalSplash);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const hasHandledInitialFocusRef = useRef(false);

  // Web biometric authentication state
  const [isWebBiometricSupported, setIsWebBiometricSupported] = useState(false);
  const [webBiometricChallenge, setWebBiometricChallenge] = useState(null);
  const [webBiometricUserId, setWebBiometricUserId] = useState(null);
  const [webBiometricUsername, setWebBiometricUsername] = useState("");
  const [isWebAuthnAvailable, setIsWebAuthnAvailable] = useState(false);
  const { googleClientId, googleRequest, promptGoogleSignIn: promptGoogleSignIn } = useGoogleSignIn();
  const [socialLoginProvider, setSocialLoginProvider] = useState("");
  const [socialLoginHover, setSocialLoginHover] = useState("");

  // Animation values
  const fadeAnim = useRef(new Animated.Value(skipArrivalSplash ? 1 : 0)).current;
  const loginExitAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(skipArrivalSplash ? 0 : 14)).current;
  const logoPulseAnim = useRef(new Animated.Value(0)).current;
  const statusPulseAnim = useRef(new Animated.Value(1)).current;
  const loginButtonPressAnim = useRef(new Animated.Value(1)).current;
  const loginButtonHoverAnim = useRef(new Animated.Value(0)).current;
  const loginButtonFloatAnim = useRef(new Animated.Value(0)).current;


  // ============ FORGOT PASSWORD STATES ============
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetEmailError, setResetEmailError] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetOtpError, setResetOtpError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [confirmNewPasswordError, setConfirmNewPasswordError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetTimer, setResetTimer] = useState(60);
  const [canResendReset, setCanResendReset] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });

  // Refs for web keyboard navigation
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const loginButtonRef = useRef(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setTransitionBusy(false);
      if (!hasHandledInitialFocusRef.current) {
        hasHandledInitialFocusRef.current = true;
        return;
      }
      if (route?.params?.skipArrivalSplash) {
        navigation.setParams?.({ skipArrivalSplash: false });
        return;
      }
      setArrivalVisible(true);
    });

    return unsubscribe;
  }, [navigation, route?.params?.skipArrivalSplash]);


  // ============ ANIMATIONS ============
  const playLoginEntrance = () => {
    if (isWeb) { fadeAnim.setValue(1); slideAnim.setValue(0); return; }
    fadeAnim.setValue(0);
    slideAnim.setValue(14);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 540,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  };

  useEffect(() => {
    if (skipArrivalSplash) {
      playLoginEntrance();
    }
    if (isWeb) { fadeAnim.setValue(1); slideAnim.setValue(0); return; }
    const logoPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulseAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(logoPulseAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    const statusPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(statusPulseAnim, {
          toValue: 1.04,
          duration: 1100,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(statusPulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    const buttonFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(loginButtonFloatAnim, {
          toValue: 1,
          duration: 2300,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(loginButtonFloatAnim, {
          toValue: 0,
          duration: 2300,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    logoPulse.start();
    statusPulse.start();
    loginButtonFloatAnim.setValue(0);

    return () => {
      logoPulse.stop();
      statusPulse.stop();
      buttonFloat.stop();
    };
  }, [fadeAnim, loginButtonFloatAnim, logoPulseAnim, skipArrivalSplash, slideAnim, statusPulseAnim]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.title = `Login | ${APP_ORGANIZATION_NAME}`;
    }
  }, []);

  // Initialize WebAuthn options when component mounts
  useEffect(() => {
  }, []);

  // Function to initialize WebAuthn options
  const initializeWebAuthnOptions = async () => {
    try {
      // Generate a challenge for WebAuthn
      const challenge = await fetch('/api/webauthn/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: email || 'web_user' })
      });

      const challengeData = await challenge.json();
      setWebBiometricChallenge(challengeData.challenge);
      setWebBiometricUserId(challengeData.userId);
      setWebBiometricUsername(challengeData.username);
    } catch (error) {
      console.warn('WebAuthn initialization failed:', error);
      // Fall back to regular login if WebAuthn setup fails
    }
  };

  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return undefined;

    const handleMouseMove = (event) => {
      const nextX = Math.max(-1, Math.min(1, (event.clientX - viewportWidth / 2) / (viewportWidth / 2)));
      const nextY = Math.max(-1, Math.min(1, (event.clientY - viewportHeight / 2) / (viewportHeight / 2)));
      setCharacterLook({ x: nextX, y: nextY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [viewportHeight, viewportWidth]);

  const normalizeLoginIdentifier = (value) => {
    const trimmedValue = String(value || "").trim();
    return trimmedValue.includes("@") ? trimmedValue.toLowerCase() : trimmedValue;
  };

  const normalizeResetEmailValue = (value) => String(value || "").trim().toLowerCase();

  const isSchoolManagedIdentifier = (value) => {
    const identifier = normalizeResetEmailValue(value);
    return (
      identifier.endsWith("@sapphire.edu") ||
      identifier.endsWith("@sapphireaviationacademy.edu.ph") ||
      /^(student|staff|teacher|admin|security|guard)[\w.-]*@/.test(identifier) ||
      /^(student|staff|teacher|admin|security|guard)[\w.-]*$/.test(identifier)
    );
  };

  const getRoleDisplayName = (role) => {
    switch (normalizeRole(role)) {
      case "student":
        return "Student";
      case "teacher":
        return "Teacher";
      case "staff":
        return "Staff";
      case "security":
      case "guard":
        return "Security";
      case "admin":
        return "Admin";
      case "visitor":
        return "Visitor";
      default:
        return "Campus";
    }
  };

  const normalizeResetOtpValue = (value) =>
    String(value || "").replace(/[^0-9]/g, "").slice(0, 6);

  const formatOtpTimer = (seconds = 0) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
    if (initialPassword) {
      setPassword(initialPassword);
    }
  }, [initialEmail, initialPassword]);

  useEffect(() => {
    const routeResetEmail = route?.params?.resetEmail;
    const routeResetToken = route?.params?.resetToken;
    let linkResetEmail = routeResetEmail;
    let linkResetToken = routeResetToken;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const query = new URLSearchParams(window.location.search || "");
      linkResetEmail = linkResetEmail || query.get("resetEmail");
      linkResetToken = linkResetToken || query.get("resetToken");
    }

    if (linkResetEmail && linkResetToken) {
      setShowForgotPassword(true);
      setResetStep(3);
      setResetEmail(normalizeResetEmailValue(linkResetEmail));
      setResetToken(String(linkResetToken).trim());
      setResetEmailError("");
      setResetOtp("");
      setResetOtpError("");
      setNewPassword("");
      setNewPasswordError("");
      setConfirmNewPassword("");
      setConfirmNewPasswordError("");
    }
  }, [route?.params?.resetEmail, route?.params?.resetToken]);

  // ============ AUTH CHECK ============
  useEffect(() => {
    checkAuthAndConnection();
  }, []);

  useEffect(() => {
    const loadBiometricState = async () => {
      if (Platform.OS === "web") return;
      try {
        const [enabled, storedEmail, storedPassword, hasHardware, enrolled] = await Promise.all([
          Storage.getItem("biometricEnabled"),
          getBiometricCredential(BIOMETRIC_LOGIN_EMAIL_KEY),
          getBiometricCredential(BIOMETRIC_LOGIN_PASSWORD_KEY),
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        setBiometricLoginReady(
          enabled === "true" && Boolean(storedEmail) && Boolean(storedPassword) && hasHardware && enrolled,
        );
      } catch {
        setBiometricLoginReady(false);
      }
    };

    loadBiometricState();
  }, []);

  // Timer for Reset OTP
  useEffect(() => {
    let interval;
    if (resetStep === 2 && resetTimer > 0) {
      interval = setInterval(() => {
        setResetTimer((prev) => prev - 1);
      }, 1000);
    } else if (resetTimer === 0) {
      setCanResendReset(true);
    }
    return () => clearInterval(interval);
  }, [resetStep, resetTimer]);

  useEffect(() => {
    if (!loginOtpResendAvailableAt) {
      setLoginOtpResendSecondsLeft(0);
      return undefined;
    }

    const updateTimer = () => {
      const availableTime = new Date(loginOtpResendAvailableAt).getTime();
      if (!Number.isFinite(availableTime)) {
        setLoginOtpResendSecondsLeft(0);
        return;
      }
      setLoginOtpResendSecondsLeft(Math.max(0, Math.ceil((availableTime - Date.now()) / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [loginOtpResendAvailableAt]);

  const checkAuthAndConnection = async () => {
    try {
      const authNotice = await Storage.getItem(AUTH_NOTICE_KEY);
      if (authNotice) {
        setLoginError(authNotice);
        await Storage.removeItem(AUTH_NOTICE_KEY);
      }

      await Storage.removeItem("rememberedEmail");
      
      const isNewRegistration = await Storage.getItem('isNewRegistration');
      
      if (isNewRegistration === 'true') {
        await ApiService.clearAuth();
        return;
      }
      
      const token = await ApiService.getToken();
      const user = token ? await ApiService.restoreCurrentUserFromToken() : null;
      
      if (token && user) {
        const rememberedSessionActive = await ApiService.isRememberedSessionActive();
        if (!rememberedSessionActive) {
          await ApiService.clearAuth();
          setEmail("");
          setRememberMe(false);
          setLoginError(SESSION_EXPIRED_MESSAGE);
          return;
        }

        const lastActivityRaw = await Storage.getItem(LAST_ACTIVITY_AT_KEY);
        const lastActivityAt = Number(lastActivityRaw);
        if (
          Number.isFinite(lastActivityAt) &&
          lastActivityAt > 0 &&
          Date.now() - lastActivityAt >= SESSION_RESTORE_TIMEOUT_MS
        ) {
          await ApiService.clearAuth();
          setEmail("");
          setRememberMe(false);
          setLoginError(SESSION_EXPIRED_MESSAGE);
          return;
        }

        const normalizedRole = normalizeRole(user.role);
        if (!isRoleAllowedInCurrentVariant(normalizedRole)) {
          await ApiService.clearAuth();
          setLoginError(getVariantBlockedRoleMessage(normalizedRole));
          return;
        }

        await Storage.setItem(LAST_ACTIVITY_AT_KEY, String(Date.now()));
        const route = getDashboardRoute({ ...user, role: normalizedRole });
        navigation.reset({
          index: 0,
          routes: [{ name: IS_VISITOR_ONLY_APP ? "VisitorDashboard" : route }],
        });
      } else if (token || (await Storage.getItem("currentUser"))) {
        await ApiService.clearAuth();
        setLoginError(SESSION_EXPIRED_MESSAGE);
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
        setLoginError(SESSION_EXPIRED_MESSAGE);
      }
    }
  };

  // ============ VALIDATION ============
  const validateForm = () => {
    const newErrors = {};
    const normalizedIdentifier = normalizeLoginIdentifier(email);
    
    if (!normalizedIdentifier) {
      newErrors.email = "Username or email is required";
    } else if (normalizedIdentifier.includes("@") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)) {
      newErrors.email = "Please enter a valid email address";
    }
    
    if (!password.trim()) {
      newErrors.password = "Password is required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateEmailField = () => {
    const normalizedIdentifier = normalizeLoginIdentifier(email);
    const emailError = !normalizedIdentifier
      ? "Username or email is required"
      : normalizedIdentifier.includes("@") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)
        ? "Please enter a valid email address"
        : "";
    setErrors((prev) => ({ ...prev, email: emailError }));
    return !emailError;
  };

  const validatePasswordField = () => {
    const passwordError = password.trim() ? "" : "Password is required";
    setErrors((prev) => ({ ...prev, password: passwordError }));
    return !passwordError;
  };

  // Clear login error when user starts typing
  const handleEmailChange = (text) => {
    setEmail(text.replace(/^\s+/, ""));
    setLoginError("");
    setLoginSuccessMessage("");
    setPendingVisitorOtpEmail("");
    setLoginOtpCode("");
    setLoginOtpError("");
    setLoginOtpResendAvailableAt(null);
    if (errors.email) {
      setErrors({ ...errors, email: "" });
    }
  };

  const handlePasswordChange = (text) => {
    setPassword(text);
    setLoginError("");
    setLoginSuccessMessage("");
    if (errors.password) {
      setErrors({ ...errors, password: "" });
    }
  };

  const handleLoginOtpChange = (text) => {
    setLoginOtpCode(normalizeResetOtpValue(text));
    setLoginOtpError("");
  };

  const handleResendVisitorOtp = async () => {
    const otpEmail = normalizeResetEmailValue(pendingVisitorOtpEmail || email);
    if (!otpEmail) {
      setLoginOtpError("Enter your email first.");
      return;
    }

    try {
      setIsLoginOtpBusy(true);
      setLoginOtpError("");
      const response = await ApiService.resendRegistrationOtp(otpEmail);
      if (response?.success) {
        setPendingVisitorOtpEmail(otpEmail);
        setLoginOtpCode("");
        setLoginOtpResendAvailableAt(new Date(Date.now() + 60 * 1000).toISOString());
        setLoginSuccessMessage(
          response.otpDeliveryMode === "backend_log"
            ? "A new code is in the development backend logs. Ask the developer for it."
            : "A new verification code was sent to your email.",
        );
        return;
      }
      setLoginOtpError(response?.message || "Unable to resend OTP. Please try again.");
    } catch (error) {
      setLoginOtpError(error?.message || "Unable to resend OTP. Please try again.");
    } finally {
      setIsLoginOtpBusy(false);
    }
  };

  const handleVerifyVisitorOtpFromLogin = async () => {
    const otpEmail = normalizeResetEmailValue(pendingVisitorOtpEmail || email);
    const otpCode = normalizeResetOtpValue(loginOtpCode);

    if (!otpEmail) {
      setLoginOtpError("Enter your email first.");
      return;
    }
    if (otpCode.length !== 6) {
      setLoginOtpError("Enter the 6-digit verification code.");
      return;
    }

    try {
      setIsLoginOtpBusy(true);
      setLoginOtpError("");
      const response = await ApiService.verifyRegistrationOtp(otpEmail, otpCode);
      if (response?.success) {
        setPendingVisitorOtpEmail("");
        setLoginOtpCode("");
        setLoginOtpResendAvailableAt(null);
        setLoginSuccessMessage("Account verified. Signing you in...");
        await handleLogin();
        return;
      }
      setLoginOtpError(response?.message || "Invalid OTP code. Please try again.");
    } catch (error) {
      setLoginOtpError(error?.message || "Invalid OTP code. Please try again.");
    } finally {
      setIsLoginOtpBusy(false);
    }
  };

  const persistAuthenticatedSession = async ({ token, user, rememberEmail }) => {
    const normalizedUser = {
      ...user,
      role: normalizeRole(user?.role) || "visitor",
    };

    if (token) {
      await ApiService.setToken(token);
    }

    await Storage.setItem("currentUser", JSON.stringify(normalizedUser));
    await ApiService.rememberCurrentSession();

    await Storage.removeItem("rememberedEmail");

    if (rememberEmail) {
      await ApiService.trustDevice(normalizedUser);
    } else {
      await ApiService.clearTrustedDevice();
    }

    await Storage.removeItem("isNewRegistration");
    if (typeof onLoginSuccess === "function") {
      try { onLoginSuccess(normalizedUser); } catch {}
    }
    return normalizedUser;
  };

  const saveBiometricCredentialsIfEnabled = async (loginIdentifier, loginPassword) => {
    if (Platform.OS === "web") return;
    try {
      const enabled = await Storage.getItem("biometricEnabled");
      if (enabled === "true" && loginIdentifier && loginPassword) {
        await setBiometricCredential(BIOMETRIC_LOGIN_EMAIL_KEY, loginIdentifier);
        await setBiometricCredential(BIOMETRIC_LOGIN_PASSWORD_KEY, loginPassword);
        setBiometricLoginReady(true);
      }
    } catch (error) {
      console.log("Save biometric login credentials error:", error);
    }
  };

  // ============ FORGOT PASSWORD VALIDATION ============
  const validateResetEmailField = () => {
    const normalizedResetEmail = normalizeResetEmailValue(resetEmail);

    if (!normalizedResetEmail) {
      setResetEmailError("Email is required");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedResetEmail)) {
      setResetEmailError("Please enter a valid email address");
      return false;
    }
    setResetEmailError("");
    return true;
  };

  const validateResetOtpField = () => {
    const normalizedResetOtp = normalizeResetOtpValue(resetOtp);

    if (!normalizedResetOtp) {
      setResetOtpError("Verification code is required");
      return false;
    }
    if (normalizedResetOtp.length !== 6) {
      setResetOtpError("Code must be 6 digits");
      return false;
    }
    setResetOtpError("");
    return true;
  };

  const validateNewPasswordField = () => {
    if (!newPassword) {
      setNewPasswordError("Password is required");
      return false;
    }
    if (newPassword.length < 8) {
      setNewPasswordError("Password must be at least 8 characters");
      return false;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setNewPasswordError("Must contain at least one uppercase letter");
      return false;
    }
    if (!/[a-z]/.test(newPassword)) {
      setNewPasswordError("Must contain at least one lowercase letter");
      return false;
    }
    if (!/[0-9]/.test(newPassword)) {
      setNewPasswordError("Must contain at least one number");
      return false;
    }
    setNewPasswordError("");
    return true;
  };

  const validateConfirmPasswordField = () => {
    if (!confirmNewPassword) {
      setConfirmNewPasswordError("Please confirm your password");
      return false;
    }
    if (confirmNewPassword !== newPassword) {
      setConfirmNewPasswordError("Passwords do not match");
      return false;
    }
    setConfirmNewPasswordError("");
    return true;
  };

  // ============ PASSWORD STRENGTH VALIDATION ============
  const validatePasswordStrength = (password) => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
    setPasswordChecks(checks);
    
    const strength = Object.values(checks).filter(Boolean).length;
    setPasswordStrength(strength);
    return checks;
  };

  // ============ FORGOT PASSWORD FUNCTIONS ============
  const handleForgotPassword = () => {
    clearPasswordResetRouteParams();
    setLoginSuccessMessage("");
    setShowForgotPassword(true);
    setResetStep(1);
    setResetEmail("");
    setResetEmailError("");
    setResetOtp("");
    setResetOtpError("");
    setResetToken("");
    setNewPassword("");
    setNewPasswordError("");
    setConfirmNewPassword("");
    setConfirmNewPasswordError("");
    setResetTimer(60);
    setCanResendReset(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setPasswordStrength(0);
    setPasswordChecks({
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false,
    });
  };

  const handleCloseForgotPassword = () => {
    clearPasswordResetRouteParams();
    setShowForgotPassword(false);
    setResetStep(1);
    setResetEmail("");
    setResetEmailError("");
    setResetOtp("");
    setResetOtpError("");
    setResetToken("");
    setNewPassword("");
    setNewPasswordError("");
    setConfirmNewPassword("");
    setConfirmNewPasswordError("");
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
  };

  const handleSendResetOtp = async () => {
    if (!validateResetEmailField()) return;

    const normalizedResetEmail = normalizeResetEmailValue(resetEmail);
    setResetEmail(normalizedResetEmail);
    setResetToken("");
    
    setIsLoading(true);
    try {
      const response = await ApiService.requestPasswordReset(normalizedResetEmail);
      
      if (response.success) {
        setResetStep(2);
        setResetTimer(60);
        setCanResendReset(false);
        Alert.alert(
          "Reset Email Sent",
          `A verification code and secure reset link have been sent to ${normalizedResetEmail}.`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("Error", response.message || "Failed to send reset code");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to send reset code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    if (!validateResetOtpField()) return;

    const normalizedResetEmail = normalizeResetEmailValue(resetEmail);
    const normalizedResetOtp = normalizeResetOtpValue(resetOtp);
    setResetEmail(normalizedResetEmail);
    setResetOtp(normalizedResetOtp);

    setIsLoading(true);
    try {
      const response = await ApiService.verifyPasswordResetOtp(
        normalizedResetEmail,
        normalizedResetOtp,
      );
      
      if (response.success) {
        setResetToken("");
        setResetStep(3);
        Alert.alert("Code Verified", "Please enter your new password.");
      } else {
        setResetOtpError("Invalid verification code");
        Alert.alert("Error", response.message || "Invalid verification code. Please try again.");
      }
    } catch (error) {
      setResetOtpError("Verification failed");
      Alert.alert("Error", "Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendResetOtp = async () => {
    if (canResendReset) {
      setResetTimer(60);
      setCanResendReset(false);
      setResetOtp("");
      setResetOtpError("");
      await handleSendResetOtp();
    } else {
      Alert.alert("Please Wait", `Please wait ${resetTimer} seconds before resending.`);
    }
  };

  const handleResetPassword = async () => {
    const isPasswordValid = validateNewPasswordField();
    const isConfirmValid = validateConfirmPasswordField();
    
    if (!isPasswordValid || !isConfirmValid) return;
    
    setIsLoading(true);
    try {
      const response = await ApiService.resetPassword(
        normalizeResetEmailValue(resetEmail),
        newPassword,
        resetToken,
      );
      
      if (response.success) {
        const normalizedResetEmail = normalizeResetEmailValue(resetEmail);
        clearPasswordResetRouteParams();
        setShowForgotPassword(false);
        setResetStep(1);
        setEmail(normalizedResetEmail);
        setPassword("");
        setResetEmail(normalizedResetEmail);
        setResetOtp("");
        setResetOtpError("");
        setResetToken("");
        setNewPassword("");
        setNewPasswordError("");
        setConfirmNewPassword("");
        setConfirmNewPasswordError("");
        setShowNewPassword(false);
        setShowConfirmNewPassword(false);
        setPasswordStrength(0);
        setPasswordChecks({
          length: false,
          uppercase: false,
          lowercase: false,
          number: false,
          special: false,
        });
        setLoginError("");
        setLoginSuccessMessage("Thank you. Your password has been changed. Please log in with your new password.");
      } else {
        Alert.alert("Error", response.message || "Failed to reset password");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to reset password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ============ PASSWORD STRENGTH UI ============
  const getPasswordStrengthColor = () => {
    const colors = [
      brandColors.border,
      brandColors.danger,
      brandColors.warning,
      brandColors.success,
      brandColors.blue,
      brandColors.blue,
    ];
    return colors[passwordStrength] || colors[0];
  };

  const getPasswordStrengthText = () => {
    const texts = ['Enter password', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    return texts[passwordStrength] || texts[0];
  };

  const clearPasswordResetRouteParams = () => {
    if (typeof navigation?.setParams === "function") {
      navigation.setParams({
        resetEmail: undefined,
        resetToken: undefined,
      });
    }
  };

  // ============ LOGIN HANDLER - 2FA FOR EVERYONE ============
  const handleBiometricLogin = async () => {
    if (Platform.OS === "web" || isLoading || isBiometricLoading) return;

    setIsBiometricLoading(true);
    setLoginError("");
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Sign in to Sapphire",
        fallbackLabel: "Use passcode",
      });

      if (!result.success) {
        setLoginError("Biometric authentication was cancelled or failed.");
        return;
      }

      const storedEmail = await getBiometricCredential(BIOMETRIC_LOGIN_EMAIL_KEY);
      const storedPassword = await getBiometricCredential(BIOMETRIC_LOGIN_PASSWORD_KEY);

      if (!storedEmail || !storedPassword) {
        setBiometricLoginReady(false);
        setLoginError("Please log in with your password once to activate biometric login.");
        return;
      }

      setEmail(storedEmail);
      setPassword(storedPassword);
      setRememberMe(true);

      const verifyResponse = await ApiService.verifyCredentials(storedEmail, storedPassword);
      if (!verifyResponse?.success) {
        setLoginError("Biometric login failed. Please sign in with your password.");
        return;
      }

      const normalizedUser = {
        ...verifyResponse.user,
        role: normalizeRole(verifyResponse.user?.role) || "visitor",
      };

      if (!isRoleAllowedInCurrentVariant(normalizedUser.role)) {
        await ApiService.clearAuth();
        setLoginError(getVariantBlockedRoleMessage(normalizedUser.role));
        return;
      }

      await persistAuthenticatedSession({
        token: verifyResponse.tempToken,
        user: normalizedUser,
        rememberEmail: true,
      });
    await ApiService.trustDevice(normalizedUser);

      navigation.reset({
        index: 0,
        routes: [{ name: IS_VISITOR_ONLY_APP ? "VisitorDashboard" : getDashboardRoute(normalizedUser) }],
      });
    } catch (error) {
      setLoginError(error?.message || "Biometric login failed. Please try your password.");
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    const normalizedIdentifier = normalizeLoginIdentifier(email);
    setLoginSplashMessage(
      apiConnected
        ? "Checking account..."
        : "Connecting to Sapphire...",
    );
    setLoginError("");
    setLoginSuccessMessage("");
    
    try {
      setEmail(normalizedIdentifier);
      const verifyResponse = await ApiService.verifyCredentials(normalizedIdentifier, password);
      
      if (verifyResponse.success) {
        setPendingVisitorOtpEmail("");
        setLoginOtpCode("");
        setLoginOtpError("");
        setLoginOtpResendAvailableAt(null);
        const normalizedUser = {
          ...verifyResponse.user,
          role: normalizeRole(verifyResponse.user?.role) || "visitor",
        };

        if (!isRoleAllowedInCurrentVariant(normalizedUser.role)) {
          await ApiService.clearAuth();
          setLoginError(getVariantBlockedRoleMessage(normalizedUser.role));
          return;
        }

        if (normalizedUser.status === "pending" || verifyResponse.status === "pending") {
          await ApiService.clearAuth();
          setLoginError("Your account is pending approval. Please wait for admin approval.");
          return;
        }

        if (verifyResponse.requires2FA === false) {
          setLoginSplashMessage(`Opening ${getRoleDisplayName(normalizedUser.role).toLowerCase()} dashboard...`);
          await persistAuthenticatedSession({
            token: verifyResponse.tempToken,
            user: normalizedUser,
            rememberEmail: rememberMe,
          });
          await saveBiometricCredentialsIfEnabled(normalizedIdentifier, password);

          navigation.reset({
            index: 0,
            routes: [{ name: IS_VISITOR_ONLY_APP ? "VisitorDashboard" : getDashboardRoute(normalizedUser) }],
          });
          return;
        }

        setLoginSplashMessage("Opening two-step verification...");
        navigation.navigate("Verification", {
          email: normalizedIdentifier,
          password: password,
          rememberMe: rememberMe,
          tempToken: verifyResponse.tempToken,
          user: normalizedUser
        });
        await saveBiometricCredentialsIfEnabled(normalizedIdentifier, password);
      }
    } catch (error) {
      const errorMessage = String(error?.message || "");
      
      const otpEmail = normalizeResetEmailValue(error?.data?.verificationEmail || email);
      const shouldOfferVisitorActivation =
        error?.data?.requiresOtpVerification === true &&
        !isSchoolManagedIdentifier(otpEmail);

      if (shouldOfferVisitorActivation) {
        setPendingVisitorOtpEmail(otpEmail);
        setLoginOtpCode("");
        setLoginOtpError("");
        setLoginOtpResendAvailableAt(null);
        setLoginError("Please verify your email to continue.");
      } else if (error?.data?.requiresOtpVerification === true) {
        setPendingVisitorOtpEmail("");
        setLoginError("This campus account is not activated correctly. Please ask an admin to verify the student or staff account role.");
      } else if (errorMessage.toLowerCase().includes("activation required")) {
        setLoginError("This account still needs activation. Ask the admin to create it as active or use the setup link sent to the account email.");
      } else if (errorMessage.includes("pending")) {
        setLoginError("Your account is pending approval. Please wait for admin approval.");
      } else if (
        errorMessage.toLowerCase().includes("invalid email") ||
        errorMessage.toLowerCase().includes("invalid username") ||
        errorMessage.toLowerCase().includes("password")
      ) {
        setLoginError("Incorrect email or password. Please try again.");
      } else if (
        errorMessage.includes("Network request failed") ||
        errorMessage.toLowerCase().includes("cannot connect") ||
        errorMessage.toLowerCase().includes("server")
      ) {
        setLoginError("Server unavailable. Please try again.");
      } else {
        setLoginError(errorMessage || "Unable to sign in. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleConfig = (roleForDisplay = effectiveRole) => {
    switch (roleForDisplay) {
      case "visitor":
        return {
          label: "Visitor Access",
          title: "Visitor Sign-In",
          subtitle: "Track approvals, manage appointments, and keep your Sapphire visit details secure.",
          icon: "person-outline",
          accent: brandColors.blue,
          panel: "Campus Visitor Pass",
        };
      case "security":
      case "guard":
        return {
          label: "Security Access",
          title: "Security Sign-In",
          subtitle: "Open checkpoint tools for arrival monitoring, access validation, and campus logs.",
          icon: "shield-checkmark-outline",
          accent: brandColors.blue,
          panel: "Operations Console",
        };
      case "staff":
        return {
          label: "Staff Access",
          title: "Staff Sign-In",
          subtitle: "Open staff tools for NFC attendance, office presence, and assigned access.",
          icon: "briefcase-outline",
          accent: brandColors.blue,
          panel: "Staff NFC Console",
        };
      case "student":
      case "teacher":
        return {
          label: roleForDisplay === "teacher" ? "Teacher Access" : "Student Access",
          title: roleForDisplay === "teacher" ? "Teacher Sign-In" : "Student Sign-In",
          subtitle:
            roleForDisplay === "teacher"
              ? "Review attendance records, campus checkpoint activity, and your virtual campus ID."
              : "Open your virtual campus ID, attendance history, and latest NFC activity.",
          icon: roleForDisplay === "teacher" ? "school-outline" : "id-card-outline",
          accent: brandColors.blue,
          panel: "Campus ID Console",
        };
      case "campus":
        return {
          label: "Campus Access",
          title: "Sign In to Sapphire",
          subtitle:
            "Use your student, staff, visitor, security, or admin account to open the correct dashboard.",
          icon: "id-card-outline",
          accent: brandColors.blue,
          panel: "Smart Campus Platform",
        };
      case "admin":
        return {
          label: "Administrative Access",
          title: "Admin Sign-In",
          subtitle: "Open the control center for users, approvals, reports, and campus supervision.",
          icon: "settings-outline",
          accent: brandColors.sky,
          panel: "Admin Control",
        };
      default:
        return {
          label: "System Access",
          title: "Welcome Back",
          subtitle: "Sign in to continue with your secure Sapphire workflow.",
          icon: "log-in-outline",
          accent: brandColors.blue,
          panel: "Secure Entry",
        };
    }
  };

  // ============ WEB KEYBOARD NAVIGATION ============
  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  const openExternalLink = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Link Unavailable", "This link could not be opened on your device.");
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Link Error", "Unable to open the school link right now.");
    }
  };

  const animateButtonPress = (toValue) => {
    Animated.spring(loginButtonPressAnim, {
      toValue,
      friction: 7,
      tension: 90,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const animateButtonHover = (toValue) => {
    Animated.spring(loginButtonHoverAnim, {
      toValue,
      friction: 8,
      tension: 90,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const roleConfig = getRoleConfig(effectiveRole);
  const showVisitorRegisterEntry =
    IS_VISITOR_ONLY_APP || ["visitor", "campus"].includes(normalizeRole(effectiveRole));
  const loginButtonLabel = isLoading
    ? loginSplashMessage.includes("verification")
      ? "Opening verification..."
      : loginSplashMessage.includes("dashboard")
        ? "Opening dashboard..."
        : "Checking account..."
    : "SIGN IN";
  const resetStepTitle =
    resetStep === 1
      ? "Reset Password"
      : resetStep === 2
        ? "Verify Code"
        : "Create New Password";
  const resetStepSubtitle =
    resetStep === 1
      ? "Use your school email so we can send a password reset code and secure link."
      : resetStep === 2
        ? "Enter the verification code from your inbox to continue."
        : resetToken
          ? "Create a new password from your secure reset link."
          : "Create a new password that matches the same Secure Login standards.";
  const completeSocialLogin = async (response) => {
    if (!response?.success || !response?.token || !response?.user) {
      throw new Error(response?.message || "Social sign-in did not return a valid session.");
    }

    const normalizedUser = {
      ...response.user,
      role: normalizeRole(response.user?.role) || "visitor",
    };
    if (!isRoleAllowedInCurrentVariant(normalizedUser.role)) {
      await ApiService.clearAuth();
      throw new Error(getVariantBlockedRoleMessage(normalizedUser.role));
    }

    await persistAuthenticatedSession({
      token: response.token,
      user: normalizedUser,
      rememberEmail: rememberMe,
    });
    navigation.reset({
      index: 0,
      routes: [{ name: IS_VISITOR_ONLY_APP ? "VisitorDashboard" : getDashboardRoute(normalizedUser) }],
    });
  };
  const handleGoogleSignIn = async () => {
    if (!googleClientId || googleClientId === "YOUR_GOOGLE_CLIENT_ID") {
      Alert.alert("Google Sign-In", "Google Sign-In is not configured yet.");
      return;
    }
    if (!googleRequest) {
      Alert.alert("Google Sign-In", "Google Sign-In is still loading. Please try again.");
      return;
    }

    try {
      setSocialLoginProvider("google");
      setLoginError("");
      const result = await promptGoogleSignIn();
      if (result.type !== "success") return;

      const idToken = result.params?.id_token || result.authentication?.idToken;
      if (!idToken) throw new Error("Google did not return an ID token.");
      await completeSocialLogin(await ApiService.googleLogin(idToken));
    } catch (error) {
      setLoginError(error?.message || "Unable to sign in with Google. Please try again.");
    } finally {
      setSocialLoginProvider("");
    }
  };
  const socialLinks = [
    {
      label: "Facebook",
      icon: "logo-facebook",
      onPress: () => openExternalLink(ACADEMY_LINKS.facebook),
    },
    {
      label: "YouTube",
      icon: "logo-youtube",
      onPress: () => openExternalLink(ACADEMY_LINKS.youtube),
    },
    {
      label: "Website",
      icon: "globe-outline",
      onPress: () => openExternalLink(ACADEMY_LINKS.website),
    },
    {
      label: "WebAuthn",
      icon: "fingerprint",
      hidden: true,
      onPress: async () => {
        if (Platform.OS === 'web' && isWebAuthnAvailable) {
          try {
            // Check if email is provided for WebAuthn registration
            if (!email || email.trim() === '') {
              Alert.alert('WebAuthn Login', 'Please enter your email to use WebAuthn login.');
              return;
            }

            // Start WebAuthn authentication process
            const response = await fetch('/api/webauthn/authenticate/options', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ email })
            });

            const optionsData = await response.json();
            if (!optionsData.success) {
              throw new Error(optionsData.message || 'Failed to generate authentication options');
            }

            // Perform WebAuthn authentication
            const credential = await navigator.credentials.get({
              publicKey: optionsData.options
            });

            // Verify the credential with backend
            const verifyResponse = await fetch('/api/webauthn/authenticate/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email,
                id: credential.id,
                rawId: Array.from(new Uint8Array(credential.rawId)).map(b => b.toString(16).padStart(2, '0')).join(''),
                type: credential.type,
                response: {
                  authenticatorData: Array.from(new Uint8Array(credential.response.authenticatorData)).map(b => b.toString(16).padStart(2, '0')).join(''),
                  clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)).map(b => b.toString(16).padStart(2, '0')).join(''),
                  signature: Array.from(new Uint8Array(credential.response.signature)).map(b => b.toString(16).padStart(2, '0')).join(''),
                  userHandle: Array.from(new Uint8Array(credential.response.userHandle)).map(b => b.toString(16).padStart(2, '0')).join('')
                }
              })
            });

            const verifyData = await verifyResponse.json();
            if (verifyData.success) {
              // Handle successful login
              console.log('WebAuthn login successful:', verifyData);
              // Navigate to appropriate screen based on user role
              const normalizedUser = {
                ...verifyData.user,
                role: normalizeRole(verifyData.user?.role) || "visitor",
              };

              await persistAuthenticatedSession({
                token: verifyData.token,
                user: normalizedUser,
                rememberEmail: rememberMe,
              });

              await saveBiometricCredentialsIfEnabled(email, password); // Save for potential biometric fallback

              navigation.reset({
                index: 0,
                routes: [{ name: IS_VISITOR_ONLY_APP ? "VisitorDashboard" : getDashboardRoute(normalizedUser) }],
              });
            } else {
              throw new Error(verifyData.message || 'WebAuthn verification failed');
            }
          } catch (error) {
            console.error('WebAuthn login error:', error);
            if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
              // User cancelled or security restriction
              console.log('WebAuthn login cancelled or blocked');
            } else {
              Alert.alert('Login Error', 'Unable to login with WebAuthn. Please try again.');
            }
          }
        } else if (Platform.OS === 'web') {
          Alert.alert('Not Available', 'WebAuthn is not supported on this browser.');
        } else {
          Alert.alert('Not Available', 'WebAuthn login is only available on web platforms.');
        }
      },
    },
  ];
  const handleLoginFooterLink = (topic) => {
    if (transitionBusy) return;
    setTransitionBusy(true);
    if (startAviationTransition) {
      startAviationTransition({
        mode: "journey",
        message: "Departing secure login...",
        arrivalMessage: "Arriving at help center...",
        duration: 2500,
        onBeforeFade: () => {
          navigation.navigate("Help", {
            topic,
            timestamp: Date.now(),
          });
        },
        onDone: () => setTransitionBusy(false),
      });
      return;
    }

    navigation.navigate("Help", { topic });
  };
  const handleVisitorAccess = () => {
    if (transitionBusy) return;
    setTransitionBusy(true);
    if (startAviationTransition) {
      startAviationTransition({
        mode: "journey",
        message: "Departing secure login...",
        arrivalMessage: "Arriving at visitor registration...",
        duration: 2500,
        onBeforeFade: () => {
          navigation.navigate("VisitorRegister", {
            timestamp: Date.now(),
          });
        },
        onDone: () => setTransitionBusy(false),
      });
      return;
    }

    navigation.navigate("VisitorRegister");
  };
  const handleBackToHome = () => {
    if (transitionBusy) return;
    setTransitionBusy(true);
    Animated.timing(loginExitAnim, {
      toValue: 0.985,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      if (startAviationTransition) {
        startAviationTransition({
          mode: "journey",
          message: "Departing secure login...",
          arrivalMessage: "Arriving at campus access...",
          duration: 2500,
          onBeforeFade: () => {
            loginExitAnim.setValue(1);
            navigation.navigate("RoleSelect", {
              skipArrivalSplash: true,
              timestamp: Date.now(),
            });
          },
          onDone: () => setTransitionBusy(false),
        });
        return;
      }
      loginExitAnim.setValue(1);
      setTransitionBusy(false);
      navigation.navigate("RoleSelect", {
        skipArrivalSplash: true,
        timestamp: Date.now(),
      });
    });
  };
  const logoPulseStyle = {
    transform: [
      {
        scale: logoPulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.035],
        }),
      },
    ],
  };
  const loginExitTranslate = loginExitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const loginScreenEntryStyle = {
    flex: 1,
    opacity: Animated.multiply(fadeAnim, loginExitAnim),
    transform: [
      {
        translateY: Animated.add(slideAnim, loginExitTranslate),
      },
    ],
  };
  const renderLoginCharacterScene = (compact = false) => {
    const lookScale = compact ? 2.2 : 4.5;
    const pupilLookStyle = {
      transform: [
        { translateX: characterLook.x * lookScale },
        { translateY: characterLook.y * lookScale },
      ],
    };
    const handleCharacterMouseMove = (event) => {
      if (!isWeb) return;

      const nativeEvent = event?.nativeEvent || {};
      const offsetX = Number(nativeEvent.offsetX ?? nativeEvent.layerX ?? 0);
      const offsetY = Number(nativeEvent.offsetY ?? nativeEvent.layerY ?? 0);
      const sceneWidth = compact ? 220 : 430;
      const sceneHeight = compact ? 86 : 310;
      const nextX = Math.max(-1, Math.min(1, (offsetX - sceneWidth / 2) / (sceneWidth / 2)));
      const nextY = Math.max(-1, Math.min(1, (offsetY - sceneHeight / 2) / (sceneHeight / 2)));

      setCharacterLook({ x: nextX, y: nextY });
    };

    return (
    <View
      onMouseMove={handleCharacterMouseMove}
      onMouseLeave={() => isWeb && setCharacterLook({ x: 0, y: 0 })}
      style={[
        loginStyles.characterScene,
        compact && loginStyles.characterSceneCompact,
      ]}
    >
      <View style={[
        loginStyles.characterBlock,
        loginStyles.characterBlueTall,
        compact && loginStyles.characterBlueTallCompact,
      ]}>
        <View style={[loginStyles.characterPilotCap, compact && loginStyles.characterPilotCapCompact]}>
          <View style={[loginStyles.characterPilotCapBadge, compact && loginStyles.characterPilotCapBadgeCompact]} />
        </View>
        <View style={[loginStyles.characterHeadsetBand, compact && loginStyles.characterHeadsetBandCompact]} />
        <View style={[loginStyles.characterHeadsetCup, loginStyles.characterHeadsetCupLeft, compact && loginStyles.characterHeadsetCupCompact, compact && loginStyles.characterHeadsetCupLeftCompact]} />
        <View style={[loginStyles.characterHeadsetCup, loginStyles.characterHeadsetCupRight, compact && loginStyles.characterHeadsetCupCompact, compact && loginStyles.characterHeadsetCupRightCompact]} />
        <View style={[loginStyles.characterEyesRow, compact && loginStyles.characterEyesRowCompact]}>
          <View style={loginStyles.characterEye}>
            <View style={[loginStyles.characterEyeDot, pupilLookStyle]} />
          </View>
          <View style={loginStyles.characterEye}>
            <View style={[loginStyles.characterEyeDot, pupilLookStyle]} />
          </View>
        </View>
      </View>
      <View style={[
        loginStyles.characterBlock,
        loginStyles.characterNavyMid,
        compact && loginStyles.characterNavyMidCompact,
      ]}>
        <View style={[loginStyles.characterShieldBadge, compact && loginStyles.characterShieldBadgeCompact]}>
          <Ionicons name="shield-checkmark" size={compact ? 8 : 15} color={brandColors.surface} />
        </View>
        <View style={[loginStyles.characterEyesRowSmall, compact && loginStyles.characterEyesRowSmallCompact]}>
          <View style={loginStyles.characterEyeSmall}>
            <View style={[loginStyles.characterEyeDotSmall, pupilLookStyle]} />
          </View>
          <View style={loginStyles.characterEyeSmall}>
            <View style={[loginStyles.characterEyeDotSmall, pupilLookStyle]} />
          </View>
        </View>
      </View>
      <View style={[
        loginStyles.characterBlock,
        loginStyles.characterSkyRound,
        compact && loginStyles.characterSkyRoundCompact,
      ]}>
        <View style={[loginStyles.characterPupilRow, compact && loginStyles.characterPupilRowCompact]}>
          <View style={[loginStyles.characterPupil, pupilLookStyle]} />
          <View style={[loginStyles.characterPupil, pupilLookStyle]} />
        </View>
      </View>
      <View style={[
        loginStyles.characterBlock,
        loginStyles.characterGoldRound,
        compact && loginStyles.characterGoldRoundCompact,
      ]}>
        <View style={[loginStyles.characterVisitorBadge, compact && loginStyles.characterVisitorBadgeCompact]}>
          <View style={[loginStyles.characterVisitorBadgeDot, compact && loginStyles.characterVisitorBadgeDotCompact]} />
          <View style={[loginStyles.characterVisitorBadgeLine, compact && loginStyles.characterVisitorBadgeLineCompact]} />
        </View>
        <View style={[loginStyles.characterPupilRowGold, compact && loginStyles.characterPupilRowGoldCompact]}>
          <View style={[loginStyles.characterPupil, pupilLookStyle]} />
          <View style={[loginStyles.characterPupil, pupilLookStyle]} />
        </View>
        <View style={[loginStyles.characterMouth, compact && loginStyles.characterMouthCompact]} />
      </View>
    </View>
    );
  };

  return (
    <SafeAreaView style={loginStyles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={brandColors.background} />
      
      <KeyboardAvoidingView
        style={loginStyles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <Animated.View style={loginScreenEntryStyle}>
          <ScrollView 
            style={shouldLockDesktopScroll && loginStyles.desktopScrollLock}
            contentContainerStyle={[
              loginStyles.scrollContainer,
              shouldLockDesktopScroll && loginStyles.scrollContainerDesktop,
            ]}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!shouldLockDesktopScroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Header with Logo */}
            <View style={showDesktopLoginDesign && loginStyles.loginDesktopFrame}>
              {showDesktopLoginDesign ? (
                <View style={[loginStyles.desktopLoginDesign, { pointerEvents: "none" }]}>
                  <View style={loginStyles.desktopSkyWash} />
                </View>
              ) : null}
              {!showDesktopLoginDesign ? (
              <View style={[loginStyles.header, headerResponsiveStyle]}>
                <View style={loginStyles.headerGlowOne} />
                <View style={loginStyles.headerGlowTwo} />
                <View style={loginStyles.headerContent}>
                  <View style={loginStyles.brandBadge}>
                    <Image
                      source={Logo}
                      style={loginStyles.brandBadgeLogo}
                      resizeMode="contain"
                    />
                    <View style={loginStyles.brandBadgeTextWrap}>
                      <Text style={loginStyles.brandBadgeEyebrow}>Sapphire International Aviation Academy</Text>
                      <Text style={loginStyles.brandBadgeTitle}>Sapphire Smart Campus</Text>
                    </View>
                  </View>

                  <Animated.Image
                    source={Logo}
                    style={[loginStyles.logoImage, logoResponsiveStyle, logoPulseStyle]}
                    resizeMode="contain"
                  />
                  <Text style={[loginStyles.appName, appNameResponsiveStyle]}>
                    Campus Login
                  </Text>
                  <Text style={loginStyles.headerTagline}>
                    Secure access for students, staff, visitors, security, and admins.
                  </Text>
                  <View style={loginStyles.flightAccent}>
                    <View style={loginStyles.flightAccentLine} />
                    <Ionicons name="airplane" size={13} color={brandColors.surface} />
                    <View style={loginStyles.flightAccentDot} />
                  </View>
                  
                  {/* API Status Badge */}
                  <Animated.View style={[
                    loginStyles.statusBadge,
                    {
                      backgroundColor: apiConnected === null ? brandColors.textMuted : apiConnected ? brandColors.success : brandColors.danger,
                      transform: [{ scale: statusPulseAnim }],
                    },
                  ]}>
                    <View style={loginStyles.statusDot} />
                    <Text style={loginStyles.statusText}>
                      {apiConnected === null ? "CHECKING SERVER" : apiConnected ? "SERVER CONNECTED" : "SERVER CHECK FAILED"}
                    </Text>
                  </Animated.View>
                </View>
              </View>
              ) : null}

              {/* Login Stage */}
              <View
                style={[
                  loginStyles.loginStage,
                  showDesktopLoginDesign && loginStyles.loginStageDesktop,
                ]}
              >
                <View style={[
                  loginStyles.loginContentLayout,
                  showDesktopLoginDesign && loginStyles.loginContentLayoutDesktop,
                ]}>
                  {showDesktopLoginDesign ? (
                    <View style={loginStyles.loginVisualPanel}>
                      <View style={loginStyles.loginVisualBrand}>
                        <View style={loginStyles.loginVisualLogoCard}>
                          <Image source={Logo} style={loginStyles.loginVisualLogo} resizeMode="contain" />
                        </View>
                        <View style={loginStyles.loginVisualBrandCopy}>
                          <Text style={loginStyles.loginVisualEyebrow}>Sapphire International Aviation Academy</Text>
                          <Text style={loginStyles.loginVisualTitle}>Sapphire Smart Campus</Text>
                        </View>
                      </View>
                      <View style={loginStyles.loginVisualContactCard}>
                        <View style={loginStyles.loginVisualContactDetails}>
                          <Text style={loginStyles.loginVisualMetaText}>
                            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date().toLocaleDateString()}
                          </Text>
                          <Text style={loginStyles.loginVisualMetaText}>{WEB_VERSION_LABEL}</Text>
                          <Text style={loginStyles.loginVisualContactTitle}>
                            Sapphire International Aviation Academy
                          </Text>
                          <Text style={loginStyles.loginVisualContactLine}>Tel No: (02) 7091 - 3362</Text>
                          <Text style={loginStyles.loginVisualContactLine}>Mobile No: 0917 580 4858</Text>
                          <Text style={loginStyles.loginVisualCopyright}>
                            Copyright {new Date().getFullYear()}. Sapphire International Aviation Academy
                          </Text>
                        </View>
                        <View style={loginStyles.loginVisualSocialDock}>
                          <SocialDock links={socialLinks} showTray={false} />
                        </View>
                      </View>
                      <View style={loginStyles.loginVisualIntro}>
                        <Text style={loginStyles.loginVisualHeading}>Campus Login</Text>
                        <Text style={loginStyles.loginVisualSubtitle}>
                          Secure access for students, staff, visitors, security, and admins.
                        </Text>
                        <Animated.View style={[
                          loginStyles.loginVisualStatusBadge,
                          {
                            backgroundColor: apiConnected === null ? brandColors.textMuted : apiConnected ? brandColors.success : brandColors.danger,
                            transform: [{ scale: statusPulseAnim }],
                          },
                        ]}>
                          <View style={loginStyles.statusDot} />
                          <Text style={loginStyles.statusText}>
                            {apiConnected === null ? "CHECKING SERVER" : apiConnected ? "SERVER CONNECTED" : "SERVER CHECK FAILED"}
                          </Text>
                        </Animated.View>
                      </View>
                      <View style={loginStyles.loginVisualCenter}>
                        {renderLoginCharacterScene(false)}
                      </View>
                      <View style={loginStyles.loginVisualFooter}>
                        <TouchableOpacity
                          onPress={() => handleLoginFooterLink("privacy")}
                          disabled={transitionBusy}
                          activeOpacity={0.75}
                          accessibilityRole="link"
                          accessibilityLabel="Open privacy policy"
                          {...(isWeb && {
                            onKeyPress: (e) => handleKeyPress(e, () => handleLoginFooterLink("privacy")),
                            tabIndex: 0,
                          })}
                        >
                          <Text style={loginStyles.loginVisualFooterText}>Privacy Policy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleLoginFooterLink("terms")}
                          disabled={transitionBusy}
                          activeOpacity={0.75}
                          accessibilityRole="link"
                          accessibilityLabel="Open terms of service"
                          {...(isWeb && {
                            onKeyPress: (e) => handleKeyPress(e, () => handleLoginFooterLink("terms")),
                            tabIndex: 0,
                          })}
                        >
                          <Text style={loginStyles.loginVisualFooterText}>Terms of Service</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleLoginFooterLink("contact")}
                          disabled={transitionBusy}
                          activeOpacity={0.75}
                          accessibilityRole="link"
                          accessibilityLabel="Open contact support"
                          {...(isWeb && {
                            onKeyPress: (e) => handleKeyPress(e, () => handleLoginFooterLink("contact")),
                            tabIndex: 0,
                          })}
                        >
                          <Text style={loginStyles.loginVisualFooterText}>Contact</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={loginStyles.mobileCharacterDock}>
                      {renderLoginCharacterScene(true)}
                    </View>
                  )}

                <Animated.View
                  style={[
                    loginStyles.card,
                    cardResponsiveStyle,
                    showDesktopLoginDesign && loginStyles.cardDesktopSplit,
                  ]}
                >
                {/* Back to Role Select */}
                {!IS_VISITOR_ONLY_APP && (
                  <TouchableOpacity
                    style={[loginStyles.backToRoleButton, transitionBusy && { opacity: 0.7 }]}
                    onPress={handleBackToHome}
                    disabled={transitionBusy}
                    activeOpacity={0.7}
                    {...(isWeb && {
                      onKeyPress: (e) => handleKeyPress(e, handleBackToHome),
                      tabIndex: 0,
                    })}
                  >
                    <Ionicons name="arrow-back" size={20} color={brandColors.navy} />
                    <Text style={loginStyles.backToRoleText}>Home</Text>
                  </TouchableOpacity>
                )}

                <View style={[loginStyles.roleHero, roleHeroResponsiveStyle]}>
                  <View
                    style={[
                      loginStyles.roleIconWrap,
                      roleIconResponsiveStyle,
                      { backgroundColor: roleConfig.accent },
                    ]}
                  >
                    <Ionicons name={roleConfig.icon} size={22} color={brandColors.surface} />
                  </View>
                  <View style={loginStyles.roleHeroText}>
                    <Text style={loginStyles.roleEyebrow}>{roleConfig.label}</Text>
                    <Text style={loginStyles.rolePanel}>{roleConfig.panel}</Text>
                  </View>
                </View>

                <Text style={[loginStyles.welcomeTitle, welcomeTitleResponsiveStyle]}>
                  {roleConfig.title}
                </Text>
                <Text style={[loginStyles.welcomeSubtitle, welcomeSubtitleResponsiveStyle]}>
                  {roleConfig.subtitle}
                </Text>

                {/* STANDARD LOGIN FORM */}
                <>
                  {/* Username / Email Input */}
                  <View style={loginStyles.inputBox}>
                    <Text nativeID="login-email-label" style={loginStyles.label}>Username / Email</Text>
                    <View style={[
                      loginStyles.inputContainer,
                      errors.email && loginStyles.inputError
                    ]}>
                      <Ionicons name="person-outline" size={20} color={brandColors.textMuted} />
                      <TextInput
                        ref={emailInputRef}
                        style={loginStyles.input}
                        nativeID="login-email"
                        accessibilityLabel="Username / Email"
                        autoComplete="username"
                        autoCorrect={false}
                        {...(isWeb ? { 'aria-labelledby': 'login-email-label', 'aria-describedby': errors.email ? 'login-email-error' : undefined, 'aria-invalid': Boolean(errors.email) } : {})}
                        placeholder="Enter username or email"
                        placeholderTextColor={brandColors.textMuted}
                        value={email}
                        onChangeText={handleEmailChange}
                        onBlur={() => {
                          const normalizedIdentifier = normalizeLoginIdentifier(email);
                          setEmail(normalizedIdentifier);
                          validateEmailField();
                        }}
                        keyboardType="default"
                        autoCapitalize="none"
                        editable={!isLoading}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordInputRef.current?.focus()}
                      />
                    </View>
                    {errors.email && (
                      <Text nativeID="login-email-error" accessibilityLiveRegion="polite" style={loginStyles.errorText}>{errors.email}</Text>
                    )}
                  </View>

                  {loginSuccessMessage ? (
                    <Text style={loginStyles.loginSuccessText}>
                      {loginSuccessMessage}
                    </Text>
                  ) : null}

                  {/* Password Input with Error Message Below */}
                  <View style={loginStyles.inputBox}>
                    <Text nativeID="login-password-label" style={loginStyles.label}>Password</Text>
                    <View style={[
                      loginStyles.inputContainer,
                      errors.password && loginStyles.inputError
                    ]}>
                      <Ionicons name="lock-closed-outline" size={20} color={brandColors.textMuted} />
                      <TextInput
                        ref={passwordInputRef}
                        style={loginStyles.input}
                        nativeID="login-password"
                        accessibilityLabel="Password"
                        autoComplete="current-password"
                        autoCorrect={false}
                        {...(isWeb ? { 'aria-labelledby': 'login-password-label', 'aria-describedby': errors.password ? 'login-password-error' : undefined, 'aria-invalid': Boolean(errors.password) } : {})}
                        placeholder="Enter your password"
                        placeholderTextColor={brandColors.textMuted}
                        value={password}
                        onChangeText={handlePasswordChange}
                        onBlur={validatePasswordField}
                        secureTextEntry={!showPassword}
                        editable={!isLoading}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                      />
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons 
                          name={showPassword ? "eye-off-outline" : "eye-outline"} 
                          size={20} 
                          color={brandColors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                    {errors.password && (
                      <Text nativeID="login-password-error" accessibilityLiveRegion="polite" style={loginStyles.errorText}>{errors.password}</Text>
                    )}
                  </View>

                  {loginError && !errors.password ? (
                    <View style={loginStyles.loginAlert}>
                      <Ionicons name="alert-circle-outline" size={18} color={brandColors.danger} />
                      <Text style={loginStyles.loginAlertText}>{loginError}</Text>
                    </View>
                  ) : null}

                  {pendingVisitorOtpEmail ? (
                    <View style={loginStyles.visitorOtpPanel}>
                      <View style={loginStyles.visitorOtpHeader}>
                        <View style={loginStyles.visitorOtpIcon}>
                          <Ionicons name="mail-unread-outline" size={18} color={brandColors.blue} />
                        </View>
                        <View style={loginStyles.visitorOtpHeaderCopy}>
                          <Text style={loginStyles.visitorOtpTitle}>Verify Campus Account</Text>
                          <Text style={loginStyles.visitorOtpSubtitle} numberOfLines={2}>
                            Enter the verification code sent to your email.
                          </Text>
                        </View>
                      </View>
                      <View style={[
                        loginStyles.inputContainer,
                        loginStyles.visitorOtpInputContainer,
                        loginOtpError && loginStyles.inputError,
                      ]}>
                        <Ionicons name="keypad-outline" size={18} color={brandColors.textMuted} />
                        <TextInput
                          style={[loginStyles.input, loginStyles.visitorOtpInput]}
                          placeholder="6-digit OTP"
                          accessibilityLabel="Verification code"
                          autoComplete="one-time-code"
                          placeholderTextColor={brandColors.textMuted}
                          value={loginOtpCode}
                          onChangeText={handleLoginOtpChange}
                          keyboardType="number-pad"
                          maxLength={6}
                          editable={!isLoginOtpBusy && !isLoading}
                          returnKeyType="done"
                          onSubmitEditing={handleVerifyVisitorOtpFromLogin}
                        />
                      </View>
                      {loginOtpError ? (
                        <Text style={loginStyles.errorText}>{loginOtpError}</Text>
                      ) : (
                        <Text style={loginStyles.visitorOtpHint}>
                          The OTP expires after 10 minutes. Verified accounts can continue to the correct campus dashboard.
                        </Text>
                      )}
                      <View style={loginStyles.visitorOtpActions}>
                        <TouchableOpacity
                          style={[
                            loginStyles.visitorOtpSecondaryButton,
                            (isLoginOtpBusy || loginOtpResendSecondsLeft > 0) && loginStyles.visitorOtpDisabledButton,
                          ]}
                          onPress={handleResendVisitorOtp}
                          disabled={isLoginOtpBusy || loginOtpResendSecondsLeft > 0}
                        >
                          <Text style={loginStyles.visitorOtpSecondaryText}>
                            {loginOtpResendSecondsLeft > 0 ? `Resend in ${formatOtpTimer(loginOtpResendSecondsLeft)}` : "Resend OTP"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            loginStyles.visitorOtpPrimaryButton,
                            isLoginOtpBusy && loginStyles.visitorOtpDisabledButton,
                          ]}
                          onPress={handleVerifyVisitorOtpFromLogin}
                          disabled={isLoginOtpBusy}
                        >
                          {isLoginOtpBusy ? (
                            <ActivityIndicator size="small" color={brandColors.surface} />
                          ) : (
                            <>
                              <Text style={loginStyles.visitorOtpPrimaryText}>Verify & Sign In</Text>
                              <Ionicons name="arrow-forward-outline" size={16} color={brandColors.surface} />
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  {/* Remember Me & Forgot Password */}
                  <View style={[loginStyles.row, authRowResponsiveStyle]}>
                    {TRUST_DEVICE_ENABLED ? <TouchableOpacity 
                      style={loginStyles.rememberBox}
                      onPress={() => setRememberMe(!rememberMe)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        loginStyles.checkbox,
                        rememberMe && loginStyles.checkboxChecked
                      ]}>
                        {rememberMe && <Ionicons name="checkmark" size={12} color={brandColors.surface} />}
                      </View>
                      <View style={loginStyles.trustDeviceCopy}>
                        <Text style={loginStyles.rememberText}>Trust this device</Text>
                        <Text style={loginStyles.trustDeviceHint}>
                          Skip extra verification on this device when allowed.
                        </Text>
                      </View>
                    </TouchableOpacity> : null}
                    
                    <TouchableOpacity onPress={handleForgotPassword}>
                      <Text style={loginStyles.forgotText}>Forgot Password?</Text>
                    </TouchableOpacity>
                  </View>

                  {biometricLoginReady ? (
                    <TouchableOpacity
                      style={loginStyles.biometricLoginButton}
                      onPress={handleBiometricLogin}
                      disabled={isLoading || isBiometricLoading}
                      activeOpacity={0.86}
                    >
                      {isBiometricLoading ? (
                        <ActivityIndicator size="small" color={brandColors.blue} />
                      ) : (
                        <>
                          <Ionicons name="finger-print-outline" size={20} color={brandColors.blue} />
                          <Text style={loginStyles.biometricLoginText}>Use phone biometric</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}

                  {/* Login Button */}
                  <Animated.View
                    style={{
                      transform: [
                        {
                          translateY: loginButtonFloatAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -4],
                          }),
                        },
                        {
                          translateY: loginButtonHoverAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -7],
                          }),
                        },
                        { scale: loginButtonPressAnim },
                        {
                          scale: loginButtonHoverAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.025],
                          }),
                        },
                      ],
                    }}
                  >
                    <TouchableOpacity
                      ref={loginButtonRef}
                      style={[
                        loginStyles.loginButton,
                        (isLoading || transitionBusy) && loginStyles.buttonDisabled
                      ]}
                      onPress={handleLogin}
                      onPressIn={() => animateButtonPress(0.98)}
                      onPressOut={() => animateButtonPress(1)}
                      disabled={isLoading || transitionBusy}
                      activeOpacity={0.8}
                      {...(isWeb && {
                        onMouseEnter: () => animateButtonHover(1),
                        onMouseLeave: () => animateButtonHover(0),
                        onKeyPress: (e) => handleKeyPress(e, handleLogin),
                        tabIndex: 0,
                      })}
                    >
                      {isLoading ? (
                        <>
                          <View style={loginStyles.loginButtonBusyIcon}>
                            <Ionicons name="sync-outline" size={15} color={brandColors.surface} />
                          </View>
                          <Text style={loginStyles.loginButtonText}>{loginButtonLabel}</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="log-in-outline" size={20} color={brandColors.surface} />
                          <Text style={loginStyles.loginButtonText}>
                            {loginButtonLabel}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </Animated.View>

                  {GOOGLE_SIGN_IN_ENABLED ? <View style={{ marginTop: 16, marginBottom: 16 }}>
                    <Text style={{ textAlign: "center", color: brandColors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 10 }}>
                      OR SIGN IN WITH A CONNECTED ACCOUNT
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          minHeight: 46,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 7,
                          borderWidth: 1,
                          borderColor: socialLoginHover === "google" ? "#DB4437" : "#CBD5E1",
                          borderRadius: 8,
                          backgroundColor: socialLoginHover === "google" ? "#FFF7F5" : brandColors.surface,
                          opacity: socialLoginProvider && socialLoginProvider !== "google" ? 0.55 : 1,
                          transform: [{ translateY: socialLoginHover === "google" ? -2 : 0 }],
                          shadowColor: "#0F172A",
                          shadowOpacity: socialLoginHover === "google" ? 0.12 : 0,
                          shadowRadius: 7,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: socialLoginHover === "google" ? 2 : 0,
                        }}
                        onPress={handleGoogleSignIn}
                        disabled={Boolean(socialLoginProvider) || transitionBusy}
                        accessibilityRole="button"
                        accessibilityLabel="Sign in with Google"
                        {...(isWeb && {
                          onMouseEnter: () => setSocialLoginHover("google"),
                          onMouseLeave: () => setSocialLoginHover(""),
                          onKeyPress: (e) => handleKeyPress(e, handleGoogleSignIn),
                          tabIndex: 0,
                        })}
                      >
                        {socialLoginProvider === "google" ? (
                          <ActivityIndicator size="small" color={brandColors.blue} />
                        ) : (
                          <Ionicons name="logo-google" size={19} color="#DB4437" />
                        )}
                        <Text style={{ color: brandColors.text, fontSize: 13, fontWeight: "800" }}>Google</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ textAlign: "center", color: brandColors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 9 }}>
                      Only accounts already connected to SafePass can use this option.
                    </Text>
                  </View> : null}

                  {/* 2FA Info */}
                  <View style={loginStyles.twoFactorInfo}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={brandColors.navy} />
                    <Text style={loginStyles.twoFactorText}>
                      Secure login with 2-factor authentication
                    </Text>
                  </View>

                  {showVisitorRegisterEntry ? (
                    <View style={loginStyles.visitorAccessCard}>
                      <View style={loginStyles.visitorAccessHeader}>
                        <View style={loginStyles.visitorAccessIcon}>
                          <Ionicons name="person-add-outline" size={17} color={brandColors.blue} />
                        </View>
                        <View style={loginStyles.visitorAccessCopy}>
                          <Text style={loginStyles.visitorAccessTitle}>Need visitor access?</Text>
                          <Text style={loginStyles.visitorAccessText}>
                            Create a visitor account before requesting or tracking appointments.
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[
                          loginStyles.visitorAccessButton,
                          transitionBusy && { opacity: 0.7 },
                        ]}
                        onPress={handleVisitorAccess}
                        disabled={transitionBusy}
                        activeOpacity={0.85}
                      >
                        <Text style={loginStyles.visitorAccessButtonText}>Create Account</Text>
                        <Ionicons name="arrow-forward-outline" size={16} color={brandColors.blue} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>

                {/* Server Info - Only when offline */}
                {apiConnected === false && (
                  <View style={loginStyles.infoBox}>
                    <Ionicons name="information-circle" size={20} color={brandColors.danger} />
                    <Text style={loginStyles.infoText}>
                      Server health check did not respond yet. You can still try signing in.
                    </Text>
                  </View>
                )}
                </Animated.View>
                </View>

              </View>

              {/* Footer */}
              {!showDesktopLoginDesign ? (
              <View style={[loginStyles.footer, footerResponsiveStyle]}>
                <Text style={loginStyles.footerText}>
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date().toLocaleDateString()}
                </Text>
                <Text style={loginStyles.footerText}>{WEB_VERSION_LABEL}</Text>
                <View style={[loginStyles.footerContactCard, footerContactCardResponsiveStyle]}>
                  <Text style={loginStyles.footerContactTitle}>
                    Sapphire International Aviation Academy
                  </Text>
                  <Text style={loginStyles.footerContactLine}>Tel No: (02) 7091 - 3362</Text>
                  <Text style={loginStyles.footerContactLine}>Mobile No: 0917 580 4858</Text>
                  <SocialDock links={socialLinks} />
                  <Text style={loginStyles.footerCopyright}>
                    Copyright 2024. Sapphire International Aviation Academy
                  </Text>
                </View>
              </View>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>

        {/* FORGOT PASSWORD MODAL */}
        <Modal
          visible={showForgotPassword}
          transparent={true}
          animationType="slide"
          onRequestClose={handleCloseForgotPassword}
        >
          <KeyboardAvoidingView
            style={loginStyles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={[loginStyles.modalContent, forgotModalContentResponsiveStyle]}>
              <ScrollView
                style={loginStyles.modalBody}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
              >
              {isCompactLogin && (
                <View style={loginStyles.modalCompactHeader}>
                  <Text style={loginStyles.modalCompactTitle}>{resetStepTitle}</Text>
                  <TouchableOpacity accessibilityLabel="Close password recovery" onPress={handleCloseForgotPassword} style={{ padding: 8 }}>
                    <Ionicons name="close" size={22} color={brandColors.navy} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={[loginStyles.modalHero, forgotModalHeroResponsiveStyle, isCompactLogin && { display: "none" }]}>
                <View style={[loginStyles.modalHeroTopRow, forgotModalHeroTopRowResponsiveStyle]}>
                  <View style={[loginStyles.modalBrandBadge, forgotModalBrandBadgeResponsiveStyle]}>
                    <Image
                      source={Logo}
                      style={loginStyles.modalBrandBadgeLogo}
                      resizeMode="contain"
                    />
                    <View style={loginStyles.modalBrandBadgeTextWrap}>
                      <Text style={loginStyles.modalBrandBadgeEyebrow}>Account Recovery</Text>
                      <Text style={loginStyles.modalBrandBadgeTitle}>Sapphire</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={loginStyles.modalCloseButton}
                    onPress={handleCloseForgotPassword}
                  >
                    <Ionicons name="close" size={22} color={brandColors.surface} />
                  </TouchableOpacity>
                </View>

                <View style={loginStyles.modalHeroContent}>
                  <View style={loginStyles.modalHeroIcon}>
                    <Ionicons name="lock-open-outline" size={26} color={brandColors.surface} />
                  </View>
                  <Text style={loginStyles.modalTitle}>{resetStepTitle}</Text>
                  <Text style={loginStyles.modalSubtitle}>{resetStepSubtitle}</Text>
                </View>

                <View style={[loginStyles.modalStepRow, forgotModalStepRowResponsiveStyle]}>
                  {[1, 2, 3].map((stepNumber) => {
                    const isActive = resetStep === stepNumber;
                    const isComplete = resetStep > stepNumber;
                    return (
                      <View
                        key={stepNumber}
                        style={[
                          loginStyles.modalStepChip,
                          isActive && loginStyles.modalStepChipActive,
                          isComplete && loginStyles.modalStepChipComplete,
                        ]}
                      >
                        <Text
                          style={[
                            loginStyles.modalStepChipText,
                            (isActive || isComplete) && loginStyles.modalStepChipTextActive,
                          ]}
                        >
                          {stepNumber === 1 ? "Email" : stepNumber === 2 ? "Code" : "Password"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={[loginStyles.modalBodyContent, forgotModalBodyContentResponsiveStyle]}>
                {resetStep === 1 && (
                  <>
                    <View style={loginStyles.inputBox}>
                      <Text style={loginStyles.label}>Email Address</Text>
                      <View style={[
                        loginStyles.inputContainer,
                        resetEmailError ? loginStyles.inputError : null
                      ]}>
                        <Ionicons name="mail-outline" size={20} color={brandColors.textMuted} />
                        <TextInput
                          style={loginStyles.input}
                          placeholder="your.email@sapphireaviationacademy.edu.ph"
                          accessibilityLabel="Account email address"
                          autoComplete="email"
                          placeholderTextColor={brandColors.textMuted}
                          value={resetEmail}
                          onChangeText={(text) => {
                            setResetEmail(text.replace(/\s+/g, ""));
                            setResetEmailError("");
                          }}
                          onBlur={() => {
                            setResetEmail(normalizeResetEmailValue(resetEmail));
                            validateResetEmailField();
                          }}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          editable={!isLoading}
                        />
                      </View>
                      {resetEmailError ? (
                        <Text style={loginStyles.errorText}>{resetEmailError}</Text>
                      ) : (
                        <Text style={loginStyles.helperText}>
                          We&apos;ll send a verification code and reset link to this email
                        </Text>
                      )}
                    </View>

                    <View style={loginStyles.modalInfoCard}>
                      <Ionicons name="mail-unread-outline" size={18} color={brandColors.blue} />
                      <Text style={loginStyles.modalInfoText}>
                        Use the email linked to your Sapphire account. We will send a 6-digit verification code and a secure reset link.
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        loginStyles.otpButton,
                        isLoading && loginStyles.buttonDisabled
                      ]}
                      onPress={handleSendResetOtp}
                      disabled={isLoading}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={brandColors.surface} />
                      ) : (
                        <>
                          <Ionicons name="send-outline" size={20} color={brandColors.surface} />
                          <Text style={loginStyles.otpButtonText}>Send Reset Code</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {resetStep === 2 && (
                  <>
                    <View style={loginStyles.modalInfoCard}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={brandColors.blue} />
                      <Text style={loginStyles.modalInfoText}>
                        Enter the 6-digit verification code sent to the email below.
                      </Text>
                    </View>
                    <Text style={loginStyles.modalPhone}>{resetEmail}</Text>

                    <View style={loginStyles.inputBox}>
                      <View style={[
                        loginStyles.inputContainer,
                        resetOtpError ? loginStyles.inputError : null
                      ]}>
                        <Ionicons name="key-outline" size={20} color={brandColors.textMuted} />
                        <TextInput
                          style={loginStyles.input}
                          placeholder="000000"
                          accessibilityLabel="Password reset verification code"
                          autoComplete="one-time-code"
                          placeholderTextColor={brandColors.textMuted}
                          value={resetOtp}
                          onChangeText={(text) => {
                            const numericValue = normalizeResetOtpValue(text);
                            setResetOtp(numericValue);
                            setResetOtpError("");
                          }}
                          onBlur={() => {}}
                          keyboardType="numeric"
                          maxLength={6}
                          autoFocus={!isWeb}
                          editable={!isLoading}
                        />
                      </View>
                      {resetOtpError ? (
                        <Text style={loginStyles.errorText}>{resetOtpError}</Text>
                      ) : (
                        <Text style={loginStyles.helperText}>
                          The code will be checked after you press Verify Code.
                        </Text>
                      )}
                    </View>

                    <View style={loginStyles.timerContainer}>
                      <Ionicons name="time-outline" size={16} color={brandColors.textMuted} />
                      <Text style={loginStyles.timerText}>
                        {canResendReset ? 'You can resend the code now' : `Resend in ${resetTimer}s`}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        loginStyles.otpVerifyButton,
                        isLoading && loginStyles.buttonDisabled
                      ]}
                      onPress={handleVerifyResetOtp}
                      disabled={isLoading}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={brandColors.surface} />
                      ) : (
                        <Text style={loginStyles.otpVerifyText}>Verify Code</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        loginStyles.otpResendButton,
                        (!canResendReset || isLoading) && loginStyles.buttonDisabled,
                        { marginTop: 12 }
                      ]}
                      onPress={handleResendResetOtp}
                      disabled={!canResendReset || isLoading}
                      activeOpacity={0.8}
                    >
                      <Text style={loginStyles.otpResendText}>Resend Code</Text>
                    </TouchableOpacity>
                  </>
                )}

                {resetStep === 3 && (
                  <>
                    <View style={loginStyles.modalInfoCard}>
                      <Ionicons name="keypad-outline" size={18} color={brandColors.blue} />
                      <Text style={loginStyles.modalInfoText}>
                        {resetToken
                          ? "Create a strong new password from your secure reset link, then confirm it before returning to login."
                          : "Create a strong new password, then confirm it before returning to login."}
                      </Text>
                    </View>

                    <View style={loginStyles.passwordRequirements}>
                      <Text style={loginStyles.requirementsTitle}>Password must contain:</Text>
                      <View style={loginStyles.requirementItem}>
                        <Ionicons 
                          name={passwordChecks.length ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={passwordChecks.length ? brandColors.success : brandColors.textMuted}
                        />
                        <Text style={[loginStyles.requirementText, passwordChecks.length && loginStyles.requirementMet]}>
                          At least 8 characters
                        </Text>
                      </View>
                      <View style={loginStyles.requirementItem}>
                        <Ionicons 
                          name={passwordChecks.uppercase ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={passwordChecks.uppercase ? brandColors.success : brandColors.textMuted}
                        />
                        <Text style={[loginStyles.requirementText, passwordChecks.uppercase && loginStyles.requirementMet]}>
                          One uppercase letter
                        </Text>
                      </View>
                      <View style={loginStyles.requirementItem}>
                        <Ionicons 
                          name={passwordChecks.lowercase ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={passwordChecks.lowercase ? brandColors.success : brandColors.textMuted}
                        />
                        <Text style={[loginStyles.requirementText, passwordChecks.lowercase && loginStyles.requirementMet]}>
                          One lowercase letter
                        </Text>
                      </View>
                      <View style={loginStyles.requirementItem}>
                        <Ionicons 
                          name={passwordChecks.number ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={passwordChecks.number ? brandColors.success : brandColors.textMuted}
                        />
                        <Text style={[loginStyles.requirementText, passwordChecks.number && loginStyles.requirementMet]}>
                          One number
                        </Text>
                      </View>
                    </View>

                    <View style={loginStyles.inputBox}>
                      <Text style={loginStyles.label}>New Password</Text>
                      <View style={[
                        loginStyles.inputContainer,
                        newPasswordError ? loginStyles.inputError : null
                      ]}>
                        <Ionicons name="lock-closed-outline" size={20} color={brandColors.textMuted} />
                        <TextInput
                          style={loginStyles.input}
                          placeholder="Enter new password"
                          accessibilityLabel="New password"
                          autoComplete="new-password"
                          placeholderTextColor={brandColors.textMuted}
                          value={newPassword}
                          onChangeText={(text) => {
                            setNewPassword(text);
                            setNewPasswordError("");
                            validatePasswordStrength(text);
                            if (confirmNewPassword) {
                              setConfirmNewPasswordError(
                                confirmNewPassword === text ? "" : "Passwords do not match",
                              );
                            }
                          }}
                          onBlur={validateNewPasswordField}
                          secureTextEntry={!showNewPassword}
                          editable={!isLoading}
                        />
                        <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                          <Ionicons 
                            name={showNewPassword ? "eye-off-outline" : "eye-outline"} 
                            size={20} 
                            color={brandColors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                      {newPasswordError ? (
                        <Text style={loginStyles.errorText}>{newPasswordError}</Text>
                      ) : (
                        newPassword.length > 0 && (
                          <View style={loginStyles.passwordStrengthContainer}>
                            <View style={loginStyles.passwordStrengthBar}>
                              {[1, 2, 3, 4, 5].map((level) => (
                                <View
                                  key={level}
                                  style={[
                                    loginStyles.passwordStrengthSegment,
                                    { backgroundColor: level <= passwordStrength ? getPasswordStrengthColor() : brandColors.border }
                                  ]}
                                />
                              ))}
                            </View>
                            <Text style={[loginStyles.passwordStrengthText, { color: getPasswordStrengthColor() }]}>
                              {getPasswordStrengthText()}
                            </Text>
                          </View>
                        )
                      )}
                    </View>

                    <View style={loginStyles.inputBox}>
                      <Text style={loginStyles.label}>Confirm Password</Text>
                      <View style={[
                        loginStyles.inputContainer,
                        confirmNewPasswordError ? loginStyles.inputError : null
                      ]}>
                        <Ionicons name="lock-closed-outline" size={20} color={brandColors.textMuted} />
                        <TextInput
                          style={loginStyles.input}
                          placeholder="Confirm new password"
                          accessibilityLabel="Confirm new password"
                          autoComplete="new-password"
                          placeholderTextColor={brandColors.textMuted}
                          value={confirmNewPassword}
                          onChangeText={(text) => {
                            setConfirmNewPassword(text);
                            setConfirmNewPasswordError("");
                          }}
                          onBlur={validateConfirmPasswordField}
                          secureTextEntry={!showConfirmNewPassword}
                          editable={!isLoading}
                        />
                        <TouchableOpacity onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}>
                          <Ionicons 
                            name={showConfirmNewPassword ? "eye-off-outline" : "eye-outline"} 
                            size={20} 
                            color={brandColors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                      {confirmNewPasswordError && (
                        <Text style={loginStyles.errorText}>{confirmNewPasswordError}</Text>
                      )}
                    </View>

                    {newPassword && confirmNewPassword && !newPasswordError && !confirmNewPasswordError && (
                      <View style={loginStyles.passwordMatchContainer}>
                        <Ionicons 
                          name={newPassword === confirmNewPassword ? "checkmark-circle" : "close-circle"} 
                          size={16} 
                          color={newPassword === confirmNewPassword ? brandColors.success : brandColors.danger}
                        />
                        <Text style={[
                          loginStyles.passwordMatchText,
                          { color: newPassword === confirmNewPassword ? brandColors.success : brandColors.danger }
                        ]}>
                          {newPassword === confirmNewPassword ? "Passwords match" : "Passwords do not match"}
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[
                        loginStyles.otpVerifyButton,
                        (isLoading || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword) && 
                        loginStyles.buttonDisabled
                      ]}
                      onPress={handleResetPassword}
                      disabled={isLoading || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={brandColors.surface} />
                      ) : (
                        <Text style={loginStyles.otpVerifyText}>Reset Password</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={loginStyles.backLink}
                  onPress={() => {
                    if (resetStep === 1) {
                      handleCloseForgotPassword();
                    } else {
                      if (resetStep === 2) {
                        setResetOtp("");
                        setResetOtpError("");
                      }
                      if (resetStep === 3) {
                        setNewPassword("");
                        setNewPasswordError("");
                        setConfirmNewPassword("");
                        setConfirmNewPasswordError("");
                        setShowNewPassword(false);
                        setShowConfirmNewPassword(false);
                        setPasswordStrength(0);
                        setPasswordChecks({
                          length: false,
                          uppercase: false,
                          lowercase: false,
                          number: false,
                          special: false,
                        });
                      }
                      setResetStep(resetStep - 1);  
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={16} color={brandColors.textMuted} />
                  <Text style={loginStyles.backLinkText}>
                    {resetStep === 1 ? 'Back to Login' : 'Back'}
                  </Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </KeyboardAvoidingView>

      {arrivalVisible ? (
        <AviationSplash
          mode="landing"
          message="Arriving at secure login..."
          duration={1450}
          onDone={() => {
            setArrivalVisible(false);
            playLoginEntrance();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
