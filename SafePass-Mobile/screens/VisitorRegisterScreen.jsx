import Alert from '../utils/Alert';
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
  Animated,
  Modal,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import visitorRegisterStyles from "../styles/VisitorRegisterStyles";
import ApiService from "../utils/ApiService";
import Logo from "../assets/LogoSapphire.jpg";
import {
  PHILIPPINE_MOBILE_NUMBER_MESSAGE,
  isValidPhilippineMobileNumber,
  normalizePhilippineMobileNumber,
} from "../utils/phoneValidation";
import { useAviationTransition } from "../utils/AviationTransitionContext";
import { makeRedirectUri } from "expo-auth-session";
import useGoogleSignIn from "../utils/useGoogleSignIn";

const GOOGLE_SIGN_IN_ENABLED = false;

const VISITOR_SOCIAL_SIGNUP_REDIRECT_URI =
  Platform.OS === "web" ? makeRedirectUri() : undefined;

// ================= SUCCESS MODAL COMPONENT =================
const SuccessModal = ({
  visible,
  account,
  isVerified,
  isVerifying,
  otpDeliveryMode,
  otpValue,
  otpError,
  otpTimerLabel,
  canResendOtp,
  onOtpChange,
  onConfirm,
  onVerifyOtp,
  onResendOtp,
  isTransitioning = false,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={isVerified ? onConfirm : undefined}
    >
      <View style={visitorRegisterStyles.modalOverlay}>
        <View style={visitorRegisterStyles.successModalContainer}>
          <View style={visitorRegisterStyles.successIconContainer}>
            <LinearGradient
              colors={["#0A3D91", "#041E42"]}
              style={visitorRegisterStyles.successIconGradient}
            >
              <Ionicons name={isVerified ? "checkmark-done" : "mail-unread-outline"} size={30} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={visitorRegisterStyles.successTitle}>
            {isVerified ? "Account Verified" : "You're almost there!"}
          </Text>
          <Text style={visitorRegisterStyles.successMessage}>
            {isVerified
              ? "Your account is verified. Continue to sign in to your visitor account."
              : otpDeliveryMode === "backend_log"
                ? "Email delivery is unavailable in this development setup. Ask the developer for the code shown in the backend logs."
                : "Enter the 6-digit verification code sent to your email. Your visitor account stays locked until this code is verified."}
          </Text>
          {account?.email ? (
            <View style={visitorRegisterStyles.otpEmailPill}>
              <Ionicons name="mail-outline" size={15} color="#0A3D91" />
              <Text style={visitorRegisterStyles.otpEmailText} numberOfLines={1}>
                {account.email}
              </Text>
            </View>
          ) : null}
          {!isVerified ? (
            <View style={visitorRegisterStyles.otpVerifyBox}>
              <Text style={visitorRegisterStyles.otpLabel}>Verification Code</Text>
              <View
                style={[
                  visitorRegisterStyles.otpCodeEntry,
                  otpError && visitorRegisterStyles.otpCodeEntryError,
                ]}
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <View
                    key={`otp-${index}`}
                    style={[
                      visitorRegisterStyles.otpDigitBox,
                      otpValue[index] && visitorRegisterStyles.otpDigitBoxFilled,
                    ]}
                  >
                    <Text style={visitorRegisterStyles.otpDigitText}>
                      {otpValue[index] || ""}
                    </Text>
                  </View>
                ))}
                <TextInput
                  style={visitorRegisterStyles.otpHiddenInput}
                  value={otpValue}
                  onChangeText={(value) => onOtpChange(String(value || "").replace(/\D/g, "").slice(0, 6))}
                  placeholder=""
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>
              {otpError ? (
                <Text style={visitorRegisterStyles.otpErrorText}>{otpError}</Text>
              ) : (
                <Text style={visitorRegisterStyles.otpHintText}>
                  The code expires in 10 minutes. Check your inbox or spam folder.
                </Text>
              )}
            </View>
          ) : null}
          {!isVerified ? (
            <TouchableOpacity
              style={[
                visitorRegisterStyles.successButton,
                isVerified && visitorRegisterStyles.successButtonMuted,
              ]}
              onPress={onVerifyOtp}
              disabled={isVerified || isVerifying}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={["#0A3D91", "#041E42"]}
                style={visitorRegisterStyles.successGradient}
              >
                <Text style={visitorRegisterStyles.successButtonText}>
                  {isVerifying
                    ? "Verifying..."
                    : isVerified
                      ? "Account Verified"
                      : "Verify Code"}
                </Text>
                <Ionicons
                  name={isVerified ? "checkmark-circle-outline" : "keypad-outline"}
                  size={20}
                  color="#FFFFFF"
                />
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
          {!isVerified ? (
            <TouchableOpacity
              style={[
                visitorRegisterStyles.resendOtpButton,
                (!canResendOtp || isVerifying) && visitorRegisterStyles.resendOtpButtonDisabled,
              ]}
              onPress={onResendOtp}
              disabled={!canResendOtp || isVerifying}
            >
              <Text style={visitorRegisterStyles.resendOtpButtonText}>
                {canResendOtp ? "Resend Code" : `Resend in ${otpTimerLabel}`}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              visitorRegisterStyles.successButton,
              !isVerified && visitorRegisterStyles.successButtonMuted,
              isTransitioning && { opacity: 0.78 },
            ]}
            onPress={onConfirm}
            disabled={!isVerified || isTransitioning}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={isVerified ? ["#0A3D91", "#0A3D91"] : ["#94A3B8", "#64748B"]}
              style={visitorRegisterStyles.successGradient}
            >
              <Text style={visitorRegisterStyles.successButtonText}>
                {isVerified ? "Continue to Sign In" : "Verify Code First"}
              </Text>
              <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const ExistingAccountModal = ({ visible, email, onLogin, onEditEmail, isTransitioning = false }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onEditEmail}>
    <View style={visitorRegisterStyles.modalOverlay}>
      <View style={visitorRegisterStyles.existingAccountModal}>
        <LinearGradient colors={["#EEF5FF", "#FFFFFF"]} style={visitorRegisterStyles.existingAccountHeader}>
          <View style={visitorRegisterStyles.existingAccountIcon}>
            <Ionicons name="person-circle-outline" size={30} color="#0A3D91" />
          </View>
          <Text style={visitorRegisterStyles.existingAccountTitle}>Account Found</Text>
          <Text style={visitorRegisterStyles.existingAccountMessage}>
            This email is already registered. Sign in to your visitor account to request or manage appointments.
          </Text>
          {email ? (
            <View style={visitorRegisterStyles.existingAccountEmailPill}>
              <Ionicons name="mail-outline" size={15} color="#0A3D91" />
              <Text style={visitorRegisterStyles.existingAccountEmailText} numberOfLines={1}>
                {email}
              </Text>
            </View>
          ) : null}
        </LinearGradient>
        <View style={visitorRegisterStyles.existingAccountActions}>
          <TouchableOpacity
            style={[
              visitorRegisterStyles.existingAccountLoginButton,
              isTransitioning && { opacity: 0.78 },
            ]}
            onPress={onLogin}
            disabled={isTransitioning}
          >
            <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
            <Text style={visitorRegisterStyles.existingAccountLoginText}>Go to Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={visitorRegisterStyles.existingAccountEditButton} onPress={onEditEmail}>
            <Text style={visitorRegisterStyles.existingAccountEditText}>Edit Email</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ================= DATA PRIVACY MODAL =================
const DataPrivacyModal = ({
  visible,
  onAccept,
  onDecline,
  isSubmitting = false,
  submissionError = "",
}) => {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (visible) {
      setAccepted(false);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={visitorRegisterStyles.modalOverlay}>
        <View style={visitorRegisterStyles.privacyModalContainer}>
          <View style={visitorRegisterStyles.privacyModalHeader}>
            <View style={visitorRegisterStyles.privacyHeaderTopRow}>
              <LinearGradient
                colors={["#0A3D91", "#1C6DD0"]}
                style={visitorRegisterStyles.privacyIconGradient}
              >
                <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
              </LinearGradient>
              <View style={visitorRegisterStyles.privacyHeaderBadge}>
                <Ionicons name="lock-closed-outline" size={13} color="#0A3D91" />
                <Text style={visitorRegisterStyles.privacyHeaderBadgeText}>Secure Consent</Text>
              </View>
            </View>
            <Text style={visitorRegisterStyles.privacyModalTitle}>
              Review Data Privacy
            </Text>
            <Text style={visitorRegisterStyles.privacyModalSubtitle}>
              SafePass will use your details only for account creation, visitor appointments, access monitoring, and security records.
            </Text>
          </View>
          <ScrollView
            style={visitorRegisterStyles.privacyModalContent}
            contentContainerStyle={visitorRegisterStyles.privacyModalContentInner}
            showsVerticalScrollIndicator={false}
          >
            {submissionError ? (
              <View style={visitorRegisterStyles.privacyErrorBanner}>
                <View style={visitorRegisterStyles.privacyErrorIcon}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                </View>
                <View style={visitorRegisterStyles.privacyErrorCopy}>
                  <Text style={visitorRegisterStyles.privacyErrorTitle}>Account Creation Failed</Text>
                  <Text style={visitorRegisterStyles.privacyErrorText}>{submissionError}</Text>
                </View>
              </View>
            ) : null}
            <View style={visitorRegisterStyles.privacySection}>
              <View style={visitorRegisterStyles.privacySectionHeader}>
                <View style={visitorRegisterStyles.privacySectionIcon}>
                  <Ionicons name="person-outline" size={17} color="#0A3D91" />
                </View>
                <Text style={visitorRegisterStyles.privacySectionTitle}>
                  Information We Collect
                </Text>
              </View>
              <Text style={visitorRegisterStyles.privacySectionText}>
                Full name, email address, username, contact number, password, and registration verification details.
              </Text>
            </View>
            <View style={visitorRegisterStyles.privacySection}>
              <View style={visitorRegisterStyles.privacySectionHeader}>
                <View style={visitorRegisterStyles.privacySectionIcon}>
                  <Ionicons name="analytics-outline" size={17} color="#0A3D91" />
                </View>
                <Text style={visitorRegisterStyles.privacySectionTitle}>
                  How We Use Your Data
                </Text>
              </View>
              <Text style={visitorRegisterStyles.privacySectionText}>
                To create your account, verify your email, link future appointments, and show your approval status.
              </Text>
            </View>
            <View style={visitorRegisterStyles.privacySection}>
              <View style={visitorRegisterStyles.privacySectionHeader}>
                <View style={visitorRegisterStyles.privacySectionIcon}>
                  <Ionicons name="lock-closed-outline" size={17} color="#0A3D91" />
                </View>
                <Text style={visitorRegisterStyles.privacySectionTitle}>
                  Data Protection
                </Text>
              </View>
              <Text style={visitorRegisterStyles.privacySectionText}>
                Your records stay inside SafePass and are visible only to authorized staff when needed for your visit.
              </Text>
            </View>
          </ScrollView>
          <TouchableOpacity
            style={visitorRegisterStyles.privacyCheckboxRow}
            activeOpacity={isSubmitting ? 1 : 0.8}
            onPress={() => setAccepted((previous) => !previous)}
            disabled={isSubmitting}
          >
            <View
              style={[
                visitorRegisterStyles.privacyCheckbox,
                accepted && visitorRegisterStyles.privacyCheckboxChecked,
              ]}
            >
              {accepted ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
            </View>
            <Text style={visitorRegisterStyles.privacyCheckboxText}>
              I understand and accept the data privacy policy.
            </Text>
          </TouchableOpacity>
          <View style={visitorRegisterStyles.privacyButtonRow}>
            <TouchableOpacity
              style={visitorRegisterStyles.privacyDeclineButton}
              onPress={onDecline}
              disabled={isSubmitting}
            >
              <Text style={visitorRegisterStyles.privacyDeclineButtonText}>
                {submissionError ? "Edit Details" : "Cancel"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                visitorRegisterStyles.privacyAcceptButton,
                (!accepted || isSubmitting) && visitorRegisterStyles.privacyAcceptButtonDisabled,
              ]}
              onPress={() => {
                if (accepted && !isSubmitting) onAccept();
              }}
              disabled={!accepted || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={visitorRegisterStyles.privacyAcceptButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const AnimatedFieldCard = ({ children, focused, style }) => {
  const motionAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const hoverRef = useRef(false);

  const animateTo = (toValue) => {
    Animated.spring(motionAnim, {
      toValue,
      friction: 8,
      tension: 90,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  useEffect(() => {
    animateTo(focused || hoverRef.current ? 1 : 0);
  }, [focused]);

  const handleHoverIn = () => {
    hoverRef.current = true;
    animateTo(1);
  };

  const handleHoverOut = () => {
    hoverRef.current = false;
    if (!focused) animateTo(0);
  };

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              translateY: motionAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -7],
              }),
            },
            {
              scale: motionAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.015],
              }),
            },
          ],
        },
      ]}
      {...(Platform.OS === "web" && {
        onMouseEnter: handleHoverIn,
        onMouseLeave: handleHoverOut,
      })}
    >
      {children}
    </Animated.View>
  );
};

export default function VisitorRegisterScreen({ navigation, route }) {
  const startAviationTransition = useAviationTransition();
  const shouldReturnHome = route?.params?.fromHome || !navigation.canGoBack();
  const { width: viewportWidth } = useWindowDimensions();
  const isCompactRegister = viewportWidth <= 420;
  const isSimpleRegister = Platform.OS === "web" && viewportWidth < 640;
  const isTabletRegister = viewportWidth >= 768;
  const isDesktopRegister = viewportWidth >= 980;
  const useTwoColumnFields = isDesktopRegister || viewportWidth >= 640;
  const registerHorizontalMargin = isCompactRegister ? 12 : 16;
  const registerShellMaxWidth = Math.min(
    isDesktopRegister ? 1240 : 860,
    Math.max(viewportWidth - registerHorizontalMargin * 2, 300),
  );
  const headerResponsiveStyle = {
    paddingBottom: isCompactRegister ? 22 : 28,
  };
  const headerButtonsResponsiveStyle = {
    left: registerHorizontalMargin,
    right: registerHorizontalMargin,
  };
  const headerContentResponsiveStyle = {
    paddingHorizontal: isCompactRegister ? 16 : 22,
    maxWidth: isTabletRegister ? 720 : 640,
  };
  const headerIconGradientResponsiveStyle = {
    width: isCompactRegister ? 48 : 56,
    height: isCompactRegister ? 48 : 56,
    borderRadius: isCompactRegister ? 24 : 28,
  };
  const headerTitleResponsiveStyle = {
    fontSize: isCompactRegister ? 24 : undefined,
    lineHeight: isCompactRegister ? 30 : undefined,
  };
  const headerDescriptionResponsiveStyle = {
    lineHeight: isCompactRegister ? 20 : 22,
  };
  const formShellResponsiveStyle = Platform.OS === "web"
    ? { maxWidth: registerShellMaxWidth, ...(isSimpleRegister ? { marginTop: 16 } : {}) }
    : null;
  const formShellDesktopStyle = isDesktopRegister
    ? visitorRegisterStyles.formShellDesktop
    : null;
  const sectionCardResponsiveStyle = {
    marginHorizontal: registerHorizontalMargin,
  };
  const contentResponsiveStyle = [
    { padding: isCompactRegister ? 16 : 22 },
    isDesktopRegister && visitorRegisterStyles.contentDesktop,
  ];
  const sectionHeaderResponsiveStyle = isCompactRegister
    ? { flexDirection: "column", alignItems: "flex-start" }
    : null;
  const actionRowResponsiveStyle = isCompactRegister
    ? { flexDirection: "column", gap: 10 }
    : null;
  const actionButtonResponsiveStyle = isCompactRegister
    ? { width: "100%", flex: 0 }
    : null;
  const formGridResponsiveStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  };
  const formCardResponsiveStyle = {
    width: useTwoColumnFields ? "48.5%" : "100%",
    flexGrow: useTwoColumnFields ? 0 : 1,
  };
  const formCardDesktopStyle = isDesktopRegister
    ? visitorRegisterStyles.formCardDesktop
    : null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDataPrivacy, setShowDataPrivacy] = useState(false);
  const [existingAccountEmail, setExistingAccountEmail] = useState("");
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [privacySubmissionError, setPrivacySubmissionError] = useState("");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    username: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({
    fullName: "",
    email: "",
    username: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [focusedField, setFocusedField] = useState(null);
  const [touchedFields, setTouchedFields] = useState({});
  const [completedFields, setCompletedFields] = useState({});
  const [registeredVisitor, setRegisteredVisitor] = useState(null);
  const [isVerifyingAccount, setIsVerifyingAccount] = useState(false);
  const [registrationOtp, setRegistrationOtp] = useState("");
  const [registrationOtpError, setRegistrationOtpError] = useState("");
  const [registrationOtpResendAvailableAt, setRegistrationOtpResendAvailableAt] = useState(null);
  const [registrationOtpResendSecondsLeft, setRegistrationOtpResendSecondsLeft] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [socialSignup, setSocialSignup] = useState(null);
  const [socialSignupBusy, setSocialSignupBusy] = useState("");
  const [socialSignupNotice, setSocialSignupNotice] = useState(null);
  const { googleClientId, googleRequest, promptGoogleSignIn: promptGoogleSignUp } = useGoogleSignIn({ redirectUri: VISITOR_SOCIAL_SIGNUP_REDIRECT_URI });
  const screenFadeAnim = useRef(new Animated.Value(0.96)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const iconFloatAnim = useRef(new Animated.Value(0)).current;
  const progressFloatAnim = useRef(new Animated.Value(0)).current;
  const topBackPressAnim = useRef(new Animated.Value(1)).current;
  const topBackHoverAnim = useRef(new Animated.Value(0)).current;
  const secondaryPressAnim = useRef(new Animated.Value(1)).current;
  const continuePressAnim = useRef(new Animated.Value(1)).current;
  const secondaryHoverAnim = useRef(new Animated.Value(0)).current;
  const continueHoverAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setTransitionBusy(false);
    });

    return unsubscribe;
  }, [navigation]);

  const goToVisitorLogin = (overrides = {}) => {
    if (transitionBusy) return;
    setTransitionBusy(true);
    const navigateToLogin = () => {
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Login",
            params: {
              role: "visitor",
              skipArrivalSplash: true,
              ...overrides,
            },
          },
        ],
      });
    };

    if (startAviationTransition) {
      startAviationTransition({
        mode: "journey",
        message: "Departing visitor registration...",
        arrivalMessage: "Arriving at secure login...",
        duration: 2500,
        onBeforeFade: navigateToLogin,
        onDone: () => setTransitionBusy(false),
      });
      return;
    }

    setTransitionBusy(false);
    navigation.reset({
      index: 0,
      routes: [
        {
          name: "Login",
          params: {
            role: "visitor",
            ...overrides,
          },
        },
      ],
    });
  };

  const handleBack = () => {
    if (transitionBusy) return;
    setTransitionBusy(true);
    if (startAviationTransition) {
      startAviationTransition({
        mode: "journey",
        message: "Departing visitor registration...",
        arrivalMessage: shouldReturnHome
          ? "Arriving at campus access..."
          : "Returning to previous page...",
        duration: 2500,
        onBeforeFade: () => {
          if (!shouldReturnHome && navigation.canGoBack()) {
            navigation.goBack();
            return;
          }

          navigation.navigate("RoleSelect", {
            skipArrivalSplash: true,
            timestamp: Date.now(),
          });
        },
        onDone: () => setTransitionBusy(false),
      });
      return;
    }

    if (!shouldReturnHome && navigation.canGoBack()) {
      setTransitionBusy(false);
      navigation.goBack();
      return;
    }

    setTransitionBusy(false);
    navigation.navigate("RoleSelect", {
      skipArrivalSplash: true,
      timestamp: Date.now(),
    });
  };

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.title =
        "Visitor Registration | Sapphire International Aviation Academy";
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") { screenFadeAnim.setValue(1); headerAnim.setValue(1); formAnim.setValue(1); return; }
    Animated.parallel([
      Animated.timing(screenFadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(headerAnim, {
        toValue: 1,
        friction: 10,
        tension: 44,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 560,
        delay: 120,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    const iconFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(iconFloatAnim, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(iconFloatAnim, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    const progressFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(progressFloatAnim, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(progressFloatAnim, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );

    iconFloat.start();
    progressFloat.start();

    return () => {
      iconFloat.stop();
      progressFloat.stop();
    };
  }, [formAnim, headerAnim, iconFloatAnim, progressFloatAnim, screenFadeAnim]);

  useEffect(() => {
    if (!registrationOtpResendAvailableAt) {
      setRegistrationOtpResendSecondsLeft(0);
      return undefined;
    }

    const updateTimer = () => {
      const availableTime = new Date(registrationOtpResendAvailableAt).getTime();
      if (!Number.isFinite(availableTime)) {
        setRegistrationOtpResendSecondsLeft(0);
        return;
      }
      setRegistrationOtpResendSecondsLeft(Math.max(0, Math.ceil((availableTime - Date.now()) / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [registrationOtpResendAvailableAt]);

  const normalizeFullName = (name) => name.replace(/\s{2,}/g, " ").trim();

  const normalizeUsername = (username) => username.trim().toLowerCase();

  const formatOtpTimer = (seconds = 0) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  const animatePress = (animatedValue, toValue) => {
    Animated.spring(animatedValue, {
      toValue,
      friction: 7,
      tension: 100,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const animateHover = (animatedValue, toValue) => {
    Animated.spring(animatedValue, {
      toValue,
      friction: 8,
      tension: 90,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const validateName = (name) => {
    const normalizedName = normalizeFullName(String(name || ""));

    if (!normalizedName) return "Full name is required";
    if (normalizedName.length < 5) return "Please enter your full name";

    const nameParts = normalizedName.split(" ").filter(Boolean);
    if (nameParts.length < 2) return "Please enter at least first and last name";

    if (!/^[A-Za-z][A-Za-z\s\-']*[A-Za-z]$/.test(normalizedName)) {
      return "Name must start and end with a letter";
    }

    if (/[-']{2,}/.test(normalizedName)) {
      return "Name contains invalid punctuation";
    }

    return "";
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) return "Email address is required";
    if (!emailRegex.test(email)) return "Please enter a valid email address";
    return "";
  };

  const validateUsername = (username) => {
    const normalizedUsername = normalizeUsername(String(username || ""));

    if (!normalizedUsername) return "Username is required";
    if (normalizedUsername.length < 4) return "Username must be at least 4 characters";
    if (normalizedUsername.length > 20) return "Username must be 20 characters or less";
    if (!/^[a-z][a-z0-9._]*$/.test(normalizedUsername)) {
      return "Use lowercase letters, numbers, dots, or underscores only";
    }

    return "";
  };

  const validatePhone = (phone) => {
    if (!String(phone || "").trim()) return "Contact number is required";
    if (!isValidPhilippineMobileNumber(phone)) return PHILIPPINE_MOBILE_NUMBER_MESSAGE;
    return "";
  };

  const validatePassword = (password) => {
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter";
    if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter";
    if (!/\d/.test(password)) return "Password must include at least one number";
    return "";
  };

  const passwordChecklist = {
    minLength: formData.password.length >= 8,
    uppercase: /[A-Z]/.test(formData.password),
    lowercase: /[a-z]/.test(formData.password),
    number: /\d/.test(formData.password),
  };

  const validateConfirmPassword = (confirmPassword, password) => {
    if (!confirmPassword) return "Please confirm your password";
    if (confirmPassword !== password) return "Passwords do not match";
    return "";
  };

  const showValidationAlert = (errorsList) => {
    Alert.alert(
      "Missing Information",
      `Please fix the following:\n\n${errorsList.join("\n")}`,
      [{ text: "OK" }],
    );
  };

  const getFieldError = (field, value, nextFormData = formData) => {
    if (field === "fullName") return validateName(value);
    if (field === "email") return validateEmail(value);
    if (field === "username") return validateUsername(value);
    if (field === "phone") return validatePhone(value);
    if (field === "password") return validatePassword(value);
    if (field === "confirmPassword") {
      return validateConfirmPassword(value, nextFormData.password);
    }
    return "";
  };

  const handleInputChange = (field, value) => {
    let nextValue = value;

    if (field === "fullName") {
      nextValue = value.replace(/[^A-Za-z\s\-']/g, "").replace(/\s{2,}/g, " ");
    } else if (field === "email") {
      nextValue = value.trim().toLowerCase();
    } else if (field === "username") {
      nextValue = value.replace(/[^A-Za-z0-9._]/g, "").toLowerCase();
    } else if (field === "phone") {
      nextValue = value.replace(/\D/g, "").slice(0, 11);
    }

    const nextFormData = { ...formData, [field]: nextValue };
    const nextFieldError = getFieldError(field, nextValue, nextFormData);
    const nextConfirmPasswordError = getFieldError(
      "confirmPassword",
      nextFormData.confirmPassword,
      nextFormData,
    );

    setFormData(nextFormData);
    setErrors((previous) => ({
      ...previous,
      [field]: touchedFields[field] ? nextFieldError : "",
      confirmPassword:
        field === "password"
          ? touchedFields.confirmPassword
            ? nextConfirmPasswordError
            : ""
          : previous.confirmPassword,
    }));
    setCompletedFields((previous) => ({
      ...previous,
      [field]: Boolean(nextValue && !nextFieldError),
      confirmPassword:
        field === "password"
          ? Boolean(nextFormData.confirmPassword && !nextConfirmPasswordError)
          : previous.confirmPassword,
    }));
  };

  const handleFieldBlur = (field) => {
    setFocusedField(null);
    if (field === "fullName") {
      setFormData((previous) => ({
        ...previous,
        fullName: normalizeFullName(previous.fullName),
      }));
    } else if (field === "username") {
      setFormData((previous) => ({
        ...previous,
        username: normalizeUsername(previous.username),
      }));
    }
    setTouchedFields((previous) => ({ ...previous, [field]: true }));
    setErrors((previous) => ({
      ...previous,
      [field]: getFieldError(
        field,
        field === "fullName"
          ? normalizeFullName(formData[field])
          : field === "username"
            ? normalizeUsername(formData[field])
            : formData[field],
        {
          ...formData,
          ...(field === "fullName"
            ? { fullName: normalizeFullName(formData.fullName) }
            : field === "username"
              ? { username: normalizeUsername(formData.username) }
              : {}),
        },
      ),
    }));
  };

  const validateForm = () => {
    const nextErrors = {
      fullName: validateName(formData.fullName),
      email: validateEmail(formData.email),
      username: validateUsername(formData.username),
      phone: validatePhone(formData.phone),
      password: socialSignup ? "" : validatePassword(formData.password),
      confirmPassword: socialSignup
        ? ""
        : validateConfirmPassword(formData.confirmPassword, formData.password),
    };

    setErrors(nextErrors);

    const labels = {
      fullName: "Full Name",
      email: "Email",
      username: "Username",
      phone: "Contact Number",
      password: "Password",
      confirmPassword: "Confirm Password",
    };

    const errorMessages = Object.entries(nextErrors)
      .filter(([, message]) => Boolean(message))
      .map(([field, message]) => `- ${labels[field]}: ${message}`);

    if (errorMessages.length > 0) {
      setTouchedFields({
        fullName: true,
        email: true,
        username: true,
        phone: true,
        password: true,
        confirmPassword: true,
      });
      showValidationAlert(errorMessages);
      return false;
    }

    return true;
  };

  const applySocialSignupProfile = (provider, response) => {
    const profile = response?.profile;
    if (!response?.signupToken || !profile?.email || !profile?.fullName) {
      throw new Error("The social provider did not return a usable account profile.");
    }
    if (response.accountExists) {
      setSocialSignup(null);
      setExistingAccountEmail(String(profile.email).trim().toLowerCase());
      setSocialSignupNotice({
        type: "existing",
        email: String(profile.email).trim().toLowerCase(),
        message: "A SafePass account already exists for this verified email. Sign in instead, then connect this provider from your profile if needed.",
      });
      return;
    }
    const suggestedUsername = String(profile.email).split("@")[0]
      .replace(/[^A-Za-z0-9._]/g, "")
      .slice(0, 24)
      .toLowerCase();
    const nextFormData = {
      ...formData,
      fullName: normalizeFullName(profile.fullName),
      email: String(profile.email).trim().toLowerCase(),
      username: formData.username || suggestedUsername,
      password: "",
      confirmPassword: "",
    };
    setFormData(nextFormData);
    setSocialSignup({ provider, signupToken: response.signupToken });
    setSocialSignupNotice({
      type: "connected",
      message: "Google is connected. Your account has not been created yet—add a username and contact number, then continue to create your account and verify it before signing in.",
    });
    setErrors((previous) => ({ ...previous, fullName: "", email: "", password: "", confirmPassword: "" }));
    setCompletedFields((previous) => ({ ...previous, fullName: true, email: true }));
  };

  const handleGoogleSignup = async () => {
    if (!googleClientId || !googleRequest) {
      Alert.alert("Sign-up not ready", "Google sign-up is still loading. Please try again.");
      return;
    }
    try {
      setSocialSignupBusy("google");
      const result = await promptGoogleSignUp();
      if (result.type !== "success") return;
      const token = result.params?.id_token || result.authentication?.idToken;
      if (!token) throw new Error("Google did not return an account token.");
      applySocialSignupProfile("google", await ApiService.getSocialSignupProfile("google", token));
    } catch (error) {
      Alert.alert("Unable to connect account", error?.message || "Please try again or use the standard visitor form.");
    } finally {
      setSocialSignupBusy("");
    }
  };

  const handleSubmit = () => {
    if (validateForm()) {
      setPrivacySubmissionError("");
      setShowDataPrivacy(true);
    }
  };

  const handlePrivacyAccept = async () => {
    setPrivacySubmissionError("");
    setIsSubmitting(true);

    try {
      const response = await ApiService.registerVisitor({
        fullName: normalizeFullName(formData.fullName),
        email: formData.email,
        username: normalizeUsername(formData.username),
        phone: normalizePhilippineMobileNumber(formData.phone),
        password: formData.password,
        socialSignupToken: socialSignup?.signupToken || "",
        privacyAccepted: true,
        privacyAcceptedAt: new Date().toISOString(),
      });

      if (response?.success) {
        setShowDataPrivacy(false);
        setRegisteredVisitor({
          username: response.credentials?.username || formData.username,
          email: response.credentials?.email || formData.email,
          isVerified: false,
          otpDeliveryMode: response.otpDeliveryMode || "email",
          socialProvider: socialSignup?.provider || "",
        });
        setRegistrationOtpResendAvailableAt(new Date(Date.now() + 60 * 1000).toISOString());
        setRegistrationOtp("");
        setRegistrationOtpError("");
        setTimeout(() => {
          setShowSuccess(true);
        }, Platform.OS === "web" ? 120 : 80);
      } else {
        setPrivacySubmissionError(
          response?.message || "Failed to create your account. Please try again.",
        );
      }
    } catch (error) {
      const errorMessage =
        error?.data?.message || error.message || "Failed to connect to server.";
      const errorField = error?.data?.field;
      const normalizedMessage = errorMessage.toLowerCase();

      if (
        errorField === "email" ||
        normalizedMessage.includes("email already") ||
        normalizedMessage.includes("with this email already exists")
      ) {
        setPrivacySubmissionError("");
        setShowDataPrivacy(false);
        setExistingAccountEmail(formData.email);
        setErrors((previous) => ({
          ...previous,
          email: "A visitor account with this email already exists.",
        }));
        setTouchedFields((previous) => ({
          ...previous,
          email: true,
        }));
      } else if (errorField === "username" || normalizedMessage.includes("username")) {
        setPrivacySubmissionError(
          "That username is already taken. Edit your details and choose another username.",
        );
        setErrors((previous) => ({
          ...previous,
          username: "That username is already taken.",
        }));
        setTouchedFields((previous) => ({
          ...previous,
          username: true,
        }));
        Alert.alert(
          "Username Unavailable",
          "That username is already taken. Please choose another username.",
        );
      } else if (
        normalizedMessage.includes("already exists") ||
        normalizedMessage.includes("duplicate")
      ) {
        setPrivacySubmissionError("");
        setShowDataPrivacy(false);
        setExistingAccountEmail(formData.email);
      } else if (
        normalizedMessage.includes("network request failed") ||
        normalizedMessage.includes("cannot connect to backend")
      ) {
        setPrivacySubmissionError(
          "Cannot connect to the server. Please check that your backend is running.",
        );
      } else {
        setPrivacySubmissionError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrivacyDecline = () => {
    const hadSubmissionError = Boolean(privacySubmissionError);
    setShowDataPrivacy(false);
    setPrivacySubmissionError("");
    if (hadSubmissionError) return;
    Alert.alert(
      "Privacy Policy Required",
      "You must accept the data privacy policy to create an account.",
    );
  };

  const handleSuccessConfirm = async () => {
    if (!registeredVisitor?.isVerified) return;
    const loginIdentifier =
      registeredVisitor?.email ||
      registeredVisitor?.username ||
      formData.email;
    const loginPassword = registeredVisitor?.socialProvider ? "" : registeredVisitor?.password || formData.password;

    setShowSuccess(false);

    await ApiService.clearAuth();
    await AsyncStorage.removeItem("pendingVisitor");
    await AsyncStorage.setItem("isNewRegistration", "true");

    goToVisitorLogin({
      initialEmail: loginIdentifier,
      initialPassword: loginPassword,
    });
  };

  const handleVerifyRegistrationOtp = async () => {
    const email = registeredVisitor?.email || formData.email;
    const otpCode = String(registrationOtp || "").replace(/\D/g, "").slice(0, 6);

    if (!email || !otpCode) {
      setRegistrationOtpError("Please enter the 6-digit verification code.");
      return;
    }

    if (otpCode.length !== 6) {
      setRegistrationOtpError("The verification code must be exactly 6 digits.");
      return;
    }

    try {
      setRegistrationOtpError("");
      setIsVerifyingAccount(true);
      const response = await ApiService.verifyRegistrationOtp(email, otpCode);

      if (response?.success) {
        setRegisteredVisitor((previous) => ({
          ...previous,
          isVerified: true,
        }));
        setRegistrationOtpResendAvailableAt(null);
        return;
      }

      Alert.alert(
        "Verification Failed",
        response?.message || "Unable to verify the code. Please try again.",
      );
    } catch (error) {
      setRegistrationOtpError(error?.message || "Please try again or request a new code.");
      Alert.alert(
        "Unable to Verify Code",
        error?.message || "Please try again or request a new code.",
      );
    } finally {
      setIsVerifyingAccount(false);
    }
  };

  const handleResendRegistrationOtp = async () => {
    const email = registeredVisitor?.email || formData.email;
    if (!email) {
      Alert.alert("Email Missing", "Unable to find the visitor email for code resend.");
      return;
    }

    try {
      setIsVerifyingAccount(true);
      const response = await ApiService.resendRegistrationOtp(email);
      if (response?.success) {
        setRegisteredVisitor((previous) => ({
          ...previous,
          otpDeliveryMode: response.otpDeliveryMode || previous?.otpDeliveryMode || "email",
        }));
        setRegistrationOtpResendAvailableAt(new Date(Date.now() + 60 * 1000).toISOString());
        setRegistrationOtp("");
        setRegistrationOtpError("");
        Alert.alert(
          "Verification Code Sent",
          response.otpDeliveryMode === "backend_log"
            ? "A new code is in the development backend logs. Ask the developer for it."
            : "A new verification code has been sent to your email. Please also check your spam folder just in case.",
        );
        return;
      }

      Alert.alert("Unable to Resend Code", response?.message || "Please try again.");
    } catch (error) {
      Alert.alert("Unable to Resend Code", error?.message || "Please try again.");
    } finally {
      setIsVerifyingAccount(false);
    }
  };

  const baseRegistrationFields = [
    { key: "fullName", label: "Name", icon: "person-outline" },
    { key: "email", label: "Email", icon: "mail-outline" },
    { key: "username", label: "Username", icon: "at-outline" },
    { key: "phone", label: "Phone", icon: "call-outline" },
    { key: "password", label: "Password", icon: "lock-closed-outline" },
    { key: "confirmPassword", label: "Confirm", icon: "shield-checkmark-outline" },
  ];
  const registrationFields = socialSignup
    ? baseRegistrationFields.filter((field) => field.key !== "password" && field.key !== "confirmPassword")
    : baseRegistrationFields;
  const fieldCompletion = {
    fullName: Boolean(formData.fullName && !validateName(formData.fullName)),
    email: Boolean(formData.email && !validateEmail(formData.email)),
    username: Boolean(formData.username && !validateUsername(formData.username)),
    phone: Boolean(formData.phone && !validatePhone(formData.phone)),
    password: Boolean(formData.password && !validatePassword(formData.password)),
    confirmPassword: Boolean(
      formData.confirmPassword &&
        !validateConfirmPassword(formData.confirmPassword, formData.password),
    ),
  };
  const totalRegistrationFields = registrationFields.length;
  const completionCount = registrationFields.filter(
    (field) => fieldCompletion[field.key],
  ).length;
  const registrationProgressPercentage = Math.round(
    (completionCount / totalRegistrationFields) * 100,
  );
  const fieldConfig = {
    fullName: {
      label: "Full Name",
      icon: "person",
      placeholder: "Enter your full name",
      keyboard: "default",
      autoCapitalize: "words",
      secureTextEntry: false,
    },
    email: {
      label: "Email Address",
      icon: "mail",
      placeholder: "your@email.com",
      keyboard: "email-address",
      autoCapitalize: "none",
      secureTextEntry: false,
    },
    username: {
      label: "Username",
      icon: "at",
      placeholder: "Choose a username",
      keyboard: "default",
      autoCapitalize: "none",
      secureTextEntry: false,
    },
    phone: {
      label: "Contact Number",
      icon: "call",
      placeholder: "09123456789",
      keyboard: "phone-pad",
      autoCapitalize: "none",
      secureTextEntry: false,
      maxLength: 11,
    },
    password: {
      label: "Password",
      icon: "lock-closed",
      placeholder: "Create a password",
      keyboard: "default",
      autoCapitalize: "none",
      secureTextEntry: !showPassword,
    },
    confirmPassword: {
      label: "Confirm Password",
      icon: "shield-checkmark",
      placeholder: "Re-enter your password",
      keyboard: "default",
      autoCapitalize: "none",
      secureTextEntry: !showConfirmPassword,
    },
  };

  const renderStepInsights = () => (
    <View style={visitorRegisterStyles.stepInsightCard}>
      <View style={visitorRegisterStyles.stepInsightHeader}>
        <View style={visitorRegisterStyles.stepInsightIcon}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#0A3D91" />
        </View>
        <View style={visitorRegisterStyles.stepInsightTextWrap}>
          <Text style={visitorRegisterStyles.stepInsightTitle}>Account Setup</Text>
          <Text style={visitorRegisterStyles.stepInsightSubtitle}>
            Create your visitor account first. Appointment requests will only be
            created after login so everything stays tied to your account.
          </Text>
        </View>
      </View>
      <View style={visitorRegisterStyles.stepInsightStats}>
        <View style={visitorRegisterStyles.stepInsightStat}>
          <Text style={visitorRegisterStyles.stepInsightStatValue}>{completionCount}/6</Text>
          <Text style={visitorRegisterStyles.stepInsightStatLabel}>Complete</Text>
        </View>
        <View style={visitorRegisterStyles.stepInsightDivider} />
        <View style={visitorRegisterStyles.stepInsightStat}>
          <Text style={visitorRegisterStyles.stepInsightStatValue}>Login</Text>
          <Text style={visitorRegisterStyles.stepInsightStatLabel}>Ready after signup</Text>
        </View>
        <View style={visitorRegisterStyles.stepInsightDivider} />
        <View style={visitorRegisterStyles.stepInsightStat}>
          <Text style={visitorRegisterStyles.stepInsightStatValue}>Secure</Text>
          <Text style={visitorRegisterStyles.stepInsightStatLabel}>Account-based flow</Text>
        </View>
      </View>
    </View>
  );

  const headerEntranceStyle = {
    opacity: screenFadeAnim,
    transform: [
      {
        translateY: headerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-18, 0],
        }),
      },
    ],
  };
  const iconFloatStyle = {
    transform: [
      {
        translateY: iconFloatAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6],
        }),
      },
    ],
  };
  const formEntranceStyle = {
    opacity: formAnim,
    transform: [
      {
        translateY: formAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  };
  const progressFloatStyle = {
    transform: [
      {
        translateY: progressFloatAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  };
  const getActionMotionStyle = (pressAnim, hoverAnim) => ({
    transform: [
      {
        translateY: hoverAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6],
        }),
      },
      { scale: pressAnim },
      {
        scale: hoverAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.02],
        }),
      },
    ],
  });
  const topBackMotionStyle = {
    transform: [
      {
        translateX: topBackHoverAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -3],
        }),
      },
      {
        translateY: topBackHoverAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -2],
        }),
      },
      { scale: topBackPressAnim },
    ],
  };

  return (
    <SafeAreaView style={visitorRegisterStyles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8FC" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 12}
        style={visitorRegisterStyles.keyboardView}
      >
        <ScrollView
          style={visitorRegisterStyles.mainScrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          contentContainerStyle={visitorRegisterStyles.scrollContainer}
        >
          {!isDesktopRegister && !isSimpleRegister ? (
          <Animated.View style={headerEntranceStyle}>
            <LinearGradient
              colors={["#041E42", "#0A3D91", "#0A3D91"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[visitorRegisterStyles.header, headerResponsiveStyle]}
            >
            <View style={[visitorRegisterStyles.headerButtons, headerButtonsResponsiveStyle]}>
              <Animated.View style={topBackMotionStyle}>
                <TouchableOpacity
                  style={visitorRegisterStyles.backButton}
                  onPress={handleBack}
                  onPressIn={() => animatePress(topBackPressAnim, 0.94)}
                  onPressOut={() => animatePress(topBackPressAnim, 1)}
                  activeOpacity={0.7}
                  {...(Platform.OS === "web" && {
                    onMouseEnter: () => animateHover(topBackHoverAnim, 1),
                    onMouseLeave: () => animateHover(topBackHoverAnim, 0),
                  })}
                  disabled={transitionBusy}
                >
                  <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </Animated.View>
            </View>
            <View style={[visitorRegisterStyles.headerContent, headerContentResponsiveStyle]}>
              <View style={visitorRegisterStyles.headerBadge}>
                <Image
                  source={Logo}
                  style={visitorRegisterStyles.headerBadgeLogo}
                  resizeMode="contain"
                />
                <View style={visitorRegisterStyles.headerBadgeTextWrap}>
                  <Text style={visitorRegisterStyles.headerBadgeEyebrow}>
                    Sapphire Access Portal
                  </Text>
                  <Text style={visitorRegisterStyles.headerBadgeTitle}>
                    SafePass Visitor Registration
                  </Text>
                </View>
              </View>
              <Animated.View style={[visitorRegisterStyles.headerIconContainer, iconFloatStyle]}>
                <LinearGradient
                  colors={["rgba(255,255,255,0.2)", "rgba(255,255,255,0.05)"]}
                  style={[
                    visitorRegisterStyles.headerIconGradient,
                    headerIconGradientResponsiveStyle,
                  ]}
                >
                  <Ionicons name="person-add" size={32} color="#FFFFFF" />
                </LinearGradient>
              </Animated.View>
              <Text style={[visitorRegisterStyles.headerTitle, headerTitleResponsiveStyle]}>
                Create Your Visitor Account
              </Text>
              <Text style={visitorRegisterStyles.headerSubtitle}>Account Registration</Text>
              <Text
                style={[
                  visitorRegisterStyles.headerDescription,
                  headerDescriptionResponsiveStyle,
                ]}
              >
                Register first, then log in to request appointments and view the
                campus map from your visitor dashboard.
              </Text>
              <View style={visitorRegisterStyles.aviationStrip}>
                <View style={visitorRegisterStyles.aviationChip}>
                  <Ionicons name="airplane-outline" size={16} color="#FFFFFF" />
                  <Text style={visitorRegisterStyles.aviationChipText}>
                    Sapphire Aviation
                  </Text>
                </View>
                <View style={visitorRegisterStyles.aviationRoute}>
                  <View style={visitorRegisterStyles.aviationDot} />
                  <View style={visitorRegisterStyles.aviationTrail} />
                  <Ionicons name="airplane" size={16} color="#D6E7FF" />
                </View>
              </View>
            </View>
            </LinearGradient>
          </Animated.View>
          ) : null}

          <Animated.View
            style={[
              visitorRegisterStyles.formShell,
              formShellResponsiveStyle,
              formShellDesktopStyle,
              formEntranceStyle,
            ]}
          >
            <View
              style={[
                visitorRegisterStyles.registerPane,
                isDesktopRegister && visitorRegisterStyles.registerPaneDesktop,
              ]}
            >
            <View
              style={[
                visitorRegisterStyles.registerFormPane,
                isDesktopRegister && visitorRegisterStyles.registerFormPaneDesktop,
              ]}
            >
            {!isDesktopRegister && !isSimpleRegister ? (
              <Animated.View
                style={[
                  visitorRegisterStyles.progressContainer,
                  sectionCardResponsiveStyle,
                  progressFloatStyle,
                ]}
              >
                <View style={visitorRegisterStyles.progressHeader}>
                  <Text style={visitorRegisterStyles.progressTitle}>
                    Registration Progress
                  </Text>
                  <Text style={visitorRegisterStyles.progressPercentage}>
                    {registrationProgressPercentage}%
                  </Text>
                </View>
                <View style={visitorRegisterStyles.progressBarContainer}>
                  <View
                    style={[
                      visitorRegisterStyles.progressBar,
                      { width: `${registrationProgressPercentage}%` },
                    ]}
                  />
                </View>
                <View style={visitorRegisterStyles.progressMetaRow}>
                  <Text style={visitorRegisterStyles.progressMetaText}>
                    {completionCount} of {totalRegistrationFields} required details complete
                  </Text>
                  <Text style={visitorRegisterStyles.progressMetaText}>
                    {registrationProgressPercentage === 100
                      ? "Ready to create"
                      : "Complete all fields"}
                  </Text>
                </View>
                <View style={visitorRegisterStyles.progressChecklist}>
                  {registrationFields.map((field) => {
                    const isComplete = fieldCompletion[field.key];
                    return (
                      <View
                        key={field.key}
                        style={[
                          visitorRegisterStyles.progressChip,
                          isComplete && visitorRegisterStyles.progressChipComplete,
                        ]}
                      >
                        <Ionicons
                          name={isComplete ? "checkmark-circle" : field.icon}
                          size={14}
                          color={isComplete ? "#0A3D91" : "#94A3B8"}
                        />
                        <Text
                          style={[
                            visitorRegisterStyles.progressChipText,
                            isComplete && visitorRegisterStyles.progressChipTextComplete,
                          ]}
                        >
                          {field.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            ) : null}

            <View style={[visitorRegisterStyles.content, contentResponsiveStyle]}>
              {isSimpleRegister && <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to login" onPress={handleBack} style={{ paddingVertical: 8 }}><Text style={{ color: '#0A3D91', fontWeight: '700' }}>Back</Text></TouchableOpacity>
                <Text style={{ color: '#475569', alignSelf: 'center' }}>{completionCount} of {totalRegistrationFields} details complete</Text>
              </View>}
              <View style={[visitorRegisterStyles.sectionHeader, sectionHeaderResponsiveStyle]}>
                <View style={visitorRegisterStyles.sectionTextBlock}>
                  <Text style={visitorRegisterStyles.sectionTitle}>
                    Create Visitor Account
                  </Text>
                  <Text style={visitorRegisterStyles.sectionDescription}>
                    Sign up using only your account details. Appointment details
                    will be filled in later after you log in.
                  </Text>
                </View>
                <View style={visitorRegisterStyles.sectionBadge}>
                  <Ionicons name="person-circle-outline" size={14} color="#0A3D91" />
                  <Text style={visitorRegisterStyles.sectionBadgeText}>
                    Account Details
                  </Text>
                </View>
              </View>

              {isDesktopRegister || isSimpleRegister ? null : renderStepInsights()}

              {GOOGLE_SIGN_IN_ENABLED ? <View style={{ marginTop: 12, marginBottom: 2, padding: isCompactRegister ? 10 : 11, borderWidth: 1, borderColor: "#D8E6F8", borderRadius: 10, backgroundColor: "#F8FBFF" }}>
                <Text style={{ textAlign: "center", color: "#334155", fontSize: 11, fontWeight: "800", marginBottom: 3 }}>
                  FASTER VISITOR SIGN-UP
                </Text>
                <Text style={{ textAlign: "center", color: "#64748B", fontSize: 11, lineHeight: 15, marginBottom: 8 }}>
                  Connect Google to fill your verified name and email. You will still add a username and contact number.
                </Text>
                <View style={{ flexDirection: isCompactRegister ? "column" : "row", gap: 9 }}>
                  <TouchableOpacity
                    style={{ flex: 1, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 7, backgroundColor: "#FFFFFF", opacity: socialSignupBusy && socialSignupBusy !== "google" ? 0.55 : 1 }}
                    onPress={handleGoogleSignup}
                    disabled={Boolean(socialSignupBusy) || isSubmitting}
                  >
                    {socialSignupBusy === "google" ? <ActivityIndicator size="small" color="#DB4437" /> : <Ionicons name="logo-google" size={16} color="#DB4437" />}
                    <Text style={{ color: "#1E293B", fontSize: 12, fontWeight: "800" }}>Google</Text>
                  </TouchableOpacity>
                </View>
                {socialSignup ? (
                  <Text style={{ textAlign: "center", color: "#15803D", fontSize: 11, fontWeight: "700", marginTop: 7 }}>
                    Google will be connected to this visitor account.
                  </Text>
                ) : null}
                {socialSignupNotice ? (
                  <View
                    style={{
                      marginTop: 9,
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: socialSignupNotice.type === "existing" ? "#FCD34D" : "#86EFAC",
                      backgroundColor: socialSignupNotice.type === "existing" ? "#FFFBEB" : "#F0FDF4",
                    }}
                  >
                    <Text
                      style={{
                        color: socialSignupNotice.type === "existing" ? "#92400E" : "#166534",
                        fontSize: 11,
                        lineHeight: 16,
                        fontWeight: "700",
                        textAlign: "center",
                      }}
                    >
                      {socialSignupNotice.message}
                    </Text>
                    {socialSignupNotice.type === "existing" ? (
                      <TouchableOpacity
                        style={{ marginTop: 8, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: "#0A3D91" }}
                        onPress={() => goToVisitorLogin({ initialEmail: socialSignupNotice.email })}
                        disabled={transitionBusy}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>Go to Sign In</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View> : null}

              <View style={visitorRegisterStyles.formNoticeCard}>
                <View style={visitorRegisterStyles.formNoticeIcon}>
                  <Ionicons name="information-circle-outline" size={18} color="#0A3D91" />
                </View>
                <Text style={visitorRegisterStyles.formNoticeText}>
                  Use an email you can open now. We will send your verification code there.
                </Text>
              </View>

              <View style={[visitorRegisterStyles.formGrid, formGridResponsiveStyle]}>
                {Object.entries(fieldConfig).filter(([field]) => !socialSignup || (field !== "password" && field !== "confirmPassword")).map(([field, config]) => {
                  const isPasswordField = field === "password" || field === "confirmPassword";
                  const passwordIsVisible =
                    field === "password" ? showPassword : showConfirmPassword;
                  const togglePasswordVisibility =
                    field === "password" ? setShowPassword : setShowConfirmPassword;
                  const isFocused = focusedField === field;

                  return (
                  <AnimatedFieldCard
                    key={field}
                    style={[
                      visitorRegisterStyles.formCard,
                      formCardResponsiveStyle,
                      formCardDesktopStyle,
                      isFocused && visitorRegisterStyles.formCardFocused,
                      errors[field] && visitorRegisterStyles.formCardError,
                    ]}
                    focused={isFocused}
                  >
                    <View style={visitorRegisterStyles.cardHeader}>
                      <View
                        style={[
                          visitorRegisterStyles.cardIcon,
                          { backgroundColor: "#EEF5FF" },
                        ]}
                      >
                        <Ionicons name={config.icon} size={20} color="#0A3D91" />
                      </View>
                      <Text nativeID={`register-${field}-label`} style={visitorRegisterStyles.cardLabel}>{config.label}</Text>
                      <Text style={visitorRegisterStyles.requiredBadge}>Required</Text>
                    </View>
                    <View
                      style={[
                        visitorRegisterStyles.inputContainer,
                        isFocused && visitorRegisterStyles.inputContainerFocused,
                        errors[field] && visitorRegisterStyles.inputContainerError,
                      ]}
                    >
                      <Ionicons
                        name={`${config.icon}-outline`}
                        size={18}
                        color={errors[field] ? "#EF4444" : "#9CA3AF"}
                      />
                      <TextInput
                        style={visitorRegisterStyles.input}
                        nativeID={`register-${field}`}
                        accessibilityLabel={config.label}
                        autoComplete={{ fullName: 'name', email: 'email', username: 'username', phone: 'tel', password: 'new-password', confirmPassword: 'new-password' }[field]}
                        autoCorrect={false}
                        {...(Platform.OS === 'web' ? { 'aria-labelledby': `register-${field}-label`, 'aria-describedby': errors[field] ? `register-${field}-error` : undefined, 'aria-invalid': Boolean(errors[field]), 'aria-required': true } : {})}
                        placeholder={config.placeholder}
                        placeholderTextColor="#9CA3AF"
                        value={formData[field]}
                        onChangeText={(text) => handleInputChange(field, text)}
                        onFocus={() => setFocusedField(field)}
                        onBlur={() => handleFieldBlur(field)}
                        keyboardType={config.keyboard}
                        autoCapitalize={config.autoCapitalize}
                        secureTextEntry={config.secureTextEntry}
                        maxLength={config.maxLength}
                      />
                      {isPasswordField ? (
                        <TouchableOpacity
                          onPress={() => togglePasswordVisibility((previous) => !previous)}
                          style={visitorRegisterStyles.passwordToggleButton}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={
                            passwordIsVisible ? "Hide password" : "Show password"
                          }
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name={passwordIsVisible ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color="#64748B"
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {errors[field] && (
                      <Text nativeID={`register-${field}-error`} accessibilityLiveRegion="polite" style={visitorRegisterStyles.errorText}>{errors[field]}</Text>
                    )}
                    {field === "password" ? (
                      <View style={visitorRegisterStyles.passwordChecklist}>
                        <View style={visitorRegisterStyles.passwordChecklistRow}>
                          <Ionicons
                            name={passwordChecklist.minLength ? "checkmark-circle" : "ellipse-outline"}
                            size={16}
                            color={passwordChecklist.minLength ? "#16A34A" : "#94A3B8"}
                          />
                          <Text
                            style={[
                              visitorRegisterStyles.passwordChecklistText,
                              passwordChecklist.minLength && visitorRegisterStyles.passwordChecklistTextComplete,
                            ]}
                          >
                            At least 8 characters
                          </Text>
                        </View>
                        <View style={visitorRegisterStyles.passwordChecklistRow}>
                          <Ionicons
                            name={passwordChecklist.uppercase ? "checkmark-circle" : "ellipse-outline"}
                            size={16}
                            color={passwordChecklist.uppercase ? "#16A34A" : "#94A3B8"}
                          />
                          <Text
                            style={[
                              visitorRegisterStyles.passwordChecklistText,
                              passwordChecklist.uppercase && visitorRegisterStyles.passwordChecklistTextComplete,
                            ]}
                          >
                            Has an uppercase letter
                          </Text>
                        </View>
                        <View style={visitorRegisterStyles.passwordChecklistRow}>
                          <Ionicons
                            name={passwordChecklist.lowercase ? "checkmark-circle" : "ellipse-outline"}
                            size={16}
                            color={passwordChecklist.lowercase ? "#16A34A" : "#94A3B8"}
                          />
                          <Text
                            style={[
                              visitorRegisterStyles.passwordChecklistText,
                              passwordChecklist.lowercase && visitorRegisterStyles.passwordChecklistTextComplete,
                            ]}
                          >
                            Has a lowercase letter
                          </Text>
                        </View>
                        <View style={visitorRegisterStyles.passwordChecklistRow}>
                          <Ionicons
                            name={passwordChecklist.number ? "checkmark-circle" : "ellipse-outline"}
                            size={16}
                            color={passwordChecklist.number ? "#16A34A" : "#94A3B8"}
                          />
                          <Text
                            style={[
                              visitorRegisterStyles.passwordChecklistText,
                              passwordChecklist.number && visitorRegisterStyles.passwordChecklistTextComplete,
                            ]}
                          >
                            Has a number
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </AnimatedFieldCard>
                  );
                })}
              </View>

              <View style={[visitorRegisterStyles.actionRow, actionRowResponsiveStyle]}>
                <Animated.View
                  style={[
                    { flex: isCompactRegister ? 0 : 1 },
                    actionButtonResponsiveStyle,
                    getActionMotionStyle(secondaryPressAnim, secondaryHoverAnim),
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      visitorRegisterStyles.secondaryActionButton,
                      transitionBusy && { opacity: 0.7 },
                    ]}
                    onPress={handleBack}
                    onPressIn={() => animatePress(secondaryPressAnim, 0.98)}
                    onPressOut={() => animatePress(secondaryPressAnim, 1)}
                    activeOpacity={0.8}
                    {...(Platform.OS === "web" && {
                      onMouseEnter: () => animateHover(secondaryHoverAnim, 1),
                      onMouseLeave: () => animateHover(secondaryHoverAnim, 0),
                    })}
                    disabled={transitionBusy}
                  >
                    <Ionicons name="arrow-back" size={18} color="#475569" />
                    <Text style={visitorRegisterStyles.secondaryActionText}>
                      Back
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                <Animated.View
                  style={[
                    { flex: isCompactRegister ? 0 : 1.35 },
                    actionButtonResponsiveStyle,
                    getActionMotionStyle(continuePressAnim, continueHoverAnim),
                  ]}
                >
                  <TouchableOpacity
                    style={visitorRegisterStyles.continueButton}
                    onPress={handleSubmit}
                    onPressIn={() => animatePress(continuePressAnim, 0.98)}
                    onPressOut={() => animatePress(continuePressAnim, 1)}
                    activeOpacity={0.8}
                    disabled={isSubmitting}
                    {...(Platform.OS === "web" && {
                      onMouseEnter: () => animateHover(continueHoverAnim, 1),
                      onMouseLeave: () => animateHover(continueHoverAnim, 0),
                    })}
                  >
                    <LinearGradient
                      colors={["#0A3D91", "#0A3D91"]}
                      style={visitorRegisterStyles.gradientButton}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Text style={visitorRegisterStyles.continueButtonText}>
                            Create Account
                          </Text>
                          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>
            </View>

            {isDesktopRegister ? (
              <LinearGradient
                colors={["#EEF5FF", "#D8E8FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={visitorRegisterStyles.registerSidePanel}
              >
                <View style={visitorRegisterStyles.sideBrandRow}>
                  <Image source={Logo} style={visitorRegisterStyles.sideLogo} resizeMode="contain" />
                  <View style={visitorRegisterStyles.sideBrandCopy}>
                    <Text style={visitorRegisterStyles.sideBrandEyebrow}>Sapphire Access Portal</Text>
                    <Text style={visitorRegisterStyles.sideBrandTitle}>SafePass Visitor Registration</Text>
                  </View>
                </View>

                <View style={visitorRegisterStyles.sideHeroCopy}>
                  <Text style={visitorRegisterStyles.sideTitle}>Create your visitor account</Text>
                  <Text style={visitorRegisterStyles.sideSubtitle}>
                    Sign up once, verify your email, then request and track campus visits from your dashboard.
                  </Text>
                </View>

                <View style={visitorRegisterStyles.sideTrustList}>
                  {[
                    ["mail-unread-outline", "Email verification before account access"],
                    ["calendar-outline", "Appointment requests after login"],
                    ["shield-checkmark-outline", "Secure records for campus access"],
                  ].map(([icon, label]) => (
                    <View key={label} style={visitorRegisterStyles.sideTrustItem}>
                      <Ionicons name={icon} size={18} color="#0A3D91" />
                      <Text style={visitorRegisterStyles.sideTrustText}>{label}</Text>
                    </View>
                  ))}
                </View>

                <View style={visitorRegisterStyles.sideMiniCard}>
                  <Text style={visitorRegisterStyles.sideMiniTitle}>What happens next?</Text>
                  <Text style={visitorRegisterStyles.sideMiniText}>
                    Your OTP code is sent to your email after this form. Keep the page open while checking your inbox.
                  </Text>
                </View>
              </LinearGradient>
            ) : null}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DataPrivacyModal
        visible={showDataPrivacy}
        onAccept={handlePrivacyAccept}
        onDecline={handlePrivacyDecline}
        isSubmitting={isSubmitting}
        submissionError={privacySubmissionError}
      />
      <ExistingAccountModal
        visible={Boolean(existingAccountEmail)}
        email={existingAccountEmail}
        isTransitioning={transitionBusy}
        onLogin={() => {
          const email = existingAccountEmail || formData.email;
          setExistingAccountEmail("");
          goToVisitorLogin({
            role: "visitor",
            initialEmail: email,
          });
        }}
        onEditEmail={() => {
          setExistingAccountEmail("");
          setShowDataPrivacy(false);
        }}
      />
      <SuccessModal
        visible={showSuccess}
        account={
          registeredVisitor
            ? {
                username: registeredVisitor.username,
                email: registeredVisitor.email,
              }
            : null
        }
        isVerified={Boolean(registeredVisitor?.isVerified)}
        isVerifying={isVerifyingAccount}
        otpDeliveryMode={registeredVisitor?.otpDeliveryMode || "email"}
        otpValue={registrationOtp}
        otpError={registrationOtpError}
        otpTimerLabel={formatOtpTimer(registrationOtpResendSecondsLeft)}
        canResendOtp={registrationOtpResendSecondsLeft <= 0}
        onOtpChange={(value) => {
          setRegistrationOtp(String(value || "").replace(/\D/g, "").slice(0, 6));
          if (registrationOtpError) {
            setRegistrationOtpError("");
          }
        }}
        onConfirm={handleSuccessConfirm}
        onVerifyOtp={handleVerifyRegistrationOtp}
        onResendOtp={handleResendRegistrationOtp}
        isTransitioning={transitionBusy}
      />
    </SafeAreaView>
  );
}


