import Alert from '../utils/Alert';
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ApiService from "../utils/ApiService";
import visitorManagementStyles from "../styles/VisitorManagementStyles";

// Helper functions
const getRoleColor = (role) => {
  switch(role?.toLowerCase()) {
    case 'visitor': return '#1C6DD0';
    case 'student': return '#0A3D91';
    case 'staff': return '#D97706';
    case 'security': return '#DC2626';
    case 'admin': return '#1C6DD0';
    default: return '#6B7280';
  }
};

const getRoleDisplayName = (role) => {
  if (!role) return 'Unknown';
  const roleMap = {
    'student': 'Student',
    'staff': 'Staff',
    'security': 'Security',
    'admin': 'Administrator',
    'visitor': 'Visitor'
  };
  return roleMap[role] || role.charAt(0).toUpperCase() + role.slice(1);
};

const getStatusColor = (status) => {
  switch(status) {
    case 'pending': return '#F59E0B';
    case 'approved': return '#10B981';
    case 'checked_in': return '#0A3D91';
    case 'checked_out': return '#6B7280';
    case 'expired': return '#DC2626';
    case 'rejected': return '#DC2626';
    default: return '#6B7280';
  }
};

const getStatusDisplay = (status) => {
  switch(status) {
    case 'pending': return 'PENDING';
    case 'approved': return 'APPROVED';
    case 'checked_in': return 'CHECKED IN';
    case 'checked_out': return 'CHECKED OUT';
    case 'expired': return 'EXPIRED';
    case 'rejected': return 'REJECTED';
    default: return status?.toUpperCase() || 'UNKNOWN';
  }
};

export default function VisitorManagementScreen({ navigation, route }) {
  const { userType = 'visitor' } = route.params || {};
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visitors, setVisitors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState(null);

  // Form States
  const [newVisitorData, setNewVisitorData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    idNumber: '',
    purposeOfVisit: '',
    vehicleNumber: '',
    visitDate: new Date(),
    visitTime: new Date(),
    hostName: '',
    hostDepartment: '',
    expectedDuration: '',
    status: 'pending',
  });

  const [editVisitorData, setEditVisitorData] = useState({
    id: '',
    fullName: '',
    email: '',
    phoneNumber: '',
    idNumber: '',
    purposeOfVisit: '',
    vehicleNumber: '',
    visitDate: new Date(),
    visitTime: new Date(),
    hostName: '',
    hostDepartment: '',
    expectedDuration: '',
    status: '',
    checkedInAt: null,
    checkedOutAt: null,
  });

  useEffect(() => {
    loadVisitors();
  }, []);

  const loadVisitors = async () => {
    setIsLoading(true);
    try {
      const response = await ApiService.getVisitors({});
      if (response && response.success) {
        setVisitors(response.visitors);
      } else {
        // Demo data
        setVisitors([
          {
            id: 1,
            fullName: "John Visitor",
            email: "john.visitor@example.com",
            phoneNumber: "09123456789",
            idNumber: "PASSPORT12345",
            purposeOfVisit: "Campus Tour",
            vehicleNumber: "ABC-1234",
            visitDate: new Date(),
            visitTime: new Date(),
            hostName: "Prof. Anderson",
            hostDepartment: "Aviation Dept",
            expectedDuration: "2 hours",
            status: "pending",
            registeredAt: new Date(),
          },
          {
            id: 2,
            fullName: "Sarah Guest",
            email: "sarah.guest@example.com",
            phoneNumber: "09187654321",
            idNumber: "DRIVER45678",
            purposeOfVisit: "Meeting with Dean",
            vehicleNumber: "",
            visitDate: new Date(),
            visitTime: new Date(),
            hostName: "Dr. Martinez",
            hostDepartment: "Administration",
            expectedDuration: "1 hour",
            status: "approved",
            registeredAt: new Date(),
          },
          {
            id: 3,
            fullName: "Mike Contractor",
            email: "mike.contractor@example.com",
            phoneNumber: "09123456712",
            idNumber: "COMPANY78901",
            purposeOfVisit: "Maintenance",
            vehicleNumber: "XYZ-5678",
            visitDate: new Date(),
            visitTime: new Date(),
            hostName: "Facilities Dept",
            hostDepartment: "Maintenance",
            expectedDuration: "4 hours",
            status: "checked_in",
            checkedInAt: new Date(),
            registeredAt: new Date(),
          },
          {
            id: 4,
            fullName: "Emily Parent",
            email: "emily.parent@example.com",
            phoneNumber: "09123456734",
            idNumber: "PASSPORT67890",
            purposeOfVisit: "Parent-Teacher Conference",
            vehicleNumber: "DEF-9012",
            visitDate: new Date(),
            visitTime: new Date(),
            hostName: "Student Affairs",
            hostDepartment: "Student Services",
            expectedDuration: "3 hours",
            status: "checked_out",
            checkedInAt: new Date(),
            checkedOutAt: new Date(),
            registeredAt: new Date(),
          },
          {
            id: 5,
            fullName: "David Vendor",
            email: "david.vendor@example.com",
            phoneNumber: "09123456756",
            idNumber: "DRIVER34567",
            purposeOfVisit: "Supply Delivery",
            vehicleNumber: "GHI-3456",
            visitDate: new Date(new Date().setDate(new Date().getDate() - 1)),
            visitTime: new Date(),
            hostName: "Procurement",
            hostDepartment: "Finance",
            expectedDuration: "30 minutes",
            status: "expired",
            registeredAt: new Date(new Date().setDate(new Date().getDate() - 1)),
          },
        ]);
      }
    } catch (error) {
      console.error("Error loading visitors:", error);
      Alert.alert("Error", "Failed to load visitors");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadVisitors();
  };

  const handleAddVisitor = () => {
    setNewVisitorData({
      fullName: '',
      email: '',
      phoneNumber: '',
      idNumber: '',
      purposeOfVisit: '',
      vehicleNumber: '',
      visitDate: new Date(),
      visitTime: new Date(),
      hostName: '',
      hostDepartment: '',
      expectedDuration: '',
      status: 'pending',
    });
    setShowAddModal(true);
  };

  const handleEditVisitor = (visitor) => {
    setEditVisitorData({
      id: visitor._id || visitor.id,
      fullName: visitor.fullName || '',
      email: visitor.email || '',
      phoneNumber: visitor.phoneNumber || '',
      idNumber: visitor.idNumber || '',
      purposeOfVisit: visitor.purposeOfVisit || '',
      vehicleNumber: visitor.vehicleNumber || '',
      visitDate: visitor.visitDate ? new Date(visitor.visitDate) : new Date(),
      visitTime: visitor.visitTime ? new Date(visitor.visitTime) : new Date(),
      hostName: visitor.hostName || '',
      hostDepartment: visitor.hostDepartment || '',
      expectedDuration: visitor.expectedDuration || '',
      status: visitor.status || 'pending',
      checkedInAt: visitor.checkedInAt,
      checkedOutAt: visitor.checkedOutAt,
    });
    setShowEditModal(true);
  };

  const handleViewDetails = (visitor) => {
    setSelectedVisitor(visitor);
    setShowDetailsModal(true);
  };

  const confirmAddVisitor = async () => {
    if (!newVisitorData.fullName || !newVisitorData.email || !newVisitorData.phoneNumber || !newVisitorData.idNumber || !newVisitorData.purposeOfVisit) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const response = await ApiService.registerVisitor(newVisitorData);
      if (response && response.success) {
        Alert.alert("✅ Success", "Visitor registered successfully");
        loadVisitors();
        setShowAddModal(false);
      } else {
        // Demo mode - add to local state
        const newVisitor = {
          id: visitors.length + 1,
          ...newVisitorData,
          registeredAt: new Date(),
        };
        setVisitors([newVisitor, ...visitors]);
        Alert.alert("✅ Success", "Visitor added successfully (Demo Mode)");
        setShowAddModal(false);
      }
    } catch (error) {
      console.error("Add visitor error:", error);
      Alert.alert("Error", error.message || "Failed to add visitor");
    } finally {
      setIsLoading(false);
    }
  };

  const confirmEditVisitor = async () => {
    if (!editVisitorData.fullName || !editVisitorData.email || !editVisitorData.phoneNumber) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const response = await ApiService.updateVisitor(editVisitorData.id, editVisitorData);
      if (response && response.success) {
        Alert.alert("✅ Success", "Visitor updated successfully");
        loadVisitors();
        setShowEditModal(false);
      } else {
        // Demo mode - update local state
        setVisitors(visitors.map(v => 
          (v._id || v.id) === editVisitorData.id ? { ...v, ...editVisitorData } : v
        ));
        Alert.alert("✅ Success", "Visitor updated successfully (Demo Mode)");
        setShowEditModal(false);
      }
    } catch (error) {
      console.error("Edit visitor error:", error);
      Alert.alert("Error", error.message || "Failed to update visitor");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteVisitor = (visitor) => {
    setSelectedVisitor(visitor);
    setShowDeleteModal(true);
  };

  const confirmDeleteVisitor = async () => {
    if (!selectedVisitor) return;
    
    setIsLoading(true);
    try {
      const response = await ApiService.deleteVisitor(selectedVisitor._id || selectedVisitor.id);
      if (response && response.success) {
        Alert.alert("✅ Success", "Visitor deleted successfully");
        loadVisitors();
      } else {
        // Demo mode - remove from local state
        setVisitors(visitors.filter(v => (v._id || v.id) !== (selectedVisitor._id || selectedVisitor.id)));
        Alert.alert("✅ Success", "Visitor deleted successfully (Demo Mode)");
      }
    } catch (error) {
      console.error("Delete visitor error:", error);
      Alert.alert("Error", error.message || "Failed to delete visitor");
    } finally {
      setIsLoading(false);
      setShowDeleteModal(false);
      setSelectedVisitor(null);
    }
  };

  const handleApproveVisitor = async (visitor) => {
    Alert.alert(
      "Approve Visitor",
      `Approve ${visitor.fullName} for visit?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setIsLoading(true);
            try {
              // In a real app, call API
              setVisitors(visitors.map(v => 
                (v._id || v.id) === (visitor._id || visitor.id) ? { ...v, status: 'approved' } : v
              ));
              Alert.alert("✅ Success", "Visitor approved successfully");
            } catch (error) {
              Alert.alert("Error", "Failed to approve visitor");
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCheckIn = async (visitor) => {
    Alert.alert(
      "Check In Visitor",
      `Check in ${visitor.fullName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check In",
          onPress: async () => {
            setIsLoading(true);
            try {
              // In a real app, call API
              setVisitors(visitors.map(v => 
                (v._id || v.id) === (visitor._id || visitor.id) ? { 
                  ...v, 
                  status: 'checked_in',
                  checkedInAt: new Date()
                } : v
              ));
              Alert.alert("✅ Success", "Visitor checked in successfully");
            } catch (error) {
              Alert.alert("Error", "Failed to check in visitor");
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCheckOut = async (visitor) => {
    Alert.alert(
      "Check Out Visitor",
      `Check out ${visitor.fullName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Check Out",
          onPress: async () => {
            setIsLoading(true);
            try {
              // In a real app, call API
              setVisitors(visitors.map(v => 
                (v._id || v.id) === (visitor._id || visitor.id) ? { 
                  ...v, 
                  status: 'checked_out',
                  checkedOutAt: new Date()
                } : v
              ));
              Alert.alert("✅ Success", "Visitor checked out successfully");
            } catch (error) {
              Alert.alert("Error", "Failed to check out visitor");
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const filteredVisitors = visitors.filter(visitor => {
    const matchesSearch = 
      (visitor.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (visitor.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (visitor.phoneNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (visitor.idNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || visitor.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading && !visitors.length) {
    return (
      <SafeAreaView style={visitorManagementStyles.loadingContainer}>
        <ActivityIndicator size="large" color="#1C6DD0" />
        <Text style={visitorManagementStyles.loadingText}>Loading visitors...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={visitorManagementStyles.container}>
      {/* Header */}
      <View style={visitorManagementStyles.header}>
        <TouchableOpacity
          style={visitorManagementStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={visitorManagementStyles.headerTitle}>Visitor Management</Text>
        <TouchableOpacity
          style={visitorManagementStyles.addButton}
          onPress={handleAddVisitor}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={visitorManagementStyles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#9CA3AF" />
        <TextInput
          style={visitorManagementStyles.searchInput}
          placeholder="Search visitors..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Status Filter Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={visitorManagementStyles.filterScroll}
        contentContainerStyle={visitorManagementStyles.filterContainer}
      >
        <TouchableOpacity
          style={[visitorManagementStyles.filterChip, statusFilter === 'all' && visitorManagementStyles.filterChipActive]}
          onPress={() => setStatusFilter('all')}
        >
          <Text style={[visitorManagementStyles.filterChipText, statusFilter === 'all' && visitorManagementStyles.filterChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[visitorManagementStyles.filterChip, statusFilter === 'pending' && visitorManagementStyles.filterChipActive]}
          onPress={() => setStatusFilter('pending')}
        >
          <Text style={[visitorManagementStyles.filterChipText, statusFilter === 'pending' && visitorManagementStyles.filterChipTextActive]}>
            Pending
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[visitorManagementStyles.filterChip, statusFilter === 'approved' && visitorManagementStyles.filterChipActive]}
          onPress={() => setStatusFilter('approved')}
        >
          <Text style={[visitorManagementStyles.filterChipText, statusFilter === 'approved' && visitorManagementStyles.filterChipTextActive]}>
            Approved
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[visitorManagementStyles.filterChip, statusFilter === 'checked_in' && visitorManagementStyles.filterChipActive]}
          onPress={() => setStatusFilter('checked_in')}
        >
          <Text style={[visitorManagementStyles.filterChipText, statusFilter === 'checked_in' && visitorManagementStyles.filterChipTextActive]}>
            Checked In
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[visitorManagementStyles.filterChip, statusFilter === 'checked_out' && visitorManagementStyles.filterChipActive]}
          onPress={() => setStatusFilter('checked_out')}
        >
          <Text style={[visitorManagementStyles.filterChipText, statusFilter === 'checked_out' && visitorManagementStyles.filterChipTextActive]}>
            Checked Out
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[visitorManagementStyles.filterChip, statusFilter === 'expired' && visitorManagementStyles.filterChipActive]}
          onPress={() => setStatusFilter('expired')}
        >
          <Text style={[visitorManagementStyles.filterChipText, statusFilter === 'expired' && visitorManagementStyles.filterChipTextActive]}>
            Expired
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Visitor List */}
      <ScrollView
        style={visitorManagementStyles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredVisitors.map((visitor) => (
          <TouchableOpacity
            key={visitor._id || visitor.id}
            style={visitorManagementStyles.visitorCard}
            onPress={() => handleViewDetails(visitor)}
            activeOpacity={0.7}
          >
            <View style={visitorManagementStyles.cardHeader}>
              <View style={visitorManagementStyles.visitorInfo}>
                <Text style={visitorManagementStyles.visitorName}>{visitor.fullName}</Text>
                <Text style={visitorManagementStyles.visitorEmail}>{visitor.email}</Text>
              </View>
              <View style={[visitorManagementStyles.statusBadge, { 
                backgroundColor: getStatusColor(visitor.status) + '20' 
              }]}>
                <Text style={[visitorManagementStyles.statusText, { 
                  color: getStatusColor(visitor.status) 
                }]}>
                  {getStatusDisplay(visitor.status)}
                </Text>
              </View>
            </View>

            <View style={visitorManagementStyles.cardDetails}>
              <View style={visitorManagementStyles.detailRow}>
                <Ionicons name="call-outline" size={14} color="#6B7280" />
                <Text style={visitorManagementStyles.detailText}>{visitor.phoneNumber}</Text>
              </View>
              <View style={visitorManagementStyles.detailRow}>
                <Ionicons name="document-text-outline" size={14} color="#6B7280" />
                <Text style={visitorManagementStyles.detailText}>{visitor.purposeOfVisit}</Text>
              </View>
              <View style={visitorManagementStyles.detailRow}>
                <Ionicons name="person-outline" size={14} color="#6B7280" />
                <Text style={visitorManagementStyles.detailText}>Host: {visitor.hostName || 'N/A'}</Text>
              </View>
              <View style={visitorManagementStyles.detailRow}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={visitorManagementStyles.detailText}>
                  {visitor.checkedInAt ? `Checked in: ${formatDateTime(visitor.checkedInAt)}` : 
                   visitor.checkedOutAt ? `Checked out: ${formatDateTime(visitor.checkedOutAt)}` : 
                   `Registered: ${formatDateTime(visitor.registeredAt)}`}
                </Text>
              </View>
              {visitor.vehicleNumber ? (
                <View style={visitorManagementStyles.detailRow}>
                  <Ionicons name="car-outline" size={14} color="#6B7280" />
                  <Text style={visitorManagementStyles.detailText}>Vehicle: {visitor.vehicleNumber}</Text>
                </View>
              ) : null}
            </View>

            <View style={visitorManagementStyles.cardActions}>
              {visitor.status === 'pending' && (
                <TouchableOpacity 
                  style={[visitorManagementStyles.actionButton, { backgroundColor: '#10B981' }]}
                  onPress={() => handleApproveVisitor(visitor)}
                >
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  <Text style={visitorManagementStyles.actionButtonText}>Approve</Text>
                </TouchableOpacity>
              )}
              {visitor.status === 'approved' && (
                <TouchableOpacity 
                  style={[visitorManagementStyles.actionButton, { backgroundColor: '#0A3D91' }]}
                  onPress={() => handleCheckIn(visitor)}
                >
                  <Ionicons name="log-in-outline" size={16} color="#FFFFFF" />
                  <Text style={visitorManagementStyles.actionButtonText}>Check In</Text>
                </TouchableOpacity>
              )}
              {visitor.status === 'checked_in' && (
                <TouchableOpacity 
                  style={[visitorManagementStyles.actionButton, { backgroundColor: '#DC2626' }]}
                  onPress={() => handleCheckOut(visitor)}
                >
                  <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
                  <Text style={visitorManagementStyles.actionButtonText}>Check Out</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[visitorManagementStyles.actionButton, visitorManagementStyles.editButton]}
                onPress={() => handleEditVisitor(visitor)}
              >
                <Ionicons name="create-outline" size={16} color="#0A3D91" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[visitorManagementStyles.actionButton, visitorManagementStyles.deleteButton]}
                onPress={() => handleDeleteVisitor(visitor)}
              >
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        
        {filteredVisitors.length === 0 && (
          <View style={visitorManagementStyles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#E5E7EB" />
            <Text style={visitorManagementStyles.emptyText}>No visitors found</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Visitor Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={visitorManagementStyles.modalOverlay}>
          <View style={visitorManagementStyles.modalContent}>
            <View style={visitorManagementStyles.modalHeader}>
              <Text style={visitorManagementStyles.modalTitle}>Register New Visitor</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={visitorManagementStyles.modalBody}>
              <Text style={visitorManagementStyles.inputLabel}>Full Name *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Enter full name"
                value={newVisitorData.fullName}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, fullName: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Email *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Enter email"
                keyboardType="email-address"
                autoCapitalize="none"
                value={newVisitorData.email}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, email: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Phone Number *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="09123456789"
                keyboardType="phone-pad"
                value={newVisitorData.phoneNumber}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, phoneNumber: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>ID Number *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Passport / Driver's License"
                value={newVisitorData.idNumber}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, idNumber: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Purpose of Visit *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="e.g., Meeting, Tour, Maintenance"
                value={newVisitorData.purposeOfVisit}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, purposeOfVisit: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Host Name</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Who are they meeting?"
                value={newVisitorData.hostName}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, hostName: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Host Department</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Department"
                value={newVisitorData.hostDepartment}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, hostDepartment: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Expected Duration</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="e.g., 2 hours, Half day"
                value={newVisitorData.expectedDuration}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, expectedDuration: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Vehicle Number (Optional)</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Enter vehicle number"
                value={newVisitorData.vehicleNumber}
                onChangeText={(text) => setNewVisitorData({...newVisitorData, vehicleNumber: text})}
              />
            </ScrollView>

            <View style={visitorManagementStyles.modalFooter}>
              <TouchableOpacity
                style={visitorManagementStyles.modalCancelButton}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={visitorManagementStyles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={visitorManagementStyles.modalSubmitButton}
                onPress={confirmAddVisitor}
              >
                <Text style={visitorManagementStyles.modalSubmitText}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Visitor Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={visitorManagementStyles.modalOverlay}>
          <View style={visitorManagementStyles.modalContent}>
            <View style={visitorManagementStyles.modalHeader}>
              <Text style={visitorManagementStyles.modalTitle}>Edit Visitor</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={visitorManagementStyles.modalBody}>
              <Text style={visitorManagementStyles.inputLabel}>Full Name *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Enter full name"
                value={editVisitorData.fullName}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, fullName: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Email *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Enter email"
                keyboardType="email-address"
                autoCapitalize="none"
                value={editVisitorData.email}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, email: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Phone Number *</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="09123456789"
                keyboardType="phone-pad"
                value={editVisitorData.phoneNumber}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, phoneNumber: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>ID Number</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Passport / Driver's License"
                value={editVisitorData.idNumber}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, idNumber: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Purpose of Visit</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Purpose of visit"
                value={editVisitorData.purposeOfVisit}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, purposeOfVisit: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Host Name</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Host name"
                value={editVisitorData.hostName}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, hostName: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Host Department</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Department"
                value={editVisitorData.hostDepartment}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, hostDepartment: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Expected Duration</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Expected duration"
                value={editVisitorData.expectedDuration}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, expectedDuration: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Vehicle Number</Text>
              <TextInput
                style={visitorManagementStyles.input}
                placeholder="Vehicle number"
                value={editVisitorData.vehicleNumber}
                onChangeText={(text) => setEditVisitorData({...editVisitorData, vehicleNumber: text})}
              />

              <Text style={visitorManagementStyles.inputLabel}>Status</Text>
              <View style={visitorManagementStyles.statusSelector}>
                {['pending', 'approved', 'checked_in', 'checked_out', 'expired'].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      visitorManagementStyles.statusOption,
                      editVisitorData.status === status && { backgroundColor: getStatusColor(status) + '20' }
                    ]}
                    onPress={() => setEditVisitorData({...editVisitorData, status})}
                  >
                    <Text style={[
                      visitorManagementStyles.statusOptionText,
                      editVisitorData.status === status && { color: getStatusColor(status), fontWeight: '600' }
                    ]}>
                      {getStatusDisplay(status)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={visitorManagementStyles.modalFooter}>
              <TouchableOpacity
                style={visitorManagementStyles.modalCancelButton}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={visitorManagementStyles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={visitorManagementStyles.modalSubmitButton}
                onPress={confirmEditVisitor}
              >
                <Text style={visitorManagementStyles.modalSubmitText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={visitorManagementStyles.modalOverlay}>
          <View style={visitorManagementStyles.confirmModal}>
            <Ionicons name="warning" size={48} color="#DC2626" />
            <Text style={visitorManagementStyles.confirmTitle}>Delete Visitor</Text>
            <Text style={visitorManagementStyles.confirmMessage}>
              Are you sure you want to delete {selectedVisitor?.fullName}?
            </Text>
            <View style={visitorManagementStyles.confirmButtons}>
              <TouchableOpacity
                style={visitorManagementStyles.confirmCancelButton}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={visitorManagementStyles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={visitorManagementStyles.confirmDeleteButton}
                onPress={confirmDeleteVisitor}
              >
                <Text style={visitorManagementStyles.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Visitor Details Modal */}
      <Modal
        visible={showDetailsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={visitorManagementStyles.modalOverlay}>
          <View style={visitorManagementStyles.detailsModal}>
            {selectedVisitor && (
              <>
                <View style={visitorManagementStyles.detailsHeader}>
                  <Text style={visitorManagementStyles.detailsTitle}>Visitor Details</Text>
                  <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={visitorManagementStyles.detailsBody}>
                  <View style={visitorManagementStyles.detailsAvatar}>
                    <Text style={visitorManagementStyles.detailsAvatarText}>
                      {selectedVisitor.fullName?.charAt(0) || 'V'}
                    </Text>
                  </View>
                  
                  <Text style={visitorManagementStyles.detailsName}>{selectedVisitor.fullName}</Text>
                  
                  <View style={[visitorManagementStyles.detailsStatusBadge, { 
                    backgroundColor: getStatusColor(selectedVisitor.status) + '20' 
                  }]}>
                    <Text style={[visitorManagementStyles.detailsStatusText, { 
                      color: getStatusColor(selectedVisitor.status) 
                    }]}>
                      {getStatusDisplay(selectedVisitor.status)}
                    </Text>
                  </View>

                  <View style={visitorManagementStyles.detailsSection}>
                    <Text style={visitorManagementStyles.detailsSectionTitle}>Contact Information</Text>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="mail-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>Email:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.email}</Text>
                    </View>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="call-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>Phone:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.phoneNumber}</Text>
                    </View>
                  </View>

                  <View style={visitorManagementStyles.detailsSection}>
                    <Text style={visitorManagementStyles.detailsSectionTitle}>Visit Details</Text>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="document-text-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>Purpose:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.purposeOfVisit}</Text>
                    </View>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="person-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>Host:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.hostName || 'N/A'}</Text>
                    </View>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="business-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>Department:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.hostDepartment || 'N/A'}</Text>
                    </View>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="hourglass-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>Duration:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.expectedDuration || 'N/A'}</Text>
                    </View>
                    {selectedVisitor.vehicleNumber ? (
                      <View style={visitorManagementStyles.detailsRow}>
                        <Ionicons name="car-outline" size={16} color="#6B7280" />
                        <Text style={visitorManagementStyles.detailsLabel}>Vehicle:</Text>
                        <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.vehicleNumber}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={visitorManagementStyles.detailsSection}>
                    <Text style={visitorManagementStyles.detailsSectionTitle}>Timeline</Text>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>Registered:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{formatDateTime(selectedVisitor.registeredAt)}</Text>
                    </View>
                    {selectedVisitor.checkedInAt && (
                      <View style={visitorManagementStyles.detailsRow}>
                        <Ionicons name="log-in-outline" size={16} color="#10B981" />
                        <Text style={visitorManagementStyles.detailsLabel}>Checked In:</Text>
                        <Text style={visitorManagementStyles.detailsValue}>{formatDateTime(selectedVisitor.checkedInAt)}</Text>
                      </View>
                    )}
                    {selectedVisitor.checkedOutAt && (
                      <View style={visitorManagementStyles.detailsRow}>
                        <Ionicons name="log-out-outline" size={16} color="#DC2626" />
                        <Text style={visitorManagementStyles.detailsLabel}>Checked Out:</Text>
                        <Text style={visitorManagementStyles.detailsValue}>{formatDateTime(selectedVisitor.checkedOutAt)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={visitorManagementStyles.detailsSection}>
                    <Text style={visitorManagementStyles.detailsSectionTitle}>Identification</Text>
                    <View style={visitorManagementStyles.detailsRow}>
                      <Ionicons name="card-outline" size={16} color="#6B7280" />
                      <Text style={visitorManagementStyles.detailsLabel}>ID Number:</Text>
                      <Text style={visitorManagementStyles.detailsValue}>{selectedVisitor.idNumber}</Text>
                    </View>
                  </View>
                </ScrollView>

                <View style={visitorManagementStyles.detailsFooter}>
                  <TouchableOpacity
                    style={visitorManagementStyles.detailsCloseButton}
                    onPress={() => setShowDetailsModal(false)}
                  >
                    <Text style={visitorManagementStyles.detailsCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}