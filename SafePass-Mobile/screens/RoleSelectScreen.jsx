import { WEB_VERSION_LABEL } from "../utils/webBranding";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Linking,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import SocialDock from "../components/SocialDock";
import AviationSplash from "../components/AviationSplash";
import { useAviationTransition } from "../utils/AviationTransitionContext";
import roleSelectStyles from "../styles/RoleSelectStyles";
import { brandColors, sapphireGradient } from "../styles/brandColors";
import Logo from "../assets/LogoSapphire.jpg";

const isWeb = Platform.OS === "web";

const platformHighlights = [
  {
    title: "Students",
    description: "Virtual campus ID, attendance history, and tap-in activity.",
    icon: "id-card-outline",
  },
  {
    title: "Staff",
    description: "NFC attendance, office check-ins, office presence, and assigned access.",
    icon: "briefcase-outline",
  },
  {
    title: "Visitors",
    description: "Appointment requests, visit tracking, visitor passes, and guided check-in.",
    icon: "person-outline",
  },
  {
    title: "Security",
    description: "Checkpoint validation, access monitoring, campus logs, and live oversight.",
    icon: "shield-checkmark-outline",
  },
  {
    title: "Admins",
    description: "User management, reports, notifications, and smart campus supervision.",
    icon: "settings-outline",
  },
];

const metrics = [
  ["Campus ID", "Virtual NFC"],
  ["Attendance", "Tap in/out"],
  ["Monitoring", "Real time"],
];

const accessPreviewItems = [
  { label: "Visitor Pass", value: "Preview", icon: "qr-code-outline", accent: brandColors.success },
  { label: "Gate Scan", value: "Preview", icon: "radio-outline", accent: brandColors.sky },
  { label: "Security Desk", value: "Preview", icon: "shield-checkmark-outline", accent: brandColors.blue },
];

export default function RoleSelectScreen({ navigation, route }) {
  const startAviationTransition = useAviationTransition();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isCompact = width < 720;
  const isPhone = width < 480;
  const [introVisible, setIntroVisible] = useState(true);
  const [takeoffVisible, setTakeoffVisible] = useState(false);
  const [returnJourneyVisible, setReturnJourneyVisible] = useState(false);
  const [journeyArrivalMessage, setJourneyArrivalMessage] = useState("Arriving at secure login...");
  const pendingNavigationRef = useRef(null);
  const hasHandledInitialFocusRef = useRef(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const screenEnterAnim = useRef(new Animated.Value(0)).current;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const heroEyebrowAnim = useRef(new Animated.Value(0)).current;
  const heroTitleAnim = useRef(new Animated.Value(0)).current;
  const heroBodyAnim = useRef(new Animated.Value(0)).current;
  const heroVisualIntroAnim = useRef(new Animated.Value(0)).current;
  const mobileFeatureAnim = useRef(new Animated.Value(0)).current;
  const mobileVisitorAnim = useRef(new Animated.Value(0)).current;
  const desktopFeatureAnim = useRef(new Animated.Value(0)).current;
  const footerAnim = useRef(new Animated.Value(0)).current;
  const pageTransitionAnim = useRef(new Animated.Value(1)).current;
  const schoolCardFloatAnim = useRef(new Animated.Value(0)).current;
  const mobileBadgePulseAnim = useRef(new Animated.Value(0)).current;
  const buttonPressAnim = useRef(new Animated.Value(1)).current;
  const mobileLoginPressAnim = useRef(new Animated.Value(1)).current;
  const mobileContactPressAnim = useRef(new Animated.Value(1)).current;
  const mobileVisitorPressAnim = useRef(new Animated.Value(1)).current;
  const loginHoverAnim = useRef(new Animated.Value(0)).current;
  const contactHoverAnim = useRef(new Animated.Value(0)).current;
  const visitorLinkHoverAnim = useRef(new Animated.Value(0)).current;
  const visitorLinkPressAnim = useRef(new Animated.Value(1)).current;
  const footerButtonPressAnim = useRef(new Animated.Value(1)).current;
  const footerButtonHoverAnim = useRef(new Animated.Value(0)).current;
  const featureHoverAnims = useRef(platformHighlights.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      if (!hasHandledInitialFocusRef.current) {
        hasHandledInitialFocusRef.current = true;
        return;
      }
      if (route?.params?.returnJourneySplash) {
        setIntroVisible(false);
        setReturnJourneyVisible(true);
        navigation.setParams?.({ returnJourneySplash: false });
        return;
      }
      if (route?.params?.skipArrivalSplash) {
        navigation.setParams?.({ skipArrivalSplash: false });
        return;
      }
      setIntroVisible(true);
    });

    return unsubscribe;
  }, [navigation, route?.params?.returnJourneySplash, route?.params?.skipArrivalSplash]);

  useEffect(() => {
    if (isWeb) {
      [screenEnterAnim, heroAnim, heroEyebrowAnim, heroTitleAnim, heroBodyAnim, heroVisualIntroAnim, mobileFeatureAnim, mobileVisitorAnim, desktopFeatureAnim, footerAnim].forEach(value => value.setValue(1));
      return;
    }
    Animated.parallel([
      Animated.timing(screenEnterAnim, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.sequence([
        Animated.parallel([
          Animated.timing(heroAnim, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.stagger(90, [
            Animated.timing(heroEyebrowAnim, {
              toValue: 1,
              duration: 520,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(heroTitleAnim, {
              toValue: 1,
              duration: 620,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(heroBodyAnim, {
              toValue: 1,
              duration: 560,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(heroVisualIntroAnim, {
              toValue: 1,
              duration: 620,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(mobileVisitorAnim, {
            toValue: 1,
            duration: 340,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(mobileFeatureAnim, {
            toValue: 1,
            duration: 390,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(desktopFeatureAnim, {
            toValue: 1,
            duration: 410,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
        Animated.timing(footerAnim, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    ]).start();

    const schoolFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(schoolCardFloatAnim, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(schoolCardFloatAnim, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    const badgePulse = Animated.loop(
      Animated.sequence([
        Animated.timing(mobileBadgePulseAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(mobileBadgePulseAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    schoolFloat.start();
    badgePulse.start();

    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.title = "SafePass Smart Campus | Sapphire International Aviation Academy";
      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "smooth";
      return () => {
        schoolFloat.stop();
        badgePulse.stop();
        document.documentElement.style.scrollBehavior = previousScrollBehavior;
      };
    }

    return () => {
      schoolFloat.stop();
      badgePulse.stop();
    };
  }, [
    desktopFeatureAnim,
    footerAnim,
    heroAnim,
    heroBodyAnim,
    heroEyebrowAnim,
    heroTitleAnim,
    heroVisualIntroAnim,
    mobileBadgePulseAnim,
    mobileFeatureAnim,
    mobileVisitorAnim,
    schoolCardFloatAnim,
    screenEnterAnim,
  ]);

  const navigateWithTransition = (callback, arrivalMessage = "Arriving at destination...") => {
    pendingNavigationRef.current = callback;
    setJourneyArrivalMessage(arrivalMessage);
    Animated.timing(pageTransitionAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      if (!finished) return;
      if (startAviationTransition) {
        startAviationTransition({
          mode: "journey",
          message: "Preparing for departure...",
          arrivalMessage,
          duration: 2500,
          onBeforeFade: () => {
            pendingNavigationRef.current?.();
            pendingNavigationRef.current = null;
            pageTransitionAnim.setValue(1);
          },
        });
        return;
      }
      setTakeoffVisible(true);
      setTimeout(() => pageTransitionAnim.setValue(1), 80);
    });
  };

  const handleTakeoffDone = () => {
    setTakeoffVisible(false);
    if (pendingNavigationRef.current) {
      pendingNavigationRef.current();
      pendingNavigationRef.current = null;
    }
  };

  const handleLogin = () => {
    navigateWithTransition(() => {
      navigation.navigate("Login", {
        role: "campus",
        timestamp: Date.now(),
        skipArrivalSplash: true,
      });
    }, "Arriving at secure login...");
  };

  const handleContact = () => {
    navigateWithTransition(() => {
      navigation.navigate("Help", {
        fromHome: true,
        timestamp: Date.now(),
      });
    }, "Arriving at help center...");
  };

  const handleVisitorRegister = () => {
    navigateWithTransition(() => {
      navigation.navigate("VisitorRegister", {
        timestamp: Date.now(),
        fromHome: true,
      });
    }, "Arriving at visitor registration...");
  };

  const handleKeyPress = (event, handler) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };

  const animatePress = (toValue) => {
    Animated.spring(buttonPressAnim, {
      toValue,
      friction: 7,
      tension: 90,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const animatePressValue = (animatedValue, toValue) => {
    Animated.spring(animatedValue, {
      toValue,
      friction: 7,
      tension: 92,
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

  const openExternalLink = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      // The Help screen remains available if an external link cannot open.
    }
  };

  const socialLinks = [
    {
      label: "Website",
      icon: "globe-outline",
      onPress: () => openExternalLink("https://sapphireaviationacademy.edu.ph/"),
    },
    {
      label: "Facebook",
      icon: "logo-facebook",
      onPress: () => openExternalLink("https://www.facebook.com/sapphireaviationacademy/"),
    },
    {
      label: "YouTube",
      icon: "logo-youtube",
      onPress: () => openExternalLink("https://www.youtube.com/@sapphireaviation5105"),
    },
  ];

  const entranceStyle = {
    opacity: heroAnim,
    transform: [
      {
        translateY: heroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [26, 0],
        }),
      },
    ],
  };
  const mobileVisitorEntranceStyle = {
    opacity: mobileVisitorAnim,
    transform: [
      {
        translateY: mobileVisitorAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };
  const mobileFeatureEntranceStyle = {
    opacity: mobileFeatureAnim,
    transform: [
      {
        translateY: mobileFeatureAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
    ],
  };
  const desktopFeatureEntranceStyle = {
    opacity: desktopFeatureAnim,
    transform: [
      {
        translateY: desktopFeatureAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  };
  const heroEyebrowRevealStyle = {
    opacity: heroEyebrowAnim,
    transform: [
      {
        translateY: heroEyebrowAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  };
  const heroTitleRevealStyle = {
    opacity: heroTitleAnim,
    transform: [
      {
        translateY: heroTitleAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [34, 0],
        }),
      },
    ],
  };
  const heroBodyRevealStyle = {
    opacity: heroBodyAnim,
    transform: [
      {
        translateY: heroBodyAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  };
  const heroVisualIntroStyle = {
    opacity: heroVisualIntroAnim,
    transform: [
      {
        translateY: heroVisualIntroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [44, 0],
        }),
      },
      {
        scale: heroVisualIntroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.965, 1],
        }),
      },
    ],
  };
  const screenEnterTranslate = screenEnterAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const pageExitTranslate = pageTransitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 0],
  });
  const screenShellMotionStyle = {
    opacity: Animated.multiply(screenEnterAnim, pageTransitionAnim),
    transform: [
      {
        translateY: Animated.add(screenEnterTranslate, pageExitTranslate),
      },
    ],
  };
  const platformScrollRevealStyle = {
    opacity: scrollY.interpolate({
      inputRange: [80, 220],
      outputRange: [0.72, 1],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [80, 260],
          outputRange: [20, 0],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  const footerScrollRevealStyle = {
    opacity: scrollY.interpolate({
      inputRange: [430, 650],
      outputRange: [0.68, 1],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [430, 690],
          outputRange: [22, 0],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  const footerEntranceStyle = {
    opacity: footerAnim,
    transform: [
      {
        translateY: footerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };
  const metricDockMotionStyle = {
    opacity: scrollY.interpolate({
      inputRange: [0, 170],
      outputRange: [1, 0.86],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, 220],
          outputRange: [0, -10],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  const pageMotionStyle = {
    transform: [
      {
        scale: pageTransitionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.992, 1],
        }),
      },
    ],
  };
  const heroScrollStyle = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, 520],
          outputRange: [0, -34],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  const heroVisualScrollTranslate = scrollY.interpolate({
    inputRange: [0, 520],
    outputRange: [0, -54],
    extrapolate: "clamp",
  });
  const schoolFloatTranslate = schoolCardFloatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const heroVisualMotionStyle = {
    opacity: scrollY.interpolate({
      inputRange: [0, 520],
      outputRange: [1, 0.82],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: Animated.add(heroVisualScrollTranslate, schoolFloatTranslate),
      },
      {
        scale: scrollY.interpolate({
          inputRange: [0, 520],
          outputRange: [1, 0.955],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  const mobileHeroScrollStyle = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, 260],
          outputRange: [0, -10],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  const mobileSectionScrollStyle = {
    opacity: scrollY.interpolate({
      inputRange: [40, 180],
      outputRange: [0.82, 1],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [40, 220],
          outputRange: [18, 0],
          extrapolate: "clamp",
        }),
      },
    ],
  };
  const mobileBadgePulseStyle = {
    transform: [
      {
        scale: mobileBadgePulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.025],
        }),
      },
    ],
  };

  const loginButtonMotion = {
    transform: [
      { scale: buttonPressAnim },
      {
        translateY: loginHoverAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  };

  const contactButtonMotion = {
    transform: [
      {
        translateY: contactHoverAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  };
  const visitorLinkMotion = {
    transform: [
      {
        translateY: visitorLinkHoverAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -3],
        }),
      },
      { scale: visitorLinkPressAnim },
    ],
  };

  if (isPhone) {
    return (
      <SafeAreaView style={roleSelectStyles.mobileSafeArea}>
        <StatusBar barStyle="light-content" backgroundColor={brandColors.navy} />
        <Animated.ScrollView
          style={[roleSelectStyles.mobilePage, screenShellMotionStyle]}
          contentContainerStyle={roleSelectStyles.mobileScrollContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: Platform.OS !== "web" },
          )}
        >
          <Animated.View style={[entranceStyle, pageMotionStyle, mobileHeroScrollStyle]}>
            <LinearGradient
              colors={sapphireGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={roleSelectStyles.mobileHero}
            >
            <View style={roleSelectStyles.mobileBrandRow}>
              <Image source={Logo} style={roleSelectStyles.mobileLogo} resizeMode="contain" />
              <View style={roleSelectStyles.mobileBrandCopy}>
                <Text style={roleSelectStyles.mobileSchoolName}>Sapphire International Aviation Academy</Text>
                <Text style={roleSelectStyles.mobilePlatform}>SafePass Smart Campus</Text>
              </View>
            </View>

            <Animated.View style={[roleSelectStyles.mobileHeroBadge, mobileBadgePulseStyle]}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#D8E8FF" />
              <Text style={roleSelectStyles.mobileHeroBadgeText}>Secure campus portal</Text>
            </Animated.View>

            <Text style={roleSelectStyles.mobileTitle}>Smart Campus Access</Text>
            <Text style={roleSelectStyles.mobileSubtitle}>
              One portal for campus ID, attendance, visitor access, and security monitoring.
            </Text>

            <View style={roleSelectStyles.mobileTrustGrid}>
              <View style={roleSelectStyles.mobileTrustPill}>
                <Ionicons name="id-card-outline" size={15} color="#FFFFFF" />
                <Text style={roleSelectStyles.mobileTrustText}>Campus ID</Text>
              </View>
              <View style={roleSelectStyles.mobileTrustPill}>
                <Ionicons name="radio-outline" size={15} color="#FFFFFF" />
                <Text style={roleSelectStyles.mobileTrustText}>NFC Ready</Text>
              </View>
              <View style={roleSelectStyles.mobileTrustPill}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#FFFFFF" />
                <Text style={roleSelectStyles.mobileTrustText}>Secure</Text>
              </View>
            </View>

            <View style={roleSelectStyles.mobileAccessSummary}>
              {accessPreviewItems.map((item) => (
                <View key={item.label} style={roleSelectStyles.mobileAccessSummaryItem}>
                  <Ionicons name={item.icon} size={16} color="#FFFFFF" />
                  <View style={roleSelectStyles.mobileAccessSummaryCopy}>
                    <Text style={roleSelectStyles.mobileAccessSummaryValue}>{item.value}</Text>
                    <Text style={roleSelectStyles.mobileAccessSummaryLabel}>{item.label}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={roleSelectStyles.mobileActionStack}>
              <Animated.View style={{ transform: [{ scale: mobileLoginPressAnim }] }}>
                <TouchableOpacity
                  style={roleSelectStyles.mobilePrimaryButton}
                  onPress={handleLogin}
                  onPressIn={() => animatePressValue(mobileLoginPressAnim, 0.98)}
                  onPressOut={() => animatePressValue(mobileLoginPressAnim, 1)}
                  activeOpacity={0.86}
                >
                  <Ionicons name="log-in-outline" size={18} color={brandColors.blue} />
                  <Text style={roleSelectStyles.mobilePrimaryText}>Login</Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View style={{ transform: [{ scale: mobileContactPressAnim }] }}>
                <TouchableOpacity
                  style={roleSelectStyles.mobileSecondaryButton}
                  onPress={handleContact}
                  onPressIn={() => animatePressValue(mobileContactPressAnim, 0.98)}
                  onPressOut={() => animatePressValue(mobileContactPressAnim, 1)}
                  activeOpacity={0.84}
                >
                  <Ionicons name="chatbubbles-outline" size={18} color="#FFFFFF" />
                  <Text style={roleSelectStyles.mobileSecondaryText}>Contact Help</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
            </LinearGradient>
          </Animated.View>

          <Animated.View style={[roleSelectStyles.mobileSection, mobileFeatureEntranceStyle, mobileSectionScrollStyle]}>
            <Animated.View
              style={[
                roleSelectStyles.mobileVisitorCard,
                mobileVisitorEntranceStyle,
                { transform: [...mobileVisitorEntranceStyle.transform, { scale: mobileVisitorPressAnim }] },
              ]}
            >
              <View style={roleSelectStyles.mobileVisitorIcon}>
                <Ionicons name="person-add-outline" size={19} color={brandColors.blue} />
              </View>
              <View style={roleSelectStyles.mobileVisitorCopy}>
                <Text style={roleSelectStyles.mobileVisitorTitle}>Need visitor access?</Text>
                <Text style={roleSelectStyles.mobileVisitorText}>Create an account before requesting appointments.</Text>
              </View>
              <TouchableOpacity
                style={roleSelectStyles.mobileVisitorButton}
                onPress={handleVisitorRegister}
                onPressIn={() => animatePressValue(mobileVisitorPressAnim, 0.97)}
                onPressOut={() => animatePressValue(mobileVisitorPressAnim, 1)}
                activeOpacity={0.78}
              >
                <Ionicons name="arrow-forward-outline" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>

            <Text style={roleSelectStyles.mobileSectionKicker}>Platform Coverage</Text>
            <Text style={roleSelectStyles.mobileSectionTitle}>Built for every campus role</Text>
            <View style={roleSelectStyles.mobileFeatureList}>
              {platformHighlights.map((item) => (
                <View key={item.title} style={roleSelectStyles.mobileFeatureItem}>
                  <View style={roleSelectStyles.mobileFeatureIcon}>
                    <Ionicons name={item.icon} size={20} color={brandColors.blue} />
                  </View>
                  <View style={roleSelectStyles.mobileFeatureCopy}>
                    <Text style={roleSelectStyles.mobileFeatureTitle}>{item.title}</Text>
                    <Text style={roleSelectStyles.mobileFeatureText}>{item.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[roleSelectStyles.mobileFooter, footerEntranceStyle]}>
            <SocialDock links={socialLinks} />
            <Text style={roleSelectStyles.mobileVersionText}>{WEB_VERSION_LABEL}</Text>
          </Animated.View>
        </Animated.ScrollView>
        {introVisible ? (
          <AviationSplash mode="landing" message="Arriving at campus access..." duration={1500} onDone={() => setIntroVisible(false)} />
        ) : null}
        {takeoffVisible ? (
          <AviationSplash
            mode="journey"
            message="Preparing for departure..."
            arrivalMessage={journeyArrivalMessage}
            duration={2700}
            onDone={handleTakeoffDone}
          />
        ) : null}
        {returnJourneyVisible ? (
          <AviationSplash
            mode="journey"
            message="Departing secure login..."
            arrivalMessage="Arriving at campus access..."
            duration={2700}
            onDone={() => setReturnJourneyVisible(false)}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={roleSelectStyles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={brandColors.navy} />
      <Animated.ScrollView
        style={[roleSelectStyles.page, screenShellMotionStyle]}
        contentContainerStyle={roleSelectStyles.scrollContainer}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: Platform.OS !== "web" },
        )}
      >
        <View style={roleSelectStyles.navShell}>
          <View style={[roleSelectStyles.navBar, isPhone && roleSelectStyles.navBarPhone]}>
            <View style={[roleSelectStyles.navBrand, isPhone && roleSelectStyles.navBrandHidden]}>
              <Image source={Logo} style={roleSelectStyles.navLogo} resizeMode="contain" />
              <View>
                <Text style={roleSelectStyles.navBrandTitle}>Sapphire International Aviation Academy</Text>
                <Text style={roleSelectStyles.navBrandSubtitle}>SafePass Smart Campus</Text>
              </View>
            </View>
            <View style={[roleSelectStyles.navActions, isPhone && roleSelectStyles.navActionsPhone]}>
              <TouchableOpacity
                style={roleSelectStyles.navLink}
                onPress={handleContact}
                activeOpacity={0.75}
              >
                <Text style={roleSelectStyles.navLinkText}>Contact</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={roleSelectStyles.navLoginButton}
                onPress={handleLogin}
                activeOpacity={0.82}
              >
                <Text style={roleSelectStyles.navLoginText}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Animated.View
          style={[
            roleSelectStyles.heroSection,
            isPhone && roleSelectStyles.heroSectionPhone,
            entranceStyle,
            pageMotionStyle,
            heroScrollStyle,
          ]}
        >
          <View style={[roleSelectStyles.heroGrid, !isWide && roleSelectStyles.heroGridStacked]}>
            <View style={[roleSelectStyles.heroCopy, !isWide && roleSelectStyles.heroCopyCentered]}>
              <Animated.Text
                style={[
                  roleSelectStyles.heroEyebrow,
                  !isWide && roleSelectStyles.heroTextCentered,
                  heroEyebrowRevealStyle,
                ]}
              >
                SafePass Smart Campus
              </Animated.Text>
              <Animated.Text
                style={[
                  roleSelectStyles.heroTitle,
                  !isWide && roleSelectStyles.heroTextCentered,
                  heroTitleRevealStyle,
                ]}
              >
                Sapphire International Aviation Academy
              </Animated.Text>
              <Animated.Text
                style={[
                  roleSelectStyles.heroDescription,
                  !isWide && roleSelectStyles.heroTextCentered,
                  heroBodyRevealStyle,
                ]}
              >
                One secure platform for campus ID, attendance, visitor access, staff office presence,
                and security monitoring.
              </Animated.Text>

              <Animated.View
                style={[
                  roleSelectStyles.heroActions,
                  !isWide && roleSelectStyles.heroActionsCentered,
                  isPhone && roleSelectStyles.heroActionsPhone,
                  heroBodyRevealStyle,
                ]}
              >
                <Animated.View style={loginButtonMotion}>
                  <TouchableOpacity
                    style={[roleSelectStyles.primaryButton, isPhone && roleSelectStyles.heroButtonPhone]}
                    onPress={handleLogin}
                    onPressIn={() => animatePress(0.98)}
                    onPressOut={() => animatePress(1)}
                    activeOpacity={0.86}
                    {...(isWeb && {
                      onMouseEnter: () => animateHover(loginHoverAnim, 1),
                      onMouseLeave: () => animateHover(loginHoverAnim, 0),
                      onKeyPress: (event) => handleKeyPress(event, handleLogin),
                      tabIndex: 0,
                    })}
                  >
                    <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                    <Text style={roleSelectStyles.primaryButtonText}>Login</Text>
                  </TouchableOpacity>
                </Animated.View>

                <Animated.View style={contactButtonMotion}>
                  <TouchableOpacity
                    style={[roleSelectStyles.secondaryButton, isPhone && roleSelectStyles.heroButtonPhone]}
                    onPress={handleContact}
                    activeOpacity={0.82}
                    {...(isWeb && {
                      onMouseEnter: () => animateHover(contactHoverAnim, 1),
                      onMouseLeave: () => animateHover(contactHoverAnim, 0),
                      onKeyPress: (event) => handleKeyPress(event, handleContact),
                      tabIndex: 0,
                    })}
                  >
                    <Ionicons name="chatbubbles-outline" size={18} color="#FFFFFF" />
                    <Text style={roleSelectStyles.secondaryButtonText}>Contact Help</Text>
                  </TouchableOpacity>
                </Animated.View>
              </Animated.View>

              <Animated.View style={[heroBodyRevealStyle, visitorLinkMotion]}>
                <TouchableOpacity
                  style={[roleSelectStyles.visitorLink, !isWide && roleSelectStyles.visitorLinkCentered]}
                  onPress={handleVisitorRegister}
                  onPressIn={() => animatePressValue(visitorLinkPressAnim, 0.98)}
                  onPressOut={() => animatePressValue(visitorLinkPressAnim, 1)}
                  activeOpacity={0.78}
                  {...(isWeb && {
                    onMouseEnter: () => animateHover(visitorLinkHoverAnim, 1),
                    onMouseLeave: () => animateHover(visitorLinkHoverAnim, 0),
                    onKeyPress: (event) => handleKeyPress(event, handleVisitorRegister),
                    tabIndex: 0,
                  })}
                >
                  <Ionicons name="person-add-outline" size={16} color="#D8E8FF" />
                  <Text style={roleSelectStyles.visitorLinkText}>Need visitor access? Create an account</Text>
                  <Ionicons name="arrow-forward-outline" size={15} color="#D8E8FF" />
                </TouchableOpacity>
              </Animated.View>
            </View>

            <Animated.View
              style={[
                roleSelectStyles.heroVisual,
                !isWide && roleSelectStyles.heroVisualCentered,
                isPhone && roleSelectStyles.heroVisualPhone,
                heroVisualIntroStyle,
              ]}
            >
              <Animated.View style={[roleSelectStyles.heroVisualStack, heroVisualMotionStyle]}>
                <View style={roleSelectStyles.schoolCard}>
                  <View style={roleSelectStyles.schoolCardTopRow}>
                    <Image source={Logo} style={roleSelectStyles.schoolLogo} resizeMode="contain" />
                    <View style={roleSelectStyles.schoolCardBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={brandColors.success} />
                      <Text style={roleSelectStyles.schoolCardBadgeText}>Preview</Text>
                    </View>
                  </View>
                  <Text style={roleSelectStyles.schoolCardLabel}>Sapphire International Aviation Academy</Text>
                  <Text style={roleSelectStyles.schoolCardTitle}>Explore campus access</Text>
                  <View style={roleSelectStyles.schoolCardDivider} />
                  <View style={roleSelectStyles.statusRow}>
                    <View style={roleSelectStyles.statusDot} />
                    <Text style={roleSelectStyles.statusText}>Illustration of campus features</Text>
                  </View>
                </View>

                <View style={roleSelectStyles.accessPreviewCard}>
                  <View style={roleSelectStyles.accessPreviewHeader}>
                    <Text style={roleSelectStyles.accessPreviewEyebrow}>Campus Access Preview</Text>
                    <Ionicons name="pulse-outline" size={18} color="#D8E8FF" />
                  </View>
                  <View style={roleSelectStyles.accessPreviewGrid}>
                    {accessPreviewItems.map((item) => (
                      <View key={item.label} style={roleSelectStyles.accessPreviewItem}>
                        <View style={[roleSelectStyles.accessPreviewIcon, { backgroundColor: `${item.accent}22` }]}>
                          <Ionicons name={item.icon} size={18} color="#FFFFFF" />
                        </View>
                        <Text style={roleSelectStyles.accessPreviewValue}>{item.value}</Text>
                        <Text style={roleSelectStyles.accessPreviewLabel}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={roleSelectStyles.accessTimeline}>
                    <View style={roleSelectStyles.accessTimelineDot} />
                    <View style={roleSelectStyles.accessTimelineLine} />
                    <View style={roleSelectStyles.accessTimelineDot} />
                    <View style={roleSelectStyles.accessTimelineLine} />
                    <View style={roleSelectStyles.accessTimelineDot} />
                  </View>
                </View>
              </Animated.View>
            </Animated.View>
          </View>

          <Animated.View style={[roleSelectStyles.metricDock, isCompact && roleSelectStyles.metricDockCompact, metricDockMotionStyle]}>
            {metrics.map(([label, value]) => (
              <View key={label} style={roleSelectStyles.metricItem}>
                <Text style={roleSelectStyles.metricValue}>{value}</Text>
                <Text style={roleSelectStyles.metricLabel}>{label}</Text>
              </View>
            ))}
          </Animated.View>
        </Animated.View>

        <Animated.View style={[roleSelectStyles.platformSection, desktopFeatureEntranceStyle, platformScrollRevealStyle]}>
          <Text style={roleSelectStyles.sectionKicker}>Platform Coverage</Text>
          <Text style={roleSelectStyles.sectionTitle}>Built for every campus role</Text>
          <Text style={roleSelectStyles.sectionSubtitle}>
            SafePass opens the right dashboard after login, while this home page keeps the whole
            system easy to understand.
          </Text>

          <View style={roleSelectStyles.featureGrid}>
            {platformHighlights.map((item, index) => {
              const cardScrollTranslate = scrollY.interpolate({
                inputRange: [210 + index * 26, 430 + index * 26],
                outputRange: [46, 0],
                extrapolate: "clamp",
              });
              const cardHoverTranslate = featureHoverAnims[index].interpolate({
                inputRange: [0, 1],
                outputRange: [0, -6],
              });
              const cardMotionStyle = {
                opacity: scrollY.interpolate({
                  inputRange: [180 + index * 22, 360 + index * 22],
                  outputRange: [0, 1],
                  extrapolate: "clamp",
                }),
                transform: [
                  {
                    translateY: Animated.add(cardScrollTranslate, cardHoverTranslate),
                  },
                ],
              };

              return (
              <Animated.View
                key={item.title}
                style={[roleSelectStyles.featureCard, cardMotionStyle]}
                {...(isWeb && {
                  onMouseEnter: () => animateHover(featureHoverAnims[index], 1),
                  onMouseLeave: () => animateHover(featureHoverAnims[index], 0),
                })}
              >
                <View style={roleSelectStyles.featureIcon}>
                  <Ionicons name={item.icon} size={22} color={brandColors.blue} />
                </View>
                <Text style={roleSelectStyles.featureTitle}>{item.title}</Text>
                <Text style={roleSelectStyles.featureText}>{item.description}</Text>
              </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View style={[roleSelectStyles.footerBand, footerEntranceStyle, footerScrollRevealStyle]}>
          <View style={roleSelectStyles.footerCard}>
            <View style={roleSelectStyles.footerTextWrap}>
              <Text style={roleSelectStyles.footerTitle}>Need help getting in?</Text>
              <Text style={roleSelectStyles.footerText}>
                Contact support for login, visitor registration, OTP, or account access questions.
              </Text>
            </View>
            <Animated.View
              style={{
                transform: [
                  { scale: footerButtonPressAnim },
                  {
                    translateY: footerButtonHoverAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -3],
                    }),
                  },
                ],
              }}
            >
              <TouchableOpacity
                style={roleSelectStyles.footerButton}
                onPress={handleContact}
                onPressIn={() => animatePressValue(footerButtonPressAnim, 0.98)}
                onPressOut={() => animatePressValue(footerButtonPressAnim, 1)}
                activeOpacity={0.84}
                {...(isWeb && {
                  onMouseEnter: () => animateHover(footerButtonHoverAnim, 1),
                  onMouseLeave: () => animateHover(footerButtonHoverAnim, 0),
                })}
              >
                <Ionicons name="headset-outline" size={18} color={brandColors.blue} />
                <Text style={roleSelectStyles.footerButtonText}>Open Help</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>

        <View style={roleSelectStyles.socialWrap}>
          <SocialDock links={socialLinks} />
          <Text style={roleSelectStyles.versionText}>{WEB_VERSION_LABEL}</Text>
        </View>
      </Animated.ScrollView>
      {introVisible ? (
        <AviationSplash mode="landing" message="Arriving at campus access..." duration={1500} onDone={() => setIntroVisible(false)} />
      ) : null}
        {takeoffVisible ? (
          <AviationSplash
            mode="journey"
            message="Preparing for departure..."
            arrivalMessage={journeyArrivalMessage}
            duration={2700}
            onDone={handleTakeoffDone}
          />
      ) : null}
      {returnJourneyVisible ? (
        <AviationSplash
          mode="journey"
          message="Departing secure login..."
          arrivalMessage="Arriving at campus access..."
          duration={2700}
          onDone={() => setReturnJourneyVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
