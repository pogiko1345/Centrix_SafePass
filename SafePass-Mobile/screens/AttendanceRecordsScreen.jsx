import Alert from '../utils/Alert';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Image,
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
import saveCsv from "../utils/saveCsv";
import { printRecordsTable } from "../utils/printUtils";
import { ATTENDANCE_COLUMNS, attendanceExportRows, attendanceCsv } from "../utils/attendanceExport";

const SCHOOL_LOGO = require("../assets/LogoSapphire.jpg");

const USER_TYPES = ["all", "student", "teacher", "staff", "security", "guard", "visitor"];
const STATUS_TYPES = ["all", "present", "late", "inside", "checked_out", "completed", "expired", "no_show"];

const formatDateLabel = (value) => {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const titleCase = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase()) || "Unknown";

const getStatusColor = (status = "") => {
  const normalized = String(status || "").toLowerCase();
  switch (normalized) {
    case "late":
      return { background: "#FEF3C7", text: "#92400E" };
    case "inside":
    case "present":
      return { background: "#DCFCE7", text: "#166534" };
    case "checked_out":
    case "completed":
      return { background: "#E0F2FE", text: "#075985" };
    case "expired":
    case "no_show":
      return { background: "#FEE2E2", text: "#B91C1C" };
    default:
      return { background: "#E2E8F0", text: "#475569" };
  }
};

const groupAttendanceByDate = (records = []) => {
  const groups = records.reduce((map, record) => {
    const key = record?.attendanceDate
      ? new Date(record.attendanceDate).toISOString().slice(0, 10)
      : "undated";
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(record);
    return map;
  }, new Map());

  return Array.from(groups.entries()).map(([key, entries]) => ({
    key,
    label: key === "undated" ? "No date" : formatDateLabel(entries[0]?.attendanceDate),
    entries: [...entries].sort((left, right) => {
      const leftTime = new Date(left?.checkInTime || left?.lastTapTime || left?.createdAt || 0).getTime();
      const rightTime = new Date(right?.checkInTime || right?.lastTapTime || right?.createdAt || 0).getTime();
      return rightTime - leftTime;
    }),
  }));
};

const getTodayFilter = () => {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  return { dateFrom: iso, dateTo: iso };
};

const getYesterdayFilter = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const iso = yesterday.toISOString().slice(0, 10);
  return { dateFrom: iso, dateTo: iso };
};

const getThisMonthFilter = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10),
  };
};

const getLastDaysFilter = (days) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
};

export default function AttendanceRecordsScreen({ navigation }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRecordDetail, setSelectedRecordDetail] = useState(null);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    userType: "all",
    status: "all",
    search: "",
  });

  const buildQuery = useCallback(() => {
    const query = {};
    if (filters.dateFrom) query.dateFrom = filters.dateFrom;
    if (filters.dateTo) query.dateTo = filters.dateTo;
    if (filters.userType !== "all") query.userType = filters.userType;
    if (filters.status !== "all") query.status = filters.status;
    if (filters.search.trim()) query.search = filters.search.trim();
    return query;
  }, [filters]);

  const loadData = useCallback(async () => {
    const query = buildQuery();
    const [attendanceResponse, summaryResponse] = await Promise.all([
      ApiService.getAttendance({ ...query, limit: 120 }),
      ApiService.getAttendanceSummary(query),
    ]);

    setRecords(Array.isArray(attendanceResponse?.attendance) ? attendanceResponse.attendance : []);
    setSummary(summaryResponse?.summary || null);
  }, [buildQuery]);

  useEffect(() => {
    const run = async () => {
      try {
        await loadData();
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const exportToCsv = async () => {
    if (!records.length) {
      Alert.alert("No records", "There are no attendance records to export.");
      return;
    }
    try {
      await saveCsv(attendanceCsv(records), `CentrixMobile_Attendance_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      Alert.alert("Export failed", error?.message || "Unable to export attendance records.");
    }
  };

  const printReport = async () => {
    try {
      await printRecordsTable({
        title: "Attendance & Access Records",
        columns: ATTENDANCE_COLUMNS.map((label, key) => ({ label, key })),
        rows: attendanceExportRows(records),
      });
    } catch (error) {
      Alert.alert("Print report", error?.message || "Unable to prepare the report.");
    }
  };

  const groupedRecords = useMemo(() => groupAttendanceByDate(records), [records]);

  const quickFilter = async (nextFilter) => {
    setFilters((current) => ({ ...current, ...nextFilter }));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Image source={SCHOOL_LOGO} resizeMode="contain" style={{ width: 116, height: 58, marginBottom: 18 }} />
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={styles.loadingText}>Loading attendance records...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#0A3D91" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Admin Records & Compliance</Text>
            <Text style={styles.headerTitle}>Attendance & Access Records</Text>
            <Text style={styles.headerSubtitle}>
              Review attendance across students, teachers, staff, security, and visitors with
              date-based filtering, live status summaries, and exportable reports.
            </Text>
          </View>
        </View>

        {/* Action Bar: Export CSV & Print */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={exportToCsv}>
            <Ionicons name="download-outline" size={16} color="#0A3D91" />
            <Text style={styles.actionBtnText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={printReport}
          >
            <Ionicons name="print-outline" size={16} color="#0A3D91" />
            <Text style={styles.actionBtnText}>Print Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleRefresh} disabled={refreshing}>
            <Ionicons name="refresh-outline" size={16} color="#0A3D91" />
            <Text style={styles.actionBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary?.total || 0}</Text>
            <Text style={styles.summaryLabel}>Records</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary?.late || 0}</Text>
            <Text style={styles.summaryLabel}>Late</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary?.completed || 0}</Text>
            <Text style={styles.summaryLabel}>Completed</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary?.byUserType?.visitor || 0}</Text>
            <Text style={styles.summaryLabel}>Visitors</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Date Filters</Text>
          <View style={styles.quickFilterRow}>
            <TouchableOpacity style={styles.quickFilterChip} onPress={() => quickFilter(getTodayFilter())}>
              <Text style={styles.quickFilterText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickFilterChip} onPress={() => quickFilter(getYesterdayFilter())}>
              <Text style={styles.quickFilterText}>Yesterday</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickFilterChip} onPress={() => quickFilter(getLastDaysFilter(7))}>
              <Text style={styles.quickFilterText}>Last 7 Days</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickFilterChip} onPress={() => quickFilter(getLastDaysFilter(30))}>
              <Text style={styles.quickFilterText}>Last 30 Days</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickFilterChip} onPress={() => quickFilter(getThisMonthFilter())}>
              <Text style={styles.quickFilterText}>This Month</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickFilterChip}
              onPress={() => quickFilter({ dateFrom: "", dateTo: "" })}
            >
              <Text style={styles.quickFilterText}>Clear Dates</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterGrid}>
            <TextInput
              style={styles.filterInput}
              placeholder="Start date YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              value={filters.dateFrom}
              onChangeText={(value) => setFilters((current) => ({ ...current, dateFrom: value }))}
            />
            <TextInput
              style={styles.filterInput}
              placeholder="End date YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              value={filters.dateTo}
              onChangeText={(value) => setFilters((current) => ({ ...current, dateTo: value }))}
            />
            <TextInput
              style={styles.filterInput}
              placeholder="Search by name or ID"
              placeholderTextColor="#94A3B8"
              value={filters.search}
              onChangeText={(value) => setFilters((current) => ({ ...current, search: value }))}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {USER_TYPES.map((userType) => {
              const selected = filters.userType === userType;
              return (
                <TouchableOpacity
                  key={userType}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                  onPress={() => setFilters((current) => ({ ...current, userType }))}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                    {titleCase(userType)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.sectionTitle, styles.statusTitle]}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STATUS_TYPES.map((status) => {
              const selected = filters.status === status;
              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                  onPress={() => setFilters((current) => ({ ...current, status }))}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                    {titleCase(status)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.recordsHeader}>
            <Text style={styles.sectionTitle}>Attendance Feed</Text>
            <Text style={styles.recordsCount}>{records.length} record{records.length === 1 ? "" : "s"}</Text>
          </View>

          {groupedRecords.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-clear-outline" size={34} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No attendance records found</Text>
              <Text style={styles.emptyText}>
                Try adjusting the date range, status, or user type filters.
              </Text>
            </View>
          ) : (
            groupedRecords.map((group) => (
              <View key={group.key} style={styles.dateGroup}>
                <Text style={styles.dateGroupTitle}>{group.label}</Text>
                {group.entries.map((record) => {
                  const statusColors = getStatusColor(record.status);
                  return (
                    <TouchableOpacity
                      key={record._id}
                      style={styles.recordCard}
                      onPress={() => setSelectedRecordDetail(record)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.recordHeader}>
                        <View style={styles.recordHeaderCopy}>
                          <Text style={styles.recordName}>{record.name}</Text>
                          <Text style={styles.recordMeta}>
                            {titleCase(record.userType)} | {record.location || "No location"}
                          </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusColors.background }]}>
                          <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
                            {titleCase(record.status)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.recordDetailsGrid}>
                        <View style={styles.recordDetailCard}>
                          <Text style={styles.recordDetailLabel}>Check In</Text>
                          <Text style={styles.recordDetailValue}>{formatDateTime(record.checkInTime)}</Text>
                        </View>
                        <View style={styles.recordDetailCard}>
                          <Text style={styles.recordDetailLabel}>Check Out</Text>
                          <Text style={styles.recordDetailValue}>{formatDateTime(record.checkOutTime)}</Text>
                        </View>
                        <View style={styles.recordDetailCard}>
                          <Text style={styles.recordDetailLabel}>Last Tap</Text>
                          <Text style={styles.recordDetailValue}>{formatDateTime(record.lastTapTime)}</Text>
                        </View>
                        <View style={styles.recordDetailCard}>
                          <Text style={styles.recordDetailLabel}>Module</Text>
                          <Text style={styles.recordDetailValue}>{titleCase(record.module)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Record Inspection Modal */}
      <Modal
        visible={Boolean(selectedRecordDetail)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRecordDetail(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="clipboard-outline" size={20} color="#0A3D91" />
                <Text style={styles.modalTitle}>Attendance Record Details</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedRecordDetail(null)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.modalHero}>
                <Text style={styles.modalName}>{selectedRecordDetail?.name}</Text>
                <Text style={styles.modalUserRole}>
                  {titleCase(selectedRecordDetail?.userType)} • {selectedRecordDetail?.location || "Campus Main"}
                </Text>
              </View>

              <View style={styles.modalInfoGrid}>
                <View style={styles.modalInfoItem}>
                  <Text style={styles.modalInfoLabel}>Status</Text>
                  <Text style={styles.modalInfoValue}>{titleCase(selectedRecordDetail?.status)}</Text>
                </View>
                <View style={styles.modalInfoItem}>
                  <Text style={styles.modalInfoLabel}>Attendance Date</Text>
                  <Text style={styles.modalInfoValue}>{formatDateLabel(selectedRecordDetail?.attendanceDate)}</Text>
                </View>
                <View style={styles.modalInfoItem}>
                  <Text style={styles.modalInfoLabel}>Check-In Time</Text>
                  <Text style={styles.modalInfoValue}>{formatDateTime(selectedRecordDetail?.checkInTime)}</Text>
                </View>
                <View style={styles.modalInfoItem}>
                  <Text style={styles.modalInfoLabel}>Check-Out Time</Text>
                  <Text style={styles.modalInfoValue}>{formatDateTime(selectedRecordDetail?.checkOutTime)}</Text>
                </View>
                <View style={styles.modalInfoItem}>
                  <Text style={styles.modalInfoLabel}>Last Reader Tap</Text>
                  <Text style={styles.modalInfoValue}>{formatDateTime(selectedRecordDetail?.lastTapTime)}</Text>
                </View>
                <View style={styles.modalInfoItem}>
                  <Text style={styles.modalInfoLabel}>Logging Module</Text>
                  <Text style={styles.modalInfoValue}>{titleCase(selectedRecordDetail?.module)}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setSelectedRecordDetail(null)}
              >
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  headerCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
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
    fontWeight: "700",
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
  quickFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  quickFilterChip: {
    borderRadius: 999,
    backgroundColor: "#EEF5FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickFilterText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0A3D91",
  },
  filterGrid: {
    gap: 10,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "#DCE5F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  chipRow: {
    gap: 10,
    paddingBottom: 4,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#DCE5F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: "#0A3D91",
    backgroundColor: "#EEF5FF",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  filterChipTextActive: {
    color: "#0A3D91",
  },
  statusTitle: {
    marginTop: 16,
  },
  recordsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recordsCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 18,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    textAlign: "center",
  },
  dateGroup: {
    marginTop: 8,
  },
  dateGroupTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0A3D91",
    marginBottom: 10,
  },
  recordCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#F8FAFC",
    marginBottom: 10,
  },
  recordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  recordHeaderCopy: {
    flex: 1,
  },
  recordName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  recordMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  recordDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  recordDetailCard: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
  },
  recordDetailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  recordDetailValue: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  actionBar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0A3D91",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  modalBody: {
    padding: 18,
  },
  modalHero: {
    marginBottom: 16,
  },
  modalName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  modalUserRole: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    marginTop: 4,
  },
  modalInfoGrid: {
    gap: 10,
    marginBottom: 18,
  },
  modalInfoItem: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
  },
  modalInfoLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  modalInfoValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalDoneBtn: {
    backgroundColor: "#0A3D91",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalDoneBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
