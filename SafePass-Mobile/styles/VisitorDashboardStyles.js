import { StyleSheet, Platform, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export default StyleSheet.create({
  // ============ CONTAINERS ============
  safeArea: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FBFE",
  },

  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#64748B",
    fontWeight: "500",
  },

  loadingSubtext: {
    marginTop: 6,
    paddingHorizontal: 24,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
  },

  mainScrollView: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },

  scrollContent: {
    flexGrow: 1,
    paddingTop: 14,
    paddingBottom: 164,
  },

  visitorPushNotice: {
    position: "absolute",
    top: Platform.select({ ios: 58, android: 34, web: 18 }),
    left: width <= 390 ? 14 : 20,
    right: width <= 390 ? 14 : 20,
    maxWidth: 520,
    alignSelf: "center",
    zIndex: 40,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8E6F5",
    padding: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 14px 30px rgba(15,23,42,0.14)" },
    }),
  },

  visitorPushNoticeSuccess: {
    borderColor: "#B7D5F6",
    backgroundColor: "#F8FBFE",
  },

  visitorPushNoticeWarning: {
    borderColor: "#FED7AA",
    backgroundColor: "#FFFBF5",
  },

  visitorPushNoticeError: {
    borderColor: "#FECACA",
    backgroundColor: "#FFF7F7",
  },

  visitorPushNoticeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },

  visitorPushNoticeCopy: {
    flex: 1,
    gap: 2,
  },

  visitorPushNoticeTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },

  visitorPushNoticeText: {
    fontSize: 11.5,
    lineHeight: 17,
    color: "#475569",
    fontWeight: "600",
  },

  visitorPushNoticeTime: {
    marginTop: 3,
    fontSize: 10.5,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  visitorAlertModalContent: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "86%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: width <= 390 ? 18 : 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
      },
      android: { elevation: 14 },
      web: { boxShadow: "0px 24px 54px rgba(15,23,42,0.18)" },
    }),
  },

  visitorAlertIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
    marginBottom: 14,
  },

  visitorAlertTextBlock: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: width <= 390 ? 2 : 6,
  },

  visitorAlertIconSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },

  visitorAlertIconError: {
    backgroundColor: "#FFF7F7",
    borderColor: "#FECACA",
  },

  visitorAlertIconWarning: {
    backgroundColor: "#FFFBF5",
    borderColor: "#FED7AA",
  },

  visitorAlertTitle: {
    fontSize: width <= 390 ? 19 : 21,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },

  visitorAlertMessage: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },

  visitorAlertActionRow: {
    marginTop: 22,
    width: "100%",
    flexDirection: width <= 420 ? "column-reverse" : "row",
    gap: 10,
  },

  visitorAlertButton: {
    flexGrow: width <= 420 ? 0 : 1,
    flexShrink: 0,
    width: width <= 420 ? "100%" : undefined,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  visitorAlertButtonPrimary: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },

  visitorAlertButtonSecondary: {
    backgroundColor: "#F8FBFE",
  },

  visitorAlertButtonDanger: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },

  visitorAlertButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },

  visitorAlertButtonPrimaryText: {
    color: "#FFFFFF",
  },

  visitorAlertButtonSecondaryText: {
    color: "#475569",
  },

  dashboardShell: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingBottom: 26,
  },

  dashboardShellWide: {
    maxWidth: 1200,
  },

  // ============ HEADER ============
  header: {
    paddingHorizontal: width <= 390 ? 16 : 20,
    paddingTop: Platform.select({ ios: width <= 390 ? 26 : 32, android: 14, web: 10 }),
    paddingBottom: width <= 390 ? 8 : 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  headerCompactHome: {
    paddingTop: Platform.select({ ios: 24, android: 12, web: 8 }),
    paddingBottom: 8,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },

  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 2,
  },

  greeting: {
    fontSize: 10,
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  homeBrandRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: width <= 390 ? 8 : 10,
    paddingVertical: width <= 390 ? 4 : 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    marginBottom: 4,
  },

  homeBrandLogoWrap: {
    width: 24,
    height: 24,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  homeBrandLogo: {
    width: 15,
    height: 15,
  },

  homeBrandCopy: {
    gap: 1,
  },

  homeBrandTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },

  homeBrandSubtitle: {
    fontSize: 8.5,
    fontWeight: "700",
    color: "rgba(255,255,255,0.76)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  userName: {
    fontSize: width <= 390 ? 16 : 18,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.7,
  },

  headerSupportText: {
    fontSize: 10,
    lineHeight: 13,
    color: "rgba(255,255,255,0.82)",
    marginTop: 2,
    maxWidth: width <= 390 ? 210 : 250,
  },

  headerSupportTextCompact: {
    maxWidth: 185,
    fontSize: 9.5,
    lineHeight: 12,
  },

  headerActions: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 8,
  },

  miniBrandHeaderWrap: {
    paddingHorizontal: width <= 390 ? 16 : 20,
    paddingTop: Platform.select({ ios: 22, android: 14, web: 10 }),
    paddingBottom: 8,
    backgroundColor: "#F4F7FB",
  },

  miniBrandHeader: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: "#0A3D91",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 18,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 10px 22px rgba(15,23,42,0.05)" },
    }),
  },

  miniBrandIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  miniBrandLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  miniBrandLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },

  miniBrandCopy: {
    justifyContent: "center",
    gap: 1,
  },

  miniBrandTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.2,
  },

  miniBrandTitleOnDark: {
    color: "#FFFFFF",
  },

  miniBrandSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  miniBrandSubtitleOnDark: {
    color: "#DBEAFE",
  },

  miniBrandHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 12,
  },

  miniBrandSectionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  miniBrandSectionPillText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },

  miniBrandProfileButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D7E8FF",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
    overflow: "hidden",
  },

  miniBrandProfileText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0A3D91",
  },

  miniBrandProfileImage: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
  },

  profileButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },

  profileGradient: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  profileInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  profileImage: {
    width: "100%",
    height: "100%",
    borderRadius: 17,
  },

  headerStatsRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 4,
    marginBottom: 3,
  },

  headerStatPill: {
    flex: 1,
    minHeight: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    justifyContent: "center",
  },

  headerStatValue: {
    fontSize: width <= 390 ? 12 : 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  headerStatLabel: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "900",
    color: "rgba(255,255,255,0.68)",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },

  // Status Card in Header
  statusCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  statusValue: {
    fontSize: 12.5,
    fontWeight: "900",
  },

  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  timerText: {
    fontSize: 11,
    fontWeight: "500",
  },

  commandDeckCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 4,
    marginBottom: 8,
    padding: width <= 390 ? 12 : 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8E6F5",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 10px 22px rgba(15,23,42,0.07)" },
    }),
  },

  commandDeckCardInline: {
    marginTop: 4,
  },

  commandDeckCardCompactHome: {
    marginTop: 2,
    marginBottom: 6,
    padding: 12,
    borderRadius: 18,
  },

  commandDeckAnimatedWrap: {
    zIndex: 2,
  },

  commandDeckAccentOrb: {
    position: "absolute",
    top: -40,
    right: -16,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(28, 109, 208, 0.08)",
  },

  commandDeckAccentOrbSecondary: {
    position: "absolute",
    bottom: -44,
    left: -18,
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "rgba(15, 118, 110, 0.08)",
  },

  commandDeckHeader: {
    gap: 5,
    marginBottom: 8,
  },

  commandDeckHeaderWide: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  commandDeckTitleWrap: {
    gap: 4,
    flex: 1,
    maxWidth: 620,
  },

  commandDeckSectionTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },

  commandDeckSectionTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
  },

  commandDeckEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#0A3D91",
  },

  commandDeckTitle: {
    fontSize: width <= 390 ? 16 : 18,
    fontWeight: "900",
    color: "#0F172A",
    lineHeight: width <= 390 ? 21 : 24,
  },

  commandDeckSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: "#5D6B80",
  },

  commandDeckBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  commandDeckBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  commandDeckBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },

  mobileQuickActionStrip: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 8,
  },

  mobileQuickActionItem: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#E4EDF8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 7,
  },

  mobileQuickActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },

  mobileQuickActionLabel: {
    fontSize: width <= 390 ? 9 : 10,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },

  commandMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 6,
  },

  commandMetricCard: {
    minHeight: 66,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#E4EDF8",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  commandMetricIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E8F2FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },

  commandMetricLabel: {
    fontSize: width <= 390 ? 8 : 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#7C8EA3",
    marginBottom: 3,
    textAlign: "left",
  },

  commandMetricValue: {
    fontSize: width <= 390 ? 10.5 : 11.5,
    lineHeight: 15,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "left",
  },

  phoneTrackingCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  phoneTrackingCardActive: {
    backgroundColor: "#EEF5FF",
    borderColor: "#A7F3D0",
  },

  phoneTrackingCardInactive: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },

  phoneTrackingIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  phoneTrackingCopy: {
    flex: 1,
  },

  phoneTrackingTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 3,
  },

  phoneTrackingText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },

  commandActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },

  commandPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: width <= 390 ? 10 : 12,
    borderRadius: width <= 390 ? 14 : 16,
    backgroundColor: "#0A3D91",
    ...Platform.select({
      ios: {
        shadowColor: "#0A3D91",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 12px 24px rgba(15,118,110,0.18)" },
    }),
  },

  commandPrimaryButtonText: {
    fontSize: width <= 390 ? 12.5 : 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  commandSecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#B7D5F6",
  },

  commandSecondaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#041E42",
  },

  sectionIntroCard: {
    gap: 14,
    backgroundColor: "#FCFEFF",
    marginTop: 0,
    marginBottom: 14,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#E3EDF8",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 14px 28px rgba(15,23,42,0.06)" },
    }),
  },

  sectionIntroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  sectionIntroIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionIntroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },

  sectionIntroBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  sectionIntroCopy: {
    flex: 1,
  },

  sectionIntroEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  sectionIntroTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },

  sectionIntroSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
  },

  sectionIntroHighlightRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  sectionIntroHighlightPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.88)",
  },

  sectionIntroHighlightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  sectionIntroHighlightText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },

  homeDiscoveryShell: {
    marginBottom: 14,
  },

  homeDiscoveryCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    overflow: "hidden",
  },

  homeDiscoverySearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },

  homeDiscoverySearchBar: {
    flex: 1,
    minHeight: 50,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  homeDiscoverySearchText: {
    flex: 1,
    fontSize: 13.5,
    color: "#6B7280",
    fontWeight: "500",
  },

  homeDiscoveryAction: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F6F8EF",
    alignItems: "center",
    justifyContent: "center",
  },

  homeDiscoveryLocationWrap: {
    alignItems: "center",
    marginBottom: 20,
  },

  homeDiscoveryLocationLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.68)",
    marginBottom: 4,
  },

  homeDiscoveryLocationValue: {
    fontSize: width <= 390 ? 20 : 24,
    fontWeight: "900",
    color: "#EAF8F5",
    textAlign: "center",
  },

  homeDiscoveryCategoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },

  homeDiscoveryCategoryItem: {
    minWidth: 72,
    alignItems: "center",
    gap: 8,
    flexGrow: 1,
  },

  homeDiscoveryCategoryCapsule: {
    width: width <= 390 ? 78 : 92,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#041E42",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 10px 20px rgba(4,30,66,0.10)" },
    }),
  },

  homeDiscoveryCategoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },

  homeDiscoveryCategoryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },

  homeSpotlightGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
    marginBottom: 12,
    gap: 8,
  },

  homeSpotlightCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2ECF8",
    padding: 14,
    minHeight: 120,
    justifyContent: "flex-start",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 8px 18px rgba(15,23,42,0.05)" },
    }),
  },

  homeSpotlightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  homeSpotlightCopy: {
    flex: 1,
    justifyContent: "space-between",
    gap: 4,
  },

  homeSpotlightLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#7C8EA3",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },

  homeSpotlightValue: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 6,
  },

  homeSpotlightHelper: {
    fontSize: 11.5,
    lineHeight: 16,
    color: "#64748B",
  },

  // ============ NFC CARD ============
  nfcCard: {
    marginHorizontal: 20,
    marginTop: -25,
    borderRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 8px 24px rgba(0,0,0,0.15)" },
    }),
  },

  nfcCardGradient: {
    padding: 20,
  },

  nfcHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  nfcTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 1,
  },

  nfcSubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },

  nfcChipIcon: {
    backgroundColor: "rgba(255,255,255,0.2)",
    padding: 8,
    borderRadius: 20,
  },

  nfcBody: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  visitorAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },

  visitorInitials: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  visitorInfo: {
    flex: 1,
  },

  visitorName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },

  visitorId: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 6,
  },

  nfcChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  nfcChipText: {
    fontSize: 10,
    color: "#FFD700",
    fontWeight: "600",
  },

  nfcFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 15,
  },

  nfcDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  nfcDetailText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
  },

  // ============ NFC STATUS (ADD THESE) ============
  nfcStatusContainer: {
    marginVertical: 12,
    paddingHorizontal: 8,
  },

  nfcStatusIndicator: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    alignItems: "center",
  },

  nfcStatusSuccess: {
    backgroundColor: "rgba(16,185,129,0.3)",
  },

  nfcStatusError: {
    backgroundColor: "rgba(239,68,68,0.3)",
  },

  nfcStatusProcessing: {
    backgroundColor: "rgba(245,158,11,0.3)",
  },

  nfcStatusText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
    textAlign: "center",
  },

  // ============ QUICK ACTIONS ============
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 20,
    gap: 12,
  },

  quickAction: {
    flex: 1,
    alignItems: "center",
  },

  quickActionGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.1)" },
    }),
  },

  quickActionText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },

  // ============ DETAILS CARD ============
  detailsCard: {
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.05)" },
    }),
  },

  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  detailsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
  },

  detailItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },

  detailContent: {
    flex: 1,
  },

  detailLabel: {
    fontSize: 11,
    color: "#94A3B8",
    marginBottom: 2,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  detailValue: {
    fontSize: 14,
    color: "#1E293B",
    fontWeight: "500",
  },

  // ============ HISTORY ITEM ============
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },

  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  historyInfo: {
    flex: 1,
  },

  historyLocation: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },

  historyTime: {
    fontSize: 11,
    color: "#94A3B8",
  },

  historyStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  historyStatusText: {
    fontSize: 10,
    fontWeight: "600",
  },

  // ============ NFC INSTRUCTIONS CARD (ADD THIS) ============
  nfcInstructionsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF5FF",
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },

  nfcInstructionsText: {
    flex: 1,
    fontSize: 12,
    color: "#0A3D91",
    lineHeight: 18,
    fontWeight: "500",
  },

  // ============ MAP CARD ============
  mapCard: {
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
      },
      android: { elevation: 5 },
      web: { boxShadow: "0px 14px 30px rgba(15,23,42,0.1)" },
    }),
  },

  mapGradient: {
    padding: 20,
    borderRadius: 24,
  },

  mapContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  mapTextContainer: {
    flex: 1,
    paddingRight: 12,
  },

  mapTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#041E42",
    marginBottom: 4,
  },

  mapSubtitle: {
    fontSize: 13,
    color: "#0A3D91",
    lineHeight: 19,
    marginBottom: 12,
  },

  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  mapButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0A3D91",
  },

  mapIconContainer: {
    width: 60,
    height: 60,
    backgroundColor: "rgba(10, 61, 145, 0.12)",
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },

  // ============ PENDING APPROVAL ============ 
  pendingApprovalCard: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E2ECF8",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 14px 30px rgba(15,23,42,0.08)" },
    }),
  },

  pendingApprovalEyebrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 8,
  },

  pendingApprovalGradient: {
    padding: 22,
  },

  pendingApprovalIconWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 14,
  },

  pendingApprovalTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 8,
  },

  pendingApprovalSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 14,
  },

  pendingApprovalBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 18,
  },

  pendingApprovalBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  pendingApprovalBadgeText: {
    fontSize: 13,
    fontWeight: "900",
  },

  pendingApprovalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },

  pendingApprovalInfoCard: {
    flexGrow: 1,
    flexBasis: width <= 560 ? "100%" : "31%",
    minHeight: 120,
    backgroundColor: "#F8FBFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E3EDF8",
    padding: 16,
    justifyContent: "space-between",
    gap: 10,
  },

  pendingApprovalInfoBox: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },

  pendingApprovalInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  pendingApprovalInfoLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7C8EA3",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  pendingApprovalInfoValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "900",
    color: "#0F172A",
  },

  pendingApprovalPrimaryButton: {
    height: 54,
    borderRadius: 18,
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },

  pendingApprovalPrimaryButtonText: {
    fontSize: 17,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  pendingStepsCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 18,
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.05)" },
    }),
  },

  pendingStepsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 14,
  },

  pendingStepItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },

  pendingStepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
  },

  // ============ APPROVED EXPERIENCE ============
  approvedHeroCard: {
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 22,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 8px 20px rgba(15,23,42,0.10)" },
    }),
  },

  approvedHeroCardCompact: {
    marginTop: 8,
    borderRadius: 22,
  },

  approvedHeroGradient: {
    padding: width <= 390 ? 14 : 18,
  },

  approvedHeroGradientCompact: {
    padding: 14,
  },

  approvedHeroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    marginBottom: 12,
  },

  approvedHeroBadgeText: {
    fontSize: width <= 390 ? 11 : 12,
    fontWeight: "700",
    color: "#0A3D91",
  },

  approvedHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  approvedHeroAvatar: {
    width: width <= 390 ? 48 : 56,
    height: width <= 390 ? 48 : 56,
    borderRadius: width <= 390 ? 24 : 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: width <= 390 ? 12 : 16,
  },

  approvedHeroInitials: {
    fontSize: width <= 390 ? 17 : 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  approvedHeroTextWrap: {
    flex: 1,
  },

  approvedHeroTitle: {
    fontSize: width <= 390 ? 19 : 22,
    fontWeight: "800",
    lineHeight: width <= 390 ? 24 : 27,
    color: "#FFFFFF",
    marginBottom: width <= 390 ? 4 : 6,
  },

  approvedHeroSubtitle: {
    fontSize: width <= 390 ? 11.5 : 12.5,
    lineHeight: width <= 390 ? 16 : 18,
    color: "rgba(255,255,255,0.88)",
  },

  approvedHeroFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 8,
  },

  approvedHeroFactCard: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: width <= 390 ? 10 : 12,
    minWidth: 0,
  },

  approvedHeroFactLabel: {
    fontSize: width <= 390 ? 10 : 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 4,
  },

  approvedHeroFactValue: {
    fontSize: width <= 390 ? 12.5 : 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  approvedActionSection: {
    marginTop: 12,
  },

  approvedSectionHeader: {
    marginBottom: 10,
  },

  approvedSectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },

  approvedSectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 19,
  },

  approvedActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },

  approvedCompactActionsColumn: {
    flex: 1,
    minWidth: width <= 560 ? "100%" : 260,
    gap: 10,
    alignItems: "stretch",
  },

  approvedCompactActionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: width <= 390 ? 12 : 14,
    borderWidth: 1,
    borderColor: "#DDEBFA",
    minHeight: 74,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 6px 14px rgba(15,23,42,0.06)" },
    }),
  },

  approvedCompactActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  approvedCompactActionCopy: {
    flex: 1,
    minWidth: 0,
  },

  approvedCompactActionTitle: {
    fontSize: width <= 390 ? 13.5 : 14.5,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },

  approvedCompactActionText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: "#64748B",
    fontWeight: "600",
  },

  approvedActionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 3px 10px rgba(15,23,42,0.06)" },
    }),
    minWidth: 0,
  },

  approvedActionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },

  approvedActionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },

  approvedActionText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
  },

  approvedVirtualNfcCard: {
    borderRadius: 24,
    overflow: "hidden",
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.11,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 8px 20px rgba(15,23,42,0.11)" },
    }),
  },

  approvedVirtualNfcCardGradient: {
    padding: width <= 390 ? 14 : 16,
    gap: 14,
    minHeight: width <= 390 ? 178 : 196,
    justifyContent: "space-between",
  },

  approvedVirtualNfcHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: width <= 390 ? 12 : 18,
  },

  approvedVirtualNfcCopy: {
    flex: 1,
    minWidth: 0,
  },

  approvedVirtualNfcBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },

  approvedVirtualNfcBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#EEF5FF",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  approvedVirtualNfcTitle: {
    fontSize: width <= 390 ? 18 : 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },

  approvedVirtualNfcSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.84)",
    maxWidth: width <= 390 ? 230 : 260,
  },

  approvedVirtualNfcIconWrap: {
    width: width <= 390 ? 44 : 48,
    height: width <= 390 ? 44 : 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },

  approvedVirtualNfcCardNumberRow: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },

  approvedVirtualNfcCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  approvedVirtualNfcCardNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  approvedVirtualNfcFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  approvedVirtualNfcFooterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  approvedVirtualNfcFooterText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EEF5FF",
  },

  approvedStatusBanner: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EEF5FF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  approvedStatusBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#0A3D91",
  },

  approvedTimelineSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDEBFA",
    padding: width <= 390 ? 14 : 16,
    marginTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 7px 18px rgba(15,23,42,0.05)" },
    }),
  },

  approvedSnapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  approvedSnapshotCard: {
    flexGrow: 1,
    flexBasis: width <= 560 ? "100%" : "30%",
    minWidth: width <= 560 ? "100%" : 160,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  approvedSnapshotLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  approvedSnapshotValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    color: "#0F172A",
  },

  approvedInfoCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 18,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.05)" },
    }),
  },

  approvedGridSectionReset: {
    marginHorizontal: 20,
  },

  approvedInfoList: {
    gap: 14,
  },

  approvedInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  approvedInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#94A3B8",
  },

  approvedInfoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },

  approvedTipsCard: {
    backgroundColor: "#F8FBFE",
    marginHorizontal: 20,
    marginTop: 18,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  approvedTipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },

  approvedTipBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#CCFBF1",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },

  approvedTipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
    fontWeight: "500",
  },

  // ============ LOGOUT BUTTON ============
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 30,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FEE2E2",
    gap: 8,
  },

  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#DC2626",
  },

  // ============ EMPTY STATE ============
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    marginHorizontal: 20,
  },

  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },

  emptyText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },

  registerButton: {
    borderRadius: 14,
    overflow: "hidden",
    width: "100%",
  },

  registerGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },

  registerButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // ============ QR MODAL ============
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.62)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: width <= 390 ? 14 : 20,
    paddingVertical: 24,
  },

  modalContainer: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D8E6F8",
    ...Platform.select({
      android: { elevation: 16 },
      web: { boxShadow: "0px 24px 54px rgba(15,23,42,0.24)" },
    }),
  },
  darkModalContainer: { backgroundColor: "#111827", borderColor: "#334155" },
  modalHeader: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: { flex: 1, fontSize: 19, fontWeight: "900", color: "#0F172A" },
  darkModalTitle: { color: "#F8FAFC" },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  modalContent: { padding: width <= 390 ? 16 : 20, gap: 14 },
  modalFormGroup: { gap: 6 },
  modalFormLabel: { fontSize: 12, fontWeight: "800", color: "#334155" },
  modalFormInput: {
    width: "100%",
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 14,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  modalButtonSecondary: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  darkModalButtonSecondary: { backgroundColor: "#334155" },
  modalButtonPrimary: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A3D91",
  },
  darkModalButtonPrimary: { backgroundColor: "#2563EB" },
  modalButtonText: { fontSize: 13, fontWeight: "900", color: "#FFFFFF" },
  darkModalButtonText: { color: "#FFFFFF" },

  visitorWarningModalContent: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FECACA",
    ...Platform.select({
      ios: {
        shadowColor: "#7F1D1D",
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.24,
        shadowRadius: 28,
      },
      android: { elevation: 18 },
      web: { boxShadow: "0px 24px 54px rgba(127,29,29,0.24)" },
    }),
  },

  visitorWarningModalHeader: {
    paddingHorizontal: width <= 390 ? 18 : 22,
    paddingTop: width <= 390 ? 18 : 22,
    paddingBottom: 22,
  },

  visitorWarningModalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  visitorWarningModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },

  visitorWarningModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  visitorWarningModalEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(255,255,255,0.78)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 7,
  },

  visitorWarningModalTitle: {
    fontSize: width <= 390 ? 22 : 25,
    lineHeight: width <= 390 ? 28 : 31,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0,
    marginBottom: 8,
  },

  visitorWarningModalSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "rgba(255,255,255,0.84)",
    fontWeight: "600",
  },

  visitorWarningModalBody: {
    paddingHorizontal: width <= 390 ? 18 : 22,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 16,
  },

  visitorWarningSeverityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  visitorWarningSeverityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },

  visitorWarningSeverityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DC2626",
  },

  visitorWarningSeverityText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#991B1B",
    letterSpacing: 0.4,
  },

  visitorWarningTimeText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "700",
  },

  visitorWarningMessage: {
    fontSize: 15,
    lineHeight: 23,
    color: "#1E293B",
    fontWeight: "600",
  },

  visitorWarningInfoStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#D8E8FF",
  },

  visitorWarningInfoText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#475569",
    fontWeight: "700",
  },

  visitorWarningModalFooter: {
    paddingHorizontal: width <= 390 ? 18 : 22,
    paddingBottom: 22,
  },

  visitorWarningPrimaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  visitorWarningPrimaryButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  qrModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    width: "100%",
    maxWidth: 360,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE7F3",
  },

  qrModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },

  qrModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  qrContainer: {
    padding: width <= 390 ? 16 : 20,
    alignItems: "center",
  },

  qrPlaceholder: {
    width: 184,
    height: 184,
    backgroundColor: "#F8FBFE",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },

  qrVisitorName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },

  qrVisitorId: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 16,
  },

  qrDivider: {
    width: 60,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginVertical: 16,
  },

  qrDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
  },

  qrDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  qrDetailText: {
    fontSize: 12,
    color: "#475569",
  },

  qrFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },

  qrNote: {
    fontSize: 11,
    color: "#10B981",
    fontWeight: "500",
  },

  virtualNfcModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    width: "100%",
    maxWidth: 660,
    maxHeight: "88%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE7F3",
  },

  virtualNfcModalContentCompact: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "86%",
    borderRadius: 20,
  },

  virtualNfcModalHeader: {
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },

  virtualNfcModalHeaderCompact: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },

  virtualNfcModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },

  virtualNfcModalSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: "rgba(255,255,255,0.82)",
    maxWidth: 280,
  },

  virtualNfcModalScroll: {
    flexGrow: 0,
  },

  virtualNfcModalBody: {
    padding: 16,
    gap: 14,
  },

  virtualNfcModalBodyCompact: {
    padding: 12,
    gap: 10,
  },

  virtualNfcDisplayRow: {
    alignItems: "center",
  },

  virtualNfcDisplayRowCompact: {
    alignItems: "stretch",
  },

  virtualNfcPreviewCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 18px 42px rgba(15,23,42,0.18)" },
    }),
  },

  virtualNfcPreviewCardCompact: {
    maxWidth: "100%",
    borderRadius: 22,
  },

  virtualNfcCardGradient: {
    padding: width <= 390 ? 14 : 22,
    gap: width <= 390 ? 12 : 18,
  },

  virtualNfcCardTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  virtualNfcCardIdentity: {
    gap: 6,
  },

  virtualNfcPreviewTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },

  virtualNfcPreviewBrand: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.3,
    marginBottom: 2,
  },

  virtualNfcPreviewSchool: {
    fontSize: width <= 390 ? 10.5 : 12,
    lineHeight: width <= 390 ? 15 : 18,
    color: "rgba(255,255,255,0.72)",
    maxWidth: width <= 390 ? 180 : 220,
  },

  virtualNfcPreviewLabel: {
    fontSize: width <= 390 ? 9.5 : 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 4,
  },

  virtualNfcPreviewName: {
    fontSize: width <= 390 ? 18 : 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  virtualNfcPreviewChip: {
    width: width <= 390 ? 36 : 44,
    height: width <= 390 ? 36 : 44,
    borderRadius: width <= 390 ? 12 : 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(59,130,246,0.22)",
  },

  virtualNfcIdBand: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: width <= 390 ? 14 : 18,
    paddingHorizontal: width <= 390 ? 12 : 16,
    paddingVertical: width <= 390 ? 11 : 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  virtualNfcPreviewId: {
    fontSize: width <= 390 ? 14.5 : 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  virtualNfcDetailsGrid: {
    flexDirection: "row",
    gap: width <= 390 ? 8 : 12,
    flexWrap: "wrap",
  },

  virtualNfcDetailCard: {
    flex: width <= 390 ? undefined : 1,
    width: width <= 390 ? "100%" : undefined,
    minWidth: width <= 390 ? 0 : 130,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: width <= 390 ? 13 : 16,
    padding: width <= 390 ? 10 : 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  virtualNfcDetailCardWide: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: width <= 390 ? 13 : 16,
    padding: width <= 390 ? 10 : 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  virtualNfcPreviewMetaLabel: {
    fontSize: width <= 390 ? 9.5 : 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },

  virtualNfcPreviewMetaValue: {
    fontSize: width <= 390 ? 12.5 : 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  virtualNfcTapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: width <= 390 ? 10 : 12,
    backgroundColor: "#F8FBFE",
    borderRadius: width <= 390 ? 16 : 20,
    padding: width <= 390 ? 12 : 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  virtualNfcTapHintIcon: {
    width: width <= 390 ? 38 : 44,
    height: width <= 390 ? 38 : 44,
    borderRadius: width <= 390 ? 12 : 14,
    backgroundColor: "#FDE68A",
    justifyContent: "center",
    alignItems: "center",
  },

  virtualNfcTapHintCopy: {
    flex: 1,
  },

  virtualNfcTapHintTitle: {
    fontSize: width <= 390 ? 13.5 : 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },

  virtualNfcTapHintText: {
    fontSize: width <= 390 ? 11.5 : 12,
    lineHeight: width <= 390 ? 16 : 18,
    color: "#475569",
  },

  checkoutSummaryCard: {
    backgroundColor: "#FFF7ED",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },

  checkoutSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  checkoutSummaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9A3412",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  checkoutSummaryValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#7C2D12",
  },

  virtualNfcInfoCard: {
    backgroundColor: "#F8FBFE",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  virtualNfcInfoCardCompact: {
    padding: 12,
    borderRadius: 16,
  },

  virtualNfcInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  virtualNfcInfoText: {
    flex: 1,
    fontSize: width <= 390 ? 11.5 : 13,
    lineHeight: width <= 390 ? 17 : 20,
    color: "#334155",
    fontWeight: "500",
  },

  virtualNfcModalFooter: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  virtualNfcModalFooterCompact: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },

  virtualNfcSecondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: width <= 390 ? 11 : 14,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  virtualNfcSecondaryButtonText: {
    fontSize: width <= 390 ? 13 : 15,
    fontWeight: "700",
    color: "#475569",
  },

  virtualNfcPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#041E42",
    paddingVertical: width <= 390 ? 11 : 14,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  checkoutPrimaryButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  virtualNfcPrimaryButtonText: {
    fontSize: width <= 390 ? 13 : 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  accessFlowModalContent: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE7F3",
  },

  accessFlowHero: {
    padding: width <= 390 ? 14 : 18,
    gap: width <= 390 ? 8 : 10,
  },

  accessFlowHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },

  accessFlowHeroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
  },

  accessFlowHeroBadgeDanger: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },

  accessFlowHeroBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  accessFlowHeroBadgeTextDanger: {
    color: "#991B1B",
  },

  accessFlowTitle: {
    fontSize: width <= 390 ? 19 : 21,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  accessFlowSubtitle: {
    fontSize: width <= 390 ? 12.5 : 13,
    lineHeight: width <= 390 ? 18 : 20,
    color: "rgba(255,255,255,0.86)",
  },

  accessFlowScroll: {
    maxHeight: Platform.select({ web: 560, default: 620 }),
  },

  accessFlowBody: {
    padding: width <= 390 ? 12 : 16,
    paddingBottom: width <= 390 ? 14 : 16,
    gap: width <= 390 ? 10 : 14,
  },

  checkInArrivalCard: {
    backgroundColor: "#F8FBFE",
    borderRadius: 20,
    padding: width <= 390 ? 14 : 18,
    gap: width <= 390 ? 12 : 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  checkInArrivalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  checkInArrivalIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  checkInArrivalAvatar: {
    width: width <= 390 ? 46 : 54,
    height: width <= 390 ? 46 : 54,
    borderRadius: width <= 390 ? 23 : 27,
    backgroundColor: "#CCFBF1",
    justifyContent: "center",
    alignItems: "center",
  },

  checkInArrivalInitials: {
    fontSize: width <= 390 ? 15 : 18,
    fontWeight: "800",
    color: "#0A3D91",
  },

  checkInArrivalCopy: {
    flex: 1,
    gap: 3,
  },

  checkInArrivalName: {
    fontSize: width <= 390 ? 16 : 18,
    fontWeight: "800",
    color: "#0F172A",
  },

  checkInArrivalPurpose: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },

  checkInArrivalStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },

  checkInArrivalStatusText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  checkInArrivalMetaGrid: {
    flexDirection: width <= 390 ? "column" : "row",
    flexWrap: "wrap",
    gap: width <= 390 ? 9 : 12,
  },

  checkInArrivalMetaCard: {
    flex: 1,
    minWidth: width <= 390 ? "100%" : 130,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: width <= 390 ? 12 : 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  checkInArrivalMetaCardWide: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: width <= 390 ? 12 : 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  checkInArrivalMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },

  checkInArrivalMetaValue: {
    fontSize: width <= 390 ? 13 : 14,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 20,
  },

  checkInArrivalGuideCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: width <= 390 ? 13 : 16,
    gap: width <= 390 ? 10 : 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  checkInArrivalGuideTitle: {
    fontSize: width <= 390 ? 14.5 : 16,
    fontWeight: "800",
    color: "#0F172A",
  },

  checkInArrivalGuideRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  checkInArrivalGuideIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#CCFBF1",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },

  checkInArrivalGuideText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
    fontWeight: "500",
  },

  accessFlowSummaryCard: {
    backgroundColor: "#F8FBFE",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  accessFlowSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  accessFlowSummaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  accessFlowSummaryValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },

  accessFlowTimelineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  accessFlowTimelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  accessFlowTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1C6DD0",
    marginTop: 5,
  },

  accessFlowTimelineDotDanger: {
    backgroundColor: "#DC2626",
  },

  accessFlowTimelineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
    fontWeight: "500",
  },

  accessFlowFooter: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 2,
  },

  accessFlowSecondaryButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: width <= 390 ? 12 : 14,
    minHeight: 48,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  accessFlowSecondaryButtonText: {
    fontSize: width <= 390 ? 13.5 : 15,
    fontWeight: "700",
    color: "#475569",
  },

  accessFlowLateNoticeButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: width <= 390 ? 12 : 14,
    paddingHorizontal: 16,
    minHeight: 48,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  accessFlowLateNoticeButtonText: {
    flexShrink: 1,
    fontSize: width <= 390 ? 13.5 : 15,
    fontWeight: "800",
    color: "#0A3D91",
    textAlign: "center",
  },

  accessFlowPrimaryButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#041E42",
    paddingVertical: width <= 390 ? 12 : 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  accessFlowDangerButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  accessFlowPrimaryButtonText: {
    flexShrink: 1,
    fontSize: width <= 390 ? 13 : 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  accessFlowSuccessContent: {
    width: "90%",
    maxWidth: 390,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
  },

  accessFlowSuccessIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#EEF5FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  accessFlowSuccessIconWrapDanger: {
    backgroundColor: "#FEF2F2",
  },

  accessFlowSuccessTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 10,
  },

  accessFlowSuccessText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 18,
  },

  checkInSuccessStamp: {
    width: "100%",
    backgroundColor: "#EEF5FF",
    borderRadius: 20,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginBottom: 18,
  },

  checkInSuccessStampHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },

  checkInSuccessStampLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  checkInSuccessStampStatus: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  checkInSuccessStampName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },

  checkInSuccessStampSubtext: {
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
  },

  accessFlowSuccessMetaCard: {
    width: "100%",
    backgroundColor: "#F8FBFE",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 18,
  },

  accessFlowSuccessMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  accessFlowSuccessMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  accessFlowSuccessMetaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },

  virtualNfcSuccessContent: {
    width: "90%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
  },

  virtualNfcSuccessIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#EEF5FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  checkoutSuccessIconWrap: {
    backgroundColor: "#FEF2F2",
  },

  virtualNfcSuccessTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 10,
  },

  virtualNfcSuccessText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 18,
  },

  virtualNfcSuccessMetaCard: {
    width: "100%",
    backgroundColor: "#F8FBFE",
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 18,
  },

  virtualNfcSuccessMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  virtualNfcSuccessMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  virtualNfcSuccessMetaValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },

  adjustedStatusBanner: {
    backgroundColor: "#EEF5FF",
  },

  adjustedStatusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#041E42",
  },

  reappointmentHeroCard: {
    marginHorizontal: 16,
    marginTop: 0,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 10px 28px rgba(15,23,42,0.16)" },
    }),
  },

  reappointmentHeroGradient: {
    padding: 20,
    minHeight: 210,
  },

  reappointmentHeroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    marginBottom: 18,
  },

  reappointmentHeroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0A3D91",
  },

  reappointmentHeroTitle: {
    fontSize: width <= 390 ? 24 : 27,
    fontWeight: "900",
    lineHeight: width <= 390 ? 29 : 32,
    color: "#FFFFFF",
    marginBottom: 8,
  },

  reappointmentHeroText: {
    fontSize: 13.5,
    lineHeight: 21,
    color: "rgba(255,255,255,0.92)",
    marginBottom: 18,
  },

  reappointmentMetaGrid: {
    marginTop: 4,
    gap: 12,
  },

  reappointmentMetaCard: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 14,
  },

  reappointmentMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 4,
  },

  reappointmentMetaValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  reappointmentCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 18,
    padding: 18,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#E1EAF5",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 10px 26px rgba(15,23,42,0.08)" },
    }),
  },

  reappointmentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 18,
  },

  reappointmentCardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },

  reappointmentCardSubtitle: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 19,
  },

  reappointmentPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: "#0A3D91",
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#0A3D91",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 10px 20px rgba(15,118,110,0.18)" },
    }),
  },

  reappointmentPrimaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  reappointmentChecklist: {
    gap: 12,
    paddingTop: 6,
  },

  reappointmentChecklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  reappointmentChecklistText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
  },

  appointmentModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    width: "88%",
    maxWidth: 400,
    maxHeight: "82%",
    overflow: "hidden",
  },

  appointmentModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: width <= 390 ? 14 : 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#DDE7F3",
  },

  appointmentModalHeaderContent: {
    flex: 1,
    gap: 6,
  },

  appointmentModalHeaderCopy: {
    gap: 4,
  },

  appointmentHeaderBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  appointmentModalTitle: {
    fontSize: width <= 390 ? 18 : 20,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },

  appointmentModalSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748B",
  },

  appointmentModalBodyScroll: {
    flexGrow: 0,
  },

  appointmentModalBody: {
    padding: 20,
    gap: 16,
    paddingBottom: 24,
  },

  appointmentScreenShell: {
    gap: width <= 390 ? 14 : 18,
  },

  appointmentScreenCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: width <= 390 ? 20 : 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 14px 34px rgba(15,23,42,0.08)" },
    }),
  },

  appointmentInlineBody: {
    padding: width <= 390 ? 14 : 18,
    gap: width <= 390 ? 12 : 16,
  },

  appointmentRequestInfoPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
  },

  appointmentRequestInfoPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  appointmentLoadingCard: {
    minHeight: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 36,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 14px 34px rgba(15,23,42,0.08)" },
    }),
  },

  appointmentLoadingIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EAF3FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  appointmentLoadingTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },

  appointmentLoadingText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 340,
  },

  appointmentMenuHero: {
    backgroundColor: "#FFFFFF",
    borderRadius: width <= 390 ? 20 : 22,
    padding: width <= 390 ? 16 : 22,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    gap: 16,
  },

  appointmentMenuHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },

  appointmentMenuHeroCopy: {
    flex: 1,
    maxWidth: 520,
  },

  appointmentMenuHeroBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D7E8FF",
  },

  appointmentMenuHeroBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  appointmentSegmentBar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#F1F6FD",
    borderRadius: 18,
    padding: 4,
    gap: 4,
  },

  appointmentSegmentButton: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  appointmentSegmentButtonActive: {
    backgroundColor: "#0A3D91",
  },

  appointmentSegmentText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },

  appointmentSegmentTextActive: {
    color: "#FFFFFF",
  },

  appointmentMenuGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: width <= 390 ? 12 : 16,
  },

  appointmentMenuCard: {
    flexGrow: 1,
    flexBasis: 260,
    backgroundColor: "#FFFFFF",
    borderRadius: width <= 390 ? 18 : 22,
    padding: width <= 390 ? 16 : 20,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    minHeight: width <= 390 ? 190 : 210,
    justifyContent: "space-between",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 22,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 12px 28px rgba(15,23,42,0.06)" },
    }),
  },

  appointmentMenuCardIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#EAF3FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  appointmentMenuCardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },

  appointmentMenuCardText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#64748B",
  },

  appointmentMenuCardChip: {
    alignSelf: "flex-start",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
  },

  appointmentMenuCardChipMuted: {
    backgroundColor: "#EAF3FF",
  },

  appointmentMenuCardChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    letterSpacing: 0.3,
  },

  appointmentMenuCardFooter: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E8EEF6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  appointmentMenuCardFooterText: {
    flex: 1,
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "600",
  },

  appointmentInsightsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    padding: width <= 390 ? 14 : 16,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 7px 18px rgba(15,23,42,0.05)" },
    }),
  },

  appointmentInsightsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },

  appointmentInsightsEyebrow: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#0A3D91",
    marginBottom: 4,
  },

  appointmentInsightsTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },

  appointmentInsightsAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
  },

  appointmentInsightsActionText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0A3D91",
  },

  appointmentInsightsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },

  appointmentInsightsMetricCard: {
    flexGrow: 1,
    flexBasis: 92,
    backgroundColor: "#F8FBFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E6EEF9",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  appointmentInsightsMetricLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#7C8EA3",
    marginBottom: 5,
  },

  appointmentInsightsMetricValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },

  appointmentInsightsStatusCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F8FBFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E6EEF9",
    padding: 14,
  },

  appointmentInsightsStatusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8F2FF",
    justifyContent: "center",
    alignItems: "center",
  },

  appointmentInsightsStatusCopy: {
    flex: 1,
  },

  appointmentInsightsStatusTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },

  appointmentInsightsStatusText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },

  recentActivityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    padding: 18,
    marginTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 10px 24px rgba(15,23,42,0.05)" },
    }),
  },

  recentActivityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 14,
  },

  recentActivityEyebrow: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#0A3D91",
    marginBottom: 4,
  },

  recentActivityTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },

  recentActivityAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  recentActivityActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0A3D91",
  },

  recentActivityList: {
    gap: 12,
  },

  recentActivityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },

  recentActivityStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 2,
  },

  recentActivityCopy: {
    flex: 1,
  },

  recentActivityItemTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 3,
  },

  recentActivityItemMeta: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },

  recentActivityPill: {
    maxWidth: 112,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  recentActivityPillText: {
    fontSize: 11,
    fontWeight: "800",
  },

  appointmentHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    padding: 20,
    paddingBottom: 0,
    flexWrap: "wrap",
  },

  appointmentHistoryHeaderCopy: {
    flex: 1,
    minWidth: 240,
  },

  appointmentHistoryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0A3D91",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },

  appointmentHistoryActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  appointmentHistoryBody: {
    paddingHorizontal: width <= 390 ? 14 : 20,
    paddingBottom: width <= 390 ? 14 : 20,
    gap: 12,
  },
  appointmentHistorySummaryRow: {
    flexDirection: "row",
    gap: 6,
  },
  appointmentHistorySummaryCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#E2EAF4",
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center",
  },
  appointmentHistorySummaryValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  appointmentHistorySummaryLabel: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  appointmentHistoryTable: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  appointmentHistoryTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#DDE7F3",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  appointmentHistoryTableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },
  appointmentHistoryTableDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    backgroundColor: "#F8FBFE",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  appointmentHistoryTableDateText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0A3D91",
  },
  appointmentHistoryTableHeadText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
  },
  appointmentHistoryTableText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F172A",
    paddingRight: 8,
  },
  appointmentHistoryPurposeCell: {
    flex: 1.25,
  },
  appointmentHistoryOfficeCell: {
    flex: 1.1,
  },
  appointmentHistoryDateCell: {
    flex: 1,
  },
  appointmentHistoryTimeCell: {
    flex: 0.85,
  },
  appointmentHistoryStatusCell: {
    flex: 1,
  },
  appointmentHistoryActionCell: {
    flex: 1.05,
  },
  appointmentHistoryStatusPillWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 4,
  },
  appointmentHistoryStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  appointmentHistoryStatusPillText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "800",
  },

  appointmentHistoryCards: {
    gap: 12,
  },

  appointmentHistoryDateGroup: {
    gap: 10,
  },

  appointmentHistoryDateGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 4,
  },

  appointmentHistoryDateGroupTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0A3D91",
  },

  appointmentHistoryCardItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    padding: width <= 390 ? 13 : 16,
    gap: 10,
  },

  appointmentHistoryCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  appointmentHistoryCardCopy: {
    flex: 1,
  },

  appointmentHistoryCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },

  appointmentHistoryCardOffice: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748B",
  },

  appointmentHistoryCardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 124,
  },

  appointmentHistoryCardPillText: {
    fontSize: 11,
    fontWeight: "800",
    flexShrink: 1,
  },

  appointmentHistoryCardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  appointmentHistoryCardMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FBFF",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E6EEF9",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },

  appointmentHistoryCardMetaText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },

  appointmentHistoryCardDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748B",
  },

  appointmentHistoryCheckOutButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  appointmentHistoryCheckOutButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  appointmentManageActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },

  appointmentManageButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
  },

  appointmentManageDangerButton: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },

  appointmentManageButtonDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    opacity: 0.72,
  },

  appointmentManageButtonText: {
    fontSize: 11.5,
    fontWeight: "900",
    color: "#0A3D91",
  },

  appointmentManageDangerText: {
    color: "#DC2626",
  },

  appointmentManageButtonTextDisabled: {
    color: "#94A3B8",
  },

  appointmentHistoryCard: {
    padding: 20,
    borderRadius: 28,
    backgroundColor: "#FEFEFC",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    gap: 16,
  },

  appointmentHistoryTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },

  appointmentHistoryStatusIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  appointmentHistoryCopy: {
    flex: 1,
    gap: 4,
  },

  appointmentHistoryTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },

  appointmentHistoryDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
  },

  appointmentHistoryBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  appointmentHistoryBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  appointmentHistoryMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  appointmentHistoryMetaItem: {
    flexGrow: 1,
    flexBasis: 180,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  appointmentHistoryMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  appointmentHistoryMetaValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },

  appointmentHistoryProgressWrap: {
    gap: 8,
  },

  appointmentHistoryProgressTrack: {
    width: "100%",
    height: 7,
    borderRadius: 999,
    backgroundColor: "#E8EDF3",
    overflow: "hidden",
  },

  appointmentHistoryProgressFill: {
    height: "100%",
    borderRadius: 999,
  },

  appointmentHistoryProgressText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#64748B",
  },

  appointmentHistoryEmpty: {
    minHeight: 260,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 36,
    gap: 10,
  },

  appointmentHistoryEmptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },

  appointmentHistoryEmptyText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 360,
  },

  appointmentField: {
    gap: 8,
  },

  appointmentFormRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    width: "100%",
    zIndex: 2,
  },

  appointmentFormRowStacked: {
    gap: 14,
    width: "100%",
    zIndex: 2,
  },

  appointmentFormColumnWide: {
    flex: 1,
    minWidth: 0,
  },

  appointmentFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#475569",
    textTransform: "uppercase",
  },

  appointmentQuickInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  appointmentQuickInfoCard: {
    flexGrow: 1,
    flexBasis: width <= 390 ? "48%" : 160,
    minWidth: 0,
    backgroundColor: "#F8FBFF",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E2EAF4",
    gap: 5,
  },

  appointmentQuickInfoLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 0,
  },

  appointmentQuickInfoValue: {
    fontSize: width <= 390 ? 11 : 13,
    lineHeight: 16,
    fontWeight: "900",
    color: "#0F172A",
  },

  appointmentStepStrip: {
    gap: 6,
    padding: 9,
    borderRadius: 18,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  appointmentStepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EEF9",
  },

  appointmentStepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0A3D91",
    alignItems: "center",
    justifyContent: "center",
  },

  appointmentStepNumberText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  appointmentStepCopy: {
    flex: 1,
    minWidth: 0,
  },

  appointmentStepTitle: {
    fontSize: 11.5,
    fontWeight: "900",
    color: "#0F172A",
  },

  appointmentStepText: {
    marginTop: 1,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748B",
  },

  mobileSlotPickerCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 14,
  },

  mobileSlotPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  mobileSlotPickerHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: "#64748B",
  },

  mobileDateChipRow: {
    gap: 10,
    paddingVertical: 2,
  },

  mobileDateChip: {
    width: 54,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#F3F8FF",
    borderWidth: 1,
    borderColor: "#E2EAF4",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },

  mobileDateChipSelected: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },

  mobileDateChipMonth: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },

  mobileDateChipDay: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },

  mobileDateChipTextSelected: {
    color: "#FFFFFF",
  },

  mobileCalendarCard: {
    borderRadius: 18,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#E2EAF4",
    padding: 12,
    gap: 10,
  },

  mobileCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  mobileCalendarMonth: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },

  mobileCalendarNav: {
    flexDirection: "row",
    gap: 8,
  },

  mobileCalendarNavButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  mobileWeekdayRow: {
    flexDirection: "row",
  },

  mobileWeekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "900",
    color: "#64748B",
  },

  mobileCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  mobileCalendarDay: {
    width: "14.285%",
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  mobileCalendarDaySelected: {
    backgroundColor: "#0A3D91",
  },

  mobileCalendarDayDisabled: {
    opacity: 0.28,
  },

  mobileCalendarDayText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },

  mobileCalendarDayTextSelected: {
    color: "#FFFFFF",
  },

  mobileCalendarDayTextDisabled: {
    color: "#94A3B8",
  },

  mobileCalendarHolidayDot: {
    position: "absolute",
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DC2626",
  },

  mobileTimeGroupList: {
    gap: 13,
  },

  mobileTimeGroup: {
    gap: 8,
  },

  mobileTimeGroupLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },

  mobileTimeSlotGrid: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },

  mobileTimeSlotButton: {
    width: 108,
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D8E2EE",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  mobileTimeSlotButtonUnavailable: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FDE2E2",
  },

  mobileTimeSlotButtonSelected: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },

  mobileTimeSlotText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },

  mobileTimeSlotTextUnavailable: {
    color: "#9CA3AF",
  },

  mobileTimeSlotTextSelected: {
    color: "#FFFFFF",
  },

  mobileTimeSlotMeta: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    textAlign: "center",
  },

  mobileTimeSlotMetaUnavailable: {
    color: "#9CA3AF",
  },

  mobileTimeSlotMetaSelected: {
    color: "#DBEAFE",
  },

  mobileSlotLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },

  mobileSlotLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  mobileSlotLegendDot: {
    width: 13,
    height: 13,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },

  mobileSlotLegendUnavailable: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },

  mobileSlotLegendSelected: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },

  mobileSlotLegendText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748B",
  },

  mobileSelectedSlotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },

  mobileSelectedSlotLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },

  mobileSelectedSlotValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },

  webDateTimePanel: {
    flexDirection: "row",
    gap: 18,
    borderRadius: 22,
    backgroundColor: "#063D36",
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    ...Platform.select({
      web: { boxShadow: "0px 18px 44px rgba(6,61,54,0.2)" },
    }),
  },

  webCalendarPane: {
    flex: 0.9,
    minWidth: 300,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 16,
  },

  webCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  webCalendarMonth: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  webCalendarNav: {
    flexDirection: "row",
    gap: 8,
  },

  webCalendarNavButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  webWeekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },

  webWeekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    color: "#DBEAFE",
  },

  webCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  webCalendarDay: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },

  webCalendarDaySelected: {
    backgroundColor: "#0EA5E9",
  },

  webCalendarDayDisabled: {
    opacity: 0.32,
  },

  webCalendarDayText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  webCalendarDayTextSelected: {
    color: "#FFFFFF",
  },

  webCalendarDayTextDisabled: {
    color: "#94A3B8",
  },

  webTimePane: {
    flex: 1.15,
    minWidth: 360,
    gap: 16,
  },

  webTimeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  webTimeTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  webTimeSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#A7F3D0",
  },

  webTimeGroups: {
    gap: 14,
  },

  webTimeGroup: {
    gap: 9,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },

  webTimeGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  webTimeGroupTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  webTimeSlotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  webTimeSlotButton: {
    minWidth: 112,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  webTimeSlotButtonUnavailable: {
    backgroundColor: "rgba(254,242,242,0.18)",
    opacity: 0.55,
  },

  webTimeSlotButtonSelected: {
    backgroundColor: "#0EA5E9",
  },

  webTimeSlotText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  webTimeSlotTextUnavailable: {
    color: "#CBD5E1",
  },

  webTimeSlotTextSelected: {
    color: "#FFFFFF",
  },

  webTimeSlotMeta: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "800",
    color: "#A7F3D0",
  },

  webTimeSlotMetaUnavailable: {
    color: "#CBD5E1",
  },

  webTimeSlotMetaSelected: {
    color: "#DBEAFE",
  },

  webSelectedSlotBar: {
    marginTop: "auto",
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  webSelectedSlotLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#A7F3D0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  webSelectedSlotValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  appointmentPickerField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  appointmentPickerFieldLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },

  appointmentPickerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E6F4F1",
    justifyContent: "center",
    alignItems: "center",
  },

  appointmentPickerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  appointmentPickerValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },

  appointmentPickerSubValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "800",
    color: "#0A3D91",
  },

  appointmentPickerSubValueError: {
    color: "#DC2626",
  },

  purposeDropdownMenu: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    overflow: "hidden",
    zIndex: 30,
    ...Platform.select({
      android: { elevation: 6 },
      web: { boxShadow: "0px 12px 28px rgba(15,23,42,0.12)" },
    }),
  },

  pickerDropdownMenu: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    overflow: "hidden",
    zIndex: 30,
    ...Platform.select({
      android: { elevation: 6 },
      web: { boxShadow: "0px 12px 28px rgba(15,23,42,0.12)" },
    }),
  },

  pickerDropdownScroll: {
    maxHeight: 220,
  },

  pickerOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },

  pickerOptionItemActive: {
    backgroundColor: "#EEF5FF",
  },

  pickerOptionItemDisabled: {
    backgroundColor: "#FEF2F2",
    opacity: 0.74,
  },

  pickerOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },

  pickerOptionTextActive: {
    color: "#0A3D91",
  },

  pickerOptionTextDisabled: {
    color: "#991B1B",
  },

  pickerOptionMeta: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  pickerOptionMetaFull: {
    color: "#DC2626",
  },

  purposeOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },

  purposeOptionItemActive: {
    backgroundColor: "#EEF5FF",
  },

  purposeOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },

  purposeOptionTextActive: {
    color: "#0A3D91",
  },

  checkboxOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  appointmentCheckboxBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  appointmentCheckboxBoxChecked: {
    borderColor: "#0A3D91",
    backgroundColor: "#0A3D91",
  },

  appointmentFieldInput: {
    backgroundColor: "#F7FAFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: "#0F172A",
  },

  appointmentFieldTextarea: {
    minHeight: 110,
    paddingTop: 14,
  },

  appointmentReadOnlyField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  appointmentReadOnlyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },

  appointmentAutoHint: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    fontWeight: "600",
    marginTop: -2,
  },

  appointmentAutoHintError: {
    color: "#DC2626",
  },

  appointmentIdUploadCard: {
    minHeight: 160,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderStyle: "dashed",
    backgroundColor: "#F7FAFE",
    overflow: "hidden",
  },

  appointmentIdPreview: {
    width: "100%",
    height: 190,
    resizeMode: "cover",
  },

  appointmentIdPlaceholder: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 6,
  },

  appointmentIdPlaceholderTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },

  appointmentIdPlaceholderText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },

  appointmentChangeIdButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
  },

  appointmentChangeIdText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0A3D91",
  },

  idVerificationCard: {
    marginTop: 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D8E8FF",
    backgroundColor: "#F8FBFE",
    padding: 12,
    gap: 10,
  },

  idVerificationCardPassed: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },

  idVerificationCardFailed: {
    borderColor: "#FECACA",
    backgroundColor: "#FFF7F7",
  },

  idVerificationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  idVerificationIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },

  idVerificationIconPassed: {
    backgroundColor: "#DCFCE7",
  },

  idVerificationCopy: {
    flex: 1,
    minWidth: 0,
  },

  idVerificationTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },

  idVerificationMessage: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: "#475569",
  },

  idVerificationScore: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0A3D91",
  },

  idVerificationAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
  },

  idVerificationActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0A3D91",
  },

  appointmentPrivacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FBFE",
  },

  appointmentPrivacyCardAccepted: {
    borderColor: "#10B981",
    backgroundColor: "#EEF5FF",
  },

  appointmentPrivacyCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },

  appointmentPrivacyCheckboxChecked: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },

  appointmentPrivacyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#334155",
    fontWeight: "700",
  },

  appointmentModalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },

  appointmentManageModal: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.14,
        shadowRadius: 26,
      },
      android: { elevation: 6 },
      web: { boxShadow: "0px 24px 60px rgba(15,23,42,0.16)" },
    }),
  },

  appointmentManageModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 18,
    backgroundColor: "#F8FBFE",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  appointmentManageModalIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D8E8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  appointmentManageModalDangerIcon: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },

  appointmentManageModalCopy: {
    flex: 1,
    minWidth: 0,
  },

  appointmentManageModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },

  appointmentManageModalSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    fontWeight: "600",
  },

  appointmentManageModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  appointmentManageModalBody: {
    padding: 18,
    gap: 14,
  },

  appointmentManageOriginalCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  appointmentManageOriginalLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },

  appointmentManageOriginalValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },

  appointmentManageFieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  appointmentManageField: {
    flexGrow: 1,
    flexBasis: width <= 520 ? "100%" : 220,
    gap: 8,
  },

  appointmentManageTimeList: {
    maxHeight: 180,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  appointmentManageModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  appointmentManageCancelSubmit: {
    backgroundColor: "#DC2626",
  },

  appointmentSecondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  appointmentSecondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },

  appointmentPrimaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#0A3D91",
  },

  appointmentPrimaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  appointmentSuccessCard: {
    backgroundColor: "#EEF5FF",
    marginTop: 18,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },

  appointmentSuccessHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  appointmentSuccessIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EEF5FF",
    justifyContent: "center",
    alignItems: "center",
  },

  appointmentSuccessTextWrap: {
    flex: 1,
  },

  appointmentSuccessTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#041E42",
    marginBottom: 4,
  },

  appointmentSuccessText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#0A3D91",
  },

  appointmentSuccessMetaRow: {
    marginTop: 12,
    gap: 4,
  },

  appointmentSuccessMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#041E42",
  },

  visitorModuleCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 12,
    marginBottom: 14,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E1EAF5",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 10px 20px rgba(15,23,42,0.06)" },
    }),
  },

  visitorModuleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },

  visitorModuleEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  visitorModuleTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
  },

  visitorModuleHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },

  visitorModuleHeaderBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  visitorModuleIntroText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#5B6B80",
    marginBottom: 14,
  },

  visitorAboutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  visitorAboutCard: {
    flexGrow: 1,
    flexBasis: width <= 640 ? "100%" : "31%",
    minWidth: width <= 640 ? "100%" : 220,
    backgroundColor: "#F8FBFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2EAF4",
    padding: 14,
    gap: 8,
  },

  visitorAboutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  visitorAboutTitle: {
    fontSize: 13.5,
    fontWeight: "900",
    color: "#0F172A",
  },

  visitorAboutText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },

  visitorAboutAction: {
    marginTop: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  visitorAboutActionText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  visitorModuleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  visitorModuleButton: {
    flexGrow: 1,
    flexBasis: width <= 540 ? "100%" : "47%",
    minWidth: width <= 540 ? "100%" : 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#F7FAFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  visitorModuleButtonActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },

  visitorModuleIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#EEF5FF",
    alignItems: "center",
    justifyContent: "center",
  },

  visitorModuleIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  visitorModuleCopy: {
    flex: 1,
    gap: 3,
  },

  visitorModuleButtonTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },

  visitorModuleButtonTitleActive: {
    color: "#FFFFFF",
  },

  visitorModuleButtonText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },

  visitorModuleButtonTextActive: {
    color: "rgba(255,255,255,0.82)",
  },

  visitorFlowPanel: {
    backgroundColor: "#FFFFFF",
    marginTop: 0,
    marginBottom: 18,
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DDEBFA",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 22,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 14px 30px rgba(15,23,42,0.06)" },
    }),
  },

  visitorMapPanel: {
    backgroundColor: "#FFFFFF",
    marginTop: 0,
    marginBottom: 18,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DDEBFA",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 22,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 14px 30px rgba(15,23,42,0.06)" },
    }),
  },

  mapSummaryCard: {
    backgroundColor: "#F8FBFE",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DCE4F0",
    padding: 16,
    marginBottom: 16,
  },

  mapSummaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },

  mapSummaryIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#E6F4F1",
    alignItems: "center",
    justifyContent: "center",
  },

  mapSummaryCopy: {
    flex: 1,
  },

  mapSummaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },

  mapSummaryText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },

  mapSummaryMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  mapSummaryMetricCard: {
    flexGrow: 1,
    flexBasis: width <= 520 ? "100%" : "47%",
    minWidth: width <= 520 ? "100%" : 180,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },

  mapSummaryMetricLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },

  mapSummaryMetricValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 20,
  },

  visitorRouteCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFE",
    padding: 16,
    marginBottom: 16,
  },

  visitorRouteHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },

  visitorRouteIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#0A3D91",
    alignItems: "center",
    justifyContent: "center",
  },

  visitorRouteHeaderCopy: {
    flex: 1,
  },

  visitorRouteTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },

  visitorRouteSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748B",
    fontWeight: "600",
  },

  visitorRouteSteps: {
    gap: 10,
  },

  visitorRouteStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  visitorRouteStepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E0ECFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },

  visitorRouteStepIndexText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0A3D91",
  },

  visitorRouteStepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
    fontWeight: "600",
  },

  visitorFlowPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },

  visitorFlowPanelIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    backgroundColor: "#EEF5FF",
    alignItems: "center",
    justifyContent: "center",
  },

  visitorFlowPanelTitleWrap: {
    flex: 1,
  },

  visitorFlowPanelEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  visitorFlowPanelTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 5,
  },

  visitorFlowPanelSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
  },

  visitorFlowChecklist: {
    backgroundColor: "#F8FBFE",
    borderRadius: 18,
    padding: 15,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },

  visitorFlowChecklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  visitorFlowChecklistText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
    fontWeight: "500",
  },

  visitorFlowPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "#0A3D91",
  },

  visitorFlowPrimaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  visitorFlowSecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#D9E4F2",
    marginTop: 14,
  },

  visitorFlowSecondaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#041E42",
  },

  appointmentStatusHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#F8FBFE",
    marginBottom: 14,
  },

  appointmentStatusIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  appointmentStatusCopy: {
    flex: 1,
  },

  appointmentStatusLabel: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },

  appointmentStatusText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
  },

  appointmentStatusDetails: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },

  appointmentStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    backgroundColor: "#FFFFFF",
  },

  appointmentStatusRowLabel: {
    flex: 0.42,
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  appointmentStatusRowValue: {
    flex: 0.58,
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "right",
  },

  visitorFloorTabsScroll: {
    marginBottom: 12,
  },

  visitorFloorTabsContent: {
    paddingRight: 6,
  },

  visitorFloorTabs: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 2,
  },

  visitorFloorTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  visitorFloorTabActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },

  visitorFloorTabText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
  },

  visitorFloorTabTextActive: {
    color: "#FFFFFF",
  },

  visitorMapNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },

  visitorMapNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#0A3D91",
    fontWeight: "600",
  },

  visitorMapToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },

  visitorMapToolbarCopy: {
    flex: 1,
  },

  visitorMapToolbarTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 2,
  },

  visitorMapToolbarText: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
    fontWeight: "600",
  },

  visitorMapFullscreenButton: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
  },

  visitorMapFullscreenButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  visitorMapFullscreenModal: {
    flex: 1,
    backgroundColor: "#F8FBFE",
  },

  visitorMapFullscreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#D9E4F2",
    backgroundColor: "#FFFFFF",
  },

  visitorMapFullscreenTitleWrap: {
    flex: 1,
  },

  visitorMapFullscreenEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  visitorMapFullscreenTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "900",
    color: "#0F172A",
  },

  visitorMapMinimizeButton: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
  },

  visitorMapMinimizeButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0A3D91",
  },

  visitorMapFullscreenBody: {
    flex: 1,
    padding: 10,
  },

  visitorMapActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },

  visitorMapPrimaryAction: {
    flexGrow: 1,
    flexBasis: width <= 560 ? "100%" : 180,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#0A3D91",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },

  visitorMapPrimaryActionText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  visitorMapActionButton: {
    flexGrow: 1,
    flexBasis: width <= 560 ? "100%" : 150,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#F8FBFE",
    borderWidth: 1,
    borderColor: "#D9E4F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },

  visitorMapActionButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0A3D91",
  },

  accountPanelCard: {
    backgroundColor: "#F7FAFE",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 16,
  },

  accountSectionTitle: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },

  accountMobilePanel: {
    padding: 14,
    borderRadius: 24,
  },

  accountMobileHeader: {
    gap: 10,
    marginBottom: 12,
  },

  accountMobileHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
  },

  accountMobileTitle: {
    fontSize: 19,
    lineHeight: 23,
  },

  accountMobileSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
  },

  accountHeroCard: {
    borderRadius: 28,
    padding: 18,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#1E3A8A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
      },
      android: { elevation: 5 },
      web: { boxShadow: "0px 16px 30px rgba(30,58,138,0.16)" },
    }),
  },

  accountHeroCardMobile: {
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },

  accountHeroTopRow: {
    gap: 14,
    marginBottom: 16,
  },

  accountHeroTopRowMobile: {
    gap: 12,
    marginBottom: 14,
  },

  accountHeroIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  accountHeroAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  accountHeroAvatarMobile: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },

  accountHeroInitials: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  accountHeroAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 29,
  },

  accountHeroCopy: {
    flex: 1,
  },

  accountHeroName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 4,
  },

  accountHeroNameMobile: {
    fontSize: 18,
    lineHeight: 22,
  },

  accountHeroSubtext: {
    fontSize: 13,
    lineHeight: 17,
    color: "rgba(255,255,255,0.84)",
  },

  accountHeroSubtextMobile: {
    fontSize: 12,
    lineHeight: 17,
  },

  accountHeroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
  },

  accountHeroBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  accountStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  accountStatCard: {
    flexGrow: 1,
    flexBasis: width <= 520 ? "100%" : "47%",
    minWidth: width <= 520 ? "100%" : 150,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  accountStatCardMobile: {
    flexBasis: "47%",
    minWidth: 0,
    padding: 12,
  },

  accountStatCardWideMobile: {
    flexBasis: "100%",
    minWidth: "100%",
    padding: 12,
  },

  accountStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },

  accountStatValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  accountPanelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },

  accountPanelRowMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  accountPanelLabel: {
    flex: 0.42,
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  accountPanelValue: {
    flex: 0.58,
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "right",
  },

  accountPanelValueMobile: {
    flex: 0,
    width: "100%",
    textAlign: "left",
    fontSize: 14,
    lineHeight: 19,
  },

  accountMobileCard: {
    borderRadius: 20,
    marginBottom: 14,
  },

  accountActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },

  accountActionGridMobile: {
    gap: 10,
    marginBottom: 14,
  },

  accountActionCard: {
    flexGrow: 1,
    flexBasis: width <= 520 ? "100%" : "47%",
    minWidth: width <= 520 ? "100%" : 170,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
  },

  accountActionCardMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 12,
  },

  accountActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 18,
    backgroundColor: "#E6F4F1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  accountActionCardMobileIcon: {
    marginBottom: 0,
  },

  accountActionCopy: {
    flex: 1,
  },

  accountActionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },

  accountActionText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    fontWeight: "600",
  },

  accountVisitSummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    marginBottom: 16,
  },

  accountVisitSummaryEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0A3D91",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },

  accountVisitSummaryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 6,
  },

  accountVisitSummaryText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
    marginBottom: 14,
  },

  accountVisitSummaryBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    marginBottom: 16,
  },

  accountVisitSummaryBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  accountVisitSummaryBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },

  accountVisitSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  accountVisitSummaryMetric: {
    flexGrow: 1,
    flexBasis: 160,
    backgroundColor: "#F8FBFE",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  accountButtonDock: {
    gap: 10,
  },

  accountDockPrimaryButton: {
    minHeight: 50,
  },

  accountDockLogoutButton: {
    marginTop: 0,
    minHeight: 50,
  },

  accountVisitSummaryMetricLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  accountVisitSummaryMetricValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },

  accountLogoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginTop: 14,
  },

  accountLogoutButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#DC2626",
  },

  bottomNavShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: width <= 390 ? 12 : 18,
    paddingBottom: Platform.select({ ios: 22, android: 16, default: 16 }),
    backgroundColor: "transparent",
    pointerEvents: "box-none",
    alignItems: "center",
  },

  bottomNavBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: "100%",
    maxWidth: 430,
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#DCE7F3",
    overflow: "visible",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
      web: { boxShadow: "0px 16px 34px rgba(15,23,42,0.17)" },
    }),
  },

  bottomNavBarCompact: {
    maxWidth: 390,
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },

  bottomNavItem: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 48,
    minWidth: 48,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 24,
    zIndex: 2,
  },

  bottomNavItemCompact: {
    flexBasis: 46,
    minWidth: 46,
    minHeight: 44,
    paddingHorizontal: 11,
  },

  bottomNavItemActive: {
    backgroundColor: "#061A2E",
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#061A2E",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 10px 18px rgba(6,26,46,0.18)" },
    }),
  },

  bottomNavItemExpanded: {
    flexGrow: 1,
    flexBasis: width <= 390 ? 134 : 148,
    maxWidth: width <= 390 ? 142 : 160,
  },

  bottomNavActiveIndicator: {
    position: "absolute",
    left: 7,
    top: 7,
    bottom: 7,
    borderRadius: 24,
    backgroundColor: "#061A2E",
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#061A2E",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 10px 18px rgba(6,26,46,0.18)" },
    }),
  },

  bottomNavLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: width <= 390 ? 11 : 11.5,
    fontWeight: "900",
    color: "#64748B",
  },

  bottomNavLabelActive: {
    color: "#FFFFFF",
  },

  darkSafeArea: {
    backgroundColor: "#07111F",
  },

  darkMainScrollView: {
    backgroundColor: "#07111F",
  },

  darkSurfaceCard: {
    backgroundColor: "#0F172A",
    borderColor: "#243244",
  },

  darkNestedCard: {
    backgroundColor: "#111C2E",
    borderColor: "#2B3B52",
  },

  darkInsetCard: {
    backgroundColor: "#0B1524",
    borderColor: "#243244",
  },

  darkSegmentBar: {
    backgroundColor: "#0B1524",
    borderColor: "#243244",
  },

  darkSegmentButton: {
    backgroundColor: "#111C2E",
    borderColor: "#2B3B52",
  },

  darkActionButton: {
    backgroundColor: "#111C2E",
    borderColor: "#2B3B52",
  },

  darkReadablePill: {
    backgroundColor: "#18243A",
    borderColor: "#334155",
  },

  darkDisabledPill: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    opacity: 1,
  },

  darkDisabledText: {
    color: "#CBD5E1",
  },

  darkMiniBrandHeader: {
    borderColor: "#243244",
  },

  darkMiniBrandHeaderWrap: {
    backgroundColor: "#07111F",
  },

  darkPrimaryText: {
    color: "#F8FAFC",
  },

  darkMutedText: {
    color: "#CBD5E1",
  },

  darkKickerText: {
    color: "#94A3B8",
  },

  darkFormControl: {
    backgroundColor: "#0B1524",
    borderColor: "#2B3B52",
  },

  darkDropdownMenu: {
    backgroundColor: "#0F172A",
    borderColor: "#2B3B52",
  },

  darkOptionItem: {
    borderBottomColor: "#243244",
  },

  darkUploadCard: {
    backgroundColor: "#0B1524",
    borderColor: "#334155",
  },

  darkDividerBorder: {
    borderBottomColor: "#243244",
  },

  darkBottomNavBar: {
    backgroundColor: "rgba(15,23,42,0.98)",
    borderColor: "#243244",
  },

  darkBottomNavLabel: {
    color: "#CBD5E1",
  },

  darkBottomNavItem: {
    backgroundColor: "transparent",
  },

  darkBottomNavItemActive: {
    backgroundColor: "#0A3D91",
  },
});
