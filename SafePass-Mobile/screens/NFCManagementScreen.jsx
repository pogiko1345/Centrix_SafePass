import Alert from '../utils/Alert';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ApiService from "../utils/ApiService";
import {
  describeRfidReaderInput,
  normalizeRfidReaderInput,
  playRfidChime,
  formatRfidHex,
  RfidKeystrokeBuffer,
} from "../utils/rfidReaderUtils";

let NfcManager = null;
let NfcEvents = null;
let Ndef = null;

if (Platform.OS !== "web") {
  try {
    const nfcModule = require("react-native-nfc-manager");
    NfcManager = nfcModule.default || nfcModule;
    NfcEvents = nfcModule.NfcEvents;
    Ndef = nfcModule.Ndef;
  } catch (e) {}
}

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "N/A";

const roleLabel = (role = "") => {
  const normalized = String(role || "").toLowerCase();
  switch (normalized) {
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
    default:
      return "Visitor";
  }
};

const roleChipColor = (role = "") => {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "student") return { background: "#DBEAFE", text: "#1D4ED8" };
  if (normalized === "teacher") return { background: "#E0E7FF", text: "#4338CA" };
  if (normalized === "staff") return { background: "#DCFCE7", text: "#166534" };
  if (normalized === "security" || normalized === "guard") return { background: "#FEE2E2", text: "#B91C1C" };
  if (normalized === "admin") return { background: "#F3E8FF", text: "#7E22CE" };
  return { background: "#EEF2FF", text: "#475569" };
};

const getActivityTitle = (item) => {
  const typeText = String(item?.activityType || item?.accessType || "").toLowerCase();
  const noteText = String(item?.notes || "").toLowerCase();

  if (typeText.includes("entry") || typeText.includes("check_in")) return "Check-in / Entry Tap";
  if (typeText.includes("exit") || typeText.includes("check_out")) return "Check-out / Exit Tap";
  if (noteText.includes("issued nfc card")) return "System Card Issued";
  if (noteText.includes("assigned nfc card")) return "Physical UID Assigned";
  if (noteText.includes("revoked nfc card")) return "Card Revoked";
  return "NFC Activity";
};

const getActivityActor = (item) => {
  const relatedUser = item?.relatedUser;
  if (relatedUser?.firstName || relatedUser?.lastName) {
    return `${relatedUser?.firstName || ""} ${relatedUser?.lastName || ""}`.trim();
  }
  return item?.userName || "System User";
};

export default function NFCManagementScreen({ navigation }) {
  const cardInputRef = useRef(null);
  const [cards, setCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [manualCardId, setManualCardId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState("");

  const loadData = useCallback(async () => {
    const [cardsResponse, usersResponse, activityResponse] = await Promise.all([
      ApiService.getAllNfcCards({ limit: 100 }),
      ApiService.getAllUsers({ limit: 150 }),
      ApiService.getRecentActivities(30),
    ]);

    const nextCards = Array.isArray(cardsResponse?.cards) ? cardsResponse.cards : [];
    const nextUsers = Array.isArray(usersResponse?.users) ? usersResponse.users : [];
    const nextActivity = Array.isArray(activityResponse?.activities)
      ? activityResponse.activities
      : [];

    setCards(nextCards);
    setUsers(nextUsers);
    setRecentActivity(
      nextActivity
        .filter((item) => {
          const noteText = String(item?.notes || "").toLowerCase();
          const typeText = String(item?.activityType || item?.accessType || "").toLowerCase();
          return Boolean(item?.nfcCardId) || /nfc|rfid|card/.test(noteText) || /entry|exit/.test(typeText);
        })
        .slice(0, 8),
    );

    if (!selectedUserId && nextUsers[0]?._id) {
      setSelectedUserId(nextUsers[0]._id);
    }
  }, [selectedUserId]);

  useEffect(() => {
    const run = async () => {
      try {
        await loadData();
      } catch (error) {
        console.error("Load NFC management data error:", error);
        Alert.alert("Error", "Failed to load NFC management data.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [loadData]);

  // Mobile NFC Tag Listener for Card Assignment
  useEffect(() => {
    if (Platform.OS === "web" || !NfcManager || !NfcEvents) return undefined;
    let isSubscribed = true;

    const startNfcAssignScan = async () => {
      try {
        await NfcManager.start();
        NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag) => {
          if (!isSubscribed) return;
          let rawUid = tag?.id || tag?.uid || "";
          if (!rawUid && tag?.ndefMessage && tag.ndefMessage[0]) {
            try {
              rawUid = Ndef?.text?.decodePayload(tag.ndefMessage[0].payload) || "";
            } catch (e) {}
          }
          const normalized = normalizeRfidReaderInput(rawUid);
          if (normalized) {
            playRfidChime("success");
            setManualCardId(normalized);
          }
        });
        await NfcManager.registerTagEvent();
      } catch (err) {
        console.warn("Mobile NFC tag assign listener error:", err);
      }
    };

    startNfcAssignScan();

    return () => {
      isSubscribed = false;
      try {
        NfcManager.unregisterTagEvent();
        NfcManager.setEventListener(NfcEvents.DiscoverTag, () => {});
      } catch (e) {}
    };
  }, []);

  // Web USB Wedge Reader Keystroke Buffer for Card Assignment
  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const wedgeScanner = new RfidKeystrokeBuffer({
      onScan: (scannedUid) => {
        setManualCardId(scannedUid);
      },
    });
    wedgeScanner.start();
    return () => wedgeScanner.stop();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => cardInputRef.current?.focus?.(), 350);
    return () => clearTimeout(timer);
  }, [selectedUserId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      console.error("Refresh NFC management data error:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
    if (!normalizedSearch) return users;

    return users.filter((user) =>
      [
        `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        user.email,
        user.role,
        user.studentId,
        user.teacherId,
        user.employeeId,
        user.nfcCardId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    );
  }, [searchTerm, users]);

  const selectedUser = useMemo(
    () => users.find((user) => String(user._id) === String(selectedUserId)) || null,
    [selectedUserId, users],
  );

  const summary = useMemo(
    () => ({
      totalCards: cards.length,
      activeCards: cards.filter((card) => card.status === "active" || card.cardActive).length,
      studentsCovered: cards.filter((card) => String(card.role || "").toLowerCase() === "student").length,
      teachersCovered: cards.filter((card) => String(card.role || "").toLowerCase() === "teacher").length,
      visitorsCovered: cards.filter((card) => String(card.role || "").toLowerCase() === "visitor").length,
      staffCovered: cards.filter((card) =>
        ["staff", "security", "guard", "admin"].includes(String(card.role || "").toLowerCase()),
      ).length,
    }),
    [cards],
  );

  const moduleCards = useMemo(
    () => [
      {
        key: "student",
        title: "Student NFC Attendance",
        subtitle: `${summary.studentsCovered} student card${summary.studentsCovered === 1 ? "" : "s"} ready for check-in and check-out.`,
        icon: "school-outline",
        color: "#1D4ED8",
      },
      {
        key: "teacher",
        title: "Teacher NFC Attendance",
        subtitle: `${summary.teachersCovered} teacher card${summary.teachersCovered === 1 ? "" : "s"} linked for classroom attendance.`,
        icon: "reader-outline",
        color: "#4338CA",
      },
      {
        key: "visitor",
        title: "Visitor NFC Checkpoints",
        subtitle: `${summary.visitorsCovered} visitor card${summary.visitorsCovered === 1 ? "" : "s"} connected to appointment and location taps.`,
        icon: "person-outline",
        color: "#0F766E",
      },
      {
        key: "staff",
        title: "Staff Access Logging",
        subtitle: `${summary.staffCovered} staff and security card${summary.staffCovered === 1 ? "" : "s"} available for checkpoint logging.`,
        icon: "briefcase-outline",
        color: "#B45309",
      },
      {
        key: "security",
        title: "Security Monitoring",
        subtitle: `${recentActivity.length} recent NFC event${recentActivity.length === 1 ? "" : "s"} visible for monitoring.`,
        icon: "shield-checkmark-outline",
        color: "#B91C1C",
      },
    ],
    [
      recentActivity.length,
      summary.staffCovered,
      summary.studentsCovered,
      summary.teachersCovered,
      summary.visitorsCovered,
    ],
  );

  const finishAction = async (successMessage) => {
    await loadData();
    if (successMessage) {
      Alert.alert("Success", successMessage);
    }
  };

  const handleIssueCard = async () => {
    if (!selectedUser?._id) {
      Alert.alert("Select User", "Choose a user before issuing an NFC card.");
      return;
    }

    try {
      setBusyAction("issue");
      const response = await ApiService.issueNfcCard(selectedUser._id);
      await finishAction(response?.message || "NFC card issued successfully.");
    } catch (error) {
      Alert.alert("Issue Failed", error?.message || "Unable to issue NFC card.");
    } finally {
      setBusyAction("");
    }
  };

  const handleAssignCard = async (scannedValue = manualCardId) => {
    if (!selectedUser?._id) {
      Alert.alert("Select User", "Choose a user before assigning a physical card.");
      return;
    }

    const normalizedCardId = normalizeRfidReaderInput(scannedValue);

    if (!normalizedCardId) {
      Alert.alert("Card UID Required", "Enter the NFC or RFID card UID first.");
      return;
    }

    try {
      setBusyAction("assign");
      const response = await ApiService.assignNfcCard({
        userId: selectedUser._id,
        cardId: normalizedCardId,
      });
      setManualCardId("");
      cardInputRef.current?.focus?.();
      await finishAction(response?.message || "NFC card assigned successfully.");
    } catch (error) {
      Alert.alert("Assign Failed", error?.message || "Unable to assign NFC card.");
    } finally {
      setBusyAction("");
    }
  };

  const handleRevokeCard = async (userId) => {
    try {
      setBusyAction(`revoke-${userId}`);
      const response = await ApiService.revokeNfcCard(userId);
      await finishAction(response?.message || "NFC card revoked successfully.");
    } catch (error) {
      Alert.alert("Revoke Failed", error?.message || "Unable to revoke NFC card.");
    } finally {
      setBusyAction("");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={styles.loadingText}>Loading NFC system UI...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#0A3D91" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>NFC Control Center</Text>
            <Text style={styles.headerTitle}>NFC System Management</Text>
            <Text style={styles.headerSubtitle}>
              Manage issued cards, map physical UIDs, and review live NFC coverage across student,
              teacher, visitor, staff, and security users.
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.scanButton} onPress={() => navigation.navigate("NFCScan")}>
              <Ionicons name="scan-outline" size={18} color="#FFFFFF" />
              <Text style={styles.scanButtonText}>Scan Test</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.totalCards}</Text>
            <Text style={styles.summaryLabel}>Issued Cards</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.activeCards}</Text>
            <Text style={styles.summaryLabel}>Active Cards</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.studentsCovered}</Text>
            <Text style={styles.summaryLabel}>Students</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.teachersCovered}</Text>
            <Text style={styles.summaryLabel}>Teachers</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.staffCovered}</Text>
            <Text style={styles.summaryLabel}>Staff / Security</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.visitorsCovered}</Text>
            <Text style={styles.summaryLabel}>Visitors</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NFC Modules</Text>
          <View style={styles.moduleGrid}>
            {moduleCards.map((moduleCard) => (
              <View key={moduleCard.key} style={styles.moduleCard}>
                <View style={[styles.moduleIconWrap, { backgroundColor: `${moduleCard.color}16` }]}>
                  <Ionicons name={moduleCard.icon} size={18} color={moduleCard.color} />
                </View>
                <Text style={styles.moduleTitle}>{moduleCard.title}</Text>
                <Text style={styles.moduleSubtitle}>{moduleCard.subtitle}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assign NFC Access</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, role, ID, or card"
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholderTextColor="#94A3B8"
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.userChipRow}>
            {filteredUsers.slice(0, 20).map((user) => {
              const isSelected = String(user._id) === String(selectedUserId);
              const chipColor = roleChipColor(user.role);
              return (
                <TouchableOpacity
                  key={user._id}
                  style={[styles.userChip, isSelected && styles.userChipSelected]}
                  onPress={() => setSelectedUserId(user._id)}
                >
                  <Text style={[styles.userChipName, isSelected && styles.userChipNameSelected]}>
                    {user.firstName} {user.lastName}
                  </Text>
                  <View style={[styles.userRoleBadge, { backgroundColor: chipColor.background }]}>
                    <Text style={[styles.userRoleBadgeText, { color: chipColor.text }]}>
                      {roleLabel(user.role)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedUser ? (
            <View style={styles.selectedUserPanel}>
              <Text style={styles.selectedUserTitle}>
                {selectedUser.firstName} {selectedUser.lastName}
              </Text>
              <Text style={styles.selectedUserMeta}>{selectedUser.email}</Text>
              <Text style={styles.selectedUserMeta}>
                {roleLabel(selectedUser.role)} |{" "}
                {selectedUser.studentId || selectedUser.teacherId || selectedUser.employeeId || "No internal ID"}
              </Text>
              <Text style={styles.selectedUserMeta}>
                Current Card: {selectedUser.nfcCardId || "No card assigned"}
              </Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.primaryButton, busyAction === "issue" && styles.disabledButton]}
                  onPress={handleIssueCard}
                  disabled={busyAction === "issue"}
                >
                  <Text style={styles.primaryButtonText}>
                    {busyAction === "issue" ? "Issuing..." : "Issue System Card"}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                ref={cardInputRef}
                style={styles.uidInput}
                placeholder="Tap card on USB reader"
                value={manualCardId}
                onChangeText={(value) => setManualCardId(normalizeRfidReaderInput(value))}
                onSubmitEditing={(event) => handleAssignCard(event?.nativeEvent?.text)}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                blurOnSubmit={false}
                showSoftInputOnFocus={false}
                placeholderTextColor="#94A3B8"
              />
              <View style={styles.readerHintCard}>
                <Ionicons name="radio-outline" size={16} color="#0A3D91" />
                <Text style={styles.readerHintText}>
                  Keep this field focused, then tap a card on the USB reader. Most readers type the UID and press Enter automatically.
                </Text>
                <Text style={styles.readerHintMeta}>{describeRfidReaderInput(manualCardId)}</Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.secondaryButton, busyAction === "assign" && styles.disabledButton]}
                  onPress={() => handleAssignCard()}
                  disabled={busyAction === "assign"}
                >
                  <Text style={styles.secondaryButtonText}>
                    {busyAction === "assign" ? "Assigning..." : "Assign Physical UID"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>No matching user found.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issued NFC Cards</Text>
          {cards.length === 0 ? (
            <View style={styles.emptyPanel}>
              <Ionicons name="card-outline" size={32} color="#94A3B8" />
              <Text style={styles.emptyPanelText}>No NFC cards have been issued yet.</Text>
            </View>
          ) : (
            cards.map((card) => {
              const chipColor = roleChipColor(card.role);
              const isBusy = busyAction === `revoke-${card.userId}`;
              return (
                <View key={card.userId} style={styles.cardRow}>
                  <View style={styles.cardRowTop}>
                    <View style={styles.cardRowInfo}>
                      <Text style={styles.cardUserName}>{card.userName}</Text>
                      <Text style={styles.cardMeta}>{card.email || "No email"}</Text>
                      <Text style={styles.cardNumber}>{card.cardNumber}</Text>
                    </View>
                    <View style={[styles.userRoleBadge, { backgroundColor: chipColor.background }]}>
                      <Text style={[styles.userRoleBadgeText, { color: chipColor.text }]}>
                        {roleLabel(card.role)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardRowBottom}>
                    <Text style={styles.cardMeta}>Issued: {formatDateTime(card.issuedDate)}</Text>
                    <Text style={styles.cardMeta}>
                      Status: {card.cardActive || card.status === "active" ? "Active" : "Inactive"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.revokeButton, isBusy && styles.disabledButton]}
                    onPress={() => handleRevokeCard(card.userId)}
                    disabled={isBusy}
                  >
                    <Text style={styles.revokeButtonText}>
                      {isBusy ? "Revoking..." : "Revoke Card"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent NFC Activity</Text>
          {recentActivity.length === 0 ? (
            <View style={styles.emptyPanel}>
              <Ionicons name="pulse-outline" size={32} color="#94A3B8" />
              <Text style={styles.emptyPanelText}>No NFC activity has been recorded yet.</Text>
            </View>
          ) : (
            recentActivity.map((activity, index) => (
              <View
                key={activity._id || `${activity.timestamp}-${index}`}
                style={[styles.activityRow, index > 0 && styles.activityRowSeparated]}
              >
                <View style={styles.activityIconWrap}>
                  <Ionicons name="radio-outline" size={18} color="#0A3D91" />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>{getActivityTitle(activity)}</Text>
                  <Text style={styles.activityMeta}>
                    {getActivityActor(activity)} | {activity.location || "Campus checkpoint"}
                  </Text>
                  <Text style={styles.activityMeta}>{formatDateTime(activity.timestamp)}</Text>
                  {activity.nfcCardId ? (
                    <Text style={styles.activityCardId}>Card: {activity.nfcCardId}</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FB",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
  },
  content: {
    padding: 18,
    paddingBottom: 28,
  },
  headerRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    alignItems: "flex-start",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EEF5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 220,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0A3D91",
    textTransform: "uppercase",
  },
  headerTitle: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  headerActions: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0A3D91",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  scanButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  summaryTile: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  summaryLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
  },
  moduleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  moduleCard: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
  },
  moduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  moduleSubtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#DCE5F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0F172A",
    marginBottom: 12,
  },
  userChipRow: {
    paddingBottom: 8,
    gap: 10,
  },
  userChip: {
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#DCE5F0",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
  },
  userChipSelected: {
    borderColor: "#0A3D91",
    backgroundColor: "#EEF5FF",
  },
  userChipName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  userChipNameSelected: {
    color: "#0A3D91",
  },
  userRoleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  userRoleBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  selectedUserPanel: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 14,
  },
  selectedUserTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  selectedUserMeta: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
  },
  actionRow: {
    marginTop: 12,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A3D91",
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0A3D91",
  },
  revokeButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
  },
  revokeButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#B91C1C",
  },
  uidInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#DCE5F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  readerHintCard: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    backgroundColor: "#EEF5FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readerHintText: {
    flex: 1,
    minWidth: 180,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#0A3D91",
  },
  readerHintMeta: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475569",
  },
  disabledButton: {
    opacity: 0.65,
  },
  emptyPanel: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 18,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
  },
  emptyPanelText: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  cardRow: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 14,
    marginTop: 14,
  },
  cardRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cardRowInfo: {
    flex: 1,
  },
  cardUserName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  cardNumber: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#0A3D91",
  },
  cardRowBottom: {
    marginTop: 10,
    gap: 2,
  },
  activityRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  activityRowSeparated: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  activityMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  activityCardId: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#0A3D91",
  },
});
