import Alert from '../utils/Alert';
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Linking,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import helpStyles from "../styles/HelpStyles";
import { brandColors, sapphireGradient } from "../styles/brandColors";
import Logo from "../assets/LogoSapphire.jpg";
import { useAviationTransition } from "../utils/AviationTransitionContext";

const CONTACT_OPTIONS = [
  {
    id: "email",
    label: "Campus Help Desk",
    value: "info@sapphireaviationacademy.edu.ph",
    helper: "Best for login, OTP verification, account recovery, and dashboard access concerns.",
    icon: "mail-outline",
    accent: brandColors.blue,
    tint: brandColors.blueSoft,
    url: "mailto:info@sapphireaviationacademy.edu.ph",
  },
  {
    id: "call",
    label: "Access Support",
    value: "0917 580 4858",
    helper: "Call for urgent gate access, campus ID, visitor coordination, or access issues.",
    icon: "call-outline",
    accent: brandColors.blue,
    tint: "#E8F1FF",
    url: "tel:09175804858",
  },
  {
    id: "site",
    label: "Academy Website",
    value: "sapphireaviationacademy.edu.ph",
    helper: "Visit the academy site for announcements, contact details, and school information.",
    icon: "globe-outline",
    accent: brandColors.navy,
    tint: brandColors.blueSoft,
    url: "https://sapphireaviationacademy.edu.ph/",
  },
];

const QUICK_GUIDES = [
  {
    id: "students",
    title: "Student Access",
    description:
      "Use your campus account for virtual ID, attendance history, and tap-in or tap-out activity.",
    icon: "id-card-outline",
    accent: brandColors.blue,
  },
  {
    id: "staff",
    title: "Staff Access",
    description:
      "Open staff tools for NFC attendance, office presence, and assigned office access.",
    icon: "briefcase-outline",
    accent: brandColors.navy,
  },
  {
    id: "visitors",
    title: "Visitor Access",
    description:
      "Create a visitor account, verify email, request appointments, and track visit status.",
    icon: "person-outline",
    accent: brandColors.sky,
  },
  {
    id: "security",
    title: "Security Desk",
    description:
      "Monitor checkpoint activity, validate access, and review campus movement logs.",
    icon: "shield-checkmark-outline",
    accent: brandColors.blue,
  },
  {
    id: "admins",
    title: "Admin Tools",
    description:
      "Manage users, approvals, reports, alerts, and campus-wide SafePass records.",
    icon: "settings-outline",
    accent: brandColors.navy,
  },
];

const SUPPORT_TOPICS = [
  {
    id: "login",
    title: "Cannot sign in",
    description: "Password, role access, or account status issues.",
    icon: "log-in-outline",
    faq: "login",
  },
  {
    id: "otp",
    title: "OTP or verification",
    description: "Codes, email verification, and trusted device help.",
    icon: "keypad-outline",
    faq: "otp",
  },
  {
    id: "visitor",
    title: "Visitor appointment",
    description: "Registration, appointment requests, passes, and check-in.",
    icon: "calendar-outline",
    faq: "visitor",
  },
  {
    id: "privacy",
    title: "Privacy and terms",
    description: "Data protection, account use, and access rules.",
    icon: "document-text-outline",
    faq: "privacy",
  },
];

const FAQS = [
  {
    id: "login",
    question: "How do I sign in to SafePass?",
    answer:
      "Use Login and enter the credentials tied to your campus role. SafePass opens the correct dashboard after verification.",
  },
  {
    id: "otp",
    question: "Why do I need OTP verification?",
    answer:
      "OTP protects campus accounts before opening dashboards, virtual IDs, attendance tools, and visitor workflows. Trusted devices may reduce repeated verification when enabled.",
  },
  {
    id: "visitor",
    question: "What happens after visitor registration?",
    answer:
      "After registration, verify your email using the code sent to you. Once verified, you can sign in and submit your visit request from the visitor dashboard.",
  },
  {
    id: "student-staff",
    question: "Are students and staff handled like visitors?",
    answer:
      "No. Students and staff use their own campus account flows, dashboards, virtual IDs, and attendance tools.",
  },
  {
    id: "security",
    question: "How does security tracking work?",
    answer:
      "Security and admins can monitor campus access, visitor movement, attendance activity, and checkpoint records through their dashboards.",
  },
  {
    id: "admin",
    question: "What can admins manage?",
    answer:
      "Admins can review users, visitor approvals, notifications, dashboard reports, and SafePass activity records across campus.",
  },
  {
    id: "password",
    question: "What if I forgot my password?",
    answer:
      "Return to Login and use the password recovery flow. If you still cannot sign in, contact support so your account can be reset safely.",
  },
  {
    id: "privacy",
    question: "Is my information protected?",
    answer:
      "Yes. Account details, visitor records, access logs, and attendance activity are handled through the secured SafePass backend for approval and monitoring purposes.",
  },
  {
    id: "terms",
    question: "What are the SafePass terms of use?",
    answer:
      "Use SafePass only with your own campus or visitor account. Keep login details private, follow campus access rules, and contact support if account information, visit records, or access permissions need correction.",
  },
];

export default function HelpScreen({ navigation, route }) {
  const startAviationTransition = useAviationTransition();
  const requestedTopic = route?.params?.topic;
  const shouldReturnHome = route?.params?.fromHome || !navigation?.canGoBack?.();
  const getInitialFaq = () => {
    if (requestedTopic === "privacy") return "privacy";
    if (requestedTopic === "terms") return "terms";
    return FAQS[0].id;
  };
  const [expandedFaq, setExpandedFaq] = useState(getInitialFaq);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const isWeb = Platform.OS === "web";
  const heroAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setTransitionBusy(false);
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (requestedTopic === "privacy") {
      setExpandedFaq("privacy");
    }
    if (requestedTopic === "terms") {
      setExpandedFaq("terms");
    }
    if (requestedTopic === "contact") {
      setExpandedFaq(null);
    }
  }, [requestedTopic]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 480,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [contentAnim, heroAnim]);

  const goHomeWithTransition = (fallback = "navigate") => {
    if (transitionBusy) return;
    setTransitionBusy(true);
    if (startAviationTransition) {
      startAviationTransition({
        mode: "journey",
        message: "Departing help center...",
        arrivalMessage:
          fallback === "goBack" && !shouldReturnHome
            ? "Returning to previous page..."
            : "Arriving at campus access...",
        duration: 2500,
        onBeforeFade: () => {
          if (fallback === "goBack" && !shouldReturnHome && navigation?.canGoBack?.()) {
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

    if (fallback === "goBack" && !shouldReturnHome && navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("RoleSelect");
  };

  const goLoginWithTransition = () => {
    if (transitionBusy) return;
    setTransitionBusy(true);
    if (startAviationTransition) {
      startAviationTransition({
        mode: "journey",
        message: "Departing help center...",
        arrivalMessage: "Arriving at secure login...",
        duration: 2500,
        onBeforeFade: () => {
          navigation.navigate("Login", {
            role: "campus",
            skipArrivalSplash: true,
            timestamp: Date.now(),
          });
        },
        onDone: () => setTransitionBusy(false),
      });
      return;
    }

    navigation.navigate("Login");
  };

  const handleBack = () => {
    goHomeWithTransition(navigation?.canGoBack?.() && !shouldReturnHome ? "goBack" : "navigate");
  };

  const heroEntranceStyle = {
    opacity: heroAnim,
    transform: [
      {
        translateY: heroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };
  const contentEntranceStyle = {
    opacity: contentAnim,
    transform: [
      {
        translateY: contentAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
    ],
  };

  const handleOpenUrl = async (url, failureMessage) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error("Unsupported link");
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Unable to Open", failureMessage);
    }
  };

  const handleKeyPress = (event, handler) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };

  return (
    <SafeAreaView style={helpStyles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={brandColors.navy} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={helpStyles.scrollContainer}
      >
        <LinearGradient
          colors={sapphireGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={helpStyles.hero}
        >
          <Animated.View style={[helpStyles.heroInner, heroEntranceStyle]}>
            <TouchableOpacity
              style={[helpStyles.backButton, transitionBusy && { opacity: 0.7 }]}
              onPress={handleBack}
              disabled={transitionBusy}
              activeOpacity={0.8}
              accessibilityLabel="Go back"
              accessibilityRole="button"
              {...(isWeb && {
                onKeyPress: (e) => handleKeyPress(e, handleBack),
                tabIndex: 0,
              })}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={helpStyles.heroBrandCard}>
              <Image source={Logo} style={helpStyles.heroLogo} resizeMode="contain" />
              <View style={helpStyles.heroBrandCopy}>
                <Text style={helpStyles.heroBrandTitle}>Sapphire International Aviation Academy</Text>
                <Text style={helpStyles.heroBrandSubtitle}>SafePass Smart Campus Support</Text>
              </View>
            </View>

            <View style={helpStyles.heroBody}>
              <View style={helpStyles.heroBadge}>
                <Ionicons name="headset-outline" size={16} color="#EEF5FF" />
                <Text style={helpStyles.heroBadgeText}>Support Center</Text>
              </View>
              <Text style={helpStyles.heroTitle}>How can we help?</Text>
              <Text style={helpStyles.heroSubtitle}>
                Get help with login, verification, campus IDs, attendance,
                visitor access, and role-specific dashboards.
              </Text>
            </View>

            <View style={helpStyles.heroStats}>
              <View style={helpStyles.heroStatCard}>
                <Text style={helpStyles.heroStatValue}>5</Text>
                <Text style={helpStyles.heroStatLabel}>Campus roles</Text>
              </View>
              <View style={helpStyles.heroStatCard}>
                <Text style={helpStyles.heroStatValue}>OTP</Text>
                <Text style={helpStyles.heroStatLabel}>Verification help</Text>
              </View>
              <View style={helpStyles.heroStatCard}>
                <Text style={helpStyles.heroStatValue}>Live</Text>
                <Text style={helpStyles.heroStatLabel}>Access guidance</Text>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        <Animated.View style={[helpStyles.pageShell, contentEntranceStyle]}>
          <View style={helpStyles.topicPanel}>
            <View style={helpStyles.topicHeader}>
              <Text style={helpStyles.sectionEyebrow}>Start Here</Text>
              <Text style={helpStyles.topicTitle}>What do you need help with?</Text>
            </View>
            <View style={helpStyles.topicGrid}>
              {SUPPORT_TOPICS.map((topic) => (
                <TouchableOpacity
                  key={topic.id}
                  style={[
                    helpStyles.topicCard,
                    expandedFaq === topic.faq && helpStyles.topicCardActive,
                  ]}
                  onPress={() => setExpandedFaq(topic.faq)}
                  activeOpacity={0.84}
                  accessibilityRole="button"
                  accessibilityLabel={topic.title}
                  {...(isWeb && {
                    onKeyPress: (e) => handleKeyPress(e, () => setExpandedFaq(topic.faq)),
                    tabIndex: 0,
                  })}
                >
                  <View style={helpStyles.topicIcon}>
                    <Ionicons name={topic.icon} size={19} color={brandColors.blue} />
                  </View>
                  <View style={helpStyles.topicCopy}>
                    <Text style={helpStyles.topicCardTitle}>{topic.title}</Text>
                    <Text style={helpStyles.topicCardText}>{topic.description}</Text>
                  </View>
                  <Ionicons name="arrow-forward-outline" size={16} color={brandColors.blue} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={helpStyles.sectionCard}>
            <View style={helpStyles.sectionHeader}>
              <Text style={helpStyles.sectionEyebrow}>Support Channels</Text>
              <Text style={helpStyles.sectionTitle}>
                {requestedTopic === "contact" ? "Contact SafePass support" : "Reach the right team quickly"}
              </Text>
              <Text style={helpStyles.sectionSubtitle}>
                Choose the contact path that best fits the issue you are
                dealing with.
              </Text>
            </View>

            <View style={helpStyles.contactGrid}>
              {CONTACT_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={helpStyles.contactCard}
                  onPress={() =>
                    handleOpenUrl(item.url, `Unable to open ${item.label.toLowerCase()} right now.`)
                  }
                  activeOpacity={0.85}
                  accessibilityLabel={item.label}
                  accessibilityRole="link"
                  {...(isWeb && {
                    onKeyPress: (e) =>
                      handleKeyPress(e, () =>
                        handleOpenUrl(
                          item.url,
                          `Unable to open ${item.label.toLowerCase()} right now.`,
                        ),
                      ),
                    tabIndex: 0,
                  })}
                >
                  <View style={helpStyles.contactCardContent}>
                    <View style={[helpStyles.contactIconWrap, { backgroundColor: item.tint }]}>
                      <Ionicons name={item.icon} size={22} color={item.accent} />
                    </View>
                    <Text style={helpStyles.contactLabel}>{item.label}</Text>
                    <Text style={helpStyles.contactValue}>{item.value}</Text>
                    <Text style={helpStyles.contactHelper}>{item.helper}</Text>
                  </View>
                  <View style={helpStyles.contactLinkRow}>
                    <Text style={[helpStyles.contactLinkText, { color: item.accent }]}>
                      {item.id === "email" ? "Send email" : item.id === "call" ? "Call now" : "Open site"}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={item.accent} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={helpStyles.sectionCard}>
            <View style={helpStyles.sectionHeader}>
              <Text style={helpStyles.sectionEyebrow}>Quick Guide</Text>
              <Text style={helpStyles.sectionTitle}>Find your SafePass workflow</Text>
              <Text style={helpStyles.sectionSubtitle}>
                These are the most common SafePass journeys across the app.
              </Text>
            </View>

            <View style={helpStyles.guideGrid}>
              {QUICK_GUIDES.map((item) => (
                <View key={item.id} style={helpStyles.guideCard}>
                  <View
                    style={[
                      helpStyles.guideIconWrap,
                      { backgroundColor: `${item.accent}18` },
                    ]}
                  >
                    <Ionicons name={item.icon} size={20} color={item.accent} />
                  </View>
                  <Text style={helpStyles.guideTitle}>{item.title}</Text>
                  <Text style={helpStyles.guideDescription}>{item.description}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={helpStyles.sectionCard}>
            <View style={helpStyles.sectionHeader}>
              <Text style={helpStyles.sectionEyebrow}>
                {requestedTopic === "privacy" ? "Privacy Policy" : requestedTopic === "terms" ? "Terms of Service" : "FAQ"}
              </Text>
              <Text style={helpStyles.sectionTitle}>Common answers</Text>
              <Text style={helpStyles.sectionSubtitle}>
                Expand a topic below to see the answer.
              </Text>
            </View>

            <View style={helpStyles.faqList}>
              {FAQS.map((faq) => {
                const expanded = expandedFaq === faq.id;
                return (
                  <TouchableOpacity
                    key={faq.id}
                    style={[helpStyles.faqItem, expanded && helpStyles.faqItemActive]}
                    onPress={() => setExpandedFaq(expanded ? null : faq.id)}
                    activeOpacity={0.85}
                  >
                    <View style={helpStyles.faqQuestionRow}>
                      <View style={helpStyles.faqQuestionTextWrap}>
                        <Ionicons name="help-circle-outline" size={18} color={brandColors.blue} />
                        <Text style={helpStyles.faqQuestion}>{faq.question}</Text>
                      </View>
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color="#475569"
                      />
                    </View>
                    {expanded && (
                      <View style={helpStyles.faqAnswerBox}>
                        <Text style={helpStyles.faqAnswer}>{faq.answer}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <LinearGradient
            colors={["#F8FBFE", "#EEF5FF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={helpStyles.ctaCard}
          >
            <View style={helpStyles.ctaTextWrap}>
              <Text style={helpStyles.ctaTitle}>Ready to continue?</Text>
              <Text style={helpStyles.ctaSubtitle}>
                Return to the home page or open login to continue with your campus account.
              </Text>
            </View>
            <View style={helpStyles.ctaActions}>
              <TouchableOpacity
                style={[helpStyles.secondaryCta, transitionBusy && { opacity: 0.7 }]}
                onPress={() => goHomeWithTransition("navigate")}
                disabled={transitionBusy}
                activeOpacity={0.85}
              >
                <Text style={helpStyles.secondaryCtaText}>Back Home</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[helpStyles.primaryCta, transitionBusy && { opacity: 0.7 }]}
                onPress={goLoginWithTransition}
                disabled={transitionBusy}
                activeOpacity={0.85}
              >
                <Text style={helpStyles.primaryCtaText}>Go to Login</Text>
                <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <View style={helpStyles.footer}>
            <Text style={helpStyles.footerText}>
              SafePass support for Sapphire International Aviation Academy
            </Text>
            <Text style={helpStyles.footerSubtext}>
              Login, verification, campus access, attendance, and visitor guidance
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
