import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";

const pad = (value) => String(value).padStart(2, "0");
const dateValue = (value) =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

export default function DateTimePicker({ value, mode = "date", onChange, minimumDate, maximumDate }) {
  const isTime = mode === "time";
  const [draft, setDraft] = useState(() => isTime
    ? `${pad(value.getHours())}:${pad(value.getMinutes())}`
    : dateValue(value));
  const dismiss = () => onChange?.({ type: "dismissed" });
  const apply = (event) => {
    event.preventDefault();
    if (!draft) return;
    const selected = new Date(value.getTime());
    if (isTime) {
      const [hours, minutes] = draft.split(":").map(Number);
      selected.setHours(hours, minutes, 0, 0);
    } else {
      const [year, month, day] = draft.split("-").map(Number);
      selected.setFullYear(year, month - 1, day);
    }
    if (!Number.isFinite(selected.getTime())) return;
    onChange?.({ type: "set", nativeEvent: { timestamp: selected.getTime() } }, selected);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{isTime ? "Choose time" : "Choose date"}</Text>
          <form onSubmit={apply}>
            <input
              aria-label={isTime ? "Choose time" : "Choose date"}
              type={isTime ? "time" : "date"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              min={!isTime && minimumDate ? dateValue(minimumDate) : undefined}
              max={!isTime && maximumDate ? dateValue(maximumDate) : undefined}
              required
              autoFocus
              style={{ boxSizing: "border-box", width: "100%", padding: 12, fontSize: 16, border: "1px solid #CBD5E1", borderRadius: 8 }}
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={dismiss} accessibilityRole="button" style={styles.cancel}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <button type="submit" style={{ background: "#0A3D91", color: "white", border: 0, borderRadius: 8, padding: "12px 20px", cursor: "pointer" }}>Apply</button>
            </View>
          </form>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15,23,42,0.6)", padding: 20 },
  card: { width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", padding: 24, borderRadius: 16 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 18, color: "#0F172A" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 },
  cancel: { padding: 12 },
});
