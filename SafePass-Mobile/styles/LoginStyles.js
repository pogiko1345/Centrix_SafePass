import { StyleSheet, Platform, Dimensions } from "react-native";
import { brandColors } from "./brandColors";

const { width } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const isSmallPhone = width <= 375;
const isTablet = width >= 768 && width < 1024;
const shadowColor = brandColors.text;

export default StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: brandColors.background,
  },

  container: {
    flex: 1,
    backgroundColor: brandColors.background,
  },

  scrollContainer: {
    flexGrow: 1,
    paddingBottom: isSmallPhone ? 18 : 28,
  },

  scrollContainerDesktop: {
    flexGrow: 1,
    height: "100%",
    paddingBottom: 0,
    overflow: "hidden",
  },

  desktopScrollLock: {
    height: "100%",
    maxHeight: "100%",
    overflow: "hidden",
  },

  loginDesktopFrame: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: "100%",
    width: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#F8FBFE",
    ...Platform.select({
      web: {
        backgroundImage:
          "linear-gradient(180deg, #F8FBFE 0%, #EEF5FF 48%, #F8FBFE 100%)",
      },
    }),
  },

  header: {
    backgroundColor: brandColors.navy,
    paddingHorizontal: 24,
    paddingTop: Platform.select({
      ios: 52,
      android: 44,
      web: 46,
    }),
    paddingBottom: 62,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: brandColors.navy,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: { elevation: 6 },
      web: {
        backgroundImage: "linear-gradient(135deg, #041E42 0%, #0A3D91 62%, #1C6DD0 100%)",
        boxShadow: "0px 18px 40px rgba(4, 30, 66, 0.22)",
      },
    }),
  },

  headerContent: {
    alignItems: "center",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  brandBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 11,
    marginBottom: isSmallPhone ? 8 : 14,
    ...Platform.select({
      web: { backdropFilter: "blur(10px)" },
    }),
  },

  brandBadgeLogo: {
    width: isSmallPhone ? 24 : 28,
    height: isSmallPhone ? 24 : 28,
    borderRadius: isSmallPhone ? 12 : 14,
    marginRight: 8,
    backgroundColor: brandColors.surface,
  },

  headerGlowOne: {
    position: "absolute",
    top: -26,
    right: -14,
    width: 148,
    height: 148,
    borderRadius: 74,
    display: "none",
  },

  headerGlowTwo: {
    position: "absolute",
    bottom: -52,
    left: -28,
    width: 190,
    height: 190,
    borderRadius: 95,
    display: "none",
  },

  brandBadgeTextWrap: {
    justifyContent: "center",
  },

  brandBadgeEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: isSmallPhone ? 9 : 10,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },

  brandBadgeTitle: {
    color: brandColors.surface,
    fontSize: 13,
    fontWeight: "800",
  },

  logoImage: {
    width: isSmallPhone ? 78 : 92,
    height: isSmallPhone ? 78 : 92,
    borderRadius: isSmallPhone ? 39 : 46,
    marginBottom: isSmallPhone ? 7 : 12,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: brandColors.surface,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
      web: { boxShadow: "0px 6px 18px rgba(4, 30, 66, 0.18)" },
    }),
  },

  appName: {
    color: brandColors.surface,
    fontSize: isSmallPhone ? 18 : isTablet ? 24 : 22,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: isSmallPhone ? 24 : 28,
    marginBottom: 7,
    letterSpacing: 0,
  },

  headerTagline: {
    color: "rgba(255,255,255,0.86)",
    fontSize: isSmallPhone ? 12 : 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 380,
    marginBottom: isSmallPhone ? 6 : 14,
  },

  flightAccent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: isSmallPhone ? 7 : 14,
  },

  flightAccentLine: {
    width: 34,
    height: 1.5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.34)",
  },

  flightAccentDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "rgba(255,255,255,0.78)",
  },

  statusBadge: {
    paddingVertical: isSmallPhone ? 5 : 8,
    paddingHorizontal: isSmallPhone ? 10 : 16,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brandColors.surface,
  },

  statusText: {
    color: "#FFFFFF",
    fontSize: isSmallPhone ? 10 : 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  loginStage: {
    width: "100%",
  },

  loginStageDesktop: {
    maxWidth: 1320,
    flexGrow: 1,
    flexShrink: 0,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    paddingTop: 28,
    paddingBottom: 18,
    position: "relative",
    overflow: "visible",
    backgroundColor: "transparent",
    zIndex: 1,
  },

  desktopLoginDesign: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
    overflow: "hidden",
    opacity: 1,
  },

  desktopSkyWash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(238,245,255,0.36)",
    ...Platform.select({
      web: {
        backgroundImage:
          "radial-gradient(circle at 10% 18%, rgba(183,213,246,0.38), rgba(238,245,255,0) 28%), radial-gradient(circle at 90% 22%, rgba(28,109,208,0.12), rgba(238,245,255,0) 30%), radial-gradient(circle at 50% 92%, rgba(183,213,246,0.24), rgba(238,245,255,0) 24%)",
      },
    }),
  },

  desktopColorWashLeft: {
    position: "absolute",
    left: "5%",
    top: 38,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(183, 213, 246, 0.16)",
    ...Platform.select({
      web: {
        backgroundImage: "radial-gradient(circle, rgba(183,213,246,0.28), rgba(244,248,252,0) 68%)",
      },
    }),
  },

  desktopColorWashRight: {
    position: "absolute",
    right: "4%",
    top: 70,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(28, 109, 208, 0.08)",
    ...Platform.select({
      web: {
        backgroundImage: "radial-gradient(circle, rgba(28,109,208,0.12), rgba(244,248,252,0) 70%)",
      },
    }),
  },

  desktopRunwayGlow: {
    position: "absolute",
    left: "18%",
    right: "18%",
    bottom: 54,
    height: 92,
    borderRadius: 8,
    backgroundColor: "rgba(28,109,208,0.035)",
    ...Platform.select({
      web: {
        backgroundImage:
          "linear-gradient(90deg, rgba(28,109,208,0), rgba(28,109,208,0.12), rgba(28,109,208,0))",
      },
    }),
  },

  desktopFlightPath: {
    position: "absolute",
    top: 92,
    right: "8%",
    width: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    opacity: 0.58,
  },

  desktopFlightPathLine: {
    flex: 1,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(28,109,208,0.14)",
  },

  desktopRunwayMarks: {
    position: "absolute",
    left: "24%",
    right: "24%",
    bottom: 82,
    flexDirection: "row",
    justifyContent: "space-between",
    opacity: 0.22,
  },

  desktopRunwayMark: {
    width: 56,
    height: 3,
    borderRadius: 999,
    backgroundColor: brandColors.blueBorder,
    transform: [{ rotate: "-8deg" }],
  },

  desktopDesignRail: {
    position: "absolute",
    top: 90,
    width: 280,
    gap: 26,
    opacity: 0.42,
  },

  desktopDesignRailLeft: {
    left: 42,
    alignItems: "flex-end",
  },

  desktopDesignRailRight: {
    right: 42,
    alignItems: "flex-start",
  },

  desktopDesignLineLong: {
    width: 260,
    height: 2,
    borderRadius: 999,
    backgroundColor: brandColors.blueBorder,
    transform: [{ rotate: "-12deg" }],
  },

  desktopDesignLineMedium: {
    width: 190,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#D8E8FF",
    transform: [{ rotate: "-12deg" }],
  },

  desktopDesignLineShort: {
    width: 128,
    height: 2,
    borderRadius: 999,
    backgroundColor: brandColors.blueSoft,
    transform: [{ rotate: "-12deg" }],
  },

  loginContentLayout: {
    width: "100%",
    alignItems: "center",
  },

  loginContentLayoutDesktop: {
    maxWidth: 1120,
    minHeight: 620,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: "rgba(216,231,243,0.95)",
    zIndex: 2,
    transform: [],
    ...Platform.select({
      web: {
        transformStyle: "preserve-3d",
        boxShadow:
          "0px 34px 80px rgba(4,30,66,0.18), 0px 14px 34px rgba(28,109,208,0.12), inset 0px 1px 0px rgba(255,255,255,0.9)",
      },
    }),
  },

  loginVisualPanel: {
    flex: 1,
    minWidth: 0,
    padding: 34,
    justifyContent: "space-between",
    backgroundColor: brandColors.navy,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.14)",
    ...Platform.select({
      web: {
        backgroundImage: `linear-gradient(145deg, #041D44 0%, ${brandColors.navy} 44%, #0B4EA2 100%)`,
        boxShadow: "inset -18px 0px 32px rgba(4,30,66,0.18)",
      },
    }),
  },

  loginVisualBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 2,
  },

  loginVisualLogoCard: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    alignItems: "center",
    justifyContent: "center",
  },

  loginVisualLogo: {
    width: 42,
    height: 42,
  },

  loginVisualBrandCopy: {
    flex: 1,
    minWidth: 0,
  },

  loginVisualEyebrow: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0,
  },

  loginVisualTitle: {
    marginTop: 3,
    color: brandColors.surface,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
  },

  loginVisualCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 18,
  },

  loginVisualIntro: {
    marginTop: 28,
    maxWidth: 420,
    zIndex: 2,
  },

  loginVisualHeading: {
    color: brandColors.surface,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: 0,
  },

  loginVisualSubtitle: {
    marginTop: 10,
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },

  loginVisualStatusBadge: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
  },

  loginVisualContactCard: {
    width: "100%",
    marginTop: 24,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(216,232,255,0.24)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },

  loginVisualContactDetails: {
    flex: 1,
    minWidth: 0,
  },

  loginVisualMetaText: {
    color: "rgba(216,232,255,0.78)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },

  loginVisualContactTitle: {
    color: brandColors.surface,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    marginTop: 6,
    marginBottom: 4,
  },

  loginVisualContactLine: {
    color: "#D8E8FF",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },

  loginVisualCopyright: {
    color: "rgba(216,232,255,0.68)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    marginTop: 6,
  },

  loginVisualSocialDock: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  loginVisualFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    zIndex: 2,
  },

  loginVisualFooterText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
    fontWeight: "700",
  },

  mobileCharacterDock: {
    width: "100%",
    alignItems: "center",
    marginTop: -14,
    marginBottom: isSmallPhone ? 8 : 12,
    zIndex: 1,
  },

  characterScene: {
    width: 430,
    height: 310,
    position: "relative",
  },

  characterSceneCompact: {
    width: 220,
    height: 86,
    overflow: "hidden",
  },

  characterBlock: {
    position: "absolute",
    bottom: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },

  characterBlueTall: {
    left: 70,
    width: 142,
    height: 286,
    backgroundColor: brandColors.blue,
  },

  characterBlueTallCompact: {
    left: 36,
    width: 72,
    height: 78,
  },

  characterPilotCap: {
    position: "absolute",
    top: -15,
    left: 32,
    width: 78,
    height: 23,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    backgroundColor: brandColors.surface,
    borderWidth: 2,
    borderColor: "#D8E8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  characterPilotCapCompact: {
    top: -8,
    left: 16,
    width: 39,
    height: 12,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1,
  },

  characterPilotCapBadge: {
    width: 22,
    height: 5,
    borderRadius: 999,
    backgroundColor: brandColors.gold,
  },

  characterPilotCapBadgeCompact: {
    width: 11,
    height: 3,
  },

  characterHeadsetBand: {
    position: "absolute",
    top: 19,
    left: 27,
    width: 88,
    height: 52,
    borderTopWidth: 4,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: "#D8E8FF",
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    opacity: 0.92,
  },

  characterHeadsetBandCompact: {
    top: 6,
    left: 14,
    width: 44,
    height: 28,
    borderTopWidth: 2,
  },

  characterHeadsetCup: {
    position: "absolute",
    top: 52,
    width: 14,
    height: 26,
    borderRadius: 7,
    backgroundColor: brandColors.navy,
    borderWidth: 2,
    borderColor: "#D8E8FF",
  },

  characterHeadsetCupLeft: {
    left: 21,
  },

  characterHeadsetCupRight: {
    right: 21,
  },

  characterHeadsetCupCompact: {
    top: 22,
    width: 7,
    height: 13,
    borderRadius: 4,
    borderWidth: 1,
  },

  characterHeadsetCupLeftCompact: {
    left: 10,
  },

  characterHeadsetCupRightCompact: {
    right: 10,
  },

  characterNavyMid: {
    left: 205,
    width: 96,
    height: 218,
    backgroundColor: "#061A2E",
  },

  characterNavyMidCompact: {
    left: 102,
    width: 48,
    height: 60,
  },

  characterShieldBadge: {
    position: "absolute",
    top: 96,
    left: 15,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(28,109,208,0.96)",
    borderWidth: 2,
    borderColor: "#D8E8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  characterShieldBadgeCompact: {
    top: 29,
    left: 7,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 1,
  },

  characterSkyRound: {
    left: 12,
    width: 184,
    height: 142,
    borderTopLeftRadius: 92,
    borderTopRightRadius: 92,
    backgroundColor: brandColors.sky,
  },

  characterSkyRoundCompact: {
    left: 2,
    width: 92,
    height: 42,
    borderTopLeftRadius: 46,
    borderTopRightRadius: 46,
  },

  characterGoldRound: {
    left: 282,
    width: 112,
    height: 166,
    borderTopLeftRadius: 56,
    borderTopRightRadius: 56,
    backgroundColor: brandColors.gold,
  },

  characterGoldRoundCompact: {
    left: 142,
    width: 58,
    height: 50,
    borderTopLeftRadius: 29,
    borderTopRightRadius: 29,
  },

  characterVisitorBadge: {
    position: "absolute",
    top: 112,
    left: 14,
    width: 48,
    height: 30,
    borderRadius: 8,
    backgroundColor: brandColors.surface,
    borderWidth: 2,
    borderColor: "rgba(4,30,66,0.18)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  characterVisitorBadgeCompact: {
    top: 35,
    left: 7,
    width: 25,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    gap: 2,
  },

  characterVisitorBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: brandColors.blue,
  },

  characterVisitorBadgeDotCompact: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  characterVisitorBadgeLine: {
    width: 26,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#94A3B8",
  },

  characterVisitorBadgeLineCompact: {
    width: 14,
    height: 2,
  },

  characterEyesRow: {
    position: "absolute",
    top: 42,
    left: 42,
    flexDirection: "row",
    gap: 22,
  },

  characterEyesRowCompact: {
    top: 15,
    left: 21,
    gap: 10,
  },

  characterEyesRowSmall: {
    position: "absolute",
    top: 34,
    left: 24,
    flexDirection: "row",
    gap: 16,
  },

  characterEyesRowSmallCompact: {
    top: 12,
    left: 10,
    gap: 8,
  },

  characterEye: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: brandColors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  characterEyeSmall: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: brandColors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  characterEyeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#061A2E",
  },

  characterEyeDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brandColors.text,
  },

  characterPupilRow: {
    position: "absolute",
    top: 66,
    left: 68,
    flexDirection: "row",
    gap: 24,
  },

  characterPupilRowCompact: {
    top: 18,
    left: 30,
    gap: 12,
  },

  characterPupilRowGold: {
    position: "absolute",
    top: 42,
    left: 34,
    flexDirection: "row",
    gap: 20,
  },

  characterPupilRowGoldCompact: {
    top: 14,
    left: 16,
    gap: 10,
  },

  characterPupil: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: brandColors.text,
  },

  characterMouth: {
    position: "absolute",
    top: 88,
    left: 28,
    width: 58,
    height: 4,
    borderRadius: 999,
    backgroundColor: brandColors.text,
  },

  characterMouthCompact: {
    top: 28,
    left: 14,
    width: 30,
    height: 3,
  },

  card: {
    backgroundColor: "#FFFFFF",
    marginTop: -32,
    marginHorizontal: isSmallPhone ? 16 : 20,
    padding: isSmallPhone ? 16 : 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: brandColors.border,
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: { elevation: 5 },
      web: { boxShadow: "0px 14px 32px rgba(15, 23, 42, 0.08)" },
    }),
    ...(isWeb && {
      maxWidth: 520,
      alignSelf: "center",
      width: "100%",
    }),
  },

  cardDesktopSplit: {
    flex: 0.92,
    marginTop: 0,
    marginHorizontal: 0,
    borderWidth: 0,
    borderRadius: 0,
    alignSelf: "stretch",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    ...Platform.select({
      web: {
        maxWidth: 500,
        boxShadow: "inset 18px 0px 32px rgba(15,23,42,0.035)",
      },
    }),
  },

  backToRoleButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: isSmallPhone ? 12 : 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: brandColors.surfaceSoft,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: brandColors.border,
    ...(isWeb && { cursor: "pointer" }),
  },

  backToRoleText: {
    fontSize: 14,
    fontWeight: "600",
    color: brandColors.blue,
  },

  roleHero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: brandColors.surfaceSoft,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: brandColors.border,
    marginBottom: 18,
  },

  roleIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  roleHeroText: {
    flex: 1,
  },

  roleEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: brandColors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
  },

  rolePanel: {
    fontSize: 16,
    fontWeight: "700",
    color: brandColors.text,
  },

  welcomeTitle: {
    fontSize: isSmallPhone ? 24 : 28,
    fontWeight: "800",
    color: brandColors.text,
    textAlign: "center",
    marginBottom: isSmallPhone ? 4 : 6,
    letterSpacing: 0,
  },

  welcomeSubtitle: {
    fontSize: isSmallPhone ? 14 : 15,
    color: brandColors.textMuted,
    textAlign: "center",
    marginBottom: isSmallPhone ? 14 : 18,
    lineHeight: 21,
  },

  roleDetectedPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: brandColors.blueSoft,
    borderWidth: 1,
    borderColor: brandColors.blueBorder,
    marginBottom: 18,
  },

  roleDetectedText: {
    fontSize: 12,
    fontWeight: "800",
    color: brandColors.blue,
  },

  inputBox: {
    marginBottom: isSmallPhone ? 13 : 20,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    color: brandColors.text,
    marginBottom: 7,
    marginLeft: 4,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: brandColors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: Platform.select({
      ios: 14,
      android: 10,
      web: 12,
    }),
    backgroundColor: brandColors.surfaceSoft,
    gap: 12,
    ...(isWeb && {
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      outlineStyle: "none",
      outlineWidth: 0,
    }),
  },

  input: {
    flex: 1,
    fontSize: 16,
    color: brandColors.text,
    padding: 0,
    ...(isWeb && {
      outlineStyle: "none",
      outlineWidth: 0,
    }),
  },

  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },

  errorText: {
    color: "#DC2626",
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: "600",
  },

  loginAlert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: -6,
    marginBottom: isSmallPhone ? 14 : 18,
  },

  loginAlertText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },

  helperText: {
    fontSize: isSmallPhone ? 11 : 12,
    color: brandColors.textMuted,
    marginTop: 5,
    marginLeft: 4,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: isSmallPhone ? 18 : 24,
  },

  rememberBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexShrink: 1,
    ...(isWeb && { cursor: "pointer" }),
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: brandColors.surface,
  },

  checkboxChecked: {
    backgroundColor: brandColors.blue,
    borderColor: brandColors.blue,
  },

  rememberText: {
    fontSize: 14,
    color: brandColors.text,
    fontWeight: "600",
  },

  trustDeviceCopy: {
    flexShrink: 1,
  },

  trustDeviceHint: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: brandColors.textMuted,
    fontWeight: "500",
    maxWidth: 240,
  },

  forgotText: {
    fontSize: 14,
    color: brandColors.blue,
    fontWeight: "700",
  },

  biometricLoginButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: brandColors.blueBorder,
    backgroundColor: brandColors.blueSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
  },

  biometricLoginText: {
    fontSize: 14,
    fontWeight: "800",
    color: brandColors.blue,
  },

  loginButton: {
    backgroundColor: brandColors.blue,
    paddingVertical: isSmallPhone ? 14 : 16,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: isSmallPhone ? 12 : 16,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "transform 0.2s ease, background-color 0.2s ease",
      },
    }),
  },

  loginButtonText: {
    color: brandColors.surface,
    fontSize: isSmallPhone ? 15 : 16,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  loginButtonBusyIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  buttonDisabled: {
    backgroundColor: "#94A3B8",
    opacity: 0.9,
  },

  twoFactorInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: brandColors.blueSoft,
    borderRadius: 8,
    gap: 8,
    marginBottom: isSmallPhone ? 12 : 16,
    borderWidth: 1,
    borderColor: brandColors.blueBorder,
  },

  twoFactorText: {
    fontSize: 13,
    color: brandColors.blue,
    fontWeight: "600",
  },

  visitorAccessCard: {
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: brandColors.blueBorder,
    backgroundColor: brandColors.surfaceSoft,
    paddingHorizontal: isSmallPhone ? 13 : 16,
    paddingVertical: isSmallPhone ? 13 : 16,
  },

  visitorAccessHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },

  visitorAccessIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: brandColors.blueSoft,
    borderWidth: 1,
    borderColor: brandColors.blueBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  visitorAccessCopy: {
    flex: 1,
    minWidth: 0,
  },

  visitorAccessTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: brandColors.text,
    marginBottom: 3,
  },

  visitorAccessText: {
    fontSize: 12,
    lineHeight: 18,
    color: brandColors.textMuted,
    fontWeight: "600",
  },

  visitorAccessButton: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: brandColors.blueBorder,
    backgroundColor: brandColors.blueSoft,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...(isWeb && { cursor: "pointer" }),
  },

  visitorAccessButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: brandColors.blue,
  },

  visitorOtpPanel: {
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#D8E8FF",
    borderRadius: 10,
    padding: 12,
    marginTop: -4,
    marginBottom: 18,
  },

  visitorOtpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  visitorOtpIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#EEF5FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D8E8FF",
  },

  visitorOtpHeaderCopy: {
    flex: 1,
  },

  visitorOtpTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },

  visitorOtpSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  visitorOtpInputContainer: {
    paddingVertical: Platform.select({ ios: 11, android: 9, web: 9 }),
    marginBottom: 2,
  },

  visitorOtpInput: {
    textAlign: "center",
    letterSpacing: 3,
    fontWeight: "800",
  },

  visitorOtpHint: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 6,
    lineHeight: 16,
  },

  visitorOtpActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  visitorOtpSecondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B7D5F6",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  visitorOtpSecondaryText: {
    color: "#0A3D91",
    fontSize: 12,
    fontWeight: "800",
  },

  visitorOtpPrimaryButton: {
    flex: 1.2,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#0A3D91",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  visitorOtpPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  visitorOtpDisabledButton: {
    opacity: 0.62,
  },

  verificationHeader: {
    alignItems: "center",
    marginBottom: 24,
  },

  verificationTitle: {
    fontSize: isSmallPhone ? 20 : 22,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0,
  },

  verificationSubtitle: {
    fontSize: isSmallPhone ? 13 : 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },

  methodContainer: {
    marginBottom: 24,
  },

  methodLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
    marginLeft: 4,
  },

  methodButtons: {
    flexDirection: "row",
    gap: 12,
  },

  methodButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },

  methodButtonActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },

  methodButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },

  methodButtonTextActive: {
    color: "#FFFFFF",
  },

  otpButton: {
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },

  otpButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },

  backLinkText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },

  infoBox: {
    marginTop: 16,
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },

  infoText: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },

  footer: {
    alignItems: "center",
    paddingVertical: 22,
  },

  footerText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.3,
  },

  footerContactCard: {
    marginTop: 14,
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E6EDF7",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 10px 22px rgba(15, 23, 42, 0.05)" },
    }),
  },

  footerContactTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 6,
  },

  footerContactLine: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },

  footerLinkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },

  footerLinkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F4F7FB",
    borderWidth: 1,
    borderColor: "#E5EDF6",
    ...(isWeb && { cursor: "pointer" }),
  },

  footerLinkText: {
    fontSize: 12,
    color: "#0A3D91",
    fontWeight: "700",
  },

  footerCopyright: {
    marginTop: 12,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
    textAlign: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(4, 30, 66, 0.42)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },

  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    width: "100%",
    maxWidth: 520,
    flexShrink: 1,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: "#E6EDF7",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 16px 36px rgba(15, 23, 42, 0.14)" },
    }),
  },

  modalHero: {
    backgroundColor: "#041E42",
    paddingHorizontal: isSmallPhone ? 18 : 24,
    paddingTop: isSmallPhone ? 18 : 22,
    paddingBottom: isSmallPhone ? 18 : 22,
  },

  modalHeroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },

  modalBrandBadge: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  modalBrandBadgeLogo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
    backgroundColor: "#FFFFFF",
  },

  modalBrandBadgeTextWrap: {
    justifyContent: "center",
    flex: 1,
  },

  modalBrandBadgeEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  modalBrandBadgeTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  modalHeroContent: {
    alignItems: "center",
  },

  modalHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  modalTitle: {
    fontSize: isSmallPhone ? 20 : 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
  },

  modalSubtitle: {
    fontSize: isSmallPhone ? 13 : 14,
    color: "rgba(255,255,255,0.82)",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },

  modalStepRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    width: "100%",
  },

  modalStepChip: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  modalStepChipActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },

  modalStepChipComplete: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  modalStepChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.76)",
  },

  modalStepChipTextActive: {
    color: "#041E42",
  },

  modalBody: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 1,
  },
  modalCompactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  modalCompactTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#041E42",
  },

  modalBodyContent: {
    padding: isSmallPhone ? 18 : 24,
    paddingBottom: isSmallPhone ? 24 : 28,
    flexGrow: 1,
  },

  modalInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "#D8E8FF",
    backgroundColor: "#F8FBFE",
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
  },

  modalInfoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
    fontWeight: "600",
  },

  modalPhone: {
    fontSize: isSmallPhone ? 16 : 18,
    fontWeight: "800",
    color: "#0A3D91",
    marginBottom: 20,
    textAlign: "center",
    flexWrap: "wrap",
  },

  otpInputContainer: {
    width: "100%",
    marginBottom: 20,
  },

  otpInput: {
    width: "100%",
    height: isSmallPhone ? 56 : 64,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: isSmallPhone ? 24 : 28,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    letterSpacing: isSmallPhone ? 4 : 8,
    backgroundColor: "#F9FAFB",
  },

  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 8,
  },

  timerText: {
    fontSize: 14,
    color: "#64748B",
  },

  otpButtons: {
    width: "100%",
  },

  otpVerifyButton: {
    backgroundColor: "#0A3D91",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },

  otpVerifyText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  otpResendButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#F3F7FB",
    borderWidth: 1,
    borderColor: "#E5EAF3",
  },

  otpResendText: {
    color: "#64748B",
    fontSize: 15,
    fontWeight: "700",
  },

  passwordRequirements: {
    backgroundColor: "#F8FBFE",
    padding: isSmallPhone ? 16 : 18,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5EAF3",
    width: "100%",
  },

  requirementsTitle: {
    fontSize: isSmallPhone ? 14 : 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 14,
  },

  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },

  requirementText: {
    fontSize: isSmallPhone ? 12 : 13,
    color: "#64748B",
  },

  requirementMet: {
    color: "#10B981",
    textDecorationLine: "line-through",
  },

  passwordStrengthContainer: {
    marginTop: 10,
    marginBottom: 16,
    width: "100%",
  },

  passwordStrengthBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
    backgroundColor: "#E5E7EB",
  },

  passwordStrengthSegment: {
    flex: 1,
    marginHorizontal: 1,
  },

  passwordStrengthText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },

  passwordMatchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
    gap: 8,
  },

  passwordMatchText: {
    fontSize: isSmallPhone ? 12 : 13,
    fontWeight: "600",
  },

  loginErrorText: {
    color: "#B91C1C",
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: "600",
    backgroundColor: "#FEF2F2",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  loginSuccessText: {
    color: "#166534",
    fontSize: 13,
    marginTop: -8,
    marginBottom: 16,
    fontWeight: "700",
    backgroundColor: "#F0FDF4",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },

  demoHelper: {
    backgroundColor: "#F0F9FF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },

  demoHelperText: {
    fontSize: 13,
    color: "#0369A1",
    marginBottom: 8,
    textAlign: "center",
  },

  demoButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0A3D91",
    alignItems: "center",
  },

  demoButtonText: {
    fontSize: 13,
    color: "#0A3D91",
    fontWeight: "700",
  },
});
