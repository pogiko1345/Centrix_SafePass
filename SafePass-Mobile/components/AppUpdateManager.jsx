import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { brandColors } from "../styles/brandColors";
import {
  checkForAndroidUpdate,
  downloadAndInstallAndroidUpdate,
} from "../utils/appUpdateService";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

export default function AppUpdateManager() {
  const [update, setUpdate] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const checkingRef = useRef(false);
  const shownBuildsRef = useRef(new Set());
  const lastCheckAtRef = useRef(0);

  const check = useCallback(async ({ force = false } = {}) => {
    if (Platform.OS !== "android" || checkingRef.current) return;
    if (!force && Date.now() - lastCheckAtRef.current < CHECK_INTERVAL_MS) return;
    checkingRef.current = true;
    lastCheckAtRef.current = Date.now();
    try {
      const available = await checkForAndroidUpdate();
      if (!available || shownBuildsRef.current.has(available.buildNumber)) return;
      shownBuildsRef.current.add(available.buildNumber);
      setError("");
      setProgress(0);
      setUpdate(available);
    } catch {
      // Update checks never block normal use unless a verified mandatory update is already visible.
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const startupTimer = setTimeout(() => check({ force: true }), 1600);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      clearTimeout(startupTimer);
      subscription.remove();
    };
  }, [check]);

  const install = async () => {
    if (!update || downloading) return;
    setDownloading(true);
    setError("");
    setProgress(0);
    try {
      await downloadAndInstallAndroidUpdate(update, setProgress);
    } catch (installError) {
      setError(installError?.message || "The update could not be downloaded. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (Platform.OS !== "android" || !update) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!update.forceUpdate && !downloading) setUpdate(null);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.iconWrap}><Ionicons name="cloud-download-outline" size={28} color="#FFFFFF" /></View>
          <Text style={styles.title}>New Update Available</Text>
          <Text style={styles.subtitle}>A newer CentrixMobile release is ready to install.</Text>

          <View style={styles.versionRow}>
            <View style={styles.versionItem}><Text style={styles.versionLabel}>CURRENT</Text><Text style={styles.versionValue}>v{update.installedVersion}</Text></View>
            <Ionicons name="arrow-forward" size={20} color={brandColors.blue} />
            <View style={styles.versionItem}><Text style={styles.versionLabel}>NEW</Text><Text style={styles.versionValue}>v{update.latestVersion}</Text></View>
          </View>

          <Text style={styles.notesTitle}>What&apos;s New</Text>
          <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
            {(update.releaseNotes.length ? update.releaseNotes : ["Improvements and bug fixes"]).map((note, index) => (
              <View key={`${index}-${note}`} style={styles.noteRow}><Text style={styles.bullet}>•</Text><Text style={styles.note}>{note}</Text></View>
            ))}
          </ScrollView>

          {downloading ? (
            <View style={styles.progressArea}>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
              <Text style={styles.progressText}>Downloading… {Math.round(progress * 100)}%</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}

          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={install} disabled={downloading} accessibilityRole="button">
            {downloading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{error ? "RETRY UPDATE" : "UPDATE NOW"}</Text>}
          </Pressable>
          {!update.forceUpdate ? (
            <Pressable style={styles.laterButton} onPress={() => setUpdate(null)} disabled={downloading} accessibilityRole="button">
              <Text style={styles.laterText}>LATER</Text>
            </Pressable>
          ) : <Text style={styles.required}>This update is required to continue.</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3,18,39,0.78)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: 24, backgroundColor: "#FFFFFF", padding: 24, alignItems: "center" },
  iconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: brandColors.blue, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { color: brandColors.navy, fontSize: 22, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "#60708A", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 7 },
  versionRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#EFF6FF", borderRadius: 16, padding: 14, marginTop: 20 },
  versionItem: { alignItems: "center", minWidth: 92 },
  versionLabel: { color: "#72809A", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  versionValue: { color: brandColors.navy, fontSize: 18, fontWeight: "900", marginTop: 3 },
  notesTitle: { width: "100%", color: brandColors.navy, fontSize: 15, fontWeight: "900", marginTop: 20 },
  notes: { width: "100%", maxHeight: 150, marginTop: 8 },
  notesContent: { paddingBottom: 4 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 7 },
  bullet: { color: brandColors.blue, fontSize: 18, lineHeight: 20, marginRight: 8 },
  note: { flex: 1, color: "#42526A", fontSize: 14, lineHeight: 20 },
  progressArea: { width: "100%", marginTop: 14 },
  progressTrack: { width: "100%", height: 7, borderRadius: 999, backgroundColor: "#DDE7F5", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: brandColors.blue },
  progressText: { color: "#60708A", fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 6 },
  error: { width: "100%", color: "#B42318", backgroundColor: "#FEF3F2", borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 18, marginTop: 12 },
  primaryButton: { width: "100%", minHeight: 50, borderRadius: 14, backgroundColor: brandColors.blue, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", letterSpacing: 0.6 },
  laterButton: { paddingVertical: 14, paddingHorizontal: 24 },
  laterText: { color: "#60708A", fontSize: 13, fontWeight: "900", letterSpacing: 0.7 },
  required: { color: "#B42318", fontSize: 12, fontWeight: "800", marginTop: 12, textAlign: "center" },
  pressed: { opacity: 0.86 },
});
