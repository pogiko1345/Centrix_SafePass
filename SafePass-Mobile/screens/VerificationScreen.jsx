import Alert from '../utils/Alert';
// VerificationScreen.jsx - COMPLETELY FIXED with proper AsyncStorage
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import ApiService from "../utils/ApiService";
import { getDashboardRoute, normalizeRole } from "../utils/authFlow";
import {
  IS_VISITOR_ONLY_APP,
  getVariantBlockedRoleMessage,
  isRoleAllowedInCurrentVariant,
} from "../utils/appVariant";
import verificationStyles from "../styles/VerificationStyles";
import Logo from "../assets/LogoSapphire.jpg";

const Storage = Platform.OS === "web"
  ? require("../utils/webStorage").default
  : require("@react-native-async-storage/async-storage").default;

// Helper function to safely store data
const storeData = async (key, value) => {
  try {
    if (!Storage || typeof Storage.setItem !== 'function') {
      console.error("Storage is not available");
      // Fallback for web - use localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return true;
      }
      return false;
    }
    await Storage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Error storing ${key}:`, error);
    return false;
  }
};

export default function VerificationScreen({ navigation, route }) {
  // Properly extract params with defaults
  const { email, password, rememberMe, tempToken, user: userData } = route.params || {};
  const { width: viewportWidth } = useWindowDimensions();
  const isDesktopLayout = viewportWidth >= 1100;
  const isTabletLayout = viewportWidth >= 768;
  const isCompactWidth = viewportWidth <= 520;
  const isPhoneWidth = viewportWidth <= 420;
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const otpInputRef = useRef(null);
  
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(true);
  const [otpVerified, setOtpVerified] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpNotice, setOtpNotice] = useState(null);

  const normalizeOtpLocalPhoneInput = (value = "") => {
    const digitsOnly = String(value || "").replace(/[^0-9]/g, "");
    const withoutCountryCode = digitsOnly.startsWith("63")
      ? digitsOnly.slice(2)
      : digitsOnly;
    return withoutCountryCode.replace(/^0+/, "").slice(0, 10);
  };

  const userRole = normalizeRole(userData?.role) || "visitor";

  const getVerificationConfig = (role) => {
    switch (normalizeRole(role)) {
      case "student":
      case "teacher":
        return {
          badge: "Campus ID Verification",
          title: "Verify Campus Account",
          subtitle: "Confirm your identity before opening your student campus dashboard and virtual NFC ID.",
          roleLabel: role === "teacher" ? "Teacher" : "Student",
          icon: "id-card-outline",
          setupTitle: "Confirm your mobile number",
          setupSubtitle: "We will send a one-time code before opening your attendance and campus access tools.",
          message: "A quick verification protects your virtual campus ID and attendance records.",
          securityNote: "Your campus ID access is encrypted and verified securely.",
        };
      case "staff":
        return {
          badge: "Staff Account Verification",
          title: "Verify Staff Account",
          subtitle: "Confirm your identity before opening staff attendance, office presence, and NFC access.",
          roleLabel: "Staff",
          icon: "briefcase-outline",
          setupTitle: "Confirm your mobile number",
          setupSubtitle: "We will send a one-time code before opening your staff dashboard.",
          message: "A quick verification protects staff attendance and office access records.",
          securityNote: "Your staff access is encrypted and verified securely.",
        };
      case "security":
      case "guard":
        return {
          badge: "Security Account Verification",
          title: "Verify Security Account",
          subtitle: "Confirm your identity before opening checkpoint monitoring and access validation.",
          roleLabel: "Security",
          icon: "shield-checkmark-outline",
          setupTitle: "Confirm your mobile number",
          setupSubtitle: "We will send a one-time code before opening security operations.",
          message: "A quick verification protects campus monitoring and checkpoint controls.",
          securityNote: "Your security access is encrypted and verified securely.",
        };
      case "admin":
        return {
          badge: "Admin Account Verification",
          title: "Verify Admin Account",
          subtitle: "Confirm your identity before opening admin controls, reports, and account management.",
          roleLabel: "Admin",
          icon: "settings-outline",
          setupTitle: "Confirm your mobile number",
          setupSubtitle: "We will send a one-time code before opening the admin dashboard.",
          message: "A quick verification protects administrative controls and campus records.",
          securityNote: "Your admin access is encrypted and verified securely.",
        };
      default:
        return {
          badge: "Campus Account Verification",
          title: "Verify Campus Account",
          subtitle: "Confirm your identity before opening the correct SafePass campus dashboard.",
          roleLabel: "Visitor",
          icon: "person-outline",
          setupTitle: "Confirm your mobile number",
          setupSubtitle: "We will send a one-time code before opening your SafePass access.",
          message: "A quick verification protects your SafePass account and campus access.",
          securityNote: "Your SafePass access is encrypted and verified securely.",
        };
    }
  };

  const verificationConfig = getVerificationConfig(userRole);

  // Animations on mount
  useEffect(() => {
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
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!userData?.phone) return;

    let cleanPhone = String(userData.phone).replace(/[^\d]/g, "");
    if (cleanPhone.startsWith("63")) cleanPhone = cleanPhone.slice(2);
    if (cleanPhone.startsWith("0")) cleanPhone = cleanPhone.slice(1);
    setPhoneNumber(cleanPhone.slice(0, 10));
  }, [userData?.phone]);

  // This timer is only the resend cooldown. The SMS OTP itself remains valid
  // until the backend expiry window ends.
  useEffect(() => {
    let interval;
    if (otpSent && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    } else if (otpTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [otpSent, otpTimer]);

  const validatePhoneNumber = () => {
    setPhoneError("");
    if (!phoneNumber.trim()) {
      setPhoneError("Phone number is required");
      return false;
    }
    
    const cleanPhone = normalizeOtpLocalPhoneInput(phoneNumber);
    const philippinePatterns = [
      /^9\d{9}$/,
    ];
    
    const isValid = philippinePatterns.some(pattern => pattern.test(cleanPhone));
    
    if (!isValid) {
      setPhoneError("Enter a valid Philippine mobile number (e.g., 9123456789)");
      return false;
    }
    return true;
  };

  const requestOtp = async () => {
    if (!validatePhoneNumber()) return;
    
    setIsLoading(true);
    try {
      const cleanPhone = `0${normalizeOtpLocalPhoneInput(phoneNumber)}`;
      
      const response = await ApiService.requestOtp(cleanPhone, "sms");
      
      if (response.success) {
        setOtpSent(true);
        setShowPhoneInput(false);
        setOtpTimer(60);
        setCanResend(false);
        setOtpNotice({
          title: "Verification Code Sent",
          message: `A 6-digit OTP was sent to ${cleanPhone}.`,
          detail: "It expires in 5 minutes. If it expires, request a new code.",
        });
      } else {
        Alert.alert("Error", response.message || "Failed to send verification code");
      }
    } catch (error) {
      console.error("OTP request error:", error);
      Alert.alert("Error", "Unable to send verification code. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (text) => {
    setOtpError("");
    const numericValue = text.replace(/[^0-9]/g, '');
    setOtpCode(numericValue);
  };

  const verifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = `0${normalizeOtpLocalPhoneInput(phoneNumber)}`;
      
      const response = await ApiService.verifyOtp(cleanPhone, otpCode, tempToken);
      
      if (response.success) {
        setOtpVerified(true);
        await completeLogin(response);
      } else {
        setOtpError(response.message || "Invalid verification code");
      }
    } catch (error) {
      console.error("OTP verification error:", error);
      setOtpError("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const resendOtp = () => {
    if (canResend) {
      setOtpTimer(60);
      setCanResend(false);
      setOtpCode("");
      setOtpError("");
      setOtpNotice(null);
      requestOtp();
    }
  };

  // FIXED: Complete login with safe storage
  const completeLogin = async (verificationResponse) => {
    try {
      setIsLoading(true);
      
      // Use the user data from the verification response or from route params
      let finalUser = verificationResponse?.user || userData;
      
      if (!finalUser) {
        console.error("No user data available");
        Alert.alert("Error", "Unable to complete login. Please try again.");
        return;
      }
      
      // Reuse the token returned during credential verification to avoid a second login request.
      let sessionToken = verificationResponse?.token || tempToken || null;
      if (!sessionToken && email && password) {
        const loginResponse = await ApiService.login(email, password);
        sessionToken = loginResponse?.token || null;
        if (loginResponse?.user) {
          finalUser = loginResponse.user;
        }
      }
      if (sessionToken) {
        await ApiService.setToken(sessionToken);
      } else if (tempToken) {
        await ApiService.setToken(tempToken);
      }
      
      const userRole = normalizeRole(finalUser.role) || "visitor";

      if (!isRoleAllowedInCurrentVariant(userRole)) {
        await ApiService.clearAuth();
        await Storage.removeItem("currentUser");
        Alert.alert("Visitor App Only", getVariantBlockedRoleMessage(userRole), [
          {
            text: "Back Home",
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [{ name: "RoleSelect" }],
              }),
          },
        ]);
        return;
      }

      // Store user data
      await storeData("currentUser", JSON.stringify({ ...finalUser, role: userRole }));
      await ApiService.rememberCurrentSession();
      
      // Treat remember-me as a trusted device so future logins can follow the faster path.
      if (email) {
        await Storage.removeItem("rememberedEmail");
      }
      if (rememberMe && email) {
        await ApiService.trustDevice();
      } else if (email) {
        await ApiService.clearTrustedDevice();
      }
      
      // Clear new registration flag
      await Storage.removeItem("isNewRegistration");
      
      const dashboardRoute = IS_VISITOR_ONLY_APP ? "VisitorDashboard" : getDashboardRoute(userRole);
      
      // Small delay to ensure storage is complete
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: dashboardRoute }],
        });
      }, 500);
    } catch (error) {
      console.error("Complete login error:", error);
      Alert.alert("Error", "Unable to complete sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleChangeMethod = () => {
    setShowPhoneInput(true);
    setOtpSent(false);
    setOtpCode("");
    setOtpError("");
    setOtpNotice(null);
    setPhoneError("");
    setPhoneNumber("");
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPhoneDisplay = (phone) => {
    if (!phone) return "";
    const clean = phone.replace(/[\s\.\-]/g, '');
    if (clean.length >= 10) {
      return clean.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
    }
    return phone;
  };

  return (
    <SafeAreaView style={verificationStyles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A3D91" />
      
      <KeyboardAvoidingView
        style={verificationStyles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={verificationStyles.scrollView}
          contentContainerStyle={verificationStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[verificationStyles.animatedContainer, { opacity: fadeAnim }]}>
            <View
              style={[
                verificationStyles.pageShell,
                !isDesktopLayout && {
                  flexDirection: "column",
                  maxWidth: 760,
                  width: "100%",
                },
                isPhoneWidth && {
                  paddingHorizontal: 12,
                  paddingVertical: 14,
                },
              ]}
            >
              <LinearGradient
                colors={['#041E42', '#0A3D91', '#1C6DD0']}
                style={[
                  verificationStyles.heroPanel,
                  !isDesktopLayout && {
                    width: "100%",
                    minHeight: undefined,
                  },
                  isCompactWidth && {
                    paddingHorizontal: 16,
                    paddingBottom: 22,
                  },
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <TouchableOpacity
                  style={verificationStyles.backButton}
                  onPress={handleBack}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={verificationStyles.heroBadge}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#EEF5FF" />
                  <Text style={verificationStyles.heroBadgeText}>{verificationConfig.badge}</Text>
                </View>

                <View
                  style={[
                    verificationStyles.headerContent,
                    !isDesktopLayout && { alignItems: "center" },
                    isDesktopLayout && { alignItems: "flex-start" },
                  ]}
                >
                  <View style={verificationStyles.iconContainer}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.08)']}
                      style={verificationStyles.iconGradient}
                    >
                      <Image
                        source={Logo}
                        style={verificationStyles.logoImage}
                        resizeMode="contain"
                      />
                    </LinearGradient>
                  </View>
                  <Text
                    style={[
                      verificationStyles.headerTitle,
                      isPhoneWidth && { fontSize: 24, lineHeight: 30 },
                    ]}
                  >
                    {verificationConfig.title}
                  </Text>
                  <Text
                    style={[
                      verificationStyles.headerSubtitle,
                      !isDesktopLayout && { textAlign: "center", paddingHorizontal: 6 },
                      isDesktopLayout && { textAlign: "left", paddingHorizontal: 0 },
                    ]}
                  >
                    {verificationConfig.subtitle}
                  </Text>
                  <View
                    style={[
                      verificationStyles.flightAccent,
                      !isDesktopLayout && { alignSelf: "center" },
                      isDesktopLayout && { alignSelf: "flex-start" },
                    ]}
                  >
                    <View style={verificationStyles.flightAccentLine} />
                    <Ionicons name="airplane" size={13} color="rgba(255,255,255,0.92)" />
                    <View style={verificationStyles.flightAccentDot} />
                  </View>
                </View>

              </LinearGradient>

              <Animated.View
                style={[
                  verificationStyles.panelCard,
                  !isDesktopLayout && {
                    maxWidth: "100%",
                    width: "100%",
                  },
                  isPhoneWidth && {
                    padding: 16,
                    borderRadius: 28,
                  },
                  {
                    transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
                  },
                ]}
              >
                <View style={verificationStyles.progressRow}>
                  <View style={verificationStyles.progressStep}>
                    <View style={[verificationStyles.progressDot, verificationStyles.progressDotActive]}>
                      <Ionicons name="phone-portrait-outline" size={14} color="#FFFFFF" />
                    </View>
                    <Text style={[verificationStyles.progressLabel, verificationStyles.progressLabelActive]}>
                      Phone
                    </Text>
                  </View>
                  <View style={[verificationStyles.progressLine, otpSent && verificationStyles.progressLineActive]} />
                  <View style={verificationStyles.progressStep}>
                    <View style={[verificationStyles.progressDot, otpSent && verificationStyles.progressDotActive]}>
                      <Ionicons name="key-outline" size={14} color={otpSent ? "#FFFFFF" : "#94A3B8"} />
                    </View>
                    <Text style={[verificationStyles.progressLabel, otpSent && verificationStyles.progressLabelActive]}>
                      Code
                    </Text>
                  </View>
                  <View style={[verificationStyles.progressLine, otpVerified && verificationStyles.progressLineActive]} />
                  <View style={verificationStyles.progressStep}>
                    <View style={[verificationStyles.progressDot, otpVerified && verificationStyles.progressDotActive]}>
                      <Ionicons name="checkmark-outline" size={14} color={otpVerified ? "#FFFFFF" : "#94A3B8"} />
                    </View>
                    <Text style={[verificationStyles.progressLabel, otpVerified && verificationStyles.progressLabelActive]}>
                      Access
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    verificationStyles.panelMetaRow,
                    isCompactWidth && { flexDirection: "column", flexWrap: "nowrap" },
                  ]}
                >
                  <View
                    style={[
                      verificationStyles.panelMetaCard,
                      isCompactWidth && { width: "100%" },
                    ]}
                  >
                    <Text style={verificationStyles.panelMetaLabel}>Account</Text>
                    <Text style={verificationStyles.panelMetaValue}>{email || "User"}</Text>
                  </View>
                  <View
                    style={[
                      verificationStyles.panelMetaCard,
                      isCompactWidth && { width: "100%" },
                    ]}
                  >
                    <Text style={verificationStyles.panelMetaLabel}>Role</Text>
                    <Text style={verificationStyles.panelMetaValue}>{verificationConfig.roleLabel}</Text>
                  </View>
                  <View
                    style={[
                      verificationStyles.panelMetaCard,
                      isCompactWidth && { width: "100%" },
                    ]}
                  >
                    <Text style={verificationStyles.panelMetaLabel}>Method</Text>
                    <Text style={verificationStyles.panelMetaValue}>
                      {otpSent ? "Text Message" : "Phone Verification"}
                    </Text>
                  </View>
                </View>

                {!otpVerified && (
                  <>
                    <View style={verificationStyles.userInfoCard}>
                      <View style={verificationStyles.avatarContainer}>
                        <LinearGradient
                          colors={['#EEF5FF', '#D8E8FF']}
                          style={verificationStyles.avatarGradient}
                        >
                          <Ionicons name={verificationConfig.icon} size={28} color="#0A3D91" />
                        </LinearGradient>
                      </View>
                      <View style={verificationStyles.userInfoCopy}>
                        <Text style={verificationStyles.userEmail}>{email || "User"}</Text>
                        <Text style={verificationStyles.userMessage}>
                          {verificationConfig.message}
                        </Text>
                      </View>
                    </View>

                    {showPhoneInput ? (
                      <View style={verificationStyles.card}>
                        <View style={verificationStyles.panelHeader}>
                          <Text style={verificationStyles.sectionTitle}>{verificationConfig.setupTitle}</Text>
                          <Text style={verificationStyles.sectionSubtitle}>
                            {verificationConfig.setupSubtitle}
                          </Text>
                        </View>

                        <View style={verificationStyles.inputGroup}>
                          <Text style={verificationStyles.label}>Mobile Number</Text>
                          <View style={[
                            verificationStyles.inputContainer,
                            phoneError && verificationStyles.inputError
                          ]}>
                            <View style={verificationStyles.countryCode}>
                              <Text style={verificationStyles.countryCodeText}>+63</Text>
                            </View>
                            <TextInput
                              style={verificationStyles.input}
                              placeholder="912 345 6789"
                              accessibilityLabel="Mobile number without country code"
                              autoComplete="tel-national"
                              placeholderTextColor="#9CA3AF"
                              value={phoneNumber}
                              onChangeText={(text) => {
                                const cleaned = normalizeOtpLocalPhoneInput(text);
                                setPhoneNumber(cleaned);
                                setPhoneError("");
                              }}
                              keyboardType="phone-pad"
                              maxLength={10}
                              editable={!isLoading}
                            />
                          </View>
                          {phoneError ? (
                            <Text style={verificationStyles.errorText}>{phoneError}</Text>
                          ) : (
                            <Text style={verificationStyles.helperText}>
                              Enter your mobile number without the first 0. If you type 0, we will remove it for you.
                            </Text>
                          )}
                        </View>

                        <TouchableOpacity
                          style={[
                            verificationStyles.sendButton,
                            isLoading && verificationStyles.buttonDisabled
                          ]}
                          onPress={requestOtp}
                          disabled={isLoading}
                          activeOpacity={0.8}
                        >
                          {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons name="send-outline" size={20} color="#FFFFFF" />
                              <Text style={verificationStyles.sendButtonText}>Send Verification Code</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={verificationStyles.otpCard}>
                        <View style={verificationStyles.otpHeader}>
                          <LinearGradient
                            colors={['#EEF5FF', '#D8E8FF']}
                            style={verificationStyles.otpIconContainer}
                          >
                            <Ionicons name="key-outline" size={22} color="#0A3D91" />
                          </LinearGradient>
                          <Text style={verificationStyles.otpTitle}>Enter Verification Code</Text>
                          <Text style={verificationStyles.otpSubtitle}>
                            We sent a 6-digit verification code to
                          </Text>
                          <Text style={verificationStyles.phoneNumberDisplay}>
                            {formatPhoneDisplay(phoneNumber)}
                          </Text>
                        </View>

                        {otpNotice ? (
                          <View style={verificationStyles.otpNoticeCard}>
                            <View style={verificationStyles.otpNoticeIcon}>
                              <Ionicons name="checkmark-circle" size={22} color="#047857" />
                            </View>
                            <View style={verificationStyles.otpNoticeCopy}>
                              <Text style={verificationStyles.otpNoticeTitle}>{otpNotice.title}</Text>
                              <Text style={verificationStyles.otpNoticeMessage}>{otpNotice.message}</Text>
                              <Text style={verificationStyles.otpNoticeDetail}>{otpNotice.detail}</Text>
                            </View>
                            <TouchableOpacity
                              style={verificationStyles.otpNoticeDismiss}
                              onPress={() => setOtpNotice(null)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="close" size={16} color="#047857" />
                            </TouchableOpacity>
                          </View>
                        ) : null}

                        <View style={verificationStyles.otpInputContainer}>
                          <TouchableOpacity
                            style={[
                              verificationStyles.otpCodeEntry,
                              otpError && verificationStyles.otpInputError,
                              isCompactWidth && verificationStyles.otpCodeEntryCompact,
                            ]}
                            activeOpacity={0.9}
                            onPress={() => otpInputRef.current?.focus()}
                            disabled={isLoading}
                          >
                            {Array.from({ length: 6 }).map((_, index) => {
                              const digit = otpCode[index] || "";
                              const isActive = otpCode.length === index && !isLoading;

                              return (
                                <View
                                  key={`otp-digit-${index}`}
                                  style={[
                                    verificationStyles.otpDigitBox,
                                    digit && verificationStyles.otpDigitBoxFilled,
                                    isActive && verificationStyles.otpDigitBoxActive,
                                    isCompactWidth && verificationStyles.otpDigitBoxCompact,
                                  ]}
                                >
                                  <Text style={verificationStyles.otpDigitText}>
                                    {digit || " "}
                                  </Text>
                                </View>
                              );
                            })}
                            <TextInput
                              ref={otpInputRef}
                              accessibilityLabel="Six-digit verification code"
                              style={verificationStyles.otpHiddenInput}
                              value={otpCode}
                              onChangeText={handleOtpChange}
                              keyboardType="numeric"
                              maxLength={6}
                              autoFocus={true}
                              editable={!isLoading}
                              textContentType="oneTimeCode"
                              autoComplete="one-time-code"
                            />
                          </TouchableOpacity>
                          {otpError && (
                            <Text style={verificationStyles.otpErrorText}>{otpError}</Text>
                          )}
                        </View>

                        <View style={verificationStyles.timerContainer}>
                          <Ionicons name="time-outline" size={16} color={canResend ? "#0A3D91" : "#6B7280"} />
                          <Text style={[
                            verificationStyles.timerText,
                            canResend && verificationStyles.timerExpired
                          ]}>
                            {canResend ? 'You can resend the code now' : `Resend code in ${formatTimer(otpTimer)}`}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={[
                            verificationStyles.verifyButton,
                            (isLoading || otpCode.length !== 6) && verificationStyles.buttonDisabled
                          ]}
                          onPress={verifyOtp}
                          disabled={isLoading || otpCode.length !== 6}
                          activeOpacity={0.8}
                        >
                          <LinearGradient
                            colors={['#041E42', '#0A3D91', '#1C6DD0']}
                            style={verificationStyles.verifyGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                          >
                            {isLoading ? (
                              <ActivityIndicator color="#FFFFFF" />
                            ) : (
                              <Text style={verificationStyles.verifyButtonText}>Verify & Continue</Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            verificationStyles.resendButton,
                            (!canResend || isLoading) && verificationStyles.buttonDisabled
                          ]}
                          onPress={resendOtp}
                          disabled={!canResend || isLoading}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="refresh-outline" size={18} color={canResend ? "#0A3D91" : "#9CA3AF"} />
                          <Text style={[
                            verificationStyles.resendButtonText,
                            canResend && verificationStyles.resendButtonTextActive
                          ]}>Resend Code</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={verificationStyles.changeMethodButton}
                          onPress={handleChangeMethod}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="arrow-back-outline" size={14} color="#6B7280" />
                          <Text style={verificationStyles.changeMethodText}>
                            Use a different phone number
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                <View style={verificationStyles.securityNote}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#64748B" />
                  <Text style={verificationStyles.securityNoteText}>
                    {verificationConfig.securityNote}
                  </Text>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
