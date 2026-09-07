import Alert from '../utils/Alert';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  StatusBar,
  Animated,
  Switch,
  Share,
  Image,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import useGoogleSignIn from "../utils/useGoogleSignIn";
import ApiService from "../utils/ApiService";
import {
  PHILIPPINE_MOBILE_NUMBER_MESSAGE,
  isValidPhilippineMobileNumber,
  normalizePhilippineMobileNumber,
} from "../utils/phoneValidation";

const SCHOOL_LOGO = require("../assets/LogoSapphire.jpg");

const Storage =
  Platform.OS === "web" ? require("../utils/webStorage").default : AsyncStorage;
const setBiometricCredential = async (key, value) => {
  if (Platform.OS === "web") return Storage.setItem(key, value);
  await SecureStore.setItemAsync(key, value);
  await Storage.removeItem(key);
};
const removeBiometricCredential = async (key) => {
  if (Platform.OS === "web") return Storage.removeItem(key);
  await SecureStore.deleteItemAsync(key);
  await Storage.removeItem(key);
};

const DEFAULT_PROFILE = {
  _id: "",
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  phone: "",
  role: "visitor",
  employeeId: "",
  emergencyContact: "",
  department: "",
  position: "",
  shift: "",
  nfcCardId: "",
  studentId: "",
  teacherId: "",
  course: "",
  yearLevel: "",
  section: "",
  profilePhoto: null,
};

const LANGUAGES = ["English", "Filipino / Tagalog"];
const BIOMETRIC_LOGIN_EMAIL_KEY = "biometricLoginEmail";
const BIOMETRIC_LOGIN_PASSWORD_KEY = "biometricLoginPassword";

export default function ProfileScreenV2({ navigation, onLogout }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [profile, setProfile] = useState(null);
  const [editedProfile, setEditedProfile] = useState(null);
  const [tab, setTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [error, setError] = useState(null);
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [visiblePasswordFields, setVisiblePasswordFields] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [socialLinkBusy, setSocialLinkBusy] = useState("");
  const { googleClientId, googleRequest, promptGoogleSignIn: promptGoogleLink } = useGoogleSignIn();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: Platform.OS !== "web",
    }).start();
    loadPreferences();
    loadProfile();
    requestPermissions();
    checkBiometricAvailability();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.("focus", loadPreferences);
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (profile) savePreferences();
  }, [
    notificationsEnabled,
    biometricEnabled,
    darkModeEnabled,
    selectedLanguage,
    profile,
  ]);

  const roleConfig = useMemo(() => {
    const role = String(profile?.role || "visitor").toLowerCase();
    const map = {
      admin: {
        label: "Administrator",
        icon: "settings-outline",
        gradients: ["#1C6DD0", "#0A3D91"],
      },
      security: {
        label: "Security Team",
        icon: "shield-checkmark-outline",
        gradients: ["#DC2626", "#F97316"],
        webGradients: ["#06162E", "#0A3D91", "#123C7C"],
        tone: "security",
      },
      guard: {
        label: "Security Team",
        icon: "shield-checkmark-outline",
        gradients: ["#DC2626", "#F97316"],
        webGradients: ["#06162E", "#0A3D91", "#123C7C"],
        tone: "security",
      },
      staff: {
        label: "Staff Member",
        icon: "briefcase-outline",
        gradients: ["#0A3D91", "#1C6DD0"],
      },
      teacher: {
        label: "Academic Staff",
        icon: "school-outline",
        gradients: ["#0A3D91", "#1C6DD0"],
      },
      student: {
        label: "Student Access",
        icon: "school-outline",
        gradients: ["#0A3D91", "#1C6DD0"],
      },
      visitor: {
        label: "Visitor Account",
        icon: "person-outline",
        gradients: ["#041E42", "#1C6DD0"],
      },
    };
    return map[role] || map.visitor;
  }, [profile]);

  const currentProfile = editMode ? editedProfile : profile;
  const isDarkProfile = darkModeEnabled;
  const isSecurityProfile = roleConfig.tone === "security";
  const heroUsesDarkHeader = isDarkProfile || !isDesktop || isSecurityProfile;
  const themedCardStyle = [styles.card, isDarkProfile && styles.darkCard];
  const themedTitleStyle = [styles.cardTitle, isDarkProfile && styles.darkText];
  const themedMutedStyle = [styles.muted, isDarkProfile && styles.darkMuted];
  const infoRows = [
    ["First Name", "firstName", true],
    ["Last Name", "lastName", true],
    ["Username", "username", true],
    ["Email", "email", true],
    ["Phone", "phone", true],
    ["Emergency Contact", "emergencyContact", true],
    ["Department", "department", false],
    ["Position", "position", false],
    ["Shift", "shift", false],
  ];

  const loadPreferences = async () => {
    try {
      const [notifications, biometric, darkMode, language] = await Promise.all([
        Storage.getItem("notificationsEnabled"),
        Storage.getItem("biometricEnabled"),
        Storage.getItem("darkModeEnabled").then(async (value) =>
          value !== null ? value : Storage.getItem("isDarkMode"),
        ),
        Storage.getItem("selectedLanguage"),
      ]);
      if (notifications !== null)
        setNotificationsEnabled(notifications === "true");
      if (biometric !== null) setBiometricEnabled(biometric === "true");
      if (darkMode !== null) setDarkModeEnabled(darkMode === "true");
      if (language) setSelectedLanguage(language);
    } catch (e) {
      console.error("Load preferences error:", e);
    }
  };

  const savePreferences = async () => {
    try {
      await Promise.all([
        Storage.setItem("notificationsEnabled", String(notificationsEnabled)),
        Storage.setItem("biometricEnabled", String(biometricEnabled)),
        Storage.setItem("darkModeEnabled", String(darkModeEnabled)),
        Storage.setItem("isDarkMode", JSON.stringify(darkModeEnabled)),
        Storage.setItem("selectedLanguage", selectedLanguage),
      ]);
    } catch (e) {
      console.error("Save preferences error:", e);
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS !== "web") {
      try {
        await ImagePicker.requestCameraPermissionsAsync();
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch (e) {
        console.error("Permission request error:", e);
      }
    }
  };

  const checkBiometricAvailability = async () => {
    if (Platform.OS === "web") {
      setIsBiometricAvailable(false);
      return setBiometricEnabled(false);
    }
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const available = Boolean(hasHardware && enrolled);
      setIsBiometricAvailable(available);
      if (!available) setBiometricEnabled(false);
    } catch (e) {
      setIsBiometricAvailable(false);
      setBiometricEnabled(false);
    }
  };

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    setUsingCache(false);
    try {
      const currentUser = await ApiService.getCurrentUser();
      if (!currentUser) return navigation.replace("Login");
      const merged = { ...DEFAULT_PROFILE, ...currentUser };
      setProfile(merged);
      setEditedProfile(merged);
      try {
        const response = await ApiService.getProfile();
        if (response?.user) {
          const fullProfile = {
            ...DEFAULT_PROFILE,
            ...merged,
            ...response.user,
          };
          setProfile(fullProfile);
          setEditedProfile(fullProfile);
        } else {
          setUsingCache(true);
        }
      } catch {
        setUsingCache(true);
      }
    } catch (e) {
      setError(e.message || "Unable to load profile");
      try {
        const storedUser = await Storage.getItem("currentUser");
        if (storedUser) {
          const fallback = { ...DEFAULT_PROFILE, ...JSON.parse(storedUser) };
          setProfile(fallback);
          setEditedProfile(fallback);
          setUsingCache(true);
          setError(null);
        }
      } catch (storageError) {
        console.error("Storage fallback error:", storageError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const choosePhoto = async (source) => {
    setIsUploadingPhoto(true);
    try {
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
        setEditedProfile((prev) => ({
          ...prev,
          profilePhoto: result.assets[0].uri,
        }));
      }
    } catch (e) {
      Alert.alert("Error", "Failed to update profile photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoPress = () => {
    if (!editMode || isUploadingPhoto) return;
    if (Platform.OS === "web") return choosePhoto("gallery");
    Alert.alert("Update Photo", "Choose how you want to update your photo.", [
      { text: "Cancel", style: "cancel" },
      { text: "Take Photo", onPress: () => choosePhoto("camera") },
      { text: "Choose from Gallery", onPress: () => choosePhoto("gallery") },
    ]);
  };
  const handleSave = async () => {
    if (!editedProfile) return;
    const firstName = String(editedProfile.firstName || "").trim();
    const lastName = String(editedProfile.lastName || "").trim();
    const email = String(editedProfile.email || "").trim().toLowerCase();
    const username = String(editedProfile.username || "").trim().toLowerCase();
    const phone = String(editedProfile.phone || "").trim();

    if (!firstName || !lastName) {
      Alert.alert("Missing Name", "Please enter your first and last name.");
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!username) {
      Alert.alert("Missing Username", "Please enter your username.");
      return;
    }

    if (phone && !isValidPhilippineMobileNumber(phone)) {
      Alert.alert("Invalid Contact Number", PHILIPPINE_MOBILE_NUMBER_MESSAGE);
      return;
    }

    setIsSaving(true);
    try {
      const updates = {
        firstName,
        lastName,
        email,
        phone: phone ? normalizePhilippineMobileNumber(phone) : "",
        emergencyContact: String(editedProfile.emergencyContact || "").trim(),
        profilePhoto: editedProfile.profilePhoto || null,
        username,
      };

      const response = await ApiService.updateProfile(updates);
      if (!response?.user)
        throw new Error("No updated profile returned from server");
      const updated = {
        ...DEFAULT_PROFILE,
        ...profile,
        ...response.user,
        profilePhoto:
          editedProfile.profilePhoto || response.user.profilePhoto || null,
      };
      setProfile(updated);
      setEditedProfile(updated);
      setEditMode(false);
      setShowSavedBanner(true);
      setTimeout(() => setShowSavedBanner(false), 2200);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const updatePasswordField = (field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const handleChangePassword = async () => {
    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Missing Information", "Please complete all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Password Too Short", "New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Password Mismatch", "New password and confirmation do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await ApiService.changePassword({
        currentPassword,
        newPassword,
      });

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      if (biometricEnabled && currentProfile?.email) {
        await setBiometricCredential(BIOMETRIC_LOGIN_EMAIL_KEY, currentProfile.email);
        await setBiometricCredential(BIOMETRIC_LOGIN_PASSWORD_KEY, newPassword);
      }
      Alert.alert("Password Updated", response?.message || "Your password was changed successfully.");
    } catch (e) {
      Alert.alert("Unable To Change Password", e.message || "Please check your current password and try again.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const renderPasswordInput = (field, placeholder) => (
    <View style={[styles.passwordInputWrap, isDarkProfile && styles.darkInputWrap]}>
      <TextInput
        style={[styles.passwordInput, isDarkProfile && styles.darkInput]}
        value={passwordForm[field]}
        onChangeText={(text) => updatePasswordField(field, text)}
        secureTextEntry={!visiblePasswordFields[field]}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={isDarkProfile ? "#94A3B8" : "#94A3B8"}
      />
      <TouchableOpacity
        style={styles.passwordEyeButton}
        onPress={() =>
          setVisiblePasswordFields((current) => ({
            ...current,
            [field]: !current[field],
          }))
        }
        activeOpacity={0.8}
      >
        <Ionicons
          name={visiblePasswordFields[field] ? "eye-off-outline" : "eye-outline"}
          size={19}
          color={isDarkProfile ? "#CBD5E1" : "#64748B"}
        />
      </TouchableOpacity>
    </View>
  );

  const shareProfile = async () => {
    if (!profile) return;
    const message = `SafePass Profile\n\nName: ${profile.firstName} ${profile.lastName}\nRole: ${roleConfig.label}\nEmail: ${profile.email}\nPhone: ${profile.phone || "Not set"}`;

    try {
      if (Platform.OS === "web") {
        if (typeof globalThis?.navigator?.share === "function") {
          await globalThis.navigator.share({
            title: "SafePass Profile",
            text: message,
          });
          return;
        }

        const clipboard = globalThis?.navigator?.clipboard;
        if (clipboard?.writeText) {
          await clipboard.writeText(message);
          Alert.alert("Profile Copied", "Your profile summary was copied.");
          return;
        }
      }

      await Share.share({ title: "SafePass Profile", message });
    } catch (e) {
      console.error("Share error:", e);
      Alert.alert("Unable To Share", "Please try again.");
    }
  };

  const toggleBiometric = async (value) => {
    if (Platform.OS === "web") {
      setBiometricEnabled(false);
      Alert.alert("Unavailable On Web", "Biometric login is available in the mobile app.");
      return;
    }
    if (!value) {
      await removeBiometricCredential(BIOMETRIC_LOGIN_EMAIL_KEY);
      await removeBiometricCredential(BIOMETRIC_LOGIN_PASSWORD_KEY);
      await Storage.removeItem("biometricUserEmail");
      return setBiometricEnabled(false);
    }
    if (!isBiometricAvailable) {
      setBiometricEnabled(false);
      Alert.alert(
        "Biometrics Unavailable",
        "Set up Face ID, fingerprint, or device biometrics first.",
      );
      return;
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to enable biometric login",
        fallbackLabel: "Use passcode",
      });
      if (result.success) {
        await setBiometricCredential(BIOMETRIC_LOGIN_EMAIL_KEY, currentProfile?.email || "");
        await Storage.setItem("biometricUserEmail", currentProfile?.email || "");
        setBiometricEnabled(true);
        Alert.alert(
          "Biometric Login Enabled",
          "After your next successful password login, SafePass will let you sign in using your phone biometrics.",
        );
      }
      else {
        setBiometricEnabled(false);
        Alert.alert(
          "Authentication Failed",
          "We could not verify your identity.",
        );
      }
    } catch {
      setBiometricEnabled(false);
    }
  };

  const showLanguagePicker = () => {
    if (Platform.OS === "web") {
      const nextLanguage = globalThis?.window?.prompt?.(
        `Choose language: ${LANGUAGES.join(" or ")}`,
        selectedLanguage,
      );
      if (!nextLanguage) return;
      const match = LANGUAGES.find(
        (language) => language.toLowerCase() === nextLanguage.trim().toLowerCase(),
      );
      if (match) {
        setSelectedLanguage(match);
      } else {
        Alert.alert("Language Not Available", "Please choose English or Filipino / Tagalog.");
      }
      return;
    }

    Alert.alert("Select Language", "Choose your preferred language", [
      ...LANGUAGES.map((language) => ({
        text: language,
        onPress: () => setSelectedLanguage(language),
      })),
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const performLogout = async () => {
    setShowLogoutModal(false);
    setIsLoggingOut(true);
    try {
      await ApiService.logout();
      if (onLogout) onLogout();
      navigation.replace("RoleSelect");
    } catch {
      if (onLogout) onLogout();
      navigation.replace("RoleSelect");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getInitials = () =>
    `${currentProfile?.firstName?.charAt(0) || ""}${currentProfile?.lastName?.charAt(0) || ""}`
      .trim()
      .toUpperCase() || "SP";
  const profileRole = String(currentProfile?.role || "").toLowerCase();
  const primaryAccountId =
    profileRole === "student"
      ? currentProfile?.studentId
      : profileRole === "teacher"
        ? currentProfile?.teacherId
        : currentProfile?.employeeId;
  const identityLine =
    primaryAccountId ||
    currentProfile?.safePassId ||
    currentProfile?.physicalNfcUid ||
    currentProfile?.nfcCardId ||
    currentProfile?._id ||
    "SafePass Account";
  const profileSafePassId =
    currentProfile?.safePassId ||
    (/^(SAFEPASS-|PENDING-|20\d{2}-)/i.test(String(currentProfile?.nfcCardId || ""))
      ? currentProfile?.nfcCardId
      : "");
  const profilePhysicalNfcUid =
    currentProfile?.physicalNfcUid ||
    (!/^(SAFEPASS-|PENDING-|20\d{2}-)/i.test(String(currentProfile?.nfcCardId || ""))
      ? currentProfile?.nfcCardId
      : "");

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="light-content" backgroundColor="#041E42" />
        <Image
          source={SCHOOL_LOGO}
          resizeMode="contain"
          style={{ width: 116, height: 58, marginBottom: 18 }}
        />
        <ActivityIndicator size="large" color="#041E42" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </SafeAreaView>
    );
  }

  if (error && !profile) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="light-content" backgroundColor="#041E42" />
        <Ionicons name="alert-circle-outline" size={56} color="#DC2626" />
        <Text style={styles.errorTitle}>Unable to load profile</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadProfile}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!currentProfile) return null;

  const profileTabs = [
    ["overview", "Overview", "grid-outline"],
    ["account", "Details", "person-circle-outline"],
    ["access", "Card", "shield-checkmark-outline"],
    ["security", "Password", "key-outline"],
    ["preferences", "Settings", "options-outline"],
  ];
  const mobileSectionTabs = profileTabs.filter(([id]) => id !== "overview");

  const renderProfileTabs = () =>
    isDesktop ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {profileTabs.map(([id, label, icon]) => {
          const active = tab === id;
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.tabBtn,
                isDarkProfile && styles.darkTabBtn,
                active && styles.tabBtnActive,
              ]}
              onPress={() => setTab(id)}
            >
              <Ionicons
                name={icon}
                size={16}
                color={active ? "#FFFFFF" : isDarkProfile ? "#CBD5E1" : "#64748B"}
              />
              <Text
                style={[
                  styles.tabText,
                  isDarkProfile && styles.darkMuted,
                  active && styles.tabTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    ) : null;

  const renderMobileProfileMenu = () => (
    <View style={[styles.mobileMenuCard, isDarkProfile && styles.darkCard]}>
      {mobileSectionTabs.map(([id, label, icon], index) => (
        <TouchableOpacity
          key={id}
          style={[
            styles.mobileMenuRow,
            isDarkProfile && styles.darkPrefRow,
            index === mobileSectionTabs.length - 1 && styles.mobileMenuRowLast,
          ]}
          onPress={() => setTab(id)}
          activeOpacity={0.86}
        >
          <View style={styles.mobileMenuIcon}>
            <Ionicons name={icon} size={17} color="#0A3D91" />
          </View>
          <Text style={[styles.mobileMenuText, isDarkProfile && styles.darkText]}>
            {label}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={isDarkProfile ? "#CBD5E1" : "#64748B"}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderMobileSectionHeader = () => {
    const active = profileTabs.find(([id]) => id === tab);
    if (!active) return null;
    return (
      <TouchableOpacity
        style={[styles.mobileSectionHeader, isDarkProfile && styles.darkCard]}
        onPress={() => setTab("overview")}
        activeOpacity={0.86}
      >
        <Ionicons name="chevron-back" size={18} color={isDarkProfile ? "#F8FAFC" : "#0A3D91"} />
        <Text style={[styles.mobileSectionHeaderText, isDarkProfile && styles.darkText]}>
          {active[1]}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderOverview = () => (
    <View style={styles.stack}>
      <View style={[styles.grid, isDesktop && styles.gridDesktop, !isDesktop && styles.mobileMetricGrid]}>
        {[
          { l: "Profile Status", v: "Complete", h: "Ready for campus access" },
          {
            l: "Contact",
            v: currentProfile.phone || "Missing",
            h: "Primary mobile number",
          },
          {
            l: "Access Card",
            v: currentProfile.nfcCardId ? "Issued" : "Pending",
            h: "NFC credential status",
          },
        ].map((item) => (
          <View key={item.l} style={[styles.metricCard, !isDesktop && styles.mobileMetricCard, isDarkProfile && styles.darkCard]}>
            <Text style={[styles.kicker, !isDesktop && styles.mobileMetricKicker, isDarkProfile && styles.darkKicker]}>
              {item.l}
            </Text>
            <Text style={[styles.metricValue, !isDesktop && styles.mobileMetricValue, isDarkProfile && styles.darkText]}>
              {item.v}
            </Text>
            {isDesktop ? (
              <Text style={[styles.muted, isDarkProfile && styles.darkMuted]}>{item.h}</Text>
            ) : null}
          </View>
        ))}
      </View>
      {isDesktop ? (
        <View style={themedCardStyle}>
          <Text style={themedTitleStyle}>Account Summary</Text>
          <Text style={themedMutedStyle}>
            Keep your contact details, campus credential, and sign-in settings updated in one place.
          </Text>
        </View>
      ) : (
        renderMobileProfileMenu()
      )}
    </View>
  );

  const renderAccount = () => (
    <View style={themedCardStyle}>
      {infoRows.map(([label, key, editable]) => (
        <View key={key} style={styles.field}>
          <Text style={[styles.kicker, isDarkProfile && styles.darkKicker]}>{label}</Text>
          {editMode && editable ? (
            <TextInput
              style={[styles.input, isDarkProfile && styles.darkInputWrap, isDarkProfile && styles.darkInput]}
              value={editedProfile?.[key] || ""}
              onChangeText={(text) =>
                setEditedProfile((prev) => ({ ...prev, [key]: text }))
              }
              autoCapitalize={key === "email" || key === "username" ? "none" : "words"}
              autoCorrect={false}
              keyboardType={
                key === "phone"
                  ? "phone-pad"
                  : key === "email"
                    ? "email-address"
                    : "default"
              }
              placeholder={key === "phone" ? "09123456789" : `Enter ${label.toLowerCase()}`}
              placeholderTextColor="#94A3B8"
              maxLength={key === "phone" ? 16 : undefined}
            />
          ) : (
            <Text style={[styles.fieldValue, isDarkProfile && styles.darkText]}>
              {currentProfile?.[key] || "Not set"}
            </Text>
          )}
        </View>
      ))}
    </View>
  );

  const renderAccess = () => (
    <View style={styles.stack}>
      <LinearGradient colors={["#0F172A", "#1E293B"]} style={styles.accessCard}>
        <Text style={styles.accessLabel}>Access Credential</Text>
        <Text style={styles.accessValue}>
          {profileSafePassId || primaryAccountId || "SafePass account"}
        </Text>
        <Text style={styles.accessHint}>
          This is your account reference. Physical NFC cards are listed separately when assigned.
        </Text>
      </LinearGradient>
      <View style={themedCardStyle}>
        {[
          ["Role", roleConfig.label],
          [
            profileRole === "student"
              ? "Student ID"
              : profileRole === "teacher"
                ? "Teacher ID"
                : "Employee ID",
            primaryAccountId || "Not assigned",
          ],
          ...(profileRole === "student" || profileRole === "teacher"
            ? [
                ["Program / Course", currentProfile.course || "Not assigned"],
                [
                  profileRole === "student" ? "Year / Section" : "Academic Group",
                  [currentProfile.yearLevel, currentProfile.section].filter(Boolean).join(" / ") || "Not assigned",
                ],
              ]
            : [
                ["Department", currentProfile.department || "Not assigned"],
                ["Position", currentProfile.position || "Not assigned"],
              ]),
          ["SafePass ID", profileSafePassId || "Not issued"],
          ["Physical NFC UID", profilePhysicalNfcUid || "Not assigned"],
          ["Account Status", currentProfile.status || (currentProfile.isActive === false ? "Inactive" : "Active")],
        ].map(([label, value]) => (
          <View key={label} style={styles.field}>
            <Text style={[styles.kicker, isDarkProfile && styles.darkKicker]}>{label}</Text>
            <Text style={[styles.fieldValue, isDarkProfile && styles.darkText]}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const handleGoogleLink = async () => {
    if (!googleClientId || !googleRequest) {
      Alert.alert("Connection not ready", "Google is still loading. Please try again.");
      return;
    }
    try {
      setSocialLinkBusy("google");
      const result = await promptGoogleLink();
      if (result.type !== "success") return;
      const token = result.params?.id_token || result.authentication?.idToken;
      if (!token) throw new Error("The provider did not return an account token.");
      const proof = await ApiService.getSocialSignupProfile("google", token, "account_link");
      const response = await ApiService.linkSocialAccount(proof.signupToken);
      if (!response?.success || !response?.user) throw new Error(response?.message || "Unable to connect this account.");
      const updated = { ...DEFAULT_PROFILE, ...profile, ...response.user };
      setProfile(updated);
      setEditedProfile(updated);
      Alert.alert("Account connected", response.message || "You can now use this provider to sign in.");
    } catch (error) {
      Alert.alert("Unable to connect account", error?.message || "Please try again.");
    } finally {
      setSocialLinkBusy("");
    }
  };

  const renderSecurity = () => (
    <View style={styles.stack}>
      <View style={themedCardStyle}>
        <Text style={themedTitleStyle}>Change Password</Text>
        <Text style={themedMutedStyle}>
          Use a strong password that you do not use on other accounts. Your current password is required before saving.
        </Text>

        <View style={styles.passwordForm}>
          <View style={styles.field}>
            <Text style={[styles.kicker, isDarkProfile && styles.darkKicker]}>Current Password</Text>
            {renderPasswordInput("currentPassword", "Enter current password")}
          </View>

          <View style={styles.field}>
            <Text style={[styles.kicker, isDarkProfile && styles.darkKicker]}>New Password</Text>
            {renderPasswordInput("newPassword", "Enter new password")}
          </View>

          <View style={styles.field}>
            <Text style={[styles.kicker, isDarkProfile && styles.darkKicker]}>Confirm New Password</Text>
            {renderPasswordInput("confirmPassword", "Re-enter new password")}
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleChangePassword}
            disabled={isChangingPassword}
          >
            {isChangingPassword ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="key-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Update Password</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={themedCardStyle}>
        <Text style={themedTitleStyle}>Connected Sign-In Accounts</Text>
        <Text style={themedMutedStyle}>
          Connect an account only after signing in with your SafePass password. Connected accounts can use faster sign-in later.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { flex: 1, minWidth: 170, borderColor: currentProfile.googleId ? "#86EFAC" : "#CBD5E1" }]}
            onPress={handleGoogleLink}
            disabled={Boolean(socialLinkBusy)}
          >
            {socialLinkBusy === "google" ? <ActivityIndicator size="small" color="#DB4437" /> : <Ionicons name="logo-google" size={18} color="#DB4437" />}
            <Text style={styles.secondaryBtnText}>{currentProfile.googleId ? "Google connected" : "Connect Google"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.securityNoteCard, isDarkProfile && styles.darkInfoCard]}>
        <Ionicons name="shield-checkmark-outline" size={22} color="#0A3D91" />
        <View style={styles.securityNoteCopy}>
          <Text style={[styles.securityNoteTitle, isDarkProfile && styles.darkText]}>Account Safety</Text>
          <Text style={[styles.securityNoteText, isDarkProfile && styles.darkMuted]}>
            If you change your email or username, use the updated value the next time you sign in.
          </Text>
        </View>
      </View>
    </View>
  );

  const renderPreferences = () => (
    <View style={themedCardStyle}>
      <View style={[styles.prefRow, isDarkProfile && styles.darkPrefRow]}>
        <View style={styles.prefText}>
          <Text style={[styles.prefTitle, isDarkProfile && styles.darkText]}>Push Notifications</Text>
          <Text style={themedMutedStyle}>
            Receive alerts about activity and account updates.
          </Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          trackColor={{ false: "#CBD5E1", true: "#0A3D91" }}
          thumbColor="#FFFFFF"
        />
      </View>
      <View style={[styles.prefRow, isDarkProfile && styles.darkPrefRow]}>
        <View style={styles.prefText}>
          <Text style={[styles.prefTitle, isDarkProfile && styles.darkText]}>Biometric Login</Text>
          <Text style={themedMutedStyle}>
            {isBiometricAvailable
              ? "Use your device biometrics for faster sign in."
              : "Available after biometrics are set up in the mobile app."}
          </Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={toggleBiometric}
          disabled={!isBiometricAvailable}
          trackColor={{ false: "#CBD5E1", true: "#0A3D91" }}
          thumbColor="#FFFFFF"
        />
      </View>
      <View style={[styles.prefRow, isDarkProfile && styles.darkPrefRow]}>
        <View style={styles.prefText}>
          <Text style={[styles.prefTitle, isDarkProfile && styles.darkText]}>Dark Mode</Text>
          <Text style={themedMutedStyle}>
            Switch this profile module to a darker interface.
          </Text>
        </View>
        <Switch
          value={darkModeEnabled}
          onValueChange={setDarkModeEnabled}
          trackColor={{ false: "#CBD5E1", true: "#0A3D91" }}
          thumbColor="#FFFFFF"
        />
      </View>
      <TouchableOpacity style={[styles.prefRow, isDarkProfile && styles.darkPrefRow]} onPress={showLanguagePicker}>
        <View style={styles.prefText}>
          <Text style={[styles.prefTitle, isDarkProfile && styles.darkText]}>Language</Text>
          <Text style={themedMutedStyle}>
            Current selection: {selectedLanguage}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#64748B" />
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <SafeAreaView style={[styles.safeArea, isDarkProfile && styles.darkSafeArea]}>
        <StatusBar barStyle="light-content" backgroundColor="#041E42" />
        <Animated.View style={[styles.container, isDarkProfile && styles.darkContainer, { opacity: fadeAnim }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {showSavedBanner && (
              <View style={styles.banner}>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.bannerText}>
                  Profile updated successfully
                </Text>
              </View>
            )}
            {usingCache && (
              <View style={styles.cache}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={18}
                  color="#B45309"
                />
                <Text style={styles.cacheText}>
                  Offline fallback is active. Showing cached profile data.
                </Text>
                <TouchableOpacity onPress={loadProfile}>
                  <Text style={styles.cacheAction}>Refresh</Text>
                </TouchableOpacity>
              </View>
            )}
            {isDesktop ? (
              <View style={[styles.webTopBar, isDarkProfile && styles.darkCard]}>
                <View>
                  <Text style={[styles.webPageKicker, isDarkProfile && styles.darkKicker]}>My Profile</Text>
                  <Text style={[styles.webPageTitle, isDarkProfile && styles.darkText]}>SafePass Account</Text>
                </View>
                <View style={styles.webTopActions}>
                  <TouchableOpacity style={[styles.webIconButton, isDarkProfile && styles.darkSecondaryBtn]} onPress={loadProfile}>
                    <Ionicons name="refresh-outline" size={18} color={isDarkProfile ? "#F8FAFC" : "#0F172A"} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.webEditButton} onPress={() => setEditMode(true)}>
                    <Text style={styles.webEditButtonText}>Edit</Text>
                    <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <View style={[styles.hero, isDesktop ? styles.webHero : styles.mobileHero]}>
              <LinearGradient
                colors={
                  heroUsesDarkHeader
                    ? isDesktop && isSecurityProfile
                      ? roleConfig.webGradients || roleConfig.gradients
                      : roleConfig.gradients
                    : ["#FFFFFF", "#FFFFFF"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.heroGradient,
                  isDesktop && styles.webHeroGradient,
                  !isDesktop && styles.mobileHeroGradient,
                  isDesktop && isSecurityProfile && styles.securityWebHeroGradient,
                  isDesktop && isDarkProfile && styles.darkCard,
                ]}
              >
                {isDesktop && isSecurityProfile ? (
                  <View pointerEvents="none" style={styles.securityHeroBackdrop}>
                    <View style={styles.securityHeroBand} />
                    <View style={styles.securityHeroPanel} />
                    <View style={styles.securityHeroSignal}>
                      <Ionicons name="shield-checkmark-outline" size={92} color="rgba(255,255,255,0.1)" />
                    </View>
                  </View>
                ) : null}
                <View style={[styles.heroTop, !isDesktop && styles.mobileHeroTop]}>
                  <TouchableOpacity
                    style={[
                      styles.iconBtn,
                      isDesktop && styles.webHeroIconBtn,
                      isDesktop && isSecurityProfile && styles.securityHeroIconBtn,
                      !isDesktop && styles.mobileIconBtn,
                    ]}
                    onPress={() => navigation.goBack()}
                  >
                    <Ionicons name="arrow-back" size={20} color={heroUsesDarkHeader ? "#FFFFFF" : "#0F172A"} />
                  </TouchableOpacity>
                  {!isDesktop ? <Text style={styles.mobileHeroTitle}>Profile</Text> : null}
                  <View style={styles.heroActions}>
                    {!editMode && (
                      <>
                        {isDesktop ? (
                          <TouchableOpacity
                            style={[
                              styles.iconBtn,
                              styles.webHeroIconBtn,
                              isSecurityProfile && styles.securityHeroIconBtn,
                            ]}
                            onPress={shareProfile}
                          >
                            <Ionicons
                              name="share-social-outline"
                              size={20}
                              color={heroUsesDarkHeader ? "#FFFFFF" : "#0F172A"}
                            />
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.editBtn, !isDesktop && styles.mobileEditIconBtn]}
                          onPress={() => setEditMode(true)}
                        >
                          <Ionicons
                            name="create-outline"
                            size={isDesktop ? 15 : 18}
                            color={isDesktop ? "#0F172A" : "#FFFFFF"}
                          />
                          {isDesktop ? <Text style={styles.editBtnText}>Edit</Text> : null}
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.avatarWrap, !isDesktop && styles.mobileAvatarWrap]}
                  onPress={handlePhotoPress}
                  activeOpacity={editMode ? 0.85 : 1}
                >
                  {isUploadingPhoto ? (
                    <View style={[styles.avatar, !isDesktop && styles.mobileAvatar]}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  ) : currentProfile.profilePhoto ? (
                    <Image
                      source={{ uri: currentProfile.profilePhoto }}
                      style={[styles.avatarImg, !isDesktop && styles.mobileAvatar]}
                    />
                  ) : (
                    <View style={[styles.avatar, !isDesktop && styles.mobileAvatar]}>
                      <Text style={[styles.avatarText, !isDesktop && styles.mobileAvatarText]}>{getInitials()}</Text>
                    </View>
                  )}
                  {editMode && (
                    <View style={styles.cameraBadge}>
                      <Ionicons name="camera" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={[styles.heroKicker, isDesktop && !heroUsesDarkHeader && styles.webHeroKicker, !isDesktop && styles.mobileHeroKicker]}>SafePass Profile</Text>
                <Text style={[styles.heroName, isDesktop && !heroUsesDarkHeader && styles.webHeroName, !isDesktop && styles.mobileHeroName]}>
                  {currentProfile.firstName} {currentProfile.lastName}
                </Text>
                <View style={styles.rolePill}>
                  <Ionicons name={roleConfig.icon} size={14} color="#0F172A" />
                  <Text style={styles.rolePillText}>{roleConfig.label}</Text>
                </View>
                <Text style={[styles.heroSub, isDesktop && !heroUsesDarkHeader && styles.webHeroSub, !isDesktop && styles.mobileHeroSub]}>{identityLine}</Text>
              </LinearGradient>
            </View>
            <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
              {isDesktop ? (
                <View style={[styles.webSidebar, isDarkProfile && styles.darkCard]}>
                  <Text style={[styles.webSidebarBrand, isDarkProfile && styles.darkText]}>SafePass</Text>
                  {profileTabs.map(([id, label, icon]) => {
                    const active = tab === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[styles.webSidebarItem, active && styles.webSidebarItemActive]}
                        onPress={() => setTab(id)}
                      >
                        <Ionicons name={icon} size={16} color={active ? "#FFFFFF" : isDarkProfile ? "#CBD5E1" : "#475569"} />
                        <Text style={[styles.webSidebarText, isDarkProfile && styles.darkMuted, active && styles.webSidebarTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
              <View style={[styles.main, isDesktop && styles.mainDesktop]}>
                {!isDesktop && tab !== "overview" ? renderMobileSectionHeader() : null}
                {!isDesktop ? renderProfileTabs() : null}
                {tab === "overview" && renderOverview()}
                {tab === "account" && renderAccount()}
                {tab === "access" && renderAccess()}
                {tab === "security" && renderSecurity()}
                {tab === "preferences" && renderPreferences()}
              </View>
              <View style={[styles.side, isDesktop && styles.sideDesktop]}>
                <View style={[themedCardStyle, !isDesktop && styles.mobileActionCard]}>
                  {isDesktop ? (
                    <>
                      <Text style={themedTitleStyle}>Profile Actions</Text>
                      <Text style={themedMutedStyle}>
                        Save edits, refresh account data, update security, or sign out.
                      </Text>
                    </>
                  ) : null}
                  <View style={[styles.actions, !isDesktop && styles.mobileActions]}>
                    {editMode ? (
                      <>
                        <TouchableOpacity
                          style={[styles.primaryBtn, !isDesktop && styles.mobilePrimaryAction]}
                          onPress={handleSave}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                              <Text style={styles.primaryBtnText}>Save</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.secondaryBtn, isDarkProfile && styles.darkSecondaryBtn, !isDesktop && styles.mobileSecondaryAction]}
                          onPress={() => {
                            setEditedProfile(profile);
                            setEditMode(false);
                          }}
                        >
                          <Text style={[styles.secondaryBtnText, isDarkProfile && styles.darkText]}>
                            Cancel
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.secondaryBtn, isDarkProfile && styles.darkSecondaryBtn, !isDesktop && styles.mobileSecondaryAction]}
                          onPress={() => setTab("security")}
                        >
                          <Ionicons name="key-outline" size={16} color={isDarkProfile ? "#F8FAFC" : "#334155"} />
                          <Text style={[styles.secondaryBtnText, isDarkProfile && styles.darkText]}>
                            Password
                          </Text>
                        </TouchableOpacity>
                        {isDesktop ? (
                          <TouchableOpacity
                            style={[styles.secondaryBtn, isDarkProfile && styles.darkSecondaryBtn]}
                            onPress={loadProfile}
                          >
                            <Text style={[styles.secondaryBtnText, isDarkProfile && styles.darkText]}>
                              Refresh Profile
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.dangerBtn, !isDesktop && styles.mobileDangerAction]}
                          onPress={() => setShowLogoutModal(true)}
                          disabled={isLoggingOut}
                        >
                          {isLoggingOut ? (
                            <ActivityIndicator size="small" color="#DC2626" />
                          ) : (
                            <>
                              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
                              <Text style={styles.dangerBtnText}>Sign Out</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
                {isDesktop ? (
                <View style={themedCardStyle}>
                  <Text style={themedTitleStyle}>Account Notes</Text>
                  <View style={styles.note}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color="#0A3D91"
                    />
                    <Text style={[styles.noteText, isDarkProfile && styles.darkMuted]}>
                      Keep your contact details updated for smoother account
                      recovery.
                    </Text>
                  </View>
                  <View style={styles.note}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color="#0A3D91"
                    />
                    <Text style={[styles.noteText, isDarkProfile && styles.darkMuted]}>
                      Your mobile and web layouts now use the same responsive
                      profile structure.
                    </Text>
                  </View>
                  <Text style={[styles.version, isDarkProfile && styles.darkKicker]}>SafePass v2.1.0</Text>
                </View>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDarkProfile && styles.darkCard]}>
            <Text style={[styles.modalTitle, isDarkProfile && styles.darkText]}>Sign Out</Text>
            <Text style={[styles.modalText, isDarkProfile && styles.darkMuted]}>
              Would you like to sign out?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalSecondary, isDarkProfile && styles.darkSecondaryBtn]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[styles.modalSecondaryText, isDarkProfile && styles.darkText]}>Stay Signed In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimary}
                onPress={performLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const shadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  android: { elevation: 3 },
  web: { boxShadow: "0px 10px 28px rgba(15,23,42,0.08)" },
});
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FBFE" },
  container: { flex: 1, backgroundColor: "#F8FBFE" },
  scrollContent: { paddingBottom: 36 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FBFE",
    paddingHorizontal: 28,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    color: "#64748B",
    fontWeight: "600",
  },
  errorTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#0A3D91",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  banner: {
    alignSelf: "center",
    marginTop: 14,
    marginBottom: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0A3D91",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  bannerText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  cache: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#FEF3C7",
    gap: 10,
  },
  cacheText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#92400E",
    fontWeight: "600",
  },
  cacheAction: { fontSize: 12, fontWeight: "800", color: "#041E42" },
  webTopBar: {
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
    marginTop: 18,
    marginBottom: 12,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...shadow,
  },
  webPageKicker: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  webPageTitle: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
  },
  webTopActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  webIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  webEditButton: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  webEditButtonText: { fontSize: 13, fontWeight: "900", color: "#FFFFFF" },
  hero: {
    marginHorizontal: 20,
    marginTop: 18,
    borderRadius: 30,
    overflow: "hidden",
    ...shadow,
  },
  webHero: {
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
    marginTop: 0,
    borderRadius: 18,
  },
  mobileHero: {
    marginHorizontal: 18,
    marginTop: 10,
    borderRadius: 24,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.select({ ios: 56, android: 28, web: 28 }),
    paddingBottom: 24,
    alignItems: "center",
  },
  webHeroGradient: {
    minHeight: 122,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
  },
  securityWebHeroGradient: {
    minHeight: 288,
    borderColor: "rgba(255,255,255,0.18)",
  },
  securityHeroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  securityHeroBand: {
    position: "absolute",
    top: -44,
    right: -90,
    width: 460,
    height: 170,
    transform: [{ rotate: "-14deg" }],
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  securityHeroPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(3,7,18,0.18)",
  },
  securityHeroSignal: {
    position: "absolute",
    right: 58,
    bottom: 40,
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  mobileHeroGradient: {
    paddingHorizontal: 18,
    paddingTop: Platform.select({ ios: 36, android: 22, web: 22 }),
    paddingBottom: 18,
    borderRadius: 24,
  },
  mobileHeroTop: {
    marginBottom: 16,
  },
  mobileHeroTitle: {
    position: "absolute",
    left: 54,
    right: 54,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroTop: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  mobileIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  webHeroIconBtn: {
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  securityHeroIconBtn: {
    backgroundColor: "rgba(255,255,255,0.13)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  editBtnText: { fontSize: 13, fontWeight: "800", color: "#0F172A" },
  avatarWrap: { position: "relative", marginBottom: 14 },
  mobileAvatarWrap: { marginBottom: 10 },
  avatarImg: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  mobileEditIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  mobileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarText: { fontSize: 34, fontWeight: "800", color: "#FFFFFF" },
  mobileAvatarText: { fontSize: 24 },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.76)",
    textTransform: "uppercase",
    letterSpacing: 1.3,
    marginBottom: 6,
  },
  webHeroKicker: { color: "#0A3D91" },
  mobileHeroKicker: {
    fontSize: 10,
    marginBottom: 4,
    letterSpacing: 0.8,
  },
  heroName: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  webHeroName: {
    color: "#0F172A",
    textAlign: "left",
  },
  mobileHeroName: {
    fontSize: 23,
    lineHeight: 28,
    marginBottom: 8,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    marginBottom: 8,
  },
  rolePillText: { fontSize: 13, fontWeight: "800", color: "#0F172A" },
  heroSub: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  webHeroSub: {
    color: "#64748B",
    textAlign: "left",
  },
  mobileHeroSub: {
    fontSize: 12,
    opacity: 0.92,
  },
  shell: { paddingHorizontal: 20, paddingTop: 18, gap: 18 },
  shellDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    maxWidth: 1280,
    alignSelf: "center",
    width: "100%",
  },
  webSidebar: {
    width: 210,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 22,
    padding: 14,
    gap: 6,
    ...shadow,
  },
  webSidebarBrand: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0A3D91",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  webSidebarItem: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  webSidebarItemActive: {
    backgroundColor: "#0A3D91",
  },
  webSidebarText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
  },
  webSidebarTextActive: {
    color: "#FFFFFF",
  },
  main: { width: "100%" },
  mainDesktop: { flex: 1.45, minWidth: 0 },
  side: { width: "100%", gap: 18 },
  sideDesktop: { flex: 0.85, minWidth: 300 },
  tabs: { gap: 10 },
  mobileTabs: {
    gap: 8,
    paddingBottom: 12,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  tabBtnActive: { backgroundColor: "#041E42", borderColor: "#041E42" },
  tabText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  tabTextActive: { color: "#FFFFFF" },
  mobileTabBtn: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE6F3",
  },
  mobileTabBtnActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },
  mobileTabText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },
  mobileTabTextActive: { color: "#FFFFFF" },
  mobileMenuCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
    ...shadow,
  },
  mobileMenuRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  mobileMenuRowLast: { borderBottomWidth: 0 },
  mobileMenuRowActive: {
    backgroundColor: "#EEF5FF",
  },
  mobileMenuIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileMenuIconActive: {
    backgroundColor: "#0A3D91",
  },
  mobileMenuText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  mobileSectionHeader: {
    minHeight: 44,
    marginBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE6F3",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...shadow,
  },
  mobileSectionHeaderText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  stack: { gap: 18 },
  grid: { gap: 14 },
  gridDesktop: { flexDirection: "row" },
  mobileMetricGrid: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 22,
    padding: 18,
    ...shadow,
  },
  mobileMetricCard: {
    minHeight: 82,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#94A3B8",
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  mobileMetricValue: {
    fontSize: 13,
    lineHeight: 17,
    marginBottom: 0,
    textAlign: "center",
  },
  mobileMetricKicker: {
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
    marginBottom: 7,
  },
  muted: { fontSize: 13, lineHeight: 19, color: "#64748B" },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 24,
    padding: 20,
    ...shadow,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
  },
  field: { marginBottom: 16 },
  fieldValue: {
    fontSize: 15,
    lineHeight: 22,
    color: "#0F172A",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 16,
    backgroundColor: "#F8FBFE",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  passwordInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 16,
    backgroundColor: "#F8FBFE",
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  passwordEyeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  passwordForm: {
    gap: 4,
    marginTop: 18,
  },
  darkSafeArea: { backgroundColor: "#07111F" },
  darkContainer: { backgroundColor: "#07111F" },
  darkCard: {
    backgroundColor: "#0F172A",
    borderColor: "#1F2A3A",
  },
  darkText: { color: "#F8FAFC" },
  darkMuted: { color: "#CBD5E1" },
  darkKicker: { color: "#94A3B8" },
  darkInputWrap: {
    backgroundColor: "#111827",
    borderColor: "#334155",
  },
  darkInput: { color: "#F8FAFC" },
  darkInfoCard: {
    backgroundColor: "#111827",
    borderColor: "#334155",
  },
  mobileOverviewCard: {
    padding: 16,
    borderRadius: 18,
  },
  darkTabBtn: {
    backgroundColor: "#111827",
    borderColor: "#334155",
  },
  darkSecondaryBtn: {
    backgroundColor: "#111827",
    borderColor: "#334155",
  },
  darkPrefRow: {
    borderBottomColor: "#1F2A3A",
  },
  darkMobileMenuRowActive: {
    backgroundColor: "#0A3D91",
    borderBottomColor: "#0A3D91",
  },
  darkMobileMenuTextActive: {
    color: "#FFFFFF",
  },
  securityNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 20,
    padding: 16,
  },
  securityNoteCopy: { flex: 1 },
  securityNoteTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#041E42",
    marginBottom: 4,
  },
  securityNoteText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#0A3D91",
    fontWeight: "600",
  },
  accessCard: { borderRadius: 24, padding: 20, ...shadow },
  accessLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "rgba(255,255,255,0.68)",
    marginBottom: 10,
  },
  accessValue: {
    fontSize: 21,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  accessHint: { fontSize: 13, lineHeight: 20, color: "rgba(255,255,255,0.8)" },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 12,
  },
  prefText: { flex: 1 },
  prefTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  actions: { gap: 12, marginTop: 14 },
  mobileActionCard: {
    padding: 12,
    borderRadius: 18,
  },
  mobileActions: {
    marginTop: 0,
    flexDirection: "row",
    gap: 10,
  },
  mobilePrimaryAction: { flex: 1 },
  mobileSecondaryAction: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
    paddingVertical: 12,
  },
  mobileDangerAction: { flex: 1, paddingVertical: 12 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#041E42",
    borderRadius: 16,
    paddingVertical: 14,
  },
  primaryBtnText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  dangerBtnText: { fontSize: 14, fontWeight: "800", color: "#DC2626" },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
    fontWeight: "500",
  },
  version: {
    marginTop: 18,
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    ...shadow,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    marginBottom: 20,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalSecondary: {
    flex: 1,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalSecondaryText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  modalPrimary: {
    flex: 1,
    backgroundColor: "#DC2626",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalPrimaryText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
