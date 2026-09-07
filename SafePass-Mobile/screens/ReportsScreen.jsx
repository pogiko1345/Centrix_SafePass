import Alert from '../utils/Alert';
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { canAccessReports, normalizeRole } from "../utils/authFlow";
import {
  exportRecordsToCSV,
  printOfficialSecretariatReport,
} from "../utils/printUtils";
import { MobileEmptyState } from "../components/mobile/MobileRoleComponents";

const DATE_SHORTCUTS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Last 7 Days" },
  { id: "month", label: "This Month" },
  { id: "all", label: "All Time" },
];

const ROLE_FILTERS = [
  { id: "all", label: "All Types" },
  { id: "visitor", label: "Visitors" },
  { id: "student", label: "Students" },
  { id: "staff", label: "Staff & Faculty" },
  { id: "security", label: "Security" },
];

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ReportsScreen({ navigation }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [dateFilter, setDateFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const verifyUserAndLoadData = useCallback(async () => {
    try {
      const user = await ApiService.getCurrentUser();
      if (!user) {
        setHasAccess(false);
        setAuthLoading(false);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      const authorized = canAccessReports(user);
      setHasAccess(authorized);
      setAuthLoading(false);

      if (!authorized) {
        setLoading(false);
        return;
      }

      const response = await ApiService.getAccessLogs(1, 200);
      const items =
        response?.accessLogs ||
        response?.logs ||
        response?.data ||
        (Array.isArray(response) ? response : []);
      setLogs(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error("Reports load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    verifyUserAndLoadData();
  }, [verifyUserAndLoadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    verifyUserAndLoadData();
  }, [verifyUserAndLoadData]);

  // Date & Role Filtering Logic
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Role Filter
      if (roleFilter !== "all") {
        const logRole = String(log.role || log.userType || log.user?.role || "visitor").toLowerCase();
        if (roleFilter === "staff" && !["staff", "teacher"].includes(logRole)) return false;
        if (roleFilter !== "staff" && logRole !== roleFilter) return false;
      }

      // 2. Date Filter
      if (dateFilter !== "all") {
        const timestamp = log.timestamp || log.createdAt || log.time;
        if (!timestamp) return false;
        const logDate = new Date(timestamp);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (dateFilter === "today") {
          if (logDate < startOfToday) return false;
        } else if (dateFilter === "yesterday") {
          const startOfYesterday = new Date(startOfToday);
          startOfYesterday.setDate(startOfYesterday.getDate() - 1);
          if (logDate < startOfYesterday || logDate >= startOfToday) return false;
        } else if (dateFilter === "week") {
          const sevenDaysAgo = new Date(startOfToday);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (logDate < sevenDaysAgo) return false;
        } else if (dateFilter === "month") {
          const thirtyDaysAgo = new Date(startOfToday);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          if (logDate < thirtyDaysAgo) return false;
        }
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const name = String(log.fullName || log.userName || log.name || log.user?.fullName || "").toLowerCase();
        const purpose = String(log.purpose || log.department || log.office || "").toLowerCase();
        const checkpoint = String(log.checkpointName || log.checkpointId || log.location || "").toLowerCase();
        const status = String(log.status || log.accessType || "").toLowerCase();
        return (
          name.includes(query) ||
          purpose.includes(query) ||
          checkpoint.includes(query) ||
          status.includes(query)
        );
      }

      return true;
    });
  }, [logs, dateFilter, roleFilter, searchQuery]);

  // Compute Metrics & KPI Breakdown
  const kpis = useMemo(() => {
    let approvedVisitors = 0;
    let studentCount = 0;
    let staffCount = 0;
    let deniedCount = 0;

    filteredLogs.forEach((log) => {
      const role = String(log.role || log.userType || log.user?.role || "visitor").toLowerCase();
      const status = String(log.status || log.accessType || "").toLowerCase();

      if (status.includes("denied") || status.includes("alert")) {
        deniedCount++;
      }

      if (role === "student") {
        studentCount++;
      } else if (role === "staff" || role === "teacher") {
        staffCount++;
      } else {
        if (!status.includes("denied")) {
          approvedVisitors++;
        }
      }
    });

    return {
      totalLogs: filteredLogs.length,
      approvedVisitors,
      studentCount,
      staffCount,
      deniedCount,
    };
  }, [filteredLogs]);

  // Compute Department / Office Breakdown
  const departmentBreakdown = useMemo(() => {
    const counts = {};
    filteredLogs.forEach((log) => {
      const dept = log.department || log.office || log.purpose || "General Campus";
      if (dept) {
        counts[dept] = (counts[dept] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredLogs]);

  // Handle Printable PDF
  const handlePrintReport = async () => {
    if (!filteredLogs.length) {
      Alert.alert("No Data", "There are no records to print for the selected filter.");
      return;
    }

    setIsExporting(true);
    try {
      const dateOption = DATE_SHORTCUTS.find((d) => d.id === dateFilter);
      const roleOption = ROLE_FILTERS.find((r) => r.id === roleFilter);
      const dateRangeLabel = `${dateOption?.label || "All Time"} (${roleOption?.label || "All Roles"})`;

      const preparedName =
        currentUser?.firstName && currentUser?.lastName
          ? `${currentUser.firstName} ${currentUser.lastName}`
          : "Secretariat & Records Officer";

      const preparedRole =
        currentUser?.position ||
        (currentUser?.role === "admin" ? "System Administrator" : "Executive Assistant / Secretary");

      const printableRecords = filteredLogs.map((log) => ({
        time: formatDateTime(log.timestamp || log.createdAt || log.time),
        name: log.fullName || log.userName || log.name || log.user?.fullName || "N/A",
        role: log.role || log.userType || log.user?.role || "Visitor",
        purpose: log.purpose || log.department || log.office || "Campus Access",
        checkpoint: log.checkpointName || log.location || "Main Gate",
        status: log.status || log.accessType || "Recorded",
      }));

      await printOfficialSecretariatReport({
        title: "Official Campus Access & Secretariat Summary Report",
        subtitle: "Sapphire Aviation Academy • SafePass Access Control",
        dateRangeLabel,
        preparedBy: preparedName,
        preparedByPosition: preparedRole,
        verifiedBy: "School Administrator / Academy Director",
        verifiedByPosition: "Office of the Academy Director",
        kpis,
        departmentBreakdown,
        records: printableRecords,
        dialogTitle: "Official SafePass Access Report",
      });
    } catch (error) {
      console.error("Print report error:", error);
      Alert.alert("Print Error", error.message || "Failed to generate printable report.");
    } finally {
      setIsExporting(false);
    }
  };

  // Handle CSV Export
  const handleExportCSV = async () => {
    if (!filteredLogs.length) {
      Alert.alert("No Data", "There are no records to export.");
      return;
    }

    setIsExporting(true);
    try {
      const headers = [
        "Date/Time",
        "Full Name",
        "Role",
        "Purpose / Department",
        "Gate Checkpoint",
        "Access Status",
        "Notes / Remarks",
      ];

      const rows = filteredLogs.map((log) => [
        formatDateTime(log.timestamp || log.createdAt || log.time),
        log.fullName || log.userName || log.name || log.user?.fullName || "N/A",
        log.role || log.userType || log.user?.role || "Visitor",
        log.purpose || log.department || log.office || "Campus Access",
        log.checkpointName || log.location || "Main Gate",
        log.status || log.accessType || "Recorded",
        log.notes || "",
      ]);

      await exportRecordsToCSV({
        headers,
        rows,
        filename: `safepass_secretariat_report_${dateFilter}_${Date.now()}.csv`,
      });

      if (Platform.OS === "web") {
        // Handled via browser download
      } else {
        Alert.alert("Export Success", "Report CSV spreadsheet ready for sharing.");
      }
    } catch (error) {
      console.error("CSV Export error:", error);
      Alert.alert("Export Error", error.message || "Failed to export CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  // If still checking authorization
  if (authLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A3D91" />
        <Text style={styles.loadingText}>Verifying Secretariat authorization...</Text>
      </SafeAreaView>
    );
  }

  // If user is UNAUTHORIZED (e.g. Student, Visitor, Guard, General Non-Secretary Faculty)
  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace("RoleSelect"))}
          >
            <Ionicons name="arrow-back" size={22} color="#0A3D91" />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.headerEyebrow}>Access Control</Text>
            <Text style={styles.headerTitle}>Restricted Area</Text>
          </View>
        </View>

        <View style={styles.unauthorizedContainer}>
          <View style={styles.unauthorizedIconBox}>
            <Ionicons name="lock-closed" size={48} color="#DC2626" />
          </View>
          <Text style={styles.unauthorizedTitle}>Secretariat & Admin Only</Text>
          <Text style={styles.unauthorizedMessage}>
            Official institutional access and attendance reports are restricted to Administrators,
            Executive Assistants, and Secretariat Personnel.
          </Text>
          <TouchableOpacity
            style={styles.returnButton}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace("RoleSelect"))}
          >
            <Ionicons name="arrow-back-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.returnButtonText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isAdmin = normalizeRole(currentUser?.role) === "admin";
  const userPortalLabel = isAdmin ? "Administrator Portal" : "Secretariat Office";

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace("RoleSelect"))}
        >
          <Ionicons name="arrow-back" size={22} color="#0A3D91" />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <View style={styles.badgeRow}>
            <Text style={styles.headerEyebrow}>Sapphire SafePass</Text>
            <View style={[styles.rolePill, isAdmin ? styles.adminPill : styles.secretaryPill]}>
              <Text style={styles.rolePillText}>{userPortalLabel}</Text>
            </View>
          </View>
          <Text style={styles.headerTitle}>Official Access Reports</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A3D91" />}
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconBox}>
            <Ionicons name="document-text" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Institutional Reports & Logs</Text>
            <Text style={styles.heroSubtitle}>
              Official campus traffic records, visitor appointments, and student check-in summaries for
              administrative filing and reporting.
            </Text>
          </View>
        </View>

        {/* Date Filter Shortcuts */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionHeading}>Period Covered</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {DATE_SHORTCUTS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.chip, dateFilter === item.id && styles.chipActive]}
                onPress={() => setDateFilter(item.id)}
              >
                <Text style={[styles.chipText, dateFilter === item.id && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Role Type Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionHeading}>Filter by Role</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {ROLE_FILTERS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.chip, roleFilter === item.id && styles.chipActive]}
                onPress={() => setRoleFilter(item.id)}
              >
                <Text style={[styles.chipText, roleFilter === item.id && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* KPI Metrics Grid */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Ionicons name="enter-outline" size={22} color="#0A3D91" />
            <Text style={styles.kpiValue}>{kpis.totalLogs}</Text>
            <Text style={styles.kpiLabel}>Total Scans</Text>
          </View>
          <View style={styles.kpiCard}>
            <Ionicons name="people-outline" size={22} color="#10B981" />
            <Text style={[styles.kpiValue, { color: "#10B981" }]}>{kpis.approvedVisitors}</Text>
            <Text style={styles.kpiLabel}>Approved Visitors</Text>
          </View>
          <View style={styles.kpiCard}>
            <Ionicons name="school-outline" size={22} color="#6366F1" />
            <Text style={[styles.kpiValue, { color: "#6366F1" }]}>{kpis.studentCount}</Text>
            <Text style={styles.kpiLabel}>Students</Text>
          </View>
          <View style={styles.kpiCard}>
            <Ionicons name="alert-circle-outline" size={22} color="#EF4444" />
            <Text style={[styles.kpiValue, { color: "#EF4444" }]}>{kpis.deniedCount}</Text>
            <Text style={styles.kpiLabel}>Denied / Alerts</Text>
          </View>
        </View>

        {/* Department / Office Breakdown */}
        {departmentBreakdown.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={styles.cardSectionTitle}>Top Visited Departments & Offices</Text>
            <View style={styles.deptGrid}>
              {departmentBreakdown.map((dept, index) => (
                <View key={index} style={styles.deptCard}>
                  <View style={styles.deptLeft}>
                    <Ionicons name="business-outline" size={16} color="#0A3D91" />
                    <Text style={styles.deptName} numberOfLines={1}>
                      {dept.name}
                    </Text>
                  </View>
                  <View style={styles.deptPill}>
                    <Text style={styles.deptPillText}>{dept.count} logs</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action Buttons: Print PDF & Export CSV */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.printButton]}
            onPress={handlePrintReport}
            disabled={isExporting}
          >
            <Ionicons name="print-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>
              {isExporting ? "Preparing PDF..." : "Print Official PDF"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.csvButton]}
            onPress={handleExportCSV}
            disabled={isExporting}
          >
            <Ionicons name="download-outline" size={20} color="#0A3D91" />
            <Text style={[styles.actionButtonText, { color: "#0A3D91" }]}>
              {isExporting ? "Exporting..." : "Export CSV"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Field */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, department, checkpoint..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Table of Records */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableTitle}>Activity Log ({filteredLogs.length})</Text>
            <Text style={styles.tableSubtitle}>Asia/Manila (GMT+8)</Text>
          </View>

          {loading ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color="#0A3D91" />
              <Text style={styles.emptyText}>Loading records...</Text>
            </View>
          ) : filteredLogs.length === 0 ? (
            <MobileEmptyState
              icon="document-text-outline"
              title="No records found"
              message="Try changing the date range or role filter to view past access entries."
              actionLabel={searchQuery ? "Clear Search" : undefined}
              onAction={searchQuery ? () => setSearchQuery("") : undefined}
            />
          ) : (
            filteredLogs.slice(0, 100).map((log, index) => {
              const name = log.fullName || log.userName || log.name || log.user?.fullName || "System Record";
              const role = log.role || log.userType || log.user?.role || "Visitor";
              const timeStr = formatDateTime(log.timestamp || log.createdAt || log.time);
              const statusStr = String(log.status || log.accessType || "Recorded").toUpperCase();
              const isGranted =
                statusStr.includes("GRANT") || statusStr.includes("IN") || statusStr.includes("APPROVED");
              const isDenied = statusStr.includes("DENIED") || statusStr.includes("ALERT");

              return (
                <View key={log._id || log.id || index} style={styles.logRow}>
                  <View style={styles.logLeft}>
                    <View style={styles.nameRow}>
                      <Text style={styles.logName} numberOfLines={1}>
                        {name}
                      </Text>
                      <View style={styles.logRolePill}>
                        <Text style={styles.logRoleText}>{role}</Text>
                      </View>
                    </View>
                    <Text style={styles.logDetails}>
                      {log.purpose || log.department || log.office || "Campus Access"} •{" "}
                      {log.checkpointName || log.location || "Main Gate"}
                    </Text>
                    <Text style={styles.logTime}>{timeStr}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      isGranted ? styles.statusGranted : isDenied ? styles.statusDenied : styles.statusDefault,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isGranted
                          ? styles.statusTextGranted
                          : isDenied
                          ? styles.statusTextDenied
                          : styles.statusTextDefault,
                      ]}
                    >
                      {statusStr}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitles: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminPill: {
    backgroundColor: "#F3E8FF",
  },
  secretaryPill: {
    backgroundColor: "#DCFCE7",
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1E293B",
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#0F172A",
    marginTop: 2,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    flexDirection: "row",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#0A3D91",
    marginBottom: 16,
    alignItems: "center",
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroSubtitle: {
    fontSize: 12,
    color: "#DBEAFE",
    marginTop: 3,
    lineHeight: 16,
  },
  filterSection: {
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  chipActive: {
    backgroundColor: "#0A3D91",
    borderColor: "#0A3D91",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0A3D91",
    marginTop: 4,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    marginTop: 2,
    textAlign: "center",
  },
  cardSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  deptGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  deptCard: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  deptLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  deptName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    flex: 1,
  },
  deptPill: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deptPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0A3D91",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  printButton: {
    backgroundColor: "#0A3D91",
  },
  csvButton: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
  },
  tableCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  tableSubtitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  logLeft: {
    flex: 1,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  logRolePill: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  logRoleText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
  },
  logDetails: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  logTime: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusGranted: {
    backgroundColor: "#DCFCE7",
  },
  statusDenied: {
    backgroundColor: "#FEE2E2",
  },
  statusDefault: {
    backgroundColor: "#F1F5F9",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  statusTextGranted: {
    color: "#166534",
  },
  statusTextDenied: {
    color: "#991B1B",
  },
  statusTextDefault: {
    color: "#475569",
  },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
    fontWeight: "700",
  },
  unauthorizedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  unauthorizedIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  unauthorizedTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  unauthorizedMessage: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
    maxWidth: 320,
  },
  returnButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0A3D91",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  returnButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});